import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";

import { AssetBulkCreateForm } from "./asset-bulk-create-form";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type SearchParams = {
  error?: string;
  created?: string;
};

type ProductInventoryProfileRef = {
  inventory_kind: string | null;
} | null;

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  product_inventory_profiles?: ProductInventoryProfileRef;
};

type SiteRow = {
  id: string;
  name: string | null;
};

type AreaRow = {
  id: string;
  site_id: string;
  name: string | null;
  kind: string | null;
};

type LocationRow = {
  id: string;
  site_id: string;
  area_id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type BulkAssetRow = {
  product_id: string;
  name: string;
  site_id: string;
  area_id: string | null;
  location_id: string | null;
  expected_qty: number;
  unit_code: string;
  condition_status: string;
  notes: string | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readInventoryKind(product?: {
  product_inventory_profiles?:
    | ProductInventoryProfileRef
    | Array<{ inventory_kind: string | null }>;
} | null) {
  const profileRef = product?.product_inventory_profiles ?? null;
  const profile = Array.isArray(profileRef) ? profileRef[0] ?? null : profileRef;
  return String(profile?.inventory_kind ?? "").trim().toLowerCase();
}

function normalizeCodePart(value: string | null | undefined, fallback: string) {
  const raw = String(value ?? "").trim().toUpperCase();
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);

  return normalized || fallback;
}

function generatedCode(prefix: string, value: string | null | undefined, index: number) {
  const safePart = normalizeCodePart(value, "ACT");
  const suffix = `${Date.now().toString(36).toUpperCase()}-${index + 1}`;
  return `${prefix}-${safePart}-${suffix}`;
}

function buildReturn(error?: string, created?: number) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (created != null) params.set("created", String(created));
  const qs = params.toString();
  return qs ? `/inventory/assets/quick?${qs}` : "/inventory/assets/quick";
}

function parseRows(value: string): BulkAssetRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item): BulkAssetRow | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const qty = Number(row.expected_qty);
      const condition = String(row.condition_status ?? "bueno").trim();

      if (!Number.isFinite(qty) || qty < 0) return null;
      if (!["nuevo", "bueno", "regular", "malo", "critico"].includes(condition)) return null;

      return {
        product_id: String(row.product_id ?? "").trim(),
        name: String(row.name ?? "").trim(),
        site_id: String(row.site_id ?? "").trim(),
        area_id: row.area_id ? String(row.area_id).trim() : null,
        location_id: row.location_id ? String(row.location_id).trim() : null,
        expected_qty: qty,
        unit_code: String(row.unit_code ?? "un").trim() || "un",
        condition_status: condition,
        notes: row.notes ? String(row.notes).trim() : null,
      };
    })
    .filter((row): row is BulkAssetRow => Boolean(row?.product_id && row.name && row.site_id));
}

async function createBulkAssetGroups(formData: FormData) {
  "use server";

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/assets/quick",
    permissionCode: PERMISSION,
  });

  const rows = parseRows(asText(formData.get("rows_json"))).slice(0, 80);
  if (rows.length === 0) {
    redirect(buildReturn("Agrega al menos una fila completa con tipo, nombre, sede y cantidad."));
  }

  const productIds = Array.from(new Set(rows.map((row) => row.product_id)));
  const siteIds = Array.from(new Set(rows.map((row) => row.site_id)));
  const areaIds = Array.from(new Set(rows.map((row) => row.area_id).filter((value): value is string => Boolean(value))));
  const locationIds = Array.from(new Set(rows.map((row) => row.location_id).filter((value): value is string => Boolean(value))));

  const [productsRes, sitesRes, areasRes, locationsRes] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,sku,product_type,product_inventory_profiles!inner(inventory_kind)")
      .in("id", productIds)
      .eq("product_type", "insumo")
      .eq("product_inventory_profiles.inventory_kind", "asset"),
    supabase.from("sites").select("id").in("id", siteIds).eq("is_active", true),
    areaIds.length ? supabase.from("areas").select("id,site_id").in("id", areaIds).eq("is_active", true) : { data: [] },
    locationIds.length
      ? supabase.from("inventory_locations").select("id,site_id,area_id").in("id", locationIds).eq("is_active", true)
      : { data: [] },
  ]);

  if (productsRes.error) redirect(buildReturn(productsRes.error.message));
  if (sitesRes.error) redirect(buildReturn(sitesRes.error.message));
  if ("error" in areasRes && areasRes.error) redirect(buildReturn(areasRes.error.message));
  if ("error" in locationsRes && locationsRes.error) redirect(buildReturn(locationsRes.error.message));

  const products = (productsRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    sku: string | null;
    product_inventory_profiles?: ProductInventoryProfileRef | Array<{ inventory_kind: string | null }>;
  }>;
  const productById = new Map(products.filter((product) => readInventoryKind(product) === "asset").map((product) => [product.id, product]));
  const siteIdsFound = new Set(((sitesRes.data ?? []) as Array<{ id: string }>).map((site) => site.id));
  const areaById = new Map(((areasRes.data ?? []) as Array<{ id: string; site_id: string }>).map((area) => [area.id, area]));
  const locationById = new Map(((locationsRes.data ?? []) as Array<{ id: string; site_id: string; area_id: string }>).map((location) => [location.id, location]));

  for (const row of rows) {
    if (!productById.has(row.product_id)) {
      redirect(buildReturn(`El tipo de activo "${row.name}" no existe o no esta marcado como activo.`));
    }
    if (!siteIdsFound.has(row.site_id)) {
      redirect(buildReturn(`La sede de "${row.name}" no existe o esta inactiva.`));
    }
    if (row.area_id) {
      const area = areaById.get(row.area_id);
      if (!area || area.site_id !== row.site_id) {
        redirect(buildReturn(`El area de "${row.name}" no pertenece a la sede elegida.`));
      }
    }
    if (row.location_id) {
      const location = locationById.get(row.location_id);
      if (!location || location.site_id !== row.site_id) {
        redirect(buildReturn(`La ubicación de "${row.name}" no pertenece a la sede elegida.`));
      }
      if (row.area_id && location.area_id !== row.area_id) {
        redirect(buildReturn(`La ubicación de "${row.name}" no pertenece al área elegida.`));
      }
    }
  }

  const inserts = rows.map((row, index) => {
    const product = productById.get(row.product_id);
    return {
      product_id: row.product_id,
      group_code: generatedCode("CNT", product?.sku || row.name, index),
      name: row.name,
      expected_qty: row.expected_qty,
      unit_code: row.unit_code,
      site_id: row.site_id,
      area_id: row.area_id,
      location_id: row.location_id,
      condition_status: row.condition_status,
      lifecycle_status: "activo",
      main_image_url: null,
      notes: row.notes,
      created_by: user.id,
      updated_by: user.id,
    };
  });

  const { data: inserted, error } = await supabase
    .from("asset_groups")
    .insert(inserts)
    .select("id,expected_qty,site_id,area_id,location_id");

  if (error) redirect(buildReturn(error.message || "No se pudieron crear los activos por cantidad."));

  const movements = ((inserted ?? []) as Array<{
    id: string;
    expected_qty: number | null;
    site_id: string | null;
    area_id: string | null;
    location_id: string | null;
  }>).map((group) => ({
    asset_group_id: group.id,
    movement_type: "initial_location",
    quantity: Number(group.expected_qty ?? 0),
    to_site_id: group.site_id,
    to_area_id: group.area_id,
    to_location_id: group.location_id,
    to_location_position_id: null,
    responsible_employee_id: null,
    notes: "Ubicación inicial desde carga rápida de activos.",
    created_by: user.id,
  }));

  if (movements.length > 0) {
    await supabase.from("asset_movements").insert(movements);
  }

  revalidatePath("/inventory/assets");
  revalidatePath("/inventory/assets/quick");
  redirect(`/inventory/assets?view=groups&created=${rows.length}`);
}

