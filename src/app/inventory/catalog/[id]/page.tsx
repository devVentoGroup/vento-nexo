import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProductCostStatusPanel } from "@/features/inventory/catalog/product-cost-status-panel";
import { ProductFormFooter } from "@/features/inventory/catalog/product-form-footer";
import { ProductIdentityFields } from "@/features/inventory/catalog/product-identity-fields";
import { ProductAssetTechnicalSection } from "@/features/inventory/catalog/product-asset-technical-section";
import { ProductPurchaseSection } from "@/features/inventory/catalog/product-purchase-section";
import { ProductRemissionUomFields } from "@/features/inventory/catalog/product-remission-uom-fields";
import { ProductSiteAvailabilitySection } from "@/features/inventory/catalog/product-site-availability-section";
import { ProductStorageFields } from "@/features/inventory/catalog/product-storage-fields";
import { RequiredFieldsGuardForm } from "@/components/inventory/forms/RequiredFieldsGuardForm";
import {
  CatalogOptionalDetails,
  CatalogSection,
} from "@/features/inventory/catalog/catalog-ui";
import {
  createUnitMap,
  isTemporaryOperationUnitProfile,
  normalizeUnitCode,
} from "@/lib/inventory/uom";
import {
  getAutoCostReadinessReason,
  isAutoCostReady,
} from "@/lib/inventory/costing";
import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import {
  getSiteCapabilitiesMap,
  type SiteOperationalCapabilities,
} from "@/lib/inventory/site-capabilities";
import {
  filterCategoryRows,
  normalizeCategoryDomain,
  normalizeCategoryScope,
  shouldShowCategoryDomain,
} from "@/lib/inventory/categories";
import {
  appendQueryParam,
  buildFogoRecipeUrl,
  buildOperationUnitHintFromUnits,
  buildRemissionFromRecipePortion,
  decodeCatalogReturnParam,
  inventoryKindLabel,
  loadCategoryRows,
  normalizeMeasurementMode,
  resolveCatalogTab,
  resolveCategoryKindForProduct,
  resolveCompatibleDefaultUnit,
  resolveLockedInventoryKind,
  sanitizeAuxCountUnitCode,
  siteSettingRowRank,
  siteSettingTs,
  uomUsageContextLabel,
  type AreaKindRow,
  type AssetMaintenanceLine,
  type AssetProfileRow,
  type AssetTransferLine,
  type CategoryRow,
  type InventoryProfileRow,
  type ProductRow,
  type ProductUomProfileRow,
  type ProductionLocationRow,
  type ProductionRouteRow,
  type RecipePortionRow,
  type SearchParams,
  type SiteAreaKindRow,
  type SiteAreaPurposeRuleRow,
  type SiteCapabilityRow,
  type SiteOptionRow,
  type SiteSettingRow,
  type SupplierRow,
  type UnitRow,
} from "./detail-helpers";
import { updateProduct } from "./actions";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";
const STOCK_UNIT_FIELD_ID = "stock_unit_code";

