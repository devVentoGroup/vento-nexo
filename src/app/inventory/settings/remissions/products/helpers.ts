import { normalizeUnitCode } from "@/lib/inventory/uom";
import { createClient } from "@/lib/supabase/server";

const PAGE_PATH = "/inventory/settings/remissions/products";

export type SiteRow = {
  id: string;
  name: string | null;
};

export type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  product_type: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  is_active: boolean | null;
  product_inventory_profiles?:
    | {
        measurement_mode?: string | null;
        inventory_kind?: string | null;
      }
    | Array<{
        measurement_mode?: string | null;
        inventory_kind?: string | null;
      }>
    | null;
};

export type ProductSiteSettingRow = {
  id: string;
  product_id: string | null;
  site_id: string | null;
  is_active: boolean | null;
  default_area_kind: string | null;
  area_kinds: string[] | null;
  remission_enabled: boolean | null;
  local_production_enabled: boolean | null;
  production_location_id: string | null;
  sales_enabled: boolean | null;
  inventory_enabled: boolean | null;
  min_stock_qty: number | null;
  remission_category_id?: string | null;
};

export type UomProfileRow = {
  product_id: string | null;
  is_active: boolean | null;
  qty_in_stock_unit: number | null;
};

export type LocationRow = {
  id: string;
  site_id: string | null;
  is_active: boolean | null;
  code?: string | null;
  zone?: string | null;
  aisle?: string | null;
  level?: string | null;
  description?: string | null;
  area_id?: string | null;
};

export type AreaRuleRow = {
  site_id: string | null;
  area_kind: string | null;
  is_enabled: boolean | null;
};

