import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import {
  getSiteCapabilitiesMap,
  type SiteOperationalCapabilities,
} from "@/lib/inventory/site-capabilities";
import { normalizeUnitCode } from "@/lib/inventory/uom";
import { safeDecodeURIComponent } from "@/lib/url";
import { RemissionCategoriesManager } from "./remission-categories-manager";
import {
  RemissionProductsClientTable,
  type RemissionProductsClientRow,
} from "./remission-products-client-table";
import {
  archiveRemissionCategory,
  createRemissionCategory,
  deleteEmptyRemissionCategory,
  mergeRemissionCategory,
  saveBulkProductConfiguration,
  updateRemissionCategory,
} from "./actions";
import {
  areaKindLabel,
  diagnoseProduct,
  isBulkProfile,
  loadAllActiveProducts,
  loadAllActiveRemissionUomProfiles,
  loadAllProductSiteSettings,
  locationLabel,
  measurementModeLabel,
  normalizeAreaKind,
  normalizeCatalogToken,
  normalizeProductType,
  productMeasurementMode,
  productTypeLabel,
  profileAllowsProduct,
  profileHelp,
  profileLabel,
  profileTypeOptions,
  isSettingEnabledForArea,
  settingAreaKinds,
  type AreaRuleRow,
  type BulkProfile,
  type LocationRow,
  type ProductRow,
  type ProductSiteAreaRemissionCategoryRow,
  type ProductSiteProductionRouteRow,
  type ProductSiteSettingRow,
  type RemissionCategoryRow,
  type SiteRow,
  type UomProfileRow,
} from "./helpers";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PAGE_PATH = "/inventory/settings/remissions/products";

type OriginAreaRow = {
  id: string;
  kind: string | null;
  name: string | null;
};

function normalizeLooseToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isProductionAreaKind(kind: unknown) {
  const normalized = normalizeLooseToken(kind);
  if (!normalized) return false;
  return !["bodega", "almacen", "almacenamiento", "storage"].includes(normalized);
}

function isProductionLocation(location: LocationRow) {
  const normalizedType = normalizeLooseToken(
    (location as LocationRow & { location_type?: string | null }).location_type
  );
  if (!normalizedType) return true;
  return ["production", "produccion", "prod"].includes(normalizedType);
}


