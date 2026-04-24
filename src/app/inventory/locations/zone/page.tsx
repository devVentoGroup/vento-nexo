import Link from "next/link";
import { notFound } from "next/navigation";

import { LocationBoardAutoRefresh } from "@/features/inventory/locations/location-board-auto-refresh";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type SearchParams = {
  site_id?: string;
  zone?: string;
  kiosk?: string;
};

function formatQty(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(n);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function normalizeProductRelation(
  value:
    | {
        id: string;
        name: string | null;
        stock_unit_code: string | null;
        unit: string | null;
        image_url?: string | null;
        catalog_image_url?: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        stock_unit_code: string | null;
        unit: string | null;
        image_url?: string | null;
        catalog_image_url?: string | null;
      }>
    | null
    | undefined
) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toneForQty(value: number) {
  if (value <= 0) return "border-slate-200 bg-slate-100 text-slate-700";
  if (value <= 3) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

export default async function LocationZoneBoardPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const siteId = String(sp.site_id ?? "").trim();
  const zone = String(sp.zone ?? "").trim();
  const isKiosk = String(sp.kiosk ?? "").trim() === "1";

  const { supabase } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/locations/zone",
  });

  if (!siteId || !zone) notFound();

  const { data: siteData } = await supabase
    .from("sites")
    .select("id,name")
    .eq("id", siteId)
    .maybeSingle();
  const site = (siteData ?? null) as { id: string; name: string | null } | null;
  if (!site) notFound();

  const { data: locationRowsData } = await supabase
    .from("inventory_locations")
    .select("id,code,zone,description,site_id")
    .eq("site_id", siteId)
    .eq("zone", zone)
    .eq("is_active", true)
    .order("description", { ascending: true })
    .order("code", { ascending: true });

  const locations = (locationRowsData ?? []) as Array<{
    id: string;
    code: string | null;
    zone: string | null;
    description: string | null;
    site_id: string | null;
  }>;
  if (locations.length === 0) notFound();

  const locationIds = locations.map((loc) => loc.id);
  const { data: stockRowsData } = locationIds.length
    ? await supabase
        .from("inventory_stock_by_location")
        .select(
          "location_id,product_id,current_qty,updated_at,products(id,name,stock_unit_code,unit,image_url,catalog_image_url)"
        )
        .in("location_id", locationIds)
        .gt("current_qty", 0)
        .order("current_qty", { ascending: false })
    : { data: [] };

  const stockRowsRaw = (stockRowsData ?? []) as unknown as Array<{
    location_id: string;
    product_id: string;
    current_qty: number | null;
    updated_at: string | null;
    products:
      | {
          id: string;
          name: string | null;
          stock_unit_code: string | null;
          unit: string | null;
          image_url?: string | null;
          catalog_image_url?: string | null;
        }
      | Array<{
          id: string;
          name: string | null;
          stock_unit_code: string | null;
          unit: string | null;
          image_url?: string | null;
          catalog_image_url?: string | null;
        }>
      | null;
  }>;
  const stockRows = stockRowsRaw.map((row) => ({
    ...row,
    products: normalizeProductRelation(row.products),
  }));

  const rowsByLocation = new Map<string, typeof stockRows>();
  for (const locationId of locationIds) rowsByLocation.set(locationId, []);
  for (const row of stockRows) {
    const current = rowsByLocation.get(row.location_id) ?? [];
    current.push(row);
    rowsByLocation.set(row.location_id, current);
  }

  const zoneTotalQty = stockRows.reduce((sum, row) => sum + Number(row.current_qty ?? 0), 0);
  const zoneProductCount = new Set(stockRows.map((row) => row.product_id)).size;
  const lastUpdatedAt = stockRows.reduce<string | null>((latest, row) => {
    const current = String(row.updated_at ?? "").trim();
    if (!current) return latest;
    if (!latest) return current;
    return new Date(current).getTime() > new Date(latest).getTime() ? current : latest;
  }, null);

  return (
    <div className={`ui-scene w-full ${isKiosk ? "min-h-screen space-y-4 px-4 py-5" : "space-y-6"}`}>
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            {!isKiosk ? (
              <Link href="/inventory/locations" className="ui-caption underline">
                Volver a áreas
              </Link>
            ) : null}
            <div className="space-y-2">
              <div className="ui-caption">{isKiosk ? "Zona kiosco" : "Vista de zona"}</div>
              <h1 className="ui-h1">Zona {zone}</h1>
              <p className="ui-body-muted">
                Vista fija por zona para revisar rápidamente qué áreas tienen contenido y qué productos destacan en cada una.
              </p>
            </div>
            {isKiosk ? (
              <div className="flex flex-wrap items-center gap-3">
                <LocationBoardAutoRefresh intervalSeconds={30} />
                <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-[var(--ui-muted)] shadow-sm">
                  Ultima actualización: <span className="font-semibold text-[var(--ui-text)]">{formatDateTime(lastUpdatedAt)}</span>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                {site.name ?? site.id}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {locations.length} áreas
              </span>
            </div>
            {!isKiosk ? (
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/inventory/stock?site_id=${encodeURIComponent(siteId)}&view=by_loc&zone=${encodeURIComponent(zone)}`}
                  className="ui-btn ui-btn--brand"
                >
                  Ver stock técnico por zona
                </Link>
                <Link
                  href={`/inventory/locations/zone?site_id=${encodeURIComponent(siteId)}&zone=${encodeURIComponent(zone)}&kiosk=1`}
                  className="ui-btn ui-btn--ghost"
                >
                  Abrir modo kiosco
                </Link>
              </div>
            ) : null}
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Áreas</div>
              <div className="ui-remission-kpi-value">{locations.length}</div>
              <div className="ui-remission-kpi-note">Activos en esta zona</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Productos</div>
              <div className="ui-remission-kpi-value">{zoneProductCount}</div>
              <div className="ui-remission-kpi-note">Visibles entre todas las áreas</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Qty total</div>
              <div className="ui-remission-kpi-value">{formatQty(zoneTotalQty)}</div>
              <div className="ui-remission-kpi-note">Suma visible en la zona</div>
            </article>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        {locations.map((location) => {
          const rows = rowsByLocation.get(location.id) ?? [];
          const totalQty = rows.reduce((sum, row) => sum + Number(row.current_qty ?? 0), 0);
          const topRows = rows.slice(0, 6);
          const locLabel =
            String(location.description ?? "").trim() ||
            String(location.code ?? "").trim() ||
            location.id;

          return (
            <article
              key={location.id}
              className="overflow-hidden rounded-[28px] border border-[var(--ui-border)] bg-white shadow-sm"
            >
              <div className="border-b border-[var(--ui-border)] bg-[linear-gradient(135deg,rgba(245,158,11,0.12)_0%,rgba(255,255,255,1)_100%)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-lg font-semibold text-[var(--ui-text)]">{locLabel}</div>
                    <div className="text-sm text-[var(--ui-muted)]">
                      {location.code ?? location.id}
                    </div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneForQty(totalQty)}`}>
                    {rows.length > 0 ? "Con stock" : "Vacío"}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-sm text-[var(--ui-muted)]">Qty total</div>
                  <div className="text-2xl font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
                    {formatQty(totalQty)}
                  </div>
                </div>
              </div>
              <div className="space-y-3 p-4">
                {topRows.length > 0 ? (
                  topRows.map((row) => {
                    const product = row.products;
                    return (
                      <div key={`${location.id}-${row.product_id}`} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="line-clamp-1 text-sm font-semibold text-[var(--ui-text)]">
                            {product?.name ?? row.product_id}
                          </div>
                          <div className="text-xs text-[var(--ui-muted)]">
                            {product?.stock_unit_code ?? product?.unit ?? "un"}
                          </div>
                        </div>
                        <div className="text-right text-sm font-semibold text-[var(--ui-text)]">
                          {formatQty(row.current_qty)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-[var(--ui-muted)]">Sin contenido visible en esta área.</div>
                )}
                <div className="pt-2">
                  <Link
                    href={`/inventory/locations/${encodeURIComponent(location.id)}/board${isKiosk ? "?kiosk=1" : ""}`}
                    className="ui-btn ui-btn--ghost w-full"
                  >
                    Ver área
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
