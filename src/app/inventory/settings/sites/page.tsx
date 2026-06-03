import Link from "next/link";
import { redirect } from "next/navigation";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";

import { requireAppAccess } from "@/lib/auth/guard";
import {
  getSiteCapabilitiesMap,
  type SiteOperationalCapabilities,
} from "@/lib/inventory/site-capabilities";
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

type SiteCapabilityRow = SiteOperationalCapabilities;

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

async function updateSiteCapabilities(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const siteId = asText(formData.get("site_id"));
  if (!siteId) {
    redirect("/inventory/settings/sites?error=" + encodeURIComponent("Sede inválida."));
  }

  const { error } = await supabase.from("site_operational_capabilities").upsert(
    {
      site_id: siteId,
      can_request_remissions: formData.get("can_request_remissions") === "on",
      can_fulfill_remissions: formData.get("can_fulfill_remissions") === "on",
      can_receive_remissions: formData.get("can_receive_remissions") === "on",
      can_sell: formData.get("can_sell") === "on",
      can_produce: formData.get("can_produce") === "on",
      can_hold_inventory: formData.get("can_hold_inventory") === "on",
      is_commercial_business: formData.get("is_commercial_business") === "on",
      show_in_product_setup: formData.get("show_in_product_setup") === "on",
    },
    { onConflict: "site_id" }
  );
  if (error) redirect("/inventory/settings/sites?error=" + encodeURIComponent(error.message));
  redirect("/inventory/settings/sites?ok=capabilities");
}

export default async function SitesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg =
    sp.ok === "created"
      ? "Sede creada."
      : sp.ok === "capabilities"
        ? "Capacidades actualizadas."
        : "";
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
                <TableHeaderCell>Capacidades operativas</TableHeaderCell>
                <TableHeaderCell>Mapa operativo</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {siteRows.map((s) => {
                const capabilities = capabilitiesBySite.get(s.id);
                return (
                  <tr key={s.id} className="border-t border-zinc-200/60 align-top">
                    <TableCell className="font-mono text-sm">{s.code ?? "—"}</TableCell>
                    <TableCell>{s.name ?? "—"}</TableCell>
                    <TableCell>{siteTypeLabel(s.site_type)}</TableCell>
                    <TableCell>
                      <span className={s.is_active ? "ui-chip ui-chip--success" : "ui-chip"}>
                        {s.is_active ? "Activa" : "Inactiva"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <form action={updateSiteCapabilities} className="min-w-[520px] space-y-3">
                        <input type="hidden" name="site_id" value={s.id} />
                        <div className="grid gap-2 md:grid-cols-2">
                          {[
                            ["can_request_remissions", "Solicita remisiones", capabilities?.can_request_remissions],
                            ["can_fulfill_remissions", "Despacha remisiones", capabilities?.can_fulfill_remissions],
                            ["can_receive_remissions", "Recibe remisiones", capabilities?.can_receive_remissions],
                            ["can_sell", "Vende", capabilities?.can_sell],
                            ["can_produce", "Produce", capabilities?.can_produce],
                            ["can_hold_inventory", "Almacena inventario", capabilities?.can_hold_inventory],
                            ["is_commercial_business", "Negocio comercial", capabilities?.is_commercial_business],
                            ["show_in_product_setup", "Mostrar en productos", capabilities?.show_in_product_setup],
                          ].map(([name, label, checked]) => (
                            <label key={String(name)} className="flex items-center gap-2 text-sm">
                              <input
                                name={String(name)}
                                type="checkbox"
                                defaultChecked={Boolean(checked)}
                                disabled={!canManage}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                        {canManage ? (
                          <button type="submit" className="ui-btn ui-btn--ghost h-9 px-3 text-sm">
                            Guardar capacidades
                          </button>
                        ) : null}
                      </form>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[180px] flex-col gap-2">
                        <Link
                          href={`/inventory/settings/sites/${s.id}/operations`}
                          className="ui-btn ui-btn--brand h-9 px-3 text-sm"
                        >
                          Mapa operativo
                        </Link>
                        <span className="text-xs leading-snug text-[var(--ui-muted)]">
                          Áreas, LOCs, ubicaciones internas y rutas de producción.
                        </span>
                      </div>
                    </TableCell>
                  </tr>
                );
              })}
              {siteRows.length === 0 ? (
                <tr>
                  <TableCell colSpan={6} className="ui-empty">
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
        </Link>{" "}
        y el mapa operativo de cada sede para áreas, LOCs, ubicaciones internas y rutas de producción.
      </div>
    </div>
  );
}
