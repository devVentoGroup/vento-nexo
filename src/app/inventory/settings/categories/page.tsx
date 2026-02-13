import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { CategoryTreeFilter } from "@/components/inventory/CategoryTreeFilter";
import { requireAppAccess } from "@/lib/auth/guard";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { CATEGORY_DOMAIN_LABELS, getCategoryDomainLabel, getCategoryDomainOptions } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORY_KINDS,
  categoryKindFromProduct,
  categorySupportsKind,
  collectDescendantIds,
  filterCategoryRows,
  getCategoryPath,
  normalizeCategoryDomain,
  normalizeCategoryKind,
  normalizeCategoryScope,
  parseCategoryKinds,
  shouldShowCategoryDomain,
  type CategoryKind,
  type InventoryCategoryRow,
} from "@/lib/inventory/categories";

export const dynamic = "force-dynamic";

type CategoryRow = InventoryCategoryRow;

type SearchParams = {
  ok?: string;
  error?: string;
  q?: string;
  category_kind?: string;
  category_domain?: string;
  category_scope?: string;
  category_site_id?: string;
  category_id?: string;
  edit_id?: string;
};

type ProductAuditRow = {
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

type SiteRow = {
  id: string;
  name: string | null;
};

function asText(value: FormDataEntryValue | string | null | undefined): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "undefined" || value === null) return "";
  return String(value).trim();
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "categoria";
}

function buildPageUrl(params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `/inventory/settings/categories?${qs}` : "/inventory/settings/categories";
}

