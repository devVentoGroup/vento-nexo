import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";

export const dynamic = "force-dynamic";

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

const PERMISSIONS = {
  remissionsTransit: "inventory.remissions.transit",
};

export default async function RemissionsTransitQueuePage() {
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/remissions",
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("site_id,role")
    .eq("id", user.id)
    .single();
  const actualRole = String(employee?.role ?? "");

  const { data: employeeSiteRows } = await supabase
    .from("employee_sites")
    .select("site_id")
    .eq("employee_id", user.id);

  const candidateSiteIds = Array.from(
    new Set(
      [
        String(employee?.site_id ?? "").trim(),
        ...((employeeSiteRows ?? []).map((row) => String(row.site_id ?? "").trim()) as string[]),
      ].filter(Boolean)
    )
  );

  const { data: candidateSites } = candidateSiteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", candidateSiteIds)
    : { data: [] as Array<{ id: string; name: string | null; site_type: string | null }> };

  const productionCenterSites = (
    (candidateSites ?? []) as Array<{ id: string; name: string | null; site_type: string | null }>
  ).filter((site) => String(site.site_type ?? "") === "production_center");

  const transitSiteIds = (
    await Promise.all(
      productionCenterSites.map(async (site) => {
        const canTransit = await checkPermissionWithRoleOverride({
          supabase,
          appId: "nexo",
          code: PERMISSIONS.remissionsTransit,
          context: { siteId: site.id },
          actualRole,
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

