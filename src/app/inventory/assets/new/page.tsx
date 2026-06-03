import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";

import { PhysicalAssetForm } from "./physical-asset-form";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type SearchParams = {
  error?: string;
  product_id?: string;
};

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  image_url: string | null;
  catalog_image_url: string | null;
  product_inventory_profiles?: {
    inventory_kind: string | null;
  } | null;
};

type ProductAssetProfileRow = {
  product_id: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  commercial_value: number | null;
  technical_description: string | null;
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
  location_type: string | null;
};

type PositionRow = {
  id: string;
  site_id: string;
  location_id: string;
  code: string | null;
  name: string | null;
  kind: string | null;
};

type EmployeeRow = {
  id: string;
  site_id: string | null;
  full_name: string | null;
  role: string | null;
  is_active: boolean | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableUuid(value: FormDataEntryValue | null) {
  const text = asText(value);
  return text || null;
}

function asNullableNumber(value: FormDataEntryValue | null) {
  const text = asText(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function asNullableDate(value: FormDataEntryValue | null) {
  const text = asText(value);
  return text || null;
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

function generatedCode(prefix: string, sku: string | null | undefined) {
  const safeSku = normalizeCodePart(sku, "ACT");
  const suffix = Date.now().toString(36).toUpperCase();
  return `${prefix}-${safeSku}-${suffix}`;
}

function buildNewAssetReturn(error?: string, productId?: string) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (productId) params.set("product_id", productId);
  const qs = params.toString();
  return qs ? `/inventory/assets/new?${qs}` : "/inventory/assets/new";
}

async function createAssetPhysicalRecord(formData: FormData) {
  "use server";

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/assets/new",
    permissionCode: PERMISSION,
  });

  const mode = asText(formData.get("asset_mode")) === "group" ? "group" : "item";
  const productId = asText(formData.get("product_id"));

  if (!productId) {
    redirect(buildNewAssetReturn("Selecciona el producto/modelo base del activo."));
  }

  const { data: productData } = await supabase
    .from("products")
    .select("id,name,sku,product_type,product_inventory_profiles(inventory_kind)")
    .eq("id", productId)
    .maybeSingle();

  const product = productData as
    | {
        id: string;
        name: string | null;
        sku: string | null;
        product_type: string | null;
        product_inventory_profiles?: { inventory_kind: string | null } | null;
      }
    | null;

  const inventoryKind = String(product?.product_inventory_profiles?.inventory_kind ?? "").trim().toLowerCase();
  if (!product || String(product.product_type ?? "").trim().toLowerCase() !== "insumo" || inventoryKind !== "asset") {
    redirect(buildNewAssetReturn("El producto seleccionado no está marcado como equipo/activo.", productId));
  }

  const siteId = asNullableUuid(formData.get("site_id"));
  const areaId = asNullableUuid(formData.get("area_id"));
  const locationId = asNullableUuid(formData.get("location_id"));
  const locationPositionId = asNullableUuid(formData.get("location_position_id"));
  const responsibleEmployeeId = asNullableUuid(formData.get("responsible_employee_id"));

  if (locationPositionId && !locationId) {
    redirect(buildNewAssetReturn("Si asignas ubicación interna, también debes asignar LOC.", productId));
  }

  if (locationId) {
    const { data: location } = await supabase
      .from("inventory_locations")
      .select("id,site_id,area_id")
      .eq("id", locationId)
      .maybeSingle();

    if (!location) {
      redirect(buildNewAssetReturn("El LOC seleccionado no existe.", productId));
    }

    if (siteId && location.site_id !== siteId) {
      redirect(buildNewAssetReturn("El LOC seleccionado no pertenece a la sede elegida.", productId));
    }

    if (areaId && location.area_id !== areaId) {
      redirect(buildNewAssetReturn("El LOC seleccionado no pertenece al área elegida.", productId));
    }
  }

  if (locationPositionId) {
    const { data: position } = await supabase
      .from("inventory_location_positions")
      .select("id,location_id,site_id")
      .eq("id", locationPositionId)
      .maybeSingle();

    if (!position) {
      redirect(buildNewAssetReturn("La ubicación interna seleccionada no existe.", productId));
    }

    if (position.location_id !== locationId) {
      redirect(buildNewAssetReturn("La ubicación interna no pertenece al LOC seleccionado.", productId));
    }

    if (siteId && position.site_id !== siteId) {
      redirect(buildNewAssetReturn("La ubicación interna no pertenece a la sede elegida.", productId));
    }
  }

  if (mode === "item") {
    const assetCode =
      asText(formData.get("asset_code")) || generatedCode("ACT", product.sku || product.name);
    const displayName = asText(formData.get("display_name")) || product.name || "Activo";
    const internalPlate = asText(formData.get("internal_plate")) || null;
    const serialNumber = asText(formData.get("serial_number")) || null;
    const brand = asText(formData.get("brand")) || null;
    const model = asText(formData.get("model")) || null;
    const manufacturer = asText(formData.get("manufacturer")) || null;
    const purchaseInvoiceUrl = asText(formData.get("purchase_invoice_url")) || null;
    const mainImageUrl = asText(formData.get("main_image_url")) || null;

    const { data: inserted, error } = await supabase
      .from("asset_items")
      .insert({
        product_id: productId,
        asset_code: assetCode,
        display_name: displayName,
        internal_plate: internalPlate,
        serial_number: serialNumber,
        site_id: siteId,
        area_id: areaId,
        location_id: locationId,
        location_position_id: locationPositionId,
        responsible_employee_id: responsibleEmployeeId,
        brand,
        model,
        manufacturer,
        equipment_status: asText(formData.get("equipment_status")) || "operativo",
        condition_status: asText(formData.get("condition_status")) || "bueno",
        lifecycle_status: asText(formData.get("lifecycle_status")) || "activo",
        ownership_status: asText(formData.get("ownership_status")) || "propio",
        purchase_date: asNullableDate(formData.get("purchase_date")),
        started_use_date: asNullableDate(formData.get("started_use_date")),
        warranty_until: asNullableDate(formData.get("warranty_until")),
        commercial_value: asNullableNumber(formData.get("commercial_value")),
        purchase_invoice_url: purchaseInvoiceUrl,
        main_image_url: mainImageUrl,
        technical_specs: {
          potencia: asText(formData.get("spec_power")) || undefined,
          voltaje: asText(formData.get("spec_voltage")) || undefined,
          capacidad: asText(formData.get("spec_capacity")) || undefined,
          dimensiones: asText(formData.get("spec_dimensions")) || undefined,
          peso: asText(formData.get("spec_weight")) || undefined,
          material: asText(formData.get("spec_material")) || undefined,
        },
        notes: asText(formData.get("notes")) || null,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (error || !inserted?.id) {
      redirect(buildNewAssetReturn(error?.message || "No se pudo crear el activo físico.", productId));
    }

    await supabase.from("asset_movements").insert({
      asset_item_id: inserted.id,
      movement_type: "initial_location",
      to_site_id: siteId,
      to_area_id: areaId,
      to_location_id: locationId,
      to_location_position_id: locationPositionId,
      responsible_employee_id: responsibleEmployeeId,
      notes: "Ubicación inicial al crear activo físico.",
      created_by: user.id,
    });

    revalidatePath("/inventory/assets");
    revalidatePath(`/inventory/assets/items/${inserted.id}`);
    redirect(`/inventory/assets/items/${inserted.id}`);
  }

  const groupCode =
    asText(formData.get("group_code")) || generatedCode("GRP", product.sku || product.name);
  const groupName = asText(formData.get("group_name")) || product.name || "Grupo de activos";
  const expectedQty = asNullableNumber(formData.get("expected_qty"));

  if (expectedQty == null || expectedQty < 0) {
    redirect(buildNewAssetReturn("La cantidad esperada del grupo debe ser mayor o igual a cero.", productId));
  }

  const { data: insertedGroup, error: groupError } = await supabase
    .from("asset_groups")
    .insert({
      product_id: productId,
      group_code: groupCode,
      name: groupName,
      expected_qty: expectedQty,
      unit_code: asText(formData.get("group_unit_code")) || "un",
      site_id: siteId,
      area_id: areaId,
      location_id: locationId,
      location_position_id: locationPositionId,
      responsible_employee_id: responsibleEmployeeId,
      condition_status: asText(formData.get("condition_status")) || "bueno",
      lifecycle_status: asText(formData.get("lifecycle_status")) || "activo",
      main_image_url: asText(formData.get("main_image_url")) || null,
      notes: asText(formData.get("notes")) || null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (groupError || !insertedGroup?.id) {
    redirect(buildNewAssetReturn(groupError?.message || "No se pudo crear el grupo de activos.", productId));
  }

  await supabase.from("asset_movements").insert({
    asset_group_id: insertedGroup.id,
    movement_type: "initial_location",
    quantity: expectedQty,
    to_site_id: siteId,
    to_area_id: areaId,
    to_location_id: locationId,
    to_location_position_id: locationPositionId,
    responsible_employee_id: responsibleEmployeeId,
    notes: "Ubicación inicial al crear grupo de activos.",
    created_by: user.id,
  });

  revalidatePath("/inventory/assets");
  redirect("/inventory/assets?view=groups");
}

export default async function NewPhysicalAssetPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = String(sp.error ?? "").trim();
  const requestedProductId = String(sp.product_id ?? "").trim();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/assets/new",
    permissionCode: PERMISSION,
  });

  const [productsRes, sitesRes, areasRes, locationsRes, positionsRes, employeesRes] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,sku,image_url,catalog_image_url,product_inventory_profiles(inventory_kind)")
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
      .select("id,site_id,area_id,code,zone,description,location_type")
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("inventory_location_positions")
      .select("id,site_id,location_id,code,name,kind")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("employees")
      .select("id,site_id,full_name,role,is_active")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
  ]);

  const products = (productsRes.data ?? []) as unknown as ProductRow[];
  const productIds = products.map((product) => product.id);
  const { data: productAssetProfilesData } = productIds.length
    ? await supabase
        .from("product_asset_profiles")
        .select("product_id,brand,model,serial_number,commercial_value,technical_description")
        .in("product_id", productIds)
    : { data: [] as ProductAssetProfileRow[] };

  const productAssetProfiles = (productAssetProfilesData ?? []) as ProductAssetProfileRow[];
  const sites = (sitesRes.data ?? []) as SiteRow[];
  const areas = (areasRes.data ?? []) as AreaRow[];
  const locations = (locationsRes.data ?? []) as LocationRow[];
  const positions = (positionsRes.data ?? []) as PositionRow[];
  const employees = (employeesRes.data ?? []) as EmployeeRow[];

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link
                href="/inventory/assets"
                className="ui-btn ui-btn--ghost inline-flex h-12 items-center px-5 text-base font-semibold"
              >
                ← Activos físicos
              </Link>
              <h1 className="ui-h1">Crear activo físico</h1>
              <p className="ui-body-muted">
                Convierte un equipo existente del catálogo en una unidad física con QR o en un grupo contable por cantidad.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                {products.length} modelos disponibles
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                Individual o grupo
              </span>
            </div>
          </div>

          <div className="ui-panel bg-white/90">
            <h2 className="ui-h2">Regla práctica</h2>
            <p className="mt-2 ui-body-muted">
              Usa activo individual para equipos con serial, mantenimiento, garantía, alto valor o QR propio.
              Usa grupo para objetos repetidos que se cuentan por cantidad.
            </p>
          </div>
        </div>
      </section>

      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}

      {products.length === 0 ? (
        <section className="ui-panel">
          <div className="ui-empty">
            No hay productos marcados como equipos/activos. Primero crea un equipo desde el catálogo.
          </div>
          <div className="mt-4">
            <Link href="/inventory/catalog/new?type=asset" className="ui-btn ui-btn--brand">
              Crear equipo en catálogo
            </Link>
          </div>
        </section>
      ) : (
        <PhysicalAssetForm
          action={createAssetPhysicalRecord}
          products={products}
          productAssetProfiles={productAssetProfiles}
          sites={sites}
          areas={areas}
          locations={locations}
          positions={positions}
          employees={employees}
          initialProductId={requestedProductId}
        />
      )}
    </div>
  );
}
