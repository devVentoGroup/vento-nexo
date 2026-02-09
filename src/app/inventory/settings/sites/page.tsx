import Link from "next/link";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  name: string | null;
  slug: string | null;
  site_type: string | null;
  is_active: boolean | null;
};

function siteTypeLabel(type: string | null) {
  switch (String(type ?? "")) {
    case "production_center":
      return "Centro de producción";
    case "satellite":
      return "Satélite";
    case "admin":
      return "Administración";
    default:
      return type ?? "—";
  }
}

export default async function SitesPage() {
  const { supabase } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/settings/sites",
    permissionCode: "inventory.stock",
  });

  const { data: sites } = await supabase
    .from("sites")
    .select("id,name,slug,site_type,is_active")
    .order("name", { ascending: true });
  const siteRows = (sites ?? []) as SiteRow[];

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Sedes</h1>
          <p className="mt-2 ui-body-muted">
            Listado de sedes. Las rutas de abastecimiento conectan satélites con el Centro.
          </p>
        </div>
        <Link href="/inventory/settings/supply-routes" className="ui-btn ui-btn--ghost">
          Rutas de abastecimiento
        </Link>
      </div>

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Todas las sedes</div>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Slug</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {siteRows.map((s) => (
                <tr key={s.id} className="border-t border-zinc-200/60">
                  <TableCell>{s.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{s.slug ?? "—"}</TableCell>
                  <TableCell>{siteTypeLabel(s.site_type)}</TableCell>
                  <TableCell>
                    <span className={s.is_active ? "ui-chip ui-chip--success" : "ui-chip"}>
                      {s.is_active ? "Activa" : "Inactiva"}
                    </span>
                  </TableCell>
                </tr>
              ))}
              {siteRows.length === 0 ? (
                <tr>
                  <TableCell colSpan={4} className="ui-empty">
                    No hay sedes.
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm text-[var(--ui-muted)]">
        <strong className="text-[var(--ui-text)]">Nota:</strong> La creación y edición de sedes se realiza desde Supabase o el Shell. Esta pantalla es solo consulta.
      </div>
    </div>
  );
}
