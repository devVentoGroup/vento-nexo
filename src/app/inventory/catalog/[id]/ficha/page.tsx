import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import { getCategoryPath } from "@/lib/inventory/categories";
import {
  isTemporaryOperationUnitProfile,
  normalizeUnitCode,
  selectProductUomProfileForContext,
  selectRemissionRequestUomProfile,
  type ProductUomProfile,
} from "@/lib/inventory/uom";
import {
  addMonthsUTC,
  buildFogoRecipeUrl,
  buildProductionPackageGroups,
  equipmentStatusLabel,
  formatDate,
  formatMoney,
  formatQty,
  formatUnitMoney,
  getSupplierGrossPackPrice,
  loadCategoryRows,
  normalizeTypeLabel,
  packageLocationLabel,
  preparationRemissionStatusLabel,
  preparationRemissionStatusTone,
  productionPackageOriginalQty,
  productionPackageRemainingQty,
  productionPackageStatusLabel,
  resolveProfileDisplay,
  sanitizeCatalogReturnPath,
  toPositiveNumber,
  uomProfileDisplayRank,
  uomProfileImageUrl,
  uomSourceLabel,
  uomUsageContextLabel,
  type AssetMaintenanceRow,
  type AssetProfileRow,
  type AssetTransferRow,
  type InventoryProfileRow,
  type InventoryReceiptItemTraceRow,
  type PackageLocationRow,
  type ProductRow,
  type ProductionBatchPackageRow,
  type PurchaseOrderItemTraceRow,
  type SearchParams,
  type SiteRow,
  type SiteSettingRow,
  type StockRow,
  type SupplierRow,
  type UnitRow,
  type UomProfileRow,
} from "./ficha-helpers";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";
const NEXO_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://nexo.ventogroup.co";

