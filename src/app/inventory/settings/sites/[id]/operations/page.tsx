import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { revalidatePath } from "next/cache";

import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  getSiteCapabilitiesMap,
  type SiteOperationalCapabilities,
} from "@/lib/inventory/site-capabilities";

import { ProductionRouteForm } from "./production-route-form";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  code: string | null;
  name: string | null;
  site_type: string | null;
  is_active: boolean | null;
};

type SiteCapabilityRow = SiteOperationalCapabilities;

type ProductOptionRow = {
  id: string;
  name: string | null;
  product_type: string | null;
  is_active: boolean | null;
};

type AreaOptionRow = {
  id: string;
  name: string | null;
  kind: string | null;
  is_active: boolean | null;
};

type ProductionOutputMode = "inventory_stock" | "sellable_stock" | "order_fulfillment";

type AreaDiagnosticRow = {
  site_id: string;
  site_name: string | null;
  area_id: string;
  area_kind: string | null;
  area_name: string | null;
  area_display_name: string | null;
  area_is_active: boolean | null;
  site_can_produce: boolean | null;
  site_can_sell: boolean | null;
  site_can_hold_inventory: boolean | null;
  area_enabled_for_recipe_production: boolean | null;
  active_location_count: number | null;
  production_location_count: number | null;
  storage_or_picking_location_count: number | null;
  active_position_count: number | null;
  active_route_count: number | null;
  diagnostic_status: "OK" | "WARNING" | "BLOCKING" | "INACTIVE" | string | null;
  diagnostic_codes: string[] | null;
};

type RouteDiagnosticRow = {
  route_id: string;
  product_id: string;
  product_name: string | null;
  product_type: string | null;
  site_id: string;
  site_name: string | null;
  area_kind: string | null;
  area_name: string | null;
  route_name: string | null;
  external_recipe_id: string | null;
  input_location_id: string | null;
  input_location_code: string | null;
  input_location_zone: string | null;
  output_mode: "inventory_stock" | "sellable_stock" | "order_fulfillment" | string | null;
  output_location_id: string | null;
  output_location_code: string | null;
  output_location_zone: string | null;
  output_position_id: string | null;
  output_position_code: string | null;
  output_position_name: string | null;
  is_default: boolean | null;
  is_active: boolean | null;
  site_can_produce: boolean | null;
  site_can_sell: boolean | null;
  site_can_hold_inventory: boolean | null;
  area_enabled_for_recipe_production: boolean | null;
  diagnostic_status: "OK" | "WARNING" | "BLOCKING" | "INACTIVE" | string | null;
  diagnostic_codes: string[] | null;
};

type LocationAreaRef = {
  id: string;
  name: string | null;
  kind: string | null;
};

type LocationRow = {
  id: string;
  site_id: string;
  code: string | null;
  zone: string | null;
  location_type: string | null;
  is_active: boolean | null;
  area_id: string | null;
  area?: LocationAreaRef | LocationAreaRef[] | null;
};

