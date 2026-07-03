import type { requireAppAccess } from "@/lib/auth/guard";
import { safeDecodeURIComponent } from "@/lib/url";
import type { InventoryCategoryRow } from "@/lib/inventory/categories";
import {
  convertQuantity,
  createUnitMap,
  normalizeUnitCode,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

const FOGO_BASE_URL =
  process.env.NEXT_PUBLIC_FOGO_URL?.replace(/\/$/, "") ||
  "https://fogo.ventogroup.co";
export type SearchParams = {
  from?: string;
};

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
  image_url: string | null;
  catalog_image_url: string | null;
};

export type InventoryProfileRow = {
  track_inventory: boolean | null;
  inventory_kind: string | null;
  default_unit: string | null;
  lot_tracking: boolean | null;
  expiry_tracking: boolean | null;
};

export type SiteRow = {
  id: string;
  name: string | null;
  is_active: boolean | null;
};

export type SiteSettingRow = {
  site_id: string | null;
  is_active: boolean | null;
  min_stock_qty: number | null;
  inventory_enabled?: boolean | null;
  sales_enabled?: boolean | null;
  local_production_enabled?: boolean | null;
  remission_enabled?: boolean | null;
};

export type StockRow = {
  site_id: string | null;
  current_qty: number | null;
};

export type SupplierRow = {
  supplier_id: string | null;
  purchase_unit: string | null;
  purchase_pack_qty: number | null;
  purchase_pack_unit_code: string | null;
  purchase_price_net: number | null;
  purchase_price: number | null;
  purchase_price_includes_tax: boolean | null;
  purchase_tax_rate: number | null;
  purchase_price_includes_icui: boolean | null;
  purchase_icui_rate: number | null;
  is_primary: boolean | null;
  suppliers?: { name: string | null } | { name: string | null }[] | null;
};

export type UomProfileRow = {
  id: string;
  product_id: string;
  label: string | null;
  input_unit_code: string | null;
  qty_in_input_unit: number | null;
  qty_in_stock_unit: number | null;
  usage_context: string | null;
  is_default: boolean | null;
  is_active: boolean | null;
  image_url: string | null;
  catalog_image_url: string | null;
  updated_at: string | null;
  source?: "manual" | "supplier_primary" | "recipe_portion" | null;
};

export type UnitRow = {
  code: string;
  name: string;
  family: string;
  factor_to_base: number;
  symbol: string | null;
  display_decimals: number | null;
  is_active: boolean;
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

export type AssetMaintenanceRow = {
  id: string;
  scheduled_date: string | null;
  performed_date: string | null;
  responsible: string | null;
  maintenance_provider: string | null;
  work_done: string | null;
  parts_replaced: boolean | null;
  replaced_parts: string | null;
  planner_bucket: string | null;
};

export type AssetTransferRow = {
  id: string;
  moved_at: string | null;
  from_location: string | null;
  to_location: string | null;
  responsible: string | null;
  notes: string | null;
};

export type UomDisplay = {
  label: string;
  inputUnitCode: string;
  qtyInInputUnit: number;
  qtyInStockUnit: number;
  adjustedFromCatalog: boolean;
};

export type PurchaseOrderItemTraceRow = {
  qty: number | null;
  purchase_orders?:
  | {
    id: string | null;
    status: string | null;
    expected_at: string | null;
    created_at: string | null;
    suppliers?: { name: string | null } | { name: string | null }[] | null;
  }
  | Array<{
    id: string | null;
    status: string | null;
    expected_at: string | null;
    created_at: string | null;
    suppliers?: { name: string | null } | { name: string | null }[] | null;
  }>
  | null;
};

export type InventoryReceiptItemTraceRow = {
  qty_base: number | null;
  inventory_entries?:
  | {
    id: string | null;
    invoice_number: string | null;
    status: string | null;
    received_at: string | null;
    created_at: string | null;
    sites?: { name: string | null } | { name: string | null }[] | null;
  }
  | Array<{
    id: string | null;
    invoice_number: string | null;
    status: string | null;
    received_at: string | null;
    created_at: string | null;
    sites?: { name: string | null } | { name: string | null }[] | null;
  }>
  | null;
};

export type ProductionBatchPackageRow = {
  id: string;
  batch_id: string | null;
  site_id: string | null;
  location_id: string | null;
  location_position_id: string | null;
  product_id: string | null;
  package_index: number | null;
  package_label: string | null;
  actual_qty: number | null;
  original_qty: number | null;
  remaining_qty: number | null;
  reserved_qty: number | null;
  unit_code: string | null;
  status: string | null;
  created_at: string | null;
};

export type PackageLocationRow = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

export type ProductionPackageGroup = {
  key: string;
  label: string;
  unitCode: string;
  packageCount: number;
  totalQty: number;
};

export function sanitizeCatalogReturnPath(value: string | undefined): string {
  const decoded = value ? safeDecodeURIComponent(value) : "";
  const trimmed = decoded.trim();
  if (!trimmed.startsWith("/inventory/catalog")) return "/inventory/catalog";

  const [pathname, qs] = trimmed.split("?", 2);
  const params = new URLSearchParams(qs ?? "");
  params.delete("ok");
  params.delete("error");

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function formatQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 3,
  }).format(value);
}