export default async function RemissionProductsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    destination_site_id?: string;
    origin_site_id?: string;
    bulk_profile?: string;
    area_kind?: string;
    q?: string;
    type?: string;
    measurement?: string;
    status?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: PAGE_PATH,
  });

  const { data: emp } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = String((emp as { role?: string } | null)?.role ?? "").toLowerCase();
  const canManage = ["propietario", "gerente_general"].includes(role);

  const [{ data: sitesData }, productsData] = await Promise.all([
    supabase
      .from("sites")
      .select("id,name,operational_visibility")
      .eq("is_active", true)
      .eq("operational_visibility", "operational")
      .order("name", { ascending: true }),
    loadAllActiveProducts(supabase),
  ]);

  const sites = (sitesData ?? []) as SiteRow[];
  const siteIds = sites.map((site) => site.id);
  const { data: capabilityRows } = siteIds.length
    ? await supabase
      .from("site_operational_capabilities")
      .select("site_id,can_request_remissions,can_fulfill_remissions,can_receive_remissions,can_sell,can_produce,can_hold_inventory,is_commercial_business,show_in_product_setup")
      .in("site_id", siteIds)
    : { data: [] as SiteOperationalCapabilities[] };
  const capabilitiesBySite = getSiteCapabilitiesMap(
    siteIds,
    (capabilityRows ?? []) as SiteOperationalCapabilities[]
  );
  const destinationSites = sites.filter((site) => {
    const capabilities = capabilitiesBySite.get(site.id);
    return Boolean(capabilities?.can_request_remissions || capabilities?.can_receive_remissions);
  });
  const originSites = sites.filter((site) => {
    const capabilities = capabilitiesBySite.get(site.id);
    return Boolean(capabilities?.can_fulfill_remissions);
  });

  const destinationSiteId =
    String(sp.destination_site_id ?? "").trim() || destinationSites[0]?.id || "";
  const originSiteId = String(sp.origin_site_id ?? "").trim() || originSites[0]?.id || "";
  const bulkProfile = isBulkProfile(String(sp.bulk_profile ?? ""))
    ? (sp.bulk_profile as BulkProfile)
    : "input_from_origin";
  const requestedAreaKind = normalizeAreaKind(String(sp.area_kind ?? ""));

  const [
    settingsData,
    profilesData,
    { data: locationsData },
    { data: originAreasData },
    { data: areaRulesData },
    { data: remissionCategoriesData },
    { data: areaCategoryData },
  ] = await Promise.all([
    destinationSiteId
      ? loadAllProductSiteSettings(supabase, destinationSiteId)
      : Promise.resolve([] as ProductSiteSettingRow[]),
    loadAllActiveRemissionUomProfiles(supabase),
    originSiteId
      ? supabase
        .from("inventory_locations")
        .select("id,site_id,is_active,code,zone,aisle,level,description,area_id")
        .eq("site_id", originSiteId)
        .eq("is_active", true)
        .order("code", { ascending: true })
      : { data: [] as LocationRow[] },
    originSiteId
      ? supabase
        .from("areas")
        .select("id,kind,name")
        .eq("site_id", originSiteId)
        .eq("is_active", true)
        .order("name", { ascending: true })
      : { data: [] as OriginAreaRow[] },
    destinationSiteId
      ? supabase
        .from("site_area_purpose_rules")
        .select("site_id,area_kind,is_enabled")
        .eq("site_id", destinationSiteId)
        .eq("purpose", "remission")
        .eq("is_enabled", true)
      : { data: [] as AreaRuleRow[] },
    destinationSiteId
      ? supabase
        .from("remission_product_categories")
        .select("id,site_id,area_kind,name,sort_order,is_active")
        .eq("site_id", destinationSiteId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
      : { data: [] as RemissionCategoryRow[] },
    destinationSiteId
      ? supabase
        .from("product_site_area_remission_categories")
        .select("product_id,site_id,area_kind,remission_category_id")
        .eq("site_id", destinationSiteId)
      : { data: [] as ProductSiteAreaRemissionCategoryRow[] },
  ]);

  const settingsByProduct = new Map(
    ((settingsData ?? []) as ProductSiteSettingRow[]).map((row) => [
      String(row.product_id ?? ""),
      row,
    ])
  );
  const remissionProfileProductIds = new Set(
    ((profilesData ?? []) as UomProfileRow[])
      .filter((profile) => Number(profile.qty_in_stock_unit ?? 0) > 0)
      .map((profile) => String(profile.product_id ?? "").trim())
      .filter(Boolean)
  );
  const originLocations = ((locationsData ?? []) as LocationRow[]).filter(
    (location) => location.is_active !== false
  );
  const productionOriginLocations = originLocations.filter((location) => {
    const areaId = String((location as LocationRow & { area_id?: string | null }).area_id ?? "").trim();
    return Boolean(areaId) && isProductionLocation(location);
  });
  const requesterAreaOptions = Array.from(
    new Set(
      ((areaRulesData ?? []) as AreaRuleRow[])
        .map((row) => normalizeAreaKind(row.area_kind))
        .filter(Boolean)
    )
  ).map((value) => ({ value, label: areaKindLabel(value) }));
  const selectedAreaKind =
    requestedAreaKind && requesterAreaOptions.some((option) => option.value === requestedAreaKind)
      ? requestedAreaKind
      : requesterAreaOptions[0]?.value ?? "";
  const selectedAreaLabel = areaKindLabel(selectedAreaKind);
  const productionAreaIds = new Set(
    productionOriginLocations
      .map((location) =>
        String((location as LocationRow & { area_id?: string | null }).area_id ?? "").trim()
      )
      .filter(Boolean)
  );
  const originAreaOptions = Array.from(
    new Map(
      ((originAreasData ?? []) as OriginAreaRow[])
        .map((area) => {
          const value = normalizeAreaKind(area.kind);
          const areaId = String(area.id ?? "").trim();
          if (!value || !areaId) return null;
          if (!isProductionAreaKind(value)) return null;
          if (!productionAreaIds.has(areaId)) return null;

          return [
            value,
            {
              value,
              id: areaId,
              label: area.name?.trim() || areaKindLabel(value),
            },
          ] as const;
        })
        .filter((entry): entry is readonly [string, { value: string; id: string; label: string }] => Boolean(entry))
    ).values()
  );
  const remissionCategories = ((remissionCategoriesData ?? []) as RemissionCategoryRow[])
    .filter((category) => {
      const categoryAreaKind = normalizeAreaKind(category.area_kind);
      return !selectedAreaKind || !categoryAreaKind || categoryAreaKind === selectedAreaKind;
    });
  const selectedAreaCategoryRows = ((areaCategoryData ?? []) as ProductSiteAreaRemissionCategoryRow[])
    .filter((row) => normalizeAreaKind(row.area_kind) === selectedAreaKind);

  const areaCategoryByProduct = new Map(
    selectedAreaCategoryRows.map((row) => [
      String(row.product_id ?? ""),
      String(row.remission_category_id ?? ""),
    ])
  );

  const categoryProductCountById = new Map<string, Set<string>>();
  const addCategoryProduct = (categoryId: string, productId: string) => {
    if (!categoryId || !productId) return;
    const current = categoryProductCountById.get(categoryId) ?? new Set<string>();
    current.add(productId);
    categoryProductCountById.set(categoryId, current);
  };

  for (const row of selectedAreaCategoryRows) {
    addCategoryProduct(
      String(row.remission_category_id ?? ""),
      String(row.product_id ?? "")
    );
  }

  for (const setting of (settingsData ?? []) as ProductSiteSettingRow[]) {
    const productId = String(setting.product_id ?? "");
    const categoryId = String(setting.remission_category_id ?? "");
    if (!productId || !categoryId || areaCategoryByProduct.has(productId)) continue;
    addCategoryProduct(categoryId, productId);
  }

  const allowedTypeOptions = profileTypeOptions(bulkProfile);

  const productCandidates = ((productsData ?? []) as ProductRow[])
    .map((product) => {
      const setting = settingsByProduct.get(product.id);
      const diagnostics = diagnoseProduct({
        product,
        setting,
        hasRemissionProfile: remissionProfileProductIds.has(product.id),
        hasOriginLocation: originLocations.length > 0,
        selectedAreaKind,
        profile: bulkProfile,
      });
      return { product, setting, diagnostics };
    })
    .filter(({ product, setting }) => profileAllowsProduct({ product, setting, profile: bulkProfile }));

  const productCandidateIds = productCandidates.map(({ product }) => product.id).filter(Boolean);
  const { data: originRoutesData } =
    originSiteId && productCandidateIds.length > 0
      ? await supabase
        .from("product_site_production_routes")
        .select("id,product_id,site_id,area_kind,input_location_id,output_mode,output_location_id,output_position_id,is_default,is_active")
        .eq("site_id", originSiteId)
        .eq("is_default", true)
        .eq("is_active", true)
        .in("product_id", productCandidateIds)
      : { data: [] as ProductSiteProductionRouteRow[] };

  const originRouteByProduct = new Map(
    ((originRoutesData ?? []) as ProductSiteProductionRouteRow[])
      .filter((row) => String(row.product_id ?? "").trim())
      .map((row) => [String(row.product_id ?? "").trim(), row])
  );

  const productRows: RemissionProductsClientRow[] = productCandidates
    .map(({ product, setting, diagnostics }) => {
      const measurementMode = productMeasurementMode(product);
      const productType = normalizeProductType(product.product_type);
      const originRoute = originRouteByProduct.get(product.id) ?? null;
      const originRouteIsForRemission =
        originRoute?.output_mode === "inventory_stock" &&
        Boolean(originRoute.output_location_id);

      return {
        product: {
          id: product.id,
          name: product.name ?? "Sin nombre",
          sku: product.sku ?? "Sin SKU",
          productType,
          productTypeLabel: productTypeLabel(product.product_type),
          measurementMode,
          measurementLabel: measurementModeLabel(measurementMode),
          stockUnitLabel: normalizeUnitCode(product.stock_unit_code || product.unit || "") || "Sin unidad",
          searchText: normalizeCatalogToken(`${product.name ?? ""} ${product.sku ?? ""}`),
        },
        setting: {
          remissionCategoryId:
            areaCategoryByProduct.get(product.id) ?? setting?.remission_category_id ?? "",
          remissionEnabled: setting?.remission_enabled ?? false,
          areaKinds: settingAreaKinds(setting),
          isRemissionEnabledForSelectedArea: isSettingEnabledForArea(setting, selectedAreaKind),
          salesEnabled: setting?.sales_enabled ?? false,
          originRoute: originRoute
            ? {
              enabled: originRouteIsForRemission,
              areaKind: normalizeAreaKind(originRoute.area_kind),
              inputLocationId: String(originRoute.input_location_id ?? ""),
              outputLocationId: String(originRoute.output_location_id ?? ""),
            }
            : null,
        },
        diagnostics,
      };
    });

  const okMsg = sp.ok ? safeDecodeURIComponent(sp.ok) : "";
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Productos de remisión por sede</h1>
          <p className="mt-2 ui-body-muted">
            Configura muchos productos remitibles para una sede sin abrir cada ficha.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/settings/remissions" className="ui-btn ui-btn--ghost">
            Configuración
          </Link>
          <Link href="/inventory/settings/supply-routes" className="ui-btn ui-btn--ghost">
            Rutas
          </Link>
        </div>
      </div>

      {errorMsg ? <div className="mt-6 ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="mt-6 ui-panel">
        <form method="get" className="grid gap-3 lg:grid-cols-9">
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="ui-label">Sede destino</span>
            <select name="destination_site_id" defaultValue={destinationSiteId} className="ui-input">
              {destinationSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
          </label>
          {requesterAreaOptions.length > 0 ? (
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className="ui-label">Área solicitante</span>
              <select name="area_kind" defaultValue={selectedAreaKind} className="ui-input">
                {requesterAreaOptions.map((area) => (
                  <option key={area.value} value={area.value}>
                    {area.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="ui-label">Origen</span>
            <select name="origin_site_id" defaultValue={originSiteId} className="ui-input">
              {originSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="ui-label">Perfil</span>
            <select name="bulk_profile" defaultValue={bulkProfile} className="ui-input">
              <option value="input_from_origin">{profileLabel("input_from_origin")}</option>
              <option value="sellable_from_origin">{profileLabel("sellable_from_origin")}</option>
              <option value="preparation_from_origin">{profileLabel("preparation_from_origin")}</option>
              <option value="available_not_remission">{profileLabel("available_not_remission")}</option>
              <option value="disable_remission">{profileLabel("disable_remission")}</option>
            </select>
          </label>
          <div className="flex items-end">
            <button className="ui-btn ui-btn--brand w-full">Actualizar</button>
          </div>
        </form>
      </div>

      {!destinationSites.length || !originSites.length ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          Faltan capacidades operativas: debe existir una sede que solicite/reciba y una sede que despache remisiones.
        </div>
      ) : null}

      {destinationSiteId && ((areaRulesData ?? []) as AreaRuleRow[]).length === 0 ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          La sede destino no tiene áreas solicitantes configuradas para remisión.
        </div>
      ) : null}

      {originSiteId && originLocations.length === 0 ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          El origen seleccionado no tiene LOC activo. Los perfiles remitibles quedan bloqueados.
        </div>
      ) : null}

      {originSiteId && originAreaOptions.length === 0 ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          El origen seleccionado no tiene áreas operativas activas. La configuración masiva de ruta de producción queda deshabilitada.
        </div>
      ) : null}

      <RemissionCategoriesManager
        categories={remissionCategories.map((category) => ({
          id: category.id,
          name: category.name ?? "Sin nombre",
          sortOrder: category.sort_order ?? 0,
          productCount: categoryProductCountById.get(category.id)?.size ?? 0,
        }))}
        canManage={canManage}
        destinationSiteId={destinationSiteId}
        originSiteId={originSiteId}
        bulkProfile={bulkProfile}
        selectedAreaKind={selectedAreaKind}
        selectedAreaLabel={selectedAreaLabel}
        createAction={createRemissionCategory}
        updateAction={updateRemissionCategory}
        mergeAction={mergeRemissionCategory}
        archiveAction={archiveRemissionCategory}
        deleteAction={deleteEmptyRemissionCategory}
      />

      <RemissionProductsClientTable
        key={`${destinationSiteId}:${originSiteId}:${bulkProfile}:${selectedAreaKind}`}
        rows={productRows}
        remissionCategories={remissionCategories.map((category) => ({
          id: category.id,
          name: category.name ?? "Sin nombre",
        }))}
        allowedTypeOptions={allowedTypeOptions}
        originLocationOptions={productionOriginLocations.map((location) => ({
          id: location.id,
          areaId: String((location as LocationRow & { area_id?: string | null }).area_id ?? ""),
          label:
            String(location.description ?? "").trim() ||
            String(location.zone ?? "").trim() ||
            locationLabel(location),
        }))}
        originAreaOptions={originAreaOptions}
        canManage={canManage}
        destinationSiteId={destinationSiteId}
        originSiteId={originSiteId}
        bulkProfile={bulkProfile}
        selectedAreaKind={selectedAreaKind}
        selectedAreaLabel={selectedAreaLabel}
        profileLabel={profileLabel(bulkProfile)}
        profileHelp={profileHelp(bulkProfile)}
        saveAction={saveBulkProductConfiguration}
      />
    </div>
  );
}
