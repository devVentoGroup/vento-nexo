import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type SearchParams = {
  site_id?: string;
  q?: string;
  error?: string;
};

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
};

type StockRow = {
  site_id: string;
  product_id: string;
  current_qty: number | null;
  updated_at: string | null;
  product?: {
    name?: string | null;
    sku?: string | null;
    unit?: string | null;
  } | null;
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

  let matchedProductIds: string[] | null = null;

  if (searchQuery) {
    const pattern = `%${searchQuery}%`;
    const { data: products } = await supabase
      .from("products")
      .select("id")
      .or(`id.eq.${searchQuery},name.ilike.${pattern},sku.ilike.${pattern}`)
      .limit(200);

    matchedProductIds = (products ?? [])
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id));
  }

  let stockRows: StockRow[] = [];
  let stockError: { message: string } | null = null;

  if (!matchedProductIds || matchedProductIds.length > 0) {
    let query = supabase
      .from("inventory_stock_by_site")
      .select("site_id,product_id,current_qty,updated_at,product:products(name,sku,unit)")
      .order("updated_at", { ascending: false })
      .limit(300);

    if (siteId) query = query.eq("site_id", siteId);
    if (matchedProductIds) query = query.in("product_id", matchedProductIds);

    const { data, error } = await query;
    stockRows = (data ?? []) as StockRow[];
    stockError = error ? { message: error.message } : null;
  }

  const negativeCount = stockRows.filter((row) => Number(row.current_qty ?? 0) < 0).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock por sede</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Consulta el inventario actual por SKU y sede. Esta vista respeta los permisos por sitio.
          </p>
        </div>

        <Link
          href="/inventory/movements"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
        >
          Ver movimientos
        </Link>
      </div>

      {errorMsg ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error: {errorMsg}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Filtros</div>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-600">Sede (site_id)</span>
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

          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-semibold text-zinc-600">Buscar SKU o nombre</span>
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="SKU, UUID o nombre de producto"
              className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            />
          </label>

          <div className="sm:col-span-2 lg:col-span-4">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800">
              Aplicar filtros
            </button>
          </div>
        </form>
      </div>

      {stockError ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Fallo el SELECT de stock: {stockError.message}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Stock</div>
            <div className="mt-1 text-sm text-zinc-600">
              Mostrando hasta 300 registros.
            </div>
          </div>
          <div className="text-xs text-zinc-600">
            SKUs: {stockRows.length} · Negativos: {negativeCount}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                <th className="border-b border-zinc-200 pb-2">Producto</th>
                <th className="border-b border-zinc-200 pb-2">SKU</th>
                <th className="border-b border-zinc-200 pb-2">Sede</th>
                <th className="border-b border-zinc-200 pb-2">Qty</th>
                <th className="border-b border-zinc-200 pb-2">Unidad</th>
                <th className="border-b border-zinc-200 pb-2">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {stockRows.map((row) => {
                const qtyValue = Number(row.current_qty ?? 0);
                const qtyClass = qtyValue < 0 ? "text-red-600 font-semibold" : "text-zinc-800";
                const productName = row.product?.name ?? row.product_id;
                const sku = row.product?.sku ?? "-";
                const unit = row.product?.unit ?? "-";
                const siteLabel = siteNameMap.get(row.site_id) ?? row.site_id;

                return (
                  <tr key={`${row.site_id}-${row.product_id}`} className="text-sm text-zinc-800">
                    <td className="border-b border-zinc-100 py-3">{productName}</td>
                    <td className="border-b border-zinc-100 py-3 font-mono">{sku}</td>
                    <td className="border-b border-zinc-100 py-3 font-mono">{siteLabel}</td>
                    <td className={`border-b border-zinc-100 py-3 font-mono ${qtyClass}`}>
                      {Number.isFinite(qtyValue) ? qtyValue : "-"}
                    </td>
                    <td className="border-b border-zinc-100 py-3">{unit}</td>
                    <td className="border-b border-zinc-100 py-3 font-mono">
                      {formatDate(row.updated_at)}
                    </td>
                  </tr>
                );
              })}

              {!stockError && stockRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-sm text-zinc-500">
                    No hay stock para mostrar (o RLS no te permite verlo).
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