export function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatUnitMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: value > 0 && value < 100 ? 2 : 0,
    maximumFractionDigits: value > 0 && value < 100 ? 2 : 0,
  }).format(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
  }).format(parsed);
}

export function equipmentStatusLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "en_mantenimiento") return "En mantenimiento";
  if (raw === "fuera_servicio") return "Fuera de servicio";
  if (raw === "baja") return "De baja";
  return "Operativo";
}

export function addMonthsUTC(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const tentative = new Date(Date.UTC(year, month + months, 1));
  const endOfMonth = new Date(Date.UTC(tentative.getUTCFullYear(), tentative.getUTCMonth() + 1, 0)).getUTCDate();
  tentative.setUTCDate(Math.min(day, endOfMonth));
  return tentative;
}

export function normalizeTypeLabel(
  productTypeRaw: string | null,
  inventoryKindRaw: string | null
): string {
  const productType = String(productTypeRaw ?? "").trim().toLowerCase();
  const inventoryKind = String(inventoryKindRaw ?? "").trim().toLowerCase();
  if (inventoryKind === "asset") return "Activo";
  if (productType === "preparacion") return "Preparación";
  if (productType === "venta" && inventoryKind === "resale") return "Reventa";
  if (productType === "venta") return "Producto de venta";
  return "Insumo";
}

export function buildFogoRecipeUrl(productId: string) {
  const url = new URL("/recipes/new", FOGO_BASE_URL);
  url.searchParams.set("source", "nexo");
  url.searchParams.set("product_id", productId);
  return url.toString();
}

export function toPositiveNumber(value: number | null | undefined, fallback: number): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getSupplierGrossPackPrice(supplier: SupplierRow | null): number | null {
  if (!supplier) return null;
  const price = Number(supplier.purchase_price ?? 0);
  if (!Number.isFinite(price) || price <= 0) return null;

  const taxRate = Number(supplier.purchase_tax_rate ?? 0);
  const safeTaxRate = Number.isFinite(taxRate) && taxRate > 0 ? taxRate : 0;
  const icuiRate = Number(supplier.purchase_icui_rate ?? 0);
  const safeIcuiRate = Number.isFinite(icuiRate) && icuiRate > 0 ? icuiRate : 0;
  const includedRate =
    (supplier.purchase_price_includes_tax ? safeTaxRate : 0) +
    (supplier.purchase_price_includes_icui ? safeIcuiRate : 0);

  if (includedRate > 0) return price;
  return price * (1 + (safeTaxRate + safeIcuiRate) / 100);
}

export function resolveProfileDisplay(params: {
  profile: ProductUomProfile | null;
  stockUnitCode: string;
  unitRows: UnitRow[];
  normalizeByCatalog?: boolean;
}): UomDisplay | null {
  const profile = params.profile;
  if (!profile) return null;
  const inputUnitCode = normalizeUnitCode(profile.input_unit_code || "");
  if (!inputUnitCode) return null;

  const qtyInInputUnit = toPositiveNumber(profile.qty_in_input_unit, 1);
  const qtyInStockRaw = toPositiveNumber(profile.qty_in_stock_unit, 1);
  const label = String(profile.label ?? "").trim() || "Unidad";
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "");
  const normalizeByCatalog = params.normalizeByCatalog !== false;

  if (!stockUnitCode) {
    return {
      label,
      inputUnitCode,
      qtyInInputUnit,
      qtyInStockUnit: qtyInStockRaw,
      adjustedFromCatalog: false,
    };
  }

  if (!normalizeByCatalog) {
    return {
      label,
      inputUnitCode,
      qtyInInputUnit,
      qtyInStockUnit: qtyInStockRaw,
      adjustedFromCatalog: false,
    };
  }

  try {
    const unitMap = createUnitMap(params.unitRows as Parameters<typeof createUnitMap>[0]);
    const { quantity: convertedQty } = convertQuantity({
      quantity: qtyInInputUnit,
      fromUnitCode: inputUnitCode,
      toUnitCode: stockUnitCode,
      unitMap,
    });
    const delta = Math.abs(convertedQty - qtyInStockRaw);
    const tolerance = Math.max(0.0001, Math.abs(convertedQty) * 0.0001);
    const shouldAdjust = delta > tolerance;
    return {
      label,
      inputUnitCode,
      qtyInInputUnit,
      qtyInStockUnit: shouldAdjust ? convertedQty : qtyInStockRaw,
      adjustedFromCatalog: shouldAdjust,
    };
  } catch {
    return {
      label,
      inputUnitCode,
      qtyInInputUnit,
      qtyInStockUnit: qtyInStockRaw,
      adjustedFromCatalog: false,
    };
  }
}
export function uomProfileImageUrl(row: UomProfileRow): string {
  return String(row.image_url ?? row.catalog_image_url ?? "").trim();
}

