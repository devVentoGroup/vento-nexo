import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";

import { AssetCountScopeForm } from "./asset-count-scope-form";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type SearchParams = {
  status?: string;
  site_id?: string;
  error?: string;
};

type SiteRow = {
  id: string;
  name: string | null;
};

type AreaRow = {
  id: string;
  site_id: string;
  name: string | null;
  kind: string | null;
};

type LocationRow = {
  id: string;
  site_id: string;
  area_id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type PositionRow = {
  id: string;
  site_id: string;
  location_id: string;
  code: string | null;
  name: string | null;
  kind: string | null;
};

type CountSessionRow = {
  id: string;
  site_id: string;
  name: string | null;
  status: string | null;
  scope_type: string | null;
  scope_area_id: string | null;
  scope_location_id: string | null;
  scope_location_position_id: string | null;
  started_at: string | null;
  closed_at: string | null;
  notes: string | null;
  sites?: { id: string; name: string | null } | null;
};

type CountSummaryRow = {
  session_id: string;
  line_count: number | null;
  found_count: number | null;
  missing_count: number | null;
  found_elsewhere_count: number | null;
  damaged_count: number | null;
  extra_count: number | null;
};

type AssetItemSeedRow = {
  id: string;
  site_id: string | null;
  area_id: string | null;
  location_id: string | null;
  location_position_id: string | null;
};

type AssetGroupSeedRow = {
  id: string;
  expected_qty: number | null;
  site_id: string | null;
  area_id: string | null;
  location_id: string | null;
  location_position_id: string | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableUuid(value: FormDataEntryValue | null) {
  const text = asText(value);
  return text || null;
}

function buildCountsReturn(error?: string) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  const qs = params.toString();
  return qs ? `/inventory/assets/counts?${qs}` : "/inventory/assets/counts";
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function statusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "closed") return "Cerrada";
  if (raw === "cancelled") return "Cancelada";
  return "Abierta";
}

function statusClassName(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "closed") return "ui-chip ui-chip--success";
  if (raw === "cancelled") return "ui-chip ui-chip--danger";
  return "ui-chip ui-chip--warn";
}

function scopeLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "area") return "Área";
  if (raw === "loc") return "LOC";
  if (raw === "position") return "Ubicación interna";
  return "Sede";
}

function sessionProgress(summary: CountSummaryRow | undefined) {
  const total = Number(summary?.line_count ?? 0);
  const done =
    Number(summary?.found_count ?? 0) +
    Number(summary?.missing_count ?? 0) +
    Number(summary?.found_elsewhere_count ?? 0) +
    Number(summary?.damaged_count ?? 0) +
    Number(summary?.extra_count ?? 0);

  if (total <= 0) return { done, total, pct: 0 };
  return { done, total, pct: Math.round((done / total) * 100) };
}

function matchesScope<T extends {
  site_id: string | null;
  area_id: string | null;
  location_id: string | null;
  location_position_id: string | null;
}>(
  row: T,
  scope: {
    siteId: string;
    areaId: string | null;
    locationId: string | null;
    positionId: string | null;
  }
) {
  if (row.site_id !== scope.siteId) return false;
  if (scope.areaId && row.area_id !== scope.areaId) return false;
  if (scope.locationId && row.location_id !== scope.locationId) return false;
  if (scope.positionId && row.location_position_id !== scope.positionId) return false;
  return true;
}

function emptyScopeMessage(scopeType: "site" | "area" | "loc" | "position") {
  if (scopeType === "position") {
    return "No hay activos ni grupos activos en esa ubicación interna. Ajusta la ubicación o crea/asigna activos antes de abrir el conteo.";
  }

  if (scopeType === "loc") {
    return "No hay activos ni grupos activos en ese LOC. Ajusta el LOC o crea/asigna activos antes de abrir el conteo.";
  }

  if (scopeType === "area") {
    return "No hay activos ni grupos activos en esa área. Ajusta el área o crea/asigna activos antes de abrir el conteo.";
  }

  return "No hay activos ni grupos activos en esa sede. Ajusta la sede o crea/asigna activos antes de abrir el conteo.";
}

