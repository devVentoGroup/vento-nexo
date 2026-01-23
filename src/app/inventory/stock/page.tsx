import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type SearchParams = {
  site_id?: string;
  q?: string;
  product_type?: string;
  inventory_kind?: string;
  category_id?: string;
  error?: string;
  count_initial?: string;
  adjust?: string;
};

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  domain: string | null;
};

type StockRow = {
  site_id: string;
  product_id: string;
  current_qty: number | null;
  updated_at: string | null;
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

type ProductSiteRow = {
  product_id: string;
  is_active: boolean | null;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  if (value.length >= 10) return value.slice(0, 10);
  return value;
}

export default async function InventoryStockPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";

  const returnTo = "/inventory/stock";
  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo,
    permissionCode: PERMISSION,
  });

  const { data: employeeSites } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(50);

  const employeeSiteRows = (employeeSites ?? []) as EmployeeSiteRow[];
  const defaultSiteId = employeeSiteRows[0]?.site_id ?? "";
  const siteId = String(sp.site_id ?? defaultSiteId).trim();
  const searchQuery = String(sp.q ?? "").trim();
  const productType = String(sp.product_type ?? "").trim();
  const inventoryKind = String(sp.inventory_kind ?? "").trim();
  const categoryId = String(sp.category_id ?? "").trim();

  const siteIds = employeeSiteRows
    .map((row) => row.site_id)
    .filter((id): id is string => Boolean(id));

  const { data: sites } = siteIds.length
    ? await supabase
        .from("sites")
        .select("id,name")
        .in("id", siteIds)
        .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  const siteRows = (sites ?? []) as SiteRow[];
  const siteNameMap = new Map(siteRows.map((row) => [row.id, row.name ?? row.id]));

  const { data: categories } = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain")
    .order("name", { ascending: true });

  const categoryRows = (categories ?? []) as CategoryRow[];
  const categoryMap = new Map(categoryRows.map((row) => [row.id, row]));

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

  const { data: productSites } = siteId
    ? await supabase
        .from("product_site_settings")
        .select("product_id,is_active")
        .eq("site_id", siteId)
        .eq("is_active", true)
    : { data: [] as ProductSiteRow[] };

  const productSiteRows = (productSites ?? []) as ProductSiteRow[];
  const productSiteIds = productSiteRows.map((row) => row.product_id);
  const hasProductSiteFilter = productSiteIds.length > 0;

  let productsQuery = supabase
    .from("products")
    .select(
      "id,name,sku,unit,product_type,category_id,product_inventory_profiles(track_inventory,inventory_kind)"
    )
    .order("name", { ascending: true })
    .limit(500);

  if (searchQuery) {
    const pattern = `%${searchQuery}%`;
    productsQuery = productsQuery.or(`name.ilike.${pattern},sku.ilike.${pattern}`);
  }

  if (productType) {
    productsQuery = productsQuery.eq("product_type", productType);
  }

  if (categoryId) {
    productsQuery = productsQuery.eq("category_id", categoryId);
  }

  if (inventoryKind) {
    productsQuery = productsQuery.eq("product_inventory_profiles.inventory_kind", inventoryKind);
  }

  if (hasProductSiteFilter) {
    productsQuery = productsQuery.in("id", productSiteIds);
  }

  const { data: products, error: productError } = await productsQuery;
  const productRows = (products ?? []) as ProductRow[];

  const { data: stockData, error: stockError } = siteId
    ? await supabase
        .from("inventory_stock_by_site")
        .select("site_id,product_id,current_qty,updated_at")
        .eq("site_id", siteId)
    : { data: [] as StockRow[] };

  const stockRows = (stockData ?? []) as StockRow[];
  const stockMap = new Map(stockRows.map((row) => [row.product_id, row]));

  const negativeCount = stockRows.filter((row) => Number(row.current_qty ?? 0) < 0).length;
  const hasError = Boolean(productError || stockError);

  return (
    <div className="w-full px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock por sede</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Consulta el inventario actual por SKU y sede. Esta vista respeta los permisos por sitio.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/inventory/count-initial"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-500"
          >
            Conteo inicial
          </Link>
          <Link
            href="/inventory/movements"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
          >
            Ver movimientos
          </Link>
        </div>
      </div>

      {sp.count_initial === "1" ? (
        <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Conteo inicial registrado. Los movimientos y el stock se actualizaron.
        </div>
      ) : null}

      {sp.adjust === "1" ? (
        <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Ajuste registrado. El movimiento y el stock se actualizaron.
        </div>
      ) : null}

      {errorMsg ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error: {errorMsg}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Filtros</div>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-600">Sede</span>
            <select
              name="site_id"
              defaultValue={siteId}
              className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            >
              <option value="">Todas</option>
              {siteIds.map((id) => (
                <option key={id} value={id}>
                  {siteNameMap.get(id) ?? id}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-600">Tipo de producto</span>
            <select
              name="product_type"
              defaultValue={productType}
              className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            >
              {productTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-600">Tipo inventario</span>
            <select
              name="inventory_kind"
              defaultValue={inventoryKind}
              className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            >
              {inventoryKindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-600">Categoria</span>
            <select
              name="category_id"
              defaultValue={categoryId}
              className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            >
              <option value="">Todas</option>
              {categoryRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {categoryPath(row.id)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
            <span className="text-xs font-semibold text-zinc-600">Buscar SKU o nombre</span>
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="SKU o nombre de producto"
              className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            />
          </label>

          <div className="sm:col-span-2 lg:col-span-4">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-500">
              Aplicar filtros
            </button>
          </div>
        </form>
      </div>

      {hasError ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Fallo el SELECT de inventario: {productError?.message ?? stockError?.message}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Stock</div>
            <div className="mt-1 text-sm text-zinc-600">
              Mostrando hasta 500 productos.
            </div>
          </div>
          <div className="text-xs text-zinc-600">
            Items: {productRows.length} | Negativos: {negativeCount}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                <th className="border-b border-zinc-200 pb-2">Producto</th>
                <th className="border-b border-zinc-200 pb-2">SKU</th>
                <th className="border-b border-zinc-200 pb-2">Categoria</th>
                <th className="border-b border-zinc-200 pb-2">Tipo</th>
                <th className="border-b border-zinc-200 pb-2">Inventario</th>
                <th className="border-b border-zinc-200 pb-2">Track</th>
                <th className="border-b border-zinc-200 pb-2">Sede</th>
                <th className="border-b border-zinc-200 pb-2">Qty</th>
                <th className="border-b border-zinc-200 pb-2">Unidad</th>
                <th className="border-b border-zinc-200 pb-2">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {productRows.map((product) => {
                const stockRow = stockMap.get(product.id);
                const qtyValue = Number(stockRow?.current_qty ?? 0);
                const qtyClass =
                  product.product_inventory_profiles?.track_inventory && qtyValue < 0
                    ? "text-red-600 font-semibold"
                    : "text-zinc-800";
                const sku = product.sku ?? "-";
                const unit = product.unit ?? "-";
                const siteLabel = siteId ? siteNameMap.get(siteId) ?? siteId : "Todas";
                const categoryLabel = categoryPath(product.category_id);
                const inventoryProfile = product.product_inventory_profiles;
                const inventoryLabel = inventoryProfile?.inventory_kind ?? "unclassified";
                const trackLabel = inventoryProfile?.track_inventory ? "si" : "no";

                return (
                  <tr key={product.id} className="text-sm text-zinc-800">
                    <td className="border-b border-zinc-100 py-3">{product.name}</td>
                    <td className="border-b border-zinc-100 py-3 font-mono">{sku}</td>
                    <td className="border-b border-zinc-100 py-3">{categoryLabel}</td>
                    <td className="border-b border-zinc-100 py-3">{product.product_type}</td>
                    <td className="border-b border-zinc-100 py-3">{inventoryLabel}</td>
                    <td className="border-b border-zinc-100 py-3">{trackLabel}</td>
                    <td className="border-b border-zinc-100 py-3 font-mono">{siteLabel}</td>
                    <td className={`border-b border-zinc-100 py-3 font-mono ${qtyClass}`}>
                      {Number.isFinite(qtyValue) ? qtyValue : "-"}
                    </td>
                    <td className="border-b border-zinc-100 py-3">{unit}</td>
                    <td className="border-b border-zinc-100 py-3 font-mono">
                      {formatDate(stockRow?.updated_at)}
                    </td>
                  </tr>
                );
              })}

              {!hasError && productRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-6 text-sm text-zinc-500">
                    No hay productos para mostrar (o RLS no te permite verlo).
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
