import { requireAppAccess } from "@/lib/auth/guard";
import type { InventoryCategoryRow } from "@/lib/inventory/categories";
import type { InventoryUnit } from "@/lib/inventory/uom";
export const TAB_OPTIONS = [
  { value: "insumos", label: "Insumos" },
  { value: "preparaciones", label: "Preparaciones" },
  { value: "productos", label: "Productos" },
  { value: "equipos", label: "Tipos de activos" },
] as const;

export type TabValue = (typeof TAB_OPTIONS)[number]["value"];

export type SearchParams = {
  q?: string;
  tab?: string;
  show_disabled?: string;
  site_id?: string;
  stock_alert?: string;
  view_mode?: string;
  supplier_id?: string;
  category_kind?: string;
  category_domain?: string;
  category_scope?: string;
  category_site_id?: string;
  category_id?: string;
  ok?: string;
  error?: string;
};

export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  cost: number | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_type: string;
  category_id: string | null;
  is_active: boolean | null;
  image_url: string | null;
  catalog_image_url: string | null;
  product_inventory_profiles?: {
    track_inventory: boolean;
    inventory_kind: string;
    costing_mode: "auto_primary_supplier" | "manual" | null;
  } | null;
};

export type SiteRow = {
  id: string;
  name: string | null;
};

export type ProductSupplierCostRow = {
  product_id: string;
  supplier_id: string | null;
  is_primary: boolean | null;
  purchase_pack_qty: number | null;
  purchase_pack_unit_code: string | null;
  purchase_unit: string | null;
  purchase_price: number | null;
  purchase_price_net: number | null;
  purchase_price_includes_tax: boolean | null;
  purchase_tax_rate: number | null;
};

export type ProductSiteSettingRow = {
  product_id: string;
  is_active: boolean | null;
  min_stock_qty: number | null;
};

export type ProductPresentationImageRow = {
  product_id: string;
  image_url: string | null;
  catalog_image_url: string | null;
  is_default: boolean | null;
  is_active: boolean | null;
  usage_context: string | null;
  source: string | null;
  updated_at: string | null;
};

export type StockBySiteRow = {
  product_id: string;
  current_qty: number | null;
};

export type SupplierRow = {
  id: string;
  name: string | null;
};

export type UnitRow = InventoryUnit;

export async function loadCategoryRows(
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"]
): Promise<InventoryCategoryRow[]> {
  const query = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain,site_id,is_active,applies_to_kinds")
    .order("name", { ascending: true });

  if (!query.error) {
    return (query.data ?? []) as InventoryCategoryRow[];
  }

  const fallback = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain,site_id,is_active")
    .order("name", { ascending: true });

  return ((fallback.data ?? []) as Array<Omit<InventoryCategoryRow, "applies_to_kinds">>).map(
    (row) => ({ ...row, applies_to_kinds: [] })
  );
}

export function tabTypeValue(tab: TabValue): string {
  if (tab === "preparaciones") return "preparacion";
  if (tab === "productos") return "venta";
  return "insumo";
}

export function asFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(value);
}

export function siteSettingRank(row: ProductSiteSettingRow): number {
  const activeScore = row.is_active === false ? 0 : 2;
  const minScore = row.min_stock_qty == null ? 0 : 1;
  return activeScore + minScore;
}

export function getLastCategorySegment(path: string): string {
  const normalized = String(path ?? "").trim();
  if (!normalized) return "-";
  const segments = normalized.split("/").map((segment) => segment.trim()).filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

export function profileImageUrl(row: ProductPresentationImageRow): string {
  return String(row.image_url ?? row.catalog_image_url ?? "").trim();
}

export function profileImageRank(row: ProductPresentationImageRow): number {
  const usageContext = String(row.usage_context ?? "").trim().toLowerCase();
  const source = String(row.source ?? "").trim().toLowerCase();

  let rank = 0;

  if (row.is_active !== false) rank += 100;
  if (row.is_default === true) rank += 50;
  if (usageContext === "general") rank += 20;
  if (source === "manual") rank += 10;
  if (profileImageUrl(row)) rank += 5;

  return rank;
}

export function toBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64url");
}

export function sanitizeCatalogListReturnPath(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("/inventory/catalog") ? trimmed : "/inventory/catalog";
}

export function buildCatalogListReturnUrl(
  basePath: string,
  status: { ok?: string; error?: string }
): string {
  const [pathname, qs] = basePath.split("?");
  const params = new URLSearchParams(qs ?? "");
  if (status.ok) params.set("ok", status.ok);
  if (status.error) params.set("error", status.error);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
