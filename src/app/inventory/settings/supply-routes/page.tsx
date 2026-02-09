import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { DeleteRouteForm } from "@/components/vento/delete-route-form";

export const dynamic = "force-dynamic";

type SiteRow = { id: string; name: string | null; site_type: string | null };
type RouteRow = {
  id: string;
  requesting_site_id: string;
  fulfillment_site_id: string;
  is_active: boolean;
};

function asText(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

async function addRoute(formData: FormData) {
  "use server";
  const requesting = asText(formData.get("requesting_site_id"));
  const fulfillment = asText(formData.get("fulfillment_site_id"));
  if (!requesting || !fulfillment) {
    redirect("/inventory/settings/supply-routes?error=" + encodeURIComponent("Selecciona sede solicitante y sede abastecedora."));
  }
  let errMsg: string | null = null;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("site_supply_routes").insert({
      requesting_site_id: requesting,
      fulfillment_site_id: fulfillment,
      is_active: true,
    });
    if (error) errMsg = error.message;
  } catch (e) {
    errMsg = e instanceof Error ? e.message : "Error al añadir ruta.";
  }
  if (errMsg) redirect("/inventory/settings/supply-routes?error=" + encodeURIComponent(errMsg));
  revalidatePath("/inventory/settings/supply-routes");
  redirect("/inventory/settings/supply-routes?ok=added");
}

async function toggleRoute(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  if (!id) redirect("/inventory/settings/supply-routes?error=" + encodeURIComponent("ID inválido."));
  let errMsg: string | null = null;
  try {
    const supabase = await createClient();
    const isActive = formData.get("is_active") === "true";
    const { error } = await supabase.from("site_supply_routes").update({ is_active: !isActive }).eq("id", id);
    if (error) errMsg = error.message;
  } catch (e) {
    errMsg = e instanceof Error ? e.message : "Error al actualizar.";
  }
  if (errMsg) redirect("/inventory/settings/supply-routes?error=" + encodeURIComponent(errMsg));
  revalidatePath("/inventory/settings/supply-routes");
  redirect("/inventory/settings/supply-routes?ok=toggled");
}

async function deleteRoute(formData: FormData) {
  "use server";
  const id = asText(formData.get("id"));
  if (!id) redirect("/inventory/settings/supply-routes?error=" + encodeURIComponent("ID inválido."));
  let errMsg: string | null = null;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("site_supply_routes").delete().eq("id", id);
    if (error) errMsg = error.message;
  } catch (e) {
    errMsg = e instanceof Error ? e.message : "Error al eliminar.";
  }
  if (errMsg) redirect("/inventory/settings/supply-routes?error=" + encodeURIComponent(errMsg));
  revalidatePath("/inventory/settings/supply-routes");
  redirect("/inventory/settings/supply-routes?ok=deleted");
}

export default async function SupplyRoutesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok === "added" ? "Ruta añadida." : sp.ok === "toggled" ? "Estado actualizado." : sp.ok === "deleted" ? "Ruta eliminada." : "";
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/settings/supply-routes",
  });

  const { data: emp } = await supabase.from("employees").select("role").eq("id", user.id).maybeSingle();
  const role = String((emp as { role?: string } | null)?.role ?? "").toLowerCase();
  const canManage = ["propietario", "gerente_general"].includes(role);
  if (!canManage) {
    return (
      <div className="w-full">
        <h1 className="ui-h1">Rutas de abastecimiento</h1>
        <div className="mt-6 ui-alert ui-alert--warn">
          Solo propietarios y gerentes generales pueden gestionar rutas.
        </div>
      </div>
    );
  }

  const { data: sites } = await supabase
    .from("sites")
    .select("id,name,site_type")
    .eq("is_active", true)
    .order("name", { ascending: true });
  const siteRows = (sites ?? []) as SiteRow[];
  const siteMap = new Map(siteRows.map((s) => [s.id, s]));

  const { data: routes } = await supabase
    .from("site_supply_routes")
    .select("id,requesting_site_id,fulfillment_site_id,is_active")
    .order("created_at", { ascending: false });
  const routeRows = (routes ?? []) as RouteRow[];

  const satellites = siteRows.filter((s) => s.site_type === "satellite");
  const centers = siteRows.filter((s) => s.site_type === "production_center");

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Rutas de abastecimiento</h1>
          <p className="mt-2 ui-body-muted">
            Define qué sede abastece a cada satélite. Saudo y Vento Café piden al Centro de producción.
          </p>
        </div>
        <Link href="/inventory/remissions" className="ui-btn ui-btn--ghost">
          Ir a Remisiones
        </Link>
      </div>

      {errorMsg ? (
        <div className="mt-6 ui-alert ui-alert--error">Error: {errorMsg}</div>
      ) : null}
      {okMsg ? (
        <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div>
      ) : null}

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Nueva ruta</div>
        <p className="mt-1 text-sm text-[var(--ui-muted)]">
          Sede solicitante = satélite que pide (Saudo, Vento). Sede abastecedora = Centro que envía.
        </p>
        <form action={addRoute} className="mt-4 flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede solicitante (satélite)</span>
            <select name="requesting_site_id" className="ui-input min-w-[200px]" required>
              <option value="">Seleccionar</option>
              {satellites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.id}
                </option>
              ))}
              {satellites.length === 0 ? (
                <option value="" disabled>No hay sedes satélite</option>
              ) : null}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede abastecedora (Centro)</span>
            <select name="fulfillment_site_id" className="ui-input min-w-[200px]" required>
              <option value="">Seleccionar</option>
              {centers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.id}
                </option>
              ))}
              {centers.length === 0 ? (
                <option value="" disabled>No hay centros de producción</option>
              ) : null}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="ui-btn ui-btn--brand">
              Añadir ruta
            </button>
          </div>
        </form>
      </div>

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Rutas configuradas</div>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Solicitante (satélite)</TableHeaderCell>
                <TableHeaderCell>Abastecedor (Centro)</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Acciones</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {routeRows.map((r) => {
                const reqSite = siteMap.get(r.requesting_site_id);
                const fulfillSite = siteMap.get(r.fulfillment_site_id);
                return (
                  <tr key={r.id} className="border-t border-zinc-200/60">
                    <TableCell>{reqSite?.name ?? r.requesting_site_id}</TableCell>
                    <TableCell>{fulfillSite?.name ?? r.fulfillment_site_id}</TableCell>
                    <TableCell>
                      <span className={r.is_active ? "ui-chip ui-chip--success" : "ui-chip"}>
                        {r.is_active ? "Activa" : "Inactiva"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <form action={toggleRoute} className="inline">
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="is_active" value={String(r.is_active)} />
                          <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                            {r.is_active ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                        <DeleteRouteForm action={deleteRoute} routeId={r.id} />
                      </div>
                    </TableCell>
                  </tr>
                );
              })}
              {routeRows.length === 0 ? (
                <tr>
                  <TableCell colSpan={4} className="ui-empty">
                    No hay rutas. Añade una arriba.
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </div>

      <div className="mt-6 ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
        <strong className="text-[var(--ui-text)]">¿Para qué sirve?</strong> Cuando un satélite (Saudo, Vento Café) solicita una remisión, el sistema usa estas rutas para saber que el Centro de producción es quien abastece. Sin rutas configuradas, las remisiones no funcionan correctamente.
      </div>
    </div>
  );
}
