import Link from "next/link";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";
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

// Incluye los de inventory_movement_types en la BD (initial_count, restock_*, etc.) y aliases habituales
const MOVEMENT_TYPES = [
  "adjustment",
  "initial_count",
  "production_in",
  "production_out",
  "purchase_in",
  "restock_in",
  "restock_out",
  "sale_out",
  "transfer_in",
  "transfer_out",
  "receipt",
  "issue_internal",
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
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Movimientos</h1>
          <p className="mt-2 ui-body-muted">
            Ledger de inventario. Filtra por sede, tipo y producto para auditar cambios.
          </p>
        </div>

        <Link
          href="/scanner"
          className="ui-btn ui-btn--ghost"
        >
          Ir a Scanner
        </Link>
      </div>

      {errorMsg ? (
        <div className="mt-6 ui-alert ui-alert--error">
          Error: {errorMsg}
        </div>
      ) : null}

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Filtros</div>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede (site_id)</span>
            <select
              name="site_id"
              defaultValue={siteId}
              className="ui-input"
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
            <span className="ui-label">Tipo</span>
            <select
              name="type"
              defaultValue={movementType}
              className="ui-input"
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
            <span className="ui-label">Producto (product_id)</span>
            <input
              name="product"
              defaultValue={productId}
              placeholder="UUID producto"
              className="ui-input"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Desde</span>
              <input
                type="date"
                name="from"
                defaultValue={fromDate}
                className="ui-input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Hasta</span>
              <input
                type="date"
                name="to"
                defaultValue={toDate}
                className="ui-input"
              />
            </label>
          </div>

          <div className="sm:col-span-2 lg:col-span-4">
            <button className="ui-btn ui-btn--brand">
              Aplicar filtros
            </button>
          </div>
        </form>
      </div>

      {error ? (
        <div className="mt-6 ui-alert ui-alert--error">
          Fallo el SELECT de movimientos: {error.message}
        </div>
      ) : null}

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Movimientos</div>
        <div className="mt-1 ui-body-muted">Mostrando hasta 200 registros.</div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>Qty</TableHeaderCell>
                <TableHeaderCell>Unidad</TableHeaderCell>
                <TableHeaderCell>Ref</TableHeaderCell>
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
                  <tr key={String(row.id ?? `${createdAt}-${product}-${qty}`)} className="ui-body">
                    <TableCell className="font-mono">{createdAt}</TableCell>
                    <TableCell>{type}</TableCell>
                    <TableCell className="font-mono">{site}</TableCell>
                    <TableCell className="font-mono">{product}</TableCell>
                    <TableCell className="font-mono">{qty}</TableCell>
                    <TableCell>{unit}</TableCell>
                    <TableCell className="font-mono">{ref}</TableCell>
                  </tr>
                );
              })}

              {!error && movements.length === 0 ? (
                <tr>
                  <TableCell colSpan={7} className="ui-empty">
                    No hay movimientos para mostrar (o RLS no te permite verlos).
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}


