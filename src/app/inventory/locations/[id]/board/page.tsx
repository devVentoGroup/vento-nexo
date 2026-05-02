import Link from "next/link";
import { notFound } from "next/navigation";

import { KioskBoardStockView, type KioskBoardStockItem } from "@/components/vento/kiosk-board-stock-view";
import { LocationBoardAutoRefresh } from "@/features/inventory/locations/location-board-auto-refresh";
import { requireAppAccess } from "@/lib/auth/guard";
import { getCategoryPath, type InventoryCategoryRow } from "@/lib/inventory/categories";
import {
  formatOperationalStockParts,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

export const dynamic = "force-dynamic";

type Params = { id: string };
type SearchParams = { kiosk?: string; position_id?: string };

type PositionRow = {
  id: string;
  parent_position_id: string | null;
  code: string;
  name: string;
  kind: string;
  sort_order: number | null;
};

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
        category_id?: string | null;
        image_url?: string | null;
        catalog_image_url?: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        stock_unit_code: string | null;
        unit: string | null;
        category_id?: string | null;
        image_url?: string | null;
        catalog_image_url?: string | null;
      }>
    | null
    | undefined
) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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

function buildChildrenByParent(positions: PositionRow[]) {
  const childrenByParentId = new Map<string, PositionRow[]>();
  for (const position of positions) {
    if (!position.parent_position_id) continue;
    const current = childrenByParentId.get(position.parent_position_id) ?? [];
    current.push(position);
    childrenByParentId.set(position.parent_position_id, current);
  }
  return childrenByParentId;
}

function collectDescendantIds(positionId: string, childrenByParentId: Map<string, PositionRow[]>) {
  const ids = [positionId];
  const stack = [...(childrenByParentId.get(positionId) ?? [])];
  while (stack.length > 0) {
    const current = stack.shift();
    if (!current) continue;
    ids.push(current.id);
    stack.push(...(childrenByParentId.get(current.id) ?? []));
  }
  return ids;
}

function findRootPosition(position: PositionRow | null, positionsById: Map<string, PositionRow>) {
  let current = position;
  while (current?.parent_position_id) {
    const parent = positionsById.get(current.parent_position_id) ?? null;
    if (!parent) break;
    current = parent;
  }
  return current;
}

