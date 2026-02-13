import Link from "next/link";

import { CategoryTreeFilter } from "@/components/inventory/CategoryTreeFilter";
import { requireAppAccess } from "@/lib/auth/guard";
import { getCategoryDomainOptions } from "@/lib/constants";
import {
  categoryKindFromCatalogTab,
  collectDescendantIds,
  filterCategoryRows,
  filterCategoryRowsDirect,
  getCategoryDomainCodes,
  getCategoryPath,
  normalizeCategoryDomain,
  normalizeCategoryScope,
  shouldShowCategoryDomain,
  type InventoryCategoryRow,
} from "@/lib/inventory/categories";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

const TAB_OPTIONS = [
  { value: "insumos", label: "Insumos" },
  { value: "preparaciones", label: "Preparaciones" },
  { value: "productos", label: "Productos" },
  { value: "equipos", label: "Equipos y activos" },
] as const;

type TabValue = (typeof TAB_OPTIONS)[number]["value"];

type SearchParams = {
  q?: string;
  tab?: string;
  site_id?: string;
  category_kind?: string;
  category_domain?: string;
  category_scope?: string;
  category_site_id?: string;
  category_id?: string;
  ok?: string;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  product_type: string;
  category_id: string | null;
  product_inventory_profiles?: {
    track_inventory: boolean;
    inventory_kind: string;
  } | null;
};

type SiteRow = {
  id: string;
  name: string | null;
};

