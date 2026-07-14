import Link from "next/link";

import { CountLocationForm } from "@/features/inventory/count-initial/count-location-form";
import { requireAppAccess } from "@/lib/auth/guard";
import { normalizeUnitCode } from "@/lib/inventory/uom";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.counts";
const CHUNK_SIZE = 100;

type SearchParams = { site_id?: string; location_id?: string };
type EmployeeSiteRow = { site_id: string | null; is_primary: boolean | null };
type SiteRow = { id: string; name: string | null };
type LocRow = { id: string; code: string | null; zone: string | null; description: string | null };
type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_inventory_profiles?:
    | { measurement_mode?: string | null; track_inventory?: boolean | null }
    | Array<{ measurement_mode?: string | null; track_inventory?: boolean | null }>
    | null;
};
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
type PositionRow = {
  id: string;
  parent_position_id: string | null;
  code: string;
  name: string;
  sort_order: number | null;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function chunks<T>(values: T[], size = CHUNK_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function inventoryProfile(product: ProductRow) {
  const relation = product.product_inventory_profiles;
  return Array.isArray(relation) ? relation[0] : relation;
}

function shouldShowProfile(profile: ProductUomProfileRow, stockUnitCode: string) {
  const inputQty = Number(profile.qty_in_input_unit ?? 0);
  const stockQty = Number(profile.qty_in_stock_unit ?? 0);
  if (!profile.is_active || inputQty <= 0 || stockQty <= 0) return false;
  const inputUnit = normalizeUnitCode(profile.input_unit_code ?? "");
  const stockUnit = normalizeUnitCode(stockUnitCode);
  return !(inputUnit === stockUnit && inputQty === 1 && stockQty === 1);
}

async function loadProducts(supabase: SupabaseClient, productIds: string[]) {
  const rows: ProductRow[] = [];
  for (const productIdChunk of chunks(productIds)) {
    const { data, error } = await supabase
      .from("products")
      .select("id,name,sku,unit,stock_unit_code,product_inventory_profiles(track_inventory,measurement_mode)")
      .in("id", productIdChunk);
    if (error) return { rows: [], error };
    rows.push(...((data ?? []) as unknown as ProductRow[]));
  }
  return {
    rows: rows
      .filter((product) => inventoryProfile(product)?.track_inventory === true)
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
    error: null,
  };
}

async function loadProfiles(supabase: SupabaseClient, productIds: string[]) {
  const rows: ProductUomProfileRow[] = [];
  for (const productIdChunk of chunks(productIds)) {
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

export default async function InventoryCountInitialPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const sp = (await searchParams) ?? {};
  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/count-initial",
    permissionCode: PERMISSION,
  });

  const [{ data: employee }, { data: employeeSites }] = await Promise.all([
    supabase.from("employees").select("role").eq("id", user.id).maybeSingle(),
    supabase
      .from("employee_sites")
      .select("site_id,is_primary")
      .eq("employee_id", user.id)
      .eq("is_active", true)
      .order("is_primary", { ascending: false }),
  ]);

  const siteIds = ((employeeSites ?? []) as EmployeeSiteRow[])
    .map((row) => row.site_id)
    .filter((id): id is string => Boolean(id));
  const role = String((employee as { role?: string | null } | null)?.role ?? "").toLowerCase();
  const canUseAllSites = ["propietario", "gerente_general", "contador"].includes(role);
  const { data: sites } = canUseAllSites
    ? await supabase.from("sites").select("id,name").eq("is_active", true).order("name")
    : siteIds.length
      ? await supabase.from("sites").select("id,name").in("id", siteIds).eq("is_active", true).order("name")
      : { data: [] as SiteRow[] };

  const candidateSites = (sites ?? []) as SiteRow[];
  const candidateSiteIds = candidateSites.map((site) => site.id);
  const { data: inventoryCapabilities } = candidateSiteIds.length
    ? await supabase
        .from("site_operational_capabilities")
        .select("site_id")
        .in("site_id", candidateSiteIds)
        .eq("can_hold_inventory", true)
    : { data: [] as Array<{ site_id: string }> };
  const inventorySiteIds = new Set(
    (inventoryCapabilities ?? []).map((row) => String(row.site_id)).filter(Boolean)
  );
  const siteRows = candidateSites.filter((site) => inventorySiteIds.has(site.id));
  const siteId = String(sp.site_id ?? "").trim();
  const locationId = String(sp.location_id ?? "").trim();
  const selectedSite = siteRows.find((site) => site.id === siteId) ?? null;

  if (!selectedSite) {
    return (
      <div className="ui-scene w-full space-y-6">
        <section className="ui-remission-hero">
          <Link href="/inventory/stock" className="ui-caption underline">Volver a stock</Link>
          <h1 className="ui-h1 mt-2">Conteo de inventario</h1>
          <p className="ui-body-muted mt-2">Selecciona la sede donde vas a realizar el recorrido físico.</p>
        </section>
        <form method="get" className="ui-panel ui-remission-section space-y-4">
          <label className="flex max-w-md flex-col gap-1">
            <span className="ui-label">Sede</span>
            <select name="site_id" className="ui-input" required defaultValue="">
              <option value="">Selecciona una sede</option>
              {siteRows.map((site) => <option key={site.id} value={site.id}>{site.name ?? site.id}</option>)}
            </select>
          </label>
          <button className="ui-btn ui-btn--brand" type="submit">Continuar</button>
        </form>
      </div>
    );
  }

  const { data: locsData } = await supabase
    .from("inventory_locations")
    .select("id,code,zone,description")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .order("zone")
    .order("code");
  const locRows = (locsData ?? []) as LocRow[];
  const selectedLoc = locRows.find((loc) => loc.id === locationId) ?? null;

  if (!selectedLoc) {
    return (
      <div className="ui-scene w-full space-y-6">
        <section className="ui-remission-hero">
          <Link href="/inventory/count-initial" className="ui-caption underline">Cambiar sede</Link>
          <h1 className="ui-h1 mt-2">¿Dónde vas a contar?</h1>
          <p className="ui-body-muted mt-2">{selectedSite.name}. Elige una ubicación física antes de cargar productos.</p>
        </section>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {locRows.map((loc) => (
            <Link
              key={loc.id}
              href={`/inventory/count-initial?site_id=${encodeURIComponent(siteId)}&location_id=${encodeURIComponent(loc.id)}`}
              className="ui-panel ui-remission-section transition hover:-translate-y-0.5"
            >
              <div className="ui-caption">{loc.zone ?? "Sin zona"}</div>
              <div className="ui-h3 mt-1">{loc.description ?? loc.code ?? loc.id}</div>
              <div className="mt-2 font-mono text-xs text-[var(--ui-muted)]">{loc.code ?? "-"}</div>
              <div className="mt-4 text-sm font-semibold text-[var(--ui-brand)]">Abrir ubicación →</div>
            </Link>
          ))}
          {locRows.length === 0 ? <div className="ui-alert ui-alert--warn">Esta sede no tiene ubicaciones activas.</div> : null}
        </div>
      </div>
    );
  }

  const [{ data: locationStock }, { data: expectedCatalog }] = await Promise.all([
    supabase.from("inventory_stock_by_location").select("product_id").eq("location_id", locationId),
    supabase.from("inventory_location_product_catalog").select("product_id").eq("location_id", locationId).eq("is_active", true),
  ]);
  const productIds = Array.from(new Set([
    ...(locationStock ?? []).map((row) => String(row.product_id)),
    ...(expectedCatalog ?? []).map((row) => String(row.product_id)),
  ].filter(Boolean)));
  const { rows: products, error: productError } = productIds.length
    ? await loadProducts(supabase, productIds)
    : { rows: [] as ProductRow[], error: null };
  const profiles = products.length ? await loadProfiles(supabase, products.map((product) => product.id)) : [];

  const { data: positionsData } = await supabase
    .from("inventory_location_positions")
    .select("id,parent_position_id,code,name,sort_order")
    .eq("location_id", locationId)
    .eq("is_active", true)
    .order("sort_order")
    .order("code");
  const positions = (positionsData ?? []) as PositionRow[];
  const positionById = new Map(positions.map((position) => [position.id, position]));
  const internalPositions = positions.map((position) => {
    const path: string[] = [];
    const visited = new Set<string>();
    let current: PositionRow | undefined = position;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current.name || current.code);
      current = current.parent_position_id ? positionById.get(current.parent_position_id) : undefined;
    }
    return { id: position.id, label: path.join(" / "), selectedLabel: path.join(" / ") };
  });

  const locationLabel = selectedLoc.description ?? selectedLoc.code ?? locationId;
  const catalogHref = `/inventory/settings/locations/${encodeURIComponent(locationId)}/catalog`;

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={`/inventory/count-initial?site_id=${encodeURIComponent(siteId)}`} className="ui-caption underline">Cambiar ubicación</Link>
            <h1 className="ui-h1 mt-2">{locationLabel}</h1>
            <p className="ui-body-muted mt-2">{selectedSite.name} · Conteo ciego por ubicación física.</p>
          </div>
          <Link href={catalogHref} className="ui-btn ui-btn--ghost">Configurar productos del LOC</Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border px-3 py-1 text-xs font-semibold">{selectedLoc.code ?? selectedLoc.zone}</span>
          <span className="rounded-full border px-3 py-1 text-xs font-semibold">{products.length} productos</span>
          <span className="rounded-full border px-3 py-1 text-xs font-semibold">{(expectedCatalog ?? []).length} esperados</span>
        </div>
      </section>

      {productError ? <div className="ui-alert ui-alert--error">Error al cargar productos: {productError.message}</div> : null}
      {!productError && products.length === 0 ? (
        <div className="ui-alert ui-alert--warn flex flex-wrap items-center justify-between gap-3">
          <span>Este LOC todavía no tiene productos esperados ni historial de stock.</span>
          <Link href={catalogHref} className="ui-btn ui-btn--brand ui-btn--sm">Configurar catálogo inicial</Link>
        </div>
      ) : null}
      {products.length > 0 ? (
        <CountLocationForm
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
            sku: product.sku,
            unit: product.stock_unit_code ?? product.unit,
            stockUnitCode: product.stock_unit_code ?? product.unit,
            measurementMode: String(inventoryProfile(product)?.measurement_mode ?? "fixed_presentation"),
            profiles: profiles
              .filter((profile) => profile.product_id === product.id && shouldShowProfile(profile, product.stock_unit_code ?? product.unit ?? ""))
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
          siteName={selectedSite.name ?? siteId}
          locationId={locationId}
          locationLabel={locationLabel}
          positions={internalPositions}
        />
      ) : null}
    </div>
  );
}
