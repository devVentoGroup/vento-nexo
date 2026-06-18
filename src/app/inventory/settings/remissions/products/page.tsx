import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import {
  getSiteCapabilitiesMap,
  type SiteOperationalCapabilities,
} from "@/lib/inventory/site-capabilities";
import { normalizeUnitCode } from "@/lib/inventory/uom";
import { createClient } from "@/lib/supabase/server";
import { safeDecodeURIComponent } from "@/lib/url";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PAGE_PATH = "/inventory/settings/remissions/products";

type SiteRow = {
  id: string;
  name: string | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  product_type: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  is_active: boolean | null;
  product_inventory_profiles?: Array<{
    measurement_mode?: string | null;
    inventory_kind?: string | null;
  }> | null;
};

type ProductSiteSettingRow = {
  id: string;
  product_id: string | null;
  site_id: string | null;
  is_active: boolean | null;
  default_area_kind: string | null;
  area_kinds: string[] | null;
  remission_enabled: boolean | null;
  local_production_enabled: boolean | null;
  production_location_id: string | null;
  sales_enabled: boolean | null;
  min_stock_qty: number | null;
  remission_category_id?: string | null;
};

type UomProfileRow = {
  product_id: string | null;
  is_active: boolean | null;
  qty_in_stock_unit: number | null;
};

type LocationRow = {
  id: string;
  site_id: string | null;
  is_active: boolean | null;
};

type AreaRuleRow = {
  site_id: string | null;
  area_kind: string | null;
  is_enabled: boolean | null;
};

