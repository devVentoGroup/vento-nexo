import {
  categoryKindFromProduct,
  type CategoryKind,
  type InventoryCategoryRow,
} from "@/lib/inventory/categories";
import type { createClient } from "@/lib/supabase/server";
import type { SiteOperationalCapabilities } from "@/lib/inventory/site-capabilities";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  convertQuantity,
  createUnitMap,
  inferFamilyFromUnitCode,
  normalizeUnitCode,
  type InventoryUnit,
} from "@/lib/inventory/uom";

const FOGO_BASE_URL =
  process.env.NEXT_PUBLIC_FOGO_URL?.replace(/\/$/, "") ||
  "https://fogo.ventogroup.co";

export type MeasurementMode =
  | "fixed_presentation"
  | "variable_weight"
  | "count_with_weight"
  | "bulk_volume";

export function normalizeMeasurementMode(value: string | null | undefined): MeasurementMode {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "variable_weight" ||
    raw === "count_with_weight" ||
    raw === "bulk_volume" ||
    raw === "fixed_presentation"
  ) {
    return raw;
  }
  return "fixed_presentation";
}

export function defaultToleranceForMeasurementMode(mode: MeasurementMode): number {
  if (mode === "fixed_presentation") return 0;
  if (mode === "bulk_volume") return 2;
  return 5;
}

export function clampTolerancePercent(value: number | null, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function sanitizeAuxCountUnitCode(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || "piezas";
}

export function measurementPolicyForMode(mode: MeasurementMode) {
  return {
    requires_actual_receipt_qty: mode !== "fixed_presentation",
    requires_actual_dispatch_qty: mode !== "fixed_presentation",
    requires_actual_production_qty: mode !== "fixed_presentation",
    requires_count_alongside_weight: mode === "count_with_weight",
    default_tolerance_percent: defaultToleranceForMeasurementMode(mode),
  };
}

export function buildFogoRecipeUrl(productId: string) {
  const url = new URL("/recipes/new", FOGO_BASE_URL);
  url.searchParams.set("product_id", productId);
  url.searchParams.set("source", "nexo");
  return url.toString();
}

export function buildOperationUnitHintFromUnits(params: {
  units: UnitRow[];
  inputUnitCode: string;
  stockUnitCode: string;
}) {
  const inputUnitCode = normalizeUnitCode(params.inputUnitCode || "");
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "");
  if (!inputUnitCode || !stockUnitCode) return null;
  try {
    const unitMap = createUnitMap(params.units);
    const { quantity } = convertQuantity({
      quantity: 1,
      fromUnitCode: inputUnitCode,
      toUnitCode: stockUnitCode,
      unitMap,
    });
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    const inputUnit = params.units.find((unit) => normalizeUnitCode(unit.code) === inputUnitCode);
    return {
      label: inputUnit?.name?.trim() || inputUnitCode.toUpperCase(),
      inputUnitCode,
      qtyInInputUnit: 1,
      qtyInStockUnit: quantity,
    };
  } catch {
    return null;
  }
}

export function buildRemissionFromDefaultUnit(params: {
  defaultUnitCode: string;
  stockUnitCode: string;
  unitMap: ReturnType<typeof createUnitMap>;
}):
  | {
    label: string;
    inputUnitCode: string;
    qtyInInputUnit: number;
    qtyInStockUnit: number;
    source: "manual";
  }
  | null {
  const inputUnitCode = normalizeUnitCode(params.defaultUnitCode || "");
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "");
  if (!inputUnitCode || !stockUnitCode) return null;
  try {
    const { quantity } = convertQuantity({
      quantity: 1,
      fromUnitCode: inputUnitCode,
      toUnitCode: stockUnitCode,
      unitMap: params.unitMap,
    });
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    return {
      label: "Unidad operativa",
      inputUnitCode,
      qtyInInputUnit: 1,
      qtyInStockUnit: quantity,
      source: "manual",
    };
  } catch {
    return null;
  }
}