function positionKindLabel(position: PositionRow) {
  const kind = String(position.kind ?? "").toLowerCase();
  if (kind === "zone") return "Zona";
  if (kind === "level") return "Nivel";
  if (kind === "bin") return "Contenedor";
  if (kind === "section") return "Seccion";
  return "Estanteria";
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
  const positionId = String(sp.position_id ?? "").trim();

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

  const { data: positionsData } = await supabase
    .from("inventory_location_positions")
    .select("id,parent_position_id,code,name,kind,sort_order")
    .eq("location_id", id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  const positions = (positionsData ?? []) as PositionRow[];
  const positionsById = new Map(positions.map((position) => [position.id, position]));
  const childrenByParentId = buildChildrenByParent(positions);
  const topLevelPositions = positions.filter((position) => !position.parent_position_id);
  const selectedPosition = positionId ? positions.find((position) => position.id === positionId) ?? null : null;
  const selectedRootPosition = findRootPosition(selectedPosition, positionsById);
  const selectedPositionIds = selectedPosition
    ? collectDescendantIds(selectedPosition.id, childrenByParentId)
    : [];

  const { data: stockRowsData } = selectedPosition
    ? await supabase
        .from("inventory_stock_by_position")
        .select("product_id,current_qty,updated_at")
        .in("position_id", selectedPositionIds)
        .gt("current_qty", 0)
        .order("current_qty", { ascending: false })
    : await supabase
        .from("inventory_stock_by_location")
        .select(
          "product_id,current_qty,updated_at,products(id,name,stock_unit_code,unit,category_id,image_url,catalog_image_url)"
        )
        .eq("location_id", id)
        .gt("current_qty", 0)
        .order("current_qty", { ascending: false });

  const stockRowsRaw = (stockRowsData ?? []) as unknown as Array<{
    product_id: string;
    current_qty: number | null;
    updated_at: string | null;
    products?: {
      id: string;
      name: string | null;
      stock_unit_code: string | null;
      unit: string | null;
      category_id?: string | null;
      image_url?: string | null;
      catalog_image_url?: string | null;
    } | Array<{
      id: string;
      name: string | null;
      stock_unit_code: string | null;
      unit: string | null;
      category_id?: string | null;
      image_url?: string | null;
      catalog_image_url?: string | null;
    }> | null;
  }>;
  const aggregatedPositionRows = selectedPosition
    ? Array.from(
        stockRowsRaw.reduce((map, row) => {
          const current = map.get(row.product_id) ?? {
            product_id: row.product_id,
            current_qty: 0,
            updated_at: row.updated_at,
          };
          current.current_qty += Number(row.current_qty ?? 0);
          const currentUpdated = String(current.updated_at ?? "");
          const rowUpdated = String(row.updated_at ?? "");
          if (rowUpdated && (!currentUpdated || new Date(rowUpdated).getTime() > new Date(currentUpdated).getTime())) {
            current.updated_at = rowUpdated;
          }
          map.set(row.product_id, current);
          return map;
        }, new Map<string, { product_id: string; current_qty: number; updated_at: string | null }>())
      ).map(([, row]) => row)
    : stockRowsRaw;
  const selectedPositionProductIds = selectedPosition ? stockRowsRaw.map((row) => row.product_id) : [];
  const { data: selectedPositionProducts } =
    selectedPosition && selectedPositionProductIds.length > 0
      ? await supabase
          .from("products")
          .select("id,name,stock_unit_code,unit,category_id,image_url,catalog_image_url")
          .in("id", selectedPositionProductIds)
      : { data: [] as Array<{ id: string; name: string | null; stock_unit_code: string | null; unit: string | null; category_id?: string | null; image_url?: string | null; catalog_image_url?: string | null }> };
  const selectedPositionProductById = new Map((selectedPositionProducts ?? []).map((product) => [product.id, product]));

  const stockRows = selectedPosition
    ? aggregatedPositionRows.map((row) => ({
        ...row,
        products: selectedPositionProductById.get(row.product_id) ?? null,
      }))
    : stockRowsRaw.map((row) => ({
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
  const categoryIds = Array.from(
    new Set(
      stockRows
        .map((row) => String(row.products?.category_id ?? "").trim())
        .filter(Boolean)
    )
  );
  const { data: categoryRowsData } = categoryIds.length
    ? await supabase
        .from("product_categories")
        .select("id,name,parent_id,domain,site_id,is_active,applies_to_kinds")
        .in("id", categoryIds)
    : { data: [] as InventoryCategoryRow[] };
  const categoryRows = (categoryRowsData ?? []) as InventoryCategoryRow[];
  const categoryMap = new Map(categoryRows.map((row) => [row.id, row]));
  const stockItems: KioskBoardStockItem[] = stockRows.map((row) => {
    const product = row.products;
    const qty = Number(row.current_qty ?? 0);
    const unit = product?.stock_unit_code ?? product?.unit ?? "un";
    const categoryId = String(product?.category_id ?? "").trim();
    const categoryPath = getCategoryPath(categoryId, categoryMap);
    const categoryLabel = categoryPath.split(" / ").at(-1) || "Sin categoria";
    return {
      productId: row.product_id,
      name: product?.name ?? row.product_id,
      imageUrl: product?.image_url || product?.catalog_image_url || "",
      qty,
      unit,
      categoryId,
      categoryLabel,
      categoryPath,
      stockParts: formatOperationalStockParts({
        qty,
        profiles: uomProfiles,
        productId: row.product_id,
        fallbackUnit: unit,
      }),
    };
  });

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
  const kioskWithdrawHref = `/inventory/locations/${encodeURIComponent(location.id)}/kiosk-withdraw`;
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
                Volver al area
              </Link>
            ) : null}
            <div className="space-y-2">
              <div className="ui-caption">{isKiosk ? "Modo kiosco" : "Vista del area"}</div>
              <h1 className="ui-h1">{title}</h1>
              <p className="ui-body-muted">
                Vista rapida y visual de lo que hoy contiene esta area. Ideal para tablet o pantalla fija de consulta.
              </p>
            </div>
            {isKiosk ? (
              <div className="flex flex-wrap items-center gap-3">
                <Link href={kioskWithdrawHref} className="ui-btn ui-btn--brand">
                  Retirar insumo
                </Link>
                <LocationBoardAutoRefresh intervalSeconds={30} />
                <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-[var(--ui-muted)] shadow-sm">
                  Ultima actualizacion: <span className="font-semibold text-[var(--ui-text)]">{formatDateTime(lastUpdatedAt)}</span>
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
                  Ver stock tecnico
                </Link>
                <Link
                  href={`/inventory/locations/${encodeURIComponent(location.id)}/board?kiosk=1`}
                  className="ui-btn ui-btn--ghost"
                >
                  Abrir modo kiosco
                </Link>
                <Link href={kioskWithdrawHref} className="ui-btn ui-btn--ghost">
                  Retiro con PIN
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
              <div className="ui-remission-kpi-note">Activos en esta area</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Qty total</div>
              <div className="ui-remission-kpi-value">{formatQty(totalQty)}</div>
              <div className="ui-remission-kpi-note">Suma de cantidades visibles</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Vista</div>
              <div className="ui-remission-kpi-value">{isKiosk ? "Kiosco" : "Board"}</div>
              <div className="ui-remission-kpi-note">Visual y de consulta rapida</div>
            </article>
          </div>
        </div>
      </section>

      {positions.length > 0 ? (
        <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="ui-h3">Filtro interno</div>
              <div className="mt-1 ui-body-muted">
                La operacion sigue siendo por LOC. Estos filtros solo cambian la vista del board/quiosco.
              </div>
            </div>
            <Link
              href={`/inventory/locations/${encodeURIComponent(location.id)}/positions`}
              className="ui-btn ui-btn--ghost"
            >
              Administrar detalle
            </Link>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-muted)]">
                Zonas generales
              </div>
              <div className="flex flex-wrap gap-2">
            <Link
              href={`/inventory/locations/${encodeURIComponent(location.id)}/board${isKiosk ? "?kiosk=1" : ""}`}
              className={!selectedPosition ? "ui-chip ui-chip--brand" : "ui-chip"}
            >
              Todo el LOC
            </Link>
            {topLevelPositions.map((position) => (
              <Link
                key={position.id}
                href={`/inventory/locations/${encodeURIComponent(location.id)}/board?position_id=${encodeURIComponent(position.id)}${isKiosk ? "&kiosk=1" : ""}`}
                className={selectedRootPosition?.id === position.id ? "ui-chip ui-chip--brand" : "ui-chip"}
              >
                {position.name}
              </Link>
            ))}
              </div>
            </div>

            {selectedRootPosition && (childrenByParentId.get(selectedRootPosition.id) ?? []).length > 0 ? (
              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-muted)]">
                    {positionKindLabel(selectedRootPosition)} seleccionada
                  </div>
                  <div className="text-sm font-semibold text-[var(--ui-text)]">{selectedRootPosition.name}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/inventory/locations/${encodeURIComponent(location.id)}/board?position_id=${encodeURIComponent(selectedRootPosition.id)}${isKiosk ? "&kiosk=1" : ""}`}
                    className={selectedPosition?.id === selectedRootPosition.id ? "ui-chip ui-chip--brand" : "ui-chip"}
                  >
                    Todo {selectedRootPosition.name}
                  </Link>
                  {(childrenByParentId.get(selectedRootPosition.id) ?? []).map((position) => (
                    <Link
                      key={position.id}
                      href={`/inventory/locations/${encodeURIComponent(location.id)}/board?position_id=${encodeURIComponent(position.id)}${isKiosk ? "&kiosk=1" : ""}`}
                      className={selectedPosition?.id === position.id ? "ui-chip ui-chip--brand" : "ui-chip"}
                    >
                      {position.name}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {stockItems.length > 0 ? (
        <KioskBoardStockView items={stockItems} isKiosk={isKiosk} />
      ) : (
        <div className={`ui-panel ui-remission-section text-center ${isKiosk ? "min-h-[45vh] flex flex-col items-center justify-center" : ""}`}>
          <div className="ui-h3">Area sin contenido visible</div>
          <p className="mt-2 ui-body-muted">
            Todavia no hay stock positivo cargado en esta ubicacion.
          </p>
        </div>
      )}
    </div>
  );
}
