import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
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
  const requestingAreaKind = text(formData.get("requesting_area_kind")) || null;
  const preparingAreaKind = text(formData.get("preparing_area_kind")) || null;

  if (
    !productId ||
    !fromSiteId ||
    !toSiteId ||
    fromSiteId === toSiteId ||
    !requestingAreaKind ||
    !preparingAreaKind ||
    !sourceLocationId
  ) {
    redirect(
      back({
        error:
          "Completa producto, relación de remisión, área responsable y LOC de salida.",
      }),
    );
  }

  const [{ data: location }, { data: area }, { data: productSetting }] =
    await Promise.all([
      supabase
        .from("inventory_locations")
        .select("id,site_id,area_id,is_active")
        .eq("id", sourceLocationId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("areas")
        .select("id,site_id,kind,is_active")
        .eq("site_id", fromSiteId)
        .eq("kind", preparingAreaKind)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("product_site_settings")
        .select("product_id,site_id,remission_enabled,area_kinds,default_area_kind,is_active")
        .eq("product_id", productId)
        .eq("site_id", toSiteId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  if (!location || location.site_id !== fromSiteId) {
    redirect(back({ error: "El LOC seleccionado no pertenece a la sede origen." }));
  }
  if (!area || location.area_id !== area.id) {
    redirect(
      back({
        error: "El LOC seleccionado no pertenece al área responsable indicada.",
      }),
    );
  }

  const allowedAreaKinds = Array.isArray(productSetting?.area_kinds)
    ? productSetting.area_kinds.map((value) => String(value ?? "").trim())
    : [];
  const relationIsConfigured =
    Boolean(productSetting?.remission_enabled) &&
    (allowedAreaKinds.includes(requestingAreaKind) ||
      productSetting?.default_area_kind === requestingAreaKind);

  if (!relationIsConfigured) {
    redirect(
      back({
        error:
          "La relación producto, sede destino y área solicitante no está configurada en Productos de remisión por sede.",
      }),
    );
  }

  const { data: supplyRoute } = await supabase
    .from("site_supply_routes")
    .select("id")
    .eq("requesting_site_id", toSiteId)
    .eq("fulfillment_site_id", fromSiteId)
    .eq("is_active", true)
    .maybeSingle();
  if (!supplyRoute) {
    redirect(
      back({
        error:
          "La sede origen no está configurada como abastecedora de la sede destino.",
      }),
    );
  }

  const { data: existingRoutes, error: existingRoutesError } = await supabase
    .from("product_fulfillment_routes")
    .select("id,requesting_area_kind")
    .eq("product_id", productId)
    .eq("from_site_id", fromSiteId)
    .eq("to_site_id", toSiteId)
    .eq("is_active", true);
  if (existingRoutesError) {
    redirect(back({ error: existingRoutesError.message }));
  }
  if (
    (existingRoutes ?? []).some(
      (route) =>
        !route.requesting_area_kind ||
        route.requesting_area_kind === requestingAreaKind,
    )
  ) {
    redirect(
      back({
        error:
          "Ya existe una ruta activa para este producto, origen, destino y área solicitante.",
      }),
    );
  }

  const { error } = await supabase.from("product_fulfillment_routes").insert({
    product_id: productId,
    from_site_id: fromSiteId,
    to_site_id: toSiteId,
    requesting_area_kind: requestingAreaKind,
    preparing_area_kind: preparingAreaKind,
    preferred_source_location_id: sourceLocationId,
    preferred_destination_location_id: null,
    supply_mode: "stock",
    dispatch_policy: "next_available",
    estimated_lead_minutes: null,
    allow_substitution: false,
    notes:
      "Ruta generada desde la configuración de productos por sede. Las posiciones internas se resuelven durante la preparación y el despacho.",
    is_active: true,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) redirect(back({ error: error.message }));

  revalidatePath(PAGE);
  revalidatePath("/inventory/settings/remissions/products");
  revalidatePath("/inventory/remissions");
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
type Location = {
  id: string;
  site_id: string;
  area_id: string | null;
  code: string | null;
  description: string | null;
};
type Product = { id: string; name: string | null; sku: string | null };
type Area = {
  id: string;
  site_id: string;
  kind: string;
  name: string | null;
};
type Route = {
  id: string;
  product_id: string;
  from_site_id: string;
  to_site_id: string;
  requesting_area_kind: string | null;
  preparing_area_kind: string | null;
  preferred_source_location_id: string | null;
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

  const [
    sitesResult,
    locationsResult,
    productsResult,
    areasResult,
    productSettingsResult,
    supplyRoutesResult,
    productionRoutesResult,
    routesResult,
  ] = await Promise.all([
    supabase.from("sites").select("id,name").eq("is_active", true).order("name"),
    supabase
      .from("inventory_locations")
      .select("id,site_id,area_id,code,description")
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("products")
      .select("id,name,sku")
      .eq("is_active", true)
      .order("name")
      .limit(1000),
    supabase
      .from("areas")
      .select("id,site_id,kind,name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("product_site_settings")
      .select(
        "product_id,site_id,is_active,inventory_enabled,remission_enabled,local_production_enabled,production_location_id,default_area_kind,area_kinds",
      )
      .eq("is_active", true),
    supabase
      .from("site_supply_routes")
      .select("requesting_site_id,fulfillment_site_id,is_active"),
    supabase
      .from("product_site_production_routes")
      .select(
        "product_id,site_id,area_kind,input_location_id,output_location_id,is_active,is_default",
      )
      .eq("is_active", true),
    supabase
      .from("product_fulfillment_routes")
      .select(
        "id,product_id,from_site_id,to_site_id,requesting_area_kind,preparing_area_kind,preferred_source_location_id,is_active",
      )
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false }),
  ]);

  const error = [
    sitesResult.error,
    locationsResult.error,
    productsResult.error,
    areasResult.error,
    productSettingsResult.error,
    supplyRoutesResult.error,
    productionRoutesResult.error,
    routesResult.error,
  ].find(Boolean);
  if (error) throw new Error(`No se pudo cargar las rutas operativas: ${error.message}`);

  const sites = (sitesResult.data ?? []) as Site[];
  const locations = (locationsResult.data ?? []) as Location[];
  const products = (productsResult.data ?? []) as Product[];
  const areas = (areasResult.data ?? []) as Area[];
  const routes = (routesResult.data ?? []) as Route[];

  const productSiteSettings = ((productSettingsResult.data ?? []) as Array<any>).map(
    (setting) => ({
      productId: String(setting.product_id ?? ""),
      siteId: String(setting.site_id ?? ""),
      isActive: setting.is_active !== false,
      inventoryEnabled: setting.inventory_enabled !== false,
      remissionEnabled: setting.remission_enabled === true,
      localProductionEnabled: setting.local_production_enabled === true,
      productionLocationId: setting.production_location_id ?? null,
      defaultAreaKind: setting.default_area_kind ?? null,
      areaKinds: Array.isArray(setting.area_kinds) ? setting.area_kinds : [],
    }),
  );
  const supplyRoutes = ((supplyRoutesResult.data ?? []) as Array<any>).map(
    (route) => ({
      requestingSiteId: String(route.requesting_site_id ?? ""),
      fulfillmentSiteId: String(route.fulfillment_site_id ?? ""),
      isActive: route.is_active !== false,
    }),
  );
  const productionRoutes = ((productionRoutesResult.data ?? []) as Array<any>).map(
    (route) => ({
      productId: String(route.product_id ?? ""),
      siteId: String(route.site_id ?? ""),
      areaKind: String(route.area_kind ?? ""),
      inputLocationId: String(route.input_location_id ?? ""),
      outputLocationId: route.output_location_id ?? null,
      isActive: route.is_active !== false,
      isDefault: route.is_default === true,
    }),
  );

  const siteName = new Map(sites.map((site) => [site.id, site.name ?? "Sede"]));
  const productName = new Map(
    products.map((product) => [product.id, product.name ?? product.sku ?? "Producto"]),
  );
  const locationName = new Map(
    locations.map((location) => [
      location.id,
      location.description ?? location.code ?? "LOC",
    ]),
  );
  const areaName = new Map(areas.map((area) => [area.kind, area.name ?? area.kind]));

  const success =
    sp.ok === "created"
      ? "Ruta operativa creada. El LOC quedó definido; las posiciones internas se resolverán al preparar."
      : sp.ok === "toggled"
        ? "Estado de la ruta actualizado."
        : null;

  const preferredProduct = products.find((product) => product.id === prefilledProductId) ?? null;
  const prefill = {
    productId: preferredProduct?.id ?? "",
    fromSiteId: "",
    toSiteId: "",
    sourceLocationId: "",
    requestingAreaKind: "",
    preparingAreaKind: "",
  };

  return (
    <div className="ui-screen">
      <section className="ui-remission-hero">
        <Link href="/inventory/settings/remissions/products" className="ui-caption underline">
          Volver a Productos de remisión por sede
        </Link>
        <h1 className="mt-2 ui-h1">Responsabilidad y LOC de salida</h1>
        <p className="mt-2 max-w-3xl ui-body-muted">
          Completa únicamente quién atiende la solicitud en el origen y desde qué LOC sale. La ubicación interna del inventario se consulta y selecciona al preparar o despachar.
        </p>
      </section>

      {sp.error ? (
        <div className="ui-alert ui-alert--error">{decodeURIComponent(sp.error)}</div>
      ) : null}
      {success ? <div className="ui-alert ui-alert--success">{success}</div> : null}

      {!canManage ? (
        <div className="ui-alert ui-alert--warn">
          Solo propietarios y gerentes generales pueden cambiar estas rutas.
        </div>
      ) : null}

      {canManage ? (
        <section className="ui-panel ui-remission-section">
          <div className="ui-h3">Completar ruta de un producto</div>
          <p className="mt-1 ui-caption">
            Producto, sede destino, área solicitante y sede abastecedora vienen de Productos de remisión por sede y Rutas de abastecimiento.
          </p>
          <form action={createRoute} className="mt-5 grid gap-4 lg:grid-cols-2">
            <FulfillmentRouteSelectors
              sites={sites}
              products={products}
              locations={locations}
              areas={areas}
              productSiteSettings={productSiteSettings}
              supplyRoutes={supplyRoutes}
              productionRoutes={productionRoutes}
              activeRoutes={routes.map((route) => ({
                productId: route.product_id,
                fromSiteId: route.from_site_id,
                toSiteId: route.to_site_id,
                requestingAreaKind: route.requesting_area_kind,
                isActive: route.is_active,
              }))}
              defaults={prefill}
            />
            <div className="lg:col-span-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-3 text-sm text-[var(--ui-muted)]">
              <strong>No se configura aquí:</strong> estantería, nivel, pasillo, posición interna ni LPN. Esos datos dependen del inventario actual y se resuelven en el flujo de preparación.
            </div>
            <div className="lg:col-span-2">
              <button className="ui-btn ui-btn--brand">Guardar responsabilidad y LOC</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="ui-panel ui-remission-section">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Rutas configuradas ({routes.length})</div>
            <p className="mt-1 ui-caption">
              Esta tabla es de revisión. Las posiciones internas no forman parte de la ruta.
            </p>
          </div>
          <Link href="/inventory/settings/supply-routes" className="ui-btn ui-btn--ghost ui-btn--sm">
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
                <th className="px-3 py-2">LOC de salida</th>
                <th className="px-3 py-2">Estado</th>
                {canManage ? <th className="px-3 py-2">Acción</th> : null}
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => (
                <tr key={route.id} className="border-b border-[var(--ui-border)] align-top">
                  <td className="px-3 py-3 font-medium">
                    {productName.get(route.product_id) ?? "Producto no disponible"}
                  </td>
                  <td className="px-3 py-3">
                    {siteName.get(route.to_site_id) ?? "Destino"}
                    <div className="ui-caption">
                      {route.requesting_area_kind
                        ? areaName.get(route.requesting_area_kind) ?? route.requesting_area_kind
                        : "Área no definida"}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {siteName.get(route.from_site_id) ?? "Origen"}
                    <div className="ui-caption">
                      {route.preparing_area_kind
                        ? areaName.get(route.preparing_area_kind) ?? route.preparing_area_kind
                        : "Área responsable no definida"}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {locationName.get(route.preferred_source_location_id ?? "") ?? "LOC no definido"}
                    <div className="ui-caption">Posición interna: se resuelve al preparar</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={route.is_active ? "ui-chip ui-chip--success" : "ui-chip"}>
                      {route.is_active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  {canManage ? (
                    <td className="px-3 py-3">
                      <form action={toggleRoute}>
                        <input type="hidden" name="id" value={route.id} />
                        <input type="hidden" name="is_active" value={String(route.is_active)} />
                        <button className="ui-btn ui-btn--ghost ui-btn--sm">
                          {route.is_active ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
              {!routes.length ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="px-3 py-8 ui-empty">
                    No hay rutas configuradas. Completa área responsable y LOC para los productos remitibles.
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
