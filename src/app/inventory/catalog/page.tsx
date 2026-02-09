import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { getCategoryDomainLabel } from "@/lib/constants";

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
  category_id?: string;
  category_domain?: string;
};

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  domain: string | null;
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

export default async function InventoryCatalogPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const searchQuery = String(sp.q ?? "").trim();
  const tabRaw = String(sp.tab ?? "insumos").trim().toLowerCase();
  const activeTab: TabValue = TAB_OPTIONS.some((t) => t.value === tabRaw) ? (tabRaw as TabValue) : "insumos";
  const categoryId = String(sp.category_id ?? "").trim();
  const categoryDomain = String(sp.category_domain ?? "").trim();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/catalog",
    permissionCode: PERMISSION,
  });

  const { data: categories } = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain")
    .order("name", { ascending: true });

  const allCategoryRows = (categories ?? []) as CategoryRow[];
  const categoryMap = new Map(allCategoryRows.map((row) => [row.id, row]));

  const categoryPath = (id: string | null) => {
    if (!id) return "Sin categoria";
    const parts: string[] = [];
    let current = categoryMap.get(id);
    let safety = 0;
    while (current && safety < 6) {
      parts.unshift(current.name);
      current = current.parent_id ? categoryMap.get(current.parent_id) : undefined;
      safety += 1;
    }
    return parts.join(" / ");
  };

  const categoryRows = (() => {
    if (!categoryDomain) return allCategoryRows;
    const withDomain = allCategoryRows.filter((row) => row.domain === categoryDomain);
    const ancestorIds = new Set<string>();
    for (const row of withDomain) {
      let current = row.parent_id ? categoryMap.get(row.parent_id) : null;
      let safety = 0;
      while (current && safety < 10) {
        ancestorIds.add(current.id);
        current = current.parent_id ? categoryMap.get(current.parent_id) : null;
        safety += 1;
      }
    }
    return allCategoryRows.filter((row) => row.domain === categoryDomain || ancestorIds.has(row.id));
  })();

  const displayPath = (row: CategoryRow) => {
    const path = categoryPath(row.id);
    const label = row.domain ? getCategoryDomainLabel(row.domain) : "";
    return label ? `${path} (${label})` : path;
  };

  const orderedCategories = categoryRows
    .map((row) => ({
      id: row.id,
      path: displayPath(row),
    }))
    .sort((a, b) => a.path.localeCompare(b.path, "es"));

  const categoryDomainOptions = [
    { value: "", label: "Todas las marcas" },
    { value: "SAU", label: "Saudo" },
    { value: "VCF", label: "Vento Café" },
  ];

  const filteredCategoryIds =
    categoryDomain ? allCategoryRows.filter((r) => r.domain === categoryDomain).map((r) => r.id) : [];

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

  if (categoryId) {
    productsQuery = productsQuery.eq("category_id", categoryId);
  } else if (categoryDomain && filteredCategoryIds.length > 0) {
    productsQuery = productsQuery.in("category_id", filteredCategoryIds);
  }

  if (activeTab === "equipos") {
    productsQuery = productsQuery.eq("product_inventory_profiles.inventory_kind", "asset");
  } else {
    const typeMap: Record<Exclude<TabValue, "equipos">, string> = {
      insumos: "insumo",
      preparaciones: "preparacion",
      productos: "venta",
    };
    productsQuery = productsQuery.eq("product_type", typeMap[activeTab]);
  }

  const { data: products } = await productsQuery;
  let productRows = (products ?? []) as unknown as ProductRow[];

  if (activeTab === "equipos") {
    productRows = productRows.filter((p) => p.product_inventory_profiles?.inventory_kind === "asset");
  } else {
    productRows = productRows.filter((p) => {
      const kind = p.product_inventory_profiles?.inventory_kind;
      return kind !== "asset";
    });
  }

  const buildUrl = (newTab?: TabValue) => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    params.set("tab", newTab ?? activeTab);
    if (categoryId) params.set("category_id", categoryId);
    if (categoryDomain) params.set("category_domain", categoryDomain);
    return `/inventory/catalog?${params.toString()}`;
  };

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Catálogo</h1>
          <p className="mt-2 ui-body-muted">
            Abre cualquier item para ver su ficha.
          </p>
        </div>
        <Link href="/inventory/stock" className="ui-btn ui-btn--ghost">
          Ver stock
        </Link>
      </div>

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
            activeTab === "insumos" ? "insumo" : activeTab === "preparaciones" ? "preparacion" : activeTab === "equipos" ? "asset" : "venta"
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
            <span className="ui-label">Marca / punto de venta</span>
            <select name="category_domain" defaultValue={categoryDomain} className="ui-input">
              {categoryDomainOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Categoria</span>
            <select name="category_id" defaultValue={categoryId} className="ui-input">
              <option value="">Todas</option>
              {orderedCategories.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.path}
                </option>
              ))}
            </select>
          </label>

          <div className="sm:col-span-2 lg:col-span-4">
            <button className="ui-btn ui-btn--brand">Aplicar filtros</button>
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
                    <td className="py-3 pr-4">{categoryPath(product.category_id)}</td>
                    <td className="py-3 pr-4">{product.product_type}</td>
                    <td className="py-3 pr-4">{inventoryLabel}</td>
                    <td className="py-3 pr-4">{product.unit ?? "-"}</td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/inventory/catalog/${product.id}`}
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