async function createAssetCountSession(formData: FormData) {
  "use server";

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/assets/counts",
    permissionCode: PERMISSION,
  });

  const siteId = asText(formData.get("site_id"));
  const areaId = asNullableUuid(formData.get("area_id"));
  const locationId = asNullableUuid(formData.get("location_id"));
  const positionId = asNullableUuid(formData.get("location_position_id"));
  const name = asText(formData.get("name"));
  const notes = asText(formData.get("notes"));

  if (!siteId) {
    redirect(buildCountsReturn("Selecciona una sede para crear el conteo."));
  }

  let scopeType: "site" | "area" | "loc" | "position" = "site";
  if (positionId) scopeType = "position";
  else if (locationId) scopeType = "loc";
  else if (areaId) scopeType = "area";

  if (positionId && !locationId) {
    redirect(buildCountsReturn("Si eliges ubicación interna, también debes elegir LOC."));
  }

  if (locationId) {
    const { data: location } = await supabase
      .from("inventory_locations")
      .select("id,site_id,area_id")
      .eq("id", locationId)
      .maybeSingle();

    if (!location) {
      redirect(buildCountsReturn("El LOC seleccionado no existe."));
    }

    if (location.site_id !== siteId) {
      redirect(buildCountsReturn("El LOC seleccionado no pertenece a la sede elegida."));
    }

    if (areaId && location.area_id !== areaId) {
      redirect(buildCountsReturn("El LOC seleccionado no pertenece al área elegida."));
    }
  }

  if (positionId) {
    const { data: position } = await supabase
      .from("inventory_location_positions")
      .select("id,site_id,location_id")
      .eq("id", positionId)
      .maybeSingle();

    if (!position) {
      redirect(buildCountsReturn("La ubicación interna seleccionada no existe."));
    }

    if (position.location_id !== locationId) {
      redirect(buildCountsReturn("La ubicación interna no pertenece al LOC seleccionado."));
    }

    if (position.site_id !== siteId) {
      redirect(buildCountsReturn("La ubicación interna no pertenece a la sede elegida."));
    }
  }

  const [itemsRes, groupsRes] = await Promise.all([
    supabase
      .from("asset_items")
      .select("id,site_id,area_id,location_id,location_position_id")
      .eq("lifecycle_status", "activo"),
    supabase
      .from("asset_groups")
      .select("id,expected_qty,site_id,area_id,location_id,location_position_id")
      .eq("lifecycle_status", "activo"),
  ]);

  const scope = { siteId, areaId, locationId, positionId };
  const itemRows = ((itemsRes.data ?? []) as AssetItemSeedRow[])
    .filter((row) => matchesScope(row, scope))
    .map((row) => ({
      asset_item_id: row.id,
      expected_qty: 1,
      counted_qty: 0,
      count_status: "pending",
      expected_site_id: row.site_id,
      expected_area_id: row.area_id,
      expected_location_id: row.location_id,
      expected_location_position_id: row.location_position_id,
    }));

  const groupRows = ((groupsRes.data ?? []) as AssetGroupSeedRow[])
    .filter((row) => matchesScope(row, scope))
    .map((row) => ({
      asset_group_id: row.id,
      expected_qty: Number(row.expected_qty ?? 0),
      counted_qty: 0,
      count_status: "pending",
      expected_site_id: row.site_id,
      expected_area_id: row.area_id,
      expected_location_id: row.location_id,
      expected_location_position_id: row.location_position_id,
    }));

  if (itemsRes.error) {
    redirect(buildCountsReturn(itemsRes.error.message || "No se pudieron leer los activos individuales para el conteo."));
  }

  if (groupsRes.error) {
    redirect(buildCountsReturn(groupsRes.error.message || "No se pudieron leer los grupos de activos para el conteo."));
  }

  const countLines = [...itemRows, ...groupRows];

  if (countLines.length === 0) {
    redirect(buildCountsReturn(emptyScopeMessage(scopeType)));
  }

  const { data: insertedSession, error: sessionError } = await supabase
    .from("asset_count_sessions")
    .insert({
      site_id: siteId,
      name: name || null,
      status: "open",
      scope_type: scopeType,
      scope_area_id: areaId,
      scope_location_id: locationId,
      scope_location_position_id: positionId,
      started_by: user.id,
      notes: notes || null,
    })
    .select("id")
    .single();

  if (sessionError || !insertedSession?.id) {
    redirect(buildCountsReturn(sessionError?.message || "No se pudo crear la sesión de conteo."));
  }

  const linesWithSession = countLines.map((line) => ({
    ...line,
    session_id: insertedSession.id,
  }));

  const { error: lineError } = await supabase
    .from("asset_count_lines")
    .insert(linesWithSession);

  if (lineError) {
    await supabase
      .from("asset_count_sessions")
      .delete()
      .eq("id", insertedSession.id);

    redirect(buildCountsReturn(lineError.message || "No se pudieron crear las líneas del conteo. La sesión fue revertida."));
  }

  revalidatePath("/inventory/assets/counts");
  redirect(`/inventory/assets/counts/${insertedSession.id}`);
}

