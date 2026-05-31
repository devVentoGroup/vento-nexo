import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";

export const dynamic = "force-dynamic";

type SearchParams = {
  filter?: string;
  destination?: string;
};

type PrepareFilter = "all" | "pending" | "preparing" | "alerts" | "loc";

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

type ProductRow = {
  id: string;
  name: string | null;
  stock_unit_code: string | null;
  unit: string | null;
};

type LocRow = { id: string; code: string | null };
type StockBySiteRow = { product_id: string; current_qty: number | null };
type StockByLocRow = { location_id: string; product_id: string; current_qty: number | null };

type RequestMetrics = {
  totalLines: number;
  linesMissingSourceLoc: number;
  linesPartialPrep: number;
  linesLikelyShortage: number;
  linesWithoutCoveringLoc: number;
  requestedTotal: number;
  preparedTotal: number;
  shippedTotal: number;
  firstProductNames: string[];
};

const FILTER_LABELS: Record<PrepareFilter, string> = {
  all: "Todas",
  pending: "Pendientes",
  preparing: "En preparación",
  alerts: "Con alertas",
  loc: "LOC por revisar",
};

function normalizeFilter(value?: string | null): PrepareFilter {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "preparing") return "preparing";
  if (normalized === "alerts") return "alerts";
  if (normalized === "loc") return "loc";
  return "all";
}

function formatStatus(status?: string | null) {
  const v = String(status ?? "").trim();
  switch (v) {
    case "pending":
      return {
        label: "Pendiente",
        className: "ui-chip ui-chip--warn",
        cardClassName: "border-amber-200 bg-amber-50/50",
      };
    case "preparing":
      return {
        label: "En preparación",
        className: "ui-chip ui-chip--brand",
        cardClassName: "border-sky-200 bg-sky-50/50",
      };
    default:
      return {
        label: v || "-",
        className: "ui-chip",
        cardClassName: "border-[var(--ui-border)] bg-white",
      };
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

function formatElapsedTime(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "sin fecha";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "sin fecha";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000));

  if (diffMinutes < 1) return "hace menos de 1 min";
  if (diffMinutes < 60) return `hace ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays} día${diffDays === 1 ? "" : "s"}`;
}

