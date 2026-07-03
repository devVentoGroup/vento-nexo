import { requireAppAccess } from "@/lib/auth/guard";
import type { FormDraftKey } from "@/lib/inventory/forms/types";
import {
  buildCategorySuggestedDescription,
  categoryKindFromProduct,
  normalizeCategoryKind,
  parseCategoryKinds,
  type CategoryKind,
  type InventoryCategoryRow,
} from "@/lib/inventory/categories";
export type CategoryRow = InventoryCategoryRow;
export type CategorySettingsView = "explorar" | "ficha" | "salud";

export type SearchParams = {
  ok?: string;
  error?: string;
  view?: string;
  step?: string;
  category_kind?: string;
  category_domain?: string;
  category_scope?: string;
  category_site_id?: string;
  category_id?: string;
  edit_id?: string;
  manage_site_id?: string;
};

export type ProductAuditRow = {
  id: string;
  name: string | null;
  category_id: string | null;
  product_type: string | null;
  product_inventory_profiles?:
    | {
        inventory_kind: string | null;
      }
    | Array<{
        inventory_kind: string | null;
      }>
    | null;
};

export type SiteRow = {
  id: string;
  name: string | null;
};

export type InconsistentAssignment = {
  product_id: string;
  product_name: string;
  category_id: string;
  reason: string;
  category_path: string;
};

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  insumo: "Insumo",
  preparacion: "Preparacion",
  venta: "Venta",
  equipo: "Equipo",
};

export const CATEGORY_SETTINGS_DRAFT_KEY: FormDraftKey = "inventory.category.settings";
export const TABLE_ACTION_BUTTON_CLASS =
  "ui-btn ui-btn--ghost ui-btn--sm min-w-[104px] justify-center shrink-0";
export const TABLE_DELETE_BUTTON_CLASS =
  "ui-btn ui-btn--ghost ui-btn--sm min-w-[104px] justify-center shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700";

export function asText(value: FormDataEntryValue | string | null | undefined): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "undefined" || value === null) return "";
  return String(value).trim();
}

export function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "categoria";
}

export function buildPageUrl(params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `/inventory/settings/categories?${qs}` : "/inventory/settings/categories";
}

export function normalizeView(value: string | null | undefined): CategorySettingsView {
  const normalized = asText(value).toLowerCase();
  if (normalized === "ficha") return "ficha";
  if (normalized === "salud") return "salud";
  return "explorar";
}

export function extractInventoryKind(row: ProductAuditRow): string | null {
  const profile = row.product_inventory_profiles;
  if (!profile) return null;
  if (Array.isArray(profile)) {
    return asText(profile[0]?.inventory_kind ?? null) || null;
  }
  return asText(profile.inventory_kind ?? null) || null;
}

export function parseKindsFromForm(formData: FormData): CategoryKind[] {
  const values = formData.getAll("applies_to_kinds");
  const parsed = values
    .map((value) => normalizeCategoryKind(asText(value)))
    .filter((value): value is CategoryKind => Boolean(value));
  return Array.from(new Set(parsed));
}

export async function loadCategoryRows(
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"]
): Promise<CategoryRow[]> {
  const query = await supabase
    .from("product_categories")
    .select("id,name,description,parent_id,domain,site_id,is_active,applies_to_kinds")
    .order("name", { ascending: true });

  if (!query.error) {
    return (query.data ?? []) as CategoryRow[];
  }

  const fallback = await supabase
    .from("product_categories")
    .select("id,name,description,parent_id,domain,site_id,is_active")
    .order("name", { ascending: true });

  return ((fallback.data ?? []) as Array<Omit<CategoryRow, "applies_to_kinds">>).map(
    (row) => ({ ...row, applies_to_kinds: [] })
  );
}

export async function loadProductAuditRows(
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"]
): Promise<ProductAuditRow[]> {
  const allRows: ProductAuditRow[] = [];
  const pageSize = 1000;
  let from = 0;
  let keepLoading = true;

  while (keepLoading) {
    const { data, error } = await supabase
      .from("products")
      .select("id,name,category_id,product_type,product_inventory_profiles(inventory_kind)")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error || !data) break;

    const rows = data as unknown as ProductAuditRow[];
    allRows.push(...rows);
    keepLoading = rows.length === pageSize;
    from += pageSize;

    if (from > 50000) break;
  }

  return allRows;
}