type RemissionCategoryRow = {
  id: string;
  site_id: string | null;
  name: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

type BulkProfile =
  | "input_from_origin"
  | "sellable_from_origin"
  | "preparation_from_origin"
  | "available_not_remission"
  | "disable_remission";

type ProductDiagnostics = {
  status: "ready" | "configured" | "blocked" | "warning";
  label: string;
  issues: string[];
  canApply: boolean;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function isBulkProfile(value: string): value is BulkProfile {
  return [
    "input_from_origin",
    "sellable_from_origin",
    "preparation_from_origin",
    "available_not_remission",
    "disable_remission",
  ].includes(value);
}

function profileLabel(value: BulkProfile) {
  switch (value) {
    case "input_from_origin":
      return "Insumo remitible desde origen";
    case "sellable_from_origin":
      return "Producto vendible remitido desde origen";
    case "preparation_from_origin":
      return "Preparación remitida desde origen";
    case "available_not_remission":
      return "Solo disponible, no remitible";
    case "disable_remission":
      return "Desactivar remisión";
  }
}

function profileHelp(value: BulkProfile) {
  switch (value) {
    case "input_from_origin":
      return "Muestra solo insumos. Los deja disponibles y remitibles hacia la sede destino, sin venta y sin producción local.";
    case "sellable_from_origin":
      return "Muestra solo productos vendibles/reventa. Los deja disponibles, remitibles y vendibles en la sede destino, sin producción local.";
    case "preparation_from_origin":
      return "Muestra solo preparaciones. Las deja disponibles y remitibles hacia la sede destino, sin producción local.";
    case "available_not_remission":
      return "Muestra insumos, preparaciones y productos vendibles. Los deja disponibles en la sede, pero fuera de solicitudes de remisión.";
    case "disable_remission":
      return "Muestra productos configurados como remitibles en esta sede. Solo apaga la remisión y conserva la configuración existente.";
  }
}

function normalizeCatalogToken(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeProductType(value: string | null | undefined) {
  const normalized = normalizeCatalogToken(value);
  if (["preparacion", "preparation"].includes(normalized)) return "preparacion";
  if (["venta", "sellable", "product", "producto"].includes(normalized)) return "venta";
  if (["reventa", "resale"].includes(normalized)) return "reventa";
  if (["activo", "asset", "equipo", "equipment", "modelo_patrimonial", "modelo patrimonial"].includes(normalized)) {
    return "asset";
  }
  return normalized || "insumo";
}

function productTypeLabel(value: string | null | undefined) {
  const normalized = normalizeProductType(value);
  if (normalized === "preparacion") return "Preparación";
  if (normalized === "venta") return "Venta";
  if (normalized === "reventa") return "Reventa";
  if (normalized === "asset") return "Modelo patrimonial";
  return "Insumo";
}

const PROFILE_ALLOWED_PRODUCT_TYPES: Record<BulkProfile, string[]> = {
  input_from_origin: ["insumo"],
  sellable_from_origin: ["venta", "reventa"],
  preparation_from_origin: ["preparacion"],
  available_not_remission: ["insumo", "preparacion", "venta", "reventa"],
  disable_remission: ["insumo", "preparacion", "venta", "reventa"],
};

const PRODUCT_TYPE_OPTIONS = [
  { value: "insumo", label: "Insumo" },
  { value: "preparacion", label: "Preparación" },
  { value: "venta", label: "Venta" },
  { value: "reventa", label: "Reventa" },
];

function profileTypeOptions(profile: BulkProfile) {
  const allowedTypes = new Set(PROFILE_ALLOWED_PRODUCT_TYPES[profile]);
  return PRODUCT_TYPE_OPTIONS.filter((option) => allowedTypes.has(option.value));
}

function isAssetLikeProduct(product: ProductRow) {
  const productType = normalizeProductType(product.product_type);
  const inventoryKind = normalizeCatalogToken(product.product_inventory_profiles?.[0]?.inventory_kind);
  const sku = normalizeCatalogToken(product.sku);

  return (
    productType === "asset" ||
    ["asset", "assets", "activo", "activos", "equipment", "equipo", "equipos", "fixed_asset", "fixed asset"].includes(
      inventoryKind
    ) ||
    sku.startsWith("eqp-")
  );
}

function profileAllowsProduct(params: {
  product: ProductRow;
  setting?: ProductSiteSettingRow;
  profile: BulkProfile;
}) {
  if (isAssetLikeProduct(params.product)) return false;

  const productType = normalizeProductType(params.product.product_type);
  if (!PROFILE_ALLOWED_PRODUCT_TYPES[params.profile].includes(productType)) return false;

  if (params.profile === "disable_remission") {
    return params.setting?.remission_enabled === true;
  }

  return true;
}

function measurementModeLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "variable_weight") return "Peso variable";
  if (normalized === "count_with_weight") return "Conteo + peso";
  if (normalized === "bulk_volume") return "Granel";
  return "Presentación fija";
}

function statusChipClass(status: ProductDiagnostics["status"]) {
  if (status === "configured") return "ui-chip ui-chip--success";
  if (status === "ready") return "ui-chip ui-chip--info";
  if (status === "warning") return "ui-chip ui-chip--warn";
  return "ui-chip ui-chip--danger";
}

function buildRedirect(params: URLSearchParams) {
  const query = params.toString();
  return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
}

async function requireManager(returnTo: string) {
  const supabase = await createClient();
  const { data: authRes } = await supabase.auth.getUser();
  const user = authRes.user ?? null;
  if (!user) redirect(`${returnTo}?error=${encodeURIComponent("Sesión requerida.")}`);

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = String((employee as { role?: string } | null)?.role ?? "").toLowerCase();
  if (!["propietario", "gerente_general"].includes(role)) {
    redirect(`${returnTo}?error=${encodeURIComponent("No tienes permisos para esta configuración.")}`);
  }
  return { supabase };
}

function diagnoseProduct(params: {
  product: ProductRow;
  setting?: ProductSiteSettingRow;
  hasRemissionProfile: boolean;
  hasOriginLocation: boolean;
  profile: BulkProfile;
}): ProductDiagnostics {
  const issues: string[] = [];
  const stockUnit = normalizeUnitCode(params.product.stock_unit_code || params.product.unit || "");
  const measurementMode =
    params.product.product_inventory_profiles?.[0]?.measurement_mode ?? "fixed_presentation";
  const disablesRemission =
    params.profile === "available_not_remission" || params.profile === "disable_remission";

  if (params.product.is_active === false) issues.push("Producto inactivo");
  if (!stockUnit) issues.push("Falta unidad base");
  if (!disablesRemission && !params.hasRemissionProfile) issues.push("Falta presentación remitible");
  if (!disablesRemission && !params.hasOriginLocation) issues.push("Falta LOC origen");
  if (params.setting?.local_production_enabled === true && !disablesRemission) {
    issues.push("Tiene producción local marcada");
  }
  if (
    measurementMode === "variable_weight" ||
    measurementMode === "count_with_weight" ||
    measurementMode === "bulk_volume"
  ) {
    issues.push("Medición requiere revisión manual");
  }

  if (issues.length > 0) {
    const manualOnly = issues.every((issue) => issue === "Medición requiere revisión manual");
    return {
      status: manualOnly ? "warning" : "blocked",
      label: manualOnly ? "Revisar" : "Bloqueado",
      issues,
      canApply: disablesRemission,
    };
  }

  if (params.setting?.is_active === true && params.setting.remission_enabled === true) {
    return {
      status: "configured",
      label: "Listo",
      issues: ["Ya está remitible"],
      canApply: true,
    };
  }

  return {
    status: "ready",
    label: "Puede configurarse",
    issues: ["Completo para aplicar"],
    canApply: true,
  };
}

async function applyBulkProductSettings(formData: FormData) {
  "use server";

  const destinationSiteId = asText(formData.get("destination_site_id"));
  const originSiteId = asText(formData.get("origin_site_id"));
  const rawProfile = asText(formData.get("bulk_profile"));
  const productIds = Array.from(
    new Set(
      formData
        .getAll("product_id")
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );

  const returnParams = new URLSearchParams();
  if (destinationSiteId) returnParams.set("destination_site_id", destinationSiteId);
  if (originSiteId) returnParams.set("origin_site_id", originSiteId);
  if (rawProfile) returnParams.set("bulk_profile", rawProfile);

  if (!destinationSiteId || !originSiteId || !isBulkProfile(rawProfile)) {
    returnParams.set("error", "Selecciona sede destino, origen y perfil.");
    redirect(buildRedirect(returnParams));
  }
  if (productIds.length === 0) {
    returnParams.set("error", "Selecciona al menos un producto.");
    redirect(buildRedirect(returnParams));
  }

  const { supabase } = await requireManager(buildRedirect(returnParams));
  const [
    { data: capabilityRows },
    { data: productsData },
    { data: profilesData },
    { data: locationsData },
    { data: settingsData },
  ] = await Promise.all([
    supabase
      .from("site_operational_capabilities")
      .select("site_id,can_request_remissions,can_fulfill_remissions,can_receive_remissions,can_sell,can_produce,can_hold_inventory,is_commercial_business,show_in_product_setup")
      .in("site_id", [destinationSiteId, originSiteId]),
    supabase
      .from("products")
      .select("id,name,sku,product_type,unit,stock_unit_code,is_active,product_inventory_profiles(measurement_mode,inventory_kind)")
      .in("id", productIds),
    supabase
      .from("product_uom_profiles")
      .select("product_id,is_active,qty_in_stock_unit")
      .eq("usage_context", "remission")
      .eq("is_active", true)
      .in("product_id", productIds),
    supabase
      .from("inventory_locations")
      .select("id,site_id,is_active")
      .eq("site_id", originSiteId)
      .eq("is_active", true),
    supabase
      .from("product_site_settings")
      .select("id,product_id,site_id,is_active,default_area_kind,area_kinds,remission_enabled,local_production_enabled,production_location_id,sales_enabled,min_stock_qty,remission_category_id")
      .eq("site_id", destinationSiteId)
      .in("product_id", productIds),
  ]);

  const capabilitiesBySite = getSiteCapabilitiesMap(
    [destinationSiteId, originSiteId],
    (capabilityRows ?? []) as SiteOperationalCapabilities[]
  );
  const destinationCapabilities = capabilitiesBySite.get(destinationSiteId);
  const originCapabilities = capabilitiesBySite.get(originSiteId);
  const disablesRemission =
    rawProfile === "available_not_remission" || rawProfile === "disable_remission";

  if (!disablesRemission && !destinationCapabilities?.can_request_remissions) {
    returnParams.set("error", "La sede destino no solicita remisiones.");
    redirect(buildRedirect(returnParams));
  }
  if (!disablesRemission && !originCapabilities?.can_fulfill_remissions) {
    returnParams.set("error", "La sede origen no despacha remisiones.");
    redirect(buildRedirect(returnParams));
  }

  const hasOriginLocation = ((locationsData ?? []) as LocationRow[]).some(
    (location) => location.is_active !== false
  );
  const productsWithRemissionProfile = new Set(
    ((profilesData ?? []) as UomProfileRow[])
      .filter((profile) => Number(profile.qty_in_stock_unit ?? 0) > 0)
      .map((profile) => String(profile.product_id ?? "").trim())
      .filter(Boolean)
  );
  const settingsByProduct = new Map(
    ((settingsData ?? []) as ProductSiteSettingRow[]).map((row) => [
      String(row.product_id ?? ""),
      row,
    ])
  );
  const productsById = new Map(
    ((productsData ?? []) as ProductRow[]).map((product) => [product.id, product])
  );

  const rows = productIds
    .filter((productId) => {
      const product = productsById.get(productId);
      const current = settingsByProduct.get(productId);
      if (!product || product.is_active === false) return false;
      if (!profileAllowsProduct({ product, setting: current, profile: rawProfile })) return false;
      return disablesRemission || (hasOriginLocation && productsWithRemissionProfile.has(productId));
    })
    .map((productId) => {
      const current = settingsByProduct.get(productId);
      const base = {
        product_id: productId,
        site_id: destinationSiteId,
        default_area_kind: current?.default_area_kind ?? null,
        area_kinds: current?.area_kinds ?? null,
        local_production_enabled: false,
        production_location_id: null,
        min_stock_qty: current?.min_stock_qty ?? null,
        remission_category_id: current?.remission_category_id ?? null,
      };

      if (rawProfile === "available_not_remission") {
        return {
          ...base,
          is_active: true,
          remission_enabled: false,
          sales_enabled: current?.sales_enabled ?? false,
        };
      }

      if (rawProfile === "disable_remission") {
        return {
          ...base,
          is_active: current?.is_active ?? false,
          remission_enabled: false,
          sales_enabled: current?.sales_enabled ?? false,
        };
      }

      return {
        ...base,
        is_active: true,
        remission_enabled: true,
        sales_enabled: rawProfile === "sellable_from_origin",
      };
    });

  if (rows.length === 0) {
    returnParams.set("error", "Ningún producto seleccionado está completo para aplicar este perfil.");
    redirect(buildRedirect(returnParams));
  }

  const { error } = await supabase.from("product_site_settings").upsert(rows, {
    onConflict: "product_id,site_id",
  });
  if (error) {
    returnParams.set("error", error.message);
    redirect(buildRedirect(returnParams));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/settings/remissions");
  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/remissions");

  returnParams.set("ok", `Actualizados ${rows.length} producto(s).`);
  redirect(buildRedirect(returnParams));
}

async function createRemissionCategory(formData: FormData) {
  "use server";

  const destinationSiteId = asText(formData.get("destination_site_id"));
  const originSiteId = asText(formData.get("origin_site_id"));
  const rawProfile = asText(formData.get("bulk_profile"));
  const name = asText(formData.get("category_name"));
  const returnParams = new URLSearchParams();
  if (destinationSiteId) returnParams.set("destination_site_id", destinationSiteId);
  if (originSiteId) returnParams.set("origin_site_id", originSiteId);
  if (rawProfile) returnParams.set("bulk_profile", rawProfile);

  if (!destinationSiteId || !name) {
    returnParams.set("error", "Selecciona sede destino y escribe el nombre de la categoría.");
    redirect(buildRedirect(returnParams));
  }

  const { supabase } = await requireManager(buildRedirect(returnParams));
  const { count } = await supabase
    .from("remission_product_categories")
    .select("id", { count: "exact", head: true })
    .eq("site_id", destinationSiteId);

  const { error } = await supabase.from("remission_product_categories").insert({
    site_id: destinationSiteId,
    name,
    sort_order: count ?? 0,
    is_active: true,
  });
  if (error) {
    returnParams.set("error", error.message);
    redirect(buildRedirect(returnParams));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  returnParams.set("ok", "Categoría creada.");
  redirect(buildRedirect(returnParams));
}

async function saveProductRemissionCategories(formData: FormData) {
  "use server";

  const destinationSiteId = asText(formData.get("destination_site_id"));
  const originSiteId = asText(formData.get("origin_site_id"));
  const rawProfile = asText(formData.get("bulk_profile"));
  const productIds = Array.from(
    new Set(
      formData
        .getAll("category_product_id")
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
  const returnParams = new URLSearchParams();
  if (destinationSiteId) returnParams.set("destination_site_id", destinationSiteId);
  if (originSiteId) returnParams.set("origin_site_id", originSiteId);
  if (rawProfile) returnParams.set("bulk_profile", rawProfile);

  if (!destinationSiteId || productIds.length === 0) {
    returnParams.set("error", "No hay productos para guardar categorías.");
    redirect(buildRedirect(returnParams));
  }

  const { supabase } = await requireManager(buildRedirect(returnParams));
  const { data: categoryRows } = await supabase
    .from("remission_product_categories")
    .select("id")
    .eq("site_id", destinationSiteId)
    .eq("is_active", true);
  const { data: currentSettings } = await supabase
    .from("product_site_settings")
    .select("product_id,is_active,remission_enabled,local_production_enabled,production_location_id")
    .eq("site_id", destinationSiteId)
    .in("product_id", productIds);
  const validCategoryIds = new Set(
    ((categoryRows ?? []) as Array<{ id: string | null }>)
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean)
  );
  const currentByProduct = new Map(
    ((currentSettings ?? []) as Array<{
      product_id: string | null;
      is_active: boolean | null;
      remission_enabled: boolean | null;
      local_production_enabled: boolean | null;
      production_location_id: string | null;
    }>).map((row) => [String(row.product_id ?? ""), row])
  );

  const rows = productIds.map((productId) => {
    const categoryId = asText(formData.get(`remission_category_${productId}`));
    const current = currentByProduct.get(productId);
    return {
      product_id: productId,
      site_id: destinationSiteId,
      is_active: current?.is_active ?? false,
      remission_enabled: current?.remission_enabled ?? false,
      local_production_enabled: current?.local_production_enabled ?? false,
      production_location_id: current?.production_location_id ?? null,
      remission_category_id: validCategoryIds.has(categoryId) ? categoryId : null,
    };
  });

  const { error } = await supabase.from("product_site_settings").upsert(rows, {
    onConflict: "product_id,site_id",
  });
  if (error) {
    returnParams.set("error", error.message);
    redirect(buildRedirect(returnParams));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  returnParams.set("ok", "Categorías de remisión guardadas.");
  redirect(buildRedirect(returnParams));
}

export default async function RemissionProductsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    destination_site_id?: string;
    origin_site_id?: string;
    bulk_profile?: string;
    q?: string;
    type?: string;
    measurement?: string;
    status?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: PAGE_PATH,
  });

  const { data: emp } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = String((emp as { role?: string } | null)?.role ?? "").toLowerCase();
  const canManage = ["propietario", "gerente_general"].includes(role);

  const [{ data: sitesData }, { data: productsData }] = await Promise.all([
    supabase
      .from("sites")
      .select("id,name,operational_visibility")
      .eq("is_active", true)
      .eq("operational_visibility", "operational")
      .order("name", { ascending: true }),
    supabase
      .from("products")
      .select("id,name,sku,product_type,unit,stock_unit_code,is_active,product_inventory_profiles(measurement_mode,inventory_kind)")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(500),
  ]);

  const sites = (sitesData ?? []) as SiteRow[];
  const siteIds = sites.map((site) => site.id);
  const { data: capabilityRows } = siteIds.length
    ? await supabase
      .from("site_operational_capabilities")
      .select("site_id,can_request_remissions,can_fulfill_remissions,can_receive_remissions,can_sell,can_produce,can_hold_inventory,is_commercial_business,show_in_product_setup")
      .in("site_id", siteIds)
    : { data: [] as SiteOperationalCapabilities[] };
  const capabilitiesBySite = getSiteCapabilitiesMap(
    siteIds,
    (capabilityRows ?? []) as SiteOperationalCapabilities[]
  );
  const destinationSites = sites.filter((site) => {
    const capabilities = capabilitiesBySite.get(site.id);
    return Boolean(capabilities?.can_request_remissions || capabilities?.can_receive_remissions);
  });
  const originSites = sites.filter((site) => {
    const capabilities = capabilitiesBySite.get(site.id);
    return Boolean(capabilities?.can_fulfill_remissions);
  });

  const destinationSiteId =
    String(sp.destination_site_id ?? "").trim() || destinationSites[0]?.id || "";
  const originSiteId = String(sp.origin_site_id ?? "").trim() || originSites[0]?.id || "";
  const bulkProfile = isBulkProfile(String(sp.bulk_profile ?? ""))
    ? (sp.bulk_profile as BulkProfile)
    : "input_from_origin";

  const [
    { data: settingsData },
    { data: profilesData },
    { data: locationsData },
    { data: areaRulesData },
    { data: remissionCategoriesData },
  ] = await Promise.all([
    destinationSiteId
      ? supabase
        .from("product_site_settings")
        .select("id,product_id,site_id,is_active,default_area_kind,area_kinds,remission_enabled,local_production_enabled,production_location_id,sales_enabled,min_stock_qty,remission_category_id")
        .eq("site_id", destinationSiteId)
      : { data: [] as ProductSiteSettingRow[] },
    supabase
      .from("product_uom_profiles")
      .select("product_id,is_active,qty_in_stock_unit")
      .eq("usage_context", "remission")
      .eq("is_active", true),
    originSiteId
      ? supabase
        .from("inventory_locations")
        .select("id,site_id,is_active")
        .eq("site_id", originSiteId)
        .eq("is_active", true)
      : { data: [] as LocationRow[] },
    destinationSiteId
      ? supabase
        .from("site_area_purpose_rules")
        .select("site_id,area_kind,is_enabled")
        .eq("site_id", destinationSiteId)
        .eq("purpose", "remission")
        .eq("is_enabled", true)
      : { data: [] as AreaRuleRow[] },
    destinationSiteId
      ? supabase
        .from("remission_product_categories")
        .select("id,site_id,name,sort_order,is_active")
        .eq("site_id", destinationSiteId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
      : { data: [] as RemissionCategoryRow[] },
  ]);

  const settingsByProduct = new Map(
    ((settingsData ?? []) as ProductSiteSettingRow[]).map((row) => [
      String(row.product_id ?? ""),
      row,
    ])
  );
  const remissionProfileProductIds = new Set(
    ((profilesData ?? []) as UomProfileRow[])
      .filter((profile) => Number(profile.qty_in_stock_unit ?? 0) > 0)
      .map((profile) => String(profile.product_id ?? "").trim())
      .filter(Boolean)
  );
  const originLocations = ((locationsData ?? []) as LocationRow[]).filter(
    (location) => location.is_active !== false
  );
  const remissionCategories = (remissionCategoriesData ?? []) as RemissionCategoryRow[];
  const query = String(sp.q ?? "").trim().toLowerCase();
  const allowedTypeOptions = profileTypeOptions(bulkProfile);
  const allowedTypeValues = new Set(allowedTypeOptions.map((option) => option.value));
  const requestedTypeFilter = normalizeProductType(String(sp.type ?? ""));
  const typeFilter = allowedTypeValues.has(requestedTypeFilter) ? requestedTypeFilter : "";
  const measurementFilter = String(sp.measurement ?? "").trim().toLowerCase();
  const statusFilter = String(sp.status ?? "").trim().toLowerCase();

  const productRows = ((productsData ?? []) as ProductRow[])
    .map((product) => {
      const setting = settingsByProduct.get(product.id);
      const diagnostics = diagnoseProduct({
        product,
        setting,
        hasRemissionProfile: remissionProfileProductIds.has(product.id),
        hasOriginLocation: originLocations.length > 0,
        profile: bulkProfile,
      });
      return { product, setting, diagnostics };
    })
    .filter(({ product, setting, diagnostics }) => {
      const haystack = `${product.name ?? ""} ${product.sku ?? ""}`.toLowerCase();
      const measurementMode = String(
        product.product_inventory_profiles?.[0]?.measurement_mode ?? "fixed_presentation"
      ).toLowerCase();
      const productType = normalizeProductType(product.product_type);
      if (!profileAllowsProduct({ product, setting, profile: bulkProfile })) return false;
      if (query && !haystack.includes(query)) return false;
      if (typeFilter && productType !== typeFilter) return false;
      if (measurementFilter && measurementMode !== measurementFilter) return false;
      if (statusFilter && diagnostics.status !== statusFilter) return false;
      return true;
    });

  const readyCount = productRows.filter((row) => row.diagnostics.canApply).length;
  const blockedCount = productRows.length - readyCount;
  const okMsg = sp.ok ? safeDecodeURIComponent(sp.ok) : "";
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Productos de remisión por sede</h1>
          <p className="mt-2 ui-body-muted">
            Configura muchos productos remitibles para una sede sin abrir cada ficha.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/settings/remissions" className="ui-btn ui-btn--ghost">
            Configuración
          </Link>
          <Link href="/inventory/settings/supply-routes" className="ui-btn ui-btn--ghost">
            Rutas
          </Link>
        </div>
      </div>

      {errorMsg ? <div className="mt-6 ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="mt-6 ui-panel">
        <form method="get" className="grid gap-3 lg:grid-cols-6">
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="ui-label">Sede destino</span>
            <select name="destination_site_id" defaultValue={destinationSiteId} className="ui-input">
              {destinationSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="ui-label">Origen</span>
            <select name="origin_site_id" defaultValue={originSiteId} className="ui-input">
              {originSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="ui-label">Perfil</span>
            <select name="bulk_profile" defaultValue={bulkProfile} className="ui-input">
              <option value="input_from_origin">{profileLabel("input_from_origin")}</option>
              <option value="sellable_from_origin">{profileLabel("sellable_from_origin")}</option>
              <option value="preparation_from_origin">{profileLabel("preparation_from_origin")}</option>
              <option value="available_not_remission">{profileLabel("available_not_remission")}</option>
              <option value="disable_remission">{profileLabel("disable_remission")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="ui-label">Buscar</span>
            <input name="q" defaultValue={sp.q ?? ""} className="ui-input" placeholder="Nombre o SKU" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Tipo</span>
            <select name="type" defaultValue={typeFilter} className="ui-input">
              <option value="">Todos los compatibles</option>
              {allowedTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Medición</span>
            <select name="measurement" defaultValue={sp.measurement ?? ""} className="ui-input">
              <option value="">Todas</option>
              <option value="fixed_presentation">Presentación fija</option>
              <option value="variable_weight">Peso variable</option>
              <option value="count_with_weight">Conteo + peso</option>
              <option value="bulk_volume">Granel</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Estado</span>
            <select name="status" defaultValue={sp.status ?? ""} className="ui-input">
              <option value="">Todos</option>
              <option value="configured">Listos</option>
              <option value="ready">Puede configurarse</option>
              <option value="blocked">Bloqueado</option>
              <option value="warning">Revisar</option>
            </select>
          </label>
          <div className="flex items-end">
            <button className="ui-btn ui-btn--brand w-full">Filtrar</button>
          </div>
        </form>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="ui-panel">
          <div className="ui-caption">Perfil</div>
          <div className="mt-1 text-sm font-semibold">{profileLabel(bulkProfile)}</div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--ui-muted)]">{profileHelp(bulkProfile)}</p>
        </div>
        <div className="ui-panel">
          <div className="ui-caption">Productos visibles</div>
          <div className="mt-1 text-sm font-semibold">{productRows.length}</div>
        </div>
        <div className="ui-panel">
          <div className="ui-caption">Aplicables</div>
          <div className="mt-1 text-sm font-semibold">{readyCount}</div>
        </div>
        <div className="ui-panel">
          <div className="ui-caption">Bloqueados / revisar</div>
          <div className="mt-1 text-sm font-semibold">{blockedCount}</div>
        </div>
      </div>

      {!destinationSites.length || !originSites.length ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          Faltan capacidades operativas: debe existir una sede que solicite/reciba y una sede que despache remisiones.
        </div>
      ) : null}

      {destinationSiteId && ((areaRulesData ?? []) as AreaRuleRow[]).length === 0 ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          La sede destino no tiene áreas solicitantes configuradas para remisión.
        </div>
      ) : null}

      {originSiteId && originLocations.length === 0 ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          El origen seleccionado no tiene LOC activo. Los perfiles remitibles quedan bloqueados.
        </div>
      ) : null}

      <div className="mt-6 ui-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ui-h3">Categorías de esta sede</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Solo ordenan la selección en solicitudes de remisión. No cambian la categoría del catálogo.
            </p>
          </div>
          <form action={createRemissionCategory} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="destination_site_id" value={destinationSiteId} />
            <input type="hidden" name="origin_site_id" value={originSiteId} />
            <input type="hidden" name="bulk_profile" value={bulkProfile} />
            <label className="flex flex-col gap-1">
              <span className="ui-label">Nueva categoría</span>
              <input
                name="category_name"
                className="ui-input min-w-[220px]"
                placeholder="Ej. Panadería"
                disabled={!canManage || !destinationSiteId}
              />
            </label>
            <button className="ui-btn ui-btn--brand" disabled={!canManage || !destinationSiteId}>
              Crear
            </button>
          </form>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {remissionCategories.length ? (
            remissionCategories.map((category) => (
              <span key={category.id} className="ui-chip">
                {category.name ?? "Sin nombre"}
              </span>
            ))
          ) : (
            <span className="text-sm text-[var(--ui-muted)]">
              Esta sede todavía no tiene categorías visuales de remisión.
            </span>
          )}
        </div>
      </div>

      <form id="remission-category-form" action={saveProductRemissionCategories}>
        <input type="hidden" name="destination_site_id" value={destinationSiteId} />
        <input type="hidden" name="origin_site_id" value={originSiteId} />
        <input type="hidden" name="bulk_profile" value={bulkProfile} />
      </form>

      <form action={applyBulkProductSettings} className="mt-6 ui-panel">
        <input type="hidden" name="destination_site_id" value={destinationSiteId} />
        <input type="hidden" name="origin_site_id" value={originSiteId} />
        <input type="hidden" name="bulk_profile" value={bulkProfile} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Productos</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Solo aparecen productos compatibles con el perfil elegido. Activos, equipos y modelos patrimoniales se excluyen.
            </p>
          </div>
          <button
            type="submit"
            className="ui-btn ui-btn--brand"
            disabled={!canManage || readyCount === 0}
          >
            Aplicar a seleccionados
          </button>
          <button
            type="submit"
            form="remission-category-form"
            className="ui-btn ui-btn--ghost"
            disabled={!canManage || productRows.length === 0}
          >
            Guardar categorías
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Sel.</TableHeaderCell>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Medición</TableHeaderCell>
                <TableHeaderCell>Categoría remisión</TableHeaderCell>
                <TableHeaderCell>Base</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Diagnóstico</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {productRows.map(({ product, setting, diagnostics }) => (
                <TableRow key={product.id} className="border-t border-zinc-200/70 align-top">
                  <TableCell>
                    <input
                      type="checkbox"
                      name="product_id"
                      value={product.id}
                      disabled={!diagnostics.canApply || !canManage}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-[var(--ui-text)]">{product.name ?? "Sin nombre"}</div>
                    <div className="mt-1 text-xs text-[var(--ui-muted)]">{product.sku ?? "Sin SKU"}</div>
                  </TableCell>
                  <TableCell>{productTypeLabel(product.product_type)}</TableCell>
                  <TableCell>
                    {measurementModeLabel(product.product_inventory_profiles?.[0]?.measurement_mode)}
                  </TableCell>
                  <TableCell>
                    <input
                      type="hidden"
                      name="category_product_id"
                      value={product.id}
                      form="remission-category-form"
                    />
                    <select
                      name={`remission_category_${product.id}`}
                      defaultValue={setting?.remission_category_id ?? ""}
                      className="ui-input min-w-[180px]"
                      form="remission-category-form"
                      disabled={!canManage}
                    >
                      <option value="">Sin categoría</option>
                      {remissionCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name ?? category.id}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>{normalizeUnitCode(product.stock_unit_code || product.unit || "") || "Sin unidad"}</TableCell>
                  <TableCell>
                    <span className={statusChipClass(diagnostics.status)}>{diagnostics.label}</span>
                    {setting?.remission_enabled === true ? (
                      <div className="mt-2 text-xs text-[var(--ui-muted)]">Remisión activa</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-[420px] flex-wrap gap-1">
                      {diagnostics.issues.map((issue) => (
                        <span key={`${product.id}-${issue}`} className="ui-chip">
                          {issue}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {productRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="ui-empty">
                    No hay productos con esos filtros.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </form>
    </div>
  );
}