export default async function AssetCountSessionsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const selectedStatus = String(sp.status ?? "open").trim();
  const selectedSiteId = String(sp.site_id ?? "").trim();
  const errorMsg = String(sp.error ?? "").trim();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/assets/counts",
    permissionCode: PERMISSION,
  });

  const [
    sitesRes,
    areasRes,
    locationsRes,
    positionsRes,
    sessionsRes,
    summariesRes,
  ] = await Promise.all([
    supabase
      .from("sites")
      .select("id,name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("areas")
      .select("id,site_id,name,kind")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("inventory_locations")
      .select("id,site_id,area_id,code,zone,description")
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("inventory_location_positions")
      .select("id,site_id,location_id,code,name,kind")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("asset_count_sessions")
      .select("id,site_id,name,status,scope_type,scope_area_id,scope_location_id,scope_location_position_id,started_at,closed_at,notes,sites(id,name)")
      .order("started_at", { ascending: false })
      .limit(100),
    supabase
      .from("v_asset_count_session_summary")
      .select("session_id,line_count,found_count,missing_count,found_elsewhere_count,damaged_count,extra_count"),
  ]);

  const sites = (sitesRes.data ?? []) as SiteRow[];
  const areas = (areasRes.data ?? []) as AreaRow[];
  const locations = (locationsRes.data ?? []) as LocationRow[];
  const positions = (positionsRes.data ?? []) as PositionRow[];
  const summaries = (summariesRes.data ?? []) as CountSummaryRow[];
  const summaryBySessionId = new Map(summaries.map((summary) => [summary.session_id, summary]));

  const rawSessions = (sessionsRes.data ?? []) as unknown as CountSessionRow[];
  const sessions = rawSessions.filter((session) => {
    if (selectedStatus && selectedStatus !== "all" && session.status !== selectedStatus) return false;
    if (selectedSiteId && session.site_id !== selectedSiteId) return false;
    return true;
  });

  const openCount = rawSessions.filter((session) => session.status === "open").length;
  const closedCount = rawSessions.filter((session) => session.status === "closed").length;
  const cancelledCount = rawSessions.filter((session) => session.status === "cancelled").length;

  const buildHref = (updates: Partial<SearchParams>) => {
    const params = new URLSearchParams();
    const next = {
      status: selectedStatus,
      site_id: selectedSiteId,
      ...updates,
    };

    if (next.status && next.status !== "open") params.set("status", next.status);
    if (next.site_id) params.set("site_id", next.site_id);

    const qs = params.toString();
    return qs ? `/inventory/assets/counts?${qs}` : "/inventory/assets/counts";
  };

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.35fr_0.75fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link
                href="/inventory/assets"
                className="ui-btn ui-btn--ghost inline-flex h-12 items-center px-5 text-base font-semibold"
              >
                ← Inventario de activos
              </Link>
              <h1 className="ui-h1">Conteo de activos</h1>
              <p className="ui-body-muted">
                Revisa lo que debería existir contra lo que el equipo encuentra en cada sede o ubicación.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <a href="#new-asset-count-session" className="ui-btn ui-btn--brand">
                + Nuevo conteo
              </a>
              <Link href={buildHref({ status: "open" })} className={selectedStatus === "open" ? "ui-btn ui-btn--brand" : "ui-btn ui-btn--ghost"}>
                Abiertas
              </Link>
              <Link href={buildHref({ status: "closed" })} className={selectedStatus === "closed" ? "ui-btn ui-btn--brand" : "ui-btn ui-btn--ghost"}>
                Cerradas
              </Link>
              <Link href={buildHref({ status: "all" })} className={selectedStatus === "all" ? "ui-btn ui-btn--brand" : "ui-btn ui-btn--ghost"}>
                Todas
              </Link>
            </div>
          </div>

          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone={openCount > 0 ? "warm" : "success"}>
              <div className="ui-remission-kpi-label">Abiertas</div>
              <div className="ui-remission-kpi-value">{openCount}</div>
              <div className="ui-remission-kpi-note">En ejecución</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Cerradas</div>
              <div className="ui-remission-kpi-value">{closedCount}</div>
              <div className="ui-remission-kpi-note">Finalizadas</div>
            </article>
            <article className="ui-remission-kpi" data-tone={cancelledCount > 0 ? "danger" : "cool"}>
              <div className="ui-remission-kpi-label">Canceladas</div>
              <div className="ui-remission-kpi-value">{cancelledCount}</div>
              <div className="ui-remission-kpi-note">Sin cierre operativo</div>
            </article>
          </div>
        </div>
      </section>

      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}

      <section id="new-asset-count-session" className="ui-panel">
        <AssetCountScopeForm
          action={createAssetCountSession}
          sites={sites}
          areas={areas}
          locations={locations}
          positions={positions}
        />
      </section>

      <section className="ui-panel">
        <div className="flex flex-wrap items-end gap-3">
          <form className="grid flex-1 gap-3 md:grid-cols-[0.8fr_0.8fr_auto]">
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
                <option value="open">Abiertas</option>
                <option value="closed">Cerradas</option>
                <option value="cancelled">Canceladas</option>
                <option value="all">Todas</option>
              </select>
            </label>

            <div className="flex items-end gap-2">
              <button type="submit" className="ui-btn ui-btn--brand h-12 px-5">
                Filtrar
              </button>
              <Link href="/inventory/assets/counts" className="ui-btn ui-btn--ghost h-12 px-5">
                Limpiar
              </Link>
            </div>
          </form>
        </div>
      </section>

      <section className="ui-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="ui-h2">Conteos</h2>
            <p className="mt-2 ui-body-muted">
              Cada conteo nace con una lista esperada según los activos activos dentro del alcance elegido.
            </p>
          </div>
          <span className="ui-chip">{sessions.length} visibles</span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="ui-table min-w-[1120px]">
            <thead>
              <tr>
                <th className="ui-th">Sesión</th>
                <th className="ui-th">Sede</th>
                <th className="ui-th">Alcance</th>
                <th className="ui-th">Estado</th>
                <th className="ui-th">Progreso</th>
                <th className="ui-th">Fechas</th>
                <th className="ui-th">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const summary = summaryBySessionId.get(session.id);
                const progress = sessionProgress(summary);

                return (
                  <tr key={session.id} className="border-t border-zinc-200/60 align-top">
                    <td className="ui-td">
                      <div className="font-semibold text-[var(--ui-text)]">
                        {session.name || "Conteo de activos"}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">{session.id}</div>
                      {session.notes ? (
                        <div className="mt-2 max-w-[260px] text-xs text-[var(--ui-muted)]">{session.notes}</div>
                      ) : null}
                    </td>
                    <td className="ui-td">
                      {session.sites?.name || session.site_id}
                    </td>
                    <td className="ui-td">
                      <span className="ui-chip">{scopeLabel(session.scope_type)}</span>
                    </td>
                    <td className="ui-td">
                      <span className={statusClassName(session.status)}>{statusLabel(session.status)}</span>
                    </td>
                    <td className="ui-td">
                      <div className="min-w-[180px]">
                        <div className="text-sm font-semibold text-[var(--ui-text)]">
                          {progress.done}/{progress.total} líneas
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-slate-900"
                            style={{ width: `${Math.min(progress.pct, 100)}%` }}
                          />
                        </div>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          {progress.pct}% completado
                        </div>
                      </div>
                    </td>
                    <td className="ui-td">
                      <div className="text-sm">Inicio: {fmtDateTime(session.started_at)}</div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        Cierre: {fmtDateTime(session.closed_at)}
                      </div>
                    </td>
                    <td className="ui-td">
                      <div className="flex min-w-[160px] flex-col gap-2">
                        <Link href={`/inventory/assets/counts/${session.id}`} className="ui-btn ui-btn--ghost h-9 px-3 text-sm">
                          Abrir conteo
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {sessions.length === 0 ? (
                <tr>
                  <td className="ui-td ui-empty" colSpan={7}>
                    No hay sesiones de conteo para estos filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
