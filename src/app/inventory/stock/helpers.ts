import { requireAppAccess } from "@/lib/auth/guard";
import type { InventoryCategoryRow } from "@/lib/inventory/categories";
import type { ProductUomProfile } from "@/lib/inventory/uom";

const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 150;
export type SupabaseClient = Awaited<ReturnType<typeof requireAppAccess>>["supabase"];
export type QueryError = { message: string } | null;

export type SearchParams = {
  site_id?: string;
  q?: string;
  stock_class?: string;
  product_type?: string;
  inventory_kind?: string;
  category_kind?: string;
  category_id?: string;
  category_domain?: string;
  category_scope?: string;
  category_site_id?: string;
  location_id?: string;
  zone?: string;
  error?: string;
  count_initial?: string;
  adjust?: string;
  assigned?: string;
  /** 1.4 Vista Stock por LOC: tabla producto ? LOC */
  view?: string;
};

export type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

export type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

export type CategoryRow = InventoryCategoryRow;

export type StockRow = {
  site_id: string;
  product_id: string;
  current_qty: number | null;
  updated_at: string | null;
};

export type StockByLocRow = {
  location_id: string;
  product_id: string;
  current_qty: number | null;
  location?: { code: string | null; zone: string | null; site_id: string } | null;
};

export type LocRow = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_type: string;
  category_id: string | null;
  product_inventory_profiles?:
    | {
        track_inventory: boolean;
        inventory_kind: string;
      }
    | Array<{
        track_inventory: boolean;
        inventory_kind: string;
      }>
    | null;
};

export type ProductInventoryProfile = {
  track_inventory: boolean;
  inventory_kind: string;
};

export type StockClassChip = {
  value: string;
  label: string;
  count: number;
};

export function getInventoryProfile(
  profile: ProductRow["product_inventory_profiles"]
): ProductInventoryProfile | null {
  if (!profile) return null;
  if (Array.isArray(profile)) return profile[0] ?? null;
  return profile;
}

export function normalizeInventoryKind(value?: string | null): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || "unclassified";
}

export function normalizeProductType(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase();
}

export function matchesStockClass(product: ProductRow, stockClass: string): boolean {
  const productType = normalizeProductType(product.product_type);
  const inventoryKind = normalizeInventoryKind(
    getInventoryProfile(product.product_inventory_profiles)?.inventory_kind
  );
  const normalizedClass = String(stockClass ?? "").trim().toLowerCase();

  if (!normalizedClass) return true;
  if (normalizedClass === "insumos") {
    return productType === "insumo" && ["ingredient", "packaging", "unclassified"].includes(inventoryKind);
  }
  if (normalizedClass === "preparaciones") return productType === "preparacion";
  if (normalizedClass === "venta") return productType === "venta";
  if (normalizedClass === "venta_reventa") return productType === "venta" && inventoryKind === "resale";
  if (normalizedClass === "venta_terminado") return productType === "venta" && inventoryKind === "finished";
  if (normalizedClass === "activos") return inventoryKind === "asset";
  return true;
}

export type ProductSiteRow = {
  product_id: string;
  is_active: boolean | null;
};

export function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  if (value.length >= 10) return value.slice(0, 10);
  return value;
}

export function formatMetric(value: number, maxFractionDigits = 1): string {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

export function siteTypeLabel(value?: string | null): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "production_center") return "Centro de producción";
  if (normalized === "satellite") return "Satélite";
  if (normalized === "warehouse") return "Bodega";
  if (normalized === "store") return "Tienda";
  return "Sede";
}

export function parseQuantity(value: FormDataEntryValue | null): number {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchActiveProductSiteRows(
  supabase: SupabaseClient,
  siteId: string
): Promise<{ rows: ProductSiteRow[]; error: QueryError }> {
  const rows: ProductSiteRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("product_site_settings")
      .select("product_id,is_active")
      .eq("site_id", siteId)
      .eq("is_active", true)
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { rows, error };

    const pageRows = (data ?? []) as ProductSiteRow[];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) return { rows, error: null };
  }
}

export async function fetchProductRowsForStock(
  supabase: SupabaseClient,
  {
    searchQuery,
    filteredCategoryIds,
    productSiteIds,
  }: {
    searchQuery: string;
    filteredCategoryIds: string[] | null;
    productSiteIds: string[];
  }
): Promise<{ rows: ProductRow[]; error: QueryError }> {
  if (filteredCategoryIds !== null && filteredCategoryIds.length === 0) {
    return { rows: [], error: null };
  }

  const rows: ProductRow[] = [];
  const productIdChunks = productSiteIds.length > 0 ? chunkArray(productSiteIds, IN_CHUNK_SIZE) : [null];

  for (const productIdChunk of productIdChunks) {
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = supabase
        .from("products")
        .select(
          "id,name,sku,unit,stock_unit_code,product_type,category_id,product_inventory_profiles(track_inventory,inventory_kind)"
        )
        .order("name", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (searchQuery) {
        const pattern = `%${searchQuery}%`;
        query = query.or(`name.ilike.${pattern},sku.ilike.${pattern}`);
      }

      if (filteredCategoryIds !== null) {
        query = query.in("category_id", filteredCategoryIds);
      }

      if (productIdChunk) {
        query = query.in("id", productIdChunk);
      }

      const { data, error } = await query;
      if (error) return { rows, error };

      const pageRows = (data ?? []) as unknown as ProductRow[];
      rows.push(...pageRows);
      if (pageRows.length < PAGE_SIZE) break;
    }
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  return { rows, error: null };
}

export async function fetchProductUomProfiles(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<ProductUomProfile[]> {
  const rows: ProductUomProfile[] = [];

  for (const productIdChunk of chunkArray(productIds, IN_CHUNK_SIZE)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("product_uom_profiles")
        .select(
          "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
        )
        .in("product_id", productIdChunk)
        .eq("is_active", true)
        .range(from, from + PAGE_SIZE - 1);

      if (error) break;

      const pageRows = (data ?? []) as ProductUomProfile[];
      rows.push(...pageRows);
      if (pageRows.length < PAGE_SIZE) break;
    }
  }

  return rows;
}

export async function fetchStockRowsBySite(
  supabase: SupabaseClient,
  siteId: string
): Promise<{ rows: StockRow[]; error: QueryError }> {
  const rows: StockRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("inventory_stock_by_site")
      .select("site_id,product_id,current_qty,updated_at")
      .eq("site_id", siteId)
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { rows, error };

    const pageRows = (data ?? []) as StockRow[];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) return { rows, error: null };
  }
}

export async function fetchStockRowsByLocation(
  supabase: SupabaseClient,
  locationIds: string[]
): Promise<StockByLocRow[]> {
  const rows: StockByLocRow[] = [];

  for (const locationIdChunk of chunkArray(locationIds, IN_CHUNK_SIZE)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("inventory_stock_by_location")
        .select("location_id,product_id,current_qty,location:inventory_locations(code,zone,site_id)")
        .in("location_id", locationIdChunk)
        .neq("current_qty", 0)
        .range(from, from + PAGE_SIZE - 1);

      if (error) break;

      const pageRows = (data ?? []) as unknown as StockByLocRow[];
      rows.push(...pageRows);
      if (pageRows.length < PAGE_SIZE) break;
    }
  }

  return rows;
}

export async function loadCategoryRows(
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"]
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
