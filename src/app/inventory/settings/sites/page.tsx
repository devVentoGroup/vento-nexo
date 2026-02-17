import Link from "next/link";
import { redirect } from "next/navigation";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { safeDecodeURIComponent } from "@/lib/url";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  code: string | null;
  name: string | null;
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

function asText(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

async function createSite(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const code = asText(formData.get("code")).toUpperCase() || null;
  const name = asText(formData.get("name")) || null;
  const siteType = asText(formData.get("site_type")) || "satellite";
  if (!code || !name) {
    redirect("/inventory/settings/sites?error=" + encodeURIComponent("Código y nombre son obligatorios."));
  }
  const { error } = await supabase.from("sites").insert({
    code,
    name,
    type: "operacional",
    site_type: siteType,
    site_kind: siteType === "production_center" ? "warehouse" : "store",
    is_active: true,
  });
  if (error) redirect("/inventory/settings/sites?error=" + encodeURIComponent(error.message));
  redirect("/inventory/settings/sites?ok=created");
}

export default async function SitesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok === "created" ? "Sede creada." : "";
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/settings/sites",
  });

  const { data: emp } = await supabase.from("employees").select("role").eq("id", user.id).maybeSingle();
  const role = String((emp as { role?: string } | null)?.role ?? "").toLowerCase();
  const canManage = ["propietario", "gerente_general"].includes(role);

  const { data: sites } = await supabase
    .from("sites")
    .select("id,code,name,site_type,is_active")
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

      {errorMsg ? (
        <div className="mt-6 ui-alert ui-alert--error">Error: {errorMsg}</div>
      ) : null}
      {okMsg ? (
        <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div>
      ) : null}

      {canManage ? (
        <div className="mt-6 ui-panel">
          <div className="ui-h3">Nueva sede</div>
          <form action={createSite} className="mt-4 flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Código (único)</span>
              <input name="code" className="ui-input w-24 font-mono" placeholder="CP, SAU, VCF..." required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Nombre</span>
              <input name="name" className="ui-input min-w-[200px]" placeholder="Centro de producción" required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Tipo</span>
              <select name="site_type" className="ui-input">
                <option value="satellite">Satélite</option>
                <option value="production_center">Centro de producción</option>
                <option value="admin">Administración</option>
              </select>
            </label>
            <div className="flex items-end">
              <button type="submit" className="ui-btn ui-btn--brand">
                Añadir sede
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Todas las sedes</div>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Código</TableHeaderCell>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {siteRows.map((s) => (
                <tr key={s.id} className="border-t border-zinc-200/60">
                  <TableCell className="font-mono text-sm">{s.code ?? "—"}</TableCell>
                  <TableCell>{s.name ?? "—"}</TableCell>
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

      <div className="mt-6 ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
        <strong className="text-[var(--ui-text)]">Tipos:</strong> Centro de producción = bodega que abastece. Satélite = Saudo, Vento Café (solicitan remisiones). Luego configura las{" "}
        <Link href="/inventory/settings/supply-routes" className="font-medium underline">
          rutas de abastecimiento
        </Link>.
      </div>
    </div>
  );
}