function toSearchValue(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function extractInventoryKind(row: ProductAuditRow): string | null {
  const profile = row.product_inventory_profiles;
  if (!profile) return null;
  if (Array.isArray(profile)) {
    return asText(profile[0]?.inventory_kind ?? null) || null;
  }
  return asText(profile.inventory_kind ?? null) || null;
}

function parseKindsFromForm(formData: FormData): CategoryKind[] {
  const values = formData.getAll("applies_to_kinds");
  const parsed = values
    .map((value) => normalizeCategoryKind(asText(value)))
    .filter((value): value is CategoryKind => Boolean(value));
  return Array.from(new Set(parsed));
}

async function loadCategoryRows(
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

async function loadProductAuditRows(
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

async function requireCategoryManager() {
  const supabase = await createClient();
  const { data: authRes } = await supabase.auth.getUser();
  const user = authRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/settings/categories"));
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = asText(employee?.role ?? null).toLowerCase();
  if (!["propietario", "gerente_general"].includes(role)) {
    redirect(
      "/inventory/settings/categories?error=" +
        encodeURIComponent("Solo propietarios y gerentes generales pueden gestionar categorias.")
    );
  }

  return supabase;
}

async function saveCategoryAction(formData: FormData) {
  "use server";

  const supabase = await requireCategoryManager();
  const returnQs = asText(formData.get("_return_qs"));
  const baseParams = new URLSearchParams(returnQs);

  const toUrl = (statusKey: "ok" | "error", message: string) => {
    const nextParams = new URLSearchParams(baseParams);
    nextParams.set(statusKey, message);
    return buildPageUrl(nextParams);
  };

  const id = asText(formData.get("id"));
  const name = asText(formData.get("name"));
  const siteId = asText(formData.get("site_id")) || null;
  const parentIdRaw = asText(formData.get("parent_id"));
  const parentId = parentIdRaw && parentIdRaw !== id ? parentIdRaw : null;
  const slug = slugify(asText(formData.get("slug")) || name);
  const isActive = formData.get("is_active") === "on";
  const kinds = parseKindsFromForm(formData);
  const requestedDomain = normalizeCategoryDomain(asText(formData.get("domain")));

  if (!name) {
    redirect(toUrl("error", "El nombre de categoria es obligatorio."));
  }
  if (!kinds.length) {
    redirect(toUrl("error", "Selecciona al menos un tipo aplicable."));
  }
  if (requestedDomain && !kinds.includes("venta")) {
    redirect(
      toUrl(
        "error",
        "El dominio solo puede definirse para categorias aplicables a venta."
      )
    );
  }

  const payload: Record<string, unknown> = {
    name,
    slug,
    parent_id: parentId,
    site_id: siteId,
    domain: requestedDomain || null,
    is_active: isActive,
    applies_to_kinds: kinds,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await supabase.from("product_categories").update(payload).eq("id", id);
    if (error) {
      redirect(toUrl("error", error.message));
    }
    revalidatePath("/inventory/settings/categories");
    revalidatePath("/inventory/catalog");
    revalidatePath("/inventory/stock");
    revalidatePath("/inventory/catalog/new");
    redirect(toUrl("ok", "category_updated"));
  }

  const { error } = await supabase.from("product_categories").insert(payload);
  if (error) {
    redirect(toUrl("error", error.message));
  }

  revalidatePath("/inventory/settings/categories");
  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/catalog/new");
  redirect(toUrl("ok", "category_created"));
}

async function toggleCategoryActiveAction(formData: FormData) {
  "use server";

  const supabase = await requireCategoryManager();
  const returnQs = asText(formData.get("_return_qs"));
  const categoryId = asText(formData.get("category_id"));
  const nextIsActive = asText(formData.get("next_is_active")) === "1";
  const baseParams = new URLSearchParams(returnQs);

  if (!categoryId) {
    baseParams.set("error", "Categoria invalida.");
    redirect(buildPageUrl(baseParams));
  }

  const { error } = await supabase
    .from("product_categories")
    .update({
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", categoryId);

  if (error) {
    baseParams.set("error", error.message);
    redirect(buildPageUrl(baseParams));
  }

  revalidatePath("/inventory/settings/categories");
  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/stock");
  baseParams.set("ok", "category_status_updated");
  redirect(buildPageUrl(baseParams));
}

export default async function InventoryCategorySettingsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok
    ? sp.ok === "category_created"
      ? "Categoria creada."
      : sp.ok === "category_updated"
        ? "Categoria actualizada."
        : sp.ok === "category_status_updated"
          ? "Estado de categoria actualizado."
          : "Cambios guardados."
    : "";
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/settings/categories",
    permissionCode: "inventory.stock",
  });

  const [
    { data: employee },
    { data: settings },
    { data: sitesData },
    allCategoryRows,
    productAuditRows,
  ] = await Promise.all([
    supabase.from("employees").select("role,site_id").eq("id", user.id).maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", user.id)
      .maybeSingle(),
    supabase.from("sites").select("id,name").eq("is_active", true).order("name", { ascending: true }),
    loadCategoryRows(supabase),
    loadProductAuditRows(supabase),
  ]);

  const role = asText(employee?.role ?? null).toLowerCase();
  const canManage = ["propietario", "gerente_general"].includes(role);
  const sites = (sitesData ?? []) as SiteRow[];
  const siteNamesById = Object.fromEntries(sites.map((site) => [site.id, site.name ?? site.id]));
  const categoryMap = new Map(allCategoryRows.map((row) => [row.id, row]));

  const categoryKind = normalizeCategoryKind(sp.category_kind ?? "");
  const categorySiteId = asText(
    sp.category_site_id ??
      (settings as { selected_site_id?: string | null } | null)?.selected_site_id ??
      (employee as { site_id?: string | null } | null)?.site_id ??
      ""
  );
  const categoryScope = normalizeCategoryScope(sp.category_scope ?? (categorySiteId ? "site" : "all"));
  const categoryDomain = shouldShowCategoryDomain(categoryKind)
    ? normalizeCategoryDomain(sp.category_domain ?? "")
    : "";
  const selectedCategoryId = asText(sp.category_id ?? "");
  const query = asText(sp.q ?? "");

  const baseFilteredRows = filterCategoryRows(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: categorySiteId,
    includeInactive: true,
  });

  let visibleRows = baseFilteredRows;
  if (selectedCategoryId) {
    const subtreeIds = collectDescendantIds(categoryMap, selectedCategoryId);
    visibleRows = visibleRows.filter((row) => subtreeIds.has(row.id) || row.id === selectedCategoryId);
  }

  if (query) {
    const normalizedQuery = toSearchValue(query);
    visibleRows = visibleRows.filter((row) => {
      const path = getCategoryPath(row.id, categoryMap);
      const scopeLabel = row.site_id ? siteNamesById[row.site_id] ?? row.site_id : "global";
      const domainLabel = getCategoryDomainLabel(row.domain);
      const searchText = `${row.name} ${path} ${scopeLabel} ${domainLabel}`;
      return toSearchValue(searchText).includes(normalizedQuery);
    });
  }

  visibleRows = [...visibleRows].sort((a, b) =>
    getCategoryPath(a.id, categoryMap).localeCompare(getCategoryPath(b.id, categoryMap), "es")
  );

  const usageCountByCategory = new Map<string, number>();
  const inconsistentAssignments: Array<{
    product_id: string;
    product_name: string;
    reason: string;
    category_path: string;
  }> = [];

  for (const product of productAuditRows) {
    const categoryId = asText(product.category_id ?? "");
    if (!categoryId) continue;

    usageCountByCategory.set(categoryId, (usageCountByCategory.get(categoryId) ?? 0) + 1);
    const category = categoryMap.get(categoryId);
    if (!category) {
      inconsistentAssignments.push({
        product_id: product.id,
        product_name: product.name ?? product.id,
        reason: "Categoria inexistente",
        category_path: categoryId,
      });
      continue;
    }

    const productKind = categoryKindFromProduct({
      productType: product.product_type ?? "",
      inventoryKind: extractInventoryKind(product),
    });

    if (!categorySupportsKind(category, productKind)) {
      inconsistentAssignments.push({
        product_id: product.id,
        product_name: product.name ?? product.id,
        reason: `Categoria no aplica a ${productKind}`,
        category_path: getCategoryPath(category.id, categoryMap),
      });
    }

    if (productKind !== "venta" && normalizeCategoryDomain(category.domain)) {
      inconsistentAssignments.push({
        product_id: product.id,
        product_name: product.name ?? product.id,
        reason: "Categoria con dominio asignada a no-venta",
        category_path: getCategoryPath(category.id, categoryMap),
      });
    }
  }

  const uncategorizedProductsCount = productAuditRows.filter(
    (product) => !asText(product.category_id ?? "")
  ).length;

  const categoriesWithoutUsage = allCategoryRows.filter(
    (row) => (usageCountByCategory.get(row.id) ?? 0) === 0
  );
  const orphanCategories = allCategoryRows.filter(
    (row) => Boolean(row.parent_id) && !categoryMap.has(String(row.parent_id))
  );
  const unresolvedKinds = allCategoryRows.filter(
    (row) => parseCategoryKinds(row.applies_to_kinds).length === 0
  );

  const topImpactRows = [...allCategoryRows]
    .map((row) => ({
      row,
      count: usageCountByCategory.get(row.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const domainOptions = getCategoryDomainOptions([
    ...Object.keys(CATEGORY_DOMAIN_LABELS),
    ...allCategoryRows.map((row) => row.domain ?? ""),
  ]);

  const filterParams = new URLSearchParams();
  if (query) filterParams.set("q", query);
  if (categoryKind) filterParams.set("category_kind", categoryKind);
  if (categoryScope) filterParams.set("category_scope", categoryScope);
  if (categorySiteId) filterParams.set("category_site_id", categorySiteId);
  if (categoryDomain) filterParams.set("category_domain", categoryDomain);
  if (selectedCategoryId) filterParams.set("category_id", selectedCategoryId);
  const returnQs = filterParams.toString();

  const editId = asText(sp.edit_id ?? "");
  const editingCategory = allCategoryRows.find((row) => row.id === editId) ?? null;
  const editKindValues = editingCategory
    ? parseCategoryKinds(editingCategory.applies_to_kinds)
    : categoryKind
      ? [categoryKind]
      : ["insumo"];
  const editKindSet = new Set(editKindValues);
  const editDomainValue = editingCategory
    ? normalizeCategoryDomain(editingCategory.domain)
    : shouldShowCategoryDomain(categoryKind)
      ? categoryDomain
      : "";

  const blockedParentIds = editingCategory
    ? collectDescendantIds(categoryMap, editingCategory.id)
    : new Set<string>();
  const parentOptions = allCategoryRows
    .filter((row) => !blockedParentIds.has(row.id))
    .sort((a, b) =>
      getCategoryPath(a.id, categoryMap).localeCompare(getCategoryPath(b.id, categoryMap), "es")
    );

  const clearEditParams = new URLSearchParams(filterParams);
  clearEditParams.delete("edit_id");
  const clearEditHref = buildPageUrl(clearEditParams);

  return (
    <div className="w-full space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Categorias de inventario</h1>
          <p className="mt-2 ui-body-muted">
            Gobernanza unica para categorias globales y por sede. Define aplicabilidad por tipo,
            dominio de venta y jerarquia.
          </p>
        </div>
        <Link href="/inventory/catalog" className="ui-btn ui-btn--ghost">
          Volver a catalogo
        </Link>
      </div>

      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <section className="ui-panel space-y-4">
        <div className="ui-h3">Filtros estandar</div>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
            <span className="ui-label">Buscar categoria</span>
            <input
              name="q"
              defaultValue={query}
              className="ui-input"
              placeholder="Nombre, ruta, dominio o sede"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Aplica a</span>
            <select name="category_kind" defaultValue={categoryKind ?? ""} className="ui-input">
              <option value="">Todas</option>
              <option value="insumo">Insumo</option>
              <option value="preparacion">Preparacion</option>
              <option value="venta">Venta</option>
              <option value="equipo">Equipo/activo</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Alcance</span>
            <select name="category_scope" defaultValue={categoryScope} className="ui-input">
              <option value="all">Todas</option>
              <option value="global">Globales</option>
              <option value="site">Sede activa</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede para categorias</span>
            <select name="category_site_id" defaultValue={categorySiteId} className="ui-input">
              <option value="">Seleccionar sede</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
          </label>

          {shouldShowCategoryDomain(categoryKind) ? (
            <label className="flex flex-col gap-1">
              <span className="ui-label">Dominio</span>
              <select name="category_domain" defaultValue={categoryDomain} className="ui-input">
                <option value="">Todos</option>
                {domainOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="category_domain" value="" />
          )}

          <CategoryTreeFilter
            categories={baseFilteredRows}
            selectedCategoryId={selectedCategoryId}
            siteNamesById={siteNamesById}
            className="sm:col-span-2 lg:col-span-4"
            label="Arbol de categorias"
            emptyOptionLabel="Todas"
            maxVisibleOptions={8}
          />

          <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
            <button type="submit" className="ui-btn ui-btn--brand">
              Aplicar filtros
            </button>
            <Link href="/inventory/settings/categories" className="ui-btn ui-btn--ghost">
              Limpiar
            </Link>
          </div>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="ui-panel-soft p-4">
          <div className="ui-caption">Productos sin categoria</div>
          <div className="mt-1 text-2xl font-semibold">{uncategorizedProductsCount}</div>
        </div>
        <div className="ui-panel-soft p-4">
          <div className="ui-caption">Categorias sin uso</div>
          <div className="mt-1 text-2xl font-semibold">{categoriesWithoutUsage.length}</div>
        </div>
        <div className="ui-panel-soft p-4">
          <div className="ui-caption">Jerarquia huerfana</div>
          <div className="mt-1 text-2xl font-semibold">{orphanCategories.length}</div>
        </div>
        <div className="ui-panel-soft p-4">
          <div className="ui-caption">Inconsistencias tipo/dominio</div>
          <div className="mt-1 text-2xl font-semibold">{inconsistentAssignments.length}</div>
        </div>
      </section>

      <section className="ui-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Arbol de categorias</div>
            <div className="mt-1 ui-body-muted">
              {visibleRows.length} categoria(s) visibles con los filtros actuales.
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="ui-table min-w-full text-sm">
            <thead className="text-left text-[var(--ui-muted)]">
              <tr>
                <th className="py-2 pr-4">Ruta</th>
                <th className="py-2 pr-4">Aplica a</th>
                <th className="py-2 pr-4">Dominio</th>
                <th className="py-2 pr-4">Alcance</th>
                <th className="py-2 pr-4">Productos</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2 pr-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const kinds = parseCategoryKinds(row.applies_to_kinds);
                const params = new URLSearchParams(filterParams);
                params.set("edit_id", row.id);
                const editHref = buildPageUrl(params);
                const usageCount = usageCountByCategory.get(row.id) ?? 0;
                return (
                  <tr key={row.id} className="border-t border-zinc-200/60">
                    <td className="py-3 pr-4">{getCategoryPath(row.id, categoryMap)}</td>
                    <td className="py-3 pr-4">{kinds.length ? kinds.join(", ") : "Sin definir"}</td>
                    <td className="py-3 pr-4">{getCategoryDomainLabel(row.domain) || "-"}</td>
                    <td className="py-3 pr-4">
                      {row.site_id ? `Sede: ${siteNamesById[row.site_id] ?? row.site_id}` : "Global"}
                    </td>
                    <td className="py-3 pr-4 font-mono">{usageCount}</td>
                    <td className="py-3 pr-4">{row.is_active === false ? "Inactiva" : "Activa"}</td>
                    <td className="py-3 pr-4">
                      <div className="flex gap-2">
                        <Link href={editHref} className="ui-btn ui-btn--ghost ui-btn--sm">
                          Editar
                        </Link>
                        {canManage ? (
                          <form action={toggleCategoryActiveAction}>
                            <input type="hidden" name="_return_qs" value={returnQs} />
                            <input type="hidden" name="category_id" value={row.id} />
                            <input
                              type="hidden"
                              name="next_is_active"
                              value={row.is_active === false ? "1" : "0"}
                            />
                            <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                              {row.is_active === false ? "Activar" : "Desactivar"}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!visibleRows.length ? (
                <tr>
                  <td className="py-4 text-[var(--ui-muted)]" colSpan={7}>
                    No hay categorias para mostrar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="ui-panel">
          <div className="ui-h3">Impacto por categoria</div>
          <div className="mt-4 overflow-x-auto">
            <table className="ui-table min-w-full text-sm">
              <thead className="text-left text-[var(--ui-muted)]">
                <tr>
                  <th className="py-2 pr-4">Categoria</th>
                  <th className="py-2 pr-4">Productos</th>
                </tr>
              </thead>
              <tbody>
                {topImpactRows.map(({ row, count }) => (
                  <tr key={row.id} className="border-t border-zinc-200/60">
                    <td className="py-3 pr-4">{getCategoryPath(row.id, categoryMap)}</td>
                    <td className="py-3 pr-4 font-mono">{count}</td>
                  </tr>
                ))}
                {!topImpactRows.length ? (
                  <tr>
                    <td className="py-4 text-[var(--ui-muted)]" colSpan={2}>
                      No hay datos de impacto.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ui-panel">
          <div className="ui-h3">Panel de salud</div>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <span className="font-medium">Categorias sin uso:</span> {categoriesWithoutUsage.length}
            </li>
            <li>
              <span className="font-medium">Categorias con tipo sin definir:</span> {unresolvedKinds.length}
            </li>
            <li>
              <span className="font-medium">Categorias huerfanas en arbol:</span> {orphanCategories.length}
            </li>
            <li>
              <span className="font-medium">Productos sin categoria:</span> {uncategorizedProductsCount}
            </li>
            <li>
              <span className="font-medium">Asignaciones inconsistentes:</span>{" "}
              {inconsistentAssignments.length}
            </li>
          </ul>
          {inconsistentAssignments.length > 0 ? (
            <div className="mt-4 max-h-56 overflow-auto rounded-lg border border-[var(--ui-border)] p-3 text-sm">
              {inconsistentAssignments.slice(0, 20).map((item) => (
                <div key={`${item.product_id}-${item.reason}`} className="py-1">
                  <span className="font-medium">{item.product_name}</span>: {item.reason} (
                  {item.category_path})
                </div>
              ))}
              {inconsistentAssignments.length > 20 ? (
                <div className="pt-2 text-[var(--ui-muted)]">
                  +{inconsistentAssignments.length - 20} inconsistencia(s) adicional(es)
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {!canManage ? (
        <div className="ui-alert ui-alert--warn">
          Solo propietarios y gerentes generales pueden crear o editar categorias.
        </div>
      ) : (
        <section className="ui-panel space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="ui-h3">
              {editingCategory ? "Editar categoria" : "Crear categoria"}
            </div>
            {editingCategory ? (
              <Link href={clearEditHref} className="ui-btn ui-btn--ghost ui-btn--sm">
                Limpiar edicion
              </Link>
            ) : null}
          </div>

          <form action={saveCategoryAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="_return_qs" value={returnQs} />
            {editingCategory ? <input type="hidden" name="id" value={editingCategory.id} /> : null}

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="ui-label">Nombre</span>
              <input
                name="name"
                defaultValue={editingCategory?.name ?? ""}
                className="ui-input"
                placeholder="Ej. Bebidas frias"
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Slug</span>
              <input
                name="slug"
                defaultValue={editingCategory ? slugify(editingCategory.name) : ""}
                className="ui-input"
                placeholder="bebidas-frias"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Alcance</span>
              <select
                name="site_id"
                defaultValue={editingCategory?.site_id ?? ""}
                className="ui-input"
              >
                <option value="">Global</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.id}
                  </option>
                ))}
              </select>
            </label>

            <CategoryTreeFilter
              categories={parentOptions}
              selectedCategoryId={editingCategory?.parent_id ?? ""}
              siteNamesById={siteNamesById}
              className="sm:col-span-2 lg:col-span-4"
              label="Categoria padre"
              name="parent_id"
              emptyOptionLabel="Sin padre (raiz)"
              maxVisibleOptions={8}
            />

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="ui-label">Dominio de venta</span>
              <select name="domain" defaultValue={editDomainValue} className="ui-input">
                <option value="">Sin dominio</option>
                {domainOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="ui-caption">Solo aplica cuando la categoria incluye tipo venta.</span>
            </label>

            <div className="sm:col-span-2">
              <div className="ui-label mb-2">Aplica a</div>
              <div className="flex flex-wrap gap-3">
                {CATEGORY_KINDS.map((kind) => (
                  <label key={kind} className="flex items-center gap-2 rounded-md border border-[var(--ui-border)] px-3 py-2">
                    <input
                      type="checkbox"
                      name="applies_to_kinds"
                      value={kind}
                      defaultChecked={editKindSet.has(kind)}
                    />
                    <span className="text-sm">{kind}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-end gap-2">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={editingCategory?.is_active !== false}
              />
              <span className="ui-label">Categoria activa</span>
            </label>

            <div className="flex items-end">
              <button type="submit" className="ui-btn ui-btn--brand">
                {editingCategory ? "Guardar cambios" : "Crear categoria"}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
