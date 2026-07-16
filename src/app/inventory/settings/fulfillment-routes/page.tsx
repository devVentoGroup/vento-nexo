import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { FulfillmentRouteSelectors } from "@/features/inventory/fulfillment/fulfillment-route-selectors";

export const dynamic = "force-dynamic";

const PAGE = "/inventory/settings/fulfillment-routes";
const text = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value.trim() : "";

function back(params: Record<string, string>) {
  return `${PAGE}?${new URLSearchParams(params).toString()}`;
}

async function createRoute(formData: FormData) {
  "use server";

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: PAGE,
    permissionCode: "inventory.stock",
  });
  const productId = text(formData.get("product_id"));
  const fromSiteId = text(formData.get("from_site_id"));
  const toSiteId = text(formData.get("to_site_id"));
  const sourceLocationId = text(formData.get("preferred_source_location_id"));
  const destinationLocationId = text(formData.get("preferred_destination_location_id"));
  const requestingAreaKind = text(formData.get("requesting_area_kind")) || null;
  const preparingAreaKind = text(formData.get("preparing_area_kind")) || null;
  const supplyMode = text(formData.get("supply_mode")) || "stock";
  const dispatchPolicy = text(formData.get("dispatch_policy")) || "next_available";
  const leadMinutesRaw = text(formData.get("estimated_lead_minutes"));
  const leadMinutes = leadMinutesRaw ? Number(leadMinutesRaw) : null;

  if (!productId || !fromSiteId || !toSiteId || fromSiteId === toSiteId) {
    redirect(back({ error: "Selecciona producto, origen y destino distintos." }));
  }
  if (!Number.isFinite(leadMinutes ?? 0) || (leadMinutes !== null && leadMinutes < 0)) {
    redirect(back({ error: "El tiempo estimado debe ser un número positivo." }));
  }
  if (!['stock', 'production', 'supplier', 'transfer', 'manual'].includes(supplyMode)) {
    redirect(back({ error: "Modo de abastecimiento inválido." }));
  }
  if (!['next_available', 'scheduled_run', 'manual'].includes(dispatchPolicy)) {
    redirect(back({ error: "Política de despacho inválida." }));
  }

  const locationIds = [sourceLocationId, destinationLocationId].filter(Boolean);
  if (locationIds.length) {
    const { data: locations, error: locationsError } = await supabase
      .from("inventory_locations")
      .select("id,site_id")
      .in("id", locationIds);
    if (locationsError || locations?.length !== locationIds.length) {
      redirect(back({ error: "Uno de los LOCs seleccionados no existe." }));
    }
    const byId = new Map((locations ?? []).map((location) => [location.id, location]));
    if (sourceLocationId && byId.get(sourceLocationId)?.site_id !== fromSiteId) {
      redirect(back({ error: "El LOC de salida debe pertenecer a la sede origen." }));
    }
    if (destinationLocationId && byId.get(destinationLocationId)?.site_id !== toSiteId) {
      redirect(back({ error: "El LOC de llegada debe pertenecer a la sede destino." }));
    }
  }

  const { error } = await supabase.from("product_fulfillment_routes").insert({
    product_id: productId,
    from_site_id: fromSiteId,
    to_site_id: toSiteId,
    requesting_area_kind: requestingAreaKind,
    preparing_area_kind: preparingAreaKind,
    preferred_source_location_id: sourceLocationId || null,
    preferred_destination_location_id: destinationLocationId || null,
    supply_mode: supplyMode,
    dispatch_policy: dispatchPolicy,
    estimated_lead_minutes: leadMinutes,
    allow_substitution: formData.get("allow_substitution") === "on",
    notes: text(formData.get("notes")) || null,
    is_active: true,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) redirect(back({ error: error.message }));

  revalidatePath(PAGE);
  redirect(back({ ok: "created" }));
}