export function buildRemissionFromRecipePortion(params: {
  recipe: RecipePortionRow | null;
  stockUnitCode: string;
  unitMap: ReturnType<typeof createUnitMap>;
}):
  | {
    label: string;
    inputUnitCode: string;
    qtyInInputUnit: number;
    qtyInStockUnit: number;
    source: "recipe_portion";
  }
  | null {
  const recipe = params.recipe;
  if (!recipe) return null;

  const status = String(recipe.status ?? "").trim().toLowerCase();
  const isActive = recipe.is_active !== false;
  const explicitPortionSize = Number(recipe.portion_size ?? 0);
  const yieldQty = Number(recipe.yield_qty ?? 0);
  const portionSize =
    Number.isFinite(explicitPortionSize) && explicitPortionSize > 0
      ? explicitPortionSize
      : yieldQty;
  const portionUnitCode = normalizeUnitCode(recipe.portion_unit || recipe.yield_unit || "");
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "");
  const isStockCountUnit = ["un", "und", "unidad", "unit"].includes(stockUnitCode);

  if (
    status !== "published" ||
    !isActive ||
    !Number.isFinite(portionSize) ||
    portionSize <= 0 ||
    !portionUnitCode ||
    !stockUnitCode
  ) {
    return null;
  }

  try {
    const { quantity } = convertQuantity({
      quantity: portionSize,
      fromUnitCode: portionUnitCode,
      toUnitCode: stockUnitCode,
      unitMap: params.unitMap,
    });
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    return {
      label:
        Number.isFinite(explicitPortionSize) && explicitPortionSize > 0
          ? "Porción de receta"
          : "Rendimiento de receta",
      inputUnitCode: portionUnitCode,
      qtyInInputUnit: 1,
      qtyInStockUnit: quantity,
      source: "recipe_portion",
    };
  } catch {
    if (!isStockCountUnit) return null;
    return {
      label: "Porción de receta",
      inputUnitCode: stockUnitCode,
      qtyInInputUnit: 1,
      qtyInStockUnit: 1,
      source: "recipe_portion",
    };
  }
}

export type ProductRow = {
  id: string;
  name: string | null;
  description: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_type: string | null;
  category_id: string | null;
  price: number | null;
  cost: number | null;
  is_active: boolean | null;
};

export type InventoryProfileRow = {
  product_id: string;
  track_inventory: boolean;
  inventory_kind: string;
  default_unit: string | null;
  unit_family: string | null;
  costing_mode: "auto_primary_supplier" | "manual" | null;
  lot_tracking: boolean;
  expiry_tracking: boolean;
  measurement_mode?: MeasurementMode | string | null;
  default_tolerance_percent?: number | null;
  aux_count_unit_code?: string | null;
  requires_actual_receipt_qty?: boolean | null;
  requires_actual_dispatch_qty?: boolean | null;
  requires_actual_production_qty?: boolean | null;
  requires_count_alongside_weight?: boolean | null;
};

export type CategoryRow = InventoryCategoryRow;