export type RemissionCategoryRow = {
  id: string;
  site_id: string | null;
  area_kind: string | null;
  name: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

export type ProductSiteAreaRemissionCategoryRow = {
  product_id: string | null;
  site_id: string | null;
  area_kind: string | null;
  remission_category_id: string | null;
};

export type ProductSiteProductionRouteRow = {
  id: string;
  product_id: string | null;
  site_id: string | null;
  area_kind: string | null;
  input_location_id: string | null;
  output_mode: string | null;
  output_location_id: string | null;
  output_position_id: string | null;
  is_default: boolean | null;
  is_active: boolean | null;
};

export type BulkProfile =
  | "input_from_origin"
  | "sellable_from_origin"
  | "preparation_from_origin"
  | "available_not_remission"
  | "disable_remission";

export type ProductDiagnostics = {
  status: "ready" | "configured" | "blocked" | "warning";
  label: string;
  issues: string[];
  canApply: boolean;
};

export function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAreaKind(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

export function areaKindLabel(value: string | null | undefined) {
  const normalized = normalizeAreaKind(value);
  if (normalized === "cocina") return "Cocina";
  if (normalized === "barra") return "Barra";
  if (normalized === "mostrador") return "Mostrador";
  if (normalized === "salon") return "Salón";
  if (normalized === "recepcion") return "Recepción";
  if (normalized === "reposteria") return "Repostería";
  if (normalized === "panaderia") return "Panadería";
  return normalized
    ? normalized
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "";
}

export function locationLabel(location: LocationRow) {
  const parts = [location.code, location.zone, location.aisle, location.level]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  if (parts.length > 0) return parts.join(" · ");

  const description = String(location.description ?? "").trim();
  return description || location.id;
}

export function settingAreaKinds(setting: ProductSiteSettingRow | undefined) {
  return Array.from(
    new Set(
      (setting?.area_kinds ?? [])
        .map((value) => normalizeAreaKind(value))
        .filter(Boolean)
    )
  );
}

export function isSettingEnabledForArea(
  setting: ProductSiteSettingRow | undefined,
  areaKind: string
) {
  if (!setting?.remission_enabled) return false;
  if (!areaKind) return true;
  const areaKinds = settingAreaKinds(setting);
  return areaKinds.length === 0 || areaKinds.includes(areaKind);
}

export function isBulkProfile(value: string): value is BulkProfile {
  return [
    "input_from_origin",
    "sellable_from_origin",
    "preparation_from_origin",
    "available_not_remission",
    "disable_remission",
  ].includes(value);
}

export function profileLabel(value: BulkProfile) {
  switch (value) {
    case "input_from_origin":
      return "Insumo remitible desde origen";
    case "sellable_from_origin":
      return "Producto vendible remitido desde origen";
    case "preparation_from_origin":
      return "Preparación remitida desde origen";
    case "available_not_remission":
      return "Solo disponible, no remitible";
    case "disable_remission":
      return "Desactivar remisión";
  }
}

export function profileHelp(value: BulkProfile) {
  switch (value) {
    case "input_from_origin":
      return "Muestra solo insumos. Los deja disponibles y remitibles hacia la sede destino, sin venta y sin producción local.";
    case "sellable_from_origin":
      return "Muestra solo productos vendibles/reventa. Los deja disponibles, remitibles y vendibles en la sede destino, sin producción local.";
    case "preparation_from_origin":
      return "Muestra solo preparaciones. Las deja disponibles y remitibles hacia la sede destino, sin producción local.";
    case "available_not_remission":
      return "Muestra insumos, preparaciones y productos vendibles. Los deja disponibles en la sede, pero fuera de solicitudes de remisión.";
    case "disable_remission":
      return "Muestra productos configurados como remitibles en esta sede. Solo apaga la remisión y conserva la configuración existente.";
  }
}

export function normalizeCatalogToken(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeProductType(value: string | null | undefined) {
  const normalized = normalizeCatalogToken(value);
  if (["preparacion", "preparation"].includes(normalized)) return "preparacion";
  if (["venta", "sellable", "product", "producto"].includes(normalized)) return "venta";
  if (["reventa", "resale"].includes(normalized)) return "reventa";
  if (["activo", "asset", "equipo", "equipment", "modelo_patrimonial", "modelo patrimonial"].includes(normalized)) {
    return "asset";
  }
  return normalized || "insumo";
}

export function productTypeLabel(value: string | null | undefined) {
  const normalized = normalizeProductType(value);
  if (normalized === "preparacion") return "Preparación";
  if (normalized === "venta") return "Venta";
  if (normalized === "reventa") return "Reventa";
  if (normalized === "asset") return "Modelo patrimonial";
  return "Insumo";
}

export type MeasurementMode =
  | "fixed_presentation"
  | "variable_weight"
  | "count_with_weight"
  | "bulk_volume";

export function normalizeMeasurementMode(value: string | null | undefined): MeasurementMode {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "variable_weight") return "variable_weight";
  if (normalized === "count_with_weight") return "count_with_weight";
  if (normalized === "bulk_volume") return "bulk_volume";

  return "fixed_presentation";
}

export function productMeasurementMode(product: ProductRow): MeasurementMode {
  return normalizeMeasurementMode(getProductInventoryProfile(product)?.measurement_mode);
}

export function getProductInventoryProfile(product: ProductRow) {
  const profile = product.product_inventory_profiles;
  return Array.isArray(profile) ? profile[0] ?? null : profile ?? null;
}

export function isResaleInventoryKind(value: string | null | undefined) {
  const normalized = normalizeCatalogToken(value);
  return ["resale", "reventa", "retail", "finished_good_resale"].includes(normalized);
}

export function isManualRemissionPresentationProduct(product: ProductRow) {
  const productType = normalizeProductType(product.product_type);
  const inventoryKind = getProductInventoryProfile(product)?.inventory_kind;

  return (
    productType === "insumo" ||
    productType === "reventa" ||
    (productType === "venta" && isResaleInventoryKind(inventoryKind))
  );
}

export function requiresRemissionProfile(product: ProductRow) {
  return (
    productMeasurementMode(product) === "fixed_presentation" &&
    isManualRemissionPresentationProduct(product)
  );
}

export function measurementModeNote(value: MeasurementMode) {
  if (value === "variable_weight") return "Solicita por cantidad real";
  if (value === "count_with_weight") return "Solicita por conteo y peso real";
  if (value === "bulk_volume") return "Solicita por cantidad real";
  return "";
}

export const PROFILE_ALLOWED_PRODUCT_TYPES: Record<BulkProfile, string[]> = {
  input_from_origin: ["insumo"],
  sellable_from_origin: ["venta", "reventa"],
  preparation_from_origin: ["preparacion"],
  available_not_remission: ["insumo", "preparacion", "venta", "reventa"],
  disable_remission: ["insumo", "preparacion", "venta", "reventa"],
};

export const PRODUCT_TYPE_OPTIONS = [
  { value: "insumo", label: "Insumo" },
  { value: "preparacion", label: "Preparación" },
  { value: "venta", label: "Venta" },
  { value: "reventa", label: "Reventa" },
];

export function profileTypeOptions(profile: BulkProfile) {
  const allowedTypes = new Set(PROFILE_ALLOWED_PRODUCT_TYPES[profile]);
  return PRODUCT_TYPE_OPTIONS.filter((option) => allowedTypes.has(option.value));
}

export function isAssetLikeProduct(product: ProductRow) {
  const productType = normalizeProductType(product.product_type);
  const inventoryKind = normalizeCatalogToken(getProductInventoryProfile(product)?.inventory_kind);
  const sku = normalizeCatalogToken(product.sku);

  return (
    productType === "asset" ||
    ["asset", "assets", "activo", "activos", "equipment", "equipo", "equipos", "fixed_asset", "fixed asset"].includes(
      inventoryKind
    ) ||
    sku.startsWith("eqp-")
  );
}

export function profileAllowsProduct(params: {
  product: ProductRow;
  setting?: ProductSiteSettingRow;
  profile: BulkProfile;
}) {
  if (isAssetLikeProduct(params.product)) return false;

  const productType = normalizeProductType(params.product.product_type);
  if (!PROFILE_ALLOWED_PRODUCT_TYPES[params.profile].includes(productType)) return false;

  if (params.profile === "disable_remission") {
    return params.setting?.remission_enabled === true;
  }

  return true;
}

export function measurementModeLabel(value: string | null | undefined) {
  const normalized = normalizeMeasurementMode(value);
  if (normalized === "variable_weight") return "Peso variable";
  if (normalized === "count_with_weight") return "Conteo + peso";
  if (normalized === "bulk_volume") return "Granel";
  return "Presentación fija";
}

export function buildRedirect(params: URLSearchParams) {
  const query = params.toString();
  return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
}

export const SUPABASE_PAGE_SIZE = 1000;

export async function loadAllActiveProducts(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ProductRow[]> {
  const rows: ProductRow[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("products")
      .select("id,name,sku,product_type,unit,stock_unit_code,is_active,product_inventory_profiles(measurement_mode,inventory_kind)")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);

    const batch = (data ?? []) as ProductRow[];
    rows.push(...batch);

    if (batch.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

export async function loadAllProductSiteSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  siteId: string
): Promise<ProductSiteSettingRow[]> {
  const rows: ProductSiteSettingRow[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("product_site_settings")
      .select("id,product_id,site_id,is_active,default_area_kind,area_kinds,remission_enabled,local_production_enabled,production_location_id,sales_enabled,inventory_enabled,min_stock_qty,remission_category_id")
      .eq("site_id", siteId)
      .range(from, to);

    if (error) throw new Error(error.message);

    const batch = (data ?? []) as ProductSiteSettingRow[];
    rows.push(...batch);

    if (batch.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

export async function loadAllActiveRemissionUomProfiles(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<UomProfileRow[]> {
  const rows: UomProfileRow[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("product_uom_profiles")
      .select("product_id,is_active,qty_in_stock_unit")
      .eq("usage_context", "remission")
      .eq("is_active", true)
      .range(from, to);

    if (error) throw new Error(error.message);

    const batch = (data ?? []) as UomProfileRow[];
    rows.push(...batch);

    if (batch.length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

export function diagnoseProduct(params: {
  product: ProductRow;
  setting?: ProductSiteSettingRow;
  hasRemissionProfile: boolean;
  hasOriginLocation: boolean;
  selectedAreaKind: string;
  profile: BulkProfile;
}): ProductDiagnostics {
  const blockingIssues: string[] = [];
  const notes: string[] = [];
  const stockUnit = normalizeUnitCode(params.product.stock_unit_code || params.product.unit || "");
  const measurementMode = productMeasurementMode(params.product);
  const note = measurementModeNote(measurementMode);
  const disablesRemission =
    params.profile === "available_not_remission" || params.profile === "disable_remission";

  if (note) notes.push(note);
  if (params.product.is_active === false) blockingIssues.push("Producto inactivo");
  if (!stockUnit) blockingIssues.push("Falta unidad base");
  if (!disablesRemission && requiresRemissionProfile(params.product) && !params.hasRemissionProfile) {
    blockingIssues.push("Falta presentación de remisión");
  }
  if (!disablesRemission && !params.hasOriginLocation) blockingIssues.push("Falta LOC origen");
  if (params.setting?.local_production_enabled === true && !disablesRemission) {
    blockingIssues.push("Tiene producción local marcada");
  }

  if (blockingIssues.length > 0) {
    return {
      status: "blocked",
      label: "Bloqueado",
      issues: [...blockingIssues, ...notes],
      canApply: disablesRemission,
    };
  }

  if (params.setting?.is_active === true && params.setting.remission_enabled === true) {
    if (params.selectedAreaKind && !isSettingEnabledForArea(params.setting, params.selectedAreaKind)) {
      return {
        status: "ready",
        label: "Puede configurarse",
        issues: ["Remitible en otra área", ...notes],
        canApply: true,
      };
    }

    return {
      status: "configured",
      label: "Listo",
      issues: [params.selectedAreaKind ? "Ya está remitible en esta área" : "Ya está remitible", ...notes],
      canApply: true,
    };
  }

  return {
    status: "ready",
    label: "Puede configurarse",
    issues: notes.length ? notes : ["Completo para aplicar"],
    canApply: true,
  };
}
