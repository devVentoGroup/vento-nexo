import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type SiteRow = { id: string; name: string | null };
type RemissionRow = {
  id: string;
  created_at: string | null;
  status: string | null;
  from_site_id: string | null;
  to_site_id: string | null;
  notes: string | null;
};
type RemissionItemRow = {
  request_id: string;
  product_id: string;
  quantity: number | null;
  prepared_quantity: number | null;
  shipped_quantity: number | null;
  source_location_id: string | null;
};
type LocRow = { id: string; code: string | null };
type StockBySiteRow = { product_id: string; current_qty: number | null };
type StockByLocRow = { location_id: string; product_id: string; current_qty: number | null };

function formatStatus(status?: string | null) {
  const v = String(status ?? "").trim();
  switch (v) {
    case "pending":
      return { label: "Pendiente", className: "ui-chip ui-chip--warn" };
    case "preparing":
      return { label: "Preparando", className: "ui-chip ui-chip--brand" };
    default:
      return { label: v || "-", className: "ui-chip" };
  }
}

function formatDateTime(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function RemissionsPreparePage() {
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/remissions",
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("site_id")
    .eq("id", user.id)
    .single();

  const { data: settings } = await supabase
    .from("employee_settings")
    .select("selected_site_id")
    .eq("employee_id", user.id)
    .maybeSingle();

  const siteId = settings?.selected_site_id ?? employee?.site_id ?? "";
  if (!siteId) {
    return (
      <div className="w-full">
        <Link href="/inventory/remissions" className="ui-caption underline">
          Volver al hub de remisiones
        </Link>
        <div className="mt-4 ui-alert ui-alert--warn">
          No tienes sede activa. Elige sede en Remisiones para preparar.
        </div>
      </div>
    );
  }

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = String((employeeRow as { role?: string } | null)?.role ?? "");
  const canPrepareByRole = ["bodeguero", "propietario", "gerente_general"].includes(role);
  if (!canPrepareByRole) {
    return (
      <div className="w-full">
        <Link href="/inventory/remissions" className="ui-caption underline">
          Volver al hub de remisiones
        </Link>
        <div className="mt-4 ui-alert ui-alert--neutral">
          Esta vista es para bodegueros, gerentes y propietarios. Tu rol actual no tiene acceso.
        </div>
      </div>
    );
  }

  const { data: siteRow } = await supabase.from("sites").select("id,name").eq("id", siteId).single();

  const { data: remissions } = await supabase
    .from("restock_requests")
    .select("id, created_at, status, from_site_id, to_site_id, notes")
    .eq("from_site_id", siteId)
    .in("status", ["pending", "preparing"])
    .order("created_at", { ascending: false })
    .limit(30);

  const rows = (remissions ?? []) as RemissionRow[];
  const toSiteIds = [...new Set(rows.map((r) => r.to_site_id).filter(Boolean))] as string[];
  const { data: sites } = await supabase.from("sites").select("id,name").in("id", toSiteIds);
  const siteMap = new Map(((sites ?? []) as SiteRow[]).map((s) => [s.id, s.name]));
  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const preparingCount = rows.filter((row) => row.status === "preparing").length;
  const requestIds = rows.map((row) => row.id);
  const { data: itemsData } = requestIds.length
    ? await supabase
        .from("restock_request_items")
        .select("request_id,product_id,quantity,prepared_quantity,shipped_quantity,source_location_id")
        .in("request_id", requestIds)
    : { data: [] as RemissionItemRow[] };
  const itemRows = (itemsData ?? []) as RemissionItemRow[];
  const productIds = Array.from(new Set(itemRows.map((row) => row.product_id).filter(Boolean)));
  const { data: stockBySiteData } =
    productIds.length > 0
      ? await supabase
          .from("inventory_stock_by_site")
          .select("product_id,current_qty")
          .eq("site_id", siteId)
          .in("product_id", productIds)
      : { data: [] as StockBySiteRow[] };
  const stockBySiteMap = new Map(
    ((stockBySiteData ?? []) as StockBySiteRow[]).map((row) => [
      row.product_id,
      Number(row.current_qty ?? 0),
    ])
  );
  const { data: locsData } = await supabase
    .from("inventory_locations")
    .select("id,code")
    .eq("site_id", siteId)
    .order("code", { ascending: true })
    .limit(500);
  const locRows = (locsData ?? []) as LocRow[];
  const locIds = locRows.map((row) => row.id);
  const { data: stockByLocData } =
    locIds.length > 0 && productIds.length > 0
      ? await supabase
          .from("inventory_stock_by_location")
          .select("location_id,product_id,current_qty")
          .in("location_id", locIds)
          .in("product_id", productIds)
          .gt("current_qty", 0)
      : { data: [] as StockByLocRow[] };
  const stockByLocRows = (stockByLocData ?? []) as StockByLocRow[];
  const bestLocQtyByProduct = new Map<string, number>();
  for (const row of stockByLocRows) {
    const qty = Number(row.current_qty ?? 0);
    const current = bestLocQtyByProduct.get(row.product_id) ?? 0;
    if (qty > current) {
      bestLocQtyByProduct.set(row.product_id, qty);
    }
  }
  const requestMetrics = new Map<
    string,
    {
      totalLines: number;
      linesMissingSourceLoc: number;
      linesPartialPrep: number;
      linesLikelyShortage: number;
      linesWithoutCoveringLoc: number;
    }
  >();
  for (const item of itemRows) {
    const requestedQty = Number(item.quantity ?? 0);
    const preparedQty = Number(item.prepared_quantity ?? 0);
    const shippedQty = Number(item.shipped_quantity ?? 0);
    const plannedQty = Math.max(preparedQty, shippedQty);
    const targetQty = plannedQty > 0 ? plannedQty : requestedQty;
    const availableSite = stockBySiteMap.get(item.product_id) ?? 0;
    const bestLocQty = bestLocQtyByProduct.get(item.product_id) ?? 0;
    const current = requestMetrics.get(item.request_id) ?? {
      totalLines: 0,
      linesMissingSourceLoc: 0,
      linesPartialPrep: 0,
      linesLikelyShortage: 0,
      linesWithoutCoveringLoc: 0,
    };
    current.totalLines += 1;
    if (plannedQty > 0 && !item.source_location_id) {
      current.linesMissingSourceLoc += 1;
    }
    if (plannedQty > 0 && requestedQty > 0 && plannedQty < requestedQty) {
      current.linesPartialPrep += 1;
    }
    if (targetQty > 0 && targetQty > availableSite) {
      current.linesLikelyShortage += 1;
    }
    if (targetQty > 0 && targetQty <= availableSite && bestLocQty < targetQty) {
      current.linesWithoutCoveringLoc += 1;
    }
    requestMetrics.set(item.request_id, current);
  }
  const shortageSignalCount = Array.from(requestMetrics.values()).reduce(
    (sum, current) => sum + current.linesLikelyShortage,
    0
  );
  const locSignalCount = Array.from(requestMetrics.values()).reduce(
    (sum, current) => sum + current.linesWithoutCoveringLoc,
    0
  );
  const activeSiteName = (siteRow as { name?: string } | null)?.name ?? siteId;

  return (
    <div className="ui-scene w-full space-y-6 pb-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid">
          <div>
            <Link href="/inventory/remissions" className="ui-caption underline">
              Volver al hub de remisiones
            </Link>
            <span className="mt-4 inline-flex ui-chip ui-chip--brand">{activeSiteName}</span>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
              Cola de preparacion
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-muted)] sm:text-base">
              Abre la solicitud, elige LOC y confirma cuánto sale.
            </p>
          </div>
          <div className="ui-remission-kpis">
            <div className="ui-remission-kpi">
              <div className="ui-remission-kpi-label">Abiertas</div>
              <div className="ui-remission-kpi-value">{rows.length}</div>
              <div className="ui-remission-kpi-note">Solicitudes en cola</div>
            </div>
            <div className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Preparando</div>
              <div className="ui-remission-kpi-value">{preparingCount}</div>
              <div className="ui-remission-kpi-note">Ya empezadas por bodega</div>
            </div>
            <div className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Señales</div>
              <div className="ui-remission-kpi-value">{shortageSignalCount + locSignalCount}</div>
              <div className="ui-remission-kpi-note">Faltantes o LOCs ajustados</div>
            </div>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3 text-sm text-[var(--ui-muted)] ui-fade-up ui-delay-1">
        {pendingCount} pendientes, {preparingCount} en curso, {shortageSignalCount + locSignalCount} con revisión extra.
      </div>

      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ui-h3">Solicitudes pendientes de preparar</div>
            <div className="mt-1 ui-caption">{rows.length} remision(es) visibles</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">{pendingCount} pendientes</span>
            <span className="ui-chip ui-chip--brand">{preparingCount} preparando</span>
          </div>
        </div>

        {rows.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {rows.map((row) => {
              const status = formatStatus(row.status);
              return (
                <div
                  key={row.id}
                  className="ui-remission-section rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4 shadow-[var(--ui-shadow-soft)] sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--ui-text)] truncate">
                        Destino: {siteMap.get(row.to_site_id ?? "") ?? row.to_site_id ?? "-"}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">Solicitud lista para preparar</div>
                    </div>
                    <span className={status.className}>{status.label}</span>
                  </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-[var(--ui-border)] bg-white/90 p-3">
                        <div className="ui-caption">Creada</div>
                        <div className="mt-1 text-sm font-medium text-[var(--ui-text)]">{formatDateTime(row.created_at)}</div>
                      </div>
                      <div className="rounded-xl border border-[var(--ui-border)] bg-white/90 p-3">
                        <div className="ui-caption">Lineas</div>
                        <div className="mt-1 text-sm font-medium text-[var(--ui-text)]">
                          {requestMetrics.get(row.id)?.totalLines ?? 0}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--ui-border)] bg-white/90 p-3 sm:col-span-2">
                        <div className="ui-caption">Notas</div>
                        <div className="mt-1 text-sm text-[var(--ui-text)] line-clamp-3">{row.notes ?? "Sin notas"}</div>
                      </div>
                    </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    {(requestMetrics.get(row.id)?.linesMissingSourceLoc ?? 0) > 0 ? (
                      <span className="ui-chip ui-chip--warn">
                        {requestMetrics.get(row.id)?.linesMissingSourceLoc ?? 0} LOC pendiente
                      </span>
                    ) : null}
                    {(requestMetrics.get(row.id)?.linesPartialPrep ?? 0) > 0 ? (
                      <span className="ui-chip ui-chip--warn">
                        {requestMetrics.get(row.id)?.linesPartialPrep ?? 0} corta
                      </span>
                    ) : null}
                    {(requestMetrics.get(row.id)?.linesLikelyShortage ?? 0) > 0 ? (
                      <span className="ui-chip ui-chip--warn">
                        {requestMetrics.get(row.id)?.linesLikelyShortage ?? 0} faltante
                      </span>
                    ) : null}
                    {(requestMetrics.get(row.id)?.linesWithoutCoveringLoc ?? 0) > 0 ? (
                      <span className="ui-chip ui-chip--warn">
                        {requestMetrics.get(row.id)?.linesWithoutCoveringLoc ?? 0} partir linea
                      </span>
                    ) : null}
                    {(requestMetrics.get(row.id)?.linesMissingSourceLoc ?? 0) === 0 &&
                    (requestMetrics.get(row.id)?.linesPartialPrep ?? 0) === 0 &&
                    (requestMetrics.get(row.id)?.linesLikelyShortage ?? 0) === 0 &&
                    (requestMetrics.get(row.id)?.linesWithoutCoveringLoc ?? 0) === 0 ? (
                      <span className="ui-chip ui-chip--success">Lista para preparar</span>
                    ) : null}
                  </div>

                  {(requestMetrics.get(row.id)?.linesLikelyShortage ?? 0) > 0 ||
                  (requestMetrics.get(row.id)?.linesWithoutCoveringLoc ?? 0) > 0 ? (
                    <div className="mt-3 ui-alert ui-alert--warn">
                      Esta solicitud ya muestra señales para bodega: revisa faltante probable y si algun item no cabe completo en un solo LOC.
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <Link
                      href={`/inventory/remissions/${row.id}?from=prepare`}
                      className="ui-btn ui-btn--brand h-12 w-full px-6 text-base font-semibold sm:w-auto"
                    >
                      Preparar ahora
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ui-empty rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-6">
            No hay solicitudes pendientes de preparar.
          </div>
        )}
      </div>
    </div>
  );
}