export type SiteSettingRow = {
  id?: string;
  site_id: string;
  is_active: boolean | null;
  default_area_kind: string | null;
  area_kinds?: string[] | null;
  production_location_id?: string | null;
  local_production_enabled?: boolean | null;
  min_stock_qty: number | null;
  min_stock_input_mode?: "base" | "purchase" | null;
  min_stock_purchase_qty?: number | null;
  min_stock_purchase_unit_code?: string | null;
  min_stock_purchase_to_base_factor?: number | null;
  audience: "SAUDO" | "VCF" | "BOTH" | "INTERNAL" | null;
  remission_enabled?: boolean | null;
  sales_enabled?: boolean | null;
  sites?: { id: string; name: string | null } | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type AreaKindRow = { code: string; name: string | null; use_for_remission?: boolean | null };
export type SiteAreaKindRow = { site_id: string | null; kind: string | null; is_active?: boolean | null };
export type SiteOptionRow = { id: string; name: string | null; site_type: string | null };
export type SiteCapabilityRow = SiteOperationalCapabilities;
export type ProductionLocationRow = {
  id: string;
  site_id: string;
  code: string;
  zone: string | null;
  location_type: string | null;
  area?: { kind: string | null } | { kind: string | null }[] | null;
};
export type ProductionRouteRow = {
  id?: string;
  site_id: string | null;
  area_kind: string | null;
  input_location_id: string | null;
  output_mode: "inventory_stock" | "sellable_stock" | "order_fulfillment" | string | null;
  output_location_id: string | null;
  is_active: boolean | null;
};
export type SiteAreaPurposeRuleRow = {
  site_id: string | null;
  area_kind: string | null;
  purpose: string | null;
  is_enabled: boolean | null;
};
export type UnitRow = InventoryUnit;

export type SupplierRow = {
  id: string;
  supplier_id: string;
  supplier_sku: string | null;
  supplier_product_alias: string | null;
  purchase_unit: string | null;
  purchase_unit_size: number | null;
  purchase_pack_qty: number | null;
  purchase_pack_unit_code: string | null;
  purchase_price: number | null;
  purchase_price_net: number | null;
  purchase_price_includes_tax: boolean | null;
  purchase_tax_rate: number | null;
  purchase_price_includes_icui: boolean | null;
  purchase_icui_rate: number | null;
  currency: string | null;
  lead_time_days: number | null;
  min_order_qty: number | null;
  is_primary: boolean;
};

export type ProductUomProfileRow = {
  id: string;
  product_id: string;
  label: string;
  input_unit_code: string;
  qty_in_input_unit: number;
  qty_in_stock_unit: number;
  is_default: boolean;
  is_active: boolean;
  source: "manual" | "supplier_primary" | "recipe_portion";
  usage_context: "general" | "purchase" | "remission" | null;
};

export type RecipePortionRow = {
  id: string;
  product_id: string;
  yield_qty: number | null;
  yield_unit: string | null;
  portion_size: number | null;
  portion_unit: string | null;
  status: string | null;
  is_active: boolean | null;
  updated_at?: string | null;
};

export type AssetProfileRow = {
  product_id: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  physical_location: string | null;
  purchase_invoice_url: string | null;
  commercial_value: number | null;
  purchase_date: string | null;
  started_use_date: string | null;
  equipment_status: string | null;
  maintenance_service_provider: string | null;
  technical_description: string | null;
  maintenance_cycle_enabled: boolean | null;
  maintenance_cycle_months: number | null;
  maintenance_cycle_anchor_date: string | null;
};

export type AssetMaintenanceLine = {
  id?: string;
  scheduled_date?: string;
  performed_date?: string;
  responsible?: string;
  maintenance_provider?: string;
  work_done?: string;
  parts_replaced?: boolean;
  replaced_parts?: string;
  planner_bucket?: string;
  _delete?: boolean;
};

export type AssetTransferLine = {
  id?: string;
  moved_at?: string;
  from_location?: string;
  to_location?: string;
  responsible?: string;
  notes?: string;
  _delete?: boolean;
};

export type SearchParams = {
  ok?: string;
  error?: string;
  from?: string;
  category_scope?: string;
  category_site_id?: string;
  category_domain?: string;
};

export function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function asNullableNumber(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  const raw = typeof value === "string" ? value.trim() : String(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function asNullableDateText(value: string | undefined): string | null {
  const raw = String(value ?? "").trim();
  return raw || null;
}

export function parseJsonArray<T>(rawValue: FormDataEntryValue | null): T[] {
  const raw = asText(rawValue);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function resolveNetPurchasePrice(params: {
  purchasePrice: number | null;
  purchasePriceIncludesTax: boolean;
  purchaseTaxRate: number;
  purchasePriceIncludesIcui?: boolean;
  purchaseIcuiRate?: number;
}): number | null {
  const gross = Number(params.purchasePrice ?? 0);
  if (!Number.isFinite(gross) || gross <= 0) return null;
  const includesTax = Boolean(params.purchasePriceIncludesTax);
  const includesIcui = Boolean(params.purchasePriceIncludesIcui);
  if (!includesTax && !includesIcui) return gross;
  const safeTaxRate = Number.isFinite(params.purchaseTaxRate) && params.purchaseTaxRate >= 0
    ? params.purchaseTaxRate
    : 0;
  const safeIcuiRate =
    Number.isFinite(Number(params.purchaseIcuiRate ?? 0)) && Number(params.purchaseIcuiRate ?? 0) >= 0
      ? Number(params.purchaseIcuiRate ?? 0)
      : 0;
  const totalRate = (includesTax ? safeTaxRate : 0) + (includesIcui ? safeIcuiRate : 0);
  const divisor = 1 + totalRate / 100;
  if (!Number.isFinite(divisor) || divisor <= 0) return gross;
  return gross / divisor;
}

export type CatalogTab = "insumos" | "preparaciones" | "productos" | "equipos";

export function sanitizeCatalogReturnPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/inventory/catalog")) return "";

  const [pathname, qs] = trimmed.split("?", 2);
  const params = new URLSearchParams(qs ?? "");
  params.delete("ok");
  params.delete("error");

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function decodeCatalogReturnParam(value: string | undefined): string {
  if (!value) return "";
  try {
    return sanitizeCatalogReturnPath(safeDecodeURIComponent(value));
  } catch {
    return "";
  }
}

export function appendQueryParam(path: string, key: string, value: string): string {
  const [pathname, qs] = path.split("?", 2);
  const params = new URLSearchParams(qs ?? "");
  params.set(key, value);

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function resolveCatalogTab(productTypeRaw: string, inventoryKindRaw: string): CatalogTab {
  const productType = productTypeRaw.trim().toLowerCase();
  const inventoryKind = inventoryKindRaw.trim().toLowerCase();
  if (inventoryKind === "asset") return "equipos";
  if (productType === "preparacion") return "preparaciones";
  if (productType === "venta") return "productos";
  return "insumos";
}

export function resolveLockedInventoryKind(productTypeRaw: string, inventoryKindRaw: string): string {
  const productType = String(productTypeRaw ?? "").trim().toLowerCase();
  const inventoryKind = String(inventoryKindRaw ?? "").trim().toLowerCase();
  if (productType === "preparacion") return "finished";
  if (productType === "venta") return inventoryKind === "resale" ? "resale" : "finished";
  if (productType === "insumo") return inventoryKind === "asset" ? "asset" : "ingredient";
  return inventoryKind || "unclassified";
}

export function inventoryKindLabel(kindRaw: string): string {
  const kind = String(kindRaw ?? "").trim().toLowerCase();
  if (kind === "ingredient") return "Insumo";
  if (kind === "finished") return "Producto terminado";
  if (kind === "resale") return "Reventa";
  if (kind === "packaging") return "Empaque";
  if (kind === "asset") return "Activo";
  return "Sin clasificar";
}

export function uomUsageContextLabel(value: string | null | undefined): string {
  const context = String(value ?? "general").trim().toLowerCase();
  if (context === "purchase") return "Compra";
  if (context === "remission") return "Operación";
  return "General";
}

export function siteSettingRowRank(row: SiteSettingRow): number {
  const activeScore = row.is_active === false ? 0 : 2;
  const minScore = row.min_stock_qty == null ? 0 : 1;
  return activeScore + minScore;
}

export function siteSettingTs(row: SiteSettingRow): number {
  const updatedTs = new Date(String(row.updated_at ?? "")).getTime();
  if (Number.isFinite(updatedTs) && updatedTs > 0) return updatedTs;
  const createdTs = new Date(String(row.created_at ?? "")).getTime();
  if (Number.isFinite(createdTs) && createdTs > 0) return createdTs;
  return 0;
}

export function resolveCompatibleDefaultUnit(params: {
  requestedDefaultUnit: string;
  stockUnitCode: string;
  unitMap: ReturnType<typeof createUnitMap>;
}) {
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "un");
  const requestedDefaultUnit = normalizeUnitCode(
    params.requestedDefaultUnit || stockUnitCode
  );
  const stockFamily = inferFamilyFromUnitCode(stockUnitCode, params.unitMap);
  const defaultFamily = inferFamilyFromUnitCode(requestedDefaultUnit, params.unitMap);
  if (stockFamily && defaultFamily && stockFamily !== defaultFamily) {
    return stockUnitCode;
  }
  return requestedDefaultUnit || stockUnitCode;
}

function omitKeys(
  payload: Record<string, unknown>,
  keysToOmit: string[]
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => !keysToOmit.includes(key) && value !== undefined)
  );
}

function buildProductSiteSettingPayloadVariants(
  payload: Record<string, unknown>
): Record<string, unknown>[] {
  const variantKeysToOmit: string[][] = [
    [],
    [
      "production_location_id",
      "local_production_enabled",
      "area_kinds",
      "remission_enabled",
      "sales_enabled",
      "min_stock_input_mode",
      "min_stock_purchase_qty",
      "min_stock_purchase_unit_code",
      "min_stock_purchase_to_base_factor",
    ],
    [
      "production_location_id",
      "local_production_enabled",
      "area_kinds",
      "remission_enabled",
      "sales_enabled",
      "min_stock_input_mode",
      "min_stock_purchase_qty",
      "min_stock_purchase_unit_code",
      "min_stock_purchase_to_base_factor",
      "audience",
    ],
    [
      "production_location_id",
      "local_production_enabled",
      "area_kinds",
      "remission_enabled",
      "sales_enabled",
      "min_stock_input_mode",
      "min_stock_purchase_qty",
      "min_stock_purchase_unit_code",
      "min_stock_purchase_to_base_factor",
      "audience",
      "min_stock_qty",
    ],
  ];

  const variants: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const keys of variantKeysToOmit) {
    const variant = omitKeys(payload, keys);
    const signature = JSON.stringify(variant);
    if (seen.has(signature)) continue;
    seen.add(signature);
    variants.push(variant);
  }
  return variants;
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function insertProductSiteSettingCompat(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
) {
  const variants = buildProductSiteSettingPayloadVariants(payload);
  let lastError: { code?: string; message: string } | null = null;

  for (const variant of variants) {
    const { error } = await supabase.from("product_site_settings").insert(variant);
    if (!error) return null;
    lastError = { code: error.code, message: error.message };
    if (error.code !== "42703") return lastError;
  }

  return lastError;
}

export async function updateProductSiteSettingCompat(
  supabase: SupabaseClient,
  productId: string,
  siteId: string,
  payload: Record<string, unknown>
) {
  const variants = buildProductSiteSettingPayloadVariants(payload);
  let lastError: { code?: string; message: string } | null = null;

  for (const variant of variants) {
    const { error } = await supabase
      .from("product_site_settings")
      .update(variant)
      .eq("product_id", productId)
      .eq("site_id", siteId);
    if (!error) return null;
    lastError = { code: error.code, message: error.message };
    if (error.code !== "42703") return lastError;
  }

  return lastError;
}

export async function loadCategoryRows(
  supabase: SupabaseClient
): Promise<CategoryRow[]> {
  const query = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain,site_id,is_active,applies_to_kinds")
    .order("name", { ascending: true });

  if (!query.error) {
    return (query.data ?? []) as CategoryRow[];
  }

  const fallback = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain,site_id,is_active")
    .order("name", { ascending: true });

  return ((fallback.data ?? []) as Array<Omit<CategoryRow, "applies_to_kinds">>).map(
    (row) => ({ ...row, applies_to_kinds: [] })
  );
}

export function resolveCategoryKindForProduct(params: {
  productType: string | null | undefined;
  inventoryKind: string | null | undefined;
}): CategoryKind {
  return categoryKindFromProduct({
    productType: params.productType,
    inventoryKind: params.inventoryKind,
  });
}
