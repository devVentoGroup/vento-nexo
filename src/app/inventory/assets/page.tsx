import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";
const NEXO_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://nexo.ventogroup.co";

type SearchParams = {
  q?: string;
  site_id?: string;
  status?: string;
  view?: string;
};

type SiteRow = {
  id: string;
  name: string | null;
};

type AssetItemRow = {
  id: string;
  product_id: string;
  product_name: string | null;
  product_sku: string | null;
  asset_code: string | null;
  qr_token: string | null;
  display_name: string | null;
  internal_plate: string | null;
  serial_number: string | null;
  brand: string | null;
  model: string | null;
  equipment_status: string | null;
  condition_status: string | null;
  lifecycle_status: string | null;
  ownership_status: string | null;
  site_id: string | null;
  site_name: string | null;
  area_id: string | null;
  area_name: string | null;
  area_kind: string | null;
  location_id: string | null;
  location_code: string | null;
  location_zone: string | null;
  location_position_id: string | null;
  position_code: string | null;
  position_name: string | null;
  responsible_employee_id: string | null;
  responsible_name: string | null;
  commercial_value: number | null;
  warranty_until: string | null;
  main_image_url: string | null;
  technical_sheet_path: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AssetGroupRow = {
  id: string;
  product_id: string;
  product_name: string | null;
  product_sku: string | null;
  group_code: string | null;
  qr_token: string | null;
  name: string | null;
  expected_qty: number | null;
  unit_code: string | null;
  condition_status: string | null;
  lifecycle_status: string | null;
  site_id: string | null;
  site_name: string | null;
  area_id: string | null;
  area_name: string | null;
  area_kind: string | null;
  location_id: string | null;
  location_code: string | null;
  location_zone: string | null;
  location_position_id: string | null;
  position_code: string | null;
  position_name: string | null;
  responsible_employee_id: string | null;
  responsible_name: string | null;
  main_image_url: string | null;
  technical_sheet_path: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AssetMaintenanceRecordRow = {
  id: string;
  asset_item_id: string | null;
  status: string | null;
  maintenance_type: string | null;
  scheduled_date: string | null;
  performed_date: string | null;
  next_scheduled_date: string | null;
  maintenance_provider: string | null;
  work_done: string | null;
  notes: string | null;
};

type AssetMaintenanceSummary = {
  label: string;
  detail: string;
  tone: "success" | "warn" | "danger" | "neutral";
  nextDate: string | null;
  overdueCount: number;
  upcomingCount: number;
};

function fmtQty(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function fmtMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(parsed);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetweenIso(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T12:00:00`);
  const to = new Date(`${toIso}T12:00:00`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function maintenanceTypeLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "corrective") return "Correctivo";
  if (raw === "inspection") return "Inspección";
  if (raw === "calibration") return "Calibración";
  if (raw === "cleaning") return "Limpieza";
  if (raw === "other") return "Otro";
  return "Preventivo";
}

function maintenanceIsOpen(row: AssetMaintenanceRecordRow) {
  const status = String(row.status ?? "").trim();
  return status !== "done" && status !== "cancelled";
}

function maintenanceDates(row: AssetMaintenanceRecordRow) {
  const dates = [row.scheduled_date, row.next_scheduled_date]
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(dates));
}

function defaultMaintenanceSummary(): AssetMaintenanceSummary {
  return {
    label: "Al día",
    detail: "Sin pendientes registrados",
    tone: "success",
    nextDate: null,
    overdueCount: 0,
    upcomingCount: 0,
  };
}

function buildMaintenanceSummary(
  rows: AssetMaintenanceRecordRow[],
  todayIso: string
): AssetMaintenanceSummary {
  const openRows = rows.filter(maintenanceIsOpen);
  const dated = openRows.flatMap((row) =>
    maintenanceDates(row).map((date) => ({
      date,
      row,
      diffDays: daysBetweenIso(todayIso, date),
    }))
  );

  const overdue = dated.filter((item) => item.diffDays < 0);
  if (overdue.length > 0) {
    const oldest = overdue.sort((a, b) => a.diffDays - b.diffDays)[0];
    return {
      label: "Vencido",
      detail: `${Math.abs(oldest.diffDays)} día(s) de atraso · ${maintenanceTypeLabel(oldest.row.maintenance_type)}`,
      tone: "danger",
      nextDate: oldest.date,
      overdueCount: overdue.length,
      upcomingCount: dated.filter((item) => item.diffDays >= 0 && item.diffDays <= 30).length,
    };
  }

  const upcoming = dated
    .filter((item) => item.diffDays >= 0)
    .sort((a, b) => a.diffDays - b.diffDays);

  if (upcoming.length > 0) {
    const next = upcoming[0];
    return {
      label: next.diffDays <= 30 ? "Próximo" : "Programado",
      detail:
        next.diffDays === 0
          ? `Hoy · ${maintenanceTypeLabel(next.row.maintenance_type)}`
          : `En ${next.diffDays} día(s) · ${maintenanceTypeLabel(next.row.maintenance_type)}`,
      tone: next.diffDays <= 30 ? "warn" : "neutral",
      nextDate: next.date,
      overdueCount: 0,
      upcomingCount: upcoming.filter((item) => item.diffDays <= 30).length,
    };
  }

  return defaultMaintenanceSummary();
}

function maintenanceChipClass(tone: AssetMaintenanceSummary["tone"]) {
  if (tone === "danger") return "ui-chip ui-chip--danger";
  if (tone === "warn") return "ui-chip ui-chip--warn";
  if (tone === "success") return "ui-chip ui-chip--success";
  return "ui-chip";
}

function equipmentStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "en_mantenimiento") return "En mantenimiento";
  if (raw === "fuera_servicio") return "Fuera de servicio";
  if (raw === "baja") return "De baja";
  return "Operativo";
}

function lifecycleStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "almacenado") return "Almacenado";
  if (raw === "prestado") return "Prestado";
  if (raw === "en_reparacion") return "En reparación";
  if (raw === "retirado") return "Retirado";
  if (raw === "perdido") return "Perdido";
  return "Activo";
}

function conditionStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "nuevo") return "Nuevo";
  if (raw === "regular") return "Regular";
  if (raw === "malo") return "Malo";
  if (raw === "critico") return "Crítico";
  return "Bueno";
}

function statusClassName(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "operativo" || raw === "activo" || raw === "bueno" || raw === "nuevo") {
    return "ui-chip ui-chip--success";
  }
  if (raw === "en_mantenimiento" || raw === "en_reparacion" || raw === "regular" || raw === "almacenado") {
    return "ui-chip ui-chip--warn";
  }
  if (raw === "fuera_servicio" || raw === "baja" || raw === "malo" || raw === "critico" || raw === "perdido") {
    return "ui-chip ui-chip--danger";
  }
  return "ui-chip";
}

function locationLabel(row: {
  site_name?: string | null;
  area_name?: string | null;
  area_kind?: string | null;
  location_code?: string | null;
  location_zone?: string | null;
  position_name?: string | null;
  position_code?: string | null;
}) {
  const site = String(row.site_name ?? "").trim();
  const area = String(row.area_name ?? row.area_kind ?? "").trim();
  const loc = [row.location_code, row.location_zone].filter(Boolean).join(" - ");
  const position = String(row.position_name ?? row.position_code ?? "").trim();

  const parts = [site, area, loc, position].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sin ubicación";
}

function qrImageUrl(path: string | null | undefined) {
  if (!path) return "";
  const absoluteUrl = `${NEXO_BASE_URL}${path}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=132x132&data=${encodeURIComponent(absoluteUrl)}`;
}

function normalizeSearch(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function matchesQuery(row: Record<string, unknown>, query: string) {
  if (!query) return true;
  const searchable = [
    row.product_name,
    row.product_sku,
    row.asset_code,
    row.group_code,
    row.display_name,
    row.name,
    row.internal_plate,
    row.serial_number,
    row.brand,
    row.model,
    row.site_name,
    row.area_name,
    row.location_code,
    row.location_zone,
    row.position_name,
    row.responsible_name,
  ]
    .map((value) => normalizeSearch(String(value ?? "")))
    .join(" ");

  return searchable.includes(query);
}

function applyCommonFilters<T extends { site_id: string | null; lifecycle_status: string | null }>(
  rows: T[],
  params: {
    query: string;
    siteId: string;
    status: string;
  }
) {
  return rows.filter((row) => {
    if (params.siteId && row.site_id !== params.siteId) return false;
    if (params.status && String(row.lifecycle_status ?? "").trim() !== params.status) return false;
    return matchesQuery(row as Record<string, unknown>, params.query);
  });
}

export default async function InventoryAssetsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const searchQuery = String(sp.q ?? "").trim();
  const normalizedQuery = normalizeSearch(searchQuery);
  const selectedSiteId = String(sp.site_id ?? "").trim();
  const selectedStatus = String(sp.status ?? "").trim();
  const view = String(sp.view ?? "all").trim() === "groups" ? "groups" : String(sp.view ?? "all").trim() === "items" ? "items" : "all";

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/assets",
    permissionCode: PERMISSION,
  });

  const [sitesRes, itemsRes, groupsRes, assetProductsCountRes] = await Promise.all([
    supabase
      .from("sites")
      .select("id,name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("v_asset_items_inventory_status")
      .select("*")
      .order("product_name", { ascending: true })
      .limit(500),
    supabase
      .from("v_asset_groups_inventory_status")
      .select("*")
      .order("product_name", { ascending: true })
      .limit(500),
    supabase
      .from("product_inventory_profiles")
      .select("product_id", { head: true, count: "exact" })
      .eq("inventory_kind", "asset"),
  ]);

  const sites = (sitesRes.data ?? []) as SiteRow[];
  const itemViewMissing = Boolean(itemsRes.error);
  const groupViewMissing = Boolean(groupsRes.error);
  const rawItems = itemViewMissing ? [] : ((itemsRes.data ?? []) as AssetItemRow[]);
  const rawGroups = groupViewMissing ? [] : ((groupsRes.data ?? []) as AssetGroupRow[]);
  const rawItemIds = rawItems.map((item) => item.id);

  const assetMaintenanceRes =
    rawItemIds.length > 0
      ? await supabase
        .from("asset_maintenance_records")
        .select("id,asset_item_id,status,maintenance_type,scheduled_date,performed_date,next_scheduled_date,maintenance_provider,work_done,notes")
        .in("asset_item_id", rawItemIds)
        .order("scheduled_date", { ascending: true })
      : { data: [], error: null };

  const maintenanceRows = assetMaintenanceRes.error
    ? []
    : ((assetMaintenanceRes.data ?? []) as AssetMaintenanceRecordRow[]);

  const todayIso = todayIsoDate();
  const maintenanceByAssetId = new Map<string, AssetMaintenanceSummary>();
  rawItems.forEach((item) => {
    const rows = maintenanceRows.filter((row) => row.asset_item_id === item.id);
    maintenanceByAssetId.set(item.id, buildMaintenanceSummary(rows, todayIso));
  });

  const assetItems = applyCommonFilters(rawItems, {
    query: normalizedQuery,
    siteId: selectedSiteId,
    status: selectedStatus,
  });
  const assetGroups = applyCommonFilters(rawGroups, {
    query: normalizedQuery,
    siteId: selectedSiteId,
    status: selectedStatus,
  });

  const visibleItems = view === "groups" ? [] : assetItems;
  const visibleGroups = view === "items" ? [] : assetGroups;

  const individualCount = rawItems.length;
  const groupCount = rawGroups.length;
  const groupedExpectedQty = rawGroups.reduce((acc, group) => acc + Number(group.expected_qty ?? 0), 0);
  const maintenanceCount = rawItems.filter(
    (item) =>
      String(item.equipment_status ?? "").trim() === "en_mantenimiento" ||
      String(item.lifecycle_status ?? "").trim() === "en_reparacion"
  ).length;
  const missingLocationCount =
    rawItems.filter((item) => !item.site_id || !item.location_id).length +
    rawGroups.filter((group) => !group.site_id || !group.location_id).length;
  const overdueMaintenanceCount = rawItems.filter(
    (item) => maintenanceByAssetId.get(item.id)?.tone === "danger"
  ).length;
  const upcomingMaintenanceCount = rawItems.filter(
    (item) => maintenanceByAssetId.get(item.id)?.tone === "warn"
  ).length;

  const buildHref = (updates: Partial<SearchParams>) => {
    const params = new URLSearchParams();
    const next = {
      q: searchQuery,
      site_id: selectedSiteId,
      status: selectedStatus,
      view,
      ...updates,
    };

    if (next.q) params.set("q", next.q);
    if (next.site_id) params.set("site_id", next.site_id);
    if (next.status) params.set("status", next.status);
    if (next.view && next.view !== "all") params.set("view", next.view);

    const qs = params.toString();
    return qs ? `/inventory/assets?${qs}` : "/inventory/assets";
  };

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link
                href="/inventory/catalog?tab=equipos"
                className="ui-btn ui-btn--ghost inline-flex h-12 items-center px-5 text-base font-semibold"
              >
                ← Volver a equipos del catálogo
              </Link>
              <h1 className="ui-h1">Activos físicos</h1>
              <p className="ui-body-muted">
                Inventario patrimonial real: unidades físicas, grupos contables, ubicación operativa, QR y ficha técnica por activo.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/inventory/assets/new" className="ui-btn ui-btn--brand">
                + Crear activo físico
              </Link>
              <Link href="/inventory/assets/counts" className="ui-btn ui-btn--ghost">
                Conteo patrimonial
              </Link>
              <Link href={buildHref({ view: "all" })} className={view === "all" ? "ui-btn ui-btn--brand" : "ui-btn ui-btn--ghost"}>
                Todo
              </Link>
              <Link href={buildHref({ view: "items" })} className={view === "items" ? "ui-btn ui-btn--brand" : "ui-btn ui-btn--ghost"}>
                Individuales
              </Link>
              <Link href={buildHref({ view: "groups" })} className={view === "groups" ? "ui-btn ui-btn--brand" : "ui-btn ui-btn--ghost"}>
                Grupos
              </Link>
            </div>
          </div>

          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Activos individuales</div>
              <div className="ui-remission-kpi-value">{individualCount}</div>
              <div className="ui-remission-kpi-note">Unidades con QR y ficha propia</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Grupos contables</div>
              <div className="ui-remission-kpi-value">{groupCount}</div>
              <div className="ui-remission-kpi-note">{fmtQty(groupedExpectedQty)} unidades esperadas</div>
            </article>
            <article className="ui-remission-kpi" data-tone={missingLocationCount > 0 ? "warm" : "success"}>
              <div className="ui-remission-kpi-label">Sin ubicación completa</div>
              <div className="ui-remission-kpi-value">{missingLocationCount}</div>
              <div className="ui-remission-kpi-note">{maintenanceCount} en mantenimiento/reparación</div>
            </article>
            <article className="ui-remission-kpi" data-tone={upcomingMaintenanceCount > 0 ? "warm" : "success"}>
              <div className="ui-remission-kpi-label">Mantenimientos próximos</div>
              <div className="ui-remission-kpi-value">{upcomingMaintenanceCount}</div>
              <div className="ui-remission-kpi-note">Próximos 30 días</div>
            </article>
            <article className="ui-remission-kpi" data-tone={overdueMaintenanceCount > 0 ? "danger" : "success"}>
              <div className="ui-remission-kpi-label">Mantenimientos vencidos</div>
              <div className="ui-remission-kpi-value">{overdueMaintenanceCount}</div>
              <div className="ui-remission-kpi-note">Requieren atención</div>
            </article>
          </div>
        </div>
      </section>

      {itemViewMissing || groupViewMissing ? (
        <div className="ui-alert ui-alert--warn">
          Aplica primero la migración <strong>20260603_add_asset_items_and_asset_counts.sql</strong>. Faltan vistas de activos físicos.
        </div>
      ) : null}

      {assetMaintenanceRes.error ? (
        <div className="ui-alert ui-alert--warn">
          No se pudieron leer los mantenimientos de activos físicos. El listado sigue funcionando sin indicadores de mantenimiento.
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="ui-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="ui-h2">Resumen operativo de activos</h2>
              <p className="mt-2 ui-body-muted">
                Acciones rápidas para mantener el inventario patrimonial limpio, ubicado y con mantenimientos controlados.
              </p>
            </div>
            <span className="ui-chip ui-chip--brand">
              {individualCount + groupCount} registros
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Link
              href="/inventory/assets/new"
              className="rounded-[1.5rem] border border-cyan-200 bg-cyan-50 p-4 transition hover:-translate-y-0.5 hover:bg-cyan-100 hover:shadow-sm"
            >
              <div className="text-2xl">➕</div>
              <div className="mt-3 text-base font-black text-cyan-950">Crear activo físico</div>
              <p className="mt-1 text-sm leading-6 text-cyan-900">
                Registra una unidad individual con QR o un grupo contable por cantidad.
              </p>
            </Link>

            <Link
              href="/inventory/assets/counts"
              className="rounded-[1.5rem] border border-indigo-200 bg-indigo-50 p-4 transition hover:-translate-y-0.5 hover:bg-indigo-100 hover:shadow-sm"
            >
              <div className="text-2xl">📋</div>
              <div className="mt-3 text-base font-black text-indigo-950">Conteo patrimonial</div>
              <p className="mt-1 text-sm leading-6 text-indigo-900">
                Valida activos y grupos por sede, área, LOC o ubicación interna.
              </p>
            </Link>

            <a
              href="#assets-location-review"
              className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 transition hover:-translate-y-0.5 hover:bg-amber-100 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl">📍</div>
                  <div className="mt-3 text-base font-black text-amber-950">Sin ubicación</div>
                </div>
                <div className="text-3xl font-black text-amber-950">{missingLocationCount}</div>
              </div>
              <p className="mt-1 text-sm leading-6 text-amber-900">
                Activos o grupos que necesitan sede y LOC completo.
              </p>
            </a>

            <a
              href="#assets-maintenance-review"
              className={`rounded-[1.5rem] border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${
                overdueMaintenanceCount > 0
                  ? "border-rose-200 bg-rose-50 hover:bg-rose-100"
                  : upcomingMaintenanceCount > 0
                    ? "border-orange-200 bg-orange-50 hover:bg-orange-100"
                    : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl">🛠️</div>
                  <div className="mt-3 text-base font-black text-slate-950">Mantenimiento</div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-slate-950">{overdueMaintenanceCount}</div>
                  <div className="text-xs font-bold text-slate-500">vencidos</div>
                </div>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                {upcomingMaintenanceCount} próximos · {maintenanceCount} en mantenimiento/reparación.
              </p>
            </a>
          </div>
        </div>

        <div className="ui-panel" id="assets-maintenance-review">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="ui-h2">Señales rápidas</h2>
              <p className="mt-2 ui-body-muted">
                Prioriza lo que puede afectar operación o trazabilidad.
              </p>
            </div>
            <div className="text-3xl">⚡</div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-[var(--ui-text)]">Ubicación pendiente</div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                    Revisa activos sin sede o sin LOC completo.
                  </div>
                </div>
                <span className={missingLocationCount > 0 ? "ui-chip ui-chip--warn" : "ui-chip ui-chip--success"}>
                  {missingLocationCount}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-[var(--ui-text)]">Mantenimientos próximos</div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                    Programados o por vencer en los próximos 30 días.
                  </div>
                </div>
                <span className={upcomingMaintenanceCount > 0 ? "ui-chip ui-chip--warn" : "ui-chip ui-chip--success"}>
                  {upcomingMaintenanceCount}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-[var(--ui-text)]">Mantenimientos vencidos</div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                    Deben revisarse antes de cerrar operación o conteo.
                  </div>
                </div>
                <span className={overdueMaintenanceCount > 0 ? "ui-chip ui-chip--danger" : "ui-chip ui-chip--success"}>
                  {overdueMaintenanceCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div id="assets-location-review" />

      <section className="ui-panel">
        <div className="flex flex-wrap items-end gap-3">
          <form className="grid flex-1 gap-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
            <input type="hidden" name="view" value={view} />

            <label className="flex flex-col gap-1">
              <span className="ui-label">Buscar</span>
              <input
                name="q"
                defaultValue={searchQuery}
                className="ui-input"
                placeholder="Nombre, SKU, serial, placa, sede, LOC..."
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Sede</span>
              <select name="site_id" defaultValue={selectedSiteId} className="ui-input">
                <option value="">Todas</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Estado</span>
              <select name="status" defaultValue={selectedStatus} className="ui-input">
                <option value="">Todos</option>
                <option value="activo">Activo</option>
                <option value="almacenado">Almacenado</option>
                <option value="prestado">Prestado</option>
                <option value="en_reparacion">En reparación</option>
                <option value="retirado">Retirado</option>
                <option value="perdido">Perdido</option>
              </select>
            </label>

            <div className="flex items-end gap-2">
              <button type="submit" className="ui-btn ui-btn--brand h-12 px-5">
                Filtrar
              </button>
              <Link href="/inventory/assets" className="ui-btn ui-btn--ghost h-12 px-5">
                Limpiar
              </Link>
            </div>
          </form>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-[var(--ui-muted)]">
            Productos marcados como activos en catálogo:{" "}
            <strong className="text-[var(--ui-text)]">{assetProductsCountRes.count ?? 0}</strong>. Esta pantalla muestra solo los activos físicos ya creados desde esos modelos.
          </div>
          <Link
            href="/inventory/assets/counts"
            className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-sm font-semibold text-cyan-900 transition hover:bg-cyan-100"
          >
            Abrir conteo patrimonial → valida activos individuales y grupos por sede, área, LOC o ubicación interna.
          </Link>
        </div>
      </section>

      {view !== "groups" ? (
        <section className="ui-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="ui-h2">Activos individuales</h2>
              <p className="mt-2 ui-body-muted">
                Equipos con trazabilidad propia: serial, placa, ubicación, estado, QR y ficha técnica individual.
              </p>
            </div>
            <span className="ui-chip">{visibleItems.length} visibles</span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="ui-table min-w-[1500px]">
              <thead>
                <tr>
                  <th className="ui-th">Activo</th>
                  <th className="ui-th">Identificación</th>
                  <th className="ui-th">Ubicación</th>
                  <th className="ui-th">Estado</th>
                  <th className="ui-th">Responsable</th>
                  <th className="ui-th">Valor / garantía</th>
                  <th className="ui-th">Mantenimiento</th>
                  <th className="ui-th">QR</th>
                  <th className="ui-th">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => {
                  const href = item.technical_sheet_path || `/inventory/assets/items/${item.id}`;
                  const imageUrl = String(item.main_image_url ?? "").trim();
                  return (
                    <tr key={item.id} className="border-t border-zinc-200/60 align-top">
                      <td className="ui-td">
                        <div className="flex min-w-[260px] gap-3">
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-slate-500">
                              ACT
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-[var(--ui-text)]">
                              {item.display_name || item.product_name || "Activo"}
                            </div>
                            <div className="mt-1 text-xs text-[var(--ui-muted)]">
                              {item.product_sku ? `SKU ${item.product_sku}` : item.product_id}
                            </div>
                            <div className="mt-1 text-xs text-[var(--ui-muted)]">
                              {[item.brand, item.model].filter(Boolean).join(" · ") || "Sin marca/modelo"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="ui-td">
                        <div className="font-semibold">{item.asset_code ?? "Sin código"}</div>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          Placa: {item.internal_plate || "—"}
                        </div>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          Serial: {item.serial_number || "—"}
                        </div>
                      </td>
                      <td className="ui-td">
                        <div className="max-w-[260px] text-sm">{locationLabel(item)}</div>
                      </td>
                      <td className="ui-td">
                        <div className="flex flex-col gap-1">
                          <span className={statusClassName(item.equipment_status)}>
                            {equipmentStatusLabel(item.equipment_status)}
                          </span>
                          <span className={statusClassName(item.lifecycle_status)}>
                            {lifecycleStatusLabel(item.lifecycle_status)}
                          </span>
                          <span className={statusClassName(item.condition_status)}>
                            {conditionStatusLabel(item.condition_status)}
                          </span>
                        </div>
                      </td>
                      <td className="ui-td">{item.responsible_name || "Sin responsable"}</td>
                      <td className="ui-td">
                        <div>{fmtMoney(item.commercial_value)}</div>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          Garantía: {fmtDate(item.warranty_until)}
                        </div>
                      </td>
                      <td className="ui-td">
                        {(() => {
                          const summary = maintenanceByAssetId.get(item.id) ?? defaultMaintenanceSummary();
                          return (
                            <div className="min-w-[170px]">
                              <span className={maintenanceChipClass(summary.tone)}>{summary.label}</span>
                              <div className="mt-2 text-xs text-[var(--ui-muted)]">{summary.detail}</div>
                              {summary.nextDate ? (
                                <div className="mt-1 text-xs font-semibold text-[var(--ui-text)]">
                                  {fmtDate(summary.nextDate)}
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="ui-td">
                        {qrImageUrl(href) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={qrImageUrl(href)} alt="QR" className="h-20 w-20 rounded-xl border border-slate-200 bg-white p-1" />
                        ) : (
                          <span className="text-sm text-[var(--ui-muted)]">Sin QR</span>
                        )}
                      </td>
                      <td className="ui-td">
                        <div className="flex min-w-[180px] flex-col gap-2">
                          <Link href={href} className="ui-btn ui-btn--ghost h-9 px-3 text-sm">
                            Ver ficha / QR
                          </Link>
                          <Link href={`${href}#asset-maintenance-action`} className="ui-btn ui-btn--ghost h-9 px-3 text-sm">
                            Mantenimiento
                          </Link>
                          <Link href={`${href}#asset-location-action`} className="ui-btn ui-btn--ghost h-9 px-3 text-sm">
                            Ubicación
                          </Link>
                          <Link href={`/inventory/catalog/${item.product_id}/ficha`} className="ui-btn ui-btn--ghost h-9 px-3 text-sm">
                            Modelo catálogo
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {visibleItems.length === 0 ? (
                  <tr>
                    <td className="ui-td ui-empty" colSpan={9}>
                      Todavía no hay activos individuales creados para estos filtros.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {view !== "items" ? (
        <section className="ui-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="ui-h2">Grupos contables</h2>
              <p className="mt-2 ui-body-muted">
                Activos repetidos que se cuentan por cantidad, sin serial individual obligatorio.
              </p>
            </div>
            <span className="ui-chip">{visibleGroups.length} visibles</span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="ui-table min-w-[1180px]">
              <thead>
                <tr>
                  <th className="ui-th">Grupo</th>
                  <th className="ui-th">Modelo</th>
                  <th className="ui-th">Cantidad esperada</th>
                  <th className="ui-th">Ubicación</th>
                  <th className="ui-th">Estado</th>
                  <th className="ui-th">Responsable</th>
                  <th className="ui-th">QR</th>
                  <th className="ui-th">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((group) => {
                  const href = group.technical_sheet_path || `/inventory/assets/groups/${group.id}`;
                  const imageUrl = String(group.main_image_url ?? "").trim();
                  return (
                    <tr key={group.id} className="border-t border-zinc-200/60 align-top">
                      <td className="ui-td">
                        <div className="flex min-w-[240px] gap-3">
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imageUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-slate-500">
                              GRP
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-[var(--ui-text)]">
                              {group.name || "Grupo de activos"}
                            </div>
                            <div className="mt-1 text-xs text-[var(--ui-muted)]">
                              {group.group_code ?? "Sin código"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="ui-td">
                        <div>{group.product_name || "Producto base"}</div>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          {group.product_sku ? `SKU ${group.product_sku}` : group.product_id}
                        </div>
                      </td>
                      <td className="ui-td">
                        <div className="text-lg font-semibold text-[var(--ui-text)]">
                          {fmtQty(group.expected_qty)} {group.unit_code || "un"}
                        </div>
                      </td>
                      <td className="ui-td">
                        <div className="max-w-[260px] text-sm">{locationLabel(group)}</div>
                      </td>
                      <td className="ui-td">
                        <div className="flex flex-col gap-1">
                          <span className={statusClassName(group.lifecycle_status)}>
                            {lifecycleStatusLabel(group.lifecycle_status)}
                          </span>
                          <span className={statusClassName(group.condition_status)}>
                            {conditionStatusLabel(group.condition_status)}
                          </span>
                        </div>
                      </td>
                      <td className="ui-td">{group.responsible_name || "Sin responsable"}</td>
                      <td className="ui-td">
                        {qrImageUrl(href) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={qrImageUrl(href)} alt="QR" className="h-20 w-20 rounded-xl border border-slate-200 bg-white p-1" />
                        ) : (
                          <span className="text-sm text-[var(--ui-muted)]">Sin QR</span>
                        )}
                      </td>
                      <td className="ui-td">
                        <div className="flex min-w-[160px] flex-col gap-2">
                          <Link href={href} className="ui-btn ui-btn--ghost h-9 px-3 text-sm">
                            Ver ficha
                          </Link>
                          <Link href={`/inventory/catalog/${group.product_id}/ficha`} className="ui-btn ui-btn--ghost h-9 px-3 text-sm">
                            Modelo catálogo
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {visibleGroups.length === 0 ? (
                  <tr>
                    <td className="ui-td ui-empty" colSpan={8}>
                      Todavía no hay grupos de activos creados para estos filtros.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
