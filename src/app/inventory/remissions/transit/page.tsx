import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkOperationalSessionPermission } from "@/lib/auth/operational-session";
import { checkOperationalPermission } from "@/lib/auth/operational-context";
import type { SiteOperationalCapabilities } from "@/lib/inventory/site-capabilities";
import {
  formatOperationalRemissionAreaLabel,
  resolveRemissionAreaKindFromKinds,
} from "../operational-area-scope";

export const dynamic = "force-dynamic";

function formatDateTime(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}


const PERMISSIONS = {
  remissionsTransit: "inventory.remissions.transit",
};

type SiteRow = { id: string; name: string | null; site_type: string | null };
type SiteCapabilityRow = Partial<SiteOperationalCapabilities>;

export default async function RemissionsTransitQueuePage() {
  const { supabase, user, operationalSession } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/remissions",
  });

  const isSharedDevice = operationalSession.isSharedDevice;
  let candidateSiteIds = [String(operationalSession.siteId ?? "").trim()].filter(Boolean);

  if (!isSharedDevice) {
    const { data: employee } = await supabase
      .from("employees")
      .select("site_id")
      .eq("id", user.id)
      .single();

    const { data: employeeSiteRows } = await supabase
      .from("employee_sites")
      .select("site_id")
      .eq("employee_id", user.id);

    candidateSiteIds = Array.from(
      new Set(
        [
          String(employee?.site_id ?? "").trim(),
          ...((employeeSiteRows ?? []).map((row) => String(row.site_id ?? "").trim()) as string[]),
        ].filter(Boolean)
      )
    );
  }
  const candidateSites = (((await supabase
    .from("sites")
    .select("id,name,site_type")
    .order("name", { ascending: true })).data ?? []) as SiteRow[]).filter((site) => {
      if (!candidateSiteIds.length) return true;
      return candidateSiteIds.includes(site.id);
    });
  const capabilitySiteIds = candidateSites.map((site) => site.id).filter(Boolean);
  const { data: capabilityRows } = capabilitySiteIds.length
    ? await supabase
        .from("site_operational_capabilities")
        .select("site_id,can_fulfill_remissions")
        .in("site_id", capabilitySiteIds)
    : { data: [] as SiteCapabilityRow[] };
  const capabilityMap = new Map(
    ((capabilityRows ?? []) as SiteCapabilityRow[]).map((row) => [
      String(row.site_id ?? ""),
      row,
    ])
  );
  const productionCenterSites = candidateSites.filter((site) => {
    const capabilities = capabilityMap.get(site.id);
    return typeof capabilities?.can_fulfill_remissions === "boolean"
      ? capabilities.can_fulfill_remissions
      : String(site.site_type ?? "") === "production_center";
  });

  const transitSiteIds = (
    await Promise.all(
      productionCenterSites.map(async (site) => {
        const canTransit = isSharedDevice
          ? await checkOperationalSessionPermission({
              supabase,
              session: operationalSession,
              appId: "nexo",
              code: PERMISSIONS.remissionsTransit,
            })
          : await checkOperationalPermission({
              supabase,
              permissionCode: `nexo.${PERMISSIONS.remissionsTransit}`,
              siteId: site.id,
              appCode: "nexo",
            });
        return canTransit ? site.id : "";
      })
    )
  ).filter(Boolean);

  if (!transitSiteIds.length) {
    return (
      <div className="w-full">
        <Link href="/inventory/remissions" className="ui-caption underline">
          Volver a remisiones
        </Link>
        <div className="mt-4 ui-alert ui-alert--neutral">
          Tu rol actual no tiene permiso para tránsito en ningún centro de producción asignado.
        </div>
      </div>
    );
  }

  const { data: rows } = await supabase
    .from("restock_requests")
    .select("id,created_at,status,from_site_id,to_site_id,notes")
    .in("from_site_id", transitSiteIds)
    .in("status", ["preparing", "in_transit", "partial"])
    .order("created_at", { ascending: false })
    .limit(120);

  const remissions = (rows ?? []) as Array<{
    id: string;
    created_at: string | null;
    status: string | null;
    from_site_id: string | null;
    to_site_id: string | null;
    notes: string | null;
  }>;
  const requestIds = remissions.map((row) => row.id).filter(Boolean);
  const { data: remissionAreaItemsData } = requestIds.length
    ? await supabase
        .from("restock_request_items")
        .select("request_id,production_area_kind")
        .in("request_id", requestIds)
    : { data: [] as Array<{ request_id: string | null; production_area_kind: string | null }> };
  const remissionAreaKindsByRequestId = new Map<string, string[]>();
  for (const row of (remissionAreaItemsData ?? []) as Array<{ request_id: string | null; production_area_kind: string | null }>) {
    const requestId = String(row.request_id ?? "").trim();
    if (!requestId) continue;
    const list = remissionAreaKindsByRequestId.get(requestId) ?? [];
    list.push(String(row.production_area_kind ?? "").trim());
    remissionAreaKindsByRequestId.set(requestId, list);
  }
  const remissionAreaKindByRequestId = new Map<string, string>();
  for (const row of remissions) {
    remissionAreaKindByRequestId.set(
      row.id,
      resolveRemissionAreaKindFromKinds(remissionAreaKindsByRequestId.get(row.id) ?? [])
    );
  }

  const preparingCount = remissions.filter((row) => row.status === "preparing").length;
  const inTransitCount = remissions.filter((row) => row.status === "in_transit").length;
  const partialCount = remissions.filter((row) => row.status === "partial").length;

  const fromSiteIds = Array.from(
    new Set(remissions.map((row) => String(row.from_site_id ?? "").trim()).filter(Boolean))
  );
  const toSiteIds = Array.from(
    new Set(remissions.map((row) => String(row.to_site_id ?? "").trim()).filter(Boolean))
  );
  const allSiteIds = Array.from(new Set([...fromSiteIds, ...toSiteIds]));
  const { data: sitesData } = allSiteIds.length
    ? await supabase.from("sites").select("id,name").in("id", allSiteIds)
    : { data: [] as Array<{ id: string; name: string | null }> };
  const toSiteMap = new Map(
    ((sitesData ?? []) as Array<{ id: string; name: string | null }>).map((s) => [
      s.id,
      s.name ?? s.id,
    ])
  );

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid">
          <div>
            <Link href="/inventory/remissions" className="ui-caption underline">
              Volver a remisiones
            </Link>
            <span className="mt-4 inline-flex ui-chip ui-chip--brand">Vista conductor</span>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
              Cola de tránsito (Conductor)
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-muted)] sm:text-base">
              Remisiones de todos los centros autorizados para checklist, seguimiento y cierre en ruta.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="ui-chip ui-chip--brand">{preparingCount} listas para despacho</span>
              <span className="ui-chip ui-chip--warn">{inTransitCount} en tránsito</span>
              <span className="ui-chip">{partialCount} parciales</span>
            </div>
          </div>
        </div>
      </section>

      <div className="ui-panel ui-remission-section">
        <div className="ui-h3">Remisiones de conductor</div>
        <div className="mt-1 ui-caption">
          {remissions.length} remision(es) en preparando, en tránsito o parcial
        </div>
        <div className="mt-4 space-y-3">
          {remissions.length ? (
            remissions.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-[var(--ui-text)]">
                      Origen:{" "}
                      {toSiteMap.get(String(row.from_site_id ?? "")) ?? row.from_site_id ?? "-"}
                    </div>
                    <div className="text-xs text-[var(--ui-muted)]">
                      Destino:{" "}
                      {toSiteMap.get(String(row.to_site_id ?? "")) ?? row.to_site_id ?? "-"}
                    </div>
                    <div className="text-xs font-semibold text-[var(--ui-text)]">
                      Área destino: {formatOperationalRemissionAreaLabel(remissionAreaKindByRequestId.get(row.id))}
                    </div>
                  </div>
                  <span className="ui-chip ui-chip--brand">
                    {row.status === "preparing"
                      ? "Preparando"
                      : row.status === "in_transit"
                        ? "En tránsito"
                        : row.status === "partial"
                          ? "Parcial"
                          : String(row.status ?? "-")}
                  </span>
                </div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  Creada: {formatDateTime(row.created_at)}
                </div>
                {row.notes ? (
                  <div className="mt-2 text-xs text-[var(--ui-muted)]">Notas: {row.notes}</div>
                ) : null}
                <div className="mt-3">
                  <Link
                    href={`/inventory/remissions/${row.id}?from=transit&site_id=${encodeURIComponent(
                      String(row.from_site_id ?? "")
                    )}`}
                    className="ui-btn ui-btn--action h-11 px-4 text-sm font-semibold"
                  >
                    {row.status === "preparing" ? "Abrir checklist de tránsito" : "Ver remisión"}
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="ui-empty rounded-xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-6">
              No hay remisiones de conductor en este momento.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

