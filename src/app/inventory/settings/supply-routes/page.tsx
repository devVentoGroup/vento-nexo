import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { DeleteRouteForm } from "@/components/vento/delete-route-form";
import {
  getSiteCapabilitiesMap,
  type SiteOperationalCapabilities,
} from "@/lib/inventory/site-capabilities";
import { safeDecodeURIComponent } from "@/lib/url";

export const dynamic = "force-dynamic";

type SiteRow = { id: string; name: string | null; site_type: string | null };
type SiteCapabilityRow = SiteOperationalCapabilities;
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
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

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
  const siteIds = siteRows.map((site) => site.id);
  const { data: capabilityRows } = siteIds.length
    ? await supabase
      .from("site_operational_capabilities")
      .select(
        "site_id,can_request_remissions,can_fulfill_remissions,can_receive_remissions,can_sell,can_produce,can_hold_inventory,is_commercial_business,show_in_product_setup"
      )
      .in("site_id", siteIds)
    : { data: [] as SiteCapabilityRow[] };
  const capabilitiesBySite = getSiteCapabilitiesMap(
    siteIds,
    (capabilityRows ?? []) as SiteCapabilityRow[]
  );

  const { data: routes } = await supabase
    .from("site_supply_routes")
    .select("id,requesting_site_id,fulfillment_site_id,is_active")
    .order("created_at", { ascending: false });
  const routeRows = (routes ?? []) as RouteRow[];

  const requestingSites = siteRows.filter((site) => {
    const capabilities = capabilitiesBySite.get(site.id);
    return capabilities ? capabilities.can_request_remissions : site.site_type === "satellite";
  });
  const fulfillmentSites = siteRows.filter((site) => {
    const capabilities = capabilitiesBySite.get(site.id);
    return capabilities ? capabilities.can_fulfill_remissions : site.site_type === "production_center";
  });

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Rutas de abastecimiento</h1>
          <p className="mt-2 ui-body-muted">
            Define qué sede abastece a cada sede solicitante según capacidades operativas.
          </p>
        </div>
        <Link href="/inventory/remissions" className="ui-btn ui-btn--ghost">
          Ir a Remisiones
        </Link>
        <Link href="/inventory/settings/remissions" className="ui-btn ui-btn--ghost">
          Áreas remisión
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
          Sede solicitante = sede con capacidad de solicitar. Sede abastecedora = sede con capacidad de despachar.
        </p>
        <form action={addRoute} className="mt-4 flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede solicitante</span>
            <select name="requesting_site_id" className="ui-input min-w-[200px]" required>
              <option value="">Seleccionar</option>
              {requestingSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.id}
                </option>
              ))}
              {requestingSites.length === 0 ? (
                <option value="" disabled>No hay sedes solicitantes</option>
              ) : null}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede abastecedora</span>
            <select name="fulfillment_site_id" className="ui-input min-w-[200px]" required>
              <option value="">Seleccionar</option>
              {fulfillmentSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.id}
                </option>
              ))}
              {fulfillmentSites.length === 0 ? (
                <option value="" disabled>No hay sedes abastecedoras</option>
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
                <TableHeaderCell>Solicitante</TableHeaderCell>
                <TableHeaderCell>Abastecedor</TableHeaderCell>
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
        <strong className="text-[var(--ui-text)]">¿Para qué sirve?</strong> Cuando una sede solicita una remisión, el sistema usa estas rutas para saber qué sede la abastece. Sin rutas configuradas, las remisiones no funcionan correctamente.
      </div>
    </div>
  );
}