export default async function ProductCatalogDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? "Cambios guardados." : "";
  const from = decodeCatalogReturnParam(sp.from);
  const productDetailHref = from
    ? `/inventory/catalog/${id}?from=${encodeURIComponent(from)}`
    : `/inventory/catalog/${id}`;

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/catalog/${id}`,
    permissionCode: PERMISSION,
  });

  const { data: product } = await supabase
    .from("products")
    .select("id,name,description,sku,unit,stock_unit_code,product_type,category_id,price,cost,is_active")
    .eq("id", id)
    .maybeSingle();

  if (!product) notFound();

  const { data: profile } = await supabase
    .from("product_inventory_profiles")
    .select("product_id,track_inventory,inventory_kind,default_unit,unit_family,costing_mode,lot_tracking,expiry_tracking,measurement_mode,default_tolerance_percent,aux_count_unit_code,requires_actual_receipt_qty,requires_actual_dispatch_qty,requires_actual_production_qty,requires_count_alongside_weight")
    .eq("product_id", id)
    .maybeSingle();

  const [{ data: assetProfileData }, { data: assetMaintenanceData }, { data: assetTransfersData }] =
    await Promise.all([
      supabase
        .from("product_asset_profiles")
        .select(
          "product_id,brand,model,serial_number,physical_location,purchase_invoice_url,commercial_value,purchase_date,started_use_date,equipment_status,maintenance_service_provider,technical_description,maintenance_cycle_enabled,maintenance_cycle_months,maintenance_cycle_anchor_date"
        )
        .eq("product_id", id)
        .maybeSingle(),
      supabase
        .from("product_asset_maintenance_events")
        .select(
          "id,scheduled_date,performed_date,responsible,maintenance_provider,work_done,parts_replaced,replaced_parts,planner_bucket"
        )
        .eq("product_id", id)
        .order("scheduled_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("product_asset_transfer_events")
        .select("id,moved_at,from_location,to_location,responsible,notes")
        .eq("product_id", id)
        .order("moved_at", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  const allCategoryRows = await loadCategoryRows(supabase);

  const { data: siteSettingsWithAudience, error: siteSettingsAudienceError } = await supabase
    .from("product_site_settings")
    .select(
      "id,site_id,is_active,default_area_kind,area_kinds,production_location_id,local_production_enabled,min_stock_qty,min_stock_input_mode,min_stock_purchase_qty,min_stock_purchase_unit_code,min_stock_purchase_to_base_factor,audience,remission_enabled,sales_enabled,updated_at,created_at,sites(id,name)"
    )
    .eq("product_id", id);
  const siteSettings =
    !siteSettingsAudienceError
      ? siteSettingsWithAudience
      : (
        await supabase
          .from("product_site_settings")
          .select("id,site_id,is_active,default_area_kind,area_kinds,min_stock_qty,audience,updated_at,created_at,sites(id,name)")
          .eq("product_id", id)
      ).data ??
      (
        await supabase
          .from("product_site_settings")
          .select("id,site_id,is_active,default_area_kind,updated_at,created_at,sites(id,name)")
          .eq("product_id", id)
      ).data;
  const siteRowsRaw = ((siteSettings ?? []) as unknown as SiteSettingRow[]).map((row) => ({
    ...row,
    audience: row.audience ?? "BOTH",
  }));
  const siteRowsBySite = new Map<string, SiteSettingRow>();
  for (const row of siteRowsRaw) {
    const siteId = String(row.site_id ?? "").trim();
    if (!siteId) continue;
    const current = siteRowsBySite.get(siteId);
    if (!current) {
      siteRowsBySite.set(siteId, row);
      continue;
    }
    const currentRank = siteSettingRowRank(current);
    const nextRank = siteSettingRowRank(row);
    if (nextRank > currentRank || (nextRank === currentRank && siteSettingTs(row) > siteSettingTs(current))) {
      siteRowsBySite.set(siteId, row);
    }
  }
  const siteRows = Array.from(siteRowsBySite.values());

  const { data: productionRoutesData } = await supabase
    .from("product_site_production_routes")
    .select("id,site_id,area_kind,input_location_id,output_mode,output_location_id,is_active")
    .eq("product_id", id)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  const productionRouteRows = (productionRoutesData ?? []) as ProductionRouteRow[];

  const { data: sitesData } = await supabase
    .from("sites")
    .select("id,name,site_type,operational_visibility")
    .eq("is_active", true)
    .eq("operational_visibility", "operational")
    .order("name", { ascending: true });
  const sitesList = (sitesData ?? []) as SiteOptionRow[];
  const siteIds = sitesList.map((site) => site.id);
  const { data: capabilityRows } = siteIds.length
    ? await supabase
      .from("site_operational_capabilities")
      .select(
        "site_id,can_request_remissions,can_fulfill_remissions,can_receive_remissions,can_sell,can_produce,can_hold_inventory,is_commercial_business,show_in_product_setup"
      )
      .in("site_id", siteIds)
    : { data: [] as SiteCapabilityRow[] };
  const capabilitiesBySite = getSiteCapabilitiesMap(
    siteIds,
    (capabilityRows ?? []) as SiteCapabilityRow[]
  );
  const capabilitySiteIds = new Set(
    ((capabilityRows ?? []) as SiteCapabilityRow[]).map((row) => String(row.site_id ?? ""))
  );

  const { data: areaKindsWithPurpose, error: areaKindsWithPurposeError } = await supabase
    .from("area_kinds")
    .select("code,name,use_for_remission")
    .order("name", { ascending: true });
  const areaKindsList = !areaKindsWithPurposeError
    ? ((areaKindsWithPurpose ?? []) as AreaKindRow[])
    : (((await supabase.from("area_kinds").select("code,name").order("name", { ascending: true })).data ??
      []) as AreaKindRow[]).map((row) => ({
        ...row,
        use_for_remission: ["mostrador", "bar", "cocina", "general"].includes(
          String(row.code ?? "").trim().toLowerCase()
        ),
      }));
  const { data: siteAreasData } = await supabase
    .from("areas")
    .select("site_id,kind,is_active")
    .eq("is_active", true);
  const { data: productionLocationsData } = await supabase
    .from("inventory_locations")
    .select("id,site_id,code,zone,location_type,is_active,area:areas(kind)")
    .eq("is_active", true)
    .order("code", { ascending: true });
  const { data: productionAreaRulesData } = await supabase
    .from("site_area_purpose_rules")
    .select("site_id,area_kind,purpose,is_enabled")
    .eq("purpose", "production_recipe")
    .eq("is_enabled", true);
  const productionAreaKindsBySite = ((productionAreaRulesData ?? []) as Array<{ site_id: string | null; area_kind: string | null }>).reduce(
    (acc, row) => {
      const siteId = String(row.site_id ?? "").trim();
      const areaKind = String(row.area_kind ?? "").trim();
      if (!siteId || !areaKind) return acc;
      const current = acc[siteId] ?? [];
      if (!current.includes(areaKind)) current.push(areaKind);
      acc[siteId] = current;
      return acc;
    },
    {} as Record<string, string[]>
  );
  const productionLocationsList = ((productionLocationsData ?? []) as ProductionLocationRow[]).filter((location) => {
    const locationType = String(location.location_type ?? "").trim();
    const siteId = String(location.site_id ?? "").trim();
    const areaValue = Array.isArray(location.area) ? location.area[0] : location.area;
    const areaKind = String(areaValue?.kind ?? "").trim();
    return locationType === "production" || Boolean(siteId && areaKind && productionAreaKindsBySite[siteId]?.includes(areaKind));
  });
  const siteAreaKindsList = Array.from(
    new Set(
      ((siteAreasData ?? []) as SiteAreaKindRow[])
        .map((row) => {
          const siteId = String(row.site_id ?? "").trim();
          const kind = String(row.kind ?? "").trim();
          return siteId && kind ? `${siteId}::${kind}` : "";
        })
        .filter(Boolean)
    )
  ).map((token) => {
    const [site_id, kind] = token.split("::");
    return { site_id, kind };
  });
  const satelliteSiteIds = sitesList
    .filter((site) => {
      const capabilities = capabilitiesBySite.get(site.id);
      return capabilitySiteIds.has(site.id)
        ? Boolean(capabilities?.can_request_remissions)
        : String(site.site_type ?? "").trim().toLowerCase() === "satellite";
    })
    .map((site) => site.id);
  const { data: remissionAreaRulesData } =
    satelliteSiteIds.length > 0
      ? await supabase
        .from("site_area_purpose_rules")
        .select("site_id,area_kind,purpose,is_enabled")
        .eq("purpose", "remission")
        .eq("is_enabled", true)
        .in("site_id", satelliteSiteIds)
      : { data: [] as SiteAreaPurposeRuleRow[] };
  const remissionAreaKindsBySite = ((remissionAreaRulesData ?? []) as SiteAreaPurposeRuleRow[]).reduce(
    (acc, row) => {
      const siteId = String(row.site_id ?? "").trim();
      const areaKind = String(row.area_kind ?? "").trim();
      if (!siteId || !areaKind) return acc;
      const current = acc[siteId] ?? [];
      if (!current.includes(areaKind)) current.push(areaKind);
      acc[siteId] = current;
      return acc;
    },
    {} as Record<string, string[]>
  );

  const { data: unitsData } = await supabase
    .from("inventory_units")
    .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
    .eq("is_active", true)
    .order("family", { ascending: true })
    .order("factor_to_base", { ascending: true })
    .limit(500);
  const unitsList = (unitsData ?? []) as UnitRow[];

  const { data: supplierLinks } = await supabase
    .from("product_suppliers")
    .select("id,supplier_id,supplier_sku,supplier_product_alias,purchase_unit,purchase_unit_size,purchase_pack_qty,purchase_pack_unit_code,purchase_price,purchase_price_net,purchase_price_includes_tax,purchase_tax_rate,purchase_price_includes_icui,purchase_icui_rate,currency,lead_time_days,min_order_qty,is_primary")
    .eq("product_id", id)
    .order("is_primary", { ascending: false });
  const supplierRows = (supplierLinks ?? []) as SupplierRow[];
  const { data: uomProfileData } = await supabase
    .from("product_uom_profiles")
    .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context")
    .eq("product_id", id)
    .eq("is_active", true);
  const activeUomProfiles = (uomProfileData ?? []) as ProductUomProfileRow[];
  const defaultUomProfiles = activeUomProfiles.filter((profile) => profile.is_default);

  const profileByContext = new Map(
    defaultUomProfiles.map((profile) => [
      String(profile.usage_context ?? "general").trim().toLowerCase() || "general",
      profile,
    ])
  );
  const purchaseUomProfile =
    profileByContext.get("purchase") ?? profileByContext.get("general") ?? null;
  const remissionUomProfile = profileByContext.get("remission") ?? null;
  const hasRemissionEnabledSite = ((siteSettings ?? []) as unknown as Pick<SiteSettingRow, "remission_enabled">[]).some(
    (row) => row.remission_enabled === true
  );
  const shouldLoadRecipePortion =
    String((product as ProductRow).product_type ?? "").trim().toLowerCase() === "preparacion" ||
    (String((product as ProductRow).product_type ?? "").trim().toLowerCase() === "venta" &&
      String((profile as InventoryProfileRow | null)?.inventory_kind ?? "")
        .trim()
        .toLowerCase() !== "resale");
  const { data: publishedRecipePortionData } = shouldLoadRecipePortion
    ? await supabase
        .from("recipe_cards")
        .select("id,product_id,yield_qty,yield_unit,portion_size,portion_unit,status,is_active,updated_at")
        .eq("product_id", id)
        .eq("status", "published")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: suppliersData } = await supabase.from("suppliers").select("id,name").eq("is_active", true).order("name");
  const suppliersList = (suppliersData ?? []) as { id: string; name: string | null }[];

  // Recipe data (for preparacion and venta)
  const productType = (product as ProductRow).product_type;
  const hasRecipe =
    productType === "preparacion" ||
    (productType === "venta" &&
      String((profile as InventoryProfileRow | null)?.inventory_kind ?? "")
        .trim()
        .toLowerCase() !== "resale");
  const hasComputedCost = (product as ProductRow).cost != null && Number.isFinite(Number((product as ProductRow).cost));

  const [{ data: employee }, { data: settings }] = await Promise.all([
    supabase.from("employees").select("role,site_id").eq("id", user.id).maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", user.id)
      .maybeSingle(),
  ]);
  const role = String(employee?.role ?? "").toLowerCase();
  const canEdit =
    ["propietario", "gerente_general"].includes(role) ||
    (await checkPermission(supabase, APP_ID, "catalog.products"));

  const productRow = product as ProductRow;
  const profileRow = (profile ?? null) as InventoryProfileRow | null;
  const assetProfileRow = (assetProfileData ?? null) as AssetProfileRow | null;
  const assetMaintenanceRows = (assetMaintenanceData ?? []) as AssetMaintenanceLine[];
  const assetTransferRows = (assetTransfersData ?? []) as AssetTransferLine[];
  const normalizedProductType = String(productRow.product_type ?? "").trim().toLowerCase();
  const normalizedInventoryKind = String(profileRow?.inventory_kind ?? "").trim().toLowerCase();
  const isAssetItem = normalizedInventoryKind === "asset";
  const lockedInventoryKind = resolveLockedInventoryKind(
    productRow.product_type ?? "insumo",
    profileRow?.inventory_kind ?? ""
  );
  const lockedInventoryKindText = inventoryKindLabel(lockedInventoryKind);
  const hasSuppliers =
    (normalizedProductType === "insumo" && normalizedInventoryKind !== "asset") ||
    (normalizedProductType === "venta" && normalizedInventoryKind === "resale");
  const siteNamesById = Object.fromEntries(
    sitesList.map((site) => [site.id, site.name ?? site.id])
  );
  const categoryKind = resolveCategoryKindForProduct({
    productType: productRow.product_type,
    inventoryKind: profileRow?.inventory_kind ?? null,
  });
  const categorySiteId = String(
    sp.category_site_id ??
    (settings as { selected_site_id?: string | null } | null)?.selected_site_id ??
    (employee as { site_id?: string | null } | null)?.site_id ??
    ""
  ).trim();
  const defaultCategoryScope = categorySiteId ? "site" : "all";
  const requestedCategoryScope = normalizeCategoryScope(sp.category_scope ?? defaultCategoryScope);
  const requestedCategoryDomain = shouldShowCategoryDomain(categoryKind)
    ? normalizeCategoryDomain(sp.category_domain)
    : "";
  const isSaleCategoryKind = categoryKind === "venta";
  const categoryScope = isSaleCategoryKind ? "global" : requestedCategoryScope;
  const effectiveCategorySiteId = isSaleCategoryKind ? "" : categorySiteId;
  const categoryDomain = isSaleCategoryKind ? "" : requestedCategoryDomain;
  const categoryRows = filterCategoryRows(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: effectiveCategorySiteId,
  });
  const resolvedCategoryPath =
    allCategoryRows.find((row) => row.id === productRow.category_id)?.name?.trim() || "";
  const normalizedCategoryPath = resolvedCategoryPath.toLowerCase();
  const isMachineryAssetCategory =
    normalizedCategoryPath.includes("maquinaria y equipos") ||
    (normalizedCategoryPath.includes("maquinaria") &&
      (normalizedCategoryPath.includes("equipo") || normalizedCategoryPath.includes("equipos")));

  const stockUnitCode = normalizeUnitCode(productRow.stock_unit_code || productRow.unit || "un");
  const currentMeasurementMode = normalizeMeasurementMode(profileRow?.measurement_mode);
  const auxCountUnitCode = sanitizeAuxCountUnitCode(profileRow?.aux_count_unit_code);
  const presentationProfiles = activeUomProfiles
    .filter((profile) => profile.is_active)
    .sort((a, b) => {
      const aContext = String(a.usage_context ?? "general");
      const bContext = String(b.usage_context ?? "general");
      if (aContext !== bContext) return aContext.localeCompare(bContext, "es", { sensitivity: "base" });
      return String(a.label ?? "").localeCompare(String(b.label ?? ""), "es", { sensitivity: "base" });
    });
  const inventoryUnitMap = createUnitMap(unitsList);
  const recipePortionRemissionProfile = buildRemissionFromRecipePortion({
    recipe: (publishedRecipePortionData ?? null) as RecipePortionRow | null,
    stockUnitCode,
    unitMap: inventoryUnitMap,
  });
  const recipePortionAvailable =
    remissionUomProfile?.source === "recipe_portion" || Boolean(recipePortionRemissionProfile);
  const remissionProfileIsTemporaryOperationUnit =
    normalizedProductType === "preparacion" &&
    isTemporaryOperationUnitProfile(remissionUomProfile, stockUnitCode);
  const remissionDefaultSourceMode =
    remissionProfileIsTemporaryOperationUnit
      ? "operation_unit"
      : remissionUomProfile?.source === "supplier_primary"
      ? "purchase_primary"
      : remissionUomProfile?.source === "recipe_portion"
        ? "recipe_portion"
        : remissionUomProfile
          ? "remission_profile"
          : "disabled";
  const requestedDefaultUnit = normalizeUnitCode(profileRow?.default_unit || stockUnitCode);
  const resolvedDefaultUnit = resolveCompatibleDefaultUnit({
    requestedDefaultUnit,
    stockUnitCode,
    unitMap: inventoryUnitMap,
  });

  const defaultUnitOptions = unitsList;
  const primarySupplier = supplierRows.find((row) => Boolean(row.is_primary)) ?? null;
  const autoCostReadinessReason = hasSuppliers
    ? getAutoCostReadinessReason({
      costingMode: profileRow?.costing_mode ?? "manual",
      stockUnitCode,
      primarySupplier,
      unitMap: inventoryUnitMap,
    })
    : null;
  const autoCostReady = hasSuppliers
    ? isAutoCostReady({
      costingMode: profileRow?.costing_mode ?? "manual",
      stockUnitCode,
      primarySupplier,
      unitMap: inventoryUnitMap,
    })
    : true;

  const supplierInitialRows = supplierRows.map((r) => ({
    id: r.id,
    supplier_id: r.supplier_id,
    supplier_sku: r.supplier_sku ?? "",
    supplier_product_alias: r.supplier_product_alias ?? "",
    purchase_unit: r.purchase_unit ?? "",
    purchase_unit_size: r.purchase_unit_size ?? undefined,
    purchase_pack_qty: r.purchase_pack_qty ?? r.purchase_unit_size ?? undefined,
    purchase_pack_unit_code: r.purchase_pack_unit_code ?? stockUnitCode,
    purchase_price: r.purchase_price ?? undefined,
    purchase_price_net: r.purchase_price_net ?? undefined,
    purchase_price_includes_tax: Boolean(r.purchase_price_includes_tax),
    purchase_tax_rate: r.purchase_tax_rate ?? undefined,
    purchase_price_includes_icui: Boolean(r.purchase_price_includes_icui),
    purchase_icui_rate: r.purchase_icui_rate ?? undefined,
    currency: r.currency ?? "COP",
    lead_time_days: r.lead_time_days ?? undefined,
    min_order_qty: r.min_order_qty ?? undefined,
    is_primary: Boolean(r.is_primary),
  }));

  return (
    <div className="ui-scene w-full space-y-8">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link
                href={from || "/inventory/catalog"}
                className="ui-btn ui-btn--ghost inline-flex h-12 items-center px-5 text-base font-semibold"
              >
                ← Volver al catálogo
              </Link>
              <h1 className="ui-h1">{productRow.name ?? "Ficha maestra"}</h1>
              <p className="ui-body-muted">
                {isAssetItem
                  ? "Ficha maestra del modelo patrimonial: identidad, categoría y datos técnicos base. Las unidades reales viven en Activos físicos."
                  : "Ficha maestra del producto: identidad operativa, compra, almacenamiento y setup por sede."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                {productRow.is_active === false ? "Inactivo" : "Activo"}
              </span>
              {productRow.sku ? (
                <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                  SKU {productRow.sku}
                </span>
              ) : null}
              {resolvedCategoryPath ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                  {resolvedCategoryPath}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/inventory/catalog/${productRow.id}/ficha?from=${encodeURIComponent(from || "/inventory/catalog")}`}
                className="ui-btn ui-btn--ghost"
              >
                Ver ficha técnica
              </Link>
              {isAssetItem ? (
                <>
                  <Link href="/inventory/assets/new" className="ui-btn ui-btn--brand">
                    Crear activo físico
                  </Link>
                  <Link href="/inventory/assets" className="ui-btn ui-btn--ghost">
                    Ver activos físicos
                  </Link>
                </>
              ) : (
                <Link
                  href={`/inventory/catalog/${productRow.id}/presentations?from=${encodeURIComponent(productDetailHref)}`}
                  className="ui-btn ui-btn--brand"
                >
                  Administrar presentaciones
                </Link>
              )}
            </div>
          </div>
          <div className="ui-remission-kpis ui-remission-kpis--stack sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Estado</div>
              <div className="ui-remission-kpi-value">{productRow.is_active === false ? "Off" : "On"}</div>
              <div className="ui-remission-kpi-note">Disponibilidad actual del maestro</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Tipo</div>
              <div className="ui-remission-kpi-value">
                {isAssetItem
                  ? "Activo"
                  : String(productRow.product_type ?? "insumo").trim().toLowerCase() === "venta"
                    ? "Venta"
                    : String(productRow.product_type ?? "insumo").trim().toLowerCase() === "preparacion"
                      ? "Prep"
                      : "Insumo"}
              </div>
              <div className="ui-remission-kpi-note">
                {isAssetItem ? "Modelo patrimonial del catálogo" : "Clasificacion operativa del producto"}
              </div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">{isAssetItem ? "Operación real" : "Sedes"}</div>
              <div className="ui-remission-kpi-value">{isAssetItem ? "Assets" : siteRows.length}</div>
              <div className="ui-remission-kpi-note">
                {isAssetItem ? "Ubicación, QR y conteo en Activos físicos" : "Configuraciones por sede en esta ficha"}
              </div>
            </article>
          </div>
        </div>
      </section>

      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}
      {hasSuppliers && profileRow?.costing_mode === "auto_primary_supplier" && autoCostReadinessReason ? (
        <div className="ui-alert ui-alert--warn">
          Auto-costo incompleto: {autoCostReadinessReason}
        </div>
      ) : null}

      {isAssetItem ? (
        <CatalogSection
          title="Modelo patrimonial"
          description="Este item no usa presentaciones, remisiones ni stock operativo de insumos. Sirve como modelo base para crear activos físicos reales."
        >
          <div className="grid gap-3 md:grid-cols-3">
            <Link href="/inventory/assets/new" className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-100">
              Crear activo físico →
            </Link>
            <Link href="/inventory/assets" className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-semibold text-indigo-950 transition hover:bg-indigo-100">
              Ver activos físicos →
            </Link>
            <Link href="/inventory/assets/counts" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950 transition hover:bg-amber-100">
              Conteo patrimonial →
            </Link>
          </div>
        </CatalogSection>
      ) : (
        <CatalogSection
          title="Presentaciónes operativas"
          description="Las presentaciones físicas se administran en una pantalla separada para no mezclar identidad del producto con empaque, equivalencias y fotos por presentación."
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div className="space-y-3">
              {presentationProfiles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {presentationProfiles.slice(0, 8).map((profile) => (
                    <span
                      key={profile.id}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                    >
                      {profile.label || "Presentación"} · {uomUsageContextLabel(profile.usage_context)} · 1{" "}
                      {profile.input_unit_code} ={" "}
                      {Number(profile.qty_in_stock_unit ?? 0).toLocaleString("es-CO", {
                        maximumFractionDigits: 3,
                      })}{" "}
                      {stockUnitCode}
                    </span>
                  ))}
                  {presentationProfiles.length > 8 ? (
                    <span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">
                      +{presentationProfiles.length - 8} más
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
                  Este producto todavía no tiene presentaciones operativas activas.
                </div>
              )}
              <p className="text-sm text-[var(--ui-muted)]">
                La ficha mantiene datos maestros. Las presentaciones controlan empaque físico, equivalencia operativa e imagen propia para quiosco e inventario.
              </p>
            </div>

            <Link
              href={`/inventory/catalog/${productRow.id}/presentations?from=${encodeURIComponent(productDetailHref)}`}
              className="ui-btn ui-btn--brand h-12 px-5 text-base"
            >
              Administrar presentaciones
            </Link>
          </div>
        </CatalogSection>
      )}

      {canEdit ? (
        <>
          <RequiredFieldsGuardForm
            action={updateProduct}
            className="space-y-8 pb-28"
            persistKey={`catalog-edit-${productRow.id}`}
          >
            <input type="hidden" name="product_id" value={productRow.id} />
            <input type="hidden" name="return_to" value={from} />

            <CatalogSection
              title={isAssetItem ? "Identidad del modelo patrimonial" : "Datos basicos"}
              description={
                isAssetItem
                  ? "Define cómo se identifica este modelo en el catálogo. Las unidades reales, QR, ubicación y conteo se gestionan en Activos físicos."
                  : "Identidad del item: nombre, SKU, tipo fijo, categoría operativa y descripción."
              }
            >
              <ProductIdentityFields
                nameLabel={isAssetItem ? "Nombre del modelo / activo" : "Nombre del producto / insumo"}
                namePlaceholder={isAssetItem ? "Ej. Aire acondicionado, silla terraza, licuadora industrial" : "Ej. Harina 000"}
                nameDefaultValue={productRow.name ?? ""}
                categories={categoryRows}
                selectedCategoryId={productRow.category_id ?? ""}
                siteNamesById={siteNamesById}
                categoryLabel={isAssetItem ? "Categoría patrimonial" : "Categoría operativa"}
                categoryEmptyOptionLabel={isAssetItem ? "Sin categoría patrimonial" : "Sin categoría"}
                descriptionLabel={isAssetItem ? "Descripción base del modelo" : "Descripción"}
                descriptionPlaceholder={
                  isAssetItem
                    ? "Ej. Equipo de aire acondicionado tipo cassette para zona de atención, referencia general del modelo."
                    : "Opcional"
                }
                descriptionHint={
                  isAssetItem
                    ? "Describe el modelo en términos generales. No escribas aquí serial, ubicación, responsable ni mantenimiento real."
                    : undefined
                }
                descriptionDefaultValue={productRow.description ?? ""}
                skuField={{
                  mode: "edit",
                  currentSku: productRow.sku,
                  initialProductType: productRow.product_type,
                  initialInventoryKind: profileRow?.inventory_kind ?? "",
                }}
                lockedTypeField={{
                  label: isAssetItem ? "Tipo de maestro" : "Tipo",
                  value:
                    isAssetItem
                      ? "Activo"
                      : String(productRow.product_type ?? "").trim().toLowerCase() === "venta"
                        ? "Venta"
                        : String(productRow.product_type ?? "").trim().toLowerCase() === "preparacion"
                          ? "Preparacion"
                          : "Insumo",
                  hiddenName: "product_type",
                  hiddenValue: productRow.product_type ?? "insumo",
                  hint: isAssetItem
                    ? "Este maestro sirve para crear activos físicos reales desde el catálogo."
                    : undefined,
                }}
              />
            </CatalogSection>

            {/* Receta y producción ahora viven en FOGO */}
            {hasRecipe && (
              <CatalogOptionalDetails
                title={normalizedProductType === "preparacion" ? "Continuidad en FOGO" : "Receta y producción"}
                summary={
                  normalizedProductType === "preparacion"
                    ? "FOGO completa receta, rendimiento, mermas, porciones y costo técnico de esta preparación."
                    : "Esta configuración queda fuera del flujo operativo actual."
                }
              >
                <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)] space-y-2">
                  {normalizedProductType === "preparacion" ? (
                    <>
                      <p>
                        NEXO mantiene el maestro de inventario, sedes y unidad base. FOGO debe publicar la fórmula,
                        el rendimiento y la porción remisionable cuando la preparación esté lista para operar.
                      </p>
                      <p>
                        Cuando exista porción publicada, puedes usarla abajo como fuente de unidad para remisión.
                      </p>
                    </>
                  ) : (
                    <p>
                      NEXO mantiene inventario, sedes y logística. Si luego activas producción externa, la configuración de receta se completa fuera de NEXO.
                    </p>
                  )}
                  <a
                    href={buildFogoRecipeUrl(productRow.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex ui-btn ui-btn--ghost"
                  >
                    Abrir FOGO
                  </a>
                </div>
              </CatalogOptionalDetails>
            )}

            {isAssetItem ? (
              <CatalogSection
                title="Configuración mínima del modelo patrimonial"
                description="Los activos no usan compra/remisión/stock como insumos. Se guardan campos mínimos para mantener compatibilidad del catálogo."
              >
                <input type="hidden" name="stock_unit_code" value={stockUnitCode || "un"} />
                <input type="hidden" name="default_unit" value={resolvedDefaultUnit || stockUnitCode || "un"} />
                <input type="hidden" name="inventory_kind" value={lockedInventoryKind} />
                <input type="hidden" name="measurement_mode" value="fixed_presentation" />
                <input type="hidden" name="default_tolerance_percent" value="0" />
                <input type="hidden" name="aux_count_unit_code" value="" />
                <input type="hidden" name="costing_mode" value="manual" />
                <input type="hidden" name="price" value={productRow.price ?? ""} />

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                    <div className="ui-caption">Tipo de inventario</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">Activo</div>
                  </div>
                  <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                    <div className="ui-caption">Unidad técnica</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{stockUnitCode || "un"}</div>
                  </div>
                  <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                    <div className="ui-caption">Stock operativo</div>
                    <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">No aplica aquí</div>
                  </div>
                </div>

                <div className="ui-alert ui-alert--warn mt-4">
                  La existencia real, ubicación, QR, responsable, mantenimientos y conteos se manejan en Activos físicos.
                </div>
              </CatalogSection>
            ) : (
            <CatalogSection
              title="Unidad base e inventario"
              description="Configura la unidad técnica de stock, trazabilidad y costo. Las presentaciones físicas se administran aparte."
            >
              <ProductStorageFields
                stockUnitFieldId={STOCK_UNIT_FIELD_ID}
                units={defaultUnitOptions}
                stockUnitCode={stockUnitCode}
                defaultUnitCode={resolvedDefaultUnit}
                defaultUnitHint="Si no coincide con la familia de la unidad base, se guardara automáticamente la unidad base."
                measurementModeField={{
                  defaultValue: currentMeasurementMode,
                  defaultTolerancePercent: profileRow?.default_tolerance_percent ?? null,
                  disabled: isAssetItem,
                }}
                preCostingFields={
                  <>
                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Tipo de inventario</span>
                      <input type="hidden" name="inventory_kind" value={lockedInventoryKind} />
                      <div className="ui-input flex items-center">{lockedInventoryKindText}</div>
                      <span className="text-xs text-[var(--ui-muted)]">
                        Se define por el flujo de creacion y se mantiene bloqueado en edición.
                      </span>
                    </label>
                    {currentMeasurementMode === "count_with_weight" ? (
                      <label className="flex flex-col gap-1">
                        <span className="ui-label">Unidad auxiliar de conteo</span>
                        <input
                          name="aux_count_unit_code"
                          defaultValue={auxCountUnitCode}
                          className="ui-input"
                          placeholder="Ej. piezas"
                        />
                        <span className="text-xs text-[var(--ui-muted)]">
                          Se usa para registrar conteo físico junto al peso real. Ejemplo: Aguacate = 2850 g + 12 piezas.
                        </span>
                      </label>
                    ) : (
                      <input type="hidden" name="aux_count_unit_code" value="" />
                    )}
                    {String(productRow.product_type ?? "").trim().toLowerCase() === "venta" ? (
                      <label className="flex flex-col gap-1">
                        <span className="ui-label">Precio base referencial</span>
                        <input
                          name="price"
                          type="number"
                          step="0.01"
                          defaultValue={productRow.price ?? ""}
                          className="ui-input"
                          placeholder="Opcional"
                        />
                        <span className="text-xs text-[var(--ui-muted)]">
                          El precio final se configura por sede/canal en la capa comercial.
                        </span>
                      </label>
                    ) : (
                      <input type="hidden" name="price" value={productRow.price ?? ""} />
                    )}
                  </>
                }
                postCostingFields={
                  <>
                    <input type="hidden" name="cost" value="" />
                    <ProductCostStatusPanel
                      hasSuppliers={hasSuppliers}
                      hasRecipe={hasRecipe}
                      hasComputedCost={hasComputedCost}
                      costingMode={profileRow?.costing_mode}
                      autoCostReady={autoCostReady}
                      autoCostReadinessReason={autoCostReadinessReason}
                      currentCost={productRow.cost}
                    />
                  </>
                }
                costingModeField={{
                  hasSuppliers,
                  defaultValue: profileRow?.costing_mode ?? "auto_primary_supplier",
                  autoOptionLabel: "Auto proveedor primario",
                }}
                trackingOptions={{
                  trackInventoryDefaultChecked: Boolean(profileRow?.track_inventory),
                  lotTrackingDefaultChecked: Boolean(profileRow?.lot_tracking),
                  expiryTrackingDefaultChecked: Boolean(profileRow?.expiry_tracking),
                }}
              />
              <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
                Las presentaciones físicas, equivalencias operativas y fotos por presentación ahora se administran desde la pantalla dedicada de presentaciones.
              </div>
            </CatalogSection>
            )}

            {!isAssetItem && normalizedProductType === "preparacion" && hasRemissionEnabledSite ? (
              <CatalogSection
                title="Remisión y salida de producción"
                description="Conecta cómo esta preparación se mueve desde producción hacia operación. La fuente ideal es la porción o rendimiento publicado por FOGO."
              >
                <ProductRemissionUomFields
                  units={unitsList.map((unit) => ({ code: unit.code, name: unit.name }))}
                  stockUnitCode={stockUnitCode}
                  defaultLabel={remissionUomProfile?.label ?? recipePortionRemissionProfile?.label ?? "Unidad operativa"}
                  defaultInputUnitCode={remissionUomProfile?.input_unit_code ?? recipePortionRemissionProfile?.inputUnitCode ?? resolvedDefaultUnit ?? stockUnitCode}
                  defaultQtyInStockUnit={remissionUomProfile?.qty_in_stock_unit ?? recipePortionRemissionProfile?.qtyInStockUnit ?? 1}
                  defaultSourceMode={remissionDefaultSourceMode}
                  allowPurchasePrimaryOption={false}
                  allowRecipePortionOption
                  variant="preparation"
                  fogoRecipeHref={buildFogoRecipeUrl(productRow.id)}
                  recipePortionAvailable={recipePortionAvailable}
                />
              </CatalogSection>
            ) : null}

            {!isAssetItem ? (
              <ProductPurchaseSection
                enabled={hasSuppliers}
                initialRows={supplierInitialRows}
                suppliers={suppliersList.map((s) => ({ id: s.id, name: s.name }))}
                units={unitsList}
                stockUnitCode={stockUnitCode}
                stockUnitFieldId={STOCK_UNIT_FIELD_ID}
              />
            ) : null}

            {isAssetItem ? (
              <ProductAssetTechnicalSection
                defaultTemplate={isMachineryAssetCategory ? "industrial" : "general"}
                initialProfile={{
                  brand: assetProfileRow?.brand ?? "",
                  model: assetProfileRow?.model ?? "",
                  serial_number: assetProfileRow?.serial_number ?? "",
                  physical_location: assetProfileRow?.physical_location ?? "",
                  purchase_invoice_url: assetProfileRow?.purchase_invoice_url ?? "",
                  commercial_value: assetProfileRow?.commercial_value ?? null,
                  purchase_date: assetProfileRow?.purchase_date ?? "",
                  started_use_date: assetProfileRow?.started_use_date ?? "",
                  equipment_status: assetProfileRow?.equipment_status ?? "operativo",
                  maintenance_service_provider:
                    assetProfileRow?.maintenance_service_provider ?? "",
                  technical_description: assetProfileRow?.technical_description ?? "",
                  maintenance_cycle_enabled: assetProfileRow?.maintenance_cycle_enabled ?? false,
                  maintenance_cycle_months: assetProfileRow?.maintenance_cycle_months ?? null,
                  maintenance_cycle_anchor_date:
                    assetProfileRow?.maintenance_cycle_anchor_date ?? "",
                }}
                initialMaintenance={assetMaintenanceRows}
                initialTransfers={assetTransferRows}
                siteOptions={siteRows.map((site) => ({
                  id: site.site_id,
                  name: siteNamesById[site.site_id] || "Sede",
                }))}
              />
            ) : null}

            {!isAssetItem ? (
              <ProductSiteAvailabilitySection
                initialRows={siteRows.map((r) => ({
                  id: r.id,
                  site_id: r.site_id,
                  is_active: Boolean(r.is_active),
                  default_area_kind: r.default_area_kind ?? "",
                  area_kinds:
                    Array.isArray(r.area_kinds) && r.area_kinds.length
                      ? r.area_kinds
                      : r.default_area_kind
                        ? [r.default_area_kind]
                        : [],
                  production_location_id: r.production_location_id ?? "",
                  local_production_enabled:
                    Boolean(r.local_production_enabled) ||
                    Boolean(r.production_location_id),
                  min_stock_qty: r.min_stock_qty ?? undefined,
                  min_stock_input_mode: r.min_stock_input_mode === "purchase" ? "purchase" : "base",
                  min_stock_purchase_qty: r.min_stock_purchase_qty ?? undefined,
                  min_stock_purchase_unit_code: r.min_stock_purchase_unit_code ?? undefined,
                  min_stock_purchase_to_base_factor: r.min_stock_purchase_to_base_factor ?? undefined,
                  audience: r.audience ?? "BOTH",
                  remission_enabled:
                    typeof r.remission_enabled === "boolean" ? r.remission_enabled : null,
                  sales_enabled:
                    typeof r.sales_enabled === "boolean" ? r.sales_enabled : null,
                }))}
                initialProductionRoutes={productionRouteRows.map((route) => ({
                  id: route.id,
                  site_id: String(route.site_id ?? ""),
                  area_kind: String(route.area_kind ?? ""),
                  input_location_id: String(route.input_location_id ?? ""),
                  output_mode:
                    route.output_mode === "sellable_stock" || route.output_mode === "order_fulfillment"
                      ? route.output_mode
                      : "inventory_stock",
                  output_location_id: route.output_location_id ?? undefined,
                  is_active: route.is_active !== false,
                }))}
                sites={sitesList.map((s) => ({ id: s.id, name: s.name, site_type: s.site_type }))}
                siteCapabilities={Array.from(capabilitiesBySite.values())}
                areaKinds={areaKindsList.map((a) => ({
                  code: a.code,
                  name: a.name ?? a.code,
                  use_for_remission: Boolean(a.use_for_remission),
                }))}
                siteAreaKinds={siteAreaKindsList}
                productionLocations={productionLocationsList.map((location) => ({
                  id: location.id,
                  site_id: location.site_id,
                  code: location.code,
                  zone: location.zone,
                  area_kind: Array.isArray(location.area)
                    ? location.area[0]?.kind ?? null
                    : location.area?.kind ?? null,
                }))}
                remissionAreaKindsBySite={remissionAreaKindsBySite}
                stockUnitCode={stockUnitCode}
                purchaseUnitHint={
                  purchaseUomProfile
                    ? {
                      label: purchaseUomProfile.label,
                      inputUnitCode: purchaseUomProfile.input_unit_code,
                      qtyInInputUnit: purchaseUomProfile.qty_in_input_unit,
                      qtyInStockUnit: purchaseUomProfile.qty_in_stock_unit,
                    }
                    : null
                }
                operationUnitHint={buildOperationUnitHintFromUnits({
                  units: unitsList,
                  inputUnitCode: resolvedDefaultUnit || stockUnitCode,
                  stockUnitCode,
                })}
                productType={productRow.product_type}
                inventoryKind={profileRow?.inventory_kind ?? null}
                hasRecipe={hasRecipe}
              />
            ) : null}

            <ProductFormFooter
              submitLabel="Guardar cambios"
              showActiveToggle
              activeDefaultChecked={Boolean(productRow.is_active)}
            />

            <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-end px-4 sm:bottom-6 sm:px-6 lg:px-8">
              <button
                type="submit"
                className="ui-btn ui-btn--brand pointer-events-auto h-12 min-w-[11rem] justify-center rounded-full px-6 text-base font-semibold shadow-2xl ring-1 ring-black/5"
              >
                Guardar cambios
              </button>
            </div>
          </RequiredFieldsGuardForm>
        </>
      ) : (
        <div className="ui-alert ui-alert--warn">
          Solo propietarios y gerentes generales pueden editar la ficha maestra.
        </div>
      )}
    </div>
  );
}
