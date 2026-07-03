"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import {
  getSiteCapabilitiesMap,
  type SiteOperationalCapabilities,
} from "@/lib/inventory/site-capabilities";
import { createClient } from "@/lib/supabase/server";
import {
  asText,
  buildRedirect,
  isBulkProfile,
  normalizeAreaKind,
  profileAllowsProduct,
  requiresRemissionProfile,
  settingAreaKinds,
  type BulkProfile,
  type LocationRow,
  type ProductRow,
  type ProductSiteSettingRow,
  type UomProfileRow,
} from "./helpers";

const APP_ID = "nexo";
const PAGE_PATH = "/inventory/settings/remissions/products";
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

export async function applyBulkProductSettings(formData: FormData) {
  "use server";

  const destinationSiteId = asText(formData.get("destination_site_id"));
  const originSiteId = asText(formData.get("origin_site_id"));
  const rawProfile = asText(formData.get("bulk_profile"));
  const selectedAreaKind = normalizeAreaKind(asText(formData.get("area_kind")));
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
  if (selectedAreaKind) returnParams.set("area_kind", selectedAreaKind);

  if (!destinationSiteId || !originSiteId || !isBulkProfile(rawProfile)) {
    returnParams.set("error", "Selecciona sede destino, origen y perfil.");
    redirect(buildRedirect(returnParams));
  }
  if (productIds.length === 0) {
    returnParams.set("error", "Selecciona al menos un producto.");
    redirect(buildRedirect(returnParams));
  }

  const bulkProfile = rawProfile as BulkProfile;
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
    bulkProfile === "available_not_remission" || bulkProfile === "disable_remission";

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
      if (!profileAllowsProduct({ product, setting: current, profile: bulkProfile })) return false;
      return (
        disablesRemission ||
        (hasOriginLocation &&
          (!requiresRemissionProfile(product) || productsWithRemissionProfile.has(productId)))
      );
    })
    .map((productId) => {
      const current = settingsByProduct.get(productId);
      const currentAreaKinds = settingAreaKinds(current);
      const nextAreaKinds =
        !disablesRemission && selectedAreaKind
          ? Array.from(new Set([...currentAreaKinds, selectedAreaKind]))
          : currentAreaKinds;
      const base = {
        product_id: productId,
        site_id: destinationSiteId,
        default_area_kind:
          !disablesRemission && selectedAreaKind && !current?.default_area_kind
            ? selectedAreaKind
            : current?.default_area_kind ?? null,
        area_kinds: nextAreaKinds.length > 0 ? nextAreaKinds : null,
        local_production_enabled: false,
        production_location_id: null,
        min_stock_qty: current?.min_stock_qty ?? null,
        remission_category_id: current?.remission_category_id ?? null,
      };

      if (bulkProfile === "available_not_remission") {
        return {
          ...base,
          is_active: true,
          remission_enabled: false,
          sales_enabled: current?.sales_enabled ?? false,
        };
      }

      if (bulkProfile === "disable_remission") {
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
        sales_enabled: bulkProfile === "sellable_from_origin",
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

export async function createRemissionCategory(formData: FormData) {
  "use server";

  const destinationSiteId = asText(formData.get("destination_site_id"));
  const originSiteId = asText(formData.get("origin_site_id"));
  const rawProfile = asText(formData.get("bulk_profile"));
  const selectedAreaKind = normalizeAreaKind(asText(formData.get("area_kind")));
  const name = asText(formData.get("category_name"));
  const returnParams = new URLSearchParams();
  if (destinationSiteId) returnParams.set("destination_site_id", destinationSiteId);
  if (originSiteId) returnParams.set("origin_site_id", originSiteId);
  if (rawProfile) returnParams.set("bulk_profile", rawProfile);
  if (selectedAreaKind) returnParams.set("area_kind", selectedAreaKind);

  if (!destinationSiteId || !selectedAreaKind || !name) {
    returnParams.set("error", "Selecciona sede destino, área solicitante y escribe el nombre de la categoría.");
    redirect(buildRedirect(returnParams));
  }

  const { supabase } = await requireManager(buildRedirect(returnParams));
  const { count } = await supabase
    .from("remission_product_categories")
    .select("id", { count: "exact", head: true })
    .eq("site_id", destinationSiteId)
    .eq("area_kind", selectedAreaKind);

  const { error } = await supabase.from("remission_product_categories").insert({
    site_id: destinationSiteId,
    area_kind: selectedAreaKind,
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

export async function saveProductRemissionCategories(formData: FormData) {
  "use server";

  const destinationSiteId = asText(formData.get("destination_site_id"));
  const originSiteId = asText(formData.get("origin_site_id"));
  const rawProfile = asText(formData.get("bulk_profile"));
  const selectedAreaKind = normalizeAreaKind(asText(formData.get("area_kind")));
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
  if (selectedAreaKind) returnParams.set("area_kind", selectedAreaKind);

  if (!destinationSiteId || !selectedAreaKind || productIds.length === 0) {
    returnParams.set("error", "Selecciona área solicitante y al menos un producto para guardar categorías.");
    redirect(buildRedirect(returnParams));
  }

  const { supabase } = await requireManager(buildRedirect(returnParams));
  const { data: categoryRows } = await supabase
    .from("remission_product_categories")
    .select("id,area_kind")
    .eq("site_id", destinationSiteId)
    .eq("is_active", true);
  const validCategoryIds = new Set(
    ((categoryRows ?? []) as Array<{ id: string | null; area_kind: string | null }>)
      .filter((row) => {
        const categoryAreaKind = normalizeAreaKind(row.area_kind);
        return !categoryAreaKind || categoryAreaKind === selectedAreaKind;
      })
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean)
  );
  const rows = productIds.map((productId) => {
    const categoryId = asText(formData.get(`remission_category_${productId}`));
    return {
      product_id: productId,
      site_id: destinationSiteId,
      area_kind: selectedAreaKind,
      remission_category_id: validCategoryIds.has(categoryId) ? categoryId : null,
    };
  });

  const { error } = await supabase.from("product_site_area_remission_categories").upsert(rows, {
    onConflict: "product_id,site_id,area_kind",
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
