import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION_CODE = "inventory.locations";

type SearchParams = {
  site_id?: string;
};

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type EmployeeRow = {
  site_id: string | null;
};

type EmployeeSettingsRow = {
  selected_site_id: string | null;
};

type SiteRow = {
  id: string;
  name: string | null;
};

type LocationRow = {
  id: string;
  site_id: string | null;
  zone: string | null;
  code: string | null;
  description: string | null;
};

type StockRow = {
  location_id: string | null;
  product_id: string | null;
  current_qty: number | null;
  updated_at: string | null;
};

type ZoneSummary = {
  zone: string;
  locationCount: number;
  productCount: number;
  totalQty: number;
  lastUpdatedAt: string | null;
};

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function formatQty(value: number) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 3,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sin movimientos";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin movimientos";

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function buildHref(path: string, params: Record<string, string>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }

  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

function buildZoneSummaries(locations: LocationRow[], stockRows: StockRow[]): ZoneSummary[] {
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const productsByZone = new Map<string, Set<string>>();
  const summariesByZone = new Map<string, ZoneSummary>();

  for (const location of locations) {
    const zone = String(location.zone ?? "").trim().toUpperCase();
    if (!zone) continue;

    const current = summariesByZone.get(zone) ?? {
      zone,
      locationCount: 0,
      productCount: 0,
      totalQty: 0,
      lastUpdatedAt: null,
    };

    summariesByZone.set(zone, {
      ...current,
      locationCount: current.locationCount + 1,
    });
  }

  for (const stock of stockRows) {
    const location = stock.location_id ? locationById.get(stock.location_id) : null;
    const zone = String(location?.zone ?? "").trim().toUpperCase();
    if (!zone) continue;

    const current = summariesByZone.get(zone);
    if (!current) continue;

    const qty = Number(stock.current_qty ?? 0);
    const productId = String(stock.product_id ?? "").trim();
    const productSet = productsByZone.get(zone) ?? new Set<string>();

    if (productId && qty > 0) productSet.add(productId);
    productsByZone.set(zone, productSet);

    const updatedAt = String(stock.updated_at ?? "").trim();
    const lastUpdatedAt = !updatedAt
      ? current.lastUpdatedAt
      : !current.lastUpdatedAt || new Date(updatedAt).getTime() > new Date(current.lastUpdatedAt).getTime()
        ? updatedAt
        : current.lastUpdatedAt;

    summariesByZone.set(zone, {
      ...current,
      totalQty: current.totalQty + (Number.isFinite(qty) ? qty : 0),
      lastUpdatedAt,
    });
  }

  return Array.from(summariesByZone.values())
    .map((summary) => ({
      ...summary,
      productCount: productsByZone.get(summary.zone)?.size ?? 0,
    }))
    .sort((a, b) => a.zone.localeCompare(b.zone, "es", { numeric: true, sensitivity: "base" }));
}

