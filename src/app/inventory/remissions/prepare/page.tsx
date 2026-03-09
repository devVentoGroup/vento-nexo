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
          Volver a remisiones
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
          Volver a remisiones
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

  return (
    <div className="w-full space-y-6 pb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/inventory/remissions" className="ui-caption underline">
            Volver a remisiones
          </Link>
          <h1 className="mt-2 ui-h1">Preparar remisiones</h1>
          <p className="mt-2 ui-body-muted">
            Vista optimizada para celular y tablet. Entra a una solicitud, prepara cantidades y luego la envias a transito.
          </p>
          <p className="mt-1 ui-caption">Sede: {(siteRow as { name?: string })?.name ?? siteId}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
          <div className="ui-caption">Solicitudes abiertas</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">{rows.length}</div>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
          <div className="ui-caption">Pendientes</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">{pendingCount}</div>
        </div>
        <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
          <div className="ui-caption">Preparando</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">{preparingCount}</div>
        </div>
      </div>

      <div className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Solicitudes pendientes de preparar</div>
          <div className="mt-1 ui-body-muted">
            Abre una remision, captura preparado y enviado, guarda y luego usa la accion correspondiente.
          </div>
        </div>

        {rows.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {rows.map((row) => {
              const status = formatStatus(row.status);
              return (
                <div key={row.id} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--ui-text)] truncate">
                        Destino: {siteMap.get(row.to_site_id ?? "") ?? row.to_site_id ?? "-"}
                      </div>
                      <div className="mt-1 text-xs font-mono text-[var(--ui-muted)]">Remision #{String(row.id).slice(0, 8)}</div>
                    </div>
                    <span className={status.className}>{status.label}</span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-[var(--ui-border)] bg-white p-3">
                      <div className="ui-caption">Creada</div>
                      <div className="mt-1 text-sm font-medium text-[var(--ui-text)]">{formatDateTime(row.created_at)}</div>
                    </div>
                    <div className="rounded-xl border border-[var(--ui-border)] bg-white p-3 sm:col-span-2">
                      <div className="ui-caption">Notas</div>
                      <div className="mt-1 text-sm text-[var(--ui-text)] line-clamp-3">{row.notes ?? "Sin notas"}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <Link
                      href={`/inventory/remissions/${row.id}`}
                      className="ui-btn ui-btn--brand w-full sm:w-auto"
                    >
                      Abrir preparacion
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