async function toggleRoute(formData: FormData) {
  "use server";

  const id = text(formData.get("id"));
  const isActive = text(formData.get("is_active")) === "true";
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: PAGE,
    permissionCode: "inventory.stock",
  });
  if (!id) redirect(back({ error: "Ruta inválida." }));
  const { error } = await supabase
    .from("product_fulfillment_routes")
    .update({ is_active: !isActive, updated_by: user.id })
    .eq("id", id);
  if (error) redirect(back({ error: error.message }));
  revalidatePath(PAGE);
  redirect(back({ ok: "toggled" }));
}

type Site = { id: string; name: string | null };
type Location = { id: string; site_id: string; code: string | null; description: string | null };
type Product = { id: string; name: string | null; sku: string | null };
type AreaKind = { code: string; name: string | null };
type Route = {
  id: string;
  product_id: string;
  from_site_id: string;
  to_site_id: string;
  requesting_area_kind: string | null;
  preparing_area_kind: string | null;
  preferred_source_location_id: string | null;
  preferred_destination_location_id: string | null;
  supply_mode: string;
  dispatch_policy: string;
  estimated_lead_minutes: number | null;
  is_active: boolean;
};

export default async function FulfillmentRoutesPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string; product_id?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const prefilledProductId = String(sp.product_id ?? "").trim();
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: PAGE,
    permissionCode: "inventory.stock",
  });
  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const canManage = ["propietario", "gerente_general"].includes(
    String(employee?.role ?? "").toLowerCase(),
  );

  const [sitesResult, locationsResult, productsResult, areaKindsResult, areaRulesResult, purposeSettingsResult, routesResult, productSettingsResult] =
    await Promise.all([
      supabase.from("sites").select("id,name").eq("is_active", true).order("name"),
      supabase.from("inventory_locations").select("id,site_id,code,description").eq("is_active", true).order("code"),
      supabase.from("products").select("id,name,sku").eq("is_active", true).order("name").limit(600),
      supabase.from("area_kinds").select("code,name").eq("use_for_remission", true).order("name"),
      supabase.from("site_area_purpose_rules").select("site_id,area_kind").eq("purpose", "remission").eq("is_enabled", true),
      supabase.from("site_purpose_settings").select("site_id,mode").eq("purpose", "remission"),
      supabase
        .from("product_fulfillment_routes")
        .select("id,product_id,from_site_id,to_site_id,requesting_area_kind,preparing_area_kind,preferred_source_location_id,preferred_destination_location_id,supply_mode,dispatch_policy,estimated_lead_minutes,is_active")
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false }),
      prefilledProductId
        ? supabase
          .from("product_site_settings")
          .select("site_id,is_active,default_area_kind,area_kinds,production_location_id,local_production_enabled,remission_enabled")
          .eq("product_id", prefilledProductId)
          .eq("is_active", true)
        : Promise.resolve({ data: [], error: null }),
    ]);
  const error = [sitesResult.error, locationsResult.error, productsResult.error, areaKindsResult.error, areaRulesResult.error, purposeSettingsResult.error, routesResult.error, productSettingsResult.error]
    .find(Boolean);
  if (error) throw new Error(`No se pudo cargar las rutas operativas: ${error.message}`);

  const sites = (sitesResult.data ?? []) as Site[];
  const locations = (locationsResult.data ?? []) as Location[];
  const products = (productsResult.data ?? []) as Product[];
  const areaKinds = (areaKindsResult.data ?? []) as AreaKind[];
  const routes = (routesResult.data ?? []) as Route[];
  const areaByCode = new Map(areaKinds.map((area) => [area.code, area]));
  const globalRemissionAreas = areaKinds;
  const areaRulesBySite = new Map<string, string[]>();
  for (const rule of (areaRulesResult.data ?? []) as Array<{ site_id: string; area_kind: string }>) {
    const current = areaRulesBySite.get(rule.site_id) ?? [];
    current.push(rule.area_kind);
    areaRulesBySite.set(rule.site_id, current);
  }
  const purposeModeBySite = new Map(
    ((purposeSettingsResult.data ?? []) as Array<{ site_id: string; mode: "inherit_global" | "custom" | "disabled" }>).map((setting) => [setting.site_id, setting.mode]),
  );
  const remissionAreasBySite = Object.fromEntries(sites.map((site) => {
    const mode = purposeModeBySite.get(site.id) ?? "inherit_global";
    const codes = mode === "disabled" ? [] : mode === "custom" ? (areaRulesBySite.get(site.id) ?? []) : globalRemissionAreas.map((area) => area.code);
    return [site.id, codes.map((code) => areaByCode.get(code)).filter((area): area is AreaKind => Boolean(area))];
  }));
  const siteName = new Map(sites.map((site) => [site.id, site.name ?? "Sede sin nombre"]));
  const productName = new Map(products.map((product) => [product.id, product.name ?? product.sku ?? "Producto"]));
  const locationName = new Map(locations.map((location) => [
    location.id,
    `${siteName.get(location.site_id) ?? "Sede"} · ${location.description ?? location.code ?? "LOC"}`,
  ]));
  const areaName = new Map(areaKinds.map((area) => [area.code, area.name ?? area.code]));
  const success = sp.ok === "created" ? "Ruta operativa creada." : sp.ok === "toggled" ? "Estado de la ruta actualizado." : null;
  const productSettings = (productSettingsResult.data ?? []) as Array<{
    site_id: string;
    default_area_kind: string | null;
    area_kinds: string[] | null;
    production_location_id: string | null;
    local_production_enabled: boolean | null;
    remission_enabled: boolean | null;
  }>;
  const productionSetting = productSettings.find((setting) =>
    Boolean(setting.local_production_enabled || setting.production_location_id),
  ) ?? null;
  const destinationSettings = productSettings.filter((setting) =>
    setting.site_id !== productionSetting?.site_id && setting.remission_enabled !== false,
  );
  const destinationSetting = destinationSettings.length === 1 ? destinationSettings[0] : null;
  const preferredProduct = products.find((product) => product.id === prefilledProductId) ?? null;
  const prefill = {
    productId: preferredProduct?.id ?? "",
    fromSiteId: productionSetting?.site_id ?? "",
    sourceLocationId: productionSetting?.production_location_id ?? "",
    preparingAreaKind: productionSetting?.default_area_kind ?? "",
    toSiteId: destinationSetting?.site_id ?? "",
    requestingAreaKind: destinationSetting?.default_area_kind ?? "",
    supplyMode: productionSetting ? "production" : "stock",
  };

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero">
        <Link href="/inventory/settings" className="ui-caption underline">Volver a configuración</Link>
        <h1 className="mt-2 ui-h1">Rutas operativas por producto</h1>
        <p className="mt-2 max-w-3xl ui-body-muted">
          Define exactamente desde qué LOC se prepara cada producto, quién lo prepara y a qué LOC llega. Esta regla se aplica al crear nuevas solicitudes.
        </p>
      </section>

      {sp.error ? <div className="ui-alert ui-alert--error">{decodeURIComponent(sp.error)}</div> : null}
      {success ? <div className="ui-alert ui-alert--success">{success}</div> : null}

      {preferredProduct ? <div className="ui-alert ui-alert--neutral">
        Se abrió desde <strong>{preferredProduct.name ?? preferredProduct.sku ?? "este producto"}</strong>. Se propusieron su sede y LOC de producción; confirma el destino antes de guardar.
      </div> : null}

      {!canManage ? <div className="ui-alert ui-alert--warn">Solo propietarios y gerentes generales pueden cambiar estas rutas.</div> : null}

      {canManage ? <section className="ui-panel ui-remission-section">
        <div className="ui-h3">Nueva ruta operativa</div>
        <p className="mt-1 ui-caption">Una ruta define una responsabilidad de preparación; no mueve inventario ni genera un envío por sí sola.</p>
        <form action={createRoute} className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-1 lg:col-span-2"><span className="ui-label">Producto</span><select name="product_id" className="ui-input" required defaultValue={prefill.productId}><option value="">Seleccionar producto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name ?? product.sku ?? "Sin nombre"}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></label>
          <FulfillmentRouteSelectors sites={sites} locations={locations} areasBySite={remissionAreasBySite} defaults={prefill} />
          <label className="flex flex-col gap-1"><span className="ui-label">Cómo se abastece</span><select name="supply_mode" className="ui-input" defaultValue={prefill.supplyMode}><option value="stock">Stock disponible</option><option value="production">Producción</option><option value="supplier">Proveedor</option><option value="transfer">Transferencia</option><option value="manual">Manual</option></select></label>
          <label className="flex flex-col gap-1"><span className="ui-label">Cuándo se despacha</span><select name="dispatch_policy" className="ui-input" defaultValue="next_available"><option value="next_available">Cuando esté disponible</option><option value="scheduled_run">En salida programada</option><option value="manual">Manual</option></select></label>
          <label className="flex flex-col gap-1"><span className="ui-label">Tiempo estimado (minutos)</span><input name="estimated_lead_minutes" type="number" min="0" className="ui-input" placeholder="Opcional" /></label>
          <label className="flex items-center gap-2 pt-7"><input name="allow_substitution" type="checkbox" /><span className="text-sm">Permitir sustitución</span></label>
          <label className="flex flex-col gap-1 lg:col-span-2"><span className="ui-label">Notas</span><textarea name="notes" className="ui-input min-h-24" placeholder="Opcional" /></label>
          <div className="lg:col-span-2"><button className="ui-btn ui-btn--brand">Guardar ruta operativa</button></div>
        </form>
      </section> : null}

      <section className="ui-panel ui-remission-section">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="ui-h3">Rutas configuradas ({routes.length})</div><p className="mt-1 ui-caption">Las inactivas no se usarán para nuevas solicitudes; la trazabilidad anterior se conserva.</p></div><Link href="/inventory/settings/supply-routes" className="ui-btn ui-btn--ghost ui-btn--sm">Ver rutas entre sedes</Link></div>
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-[var(--ui-border)] text-left ui-caption"><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Preparación</th><th className="px-3 py-2">Entrega</th><th className="px-3 py-2">Regla</th><th className="px-3 py-2">Estado</th>{canManage ? <th className="px-3 py-2">Acción</th> : null}</tr></thead><tbody>{routes.map((route) => <tr key={route.id} className="border-b border-[var(--ui-border)] align-top"><td className="px-3 py-3 font-medium">{productName.get(route.product_id) ?? "Producto no disponible"}</td><td className="px-3 py-3">{siteName.get(route.from_site_id) ?? "Sede"}<div className="ui-caption">{locationName.get(route.preferred_source_location_id ?? "") ?? "LOC no definido"}{route.preparing_area_kind ? ` · ${areaName.get(route.preparing_area_kind) ?? route.preparing_area_kind}` : ""}</div></td><td className="px-3 py-3">{siteName.get(route.to_site_id) ?? "Sede"}<div className="ui-caption">{locationName.get(route.preferred_destination_location_id ?? "") ?? "LOC no definido"}{route.requesting_area_kind ? ` · solicita: ${areaName.get(route.requesting_area_kind) ?? route.requesting_area_kind}` : ""}</div></td><td className="px-3 py-3"><div>{route.supply_mode}</div><div className="ui-caption">{route.dispatch_policy}{route.estimated_lead_minutes !== null ? ` · ${route.estimated_lead_minutes} min` : ""}</div></td><td className="px-3 py-3"><span className={route.is_active ? "ui-chip ui-chip--success" : "ui-chip"}>{route.is_active ? "Activa" : "Inactiva"}</span></td>{canManage ? <td className="px-3 py-3"><form action={toggleRoute}><input type="hidden" name="id" value={route.id} /><input type="hidden" name="is_active" value={String(route.is_active)} /><button className="ui-btn ui-btn--ghost ui-btn--sm">{route.is_active ? "Desactivar" : "Activar"}</button></form></td> : null}</tr>)}{!routes.length ? <tr><td colSpan={canManage ? 6 : 5} className="px-3 py-8 ui-empty">Todavía no hay rutas operativas. Crea la primera para que la preparación sepa qué hacer con cada producto.</td></tr> : null}</tbody></table></div>
      </section>
    </div>
  );
}
