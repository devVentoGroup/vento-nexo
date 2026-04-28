import Link from "next/link";
import { notFound } from "next/navigation";

import { LocationBoardAutoRefresh } from "@/features/inventory/locations/location-board-auto-refresh";
import { requireAppAccess } from "@/lib/auth/guard";
import {
  selectProductUomProfileForContext,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

export const dynamic = "force-dynamic";

type Params = { id: string };
type SearchParams = { kiosk?: string };

function formatQty(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(n);
}

function formatPurchaseQty(params: {
  qty: number;
  profile: ProductUomProfile | null;
  fallbackUnit: string;
}) {
  const factor =
    params.profile &&
    Number(params.profile.qty_in_input_unit) > 0 &&
    Number(params.profile.qty_in_stock_unit) > 0
      ? Number(params.profile.qty_in_stock_unit) / Number(params.profile.qty_in_input_unit)
      : 0;
  const label = String(params.profile?.label || params.profile?.input_unit_code || "").trim();
  if (!label || !Number.isFinite(factor) || factor <= 0) {
    return `${formatQty(params.qty)} ${params.fallbackUnit}`;
  }
  return `${formatQty(params.qty / factor)} ${label}`;
}

function buildLocTitle(loc: {
  description?: string | null;
  zone?: string | null;
  code?: string | null;
  id: string;
}) {
  const description = String(loc.description ?? "").trim();
  const zone = String(loc.zone ?? "").trim();
  const code = String(loc.code ?? "").trim();
  return description || zone || code || loc.id;
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default async function LocationBoardPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const isKiosk = String(sp.kiosk ?? "").trim() === "1";

  const { supabase } = await requireAppAccess({
    appId: "nexo",
    returnTo: `/inventory/locations/${id}/board`,
  });

  const { data: locationData } = await supabase
    .from("inventory_locations")
    .select("id,code,zone,description,site_id")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  const location = (locationData ?? null) as {
    id: string;
    code: string | null;
    zone: string | null;
    description: string | null;
    site_id: string | null;
  } | null;

  if (!location) notFound();

  const { data: siteData } = location.site_id
    ? await supabase
        .from("sites")
        .select("id,name")
        .eq("id", location.site_id)
        .maybeSingle()
    : { data: null };

  const site = (siteData ?? null) as { id: string; name: string | null } | null;

  const { data: stockRowsData } = await supabase
    .from("inventory_stock_by_location")
    .select(
      "product_id,current_qty,updated_at,products(id,name,stock_unit_code,unit,image_url,catalog_image_url)"
    )
    .eq("location_id", id)
    .gt("current_qty", 0)
    .order("current_qty", { ascending: false });

  const stockRowsRaw = (stockRowsData ?? []) as unknown as Array<{
    product_id: string;
    current_qty: number | null;
    updated_at: string | null;
    products: {
      id: string;
      name: string | null;
      stock_unit_code: string | null;
      unit: string | null;
      image_url?: string | null;
      catalog_image_url?: string | null;
    } | Array<{
      id: string;
      name: string | null;
      stock_unit_code: string | null;
      unit: string | null;
      image_url?: string | null;
      catalog_image_url?: string | null;
    }> | null;
  }>;
  const stockRows = stockRowsRaw.map((row) => ({
    ...row,
    products: normalizeProductRelation(row.products),
  }));
  const productIds = stockRows.map((row) => row.product_id);
  const { data: uomProfilesData } = productIds.length
    ? await supabase
        .from("product_uom_profiles")
        .select(
          "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
        )
        .in("product_id", productIds)
        .eq("is_active", true)
    : { data: [] as ProductUomProfile[] };
  const uomProfiles = (uomProfilesData ?? []) as ProductUomProfile[];

  const title = buildLocTitle(location);
  const totalQty = stockRows.reduce((sum, row) => sum + Number(row.current_qty ?? 0), 0);
  const lastUpdatedAt = stockRows.reduce<string | null>((latest, row) => {
    const current = String(row.updated_at ?? "").trim();
    if (!current) return latest;
    if (!latest) return current;
    return new Date(current).getTime() > new Date(latest).getTime() ? current : latest;
  }, null);
  const withdrawHref = `/inventory/withdraw?loc_id=${encodeURIComponent(location.id)}${
    location.site_id ? `&site_id=${encodeURIComponent(location.site_id)}` : ""
  }`;
  const zoneHref =
    location.site_id && location.zone
      ? `/inventory/locations/zone?site_id=${encodeURIComponent(location.site_id)}&zone=${encodeURIComponent(location.zone)}`
      : "";

  return (
    <div className={`ui-scene w-full ${isKiosk ? "min-h-screen space-y-4 px-4 py-5" : "space-y-6"}`}>
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            {!isKiosk ? (
              <Link href={`/inventory/locations/${encodeURIComponent(location.id)}`} className="ui-caption underline">
                Volver al área
              </Link>
            ) : null}
            <div className="space-y-2">
              <div className="ui-caption">{isKiosk ? "Modo kiosco" : "Vista del área"}</div>
              <h1 className="ui-h1">{title}</h1>
              <p className="ui-body-muted">
                Vista rápida y visual de lo que hoy contiene esta área. Ideal para tablet o pantalla fija de consulta.
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
              {site?.name ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                  {site.name}
                </span>
              ) : null}
              {location.zone ? (
                <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                  Zona {location.zone}
                </span>
              ) : null}
              {location.code ? (
                <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                  {location.code}
                </span>
              ) : null}
            </div>
            {!isKiosk ? (
              <div className="flex flex-wrap gap-3">
                <Link href={withdrawHref} className="ui-btn ui-btn--brand">
                  Registrar salida
                </Link>
                <Link
                  href={`/inventory/stock?site_id=${encodeURIComponent(location.site_id ?? "")}&view=by_loc&location_id=${encodeURIComponent(location.id)}`}
                  className="ui-btn ui-btn--ghost"
                >
                  Ver stock técnico
                </Link>
                <Link
                  href={`/inventory/locations/${encodeURIComponent(location.id)}/board?kiosk=1`}
                  className="ui-btn ui-btn--ghost"
                >
                  Abrir modo kiosco
                </Link>
                {zoneHref ? (
                  <Link href={zoneHref} className="ui-btn ui-btn--ghost">
                    Ver zona
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Productos</div>
              <div className="ui-remission-kpi-value">{stockRows.length}</div>
              <div className="ui-remission-kpi-note">Activos en esta área</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Qty total</div>
              <div className="ui-remission-kpi-value">{formatQty(totalQty)}</div>
              <div className="ui-remission-kpi-note">Suma de cantidades visibles</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Vista</div>
              <div className="ui-remission-kpi-value">{isKiosk ? "Kiosco" : "Board"}</div>
              <div className="ui-remission-kpi-note">Visual y de consulta rápida</div>
            </article>
          </div>
        </div>
      </section>

      {stockRows.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {stockRows.map((row) => {
            const product = row.products;
            const imageUrl = product?.image_url || product?.catalog_image_url || "";
            const qty = Number(row.current_qty ?? 0);
            const unit = product?.stock_unit_code ?? product?.unit ?? "un";
            const purchaseProfile = selectProductUomProfileForContext({
              profiles: uomProfiles,
              productId: row.product_id,
              context: "purchase",
            });
            const purchaseQtyLabel = formatPurchaseQty({
              qty,
              profile: purchaseProfile,
              fallbackUnit: unit,
            });
            return (
              <article
                key={row.product_id}
                className="overflow-hidden rounded-[28px] border border-[var(--ui-border)] bg-white shadow-sm"
              >
                <div className="aspect-[4/3] w-full bg-[linear-gradient(135deg,rgba(245,158,11,0.14)_0%,rgba(255,255,255,1)_100%)]">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt={product?.name ?? "Producto"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm font-semibold text-[var(--ui-muted)]">
                      Sin foto
                    </div>
                  )}
                </div>
                <div className="space-y-3 p-4">
                  <div className="line-clamp-2 text-base font-semibold text-[var(--ui-text)]">
                    {product?.name ?? row.product_id}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-[var(--ui-muted)]">
                      {unit}
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneForQty(qty)}`}>
                      {qty <= 3 ? "Bajo" : "Disponible"}
                    </span>
                  </div>
                  <div className="text-3xl font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
                    {purchaseQtyLabel}
                  </div>
                  {purchaseProfile ? (
                    <div className="text-sm text-[var(--ui-muted)]">
                      Base: {formatQty(qty)} {unit}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <div className={`ui-panel ui-remission-section text-center ${isKiosk ? "min-h-[45vh] flex flex-col items-center justify-center" : ""}`}>
          <div className="ui-h3">Área sin contenido visible</div>
          <p className="mt-2 ui-body-muted">
            Todavía no hay stock positivo cargado en esta ubicación.
          </p>
        </div>
      )}
    </div>
  );
}
