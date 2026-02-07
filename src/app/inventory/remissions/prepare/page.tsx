import Link from "next/link";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";

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
      return { label: v || "—", className: "ui-chip" };
  }
}

export default async function RemissionsPreparePage() {
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/remissions",
    permissionCode: "inventory.remissions",
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

  const { data: siteRow } = await supabase
    .from("sites")
    .select("id,name")
    .eq("id", siteId)
    .single();

  const { data: remissions } = await supabase
    .from("restock_requests")
    .select("id, created_at, status, from_site_id, to_site_id, notes")
    .eq("from_site_id", siteId)
    .in("status", ["pending", "preparing"])
    .order("created_at", { ascending: false })
    .limit(30);

  const rows = (remissions ?? []) as RemissionRow[];
  const toSiteIds = [...new Set(rows.map((r) => r.to_site_id).filter(Boolean))] as string[];

  const { data: sites } = await supabase
    .from("sites")
    .select("id,name")
    .in("id", toSiteIds);

  const siteMap = new Map(((sites ?? []) as SiteRow[]).map((s) => [s.id, s.name]));

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/inventory/remissions" className="ui-caption underline">
            Volver a remisiones
          </Link>
          <h1 className="mt-2 ui-h1">Preparar remisiones</h1>
          <p className="mt-2 ui-body-muted">
            Marca cantidades por ítem y envía a tránsito. Vista para bodega (tablet).
          </p>
          <p className="mt-1 ui-caption">
            Sede: {(siteRow as { name?: string })?.name ?? siteId}
          </p>
        </div>
      </div>

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Solicitudes pendientes de preparar</div>
        <div className="mt-1 ui-body-muted">
          Abre una remisión, indica cantidades preparadas y enviadas, guarda y luego &quot;En viaje&quot;.
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Destino</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Creada</TableHeaderCell>
                <TableHeaderCell>Notas</TableHeaderCell>
                <TableHeaderCell>Acción</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="ui-body">
                  <TableCell>
                    {siteMap.get(row.to_site_id ?? "") ?? row.to_site_id ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span className={formatStatus(row.status).className}>
                      {formatStatus(row.status).label}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {row.notes ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/inventory/remissions/${row.id}`}
                      className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
                    >
                      Preparar
                    </Link>
                  </TableCell>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <TableCell colSpan={5} className="ui-empty">
                    No hay solicitudes pendientes de preparar.
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
