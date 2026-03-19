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

  const { data: settings } = await supabase
    .from("employee_settings")
    .select("selected_site_id")
    .eq("employee_id", user.id)
    .maybeSingle();
  const activeSiteId = String(settings?.selected_site_id ?? employee?.site_id ?? "").trim();
  if (!activeSiteId) {
    return (
      <div className="w-full">
        <Link href="/inventory/remissions" className="ui-caption underline">
          Volver a remisiones
        </Link>
        <div className="mt-4 ui-alert ui-alert--warn">
          Debes seleccionar sede activa para ver la cola de tránsito.
        </div>
      </div>
    );
  }

  const canTransit = await checkPermissionWithRoleOverride({
    supabase,
    appId: "nexo",
    code: PERMISSIONS.remissionsTransit,
    context: { siteId: activeSiteId },
    actualRole,
  });
  if (!canTransit) {
    return (
      <div className="w-full">
        <Link href="/inventory/remissions" className="ui-caption underline">
          Volver a remisiones
        </Link>
        <div className="mt-4 ui-alert ui-alert--neutral">
          Tu rol actual no tiene permiso para poner en tránsito en esta sede.
        </div>
      </div>
    );
  }

  const { data: site } = await supabase
    .from("sites")
    .select("name")
    .eq("id", activeSiteId)
    .maybeSingle();

  const { data: rows } = await supabase
    .from("restock_requests")
    .select("id,created_at,status,to_site_id,notes")
    .eq("from_site_id", activeSiteId)
    .eq("status", "preparing")
    .order("created_at", { ascending: false })
    .limit(50);

  const remissions = (rows ?? []) as Array<{
    id: string;
    created_at: string | null;
    status: string | null;
    to_site_id: string | null;
    notes: string | null;
  }>;
  const toSiteIds = Array.from(
    new Set(remissions.map((row) => String(row.to_site_id ?? "").trim()).filter(Boolean))
  );
  const { data: toSites } = toSiteIds.length
    ? await supabase.from("sites").select("id,name").in("id", toSiteIds)
    : { data: [] as Array<{ id: string; name: string | null }> };
  const toSiteMap = new Map(
    ((toSites ?? []) as Array<{ id: string; name: string | null }>).map((s) => [
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
            <span className="mt-4 inline-flex ui-chip ui-chip--brand">
              {site?.name ?? activeSiteId}
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
              Cola de tránsito (Conductor)
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-muted)] sm:text-base">
              Remisiones marcadas por bodega para validar checklist y poner en tránsito.
            </p>
          </div>
        </div>
      </section>

      <div className="ui-panel ui-remission-section">
        <div className="ui-h3">Remisiones listas para tránsito</div>
        <div className="mt-1 ui-caption">{remissions.length} remision(es) en estado preparando</div>
        <div className="mt-4 space-y-3">
          {remissions.length ? (
            remissions.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--ui-text)]">
                    Destino: {toSiteMap.get(String(row.to_site_id ?? "")) ?? row.to_site_id ?? "-"}
                  </div>
                  <span className="ui-chip ui-chip--brand">Preparando</span>
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
                      activeSiteId
                    )}`}
                    className="ui-btn ui-btn--action h-11 px-4 text-sm font-semibold"
                  >
                    Abrir checklist de tránsito
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="ui-empty rounded-xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-6">
              No hay remisiones marcadas para tránsito.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