async function loadCategoryRows(
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

function tabTypeValue(tab: TabValue): string {
  if (tab === "preparaciones") return "preparacion";
  if (tab === "productos") return "venta";
  return "insumo";
}

export default async function InventoryCatalogPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? "Cambios guardados." : "";
  const searchQuery = String(sp.q ?? "").trim();

  const tabRaw = String(sp.tab ?? "insumos").trim().toLowerCase();
  const activeTab: TabValue = TAB_OPTIONS.some((t) => t.value === tabRaw)
    ? (tabRaw as TabValue)
    : "insumos";

  const categoryKind = categoryKindFromCatalogTab(activeTab);
  const categoryId = String(sp.category_id ?? "").trim();

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/catalog",
    permissionCode: PERMISSION,
  });

  const [{ data: employee }, { data: settings }, { data: sites }] = await Promise.all([
    supabase.from("employees").select("site_id").eq("id", user.id).maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", user.id)
      .maybeSingle(),
    supabase.from("sites").select("id,name").eq("is_active", true).order("name", { ascending: true }),
  ]);

  const siteRows = (sites ?? []) as SiteRow[];
  const siteNamesById = Object.fromEntries(siteRows.map((row) => [row.id, row.name ?? row.id]));

  const siteId = String(
    sp.site_id ??
      (settings as { selected_site_id?: string | null } | null)?.selected_site_id ??
      (employee as { site_id?: string | null } | null)?.site_id ??
      ""
  ).trim();
  const activeSiteId = String(sp.category_site_id ?? siteId).trim();

  const defaultScope = activeSiteId ? "site" : "all";
  const categoryScope = normalizeCategoryScope(sp.category_scope ?? defaultScope);

  const categoryDomain = shouldShowCategoryDomain(categoryKind)
    ? normalizeCategoryDomain(sp.category_domain)
    : "";

  const allCategoryRows = await loadCategoryRows(supabase);

  const categoryRows = filterCategoryRows(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: activeSiteId,
  });

  const directCategoryRows = filterCategoryRowsDirect(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: activeSiteId,
  });

  const directCategoryIds = new Set(directCategoryRows.map((row) => row.id));
  const categoryMap = new Map(allCategoryRows.map((row) => [row.id, row]));

  let effectiveCategoryIds: string[] | null = null;
  if (categoryId) {
    const descendantIds = Array.from(collectDescendantIds(categoryMap, categoryId));
    effectiveCategoryIds = descendantIds.filter((id) => directCategoryIds.has(id));
  } else if (directCategoryRows.length > 0) {
    effectiveCategoryIds = directCategoryRows.map((row) => row.id);
  }

  const categoryDomainOptions = getCategoryDomainOptions(
    getCategoryDomainCodes(allCategoryRows, categoryKind)
  );

  let productRows: ProductRow[] = [];
  if (effectiveCategoryIds !== null && effectiveCategoryIds.length === 0) {
    productRows = [];
  } else {
    let productsQuery = supabase
      .from("products")
      .select(
        "id,name,sku,unit,product_type,category_id,product_inventory_profiles(track_inventory,inventory_kind)"
      )
      .order("name", { ascending: true })
      .limit(1200);

    if (searchQuery) {
      const pattern = `%${searchQuery}%`;
      productsQuery = productsQuery.or(`name.ilike.${pattern},sku.ilike.${pattern}`);
    }

    if (effectiveCategoryIds && effectiveCategoryIds.length > 0) {
      productsQuery = productsQuery.in("category_id", effectiveCategoryIds);
    }

    if (activeTab === "equipos") {
      productsQuery = productsQuery
        .eq("product_type", "insumo")
        .eq("product_inventory_profiles.inventory_kind", "asset");
    } else {
      productsQuery = productsQuery.eq("product_type", tabTypeValue(activeTab));
    }

    const { data: products } = await productsQuery;
    productRows = (products ?? []) as unknown as ProductRow[];

    if (activeTab === "insumos") {
      productRows = productRows.filter(
        (product) => product.product_inventory_profiles?.inventory_kind !== "asset"
      );
    }
  }

  const buildUrl = (newTab?: TabValue) => {
    const tab = newTab ?? activeTab;
    const tabKind = categoryKindFromCatalogTab(tab);
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    params.set("tab", tab);
    if (siteId) params.set("site_id", siteId);
    params.set("category_kind", tabKind);
    params.set("category_scope", categoryScope);
    if (activeSiteId) params.set("category_site_id", activeSiteId);
    if (categoryId) params.set("category_id", categoryId);
    if (shouldShowCategoryDomain(tabKind) && categoryDomain) {
      params.set("category_domain", categoryDomain);
    }
    return `/inventory/catalog?${params.toString()}`;
  };

  const catalogReturnUrl = buildUrl();

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Catalogo</h1>
          <p className="mt-2 ui-body-muted">Abre cualquier item para ver su ficha.</p>
        </div>
        <Link href="/inventory/stock" className="ui-btn ui-btn--ghost">
          Ver stock
        </Link>
      </div>

      {okMsg ? <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="mt-6 flex gap-1 overflow-x-auto ui-panel-soft p-1">
        {TAB_OPTIONS.map((tab) => (
          <Link
            key={tab.value}
            href={buildUrl(tab.value)}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-sm"
                : "text-[var(--ui-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Link
          href={`/inventory/catalog/new?type=${
            activeTab === "insumos"
              ? "insumo"
              : activeTab === "preparaciones"
                ? "preparacion"
                : activeTab === "equipos"
                  ? "asset"
                  : "venta"
          }`}
          className="ui-btn ui-btn--brand ui-btn--sm"
        >
          + Crear {activeTab === "insumos" ? "insumo" : activeTab === "preparaciones" ? "preparacion" : activeTab === "equipos" ? "equipo" : "producto"}
        </Link>
      </div>

      <div className="mt-4 ui-panel">
        <div className="ui-h3">Filtros</div>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="tab" value={activeTab} />
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="category_kind" value={categoryKind} />

          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
            <span className="ui-label">Buscar SKU o nombre</span>
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="SKU o nombre de producto"
              className="ui-input"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Alcance de categoria</span>
            <select name="category_scope" defaultValue={categoryScope} className="ui-input">
              <option value="all">Todas</option>
              <option value="global">Globales</option>
              <option value="site">Sede activa</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede para categorias</span>
            <select name="category_site_id" defaultValue={activeSiteId} className="ui-input">
              <option value="">Seleccionar sede</option>
              {siteRows.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
          </label>

          {shouldShowCategoryDomain(categoryKind) ? (
            <label className="flex flex-col gap-1">
              <span className="ui-label">Dominio de venta</span>
              <select name="category_domain" defaultValue={categoryDomain} className="ui-input">
                <option value="">Todos</option>
                {categoryDomainOptions.map((option) => (
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
            categories={categoryRows}
            selectedCategoryId={categoryId}
            siteNamesById={siteNamesById}
            className="sm:col-span-2 lg:col-span-4"
            label="Categoria"
            emptyOptionLabel="Todas"
            maxVisibleOptions={10}
          />

          <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
            <button className="ui-btn ui-btn--brand">Aplicar filtros</button>
            <Link
              href={`/inventory/catalog?tab=${activeTab}${siteId ? `&site_id=${encodeURIComponent(siteId)}` : ""}&category_kind=${categoryKind}`}
              className="ui-btn ui-btn--ghost"
            >
              Limpiar
            </Link>
          </div>
        </form>
      </div>

      <div className="mt-6 ui-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="ui-h3">{TAB_OPTIONS.find((t) => t.value === activeTab)?.label ?? "Productos"}</div>
            <div className="mt-1 ui-body-muted">Mostrando hasta 1200 items.</div>
          </div>
          <div className="ui-caption">Items: {productRows.length}</div>
        </div>

        <div className="mt-4 max-h-[70vh] overflow-auto">
          <table className="ui-table min-w-full text-sm">
            <thead className="text-left text-[var(--ui-muted)]">
              <tr>
                <th className="py-2 pr-4">Producto</th>
                <th className="py-2 pr-4">SKU</th>
                <th className="py-2 pr-4">Categoria</th>
                <th className="py-2 pr-4">Tipo</th>
                <th className="py-2 pr-4">Inventario</th>
                <th className="py-2 pr-4">Unidad</th>
                <th className="py-2 pr-4">Ficha</th>
              </tr>
            </thead>
            <tbody>
              {productRows.map((product) => {
                const inventoryProfile = product.product_inventory_profiles;
                const inventoryLabel = inventoryProfile?.inventory_kind ?? "unclassified";
                return (
                  <tr key={product.id} className="border-t border-zinc-200/60">
                    <td className="py-3 pr-4">{product.name}</td>
                    <td className="py-3 pr-4 font-mono">{product.sku ?? "-"}</td>
                    <td className="py-3 pr-4">{getCategoryPath(product.category_id, categoryMap)}</td>
                    <td className="py-3 pr-4">{product.product_type}</td>
                    <td className="py-3 pr-4">{inventoryLabel}</td>
                    <td className="py-3 pr-4">{product.unit ?? "-"}</td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/inventory/catalog/${product.id}?from=${encodeURIComponent(catalogReturnUrl)}`}
                        className="font-semibold underline decoration-zinc-200 underline-offset-4"
                      >
                        Ver ficha
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!productRows.length ? (
                <tr>
                  <td className="py-4 text-[var(--ui-muted)]" colSpan={7}>
                    No hay productos para mostrar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