export function uomUsageContextLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "purchase") return "Compra";
  if (raw === "remission") return "Remisión";
  return "General";
}

export function uomSourceLabel(value: UomProfileRow["source"]): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "supplier_primary") return "Proveedor";
  if (raw === "recipe_portion") return "Receta";
  return "Manual";
}

export function preparationRemissionStatusLabel(profile: ProductUomProfile | null): string {
  if (!profile) return "Pendiente";
  if (profile.source === "recipe_portion") return "FOGO publicado";
  if (profile.source === "manual") return "Manual temporal";
  if (profile.source === "supplier_primary") return "Proveedor";
  return "Configurado";
}

export function preparationRemissionStatusTone(profile: ProductUomProfile | null): "success" | "warn" | "neutral" {
  if (!profile) return "warn";
  if (profile.source === "recipe_portion") return "success";
  return "neutral";
}

export function uomProfileDisplayRank(row: UomProfileRow): number {
  const usageContext = String(row.usage_context ?? "").trim().toLowerCase();
  const source = String(row.source ?? "").trim().toLowerCase();

  let rank = 0;
  if (row.is_active !== false) rank += 100;
  if (row.is_default === true) rank += 50;
  if (usageContext === "general") rank += 20;
  if (usageContext === "remission") rank += 15;
  if (usageContext === "purchase") rank += 10;
  if (source === "manual") rank += 5;
  if (uomProfileImageUrl(row)) rank += 3;

  return rank;
}

export function productionPackageRemainingQty(row: ProductionBatchPackageRow): number {
  const remaining = Number(row.remaining_qty ?? row.actual_qty ?? 0);
  return Number.isFinite(remaining) && remaining > 0 ? remaining : 0;
}

export function productionPackageOriginalQty(row: ProductionBatchPackageRow): number {
  const original = Number(row.original_qty ?? row.actual_qty ?? row.remaining_qty ?? 0);
  return Number.isFinite(original) && original > 0 ? original : 0;
}

export function productionPackageStatusLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "available") return "Disponible";
  if (raw === "opened") return "Abierto";
  if (raw === "reserved") return "Reservado";
  if (raw === "dispatched") return "Despachado";
  if (raw === "consumed") return "Consumido";
  if (raw === "voided") return "Anulado";
  return raw || "Disponible";
}

export function packageLocationLabel(location: PackageLocationRow | null | undefined): string {
  if (!location) return "Sin LOC";
  return [location.code, location.zone, location.description].filter(Boolean).join(" - ") || location.id;
}

export function buildProductionPackageGroups(
  rows: ProductionBatchPackageRow[],
  stockUnitCode: string
): ProductionPackageGroup[] {
  const groups = new Map<string, ProductionPackageGroup>();

  for (const row of rows) {
    const remainingQty = productionPackageRemainingQty(row);
    if (remainingQty <= 0) continue;

    const unitCode = normalizeUnitCode(row.unit_code || stockUnitCode || "un");
    const key = `${remainingQty.toFixed(3)}::${unitCode}`;
    const label = `${formatQty(remainingQty)} ${unitCode}`;

    const current = groups.get(key) ?? {
      key,
      label,
      unitCode,
      packageCount: 0,
      totalQty: 0,
    };

    current.packageCount += 1;
    current.totalQty += remainingQty;
    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (b.totalQty !== a.totalQty) return b.totalQty - a.totalQty;
    return a.label.localeCompare(b.label, "es", { numeric: true, sensitivity: "base" });
  });
}

export async function loadCategoryRows(
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"]
): Promise<InventoryCategoryRow[]> {
  const query = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain,site_id,is_active,applies_to_kinds")
    .order("name", { ascending: true });

  if (!query.error) return (query.data ?? []) as InventoryCategoryRow[];

  const fallback = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain,site_id,is_active")
    .order("name", { ascending: true });

  return ((fallback.data ?? []) as Array<Omit<InventoryCategoryRow, "applies_to_kinds">>).map(
    (row) => ({ ...row, applies_to_kinds: [] })
  );
}

