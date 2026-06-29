import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { formatHistoryDateTime } from "@/lib/formatters";
import { CatalogOptionalDetails } from "@/features/inventory/catalog/catalog-ui";
import { createClient } from "@/lib/supabase/server";
import { convertQuantity, createUnitMap, normalizeUnitCode } from "@/lib/inventory/uom";

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
type ProductUomProfileRow = {
  id: string;
  product_id: string;
  label: string | null;
  input_unit_code: string | null;
  qty_in_input_unit: number | null;
  qty_in_stock_unit: number | null;
  is_default: boolean | null;
  is_active: boolean | null;
  source: "manual" | "supplier_primary" | "recipe_portion" | null;
  usage_context: "general" | "purchase" | "remission" | null;
};
type ProductSupplierRow = {
  id: string;
  product_id: string;
  supplier_id: string | null;
  purchase_unit: string | null;
  purchase_unit_size: number | null;
  purchase_pack_qty: number | null;
  purchase_pack_unit_code: string | null;
  is_primary: boolean | null;
};
type SupplierRow = { id: string; name: string | null };
type UnitRow = {
  code: string;
  name: string;
  family: "volume" | "mass" | "count";
  factor_to_base: number;
  symbol: string | null;
  display_decimals: number | null;
  is_active: boolean;
};

const PRODUCT_PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 150;
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchProductRowsForInitialCount(
  supabase: SupabaseClient,
  productSiteIds: string[]
) {
  const rows: ProductRow[] = [];
  const hasProductSiteFilter = productSiteIds.length > 0;

  for (let from = 0; ; from += PRODUCT_PAGE_SIZE) {
    let query = supabase
      .from("products")
      .select("id,name,sku,unit,stock_unit_code,product_inventory_profiles(track_inventory)")
      .eq("product_inventory_profiles.track_inventory", true)
      .order("name", { ascending: true })
      .range(from, from + PRODUCT_PAGE_SIZE - 1);

    if (hasProductSiteFilter) {
      query = query.in("id", productSiteIds);
    }

    const { data, error } = await query;
    if (error) return { rows, error };

    const pageRows = (data ?? []) as unknown as ProductRow[];
    rows.push(...pageRows);
    if (pageRows.length < PRODUCT_PAGE_SIZE) return { rows, error: null };
  }
}

async function fetchProductProfilesForInitialCount(
  supabase: SupabaseClient,
  productIds: string[]
) {
  const rows: ProductUomProfileRow[] = [];

  for (const productIdChunk of chunkArray(productIds, IN_CHUNK_SIZE)) {
    const { data } = await supabase
      .from("product_uom_profiles")
      .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context")
      .in("product_id", productIdChunk)
      .eq("is_active", true)
      .order("is_default", { ascending: false });

    rows.push(...((data ?? []) as ProductUomProfileRow[]));
  }

  return rows;
}

async function fetchProductSuppliersForInitialCount(
  supabase: SupabaseClient,
  productIds: string[]
) {
  const rows: ProductSupplierRow[] = [];

  for (const productIdChunk of chunkArray(productIds, IN_CHUNK_SIZE)) {
    const { data } = await supabase
      .from("product_suppliers")
      .select("id,product_id,supplier_id,purchase_unit,purchase_unit_size,purchase_pack_qty,purchase_pack_unit_code,is_primary")
      .in("product_id", productIdChunk);

    rows.push(...((data ?? []) as unknown as ProductSupplierRow[]));
  }

  return rows;
}

async function fetchSupplierNameMap(
  supabase: SupabaseClient,
  supplierIds: string[]
) {
  const ids = Array.from(new Set(supplierIds.map((id) => id.trim()).filter(Boolean)));
  const map = new Map<string, string>();

  for (const supplierIdChunk of chunkArray(ids, IN_CHUNK_SIZE)) {
    const { data } = await supabase
      .from("suppliers")
      .select("id,name")
      .in("id", supplierIdChunk);

    for (const supplier of (data ?? []) as SupplierRow[]) {
      map.set(supplier.id, supplier.name ?? supplier.id);
    }
  }

  return map;
}