function getCreatedAtTime(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getMetricValue(metrics: RequestMetrics | undefined, key: keyof RequestMetrics) {
  const value = metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function hasAnyAlert(metrics: RequestMetrics | undefined) {
  return (
    getMetricValue(metrics, "linesMissingSourceLoc") > 0 ||
    getMetricValue(metrics, "linesPartialPrep") > 0 ||
    getMetricValue(metrics, "linesLikelyShortage") > 0 ||
    getMetricValue(metrics, "linesWithoutCoveringLoc") > 0
  );
}

function hasLocAlert(metrics: RequestMetrics | undefined) {
  return (
    getMetricValue(metrics, "linesMissingSourceLoc") > 0 ||
    getMetricValue(metrics, "linesWithoutCoveringLoc") > 0
  );
}

function getPriorityLabel(row: RemissionRow, metrics: RequestMetrics | undefined) {
  const status = String(row.status ?? "").trim();
  if (status === "preparing") {
    return {
      label: "Continuar ahora",
      className: "border-sky-200 bg-sky-50 text-sky-800",
    };
  }

  if (getMetricValue(metrics, "linesLikelyShortage") > 0) {
    return {
      label: "Revisar stock",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  if (hasLocAlert(metrics)) {
    return {
      label: "Revisar LOC",
      className: "border-orange-200 bg-orange-50 text-orange-800",
    };
  }

  return {
    label: "Lista para alistar",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
}

function buildQueueHref(params: { filter?: PrepareFilter; destination?: string }) {
  const search = new URLSearchParams();
  if (params.filter && params.filter !== "all") search.set("filter", params.filter);
  if (params.destination) search.set("destination", params.destination);
  const qs = search.toString();
  return `/inventory/remissions/prepare${qs ? `?${qs}` : ""}`;
}

function formatProductPreview(names: string[]) {
  if (!names.length) return "Sin productos visibles";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3} más`;
}

function getDestinationName(siteMap: Map<string, string | null>, siteId?: string | null) {
  const id = String(siteId ?? "").trim();
  if (!id) return "Sin destino";
  return siteMap.get(id) ?? id;
}

function buildMetrics(params: {
  rows: RemissionRow[];
  items: RemissionItemRow[];
  productMap: Map<string, ProductRow>;
  stockBySiteMap: Map<string, number>;
  bestLocQtyByProduct: Map<string, number>;
}) {
  const metrics = new Map<string, RequestMetrics>();
  const seenProductNamesByRequest = new Map<string, Set<string>>();

  for (const row of params.rows) {
    metrics.set(row.id, {
      totalLines: 0,
      linesMissingSourceLoc: 0,
      linesPartialPrep: 0,
      linesLikelyShortage: 0,
      linesWithoutCoveringLoc: 0,
      requestedTotal: 0,
      preparedTotal: 0,
      shippedTotal: 0,
      firstProductNames: [],
    });
    seenProductNamesByRequest.set(row.id, new Set());
  }

  for (const item of params.items) {
    const requestId = String(item.request_id ?? "").trim();
    if (!requestId) continue;

    const requestedQty = Number(item.quantity ?? 0);
    const preparedQty = Number(item.prepared_quantity ?? 0);
    const shippedQty = Number(item.shipped_quantity ?? 0);
    const plannedQty = Math.max(preparedQty, shippedQty);
    const targetQty = plannedQty > 0 ? plannedQty : requestedQty;
    const availableSite = params.stockBySiteMap.get(item.product_id) ?? 0;
    const bestLocQty = params.bestLocQtyByProduct.get(item.product_id) ?? 0;
    const current =
      metrics.get(requestId) ??
      {
        totalLines: 0,
        linesMissingSourceLoc: 0,
        linesPartialPrep: 0,
        linesLikelyShortage: 0,
        linesWithoutCoveringLoc: 0,
        requestedTotal: 0,
        preparedTotal: 0,
        shippedTotal: 0,
        firstProductNames: [],
      };

    current.totalLines += 1;
    current.requestedTotal += Number.isFinite(requestedQty) ? requestedQty : 0;
    current.preparedTotal += Number.isFinite(preparedQty) ? preparedQty : 0;
    current.shippedTotal += Number.isFinite(shippedQty) ? shippedQty : 0;

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

    const product = params.productMap.get(item.product_id);
    const productName = String(product?.name ?? item.product_id ?? "").trim();
    const seen = seenProductNamesByRequest.get(requestId) ?? new Set<string>();
    if (productName && !seen.has(productName)) {
      current.firstProductNames.push(productName);
      seen.add(productName);
      seenProductNamesByRequest.set(requestId, seen);
    }

    metrics.set(requestId, current);
  }

  return metrics;
}

export default async function RemissionsPreparePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const activeFilter = normalizeFilter(sp.filter);

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
  const canPreparePermission = await checkPermissionWithRoleOverride({
    supabase,
    appId: "nexo",
    code: "inventory.remissions.prepare",
    context: { siteId },
    actualRole: role,
  });

  if (!canPreparePermission) {
    return (
      <div className="w-full">
        <Link href="/inventory/remissions" className="ui-caption underline">
          Volver al hub de remisiones
        </Link>
        <div className="mt-4 ui-alert ui-alert--neutral">
          Tu rol actual no tiene permiso para preparar remisiones en esta sede.
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
    .limit(50);

  const rows = (remissions ?? []) as RemissionRow[];
  const requestIds = rows.map((row) => row.id);
  const toSiteIds = Array.from(
    new Set(rows.map((row) => String(row.to_site_id ?? "").trim()).filter(Boolean))
  );

  const { data: sites } =
    toSiteIds.length > 0
      ? await supabase.from("sites").select("id,name").in("id", toSiteIds)
      : { data: [] as SiteRow[] };

  const siteMap = new Map(((sites ?? []) as SiteRow[]).map((site) => [site.id, site.name]));

  const { data: itemsData } = requestIds.length
    ? await supabase
        .from("restock_request_items")
        .select("request_id,product_id,quantity,prepared_quantity,shipped_quantity,source_location_id")
        .in("request_id", requestIds)
    : { data: [] as RemissionItemRow[] };

  const itemRows = (itemsData ?? []) as RemissionItemRow[];
  const productIds = Array.from(new Set(itemRows.map((row) => row.product_id).filter(Boolean)));

  const { data: productsData } =
    productIds.length > 0
      ? await supabase
          .from("products")
          .select("id,name,stock_unit_code,unit")
          .in("id", productIds)
      : { data: [] as ProductRow[] };

  const productMap = new Map(
    ((productsData ?? []) as ProductRow[]).map((product) => [product.id, product])
  );

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
    .eq("is_active", true)
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

  const requestMetrics = buildMetrics({
    rows,
    items: itemRows,
    productMap,
    stockBySiteMap,
    bestLocQtyByProduct,
  });

  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const preparingCount = rows.filter((row) => row.status === "preparing").length;
  const shortageSignalCount = Array.from(requestMetrics.values()).reduce(
    (sum, current) => sum + current.linesLikelyShortage,
    0
  );
  const locSignalCount = Array.from(requestMetrics.values()).reduce(
    (sum, current) =>
      sum + current.linesMissingSourceLoc + current.linesWithoutCoveringLoc,
    0
  );
  const alertRequestCount = rows.filter((row) => hasAnyAlert(requestMetrics.get(row.id))).length;
  const activeSiteName = (siteRow as { name?: string } | null)?.name ?? siteId;
  const rawDestination = String(sp.destination ?? "").trim();
  const activeDestination = toSiteIds.includes(rawDestination) ? rawDestination : "";

  const visibleRows = rows
    .filter((row) => {
      const metrics = requestMetrics.get(row.id);
      if (activeDestination && row.to_site_id !== activeDestination) return false;

      if (activeFilter === "pending") return row.status === "pending";
      if (activeFilter === "preparing") return row.status === "preparing";
      if (activeFilter === "alerts") return hasAnyAlert(metrics);
      if (activeFilter === "loc") return hasLocAlert(metrics);

      return true;
    })
    .sort((a, b) => {
      const aMetrics = requestMetrics.get(a.id);
      const bMetrics = requestMetrics.get(b.id);
      const aStatus = String(a.status ?? "");
      const bStatus = String(b.status ?? "");

      if (aStatus === "preparing" && bStatus !== "preparing") return -1;
      if (aStatus !== "preparing" && bStatus === "preparing") return 1;

      const aAlerts = hasAnyAlert(aMetrics) ? 1 : 0;
      const bAlerts = hasAnyAlert(bMetrics) ? 1 : 0;
      if (aAlerts !== bAlerts) return bAlerts - aAlerts;

      return getCreatedAtTime(a.created_at) - getCreatedAtTime(b.created_at);
    });

  const destinationOptions = toSiteIds
    .map((id) => ({
      id,
      name: getDestinationName(siteMap, id),
      count: rows.filter((row) => row.to_site_id === id).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  const filterOptions = [
    { key: "all" as const, count: rows.length },
    { key: "pending" as const, count: pendingCount },
    { key: "preparing" as const, count: preparingCount },
    { key: "alerts" as const, count: alertRequestCount },
    { key: "loc" as const, count: rows.filter((row) => hasLocAlert(requestMetrics.get(row.id))).length },
  ];

  return (
    <div className="ui-scene w-full space-y-6 pb-6">
      <section className="overflow-hidden rounded-[32px] border border-[rgba(15,23,42,0.08)] bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.14),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(247,250,252,0.98)_100%)] p-5 shadow-[0_24px_60px_rgba(15,23,42,0.12)] sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div>
            <Link href="/inventory/remissions" className="ui-caption underline">
              Volver al hub de remisiones
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="ui-chip ui-chip--brand">{activeSiteName}</span>
              <span className="ui-chip">Preparación y alistamiento</span>
              {activeDestination ? (
                <span className="ui-chip ui-chip--success">
                  Destino: {getDestinationName(siteMap, activeDestination)}
                </span>
              ) : null}
            </div>
            <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.035em] text-[var(--ui-text)] sm:text-4xl">
              Remisiones por preparar
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-muted)] sm:text-base">
              Prioriza solicitudes en preparación, revisa alertas de stock y entra al detalle para definir LOC de salida y cantidades reales.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-3xl border border-white/80 bg-white/90 p-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--ui-muted)]">
                En cola
              </div>
              <div className="mt-2 text-3xl font-semibold text-[var(--ui-text)]">{rows.length}</div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">Solicitudes abiertas</div>
            </div>
            <div className="rounded-3xl border border-sky-100 bg-sky-50/80 p-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.08em] text-sky-800">
                En preparación
              </div>
              <div className="mt-2 text-3xl font-semibold text-sky-950">{preparingCount}</div>
              <div className="mt-1 text-xs text-sky-800">Continuar primero</div>
            </div>
            <div className="rounded-3xl border border-amber-100 bg-amber-50/80 p-4 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.08em] text-amber-800">
                Alertas
              </div>
              <div className="mt-2 text-3xl font-semibold text-amber-950">
                {shortageSignalCount + locSignalCount}
              </div>
              <div className="mt-1 text-xs text-amber-800">Stock o LOC por revisar</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[var(--ui-text)]">Vista de trabajo</div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">
                Filtra la cola sin cambiar permisos ni datos.
              </div>
            </div>
            <span className="ui-chip">{visibleRows.length} visibles</span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {filterOptions.map((option) => {
              const active = option.key === activeFilter;
              return (
                <Link
                  key={option.key}
                  href={buildQueueHref({ filter: option.key, destination: activeDestination })}
                  className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "border-[var(--ui-brand-500)] bg-[var(--ui-brand-50)] text-[var(--ui-brand-800)]"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {FILTER_LABELS[option.key]} · {option.count}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[var(--ui-text)]">Destino</div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">
                Revisa solicitudes por sede compradora.
              </div>
            </div>
            {activeDestination ? (
              <Link
                href={buildQueueHref({ filter: activeFilter })}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700"
              >
                Limpiar destino
              </Link>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={buildQueueHref({ filter: activeFilter })}
              className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                !activeDestination
                  ? "border-[var(--ui-brand-500)] bg-[var(--ui-brand-50)] text-[var(--ui-brand-800)]"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Todos · {rows.length}
            </Link>
            {destinationOptions.map((destination) => (
              <Link
                key={destination.id}
                href={buildQueueHref({ filter: activeFilter, destination: destination.id })}
                className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                  activeDestination === destination.id
                    ? "border-[var(--ui-brand-500)] bg-[var(--ui-brand-50)] text-[var(--ui-brand-800)]"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {destination.name} · {destination.count}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="rounded-3xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
        Esta cola pertenece al centro que despacha. El destino es la sede compradora; el área destino se define en la solicitud. En el detalle se confirma el LOC físico de salida y la cantidad real preparada.
      </div>

      <div className="ui-panel ui-remission-section space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ui-h3">Solicitudes listas para alistar</div>
            <div className="mt-1 ui-caption">
              {FILTER_LABELS[activeFilter]} · {visibleRows.length} de {rows.length} remision(es)
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">{pendingCount} pendientes</span>
            <span className="ui-chip ui-chip--brand">{preparingCount} en preparación</span>
            {alertRequestCount > 0 ? (
              <span className="ui-chip ui-chip--warn">{alertRequestCount} con alertas</span>
            ) : (
              <span className="ui-chip ui-chip--success">Sin alertas</span>
            )}
          </div>
        </div>

        {visibleRows.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleRows.map((row) => {
              const status = formatStatus(row.status);
              const metrics = requestMetrics.get(row.id);
              const priority = getPriorityLabel(row, metrics);
              const destinationName = getDestinationName(siteMap, row.to_site_id);
              const productPreview = formatProductPreview(metrics?.firstProductNames ?? []);
              const missingLoc = getMetricValue(metrics, "linesMissingSourceLoc");
              const partialPrep = getMetricValue(metrics, "linesPartialPrep");
              const likelyShortage = getMetricValue(metrics, "linesLikelyShortage");
              const splitLoc = getMetricValue(metrics, "linesWithoutCoveringLoc");
              const cleanCard = !missingLoc && !partialPrep && !likelyShortage && !splitLoc;

              return (
                <article
                  key={row.id}
                  className={`overflow-hidden rounded-[28px] border bg-white shadow-[0_16px_40px_rgba(15,23,42,0.08)] ${status.cardClassName}`}
                >
                  <div className="border-b border-white/70 bg-white/80 px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={status.className}>{status.label}</span>
                          <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${priority.className}`}>
                            {priority.label}
                          </span>
                        </div>
                        <h2 className="mt-3 truncate text-xl font-semibold tracking-[-0.02em] text-[var(--ui-text)]">
                          {destinationName}
                        </h2>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          Creada {formatElapsedTime(row.created_at)} · {formatDateTime(row.created_at)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
                        <div className="text-2xl font-semibold text-[var(--ui-text)]">
                          {metrics?.totalLines ?? 0}
                        </div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ui-muted)]">
                          líneas
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-4 sm:p-5">
                    <div className="rounded-2xl border border-[var(--ui-border)] bg-white/90 p-3">
                      <div className="ui-caption">Productos a preparar</div>
                      <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
                        {productPreview}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                          Solicitado
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {Math.round(getMetricValue(metrics, "requestedTotal") * 1_000) / 1_000}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                          Preparado
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {Math.round(getMetricValue(metrics, "preparedTotal") * 1_000) / 1_000}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                          Alertas
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {missingLoc + partialPrep + likelyShortage + splitLoc}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {missingLoc > 0 ? (
                        <span className="ui-chip ui-chip--warn">{missingLoc} sin LOC de salida</span>
                      ) : null}
                      {partialPrep > 0 ? (
                        <span className="ui-chip ui-chip--warn">{partialPrep} preparación parcial</span>
                      ) : null}
                      {likelyShortage > 0 ? (
                        <span className="ui-chip ui-chip--warn">{likelyShortage} con stock insuficiente</span>
                      ) : null}
                      {splitLoc > 0 ? (
                        <span className="ui-chip ui-chip--warn">{splitLoc} sale de varios LOCs</span>
                      ) : null}
                      {cleanCard ? (
                        <span className="ui-chip ui-chip--success">Sin alertas de preparación</span>
                      ) : null}
                    </div>

                    {row.notes ? (
                      <div className="rounded-2xl border border-[var(--ui-border)] bg-white/90 p-3">
                        <div className="ui-caption">Notas</div>
                        <div className="mt-1 line-clamp-3 text-sm text-[var(--ui-text)]">
                          {row.notes}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-2 border-t border-white/80 pt-4 sm:flex-row sm:justify-end">
                      <Link
                        href={`/inventory/remissions/${row.id}?from=prepare`}
                        className="ui-btn ui-btn--ghost h-11 w-full px-5 text-sm font-semibold sm:w-auto"
                      >
                        Ver detalle
                      </Link>
                      <Link
                        href={`/inventory/remissions/${row.id}?from=prepare`}
                        className="ui-btn ui-btn--brand h-11 w-full px-6 text-sm font-semibold sm:w-auto"
                      >
                        Preparar
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="ui-empty rounded-3xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-8 text-center">
            <div className="text-lg font-semibold text-[var(--ui-text)]">
              No hay remisiones en esta vista
            </div>
            <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--ui-muted)]">
              Cambia el filtro o espera una nueva solicitud. Cuando una sede envíe una remisión hacia {activeSiteName}, aparecerá aquí.
            </p>
            <Link href={buildQueueHref({ filter: "all" })} className="ui-btn ui-btn--ghost mt-4">
              Ver todas
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
