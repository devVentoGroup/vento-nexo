import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { getCategoryDomainLabel } from "@/lib/constants";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type SearchParams = {
  q?: string;
  product_type?: string;
  inventory_kind?: string;
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
  const productType = String(sp.product_type ?? "").trim();
  const inventoryKind = String(sp.inventory_kind ?? "").trim();
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

  const productTypeOptions = [
    { value: "", label: "Todos los tipos" },
    { value: "insumo", label: "Insumo" },
    { value: "preparacion", label: "Preparacion" },
    { value: "venta", label: "Venta" },
  ];

  const inventoryKindOptions = [
    { value: "", label: "Todos los tipos de inventario" },
    { value: "ingredient", label: "Insumo" },
    { value: "finished", label: "Producto terminado" },
    { value: "resale", label: "Reventa" },
    { value: "packaging", label: "Empaque" },
    { value: "asset", label: "Activo (maquinaria/utensilios)" },
  ];

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

  if (productType) {
    productsQuery = productsQuery.eq("product_type", productType);
  }

  if (categoryId) {
    productsQuery = productsQuery.eq("category_id", categoryId);
  } else if (categoryDomain && filteredCategoryIds.length > 0) {
    productsQuery = productsQuery.in("category_id", filteredCategoryIds);
  }

  if (inventoryKind) {
    productsQuery = productsQuery.eq("product_inventory_profiles.inventory_kind", inventoryKind);
  }

  const { data: products } = await productsQuery;
  const productRows = (products ?? []) as unknown as ProductRow[];

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Catálogo de inventario</h1>
          <p className="mt-2 ui-body-muted">
            Vista completa del maestro de productos. Abre cualquier item para ver toda su ficha.
          </p>
        </div>
        <Link href="/inventory/stock" className="ui-btn ui-btn--ghost">
          Ver stock
        </Link>
      </div>

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Filtros</div>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <span className="ui-label">Tipo inventario</span>
            <select name="inventory_kind" defaultValue={inventoryKind} className="ui-input">
              {inventoryKindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Tipo de producto</span>
            <select name="product_type" defaultValue={productType} className="ui-input">
              {productTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            <div className="ui-h3">Productos</div>
            <div className="mt-1 ui-body-muted">Mostrando hasta 1200 productos.</div>
          </div>
          <div className="ui-caption">Items: {productRows.length}</div>
        </div>

        <div className="mt-4 max-h-[70vh] overflow-auto">
          <table className="min-w-full text-sm">
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
