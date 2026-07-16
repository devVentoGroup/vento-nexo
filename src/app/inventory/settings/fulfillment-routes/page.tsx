import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { safeDecodeURIComponent } from "@/lib/url";
import { FulfillmentRouteSelectors } from "@/features/inventory/fulfillment/fulfillment-route-selectors";

export const dynamic = "force-dynamic";

const PAGE = "/inventory/settings/fulfillment-routes";
const text = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value.trim() : "";

function back(params: Record<string, string>) {
  return `${PAGE}?${new URLSearchParams(params).toString()}`;
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
  revalidatePath("/inventory/settings/remissions/products");
  redirect(back({ ok: "toggled" }));
}

type Site = { id: string; name: string | null };
type Location = {
  id: string;
  site_id: string;
  code: string | null;
  description: string | null;
};
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

function supplyModeLabel(value: string) {
  if (value === "production") return "Producción";
  if (value === "transfer") return "Transferencia";
  if (value === "supplier") return "Proveedor";
  if (value === "manual") return "Manual";
  return "Stock";
}

function routeIsIncomplete(route: Route) {
  return !route.preparing_area_kind || !route.preferred_source_location_id;
}

export default async function FulfillmentRoutesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    ok?: string;
    error?: string;
    product_id?: string;
    from_site_id?: string;
    to_site_id?: string;
    area_kind?: string;
    status?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const productFilter = String(sp.product_id ?? "").trim();
  const fromSiteFilter = String(sp.from_site_id ?? "").trim();
  const toSiteFilter = String(sp.to_site_id ?? "").trim();
  const areaFilter = String(sp.area_kind ?? "").trim();
  const statusFilter = String(sp.status ?? "").trim();

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

  const [sitesResult, locationsResult, productsResult, areaKindsResult, routesResult] =
    await Promise.all([
      supabase.from("sites").select("id,name").eq("is_active", true).order("name"),
      supabase
        .from("inventory_locations")
        .select("id,site_id,code,description")
        .eq("is_active", true)
        .order("code"),
      supabase
        .from("products")
        .select("id,name,sku")
        .eq("is_active", true)
        .order("name")
        .limit(1000),
      supabase
        .from("area_kinds")
        .select("code,name")
        .eq("use_for_remission", true)
        .order("name"),
      supabase
        .from("product_fulfillment_routes")
        .select(
          "id,product_id,from_site_id,to_site_id,requesting_area_kind,preparing_area_kind,preferred_source_location_id,preferred_destination_location_id,supply_mode,dispatch_policy,estimated_lead_minutes,is_active",
        )
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false }),
    ]);

  const error = [
    sitesResult.error,
    locationsResult.error,
    productsResult.error,
    areaKindsResult.error,
    routesResult.error,
  ].find(Boolean);
  if (error) throw new Error(`No se pudieron cargar las rutas operativas: ${error.message}`);

  const sites = (sitesResult.data ?? []) as Site[];
  const locations = (locationsResult.data ?? []) as Location[];
  const products = (productsResult.data ?? []) as Product[];
  const areaKinds = (areaKindsResult.data ?? []) as AreaKind[];
  const routes = (routesResult.data ?? []) as Route[];

  const filteredRoutes = routes.filter((route) => {
    if (productFilter && route.product_id !== productFilter) return false;
    if (fromSiteFilter && route.from_site_id !== fromSiteFilter) return false;
    if (toSiteFilter && route.to_site_id !== toSiteFilter) return false;
    if (areaFilter && route.requesting_area_kind !== areaFilter) return false;
    if (statusFilter === "active" && !route.is_active) return false;
    if (statusFilter === "inactive" && route.is_active) return false;
    if (statusFilter === "incomplete" && !routeIsIncomplete(route)) return false;
    return true;
  });

  const siteName = new Map(sites.map((site) => [site.id, site.name ?? "Sede sin nombre"]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const locationName = new Map(
    locations.map((location) => [
      location.id,
      String(location.description ?? "").trim() ||
        String(location.code ?? "").trim() ||
        "LOC sin nombre",
    ]),
  );
  const areaName = new Map(areaKinds.map((area) => [area.code, area.name ?? area.code]));
  const success = sp.ok === "toggled" ? "Estado de la ruta actualizado." : null;
  const errorMessage = sp.error ? safeDecodeURIComponent(sp.error) : "";

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero">
        <Link href="/inventory/settings" className="ui-caption underline">
          Volver a configuración
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="ui-h1">Rutas operativas por producto</h1>
            <p className="mt-2 max-w-3xl ui-body-muted">
              Revisa qué área y LOC del origen atienden cada producto. Las rutas se crean desde
              Productos de remisión por sede; esta pantalla no duplica esa configuración.
            </p>
          </div>
          <Link
            href="/inventory/settings/remissions/products"
            className="ui-btn ui-btn--brand"
          >
            Configurar productos
          </Link>
        </div>
      </section>

      {errorMessage ? <div className="ui-alert ui-alert--error">{errorMessage}</div> : null}
      {success ? <div className="ui-alert ui-alert--success">{success}</div> : null}

      <div className="ui-alert ui-alert--neutral">
        El LOC es parte de la ruta. La estantería, nivel, posición interna o LPN no se guarda
        aquí: se resuelve al preparar y despachar según el inventario real.
      </div>

      <section className="ui-panel ui-remission-section">
        <div className="ui-h3">Filtros de revisión</div>
        <div className="mt-4">
          <FulfillmentRouteSelectors
            sites={sites}
            products={products}
            areas={areaKinds}
            defaults={{
              productId: productFilter,
              fromSiteId: fromSiteFilter,
              toSiteId: toSiteFilter,
              requestingAreaKind: areaFilter,
              status: statusFilter,
            }}
          />
        </div>
      </section>

      {!canManage ? (
        <div className="ui-alert ui-alert--warn">
          Solo propietarios y gerentes generales pueden activar o desactivar rutas.
        </div>
      ) : null}

      <section className="ui-panel ui-remission-section">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Rutas configuradas ({filteredRoutes.length})</div>
            <p className="mt-1 ui-caption">
              Para cambiar área o LOC, abre el producto en la configuración por sede.
            </p>
          </div>
          <Link
            href="/inventory/settings/supply-routes"
            className="ui-btn ui-btn--ghost ui-btn--sm"
          >
            Ver rutas entre sedes
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ui-border)] text-left ui-caption">
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2">Solicitud</th>
                <th className="px-3 py-2">Atiende en origen</th>
                <th className="px-3 py-2">Modo</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoutes.map((route) => {
                const product = productById.get(route.product_id) ?? null;
                const incomplete = routeIsIncomplete(route);
                const configureParams = new URLSearchParams({
                  destination_site_id: route.to_site_id,
                  origin_site_id: route.from_site_id,
                  area_kind: route.requesting_area_kind ?? "",
                  bulk_profile:
                    route.supply_mode === "production"
                      ? "preparation_from_origin"
                      : "input_from_origin",
                  q: product?.sku ?? product?.name ?? "",
                });

                return (
                  <tr
                    key={route.id}
                    className="border-b border-[var(--ui-border)] align-top"
                  >
                    <td className="px-3 py-3 font-medium">
                      {product?.name ?? product?.sku ?? "Producto no disponible"}
                      {product?.sku ? (
                        <div className="ui-caption">{product.sku}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      {siteName.get(route.to_site_id) ?? "Sede"}
                      <div className="ui-caption">
                        {route.requesting_area_kind
                          ? areaName.get(route.requesting_area_kind) ??
                            route.requesting_area_kind
                          : "Área solicitante no definida"}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {siteName.get(route.from_site_id) ?? "Sede"}
                      <div className="ui-caption">
                        {route.preparing_area_kind
                          ? areaName.get(route.preparing_area_kind) ??
                            route.preparing_area_kind
                          : "Área responsable no definida"}
                        {" · "}
                        {locationName.get(route.preferred_source_location_id ?? "") ??
                          "LOC no definido"}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        Posición interna: se resuelve al despachar
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div>{supplyModeLabel(route.supply_mode)}</div>
                      <div className="ui-caption">
                        {route.dispatch_policy}
                        {route.estimated_lead_minutes !== null
                          ? ` · ${route.estimated_lead_minutes} min`
                          : ""}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span className={route.is_active ? "ui-chip ui-chip--success" : "ui-chip"}>
                          {route.is_active ? "Activa" : "Inactiva"}
                        </span>
                        {incomplete ? (
                          <span className="ui-chip ui-chip--warn">Incompleta</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/inventory/settings/remissions/products?${configureParams.toString()}`}
                          className="ui-btn ui-btn--ghost ui-btn--sm"
                        >
                          Configurar
                        </Link>
                        {canManage ? (
                          <form action={toggleRoute}>
                            <input type="hidden" name="id" value={route.id} />
                            <input
                              type="hidden"
                              name="is_active"
                              value={String(route.is_active)}
                            />
                            <button className="ui-btn ui-btn--ghost ui-btn--sm">
                              {route.is_active ? "Desactivar" : "Activar"}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredRoutes.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 ui-empty">
                    No hay rutas con estos filtros. Configúralas desde Productos de remisión por
                    sede.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}