export default async function AssetQuickCreatePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = String(sp.error ?? "").trim();
  const created = String(sp.created ?? "").trim();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/assets/quick",
    permissionCode: PERMISSION,
  });

  const [productsRes, sitesRes, areasRes, locationsRes] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,sku,product_inventory_profiles!inner(inventory_kind)")
      .eq("product_type", "insumo")
      .eq("product_inventory_profiles.inventory_kind", "asset")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(1000),
    supabase
      .from("sites")
      .select("id,name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("areas")
      .select("id,site_id,name,kind")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("inventory_locations")
      .select("id,site_id,area_id,code,zone,description")
      .eq("is_active", true)
      .order("code", { ascending: true }),
  ]);

  const products = ((productsRes.data ?? []) as unknown as Array<
    Omit<ProductRow, "product_inventory_profiles"> & {
      product_inventory_profiles?: ProductInventoryProfileRef | Array<{ inventory_kind: string | null }>;
    }
  >)
    .filter((product) => readInventoryKind(product) === "asset")
    .map((product) => {
      const profileRef = product.product_inventory_profiles ?? null;
      const profile = Array.isArray(profileRef) ? profileRef[0] ?? null : profileRef;
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        product_inventory_profiles: profile,
      } satisfies ProductRow;
    });
  const sites = (sitesRes.data ?? []) as SiteRow[];
  const areas = (areasRes.data ?? []) as AreaRow[];
  const locations = (locationsRes.data ?? []) as LocationRow[];

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_0.8fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link
                href="/inventory/assets"
                className="ui-btn ui-btn--ghost inline-flex h-12 items-center px-5 text-base font-semibold"
              >
                Volver al inventario de activos
              </Link>
              <h1 className="ui-h1">Carga rapida de activos</h1>
              <p className="ui-body-muted">
                Crea en una sola tabla los activos que se cuentan por cantidad: moldes, bandejas, sillas, canastillas y menaje.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="ui-chip ui-chip--brand">{products.length} tipos disponibles</span>
              <span className="ui-chip">Sin serial individual</span>
              <span className="ui-chip">Listo para conteo</span>
            </div>
          </div>

          <div className="ui-panel bg-white/90">
            <h2 className="ui-h2">Regla simple</h2>
            <p className="mt-2 ui-body-muted">
              Si el trabajador cuenta varias unidades iguales, cargalo aqui. Si el activo tiene serial, placa o mantenimiento propio, usa registro avanzado.
            </p>
            <div className="mt-4">
              <Link href="/inventory/assets/new" className="ui-btn ui-btn--ghost w-full">
                Registro avanzado
              </Link>
            </div>
          </div>
        </div>
      </section>

      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {created ? <div className="ui-alert ui-alert--success">Se crearon {created} activos por cantidad.</div> : null}

      {products.length === 0 ? (
        <section className="ui-panel">
          <div className="ui-empty">
            No hay tipos de activos disponibles. Primero crea un tipo de activo desde el catalogo.
          </div>
          <div className="mt-4">
            <Link href="/inventory/catalog/new?type=asset" className="ui-btn ui-btn--brand">
              Crear tipo de activo
            </Link>
          </div>
        </section>
      ) : (
        <AssetBulkCreateForm
          action={createBulkAssetGroups}
          products={products}
          sites={sites}
          areas={areas}
          locations={locations}
        />
      )}
    </div>
  );
}
