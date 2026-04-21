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

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  adjustment: "Ajuste",
  initial_count: "Conteo inicial",
  count: "Conteo",
  receipt_in: "Entrada",
  receipt: "Entrada",
  purchase_in: "Compra recibida",
  restock_in: "Entrada por remision",
  production_in: "Ingreso de produccion",
  consumption: "Retiro",
  sale_out: "Salida por venta",
  restock_out: "Salida por remision",
  production_out: "Salida a produccion",
  issue_internal: "Consumo interno",
  waste: "Merma",
  shrink: "Perdida",
  transfer_internal: "Traslado interno",
  transfer_in: "Traslado recibido",
  transfer_out: "Traslado enviado",
};
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

type StockBySiteRow = {
  site_id: string;
  product_id: string;
  current_qty: number | null;
};

function startOfDayIso(dateStr: string) {
  return `${dateStr}T00:00:00`;
}

function endOfDayIso(dateStr: string) {
  return `${dateStr}T23:59:59`;
}

function formatMovementType(value: string) {
  return MOVEMENT_TYPE_LABELS[value] ?? value.replaceAll("_", " ");
}

function formatMovementDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function movementTone(value: string) {
  if (["receipt_in", "receipt", "purchase_in", "restock_in", "production_in", "transfer_in"].includes(value)) {
    return "success";
  }
  if (["consumption", "sale_out", "restock_out", "production_out", "issue_internal", "waste", "shrink", "transfer_out"].includes(value)) {
    return "warn";
  }
  return "neutral";
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
  const siteLabel = siteId ? siteNameMap.get(siteId) ?? siteId : "Todas las sedes";
  const positiveCount = movements.filter((row) => Number(row.quantity ?? 0) > 0).length;
  const negativeCount = movements.filter((row) => Number(row.quantity ?? 0) < 0).length;
  const activeFilterCount = [siteId, movementType, productId, fromDate, toDate].filter(Boolean).length;

  const movementSiteIds = Array.from(new Set(movements.map((row) => String(row.site_id ?? "")).filter(Boolean)));
  const movementProductIds = Array.from(new Set(movements.map((row) => String(row.product_id ?? "")).filter(Boolean)));

  const { data: stockRowsData } =
    movementSiteIds.length && movementProductIds.length
      ? await supabase
          .from("inventory_stock_by_site")
          .select("site_id,product_id,current_qty")
          .in("site_id", movementSiteIds)
          .in("product_id", movementProductIds)
      : { data: [] as StockBySiteRow[] };

  const stockRows = (stockRowsData ?? []) as StockBySiteRow[];
  const currentBalanceMap = new Map<string, number>();
  for (const row of stockRows) {
    currentBalanceMap.set(`${row.site_id}::${row.product_id}`, Number(row.current_qty ?? 0));
  }

  const runningBalanceMap = new Map(currentBalanceMap);
  const movementBalances = new Map<string, { opening: number; closing: number; movement: number }>();
  for (const row of movements) {
    const key = `${String(row.site_id ?? "")}::${String(row.product_id ?? "")}`;
    const closing = Number(runningBalanceMap.get(key) ?? 0);
    const movement = Number(row.quantity ?? 0);
    const opening = closing - movement;
    movementBalances.set(String(row.id), { opening, closing, movement });
    runningBalanceMap.set(key, opening);
  }

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid">
          <div>
            <span className="ui-chip ui-chip--brand">{siteLabel}</span>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
              Historial de inventario
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-muted)] sm:text-base">
              Aqui ves lo que entro, salio, se traslado o se ajusto. La idea es poder responder rapido: que paso, cuando paso y en que producto.
            </p>
          </div>
          <div className="ui-remission-kpis">
            <div className="ui-remission-kpi">
              <div className="ui-remission-kpi-label">Registros</div>
              <div className="ui-remission-kpi-value">{movements.length}</div>
              <div className="ui-remission-kpi-note">Ultimos 200 movimientos visibles</div>
            </div>
            <div className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Entradas</div>
              <div className="ui-remission-kpi-value">{positiveCount}</div>
              <div className="ui-remission-kpi-note">Lo que aumento inventario</div>
            </div>
            <div className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Salidas</div>
              <div className="ui-remission-kpi-value">{negativeCount}</div>
              <div className="ui-remission-kpi-note">Lo que desconto inventario</div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-start justify-between gap-4 ui-fade-up ui-delay-1">
        <div>
          <div className="ui-caption">
            {activeFilterCount > 0 ? `${activeFilterCount} filtro(s) activos` : "Sin filtros adicionales"}
          </div>
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
        </div>
      </div>

      {errorMsg ? (
        <div className="ui-alert ui-alert--error ui-fade-up ui-delay-1">
          Error: {errorMsg}
        </div>
      ) : null}

      <div className="ui-panel ui-panel--halo ui-remission-section ui-fade-up ui-delay-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ui-h3">Filtros</div>
            <div className="mt-1 ui-caption">Usa estos filtros si quieres encontrar algo puntual sin leer toda la lista.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">{siteLabel}</span>
            <span className="ui-chip ui-chip--success">{positiveCount} entradas</span>
            <span className="ui-chip ui-chip--warn">{negativeCount} salidas</span>
          </div>
        </div>
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
                      {formatMovementType(t)}
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

          <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
            <button className="ui-btn ui-btn--brand">
              Aplicar filtros
            </button>
            <Link href="/inventory/movements" className="ui-btn ui-btn--ghost">
              Limpiar
            </Link>
          </div>
        </form>
      </div>

      {error ? (
        <div className="ui-alert ui-alert--error ui-fade-up ui-delay-2">
          Fallo el SELECT de movimientos: {error.message}
        </div>
      ) : null}

      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="ui-h3">Movimientos</div>
            <div className="mt-1 ui-caption">Lectura rapida de lo que se movio en inventario.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">{movements.length} visibles</span>
            <span className="ui-chip ui-chip--success">{positiveCount} +</span>
            <span className="ui-chip ui-chip--warn">{negativeCount} -</span>
          </div>
        </div>

        <div className="mt-4 space-y-3 lg:hidden">
          {movements.map((row) => {
            const createdAt = String(row.created_at ?? "");
            const type = String(row.movement_type ?? "");
            const site = String(row.site_id ?? "");
            const product = row.product ?? null;
            const productLabel = product?.name ?? row.product_id ?? "";
            const productSku = product?.sku ?? "";
            const qtyValue = Number(row.quantity ?? 0);
            const qty = String(row.quantity ?? "");
            const unit = String(row.stock_unit_code ?? product?.stock_unit_code ?? product?.unit ?? "");
            const inputQty = row.input_qty;
            const inputUnit = row.input_unit_code ?? "";
            const factor = row.conversion_factor_to_stock;
            const ref = String((row as { note?: string | null }).note ?? "");
            const captureLabel =
              inputQty != null && inputUnit
                ? `${inputQty} ${inputUnit}${factor && factor !== 1 ? ` (x${factor})` : ""}`
                : "Sin detalle";

            return (
              <div key={String(row.id ?? `${createdAt}-${productLabel}-${qty}`)} className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[var(--ui-text)]">{productLabel}</div>
                    {productSku ? <div className="mt-1 text-xs text-[var(--ui-muted)]">{productSku}</div> : null}
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      movementTone(type) === "success"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                        : movementTone(type) === "warn"
                          ? "border border-amber-200 bg-amber-50 text-amber-800"
                          : "border border-slate-200 bg-slate-100 text-slate-700"
                    }`}
                  >
                    {formatMovementType(type)}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[var(--ui-bg-soft)] p-3">
                    <div className="text-xs text-[var(--ui-muted)]">Fecha</div>
                    <div className="mt-1 text-sm font-medium text-[var(--ui-text)]">{formatMovementDate(createdAt)}</div>
                  </div>
                  <div className="rounded-xl bg-[var(--ui-bg-soft)] p-3">
                    <div className="text-xs text-[var(--ui-muted)]">Cantidad</div>
                    <div className={`mt-1 text-base font-semibold ${qtyValue < 0 ? "text-amber-700" : qtyValue > 0 ? "text-emerald-700" : "text-[var(--ui-text)]"}`}>
                      {qty} {unit}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[var(--ui-bg-soft)] p-3">
                    <div className="text-xs text-[var(--ui-muted)]">Sede</div>
                    <div className="mt-1 text-sm font-medium text-[var(--ui-text)]">{siteNameMap.get(site) ?? site}</div>
                  </div>
                  <div className="rounded-xl bg-[var(--ui-bg-soft)] p-3">
                    <div className="text-xs text-[var(--ui-muted)]">Captura</div>
                    <div className="mt-1 text-sm font-medium text-[var(--ui-text)]">{captureLabel}</div>
                  </div>
                </div>

                {ref ? (
                  <div className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2">
                    <div className="text-xs text-[var(--ui-muted)]">Detalle</div>
                    <div className="mt-1 text-sm text-[var(--ui-text)]">{ref}</div>
                  </div>
                ) : null}
              </div>
            );
          })}

          {!error && movements.length === 0 ? (
            <div className="ui-empty rounded-2xl border border-[var(--ui-border)] bg-white p-6 text-center">
              No hay movimientos para mostrar.
            </div>
          ) : null}
        </div>

        <div className="mt-4 hidden overflow-x-auto lg:block">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>Saldo inicial</TableHeaderCell>
                <TableHeaderCell>Movimiento</TableHeaderCell>
                <TableHeaderCell>Saldo final</TableHeaderCell>
                <TableHeaderCell>Unidad</TableHeaderCell>
                <TableHeaderCell>Como se registro</TableHeaderCell>
                <TableHeaderCell>Detalle</TableHeaderCell>
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
                const balances = movementBalances.get(String(row.id)) ?? {
                  opening: 0,
                  closing: 0,
                  movement: Number(row.quantity ?? 0),
                };
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
                  <tr key={String(row.id ?? `${createdAt}-${productLabel}-${balances.movement}`)} className="ui-body">
                    <TableCell>{formatMovementDate(createdAt)}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          movementTone(type) === "success"
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                            : movementTone(type) === "warn"
                              ? "border border-amber-200 bg-amber-50 text-amber-800"
                              : "border border-slate-200 bg-slate-100 text-slate-700"
                        }`}
                      >
                        {formatMovementType(type)}
                      </span>
                    </TableCell>
                    <TableCell>{siteNameMap.get(site) ?? site}</TableCell>
                    <TableCell>
                      <div className="font-semibold text-[var(--ui-text)]">{productLabel}</div>
                      {productSku ? <div className="ui-caption">{productSku}</div> : null}
                    </TableCell>
                    <TableCell>{balances.opening}</TableCell>
                    <TableCell
                      className={
                        balances.movement < 0
                          ? "font-semibold text-amber-700"
                          : balances.movement > 0
                            ? "font-semibold text-emerald-700"
                            : ""
                      }
                    >
                      {balances.movement > 0 ? `+${balances.movement}` : balances.movement}
                    </TableCell>
                    <TableCell>{balances.closing}</TableCell>
                    <TableCell>{unit}</TableCell>
                    <TableCell>{captureLabel}</TableCell>
                    <TableCell>{ref || "-"}</TableCell>
                  </tr>
                );
              })}

              {!error && movements.length === 0 ? (
                <tr>
                  <TableCell colSpan={9} className="ui-empty">
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