export default async function LocationZonesIndexPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const requestedSiteId = String(sp.site_id ?? "").trim();

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/locations/zones",
    permissionCode: PERMISSION_CODE,
  });

  const [{ data: employeeData }, { data: settingsData }, { data: employeeSitesData }] = await Promise.all([
    supabase.from("employees").select("site_id").eq("id", user.id).maybeSingle(),
    supabase.from("employee_settings").select("selected_site_id").eq("employee_id", user.id).maybeSingle(),
    supabase
      .from("employee_sites")
      .select("site_id,is_primary")
      .eq("employee_id", user.id)
      .eq("is_active", true)
      .order("is_primary", { ascending: false }),
  ]);

  const employee = employeeData as EmployeeRow | null;
  const settings = settingsData as EmployeeSettingsRow | null;
  const employeeSites = (employeeSitesData ?? []) as EmployeeSiteRow[];

  const allowedSiteIds = uniqueIds([
    ...employeeSites.map((row) => row.site_id),
    employee?.site_id,
    settings?.selected_site_id,
  ]);

  const { data: siteRowsData } = allowedSiteIds.length
    ? await supabase.from("sites").select("id,name").in("id", allowedSiteIds).order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  const sites = (siteRowsData ?? []) as SiteRow[];
  const siteIds = sites.map((site) => site.id);
  const preferredSiteId = requestedSiteId || String(settings?.selected_site_id ?? employeeSites[0]?.site_id ?? employee?.site_id ?? "").trim();
  const activeSiteId = preferredSiteId && siteIds.includes(preferredSiteId) ? preferredSiteId : siteIds[0] ?? "";
  const activeSite = sites.find((site) => site.id === activeSiteId) ?? null;

  const { data: locationRowsData } = activeSiteId
    ? await supabase
        .from("inventory_locations")
        .select("id,site_id,zone,code,description")
        .eq("site_id", activeSiteId)
        .eq("is_active", true)
        .order("zone", { ascending: true })
        .order("description", { ascending: true })
        .order("code", { ascending: true })
    : { data: [] as LocationRow[] };

  const locations = (locationRowsData ?? []) as LocationRow[];
  const locationIds = locations.map((location) => location.id).filter(Boolean);

  const { data: stockRowsData } = locationIds.length
    ? await supabase
        .from("inventory_stock_by_location")
        .select("location_id,product_id,current_qty,updated_at")
        .in("location_id", locationIds)
    : { data: [] as StockRow[] };

  const stockRows = (stockRowsData ?? []) as StockRow[];
  const zones = buildZoneSummaries(locations, stockRows);

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link href="/inventory/locations" className="ui-caption underline">
                Volver a áreas
              </Link>
              <h1 className="ui-h1">Zonas</h1>
              <p className="ui-body-muted">
                Selecciona una zona disponible de la sede activa. La vista operativa de zona necesita sede y zona para no abrir vacía.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {sites.map((site) => (
                <Link
                  key={site.id}
                  href={buildHref("/inventory/locations/zones", { site_id: site.id })}
                  className={
                    site.id === activeSiteId
                      ? "rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900"
                      : "rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-amber-300 hover:bg-amber-50"
                  }
                >
                  {site.name ?? site.id}
                </Link>
              ))}
            </div>
          </div>

          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Sede</div>
              <div className="ui-remission-kpi-value">{activeSite?.name ?? "-"}</div>
              <div className="ui-remission-kpi-note">Contexto actual del listado</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Zonas</div>
              <div className="ui-remission-kpi-value">{zones.length}</div>
              <div className="ui-remission-kpi-note">Con áreas activas configuradas</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Áreas</div>
              <div className="ui-remission-kpi-value">{locations.length}</div>
              <div className="ui-remission-kpi-note">LOC activos en la sede</div>
            </article>
          </div>
        </div>
      </section>

      {zones.length === 0 ? (
        <section className="rounded-[28px] border border-dashed border-[var(--ui-border)] bg-white p-6 text-sm text-[var(--ui-muted)]">
          Esta sede no tiene zonas activas configuradas. Crea áreas en el maestro de ubicaciones antes de abrir una vista por zona.
          <div className="mt-4">
            <Link href={buildHref("/inventory/locations", { site_id: activeSiteId })} className="ui-btn ui-btn--brand">
              Crear o revisar áreas
            </Link>
          </div>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {zones.map((zone) => (
            <article key={zone.zone} className="rounded-[28px] border border-[var(--ui-border)] bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="ui-caption">Zona</div>
                  <h2 className="mt-1 text-2xl font-bold text-[var(--ui-text)]">{zone.zone}</h2>
                  <p className="mt-1 text-sm text-[var(--ui-muted)]">
                    {zone.locationCount} áreas activas · {zone.productCount} productos con stock
                  </p>
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                  {formatQty(zone.totalQty)} qty
                </span>
              </div>

              <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3 text-xs text-[var(--ui-muted)]">
                Última actualización: <span className="font-semibold text-[var(--ui-text)]">{formatDateTime(zone.lastUpdatedAt)}</span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link
                  href={buildHref("/inventory/locations/zone", { site_id: activeSiteId, zone: zone.zone })}
                  className="ui-btn ui-btn--brand w-full"
                >
                  Abrir zona
                </Link>
                <Link
                  href={buildHref("/inventory/stock", { site_id: activeSiteId, view: "by_loc", zone: zone.zone })}
                  className="ui-btn ui-btn--ghost w-full"
                >
                  Ver stock
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