type PositionRow = {
  id: string;
  site_id: string;
  location_id: string;
  code: string | null;
  name: string | null;
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

function statusTone(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (normalized === "OK") return "ui-chip ui-chip--success";
  if (normalized === "WARNING") return "ui-chip ui-chip--warning";
  if (normalized === "BLOCKING") return "ui-chip ui-chip--danger";
  return "ui-chip";
}

function statusLabel(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (normalized === "OK") return "OK";
  if (normalized === "WARNING") return "Pendiente";
  if (normalized === "BLOCKING") return "Bloqueante";
  if (normalized === "INACTIVE") return "Inactivo";
  return normalized || "Sin estado";
}

function outputModeLabel(mode: string | null | undefined) {
  switch (String(mode ?? "")) {
    case "inventory_stock":
      return "Guardar como inventario";
    case "sellable_stock":
      return "Listo para vender";
    case "order_fulfillment":
      return "Pedido POS / entrega directa";
    default:
      return "Sin modo";
  }
}

function siteOperationsHref(siteId: string) {
  return `/inventory/settings/sites/${siteId}/operations`;
}

function asText(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeProductionOutputMode(value: string): ProductionOutputMode {
  if (value === "sellable_stock") return "sellable_stock";
  if (value === "order_fulfillment") return "order_fulfillment";
  return "inventory_stock";
}

function getLocationArea(area: LocationRow["area"]): LocationAreaRef | null {
  if (Array.isArray(area)) return area[0] ?? null;
  return area ?? null;
}

function diagnosticCodeLabel(code: string) {
  switch (code) {
    case "route_inactive":
      return "Ruta inactiva.";
    case "site_cannot_produce":
      return "La sede no tiene habilitada producción.";
    case "area_not_enabled_for_recipe_production":
      return "El área no está habilitada para producir recetas.";
    case "site_cannot_sell_but_route_outputs_sellable_stock":
      return "La ruta deja producto listo para venta, pero la sede no vende.";
    case "site_cannot_hold_inventory_but_route_outputs_stock":
      return "La ruta genera stock, pero la sede no almacena inventario.";
    case "area_inactive":
      return "El área está inactiva.";
    case "production_area_without_production_loc":
      return "El área produce, pero no tiene LOC productivo.";
    case "production_area_without_routes":
      return "El área produce, pero todavía no tiene rutas configuradas.";
    default:
      return code.replace(/_/g, " ");
  }
}

function countByStatus<T extends { diagnostic_status?: string | null }>(rows: T[]) {
  return rows.reduce(
    (acc, row) => {
      const status = String(row.diagnostic_status ?? "").trim().toUpperCase();
      if (status === "OK") acc.ok += 1;
      else if (status === "WARNING") acc.warning += 1;
      else if (status === "BLOCKING") acc.blocking += 1;
      else if (status === "INACTIVE") acc.inactive += 1;
      else acc.unknown += 1;
      return acc;
    },
    { ok: 0, warning: 0, blocking: 0, inactive: 0, unknown: 0 }
  );
}

async function requireProductionRouteManager(href: string) {
  const supabase = await createClient();

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? null;

  if (!userId) {
    redirect(`${href}?error=${encodeURIComponent("Sesión inválida.")}`);
  }

  const { data: emp } = await supabase
    .from("employees")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const role = String((emp as { role?: string } | null)?.role ?? "").toLowerCase();
  const canManage = ["propietario", "gerente_general"].includes(role);

  if (!canManage) {
    redirect(`${href}?error=${encodeURIComponent("No tienes permisos para administrar rutas de producción.")}`);
  }

  return { supabase, userId };
}


async function addProductionRoute(formData: FormData) {
  "use server";

  const siteId = asText(formData.get("site_id"));
  const productId = asText(formData.get("product_id"));
  const areaKind = asText(formData.get("area_kind"));
  const inputLocationId = asText(formData.get("input_location_id"));
  const outputMode = normalizeProductionOutputMode(asText(formData.get("output_mode")));
  const outputLocationRaw = asText(formData.get("output_location_id"));
  const outputPositionRaw = asText(formData.get("output_position_id"));
  const routeName = asText(formData.get("route_name")) || null;
  const externalRecipeId = asText(formData.get("external_recipe_id")) || null;
  const notes = asText(formData.get("notes")) || null;
  const isDefault = formData.get("is_default") === "on";

  const href = siteId ? siteOperationsHref(siteId) : "/inventory/settings/sites";

  if (!siteId || !productId || !areaKind || !inputLocationId) {
    redirect(`${href}?error=${encodeURIComponent("Producto, área y LOC de consumo son obligatorios.")}`);
  }

  const outputLocationId = outputMode === "order_fulfillment" ? null : outputLocationRaw || null;
  const outputPositionId = outputMode === "order_fulfillment" ? null : outputPositionRaw || null;

  if (outputMode !== "order_fulfillment" && !outputLocationId) {
    redirect(`${href}?error=${encodeURIComponent("Selecciona el LOC donde queda lo producido.")}`);
  }

  const { supabase, userId } = await requireProductionRouteManager(href);

  const { error } = await supabase.from("product_site_production_routes").insert({
    product_id: productId,
    site_id: siteId,
    area_kind: areaKind,
    route_name: routeName,
    external_recipe_id: externalRecipeId,
    input_location_id: inputLocationId,
    output_mode: outputMode,
    output_location_id: outputLocationId,
    output_position_id: outputPositionId,
    is_default: isDefault,
    is_active: true,
    notes,
    created_by: userId,
    updated_by: userId,
  });

  if (error) {
    redirect(`${href}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(href);
  redirect(`${href}?ok=route_created`);
}

async function toggleProductionRoute(formData: FormData) {
  "use server";

  const siteId = asText(formData.get("site_id"));
  const routeId = asText(formData.get("route_id"));
  const currentActive = formData.get("is_active") === "true";
  const href = siteId ? siteOperationsHref(siteId) : "/inventory/settings/sites";

  if (!siteId || !routeId) {
    redirect(`${href}?error=${encodeURIComponent("Ruta inválida.")}`);
  }

  const { supabase, userId } = await requireProductionRouteManager(href);
  const nextActive = !currentActive;

  const updates: Record<string, boolean | string | null> = {
    is_active: nextActive,
    updated_by: userId,
  };

  if (!nextActive) {
    updates.is_default = false;
  }

  const { error } = await supabase
    .from("product_site_production_routes")
    .update(updates)
    .eq("id", routeId)
    .eq("site_id", siteId);

  if (error) {
    redirect(`${href}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(href);
  redirect(`${href}?ok=${nextActive ? "route_enabled" : "route_disabled"}`);
}

async function setDefaultProductionRoute(formData: FormData) {
  "use server";

  const siteId = asText(formData.get("site_id"));
  const routeId = asText(formData.get("route_id"));
  const href = siteId ? siteOperationsHref(siteId) : "/inventory/settings/sites";

  if (!siteId || !routeId) {
    redirect(`${href}?error=${encodeURIComponent("Ruta inválida.")}`);
  }

  const { supabase, userId } = await requireProductionRouteManager(href);

  const { data: route, error: routeError } = await supabase
    .from("product_site_production_routes")
    .select("id,product_id,site_id,area_kind")
    .eq("id", routeId)
    .eq("site_id", siteId)
    .maybeSingle();

  if (routeError || !route) {
    redirect(`${href}?error=${encodeURIComponent(routeError?.message ?? "No se encontró la ruta.")}`);
  }

  const routeRow = route as {
    id: string;
    product_id: string;
    site_id: string;
    area_kind: string;
  };

  const { error: clearError } = await supabase
    .from("product_site_production_routes")
    .update({ is_default: false, updated_by: userId })
    .eq("product_id", routeRow.product_id)
    .eq("site_id", routeRow.site_id)
    .eq("area_kind", routeRow.area_kind)
    .neq("id", routeRow.id);

  if (clearError) {
    redirect(`${href}?error=${encodeURIComponent(clearError.message)}`);
  }

  const { error } = await supabase
    .from("product_site_production_routes")
    .update({ is_default: true, is_active: true, updated_by: userId })
    .eq("id", routeRow.id)
    .eq("site_id", routeRow.site_id);

  if (error) {
    redirect(`${href}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(href);
  redirect(`${href}?ok=route_default`);
}

async function deleteProductionRoute(formData: FormData) {
  "use server";

  const siteId = asText(formData.get("site_id"));
  const routeId = asText(formData.get("route_id"));
  const href = siteId ? siteOperationsHref(siteId) : "/inventory/settings/sites";

  if (!siteId || !routeId) {
    redirect(`${href}?error=${encodeURIComponent("Ruta inválida.")}`);
  }

  const { supabase } = await requireProductionRouteManager(href);

  const { error } = await supabase
    .from("product_site_production_routes")
    .delete()
    .eq("id", routeId)
    .eq("site_id", siteId);

  if (error) {
    redirect(`${href}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(href);
  redirect(`${href}?ok=route_deleted`);
}


export default async function SiteOperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const okMsg =
    sp.ok === "route_created"
      ? "Ruta de producción creada."
      : sp.ok === "route_enabled"
        ? "Ruta activada."
        : sp.ok === "route_disabled"
          ? "Ruta desactivada."
          : sp.ok === "route_default"
            ? "Ruta marcada como principal."
            : sp.ok === "route_deleted"
              ? "Ruta eliminada."
              : "";
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: `/inventory/settings/sites/${id}/operations`,
  });

  const { data: emp } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = String((emp as { role?: string } | null)?.role ?? "").toLowerCase();
  const canManage = ["propietario", "gerente_general"].includes(role);

  const { data: site } = await supabase
    .from("sites")
    .select("id,code,name,site_type,is_active")
    .eq("id", id)
    .maybeSingle();

  if (!site) notFound();

  const siteRow = site as SiteRow;

  const [
    capabilityResult,
    areaDiagnosticsResult,
    routeDiagnosticsResult,
    locationsResult,
    positionsResult,
    productsResult,
    areasResult,
  ] = await Promise.all([
    supabase
      .from("site_operational_capabilities")
      .select(
        "site_id,can_request_remissions,can_fulfill_remissions,can_receive_remissions,can_sell,can_produce,can_hold_inventory,is_commercial_business,show_in_product_setup"
      )
      .eq("site_id", id),
    supabase
      .from("v_site_area_operational_diagnostics")
      .select("*")
      .eq("site_id", id)
      .order("area_display_name", { ascending: true }),
    supabase
      .from("v_site_production_route_diagnostics")
      .select("*")
      .eq("site_id", id)
      .order("area_name", { ascending: true })
      .order("product_name", { ascending: true }),
    supabase
      .from("inventory_locations")
      .select("id,site_id,code,zone,location_type,is_active,area_id,area:areas(id,name,kind)")
      .eq("site_id", id)
      .order("code", { ascending: true }),
    supabase
      .from("inventory_location_positions")
      .select("id,site_id,location_id,code,name,is_active")
      .eq("site_id", id)
      .order("code", { ascending: true }),
    supabase
      .from("products")
      .select("id,name,product_type,is_active")
      .eq("is_active", true)
      .in("product_type", ["venta", "preparacion"])
      .order("name", { ascending: true }),
    supabase
      .from("areas")
      .select("id,name,kind,is_active")
      .eq("site_id", id)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const capabilitiesBySite = getSiteCapabilitiesMap(
    [id],
    (capabilityResult.data ?? []) as SiteCapabilityRow[]
  );
  const capabilities = capabilitiesBySite.get(id);

  const areaDiagnostics = (areaDiagnosticsResult.data ?? []) as AreaDiagnosticRow[];
  const routeDiagnostics = (routeDiagnosticsResult.data ?? []) as RouteDiagnosticRow[];
  const locations = (locationsResult.data ?? []) as LocationRow[];
  const positions = (positionsResult.data ?? []) as PositionRow[];
  const productOptions = (productsResult.data ?? []) as ProductOptionRow[];
  const areaOptions = (areasResult.data ?? []) as AreaOptionRow[];
  const activeLocationOptions = locations
    .filter((location) => location.is_active !== false)
    .map((location) => {
      const locationArea = getLocationArea(location.area);
      return {
        id: location.id,
        label: `${location.code ?? location.id}${location.zone ? ` · ${location.zone}` : ""}`,
        areaKind: locationArea?.kind ?? null,
        areaLabel: locationArea?.name ?? locationArea?.kind ?? null,
        locationType: location.location_type ?? null,
      };
    });
  const activePositionOptions = positions
    .filter((position) => position.is_active !== false)
    .map((position) => {
      const parentLocation = locations.find((location) => location.id === position.location_id);
      return {
        id: position.id,
        locationId: position.location_id,
        label: `${parentLocation?.code ?? "LOC"} · ${position.name ?? position.code ?? position.id}`,
      };
    });

  const positionsByLocation = positions.reduce<Record<string, PositionRow[]>>((acc, position) => {
    const locationId = String(position.location_id ?? "").trim();
    if (!locationId) return acc;
    acc[locationId] = [...(acc[locationId] ?? []), position];
    return acc;
  }, {});

  const areaCounts = countByStatus(areaDiagnostics);
  const routeCounts = countByStatus(routeDiagnostics);
  const blockingCount = areaCounts.blocking + routeCounts.blocking;
  const warningCount = areaCounts.warning + routeCounts.warning;
  const hasDiagnosticViews =
    !areaDiagnosticsResult.error && !routeDiagnosticsResult.error;

  return (
    <div className="ui-scene w-full space-y-8">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.5fr_1fr] lg:items-start">
          <div className="space-y-4">
            <Link
              href="/inventory/settings/sites"
              className="ui-btn ui-btn--ghost inline-flex h-12 items-center px-5 text-base font-semibold"
            >
              ← Volver a sedes
            </Link>
            <div>
              <h1 className="ui-h1">Mapa operativo</h1>
              <p className="mt-2 ui-body-muted">
                {siteRow.name ?? "Sede"} · {siteRow.code ?? "Sin código"} · {siteTypeLabel(siteRow.site_type)}
              </p>
            </div>
            <p className="ui-body-muted">
              Configuración visual de áreas, LOCs, ubicaciones internas y rutas de producción. Esta pantalla no es un wizard:
              puedes revisar y corregir cada bloque sin seguir pasos obligatorios.
            </p>
          </div>

          <div className="ui-remission-kpis ui-remission-kpis--stack sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone={blockingCount > 0 ? "danger" : "success"}>
              <div className="ui-remission-kpi-label">Bloqueantes</div>
              <div className="ui-remission-kpi-value">{blockingCount}</div>
              <div className="ui-remission-kpi-note">Impiden operar correctamente</div>
            </article>
            <article className="ui-remission-kpi" data-tone={warningCount > 0 ? "warm" : "cool"}>
              <div className="ui-remission-kpi-label">Pendientes</div>
              <div className="ui-remission-kpi-value">{warningCount}</div>
              <div className="ui-remission-kpi-note">No bloquean, pero conviene corregir</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Rutas</div>
              <div className="ui-remission-kpi-value">{routeDiagnostics.length}</div>
              <div className="ui-remission-kpi-note">Producción configurada por producto, sede y área</div>
            </article>
          </div>
        </div>
      </section>

      {!hasDiagnosticViews ? (
        <div className="ui-alert ui-alert--warn">
          Aplica primero la migración <strong>product_site_production_routes</strong>. Faltan vistas de diagnóstico operativo.
        </div>
      ) : null}

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">Error: {errorMsg}</div>
      ) : null}
      {okMsg ? (
        <div className="ui-alert ui-alert--success">{okMsg}</div>
      ) : null}

      <section className="ui-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="ui-h2">Capacidades de la sede</h2>
            <p className="mt-2 ui-body-muted">
              Estas capacidades controlan qué bloques operativos tienen sentido para esta sede.
            </p>
          </div>
          <Link href="/inventory/settings/sites" className="ui-btn ui-btn--ghost">
            Editar capacidades
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Solicita remisiones", capabilities?.can_request_remissions],
            ["Despacha remisiones", capabilities?.can_fulfill_remissions],
            ["Recibe remisiones", capabilities?.can_receive_remissions],
            ["Vende", capabilities?.can_sell],
            ["Produce", capabilities?.can_produce],
            ["Almacena inventario", capabilities?.can_hold_inventory],
            ["Negocio comercial", capabilities?.is_commercial_business],
            ["Visible en productos", capabilities?.show_in_product_setup],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-sm font-semibold text-[var(--ui-text)]">{label}</div>
              <div className="mt-2">
                <span className={value ? "ui-chip ui-chip--success" : "ui-chip"}>
                  {value ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="ui-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="ui-h2">Áreas operativas</h2>
            <p className="mt-2 ui-body-muted">
              Resumen por área: producción, LOCs, ubicaciones internas y rutas asociadas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip ui-chip--success">{areaCounts.ok} OK</span>
            <span className="ui-chip ui-chip--warning">{areaCounts.warning} pendientes</span>
            <span className="ui-chip ui-chip--danger">{areaCounts.blocking} bloqueantes</span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {areaDiagnostics.map((area) => {
            const codes = Array.isArray(area.diagnostic_codes) ? area.diagnostic_codes : [];
            return (
              <article key={area.area_id} className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ui-muted)]">
                      {area.area_kind ?? "Área"}
                    </div>
                    <h3 className="mt-1 text-lg font-bold text-[var(--ui-text)]">
                      {area.area_display_name || area.area_name || area.area_kind || "Área sin nombre"}
                    </h3>
                  </div>
                  <span className={statusTone(area.diagnostic_status)}>
                    {statusLabel(area.diagnostic_status)}
                  </span>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                    <div className="font-semibold text-[var(--ui-text)]">LOCs activos</div>
                    <div className="mt-1 text-[var(--ui-muted)]">{area.active_location_count ?? 0}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                    <div className="font-semibold text-[var(--ui-text)]">LOCs productivos</div>
                    <div className="mt-1 text-[var(--ui-muted)]">{area.production_location_count ?? 0}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                    <div className="font-semibold text-[var(--ui-text)]">Ubicaciones internas</div>
                    <div className="mt-1 text-[var(--ui-muted)]">{area.active_position_count ?? 0}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 text-sm">
                    <div className="font-semibold text-[var(--ui-text)]">Rutas activas</div>
                    <div className="mt-1 text-[var(--ui-muted)]">{area.active_route_count ?? 0}</div>
                  </div>
                </div>

                {codes.length > 0 ? (
                  <ul className="mt-4 space-y-1 text-sm text-amber-800">
                    {codes.map((code) => (
                      <li key={code}>• {diagnosticCodeLabel(code)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-[var(--ui-muted)]">
                    Área sin problemas detectados.
                  </p>
                )}
              </article>
            );
          })}

          {areaDiagnostics.length === 0 ? (
            <div className="ui-empty xl:col-span-2">
              Esta sede todavía no tiene áreas operativas diagnosticables.
            </div>
          ) : null}
        </div>
      </section>

      <section className="ui-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="ui-h2">LOCs y ubicaciones internas</h2>
            <p className="mt-2 ui-body-muted">
              Los LOCs son lugares operativos. Las ubicaciones internas son posiciones opcionales dentro de cada LOC.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>LOC</TableHeaderCell>
                <TableHeaderCell>Área</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Ubicaciones internas</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => {
                const locationPositions = positionsByLocation[location.id] ?? [];
                const locationArea = getLocationArea(location.area);
                return (
                  <tr key={location.id} className="border-t border-zinc-200/60 align-top">
                    <TableCell>
                      <div className="font-semibold">{location.code ?? "LOC sin código"}</div>
                      {location.zone ? (
                        <div className="text-xs text-[var(--ui-muted)]">{location.zone}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {locationArea?.name ?? locationArea?.kind ?? "Sin área"}
                    </TableCell>
                    <TableCell>{location.location_type ?? "—"}</TableCell>
                    <TableCell>
                      <span className={location.is_active === false ? "ui-chip" : "ui-chip ui-chip--success"}>
                        {location.is_active === false ? "Inactivo" : "Activo"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {locationPositions.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {locationPositions.map((position) => (
                            <span
                              key={position.id}
                              className={position.is_active === false ? "ui-chip" : "ui-chip ui-chip--success"}
                            >
                              {position.name || position.code || "Posición"}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--ui-muted)]">Sin posiciones internas</span>
                      )}
                    </TableCell>
                  </tr>
                );
              })}

              {locations.length === 0 ? (
                <tr>
                  <TableCell colSpan={5} className="ui-empty">
                    Esta sede todavía no tiene LOCs configurados.
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </section>


      <section className="ui-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="ui-h2">Agregar ruta de producción</h2>
            <p className="mt-2 ui-body-muted">
              Configura una ruta sencilla: qué producto se produce, en qué área consume insumos y qué pasa con el resultado.
            </p>
          </div>
          <span className="ui-chip">Editable</span>
        </div>

        {canManage ? (
          <ProductionRouteForm
            siteId={id}
            action={addProductionRoute}
            products={productOptions.map((product) => ({
              id: product.id,
              label: `${product.name ?? product.id} · ${product.product_type ?? "producto"}`,
            }))}
            areas={areaOptions.map((area) => ({
              id: area.id,
              kind: area.kind ?? "",
              label: area.name ?? area.kind ?? area.id,
            }))}
            locations={activeLocationOptions}
            positions={activePositionOptions}
          />
        ) : (
          <div className="mt-5 ui-alert ui-alert--warn">
            Solo propietarios y gerentes generales pueden crear rutas de producción.
          </div>
        )}
      </section>

      <section className="ui-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="ui-h2">Rutas de producción</h2>
            <p className="mt-2 ui-body-muted">
              Define dónde se consumen insumos y qué pasa con el resultado: inventario, venta lista o pedido POS.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip ui-chip--success">{routeCounts.ok} OK</span>
            <span className="ui-chip ui-chip--warning">{routeCounts.warning} pendientes</span>
            <span className="ui-chip ui-chip--danger">{routeCounts.blocking} bloqueantes</span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>Área</TableHeaderCell>
                <TableHeaderCell>Consume insumos desde</TableHeaderCell>
                <TableHeaderCell>Salida</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Acciones</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {routeDiagnostics.map((route) => {
                const codes = Array.isArray(route.diagnostic_codes) ? route.diagnostic_codes : [];
                return (
                  <tr key={route.route_id} className="border-t border-zinc-200/60 align-top">
                    <TableCell>
                      <div className="font-semibold">{route.product_name ?? "Producto"}</div>
                      {route.route_name ? (
                        <div className="text-xs text-[var(--ui-muted)]">{route.route_name}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>{route.area_name ?? route.area_kind ?? "—"}</TableCell>
                    <TableCell>
                      <div>{route.input_location_code ?? "Sin LOC"}</div>
                      {route.input_location_zone ? (
                        <div className="text-xs text-[var(--ui-muted)]">{route.input_location_zone}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">{outputModeLabel(route.output_mode)}</div>
                      {route.output_mode === "order_fulfillment" ? (
                        <div className="text-xs text-[var(--ui-muted)]">
                          No crea stock terminado. Queda ligado a pedido/POS.
                        </div>
                      ) : (
                        <div className="text-xs text-[var(--ui-muted)]">
                          {route.output_location_code ?? "Sin LOC de salida"}
                          {route.output_position_name || route.output_position_code
                            ? ` · ${route.output_position_name || route.output_position_code}`
                            : ""}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <span className={statusTone(route.diagnostic_status)}>
                          {statusLabel(route.diagnostic_status)}
                        </span>
                        {route.is_default ? (
                          <span className="ui-chip ui-chip--success">Principal</span>
                        ) : null}
                        {codes.length > 0 ? (
                          <ul className="space-y-1 text-xs text-amber-800">
                            {codes.map((code) => (
                              <li key={code}>• {diagnosticCodeLabel(code)}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <div className="flex min-w-[210px] flex-col gap-2">
                          <form action={toggleProductionRoute}>
                            <input type="hidden" name="site_id" value={id} />
                            <input type="hidden" name="route_id" value={route.route_id} />
                            <input type="hidden" name="is_active" value={String(Boolean(route.is_active))} />
                            <button type="submit" className="ui-btn ui-btn--ghost h-9 w-full px-3 text-sm">
                              {route.is_active ? "Desactivar" : "Activar"}
                            </button>
                          </form>

                          {!route.is_default ? (
                            <form action={setDefaultProductionRoute}>
                              <input type="hidden" name="site_id" value={id} />
                              <input type="hidden" name="route_id" value={route.route_id} />
                              <button type="submit" className="ui-btn ui-btn--ghost h-9 w-full px-3 text-sm">
                                Marcar principal
                              </button>
                            </form>
                          ) : null}

                          <form action={deleteProductionRoute}>
                            <input type="hidden" name="site_id" value={id} />
                            <input type="hidden" name="route_id" value={route.route_id} />
                            <button type="submit" className="ui-btn ui-btn--danger h-9 w-full px-3 text-sm">
                              Eliminar
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--ui-muted)]">Solo lectura</span>
                      )}
                    </TableCell>
                  </tr>
                );
              })}

              {routeDiagnostics.length === 0 ? (
                <tr>
                  <TableCell colSpan={6} className="ui-empty">
                    Esta sede todavía no tiene rutas de producción configuradas.
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </section>
    </div>
  );
}
