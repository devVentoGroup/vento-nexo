import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

import { CountInitialForm } from "@/features/inventory/count-initial/count-initial-form";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.counts";

type SearchParams = { site_id?: string; zone?: string; location_id?: string };

type EmployeeSiteRow = { site_id: string | null; is_primary: boolean | null };
type SiteRow = { id: string; name: string | null };
type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
};
type ProductSiteRow = { product_id: string; is_active: boolean | null };

export default async function InventoryCountInitialPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const returnTo = "/inventory/count-initial";
  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo,
    permissionCode: PERMISSION,
  });

  const { data: employeeSites } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(50);

  const employeeSiteRows = (employeeSites ?? []) as EmployeeSiteRow[];
  const siteIds = employeeSiteRows
    .map((r) => r.site_id)
    .filter((id): id is string => Boolean(id));

  const { data: sites } =
    siteIds.length > 0
      ? await supabase
          .from("sites")
          .select("id,name")
          .in("id", siteIds)
          .order("name", { ascending: true })
      : { data: [] as SiteRow[] };

  const siteRows = (sites ?? []) as SiteRow[];
  const siteNameMap = new Map(siteRows.map((r) => [r.id, r.name ?? r.id]));

  const siteId = String(sp.site_id ?? "").trim();
  const zoneParam = String(sp.zone ?? "").trim();
  const locationIdParam = String(sp.location_id ?? "").trim();

  if (!siteId) {
    return (
      <div className="w-full">
        <div>
          <h1 className="ui-h1">Conteos</h1>
          <p className="mt-2 ui-body-muted">
            Wizard por sede: elige la sede, ingresa cantidades contadas y confirma. No bloquea operación.
            Se generan movimientos tipo &quot;count&quot; y se actualiza el stock.
          </p>
        </div>

        <div className="mt-6 ui-panel">
          <div className="ui-h3">Paso 1: elegir sede</div>
          <form method="get" action="/inventory/count-initial" className="mt-4">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Sede</span>
              <select
                name="site_id"
                className="ui-input max-w-xs"
                required
              >
                <option value="">Selecciona una sede</option>
                {siteRows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {siteNameMap.get(s.id) ?? s.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                className="ui-btn ui-btn--brand"
              >
                Continuar
              </button>
              <Link
                href="/inventory/stock"
                className="ui-btn ui-btn--ghost"
              >
                Ver stock
              </Link>
            </div>
          </form>
        </div>

        {siteRows.length === 0 ? (
          <p className="mt-4 ui-body-muted">No tienes sedes asignadas. Contacta al administrador.</p>
        ) : null}
      </div>
    );
  }

  // LOCs de la sede (para filtro por zona/LOC en conteo - Fase 3.1)
  type LocRow = { id: string; code: string | null; zone: string | null };
  const { data: locsData } = await supabase
    .from("inventory_locations")
    .select("id,code,zone")
    .eq("site_id", siteId)
    .order("zone", { ascending: true })
    .order("code", { ascending: true })
    .limit(300);
  const locRows = (locsData ?? []) as LocRow[];
  const zones = [...new Set(locRows.map((l) => l.zone).filter(Boolean))] as string[];

  // Paso 2 y 3: productos y formulario
  const { data: productSites } = await supabase
    .from("product_site_settings")
    .select("product_id,is_active")
    .eq("site_id", siteId)
    .eq("is_active", true);

  const productSiteRows = (productSites ?? []) as ProductSiteRow[];
  const productSiteIds = productSiteRows.map((r) => r.product_id);
  const hasProductSiteFilter = productSiteIds.length > 0;

  let productsQuery = supabase
    .from("products")
    .select("id,name,sku,unit,stock_unit_code,product_inventory_profiles(track_inventory)")
    .eq("product_inventory_profiles.track_inventory", true)
    .order("name", { ascending: true })
    .limit(500);

  if (hasProductSiteFilter) {
    productsQuery = productsQuery.in("id", productSiteIds);
  }

  const { data: products, error: productError } = await productsQuery;
  let productRows = (products ?? []) as unknown as ProductRow[];

  // Si se eligió zona o LOC: filtrar productos a los que tienen stock en esa zona/LOC (conteo por zona/LOC)
  let productIdsInLoc: Set<string> | null = null;
  if (locationIdParam && locRows.some((l) => l.id === locationIdParam)) {
    const { data: stockByLoc } = await supabase
      .from("inventory_stock_by_location")
      .select("product_id")
      .eq("location_id", locationIdParam)
      .limit(2000);
    productIdsInLoc = new Set((stockByLoc ?? []).map((r: { product_id: string }) => r.product_id));
  } else if (zoneParam && zones.includes(zoneParam)) {
    const locIdsInZone = locRows.filter((l) => l.zone === zoneParam).map((l) => l.id);
    if (locIdsInZone.length > 0) {
      const { data: stockByLoc } = await supabase
        .from("inventory_stock_by_location")
        .select("product_id")
        .in("location_id", locIdsInZone)
        .limit(2000);
      productIdsInLoc = new Set((stockByLoc ?? []).map((r: { product_id: string }) => r.product_id));
    }
  }
  if (productIdsInLoc && productIdsInLoc.size > 0) {
    productRows = productRows.filter((p) => productIdsInLoc!.has(p.id));
  }

  const siteName = siteNameMap.get(siteId) ?? siteId;
  const selectedLoc = locationIdParam ? locRows.find((l) => l.id === locationIdParam) : null;
  const countScopeLabel = selectedLoc
    ? `LOC: ${selectedLoc.code ?? selectedLoc.zone ?? selectedLoc.id}`
    : zoneParam
      ? `Zona: ${zoneParam}`
      : "Toda la sede";

  // Fase 3.2: sesiones de conteo abiertas (por zona/LOC) para esta sede
  type CountSessionRow = {
    id: string;
    name: string | null;
    status: string | null;
    scope_type: string | null;
    scope_zone: string | null;
    created_at: string | null;
  };
  const { data: sessionsData } = await supabase
    .from("inventory_count_sessions")
    .select("id,name,status,scope_type,scope_zone,created_at")
    .eq("site_id", siteId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(20);
  const openSessions = (sessionsData ?? []) as CountSessionRow[];

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Conteos</h1>
          <p className="mt-2 ui-body-muted">
            Sede: <strong>{siteName}</strong>. Ingresa las cantidades contadas y confirma.
          </p>
        </div>
        <Link
          href="/inventory/stock"
          className="ui-btn ui-btn--ghost"
        >
          Ver stock
        </Link>
      </div>

      {openSessions.length > 0 ? (
        <div className="mt-6 ui-panel">
          <div className="ui-h3">Sesiones abiertas (por zona/LOC)</div>
          <p className="mt-1 ui-body-muted">
            Conteos por zona/LOC pendientes de cerrar. Cierra el conteo para calcular diferencias y aprobar ajustes.
          </p>
          <ul className="mt-4 space-y-2">
            {openSessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 ui-panel-soft px-4 py-3">
                <span className="ui-body">
                  {s.name ?? s.id.slice(0, 8)} · {s.scope_zone ? `Zona ${s.scope_zone}` : "LOC"} · {s.created_at ? new Date(s.created_at).toLocaleString() : ""}
                </span>
                <Link
                  href={`/inventory/count-initial/session/${s.id}`}
                  className="ui-btn ui-btn--brand"
                >
                  Ver / Cerrar
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {productError ? (
        <div className="mt-6 ui-alert ui-alert--error">
          Error al cargar productos: {productError.message}
        </div>
      ) : productRows.length === 0 ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          No hay productos con inventario trackeado para esta sede. Revisa el catálogo y
          product_site_settings, o &quot;Inventario &gt; Stock&quot; para ver el filtro por sede.
        </div>
      ) : (
        <>
          {/* Fase 3.1: opción de conteo por zona/LOC */}
          {locRows.length > 0 ? (
            <div className="mt-6 ui-panel">
              <div className="ui-h3">Ámbito del conteo</div>
              <p className="mt-1 ui-body-muted">
                Opcional: limita el conteo a una zona o un LOC (solo se listan productos con stock ahí). Si no eliges, se cuenta toda la sede.
              </p>
              <form method="get" action="/inventory/count-initial" className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="site_id" value={siteId} />
                <label className="flex flex-col gap-1">
                  <span className="ui-caption">Zona</span>
                  <select
                    name="zone"
                    className="ui-input min-w-[140px]"
                    defaultValue={zoneParam}
                  >
                    <option value="">Toda la sede</option>
                    {zones.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="ui-caption">LOC (opcional)</span>
                  <select
                    name="location_id"
                    className="ui-input min-w-[200px] font-mono"
                    defaultValue={locationIdParam}
                  >
                    <option value="">—</option>
                    {locRows.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code ?? l.zone ?? l.id}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="ui-btn ui-btn--ghost">
                  Aplicar
                </button>
              </form>
              {(zoneParam || locationIdParam) ? (
                <p className="mt-2 ui-caption">
                  Actual: <strong>{countScopeLabel}</strong>
                </p>
              ) : null}
            </div>
          ) : null}

          <CountInitialForm
            products={productRows.map((p) => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              unit: p.stock_unit_code ?? p.unit,
            }))}
            siteId={siteId}
            siteName={siteName}
            countScopeLabel={countScopeLabel}
            zoneOrLocNote={locationIdParam ? `loc_id:${locationIdParam}` : zoneParam ? `zone:${zoneParam}` : undefined}
          />
        </>
      )}
    </div>
  );
}