function shouldShowProfileInInitialCount(
  profile: ProductUomProfileRow,
  stockUnitCode: string
) {
  const usageContext = profile.usage_context ?? "general";
  const source = profile.source ?? "manual";

  if (usageContext !== "remission") return true;
  if (source !== "manual") return false;

  const inputUnitCode = normalizeUnitCode(profile.input_unit_code ?? "");
  const normalizedStockUnitCode = normalizeUnitCode(stockUnitCode);
  const qtyInInputUnit = Number(profile.qty_in_input_unit ?? 0);
  const qtyInStockUnit = Number(profile.qty_in_stock_unit ?? 0);

  const isSameAsBaseUnit =
    inputUnitCode === normalizedStockUnitCode &&
    qtyInInputUnit === 1 &&
    qtyInStockUnit === 1;

  return !isSameAsBaseUnit;
}

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

  const [{ data: employee }, { data: employeeSites }] = await Promise.all([
    supabase.from("employees").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("employee_sites")
      .select("site_id,is_primary")
      .eq("employee_id", user.id)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .limit(50),
  ]);

  const employeeSiteRows = (employeeSites ?? []) as EmployeeSiteRow[];
  const siteIds = employeeSiteRows
    .map((r) => r.site_id)
    .filter((id): id is string => Boolean(id));

  const role = String((employee as { role?: string | null } | null)?.role ?? "").toLowerCase();
  const canUseAllSites = ["propietario", "gerente_general", "contador"].includes(role);
  const { data: sites } =
    canUseAllSites
      ? await supabase
        .from("sites")
        .select("id,name")
        .eq("is_active", true)
        .order("name", { ascending: true })
      : siteIds.length > 0
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
      <div className="ui-scene w-full space-y-6">
        <section className="ui-remission-hero ui-fade-up">
          <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
            <div className="space-y-4">
              <div className="space-y-2">
                <Link href="/inventory/stock" className="ui-caption underline">Volver a stock</Link>
                <h1 className="ui-h1">Conteos</h1>
                <p className="ui-body-muted">
                  Registra cantidades contadas por sede, zona o area y confirma el ajuste del stock inicial.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                  Conteo manual
                </span>
                <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                  {siteRows.length} sedes
                </span>
              </div>
            </div>
            <div className="ui-remission-kpis sm:grid-cols-2 lg:grid-cols-1">
              <article className="ui-remission-kpi" data-tone="warm">
                <div className="ui-remission-kpi-label">Sedes</div>
                <div className="ui-remission-kpi-value">{siteRows.length}</div>
                <div className="ui-remission-kpi-note">Elige la sede para comenzar el conteo</div>
              </article>
              <article className="ui-remission-kpi" data-tone="cool">
                <div className="ui-remission-kpi-label">Impacto</div>
                <div className="ui-remission-kpi-value">Stock</div>
                <div className="ui-remission-kpi-note">El conteo actualiza cantidades y genera trazabilidad</div>
              </article>
            </div>
          </div>
        </section>

        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-1">
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
  type LocRow = { id: string; code: string | null; zone: string | null; description: string | null };
  const { data: locsData } = await supabase
    .from("inventory_locations")
    .select("id,code,zone,description")
    .eq("site_id", siteId)
    .eq("is_active", true)
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
  const { rows: productRows, error: productError } = await fetchProductRowsForInitialCount(supabase, productSiteIds);
  const productIdsForProfiles = productRows.map((product) => product.id);

  const [productProfiles, supplierRows, unitsData] =
    productIdsForProfiles.length > 0
      ? await Promise.all([
        fetchProductProfilesForInitialCount(supabase, productIdsForProfiles),
        fetchProductSuppliersForInitialCount(supabase, productIdsForProfiles),
        supabase
          .from("inventory_units")
          .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
          .eq("is_active", true),
      ])
      : [[], [], { data: [] as UnitRow[] }];
  const unitMap = createUnitMap((unitsData.data ?? []) as UnitRow[]);
  const productsById = new Map(productRows.map((product) => [product.id, product]));
  const supplierNameMap = await fetchSupplierNameMap(
    supabase,
    supplierRows
      .map((supplier) => supplier.supplier_id ?? "")
      .filter((id): id is string => Boolean(id))
  );
  const secondarySupplierProfiles: ProductUomProfileRow[] = [];

  for (const supplier of supplierRows) {
    if (supplier.is_primary === true) continue;
    const product = productsById.get(supplier.product_id);
    if (!product) continue;

    const stockUnitCode = normalizeUnitCode(product.stock_unit_code ?? product.unit ?? "un");
    const packUnitCode = normalizeUnitCode(supplier.purchase_pack_unit_code ?? stockUnitCode);
    const packQty = Number(supplier.purchase_pack_qty ?? supplier.purchase_unit_size ?? 0);
    if (!stockUnitCode || !packUnitCode || !Number.isFinite(packQty) || packQty <= 0) continue;

    let qtyInStockUnit = packQty;
    try {
      qtyInStockUnit = convertQuantity({
        quantity: packQty,
        fromUnitCode: packUnitCode,
        toUnitCode: stockUnitCode,
        unitMap,
      }).quantity;
    } catch {
      continue;
    }

    const supplierName = supplier.supplier_id ? supplierNameMap.get(supplier.supplier_id) ?? "" : "";
    const packLabel = String(supplier.purchase_unit ?? "").trim() || "Empaque";
    const packSizeLabel = `${packQty.toLocaleString("es-CO", {
      maximumFractionDigits: 3,
    })} ${packUnitCode}`;
    const label = supplierName
      ? `${packLabel} ${packSizeLabel} ${supplierName}`
      : `${packLabel} ${packSizeLabel}`;

    secondarySupplierProfiles.push({
      id: `supplier:${supplier.id}`,
      product_id: supplier.product_id,
      label,
      input_unit_code: packUnitCode,
      qty_in_input_unit: 1,
      qty_in_stock_unit: qtyInStockUnit,
      is_default: false,
      is_active: true,
      source: "manual",
      usage_context: "purchase",
    });
  }

  const allProductProfiles = [...productProfiles, ...secondarySupplierProfiles];

  type PositionRow = {
    id: string;
    parent_position_id: string | null;
    code: string;
    name: string;
    kind: string;
    sort_order: number | null;
  };
  const { data: positionsData } = locationIdParam
    ? await supabase
      .from("inventory_location_positions")
      .select("id,parent_position_id,code,name,kind,sort_order")
      .eq("location_id", locationIdParam)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true })
    : { data: [] as PositionRow[] };
  const positions = (positionsData ?? []) as PositionRow[];
  const positionById = new Map(positions.map((position) => [position.id, position]));

  const positionCollator = new Intl.Collator("es", {
    numeric: true,
    sensitivity: "base",
  });

  function getPositionName(position: PositionRow): string {
    return String(position.name || position.code || position.id).trim();
  }

  function getPositionPathLabel(position: PositionRow): string {
    const path: string[] = [];
    const visited = new Set<string>();
    let current: PositionRow | undefined = position;

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(getPositionName(current));
      current = current.parent_position_id ? positionById.get(current.parent_position_id) : undefined;
    }

    return path.join(" / ");
  }

  function getPositionSortValue(position: PositionRow): number {
    return typeof position.sort_order === "number" && Number.isFinite(position.sort_order)
      ? position.sort_order
      : Number.MAX_SAFE_INTEGER;
  }

  function comparePositions(a: PositionRow, b: PositionRow): number {
    const sortDiff = getPositionSortValue(a) - getPositionSortValue(b);
    if (sortDiff !== 0) return sortDiff;

    return positionCollator.compare(getPositionName(a), getPositionName(b));
  }

  const positionChildrenByParentId = new Map<string | null, PositionRow[]>();

  for (const position of positions) {
    const parentId =
      position.parent_position_id && positionById.has(position.parent_position_id)
        ? position.parent_position_id
        : null;

    const children = positionChildrenByParentId.get(parentId) ?? [];
    children.push(position);
    positionChildrenByParentId.set(parentId, children);
  }

  for (const children of positionChildrenByParentId.values()) {
    children.sort(comparePositions);
  }

  const internalPositionOptions: Array<{ id: string; label: string; selectedLabel: string }> = [];

  function pushPositionOptions(parentId: string | null, depth = 0) {
    const children = positionChildrenByParentId.get(parentId) ?? [];

    for (const position of children) {
      const childCount = positionChildrenByParentId.get(position.id)?.length ?? 0;
      const indent = depth > 0 ? "\u00A0".repeat(depth * 4) : "";
      const marker = depth > 0 ? "-> " : childCount > 0 ? "v " : "";
      const label = `${indent}${marker}${getPositionName(position)}`;

      internalPositionOptions.push({
        id: position.id,
        label,
        selectedLabel: getPositionPathLabel(position),
      });

      pushPositionOptions(position.id, depth + 1);
    }
  }

  pushPositionOptions(null);

  const siteName = siteNameMap.get(siteId) ?? siteId;
  const selectedLoc = locationIdParam ? locRows.find((l) => l.id === locationIdParam) : null;
  const countScopeLabel = selectedLoc
    ? `Area: ${selectedLoc.code ?? selectedLoc.zone ?? selectedLoc.id}`
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
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link href="/inventory/stock" className="ui-caption underline">Volver a stock</Link>
              <h1 className="ui-h1">Conteos</h1>
              <p className="ui-body-muted">
                Sede {siteName}. Captura cantidades contadas y confirma el ambito del conteo antes de guardar.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                {siteName}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {productRows.length} productos
              </span>
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                {countScopeLabel}
              </span>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Sede</div>
              <div className="ui-remission-kpi-value">{siteName}</div>
              <div className="ui-remission-kpi-note">Base del conteo actual</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Productos</div>
              <div className="ui-remission-kpi-value">{productRows.length}</div>
              <div className="ui-remission-kpi-note">Filtrados segun sede, zona o area</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Sesiones abiertas</div>
              <div className="ui-remission-kpi-value">{openSessions.length}</div>
              <div className="ui-remission-kpi-note">Conteos por zona o area pendientes de cierre</div>
            </article>
          </div>
        </div>
      </section>

      {openSessions.length > 0 ? (
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-1">
          <div className="ui-h3">Sesiones abiertas (por zona/area)</div>
          <p className="mt-1 ui-body-muted">
            Conteos por zona/area pendientes de cerrar. Cierra el conteo para calcular diferencias y aprobar ajustes.
          </p>
          <ul className="mt-4 space-y-2">
            {openSessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 ui-panel-soft px-4 py-3">
                <span className="ui-body">
                  {s.name ?? s.id.slice(0, 8)} - {s.scope_zone ? `Zona ${s.scope_zone}` : "Area"} - {formatHistoryDateTime(s.created_at)}
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
        <div className="ui-alert ui-alert--error">
          Error al cargar productos: {productError.message}
        </div>
      ) : productRows.length === 0 ? (
        <div className="ui-alert ui-alert--warn">
          No hay productos con inventario trackeado para esta sede. Revisa el catalogo y
          product_site_settings, o &quot;Inventario &gt; Stock&quot; para ver el filtro por sede.
        </div>
      ) : (
        <>
          {locRows.length > 0 ? (
            <CatalogOptionalDetails
              title="Filtros avanzados"
              summary="Ajusta por zona o area solo cuando no vayas a contar toda la sede."
              badge={zoneParam || locationIdParam ? "Activos" : "Opcional"}
              defaultOpen={Boolean(zoneParam || locationIdParam)}
            >
              <form method="get" action="/inventory/count-initial" className="mt-2 flex flex-wrap items-end gap-3">
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
                  <span className="ui-caption">Area (opcional)</span>
                  <select
                    name="location_id"
                    className="ui-input min-w-[200px] font-mono"
                    defaultValue={locationIdParam}
                  >
                    <option value="">-</option>
                    {locRows.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code ?? l.zone ?? l.id}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="ui-btn ui-btn--ghost">
                  Aplicar filtros
                </button>
              </form>
              {(zoneParam || locationIdParam) ? (
                <p className="mt-2 ui-caption">
                  Actual: <strong>{countScopeLabel}</strong>
                </p>
              ) : null}
            </CatalogOptionalDetails>
          ) : null}

          <CountInitialForm
            products={productRows.map((p) => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              unit: p.stock_unit_code ?? p.unit,
              stockUnitCode: p.stock_unit_code ?? p.unit,
              profiles: allProductProfiles
                .filter((profile) => {
                  const stockUnitCode = p.stock_unit_code ?? p.unit ?? "";
                  return (
                    profile.product_id === p.id &&
                    shouldShowProfileInInitialCount(profile, stockUnitCode)
                  );
                })
                .map((profile) => ({
                  id: profile.id,
                  product_id: profile.product_id,
                  label: profile.label ?? "",
                  input_unit_code: profile.input_unit_code ?? "",
                  qty_in_input_unit: Number(profile.qty_in_input_unit ?? 0),
                  qty_in_stock_unit: Number(profile.qty_in_stock_unit ?? 0),
                  is_default: Boolean(profile.is_default),
                  is_active: Boolean(profile.is_active),
                  source: profile.source ?? "manual",
                  usage_context: profile.usage_context ?? "general",
                })),
            }))}
            siteId={siteId}
            siteName={siteName}
            countScopeLabel={countScopeLabel}
            zoneOrLocNote={locationIdParam ? `loc_id:${locationIdParam}` : zoneParam ? `zone:${zoneParam}` : undefined}
            internalPositions={internalPositionOptions}
          />
        </>
      )}
    </div>
  );
}