export default async function ProductTechnicalSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const returnTo = sanitizeCatalogReturnPath(sp.from);

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/catalog/${id}/ficha`,
    permissionCode: PERMISSION,
  });

  const [
    productRes,
    profileRes,
    sitesRes,
    siteSettingsRes,
    stockRes,
    suppliersRes,
    uomProfilesRes,
    unitsRes,
    purchaseOrderItemsRes,
    receiptItemsRes,
    allCategories,
    employeeRes,
    assetProfileRes,
    assetMaintenanceRes,
    assetTransfersRes,
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id,name,description,sku,unit,stock_unit_code,product_type,category_id,price,cost,is_active,image_url,catalog_image_url"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("product_inventory_profiles")
      .select("track_inventory,inventory_kind,default_unit,lot_tracking,expiry_tracking")
      .eq("product_id", id)
      .maybeSingle(),
    supabase
      .from("sites")
      .select("id,name,is_active,operational_visibility")
      .eq("is_active", true)
      .eq("operational_visibility", "operational")
      .order("name", { ascending: true }),
    supabase
      .from("product_site_settings")
      .select(
        "site_id,is_active,min_stock_qty,inventory_enabled,sales_enabled,local_production_enabled,remission_enabled"
      )
      .eq("product_id", id),
    supabase
      .from("inventory_stock_by_site")
      .select("site_id,current_qty")
      .eq("product_id", id),
    supabase
      .from("product_suppliers")
      .select(
        "supplier_id,purchase_unit,purchase_pack_qty,purchase_pack_unit_code,purchase_price_net,purchase_price,purchase_price_includes_tax,purchase_tax_rate,purchase_price_includes_icui,purchase_icui_rate,is_primary,suppliers(name)"
      )
      .eq("product_id", id)
      .order("is_primary", { ascending: false }),
    supabase
      .from("product_uom_profiles")
      .select(
        "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,usage_context,is_default,is_active,image_url,catalog_image_url,updated_at,source"
      )
      .eq("product_id", id)
      .eq("is_active", true),
    supabase
      .from("inventory_units")
      .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
      .eq("is_active", true),
    supabase
      .from("purchase_order_items")
      .select(
        "qty,purchase_orders(id,status,expected_at,created_at,suppliers(name))"
      )
      .eq("product_id", id)
      .order("created_at", { foreignTable: "purchase_orders", ascending: false })
      .limit(8),
    supabase
      .from("inventory_entry_items")
      .select("qty_base,inventory_entries(id,invoice_number,status,received_at,created_at,sites(name))")
      .eq("product_id", id)
      .order("created_at", { foreignTable: "inventory_entries", ascending: false })
      .limit(8),
    loadCategoryRows(supabase),
    supabase.from("employees").select("role").eq("id", user.id).maybeSingle(),
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
      .order("performed_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("product_asset_transfer_events")
      .select("id,moved_at,from_location,to_location,responsible,notes")
      .eq("product_id", id)
      .order("moved_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const product = (productRes.data ?? null) as ProductRow | null;
  if (!product) notFound();

  const profile = (profileRes.data ?? null) as InventoryProfileRow | null;
  const sites = (sitesRes.data ?? []) as SiteRow[];
  const siteSettings = (siteSettingsRes.data ?? []) as SiteSettingRow[];
  const stockRows = (stockRes.data ?? []) as StockRow[];
  const supplierRows = (suppliersRes.data ?? []) as SupplierRow[];
  const uomProfiles = (uomProfilesRes.data ?? []) as UomProfileRow[];
  const unitRows = (unitsRes.data ?? []) as UnitRow[];
  const purchaseOrderRows = (purchaseOrderItemsRes.data ?? []) as PurchaseOrderItemTraceRow[];
  const receiptRows = (receiptItemsRes.data ?? []) as InventoryReceiptItemTraceRow[];
  const assetProfile = (assetProfileRes.data ?? null) as AssetProfileRow | null;
  const assetMaintenanceRows = (assetMaintenanceRes.data ?? []) as AssetMaintenanceRow[];
  const assetTransferRows = (assetTransfersRes.data ?? []) as AssetTransferRow[];

  const role = String(employeeRes.data?.role ?? "").toLowerCase();
  const canEdit =
    ["propietario", "gerente_general"].includes(role) ||
    (await checkPermission(supabase, APP_ID, "catalog.products"));

  const stockUnitCode = normalizeUnitCode(
    product.stock_unit_code || product.unit || "un"
  );
  const defaultUnitCode = normalizeUnitCode(profile?.default_unit || stockUnitCode);
  const normalizedType = normalizeTypeLabel(
    product.product_type,
    profile?.inventory_kind ?? null
  );
  const categoryMap = new Map(allCategories.map((row) => [row.id, row]));
  const categoryPath = getCategoryPath(product.category_id, categoryMap) || "Sin categoría";
  const normalizedCategoryPath = categoryPath.trim().toLowerCase();
  const isMachineryAndEquipmentCategory =
    normalizedCategoryPath.includes("maquinaria y equipos") ||
    (normalizedCategoryPath.includes("maquinaria") &&
      (normalizedCategoryPath.includes("equipo") || normalizedCategoryPath.includes("equipos")));

  const productTypeKey = String(product.product_type ?? "").trim().toLowerCase();
  const inventoryKindKey = String(profile?.inventory_kind ?? "").trim().toLowerCase();
  const isManualPresentationProduct = productTypeKey === "insumo" && inventoryKindKey !== "asset";
  const isProducedPackagedProduct =
    productTypeKey === "preparacion" || (productTypeKey === "venta" && inventoryKindKey !== "resale");
  const legacyManualPresentationCount = isManualPresentationProduct
    ? 0
    : uomProfiles.filter((row) => {
        const source = String(row.source ?? "").trim().toLowerCase();
        const usageContext = String(row.usage_context ?? "").trim().toLowerCase();
        return source === "manual" && usageContext !== "purchase";
      }).length;

  const presentationRows = [...uomProfiles]
    .filter((row) => {
      const source = String(row.source ?? "").trim().toLowerCase();
      const usageContext = String(row.usage_context ?? "").trim().toLowerCase();

      if (!isManualPresentationProduct) return false;
      return source === "manual" && usageContext !== "purchase";
    })
    .sort((a, b) => {
      const rankDiff = uomProfileDisplayRank(b) - uomProfileDisplayRank(a);
      if (rankDiff !== 0) return rankDiff;

      const bTime = new Date(String(b.updated_at ?? "")).getTime();
      const aTime = new Date(String(a.updated_at ?? "")).getTime();

      if ((Number.isFinite(bTime) ? bTime : 0) !== (Number.isFinite(aTime) ? aTime : 0)) {
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
      }

      return String(a.label ?? "").localeCompare(String(b.label ?? ""), "es", { sensitivity: "base" });
    })
    .map((row) => ({
      id: row.id,
      label: String(row.label ?? "").trim() || "Presentación",
      inputUnitCode: normalizeUnitCode(row.input_unit_code || ""),
      qtyInInputUnit: toPositiveNumber(row.qty_in_input_unit, 1),
      qtyInStockUnit: toPositiveNumber(row.qty_in_stock_unit, 1),
      usageContextLabel: uomUsageContextLabel(row.usage_context),
      sourceLabel: uomSourceLabel(row.source),
      isDefault: row.is_default === true,
      isActive: row.is_active !== false,
      imageUrl: uomProfileImageUrl(row),
    }));

  const presentationImageUrl =
    presentationRows.find((row) => row.isDefault && row.imageUrl)?.imageUrl ||
    presentationRows.find((row) => row.imageUrl)?.imageUrl ||
    "";

  const imageUrl = presentationImageUrl || product.catalog_image_url || product.image_url || null;
  const hasPresentationGallery = isManualPresentationProduct && presentationRows.length >= 2;
  const primarySupplier = supplierRows.find((row) => Boolean(row.is_primary)) ?? null;
  const secondarySuppliers = supplierRows.filter((row) => !Boolean(row.is_primary));

  const mappedProfiles: ProductUomProfile[] = uomProfiles.map((row) => ({
    id: row.id,
    product_id: row.product_id,
    label: row.label || "Unidad",
    input_unit_code: normalizeUnitCode(row.input_unit_code || ""),
    qty_in_input_unit: toPositiveNumber(row.qty_in_input_unit, 1),
    qty_in_stock_unit: toPositiveNumber(row.qty_in_stock_unit, 1),
    is_default: row.is_default !== false,
    is_active: row.is_active !== false,
    source:
      row.source === "supplier_primary"
        ? "supplier_primary"
        : row.source === "recipe_portion"
          ? "recipe_portion"
          : ("manual" as const),
    usage_context:
      String(row.usage_context ?? "general").trim().toLowerCase() === "purchase"
        ? "purchase"
        : String(row.usage_context ?? "general").trim().toLowerCase() === "remission"
          ? "remission"
          : "general",
  }));
  const purchaseProfile =
    (selectProductUomProfileForContext({
      profiles: mappedProfiles,
      productId: id,
      context: "purchase",
    }) as ProductUomProfile | null) ?? null;
  const remissionProfile =
    (selectRemissionRequestUomProfile({
      profiles: mappedProfiles,
      productId: id,
    }) as ProductUomProfile | null) ?? null;
  const purchaseProfileDisplay = resolveProfileDisplay({
    profile: purchaseProfile,
    stockUnitCode,
    unitRows,
    normalizeByCatalog: false,
  });
  const remissionProfileDisplay = resolveProfileDisplay({
    profile: remissionProfile,
    stockUnitCode,
    unitRows,
    normalizeByCatalog: false,
  });
  const usesTemporaryOperationRemission =
    isTemporaryOperationUnitProfile(remissionProfile, stockUnitCode);
  const remissionSourceLabel = usesTemporaryOperationRemission
    ? "Unidad operativa temporal"
    : remissionProfile
      ? remissionProfile.source === "supplier_primary"
      ? "Proveedor (empaque en operación)"
      : remissionProfile.source === "recipe_portion"
        ? "Receta publicada (porción)"
        : "Unidad operativa"
    : "Unidad operativa";
  const purchasePackText = purchaseProfileDisplay
    ? `${purchaseProfileDisplay.label} (${formatQty(purchaseProfileDisplay.qtyInStockUnit)} ${stockUnitCode})`
    : "Sin presentación de compra";
  const remissionPackText = remissionProfileDisplay
    ? `${remissionProfileDisplay.label} (1 ${remissionProfileDisplay.label.toLowerCase()} = ${formatQty(remissionProfileDisplay.qtyInStockUnit)} ${stockUnitCode})`
    : usesTemporaryOperationRemission
      ? `Unidad base (${stockUnitCode})`
    : "No marcado para remisión";
  const remissionUnitText = remissionProfileDisplay
    ? `${remissionProfileDisplay.inputUnitCode}`
    : usesTemporaryOperationRemission
      ? stockUnitCode
    : defaultUnitCode;
  const operationRuleText = usesTemporaryOperationRemission
    ? "Usa unidad base temporal mientras FOGO publica la porción."
    : remissionProfileDisplay
      ? remissionProfile?.source === "recipe_portion"
      ? "Usa porción de receta publicada."
      : "Usa presentación de remisión."
    : "No usa remisión: opera con unidad operativa.";
  const preparationRemissionStatus = preparationRemissionStatusLabel(remissionProfile);
  const preparationRemissionTone = preparationRemissionStatusTone(remissionProfile);

  const primarySupplierPackPrice = primarySupplier
    ? Number(primarySupplier.purchase_price_net ?? primarySupplier.purchase_price ?? 0)
    : 0;
  const primarySupplierGrossPackPrice = getSupplierGrossPackPrice(primarySupplier);
  const purchaseQtyInStockUnit = Number(purchaseProfileDisplay?.qtyInStockUnit ?? 0);
  const primarySupplierUnitPrice =
    Number.isFinite(primarySupplierPackPrice) &&
      primarySupplierPackPrice > 0 &&
      Number.isFinite(purchaseQtyInStockUnit) &&
      purchaseQtyInStockUnit > 0
      ? primarySupplierPackPrice / purchaseQtyInStockUnit
      : null;
  const primarySupplierGrossUnitPrice =
    primarySupplierGrossPackPrice != null &&
      primarySupplierGrossPackPrice > 0 &&
      Number.isFinite(purchaseQtyInStockUnit) &&
      purchaseQtyInStockUnit > 0
      ? primarySupplierGrossPackPrice / purchaseQtyInStockUnit
      : null;
  const shouldShowGrossUnitPrice =
    primarySupplierUnitPrice != null &&
    primarySupplierGrossUnitPrice != null &&
    Math.abs(primarySupplierGrossUnitPrice - primarySupplierUnitPrice) > 0.01;

  const stockBySite = new Map<string, number>();
  stockRows.forEach((row) => {
    const siteId = String(row.site_id ?? "").trim();
    if (!siteId) return;
    stockBySite.set(siteId, Number(row.current_qty ?? 0) || 0);
  });
  const settingsBySite = new Map<string, SiteSettingRow>();
  siteSettings.forEach((row) => {
    const siteId = String(row.site_id ?? "").trim();
    if (!siteId) return;
    settingsBySite.set(siteId, row);
  });

  const sheetRows = sites
    .map((site) => {
      const qty = stockBySite.get(site.id) ?? 0;
      const cfg = settingsBySite.get(site.id) ?? null;

      const legacyEnabled = cfg ? cfg.is_active !== false : false;
      const inventoryEnabled = cfg?.inventory_enabled === true;
      const salesEnabled = cfg?.sales_enabled === true;
      const localProductionEnabled = cfg?.local_production_enabled === true;
      const remissionEnabled = cfg?.remission_enabled === true;

      const hasOperationalConfig =
        Boolean(cfg) &&
        (
          legacyEnabled ||
          inventoryEnabled ||
          salesEnabled ||
          localProductionEnabled ||
          remissionEnabled
        );

      const enabled = hasOperationalConfig;
      const minStock = enabled ? Number(cfg?.min_stock_qty ?? 0) : null;
      const shortage =
        minStock != null && Number.isFinite(minStock) ? Math.max(minStock - qty, 0) : null;

      return {
        siteId: site.id,
        siteName: site.name ?? site.id,
        qty,
        minStock,
        shortage,
        enabled,
        configured: Boolean(cfg),
        inventoryEnabled,
        salesEnabled,
        localProductionEnabled,
        remissionEnabled,
        hasVisibleRelation: hasOperationalConfig || qty > 0.000001,
      };
    })
    .filter((row) => row.hasVisibleRelation);

  const isAsset = String(profile?.inventory_kind ?? "").trim().toLowerCase() === "asset";
  const isPreparation = String(product.product_type ?? "").trim().toLowerCase() === "preparacion";
  const isSale = String(product.product_type ?? "").trim().toLowerCase() === "venta";
  const isResale = String(profile?.inventory_kind ?? "").trim().toLowerCase() === "resale";
  const technicalPath = `/inventory/catalog/${product.id}/ficha`;
  const technicalAbsoluteUrl = `${NEXO_BASE_URL}${technicalPath}`;
  const assetQrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
    technicalAbsoluteUrl
  )}`;

  let productionPackageRows: ProductionBatchPackageRow[] = [];
  let packageLocationRows: PackageLocationRow[] = [];
  let packageSiteRows: SiteRow[] = [];

  if (isProducedPackagedProduct) {
    const { data: packageRowsData } = await supabase
      .from("production_batch_packages")
      .select(
        "id,batch_id,site_id,location_id,location_position_id,product_id,package_index,package_label,actual_qty,original_qty,remaining_qty,reserved_qty,unit_code,status,created_at"
      )
      .eq("product_id", id)
      .gt("remaining_qty", 0)
      .order("created_at", { ascending: false })
      .limit(80);

    productionPackageRows = (packageRowsData ?? []) as ProductionBatchPackageRow[];

    const packageLocationIds = Array.from(
      new Set(
        productionPackageRows
          .map((row) => String(row.location_id ?? "").trim())
          .filter(Boolean)
      )
    );
    const packageSiteIds = Array.from(
      new Set(
        productionPackageRows
          .map((row) => String(row.site_id ?? "").trim())
          .filter(Boolean)
      )
    );

    const [{ data: locationRowsData }, { data: packageSitesData }] = await Promise.all([
      packageLocationIds.length
        ? supabase
            .from("inventory_locations")
            .select("id,code,zone,description")
            .in("id", packageLocationIds)
        : Promise.resolve({ data: [] }),
      packageSiteIds.length
        ? supabase
            .from("sites")
            .select("id,name,is_active")
            .in("id", packageSiteIds)
        : Promise.resolve({ data: [] }),
    ]);

    packageLocationRows = (locationRowsData ?? []) as PackageLocationRow[];
    packageSiteRows = (packageSitesData ?? []) as SiteRow[];
  }

  const packageLocationsById = new Map(packageLocationRows.map((row) => [row.id, row]));
  const packageSitesById = new Map(packageSiteRows.map((row) => [row.id, row]));
  const availableProductionPackages = productionPackageRows.filter(
    (row) => productionPackageRemainingQty(row) > 0
  );
  const productionPackageGroups = buildProductionPackageGroups(
    availableProductionPackages,
    stockUnitCode
  );
  const productionPackageTotalRemaining = availableProductionPackages.reduce(
    (acc, row) => acc + productionPackageRemainingQty(row),
    0
  );
  const productionPackageReservedQty = availableProductionPackages.reduce(
    (acc, row) => acc + Number(row.reserved_qty ?? 0),
    0
  );

  const maintenanceCalendarMap = assetMaintenanceRows.reduce(
    (acc, row) => {
      const keySource = row.scheduled_date || row.performed_date || "";
      const keyDate = keySource ? new Date(keySource) : null;
      const monthKey =
        keyDate && Number.isFinite(keyDate.getTime())
          ? `${keyDate.getUTCFullYear()}-${String(keyDate.getUTCMonth() + 1).padStart(2, "0")}`
          : "Sin fecha";
      if (!acc[monthKey]) acc[monthKey] = [];
      acc[monthKey].push(row);
      return acc;
    },
    {} as Record<string, AssetMaintenanceRow[]>
  );
  const maintenanceCalendarBuckets = Object.entries(maintenanceCalendarMap).sort((a, b) =>
    a[0] === "Sin fecha" ? 1 : b[0] === "Sin fecha" ? -1 : b[0].localeCompare(a[0])
  );

  const maintenancePlannerMap = assetMaintenanceRows.reduce(
    (acc, row) => {
      const bucket = String(row.planner_bucket ?? "mensual").trim().toLowerCase() || "mensual";
      if (!acc[bucket]) acc[bucket] = [];
      acc[bucket].push(row);
      return acc;
    },
    {} as Record<string, AssetMaintenanceRow[]>
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);
  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);

  const scheduledPendingRows = assetMaintenanceRows
    .filter((row) => row.scheduled_date && !row.performed_date)
    .map((row) => {
      const scheduledAt = new Date(String(row.scheduled_date));
      return { row, scheduledAt };
    })
    .filter((entry) => Number.isFinite(entry.scheduledAt.getTime()))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  const overdueMaintenance = scheduledPendingRows.filter(
    (entry) => entry.scheduledAt.getTime() < today.getTime()
  );
  const next7DaysMaintenance = scheduledPendingRows.filter(
    (entry) =>
      entry.scheduledAt.getTime() >= today.getTime() &&
      entry.scheduledAt.getTime() <= in7Days.getTime()
  );
  const next30DaysMaintenance = scheduledPendingRows.filter(
    (entry) =>
      entry.scheduledAt.getTime() > in7Days.getTime() &&
      entry.scheduledAt.getTime() <= in30Days.getTime()
  );

  const recurrenceMonthsRaw = Number(assetProfile?.maintenance_cycle_months ?? 0);
  const recurrenceMonths =
    Number.isFinite(recurrenceMonthsRaw) && recurrenceMonthsRaw >= 1 ? Math.trunc(recurrenceMonthsRaw) : 0;
  const recurrenceAnchorDate = assetProfile?.maintenance_cycle_anchor_date
    ? new Date(assetProfile.maintenance_cycle_anchor_date)
    : null;
  const recurrenceEnabled =
    Boolean(assetProfile?.maintenance_cycle_enabled) &&
    recurrenceMonths > 0 &&
    recurrenceAnchorDate &&
    Number.isFinite(recurrenceAnchorDate.getTime());
  let recurrenceNextDueDate: Date | null = null;
  if (recurrenceEnabled && recurrenceAnchorDate) {
    let cursor = new Date(recurrenceAnchorDate);
    cursor.setHours(0, 0, 0, 0);
    let safety = 0;
    while (cursor.getTime() < today.getTime() && safety < 240) {
      cursor = addMonthsUTC(cursor, recurrenceMonths);
      safety += 1;
    }
    recurrenceNextDueDate = cursor;
  }
  const recurrenceIn7Days =
    recurrenceNextDueDate != null &&
    recurrenceNextDueDate.getTime() >= today.getTime() &&
    recurrenceNextDueDate.getTime() <= in7Days.getTime();
  const recurrenceIn30Days =
    recurrenceNextDueDate != null &&
    recurrenceNextDueDate.getTime() > in7Days.getTime() &&
    recurrenceNextDueDate.getTime() <= in30Days.getTime();

  const purchaseTraceRows = purchaseOrderRows
    .map((row, idx) => {
      const order = Array.isArray(row.purchase_orders)
        ? row.purchase_orders[0] ?? null
        : row.purchase_orders ?? null;
      const supplier = Array.isArray(order?.suppliers)
        ? order?.suppliers[0]?.name ?? null
        : order?.suppliers?.name ?? null;
      const orderNo = order?.id ? `OC ${order.id.slice(0, 8)}` : "-";
      return {
        key: `po-${idx}-${order?.id ?? "sin-numero"}`,
        orderNo,
        supplierName: supplier ?? "Sin proveedor",
        status: order?.status ?? "-",
        date: order?.expected_at ?? order?.created_at ?? null,
        qty: Number(row.qty ?? 0) || 0,
      };
    })
    .filter((row) => row.orderNo !== "-");

  const receiptTraceRows = receiptRows
    .map((row, idx) => {
      const receipt = Array.isArray(row.inventory_entries)
        ? row.inventory_entries[0] ?? null
        : row.inventory_entries ?? null;
      const siteName = Array.isArray(receipt?.sites)
        ? receipt?.sites[0]?.name ?? null
        : receipt?.sites?.name ?? null;
      const receiptNo =
        receipt?.invoice_number ?? (receipt?.id ? `Entrada ${receipt.id.slice(0, 8)}` : "-");
      return {
        key: `re-${idx}-${receipt?.id ?? "sin-numero"}`,
        receiptNo,
        siteName: siteName ?? "Sin sede",
        status: receipt?.status ?? "-",
        date: receipt?.received_at ?? receipt?.created_at ?? null,
        qtyBase: Number(row.qty_base ?? 0) || 0,
      };
    })
    .filter((row) => row.receiptNo !== "-");

  const orderedTotal = purchaseTraceRows.reduce((acc, row) => acc + row.qty, 0);
  const receivedTotal = receiptTraceRows.reduce((acc, row) => acc + row.qtyBase, 0);

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.35fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link
                href={returnTo}
                className="ui-btn ui-btn--ghost inline-flex h-12 items-center px-5 text-base font-semibold"
              >
                ← Volver al catálogo
              </Link>
              <h1 className="ui-h1">
                {isAsset
                  ? "Ficha base del modelo"
                  : isPreparation
                    ? "Ficha técnica de preparación"
                    : "Ficha técnica"}
              </h1>
              <p className="ui-body-muted">
                {isAsset
                  ? "Vista de solo lectura para catálogo: identidad, foto y datos técnicos base del modelo. La ubicación real, QR, mantenimiento y conteo viven en Activos físicos."
                  : isPreparation
                    ? "Vista de solo lectura del WIP: identidad, unidad base, remisión, empaques reales y continuidad de receta en FOGO."
                    : "Vista de solo lectura para operación: identidad, unidades, inventario por sede y abastecimiento."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                {normalizedType}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {product.is_active === false ? "Inactivo" : "Activo"}
              </span>
              {product.sku ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                  SKU {product.sku}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit ? (
                <Link
                  href={`/inventory/catalog/${product.id}?from=${encodeURIComponent(returnTo)}`}
                  className="ui-btn ui-btn--ghost"
                >
                  Editar ficha maestra
                </Link>
              ) : null}
              {isAsset ? (
                <>
                  <Link href="/inventory/assets/new" className="ui-btn ui-btn--brand">
                    Crear activo físico
                  </Link>
                  <Link href="/inventory/assets" className="ui-btn ui-btn--ghost">
                    Ver activos físicos
                  </Link>
                </>
              ) : null}
              {(isPreparation || (isSale && !isResale)) ? (
                <Link
                  href={buildFogoRecipeUrl(product.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-btn ui-btn--brand"
                >
                  Ver continuidad en FOGO
                </Link>
              ) : null}
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            {isAsset ? (
              <>
                <article className="ui-remission-kpi" data-tone="cool">
                  <div className="ui-remission-kpi-label">Modelo base</div>
                  <div className="ui-remission-kpi-value">Activo</div>
                  <div className="ui-remission-kpi-note">
                    Esta ficha describe el modelo, no una unidad física.
                  </div>
                </article>
                <article className="ui-remission-kpi" data-tone="warm">
                  <div className="ui-remission-kpi-label">Datos técnicos</div>
                  <div className="ui-remission-kpi-value">
                    {assetProfile?.brand || assetProfile?.model ? "Listos" : "Pendiente"}
                  </div>
                  <div className="ui-remission-kpi-note">
                    Marca, modelo y referencia técnica del catálogo.
                  </div>
                </article>
                <article className="ui-remission-kpi" data-tone="success">
                  <div className="ui-remission-kpi-label">Operación real</div>
                  <div className="ui-remission-kpi-value">NEXO</div>
                  <div className="ui-remission-kpi-note">
                    Unidades, QR, ubicación y conteo se gestionan en Activos físicos.
                  </div>
                </article>
              </>
            ) : isPreparation ? (
              <>
                <article className="ui-remission-kpi" data-tone="warm">
                  <div className="ui-remission-kpi-label">Base WIP</div>
                  <div className="ui-remission-kpi-value">{stockUnitCode}</div>
                  <div className="ui-remission-kpi-note">
                    Unidad canónica para receta, inventario y consumo.
                  </div>
                </article>
                <article className="ui-remission-kpi" data-tone={preparationRemissionTone}>
                  <div className="ui-remission-kpi-label">Remisión</div>
                  <div className="ui-remission-kpi-value">{preparationRemissionStatus}</div>
                  <div className="ui-remission-kpi-note">
                    {remissionProfile?.source === "recipe_portion"
                      ? "Fuente: porción publicada por FOGO."
                      : remissionProfile
                        ? "Fuente temporal hasta publicar receta."
                        : "Falta definir salida operativa."}
                  </div>
                </article>
                <article className="ui-remission-kpi" data-tone="success">
                  <div className="ui-remission-kpi-label">Empaques FOGO</div>
                  <div className="ui-remission-kpi-value">{availableProductionPackages.length}</div>
                  <div className="ui-remission-kpi-note">
                    {formatQty(productionPackageTotalRemaining)} {stockUnitCode} disponible(s).
                  </div>
                </article>
              </>
            ) : (
              <>
                <article className="ui-remission-kpi" data-tone="warm">
                  <div className="ui-remission-kpi-label">Unidad operativa</div>
                  <div className="ui-remission-kpi-value">{defaultUnitCode}</div>
                  <div className="ui-remission-kpi-note">
                    Captura por defecto cuando no hay empaque operativo.
                  </div>
                </article>
                <article className="ui-remission-kpi" data-tone="cool">
                  <div className="ui-remission-kpi-label">Unidad base</div>
                  <div className="ui-remission-kpi-value">{stockUnitCode}</div>
                  <div className="ui-remission-kpi-note">Referencia para stock, costo y consumo.</div>
                </article>
                <article className="ui-remission-kpi" data-tone="success">
                  <div className="ui-remission-kpi-label">Sedes configuradas</div>
                  <div className="ui-remission-kpi-value">
                    {sheetRows.filter((row) => row.configured).length}
                  </div>
                  <div className="ui-remission-kpi-note">Con setup activo para este producto.</div>
                </article>
              </>
            )}
          </div>
        </div>
      </section>

      <section className={hasPresentationGallery ? "grid gap-4" : "grid gap-4 lg:grid-cols-[1.2fr_0.8fr]"}>
        <article className="ui-panel">
          <div className="text-sm font-semibold text-[var(--ui-text)]">Identidad del producto</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="ui-caption">Nombre</div>
              <div className="mt-1 text-base font-semibold">{product.name ?? "Sin nombre"}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="ui-caption">Categoría</div>
              <div className="mt-1 text-sm">{categoryPath}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="ui-caption">Tipo</div>
              <div className="mt-1 text-sm">{normalizedType}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="ui-caption">Precio base referencial</div>
              <div className="mt-1 text-sm">{formatMoney(product.price)}</div>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
            <div className="ui-caption">Descripción</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              {product.description?.trim() || "Sin descripción registrada."}
            </p>
          </div>
        </article>

        {!hasPresentationGallery ? (
          <article className="ui-panel">
            <div className="text-sm font-semibold text-[var(--ui-text)]">
              {isAsset ? "Foto del equipo / activo" : "Foto"}
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={product.name ?? "Producto"}
                  className="h-[260px] w-full object-cover"
                />
              ) : (
                <div className="flex h-[260px] items-center justify-center text-sm text-[var(--ui-muted)]">
                  Sin imagen
                </div>
              )}
            </div>
          </article>
        ) : null}
      </section>

      {!isAsset && hasPresentationGallery ? (
        <article className="ui-panel">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[var(--ui-text)]">Presentaciones del producto</div>
            <div className="ui-caption">{presentationRows.length} presentación(es)</div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {presentationRows.map((row) => (
              <div
                key={row.id}
                className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)]"
              >
                <div className="h-40 border-b border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
                  {row.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.imageUrl}
                      alt={row.label}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[var(--ui-muted)]">
                      Sin imagen
                    </div>
                  )}
                </div>

                <div className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="line-clamp-2 text-sm font-semibold text-[var(--ui-text)]">
                        {row.label}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        {row.usageContextLabel} · {row.sourceLabel}
                      </div>
                    </div>

                    {row.isDefault ? (
                      <span className="ui-chip ui-chip--success shrink-0">Mínima</span>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2 text-xs text-[var(--ui-muted)]">
                    <strong className="text-[var(--ui-text)]">Contenido:</strong>{" "}
                    {formatQty(row.qtyInInputUnit)} {row.inputUnitCode || "un"} ={" "}
                    {formatQty(row.qtyInStockUnit)} {stockUnitCode}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className={row.isActive ? "ui-chip ui-chip--success" : "ui-chip"}>
                      {row.isActive ? "Activa" : "Inactiva"}
                    </span>
                    {!row.isDefault ? <span className="ui-chip">No mínima</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      {!isAsset && isPreparation ? (
        <article className="ui-panel border-cyan-200 bg-cyan-50/50">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-cyan-950">
                Continuidad FOGO · receta, rendimiento y remisión
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-cyan-900">
                Esta preparación se administra como WIP. NEXO muestra el maestro, el stock y la salida operativa;
                FOGO debe publicar receta, rendimiento, merma, empaques y porción remisionable.
              </p>
            </div>
            <Link
              href={buildFogoRecipeUrl(product.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-btn ui-btn--brand ui-btn--sm"
            >
              Abrir FOGO
            </Link>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-cyan-200 bg-white/80 p-3">
              <div className="ui-caption">Fuente de remisión</div>
              <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
                {preparationRemissionStatus}
              </div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">
                {remissionSourceLabel}
              </div>
            </div>
            <div className="rounded-xl border border-cyan-200 bg-white/80 p-3">
              <div className="ui-caption">Presentación remisionable</div>
              <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
                {remissionProfileDisplay ? remissionPackText : "Pendiente de definir"}
              </div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">
                {remissionProfile?.source === "recipe_portion"
                  ? "Publicada desde receta FOGO."
                  : remissionProfile
                    ? "Configuración temporal desde NEXO."
                    : "Configúrala en edición o publícala desde FOGO."}
              </div>
            </div>
            <div className="rounded-xl border border-cyan-200 bg-white/80 p-3">
              <div className="ui-caption">Empaques reales</div>
              <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
                {availableProductionPackages.length} paquete(s)
              </div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">
                {formatQty(productionPackageTotalRemaining)} {stockUnitCode} disponible(s).
              </div>
            </div>
          </div>

          {!remissionProfileDisplay ? (
            <div className="mt-4 ui-alert ui-alert--warn">
              Esta preparación aún no tiene salida remisionable definida. Puede existir como WIP interno,
              pero para remisiones conviene publicar porción en FOGO o configurar una unidad temporal en edición.
            </div>
          ) : null}
        </article>
      ) : null}

      {!isAsset && isProducedPackagedProduct ? (
        <article className="ui-panel">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-semibold text-[var(--ui-text)]">
                {isPreparation ? "Empaques reales producidos en FOGO" : "Empaques reales de lote"}
              </div>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                {isPreparation
                  ? "La disponibilidad física de esta preparación viene de FOGO: lote, LOC, empaque, cantidad original y cantidad restante."
                  : "Este producto no usa presentaciones manuales. La disponibilidad física viene de FOGO: lote, LOC, empaque, cantidad original y cantidad restante."}
              </p>
            </div>
            <Link
              href={buildFogoRecipeUrl(product.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-btn ui-btn--ghost ui-btn--sm"
            >
              Abrir FOGO
            </Link>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="ui-caption">Empaques disponibles</div>
              <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">
                {availableProductionPackages.length}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="ui-caption">Cantidad disponible</div>
              <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">
                {formatQty(productionPackageTotalRemaining)} {stockUnitCode}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="ui-caption">Reservado</div>
              <div className="mt-1 text-xl font-semibold text-[var(--ui-text)]">
                {formatQty(productionPackageReservedQty)} {stockUnitCode}
              </div>
            </div>
          </div>

          {productionPackageGroups.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {productionPackageGroups.map((group) => (
                <span key={group.key} className="ui-chip ui-chip--success">
                  {group.packageCount} × {group.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-4 ui-alert ui-alert--neutral">
              No hay empaques disponibles de lote para este producto. Cuando FOGO registre producción,
              aparecerán aquí.
            </div>
          )}

          {legacyManualPresentationCount > 0 ? (
            <div className="mt-4 ui-alert ui-alert--warn">
              Este producto todavía tiene {legacyManualPresentationCount} presentación(es) manual(es)
              heredada(s). No se usan para preparaciones producidas; después podemos hacer una limpieza controlada.
            </div>
          ) : null}

          {availableProductionPackages.length > 0 ? (
            <div className="mt-4 overflow-auto rounded-xl border border-[var(--ui-border)]">
              <table className="ui-table min-w-[860px] text-sm">
                <thead>
                  <tr>
                    <th className="py-2 pr-4">Empaque</th>
                    <th className="py-2 pr-4">Lote</th>
                    <th className="py-2 pr-4">Sede / LOC</th>
                    <th className="py-2 pr-4">Original</th>
                    <th className="py-2 pr-4">Restante</th>
                    <th className="py-2 pr-4">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {availableProductionPackages.slice(0, 20).map((row) => {
                    const location = packageLocationsById.get(String(row.location_id ?? ""));
                    const site = packageSitesById.get(String(row.site_id ?? ""));
                    const originalQty = productionPackageOriginalQty(row);
                    const remainingQty = productionPackageRemainingQty(row);
                    const unitCode = normalizeUnitCode(row.unit_code || stockUnitCode || "un");
                    const wasOpened = originalQty > 0 && remainingQty < originalQty - 0.000001;

                    return (
                      <tr key={row.id} className="border-t border-zinc-200/60">
                        <td className="py-2.5 pr-4">
                          <div className="font-semibold text-[var(--ui-text)]">
                            {row.package_label || `Empaque ${row.package_index ?? ""}`}
                          </div>
                          <div className="text-xs text-[var(--ui-muted)]">
                            #{row.package_index ?? "-"}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          {String(row.batch_id ?? "").slice(0, 8) || "-"}
                        </td>
                        <td className="py-2.5 pr-4">
                          <div>{site?.name ?? "Sin sede"}</div>
                          <div className="text-xs text-[var(--ui-muted)]">
                            {packageLocationLabel(location)}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4">
                          {formatQty(originalQty)} {unitCode}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className={wasOpened ? "font-semibold text-amber-700" : "font-semibold text-emerald-700"}>
                            {formatQty(remainingQty)} {unitCode}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <div className="flex flex-wrap gap-1">
                            <span className={wasOpened ? "ui-chip ui-chip--warn" : "ui-chip ui-chip--success"}>
                              {wasOpened ? "Fraccionado" : productionPackageStatusLabel(row.status)}
                            </span>
                            {Number(row.reserved_qty ?? 0) > 0 ? (
                              <span className="ui-chip">Reservado {formatQty(Number(row.reserved_qty ?? 0))}</span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </article>
      ) : null}

      {isAsset ? (
        <section className="space-y-4">
          <article className="ui-panel border-cyan-200 bg-cyan-50/60">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-cyan-950">
                  Este es un modelo de activo, no una unidad física
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-cyan-900">
                  Usa esta ficha para consultar la información base del equipo o mobiliario. Para ubicación real,
                  QR operativo, responsable, mantenimiento, movimientos y conteo patrimonial usa el módulo
                  <strong> Activos físicos</strong>.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/inventory/assets/new" className="ui-btn ui-btn--brand ui-btn--sm">
                  Crear activo físico
                </Link>
                <Link href="/inventory/assets" className="ui-btn ui-btn--ghost ui-btn--sm">
                  Ver activos físicos
                </Link>
                <Link href="/inventory/assets/counts" className="ui-btn ui-btn--ghost ui-btn--sm">
                  Conteo patrimonial
                </Link>
              </div>
            </div>
          </article>

          <article className="ui-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--ui-text)]">
                  Datos técnicos base del modelo
                </div>
                <p className="mt-1 text-sm text-[var(--ui-muted)]">
                  Información genérica que aplica a todos los activos físicos creados desde este producto.
                </p>
              </div>
              <span className="ui-chip ui-chip--brand">Catálogo</span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Marca base</div>
                <div className="mt-1 text-sm font-semibold">{assetProfile?.brand || "Sin dato"}</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Modelo / referencia base</div>
                <div className="mt-1 text-sm font-semibold">{assetProfile?.model || "Sin dato"}</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Categoría patrimonial</div>
                <div className="mt-1 text-sm font-semibold">{categoryPath}</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Proveedor mantenimiento sugerido</div>
                <div className="mt-1 text-sm font-semibold">
                  {assetProfile?.maintenance_service_provider || "Sin proveedor definido"}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Ciclo sugerido</div>
                <div className="mt-1 text-sm font-semibold">
                  {recurrenceEnabled
                    ? `Cada ${recurrenceMonths} mes(es)`
                    : "Sin ciclo sugerido"}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Próxima fecha sugerida</div>
                <div className="mt-1 text-sm font-semibold">
                  {recurrenceNextDueDate ? formatDate(recurrenceNextDueDate.toISOString()) : "-"}
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="ui-caption">Descripción técnica base</div>
              <p className="mt-1 text-sm leading-6 text-[var(--ui-muted)]">
                {assetProfile?.technical_description || "Sin descripción técnica registrada."}
              </p>
            </div>
          </article>

          <article className="ui-panel">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-[var(--ui-text)]">
                  Información operativa real
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--ui-muted)]">
                  Serial, placa interna, ubicación, responsable, factura real, estado físico, movimientos,
                  QR por unidad y mantenimientos reales pertenecen a cada activo físico, no a este modelo base.
                </p>
              </div>
              <Link href="/inventory/assets" className="ui-btn ui-btn--brand">
                Abrir Activos físicos
              </Link>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Ubicación real</div>
                <div className="mt-1 text-sm font-semibold">En ficha del activo físico</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Mantenimiento real</div>
                <div className="mt-1 text-sm font-semibold">Por unidad física</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Conteo patrimonial</div>
                <div className="mt-1 text-sm font-semibold">Por sede, área, LOC o posición</div>
              </div>
            </div>
          </article>

          {(assetProfile?.serial_number ||
            assetProfile?.physical_location ||
            assetProfile?.purchase_invoice_url ||
            assetProfile?.commercial_value ||
            assetProfile?.purchase_date ||
            assetProfile?.started_use_date ||
            assetProfile?.equipment_status ||
            assetMaintenanceRows.length > 0 ||
            assetTransferRows.length > 0) ? (
            <article className="ui-panel border-amber-200 bg-amber-50/50">
              <div className="text-sm font-semibold text-amber-950">
                Datos operativos legados ocultos de la ficha principal
              </div>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                Este modelo todavía tiene información antigua guardada en tablas de catálogo
                como serial, ubicación física, factura, estado, mantenimientos o traslados. No se borra
                para proteger datos existentes, pero la operación real debe migrarse y manejarse desde
                Activos físicos.
              </p>
            </article>
          ) : null}
        </section>
      ) : null}

      {!isAsset ? (
        <>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="ui-panel">
          <div className="text-sm font-semibold text-[var(--ui-text)]">Unidades y control</div>
          <div className="mt-3 space-y-2 text-sm text-[var(--ui-muted)]">
            <p>
              <strong className="text-[var(--ui-text)]">Unidad base:</strong> {stockUnitCode}
            </p>
            <p>
              <strong className="text-[var(--ui-text)]">Unidad operativa:</strong> {defaultUnitCode}
            </p>
            {isProducedPackagedProduct ? (
              <>
                <p>
                  <strong className="text-[var(--ui-text)]">Presentación compra:</strong>{" "}
                  No aplica: se produce en FOGO.
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">
                    {isPreparation ? "Presentación remisionable:" : "Empaque remisión:"}
                  </strong>{" "}
                  {isPreparation
                    ? remissionProfileDisplay
                      ? remissionPackText
                      : "Pendiente: define unidad temporal o publica porción desde FOGO."
                    : "Empaques reales de lote disponibles."}
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Unidad remisión:</strong>{" "}
                  {isPreparation ? remissionUnitText : stockUnitCode}
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Regla activa:</strong>{" "}
                  {isPreparation
                    ? remissionProfileDisplay
                      ? operationRuleText
                      : "WIP interno sin salida remisionable configurada."
                    : "Remitir empaques completos; si hay cantidad intermedia, fraccionar un empaque con confirmación."}
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Fuente remisión:</strong>{" "}
                  {isPreparation ? remissionSourceLabel : "FOGO · empaques producidos"}
                </p>
              </>
            ) : (
              <>
                <p>
                  <strong className="text-[var(--ui-text)]">Presentación compra:</strong> {purchasePackText}
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Presentación remisión:</strong> {remissionPackText}
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Unidad remisión:</strong> {remissionUnitText}
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Regla activa:</strong> {operationRuleText}
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Fuente remisión:</strong> {remissionSourceLabel}
                </p>
              </>
            )}
            <p>
              <strong className="text-[var(--ui-text)]">Controlar stock:</strong>{" "}
              {profile?.track_inventory ? "Sí" : "No"}
            </p>
            <p>
              <strong className="text-[var(--ui-text)]">Lotes:</strong>{" "}
              {profile?.lot_tracking ? "Sí" : "No"}
              {" · "}
              <strong className="text-[var(--ui-text)]">Vencimiento:</strong>{" "}
              {profile?.expiry_tracking ? "Sí" : "No"}
            </p>
          </div>
        </article>

        <article className="ui-panel">
          <div className="text-sm font-semibold text-[var(--ui-text)]">Abastecimiento y costo</div>
          <div className="mt-3 space-y-2 text-sm text-[var(--ui-muted)]">
            {isProducedPackagedProduct ? (
              <>
                <p>
                  <strong className="text-[var(--ui-text)]">Origen:</strong>{" "}
                  {isPreparation ? "Preparación producida en FOGO." : "Producción FOGO."}
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Abastecimiento operativo:</strong>{" "}
                  {isPreparation
                    ? "Entra al inventario como WIP/lote producido, con empaques reales disponibles para operación."
                    : "Entra al inventario como lote producido y empaques físicos reales."}
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Empaques disponibles:</strong>{" "}
                  {availableProductionPackages.length} empaque(s) · {formatQty(productionPackageTotalRemaining)} {stockUnitCode}
                </p>
                {isPreparation ? (
                  <p>
                    <strong className="text-[var(--ui-text)]">Costo técnico:</strong>{" "}
                    {product.cost == null
                      ? "Pendiente de receta/rendimiento en FOGO."
                      : `${formatUnitMoney(product.cost)} / ${stockUnitCode}`}
                  </p>
                ) : null}
              </>
            ) : !isAsset && primarySupplier ? (
              <>
                <p>
                  <strong className="text-[var(--ui-text)]">Proveedor primario:</strong>{" "}
                  {Array.isArray(primarySupplier.suppliers)
                    ? primarySupplier.suppliers[0]?.name ?? "Sin nombre"
                    : primarySupplier.suppliers?.name ?? "Sin nombre"}
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Compra:</strong>{" "}
                  {primarySupplier.purchase_unit || "Empaque"} (
                  {formatQty(primarySupplier.purchase_pack_qty)}{" "}
                  {normalizeUnitCode(primarySupplier.purchase_pack_unit_code || "") || stockUnitCode})
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Precio empaque sin impuestos:</strong>{" "}
                  {formatMoney(primarySupplier.purchase_price_net ?? primarySupplier.purchase_price)}
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Costo unitario sin impuestos:</strong>{" "}
                  {primarySupplierUnitPrice == null
                    ? "-"
                    : `${formatUnitMoney(primarySupplierUnitPrice)} / ${stockUnitCode}`}
                </p>
                {shouldShowGrossUnitPrice ? (
                  <p>
                    <strong className="text-[var(--ui-text)]">Costo unitario completo:</strong>{" "}
                    {`${formatUnitMoney(primarySupplierGrossUnitPrice)} / ${stockUnitCode}`}
                  </p>
                ) : null}
                {secondarySuppliers.length > 0 ? (
                  <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
                    <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">
                      Proveedores secundarios
                    </p>
                    <div className="mt-2 space-y-2">
                      {secondarySuppliers.map((supplier, index) => {
                        const supplierName = Array.isArray(supplier.suppliers)
                          ? supplier.suppliers[0]?.name ?? "Sin nombre"
                          : supplier.suppliers?.name ?? "Sin nombre";
                        return (
                          <div
                            key={`${supplier.supplier_id ?? "sec"}-${index}`}
                            className="rounded-lg border border-[var(--ui-border)] bg-white px-2 py-1.5 text-xs"
                          >
                            <div className="font-semibold text-[var(--ui-text)]">{supplierName}</div>
                            <div>
                              {supplier.purchase_unit || "Empaque"} (
                              {formatQty(supplier.purchase_pack_qty)}{" "}
                              {normalizeUnitCode(supplier.purchase_pack_unit_code || "") || stockUnitCode})
                            </div>
                            <div>
                              Precio: {formatMoney(supplier.purchase_price_net ?? supplier.purchase_price)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p>No hay proveedor primario configurado.</p>
            )}
            <p>
              <strong className="text-[var(--ui-text)]">Costo actual inventario:</strong>{" "}
              {product.cost == null ? "-" : `${formatUnitMoney(product.cost)} / ${stockUnitCode}`}
            </p>
            {isAsset ? (
              <p className="text-xs">
                Activo: no entra en flujo de compra operativa de insumos/remisiones.
              </p>
            ) : null}
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="ui-panel">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[var(--ui-text)]">
              Trazabilidad ORIGO · Órdenes de compra
            </div>
            <div className="ui-caption">
              {purchaseTraceRows.length} orden(es) · {formatQty(orderedTotal)} {stockUnitCode}
            </div>
          </div>
          {purchaseTraceRows.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ui-muted)]">
              Sin órdenes de compra recientes para este producto.
            </p>
          ) : (
            <div className="mt-3 overflow-auto rounded-xl border border-[var(--ui-border)]">
              <table className="ui-table min-w-[620px] text-sm">
                <thead>
                  <tr>
                    <th className="py-2 pr-4">Orden</th>
                    <th className="py-2 pr-4">Proveedor</th>
                    <th className="py-2 pr-4">Fecha</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseTraceRows.map((row) => (
                    <tr key={row.key} className="border-t border-zinc-200/60">
                      <td className="py-2.5 pr-4">{row.orderNo}</td>
                      <td className="py-2.5 pr-4">{row.supplierName}</td>
                      <td className="py-2.5 pr-4">{formatDate(row.date)}</td>
                      <td className="py-2.5 pr-4">{row.status}</td>
                      <td className="py-2.5 pr-4">
                        {formatQty(row.qty)} {stockUnitCode}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="ui-panel">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[var(--ui-text)]">
              Trazabilidad ORIGO · Recepciones
            </div>
            <div className="ui-caption">
              {receiptTraceRows.length} recepción(es) · {formatQty(receivedTotal)} {stockUnitCode}
            </div>
          </div>
          {receiptTraceRows.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ui-muted)]">
              Sin remisiones/recepciones recientes para este producto.
            </p>
          ) : (
            <div className="mt-3 overflow-auto rounded-xl border border-[var(--ui-border)]">
              <table className="ui-table min-w-[620px] text-sm">
                <thead>
                  <tr>
                    <th className="py-2 pr-4">Recepción</th>
                    <th className="py-2 pr-4">Sede</th>
                    <th className="py-2 pr-4">Fecha</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Cantidad base</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptTraceRows.map((row) => (
                    <tr key={row.key} className="border-t border-zinc-200/60">
                      <td className="py-2.5 pr-4">{row.receiptNo}</td>
                      <td className="py-2.5 pr-4">{row.siteName}</td>
                      <td className="py-2.5 pr-4">{formatDate(row.date)}</td>
                      <td className="py-2.5 pr-4">{row.status}</td>
                      <td className="py-2.5 pr-4">
                        {formatQty(row.qtyBase)} {stockUnitCode}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>

      <article className="ui-panel">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[var(--ui-text)]">Stock por sede</div>
          <div className="ui-caption">{sheetRows.length} sede(s)</div>
        </div>
        <div className="mt-3 overflow-auto rounded-xl border border-[var(--ui-border)]">
          <table className="ui-table min-w-[760px] text-sm">
            <thead>
              <tr>
                <th className="py-2 pr-4">Sede</th>
                <th className="py-2 pr-4">Stock</th>
                <th className="py-2 pr-4">Mínimo</th>
                <th className="py-2 pr-4">Faltante</th>
                <th className="py-2 pr-4">Estado</th>
              </tr>
            </thead>
            <tbody>
              {sheetRows.map((row) => (
                <tr key={row.siteId} className="border-t border-zinc-200/60">
                  <td className="py-2.5 pr-4">{row.siteName}</td>
                  <td className="py-2.5 pr-4">
                    {formatQty(row.qty)} {stockUnitCode}
                  </td>
                  <td className="py-2.5 pr-4">
                    {row.minStock != null ? `${formatQty(row.minStock)} ${stockUnitCode}` : "-"}
                  </td>
                  <td className="py-2.5 pr-4">
                    {row.shortage != null ? `${formatQty(row.shortage)} ${stockUnitCode}` : "-"}
                  </td>
                  <td className="py-2.5 pr-4">
                    {!row.configured ? (
                      <span className="ui-chip">Con stock sin config</span>
                    ) : !row.enabled ? (
                      <span className="ui-chip">Sin operación activa</span>
                    ) : row.shortage != null && row.shortage > 0 ? (
                      <span className="ui-chip ui-chip--warn">Bajo mínimo</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        <span className="ui-chip ui-chip--success">OK</span>
                        {row.inventoryEnabled ? <span className="ui-chip">Inventario</span> : null}
                        {row.localProductionEnabled ? <span className="ui-chip">Produce</span> : null}
                        {row.remissionEnabled ? <span className="ui-chip">Remisión</span> : null}
                        {row.salesEnabled ? <span className="ui-chip">Venta</span> : null}
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {sheetRows.length === 0 ? (
                <tr>
                  <td className="py-4 text-sm text-[var(--ui-muted)]" colSpan={5}>
                    Este producto no tiene sedes activas, stock visible ni configuración operativa asociada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
        </>
      ) : null}
    </div>
  );
}
