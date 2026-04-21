import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type Params = { id: string };

function formatQty(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(n);
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

export default async function LocationLandingPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<{ ok?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: `/inventory/locations/${id}`,
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("role,site_id")
    .eq("id", user.id)
    .maybeSingle();
  const { data: settings } = await supabase
    .from("employee_settings")
    .select("selected_site_id")
    .eq("employee_id", user.id)
    .maybeSingle();

  const activeSiteId = settings?.selected_site_id ?? employee?.site_id ?? "";
  const normalizedRole = String(employee?.role ?? "").toLowerCase();
  const isManagementRole = ["propietario", "gerente_general", "admin", "manager", "gerente"].includes(
    normalizedRole
  );

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
        .select("id,name,site_type")
        .eq("id", location.site_id)
        .maybeSingle()
    : { data: null };

  const site = (siteData ?? null) as { id: string; name: string | null; site_type: string | null } | null;
  const siteType = String(site?.site_type ?? "").toLowerCase();
  const mode = !isManagementRole && siteType === "satellite"
    ? "satellite"
    : !isManagementRole && siteType === "production_center"
      ? "center"
      : "general";

  const { data: stockRowsData } = await supabase
    .from("inventory_stock_by_location")
    .select(
      "product_id,current_qty,products(id,name,stock_unit_code,unit,image_url,catalog_image_url)"
    )
    .eq("location_id", id)
    .gt("current_qty", 0)
    .order("current_qty", { ascending: false })
    .limit(12);

  const stockRowsRaw = (stockRowsData ?? []) as unknown as Array<{
    product_id: string;
    current_qty: number | null;
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

  const totalQty = stockRows.reduce((sum, row) => sum + Number(row.current_qty ?? 0), 0);
  const title = buildLocTitle(location);
  const siteMismatch = Boolean(activeSiteId && location.site_id && activeSiteId !== location.site_id);
  const withdrawHref = `/inventory/withdraw?loc_id=${encodeURIComponent(location.id)}${
    location.site_id ? `&site_id=${encodeURIComponent(location.site_id)}` : ""
  }`;
  const boardHref = `/inventory/locations/${encodeURIComponent(location.id)}/board`;
  const zoneHref =
    location.site_id && location.zone
      ? `/inventory/locations/zone?site_id=${encodeURIComponent(location.site_id)}&zone=${encodeURIComponent(location.zone)}`
      : "";
  const okMsg = sp.ok === "withdraw" ? "Retiro registrado." : "";

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link href="/inventory/locations" className="ui-caption underline">
                Volver a ubicaciones
              </Link>
              <div className="ui-caption">
                {mode === "center" ? "Modo Centro" : mode === "satellite" ? "Modo satelite" : "Modo LOC"}
              </div>
              <h1 className="ui-h1">{title}</h1>
              <p className="ui-body-muted">
                Este landing sirve para bodega y producción. Retiro y remisión son flujos distintos: retirar sirve para
                sacar producto de este LOC hacia producción, consumo interno u otro uso controlado; la remisión se
                prepara y descuenta desde el flujo de despacho.
              </p>
            </div>
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
            <div className={`grid gap-3 ${zoneHref ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <Link href={withdrawHref} className="ui-btn ui-btn--brand h-16 w-full text-base font-semibold">
                Retirar de aqui
              </Link>
              <Link href={boardHref} className="ui-btn ui-btn--ghost h-16 w-full text-base font-semibold">
                Ver contenido
              </Link>
              {zoneHref ? (
                <Link href={zoneHref} className="ui-btn ui-btn--ghost h-16 w-full text-base font-semibold">
                  Ver zona
                </Link>
              ) : null}
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Productos</div>
              <div className="ui-remission-kpi-value">{stockRows.length}</div>
              <div className="ui-remission-kpi-note">Con stock visible en este LOC</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Qty visible</div>
              <div className="ui-remission-kpi-value">{formatQty(totalQty)}</div>
              <div className="ui-remission-kpi-note">Suma de cantidades visibles</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Accion</div>
              <div className="ui-remission-kpi-value">LOC</div>
              <div className="ui-remission-kpi-note">Bodega y producción entran desde aquí</div>
            </article>
          </div>
        </div>
      </section>

      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      {siteMismatch ? (
        <div className="ui-alert ui-alert--warn">
          Este LOC pertenece a otra sede distinta a tu sede activa. El botón de retiro ya abrirá la sede correcta.
        </div>
      ) : null}

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Vista rápida del LOC</div>
            <div className="mt-1 ui-body-muted">
              Un vistazo corto a lo que hoy tiene este espacio. Para ver todo el contenido, entra al board.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`${boardHref}?kiosk=1`} className="ui-btn ui-btn--ghost">
              Abrir board
            </Link>
            {zoneHref ? (
              <Link href={`${zoneHref}&kiosk=1`} className="ui-btn ui-btn--ghost">
                Abrir zona
              </Link>
            ) : null}
          </div>
        </div>

        {stockRows.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {stockRows.map((row) => {
              const product = row.products;
              const imageUrl = product?.image_url || product?.catalog_image_url || "";
              return (
                <article
                  key={row.product_id}
                  className="overflow-hidden rounded-3xl border border-[var(--ui-border)] bg-white shadow-sm"
                >
                  <div className="flex gap-3 p-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--ui-bg-soft)]">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imageUrl}
                          alt={product?.name ?? "Producto"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-semibold text-[var(--ui-muted)]">Sin foto</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm font-semibold text-[var(--ui-text)]">
                        {product?.name ?? row.product_id}
                      </div>
                      <div className="mt-2 text-sm text-[var(--ui-muted)]">
                        {formatQty(row.current_qty)} {product?.stock_unit_code ?? product?.unit ?? "un"}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="ui-panel-soft p-5 text-sm text-[var(--ui-muted)]">
            Este LOC no tiene stock visible en este momento.
          </div>
        )}
      </section>
    </div>
  );
}
