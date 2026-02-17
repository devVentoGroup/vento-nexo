import Link from "next/link";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { safeDecodeURIComponent } from "@/lib/url";

export const dynamic = "force-dynamic";

type SearchParams = {
  site_id?: string;
  type?: string;
  product?: string;
  from?: string;
  to?: string;
  error?: string;
};

// Tipos usados en inventory_movements; agrupados para filtro (6.1)
const MOVEMENT_TYPES_BY_GROUP: { label: string; types: string[] }[] = [
  { label: "Ajuste", types: ["adjustment", "initial_count", "count"] },
  {
    label: "Entrada",
    types: ["receipt_in", "receipt", "purchase_in", "restock_in", "production_in"],
  },
  {
    label: "Salida",
    types: ["consumption", "sale_out", "restock_out", "production_out", "issue_internal", "waste", "shrink"],
  },
  { label: "Traslado", types: ["transfer_internal", "transfer_in", "transfer_out"] },
];
type SiteRow = {
  site_id: string;
  is_primary: boolean | null;
};

type SiteNameRow = {
  id: string;
  name: string | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
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
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

  const returnTo = "/inventory/movements";
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo,
    permissionCode: "inventory.movements",
  });

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const canExportMovements = ["gerente_general", "propietario"].includes(
    String((employeeRow as { role?: string } | null)?.role ?? "")
  );

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

  const siteIds = siteRows
    .map((row) => row.site_id)
    .filter((id): id is string => Boolean(id));

  const { data: sites } = siteIds.length
    ? await supabase
        .from("sites")
        .select("id,name")
        .in("id", siteIds)
    : { data: [] as SiteNameRow[] };

  const siteNameMap = new Map(
    ((sites ?? []) as SiteNameRow[]).map((s: SiteNameRow) => [s.id, s.name ?? s.id])
  );

  const { data: productsData } = await supabase
    .from("product_inventory_profiles")
    .select("product_id, products(id,name,sku)")
    .eq("track_inventory", true)
    .order("product_id", { ascending: true })
    .limit(500);

  type ProductProfileRow = { product_id: string; products: ProductRow | null };
  type MovementRow = {
    id: string;
    site_id: string;
    product_id: string;
    movement_type: string;
    quantity: number;
    input_qty?: number | null;
    input_unit_code?: string | null;
    conversion_factor_to_stock?: number | null;
    stock_unit_code?: string | null;
    note?: string | null;
    created_at?: string | null;
    product?: ProductRow | null;
  };
  const productOptions = ((productsData ?? []) as unknown as ProductProfileRow[])
    .map((r) => r.products)
    .filter((p): p is ProductRow => Boolean(p))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  let q = supabase
    .from("inventory_movements")
    .select(
      "id,site_id,product_id,movement_type,quantity,input_qty,input_unit_code,conversion_factor_to_stock,stock_unit_code,note,created_at, product:products(id,name,sku,unit,stock_unit_code)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (siteId) q = q.eq("site_id", siteId);
  if (movementType) q = q.eq("movement_type", movementType);
  if (productId) q = q.eq("product_id", productId);
  if (fromDate) q = q.gte("created_at", startOfDayIso(fromDate));
  if (toDate) q = q.lte("created_at", endOfDayIso(toDate));

  const { data: rows, error } = await q;

  const movements = (rows ?? []) as unknown as MovementRow[];

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Movimientos</h1>
          <p className="mt-2 ui-body-muted">
            Ledger de inventario. Filtra por sede, tipo y producto para auditar cambios.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canExportMovements ? (
            <a
              href={`/api/inventory/movements/export?${new URLSearchParams({
                ...(siteId ? { site_id: siteId } : {}),
                ...(movementType ? { type: movementType } : {}),
                ...(productId ? { product: productId } : {}),
                ...(fromDate ? { from: fromDate } : {}),
                ...(toDate ? { to: toDate } : {}),
              }).toString()}`}
              className="ui-btn ui-btn--ghost"
              download="movimientos.csv"
            >
              Exportar CSV
            </a>
          ) : null}
          <Link href="/scanner" className="ui-btn ui-btn--ghost">
            Ir a Scanner
          </Link>
        </div>
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
            <span className="ui-label">Sede</span>
            <select
              name="site_id"
              defaultValue={siteId}
              className="ui-input"
            >
              <option value="">Todas</option>
              {siteRows.map((s) => (
                <option key={s.site_id} value={s.site_id}>
                  {siteNameMap.get(s.site_id) ?? s.site_id}
                  {s.is_primary ? " (principal)" : ""}
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
              {MOVEMENT_TYPES_BY_GROUP.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Producto</span>
            <select
              name="product"
              defaultValue={productId}
              className="ui-input"
            >
              <option value="">Todos</option>
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.id} {p.sku ? `(${p.sku})` : ""}
                </option>
              ))}
            </select>
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
                <TableHeaderCell>Captura</TableHeaderCell>
                <TableHeaderCell>Ref</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {movements.map((row) => {
                const createdAt = String(row.created_at ?? "");
                const type = String(row.movement_type ?? "");
                const site = String(row.site_id ?? "");
                const product = row.product ?? null;
                const productLabel = product?.name ?? row.product_id ?? "";
                const productSku = product?.sku ?? "";
                const qty = String(row.quantity ?? "");
                const unit = String(row.stock_unit_code ?? product?.stock_unit_code ?? product?.unit ?? "");
                const inputQty = row.input_qty;
                const inputUnit = row.input_unit_code ?? "";
                const factor = row.conversion_factor_to_stock;
                const ref = String((row as { note?: string | null }).note ?? "");
                const captureLabel =
                  inputQty != null && inputUnit
                    ? `${inputQty} ${inputUnit}${factor && factor !== 1 ? ` (x${factor})` : ""}`
                    : "-";

                return (
                  <tr key={String(row.id ?? `${createdAt}-${product}-${qty}`)} className="ui-body">
                    <TableCell className="font-mono">{createdAt}</TableCell>
                    <TableCell>{type}</TableCell>
                    <TableCell className="font-mono">{siteNameMap.get(site) ?? site}</TableCell>
                    <TableCell>
                      <div className="font-mono">{productLabel}</div>
                      {productSku ? <div className="ui-caption">{productSku}</div> : null}
                    </TableCell>
                    <TableCell className="font-mono">{qty}</TableCell>
                    <TableCell>{unit}</TableCell>
                    <TableCell className="font-mono">{captureLabel}</TableCell>
                    <TableCell className="font-mono">{ref}</TableCell>
                  </tr>
                );
              })}

              {!error && movements.length === 0 ? (
                <tr>
                  <TableCell colSpan={8} className="ui-empty">
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


