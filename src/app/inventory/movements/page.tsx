import Link from "next/link";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type SearchParams = {
  site_id?: string;
  type?: string;
  product?: string;
  from?: string;
  to?: string;
  error?: string;
};

const MOVEMENT_TYPES = [
  "receipt",
  "issue_internal",
  "transfer_out",
  "transfer_in",
  "adjustment",
  "count",
  "waste",
  "shrink",
];

type SiteRow = {
  site_id: string;
  is_primary: boolean | null;
};

function startOfDayIso(dateStr: string) {
  return `${dateStr}T00:00:00`;
}

function endOfDayIso(dateStr: string) {
  return `${dateStr}T23:59:59`;
}

export default async function InventoryMovementsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";

  const returnTo = "/inventory/movements";
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo,
    permissionCode: "inventory.movements",
  });

  const { data: sitesRows } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(50);

  const siteRows = (sitesRows ?? []) as SiteRow[];
  const defaultSiteId = sitesRows?.[0]?.site_id ?? "";
  const siteId = String(sp.site_id ?? defaultSiteId).trim();
  const movementType = String(sp.type ?? "").trim();
  const productId = String(sp.product ?? "").trim();
  const fromDate = String(sp.from ?? "").trim();
  const toDate = String(sp.to ?? "").trim();

  let q = supabase
    .from("inventory_movements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (siteId) q = q.eq("site_id", siteId);
  if (movementType) q = q.eq("movement_type", movementType);
  if (productId) q = q.eq("product_id", productId);
  if (fromDate) q = q.gte("created_at", startOfDayIso(fromDate));
  if (toDate) q = q.lte("created_at", endOfDayIso(toDate));

  const { data: rows, error } = await q;

  const movements = (rows ?? []) as any[];

  return (
    <div className="w-full px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Movimientos</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Ledger de inventario. Filtra por sede, tipo y producto para auditar cambios.
          </p>
        </div>

        <Link
          href="/scanner"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
        >
          Ir a Scanner
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
              {siteRows.map((s) => (
                <option key={s.site_id} value={s.site_id}>
                  {s.site_id}
                  {s.is_primary ? " (primary)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-600">Tipo</span>
            <select
              name="type"
              defaultValue={movementType}
              className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            >
              <option value="">Todos</option>
              {MOVEMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-600">Producto (product_id)</span>
            <input
              name="product"
              defaultValue={productId}
              placeholder="UUID producto"
              className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-600">Desde</span>
              <input
                type="date"
                name="from"
                defaultValue={fromDate}
                className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-600">Hasta</span>
              <input
                type="date"
                name="to"
                defaultValue={toDate}
                className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
              />
            </label>
          </div>

          <div className="sm:col-span-2 lg:col-span-4">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-500">
              Aplicar filtros
            </button>
          </div>
        </form>
      </div>

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Fallo el SELECT de movimientos: {error.message}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Movimientos</div>
        <div className="mt-1 text-sm text-zinc-600">Mostrando hasta 200 registros.</div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                <th className="border-b border-zinc-200 pb-2">Fecha</th>
                <th className="border-b border-zinc-200 pb-2">Tipo</th>
                <th className="border-b border-zinc-200 pb-2">Sede</th>
                <th className="border-b border-zinc-200 pb-2">Producto</th>
                <th className="border-b border-zinc-200 pb-2">Qty</th>
                <th className="border-b border-zinc-200 pb-2">Unidad</th>
                <th className="border-b border-zinc-200 pb-2">Ref</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((row) => {
                const createdAt = String(row.created_at ?? row.createdAt ?? "");
                const type = String(row.movement_type ?? row.type ?? row.kind ?? "");
                const site = String(row.site_id ?? "");
                const product = String(row.product_id ?? row.sku ?? row.item_id ?? "");
                const qty = String(row.quantity ?? row.qty ?? row.delta ?? "");
                const unit = String(row.unit ?? row.uom ?? "");
                const ref = String(
                  row.document_id ??
                    row.document_ref ??
                    row.reference ??
                    row.source_doc_id ??
                    ""
                );

                return (
                  <tr key={String(row.id ?? `${createdAt}-${product}-${qty}`)} className="text-sm text-zinc-800">
                    <td className="border-b border-zinc-100 py-3 font-mono">{createdAt}</td>
                    <td className="border-b border-zinc-100 py-3">{type}</td>
                    <td className="border-b border-zinc-100 py-3 font-mono">{site}</td>
                    <td className="border-b border-zinc-100 py-3 font-mono">{product}</td>
                    <td className="border-b border-zinc-100 py-3 font-mono">{qty}</td>
                    <td className="border-b border-zinc-100 py-3">{unit}</td>
                    <td className="border-b border-zinc-100 py-3 font-mono">{ref}</td>
                  </tr>
                );
              })}

              {!error && movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-sm text-zinc-500">
                    No hay movimientos para mostrar (o RLS no te permite verlos).
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
