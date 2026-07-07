"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  normalizeProductType,
  profileAllowsProduct,
  requiresRemissionProfile,
  settingAreaKinds,
  type BulkProfile,
  type LocationRow,
  type ProductRow,
  type ProductSiteProductionRouteRow,
  type ProductSiteSettingRow,
  type UomProfileRow,
} from "./helpers";

const PAGE_PATH = "/inventory/settings/remissions/products";

function checked(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "on", "yes", "si", "sí"].includes(normalized);
}

function uniqueFormValues(formData: FormData, key: string) {
  return Array.from(
    new Set(
      formData
        .getAll(key)
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
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
  return { supabase, userId: user.id };
}

function commonReturnParams(params: {
  destinationSiteId: string;
  originSiteId: string;
  rawProfile: string;
  selectedAreaKind: string;
}) {
  const returnParams = new URLSearchParams();
  if (params.destinationSiteId) returnParams.set("destination_site_id", params.destinationSiteId);
  if (params.originSiteId) returnParams.set("origin_site_id", params.originSiteId);
  if (params.rawProfile) returnParams.set("bulk_profile", params.rawProfile);
  if (params.selectedAreaKind) returnParams.set("area_kind", params.selectedAreaKind);
  return returnParams;
}

export async function saveBulkProductConfiguration(formData: FormData) {
  "use server";

  const destinationSiteId = asText(formData.get("destination_site_id"));
  const originSiteId = asText(formData.get("origin_site_id"));
  const rawProfile = asText(formData.get("bulk_profile"));
  const selectedAreaKind = normalizeAreaKind(asText(formData.get("area_kind")));
  const productIds = uniqueFormValues(formData, "product_id");
  const categoryProductIds = uniqueFormValues(formData, "category_product_id");

  const returnParams = commonReturnParams({
    destinationSiteId,
    originSiteId,
    rawProfile,
    selectedAreaKind,
  });

  if (!destinationSiteId || !originSiteId || !isBulkProfile(rawProfile)) {
    returnParams.set("error", "Selecciona sede destino, origen y perfil.");
    redirect(buildRedirect(returnParams));
  }

  if (productIds.length === 0 && categoryProductIds.length === 0) {
    returnParams.set("error", "Selecciona productos o cambia al menos una categoría.");
    redirect(buildRedirect(returnParams));
  }

  if ((productIds.length > 0 || categoryProductIds.length > 0) && !selectedAreaKind) {
    returnParams.set("error", "Selecciona un área solicitante.");
    redirect(buildRedirect(returnParams));
  }

  const bulkProfile = rawProfile as BulkProfile;
  const disablesRemission =
    bulkProfile === "available_not_remission" || bulkProfile === "disable_remission";
  const { supabase, userId } = await requireManager(buildRedirect(returnParams));

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
  const categoryByProduct = new Map<string, string | null>();
  for (const productId of categoryProductIds) {
    const categoryId = asText(formData.get(`remission_category_${productId}`));
    categoryByProduct.set(productId, validCategoryIds.has(categoryId) ? categoryId : null);
  }

  let settingRows: Array<Record<string, unknown>> = [];
  let routeDrafts: Array<{
    productId: string;
    areaKind: string;
    inputLocationId: string;
    outputLocationId: string;
  }> = [];

  if (productIds.length > 0) {
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
        .select("id,product_id,site_id,is_active,default_area_kind,area_kinds,remission_enabled,local_production_enabled,production_location_id,sales_enabled,inventory_enabled,min_stock_qty,remission_category_id")
        .eq("site_id", destinationSiteId)
        .in("product_id", productIds),
    ]);

    const capabilitiesBySite = getSiteCapabilitiesMap(
      [destinationSiteId, originSiteId],
      (capabilityRows ?? []) as SiteOperationalCapabilities[]
    );
    const destinationCapabilities = capabilitiesBySite.get(destinationSiteId);
    const originCapabilities = capabilitiesBySite.get(originSiteId);

    if (!disablesRemission && !destinationCapabilities?.can_request_remissions) {
      returnParams.set("error", "La sede destino no solicita remisiones.");
      redirect(buildRedirect(returnParams));
    }
    if (!disablesRemission && !originCapabilities?.can_fulfill_remissions) {
      returnParams.set("error", "La sede origen no despacha remisiones.");
      redirect(buildRedirect(returnParams));
    }

    const originLocations = (locationsData ?? []) as LocationRow[];
    const hasOriginLocation = originLocations.some((location) => location.is_active !== false);
    const validOriginLocationIds = new Set(
      originLocations.map((location) => String(location.id ?? "").trim()).filter(Boolean)
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

    const canSaveSalesForProduct = (product: ProductRow | undefined) => {
      const productType = normalizeProductType(product?.product_type);
      return ["venta", "reventa", "preparacion"].includes(productType);
    };

    const canSaveRouteForProduct = (product: ProductRow | undefined) => {
      const productType = normalizeProductType(product?.product_type);
      return ["venta", "preparacion"].includes(productType);
    };

    const validProductIds = productIds.filter((productId) => {
      const product = productsById.get(productId);
      const current = settingsByProduct.get(productId);
      if (!product || product.is_active === false) return false;
      if (!profileAllowsProduct({ product, setting: current, profile: bulkProfile })) return false;
      return (
        disablesRemission ||
        (hasOriginLocation &&
          (!requiresRemissionProfile(product) || productsWithRemissionProfile.has(productId)))
      );
    });

    settingRows = validProductIds.map((productId) => {
      const product = productsById.get(productId);
      const current = settingsByProduct.get(productId);
      const currentAreaKinds = settingAreaKinds(current);
      const nextAreaKinds =
        !disablesRemission && selectedAreaKind
          ? Array.from(new Set([...currentAreaKinds, selectedAreaKind]))
          : currentAreaKinds;
      const categoryId = categoryByProduct.has(productId)
        ? categoryByProduct.get(productId)
        : current?.remission_category_id ?? null;
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
        inventory_enabled: true,
        min_stock_qty: current?.min_stock_qty ?? null,
        remission_category_id: categoryId,
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
          inventory_enabled: current?.inventory_enabled ?? current?.is_active ?? false,
          remission_enabled: false,
          sales_enabled: current?.sales_enabled ?? false,
        };
      }

      return {
        ...base,
        is_active: true,
        remission_enabled: true,
        sales_enabled: canSaveSalesForProduct(product)
          ? checked(formData.get(`sales_enabled_${productId}`))
          : false,
      };
    });

    if (settingRows.length === 0) {
      returnParams.set("error", "Ningún producto seleccionado está completo para aplicar este perfil.");
      redirect(buildRedirect(returnParams));
    }

    const validProductIdSet = new Set(settingRows.map((row) => String(row.product_id ?? "")).filter(Boolean));
    routeDrafts = productIds
      .filter((productId) => validProductIdSet.has(productId))
      .map((productId) => {
        const product = productsById.get(productId);
        const canConfigureRoute =
          !disablesRemission &&
          canSaveRouteForProduct(product) &&
          checked(formData.get(`configure_origin_route_${productId}`));

        if (!canConfigureRoute) return null;

        const areaKind = normalizeAreaKind(asText(formData.get(`origin_area_kind_${productId}`)));
        const inputLocationId = asText(formData.get(`origin_input_location_id_${productId}`));
        const outputLocationId = asText(formData.get(`origin_output_location_id_${productId}`));

        return {
          productId,
          areaKind,
          inputLocationId,
          outputLocationId,
        };
      })
      .filter(
        (
          draft
        ): draft is {
          productId: string;
          areaKind: string;
          inputLocationId: string;
          outputLocationId: string;
        } => draft !== null
      );

    const incompleteRoute = routeDrafts.some(
      (draft) => !draft.areaKind || !draft.inputLocationId || !draft.outputLocationId
    );
    if (incompleteRoute) {
      returnParams.set("error", "Completa área productora, LOC de consumo y LOC de terminado en las filas con producción CP.");
      redirect(buildRedirect(returnParams));
    }

    const routeWithInvalidLocation = routeDrafts.some(
      (draft) =>
        !validOriginLocationIds.has(draft.inputLocationId) ||
        !validOriginLocationIds.has(draft.outputLocationId)
    );
    if (routeWithInvalidLocation) {
      returnParams.set("error", "Algún LOC de producción no pertenece al origen o no está activo.");
      redirect(buildRedirect(returnParams));
    }

    const routeAreaKinds = Array.from(new Set(routeDrafts.map((draft) => draft.areaKind).filter(Boolean)));
    if (routeAreaKinds.length > 0) {
      const { data: areaKindRows } = await supabase
        .from("area_kinds")
        .select("code")
        .in("code", routeAreaKinds);
      const validAreaKinds = new Set(
        ((areaKindRows ?? []) as Array<{ code: string | null }>)
          .map((row) => String(row.code ?? "").trim())
          .filter(Boolean)
      );
      if (routeAreaKinds.some((areaKind) => !validAreaKinds.has(areaKind))) {
        returnParams.set("error", "Alguna área productora no existe en el catálogo de áreas.");
        redirect(buildRedirect(returnParams));
      }
    }
  }

  if (settingRows.length > 0) {
    const { error } = await supabase.from("product_site_settings").upsert(settingRows, {
      onConflict: "product_id,site_id",
    });
    if (error) {
      returnParams.set("error", error.message);
      redirect(buildRedirect(returnParams));
    }
  }

  let savedCategoryCount = 0;
  if (categoryProductIds.length > 0) {
    const categoryRowsToSave = categoryProductIds.map((productId) => ({
      product_id: productId,
      site_id: destinationSiteId,
      area_kind: selectedAreaKind,
      remission_category_id: categoryByProduct.get(productId) ?? null,
      updated_by: userId,
    }));

    const { error } = await supabase.from("product_site_area_remission_categories").upsert(categoryRowsToSave, {
      onConflict: "product_id,site_id,area_kind",
    });
    if (error) {
      returnParams.set("error", error.message);
      redirect(buildRedirect(returnParams));
    }
    savedCategoryCount = categoryRowsToSave.length;
  }

  let savedRouteCount = 0;
  if (routeDrafts.length > 0) {
    const routeProductIds = routeDrafts.map((draft) => draft.productId);
    const { data: existingRoutes, error: existingRoutesError } = await supabase
      .from("product_site_production_routes")
      .select("id,product_id,site_id,area_kind,input_location_id,output_mode,output_location_id,output_position_id,is_default,is_active")
      .eq("site_id", originSiteId)
      .eq("is_default", true)
      .in("product_id", routeProductIds);

    if (existingRoutesError) {
      returnParams.set("error", existingRoutesError.message);
      redirect(buildRedirect(returnParams));
    }

    const existingRouteByProductId = new Map(
      ((existingRoutes ?? []) as ProductSiteProductionRouteRow[])
        .map((row) => [String(row.product_id ?? "").trim(), row] as const)
        .filter(([productId]) => Boolean(productId))
    );

    const existingRouteUpdates: Array<{
      id: string;
      row: Record<string, unknown>;
    }> = [];
    const routeRowsToInsert: Array<Record<string, unknown>> = [];

    for (const draft of routeDrafts) {
      const existingRoute = existingRouteByProductId.get(draft.productId);
      const row = {
        product_id: draft.productId,
        site_id: originSiteId,
        area_kind: draft.areaKind,
        route_name: "Ruta de remisión",
        input_location_id: draft.inputLocationId,
        output_mode: "inventory_stock",
        output_location_id: draft.outputLocationId,
        output_position_id: null,
        is_default: true,
        is_active: true,
        updated_by: userId,
      };

      if (existingRoute?.id) {
        existingRouteUpdates.push({
          id: existingRoute.id,
          row,
        });
      } else {
        routeRowsToInsert.push({
          ...row,
          created_by: userId,
        });
      }
    }

    if (existingRouteUpdates.length > 0) {
      const updateResults = await Promise.all(
        existingRouteUpdates.map((draft) =>
          supabase
            .from("product_site_production_routes")
            .update(draft.row)
            .eq("id", draft.id)
        )
      );
      const updateError = updateResults.find((result) => result.error)?.error;
      if (updateError) {
        returnParams.set("error", updateError.message);
        redirect(buildRedirect(returnParams));
      }
    }

    if (routeRowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("product_site_production_routes")
        .insert(routeRowsToInsert);

      if (insertError) {
        returnParams.set("error", insertError.message);
        redirect(buildRedirect(returnParams));
      }
    }

    savedRouteCount = routeDrafts.length;
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/settings/remissions");
  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/remissions");

  const summary = [
    settingRows.length > 0 ? `${settingRows.length} producto(s)` : "",
    savedCategoryCount > 0 ? `${savedCategoryCount} categoría(s)` : "",
    savedRouteCount > 0 ? `${savedRouteCount} ruta(s) de origen` : "",
  ].filter(Boolean);

  returnParams.set("ok", `Guardado: ${summary.join(", ")}.`);
  redirect(buildRedirect(returnParams));
}

export async function applyBulkProductSettings(formData: FormData) {
  "use server";

  const destinationSiteId = asText(formData.get("destination_site_id"));
  const originSiteId = asText(formData.get("origin_site_id"));
  const rawProfile = asText(formData.get("bulk_profile"));
  const selectedAreaKind = normalizeAreaKind(asText(formData.get("area_kind")));
  const productIds = uniqueFormValues(formData, "product_id");

  const returnParams = commonReturnParams({
    destinationSiteId,
    originSiteId,
    rawProfile,
    selectedAreaKind,
  });

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
      .select("id,product_id,site_id,is_active,default_area_kind,area_kinds,remission_enabled,local_production_enabled,production_location_id,sales_enabled,inventory_enabled,min_stock_qty,remission_category_id")
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
        inventory_enabled: true,
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
          inventory_enabled: current?.inventory_enabled ?? current?.is_active ?? false,
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
  const returnParams = commonReturnParams({
    destinationSiteId,
    originSiteId,
    rawProfile,
    selectedAreaKind,
  });

  if (!destinationSiteId || !selectedAreaKind || !name) {
    returnParams.set("error", "Selecciona sede destino, área solicitante y escribe el nombre de la categoría.");
    redirect(buildRedirect(returnParams));
  }

  const { supabase, userId } = await requireManager(buildRedirect(returnParams));
  const normalizedName = name.trim();

  const { data: duplicateRows } = await supabase
    .from("remission_product_categories")
    .select("id,name")
    .eq("site_id", destinationSiteId)
    .eq("area_kind", selectedAreaKind)
    .eq("is_active", true);

  const duplicated = ((duplicateRows ?? []) as Array<{ id: string; name: string | null }>).some(
    (row) => String(row.name ?? "").trim().toLowerCase() === normalizedName.toLowerCase()
  );

  if (duplicated) {
    returnParams.set("error", "Ya existe una categoría activa con ese nombre para esta área.");
    redirect(buildRedirect(returnParams));
  }

  const { count } = await supabase
    .from("remission_product_categories")
    .select("id", { count: "exact", head: true })
    .eq("site_id", destinationSiteId)
    .eq("area_kind", selectedAreaKind);

  const { error } = await supabase.from("remission_product_categories").insert({
    site_id: destinationSiteId,
    area_kind: selectedAreaKind,
    name: normalizedName,
    sort_order: count ?? 0,
    is_active: true,
    updated_by: userId,
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
  const productIds = uniqueFormValues(formData, "category_product_id");
  const returnParams = commonReturnParams({
    destinationSiteId,
    originSiteId,
    rawProfile,
    selectedAreaKind,
  });

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


export async function updateRemissionCategory(formData: FormData) {
  "use server";

  const destinationSiteId = asText(formData.get("destination_site_id"));
  const originSiteId = asText(formData.get("origin_site_id"));
  const rawProfile = asText(formData.get("bulk_profile"));
  const selectedAreaKind = normalizeAreaKind(asText(formData.get("area_kind")));
  const categoryId = asText(formData.get("category_id"));
  const name = asText(formData.get("category_name"));
  const sortOrderRaw = asText(formData.get("sort_order"));
  const returnParams = commonReturnParams({
    destinationSiteId,
    originSiteId,
    rawProfile,
    selectedAreaKind,
  });

  if (!destinationSiteId || !selectedAreaKind || !categoryId || !name) {
    returnParams.set("error", "Selecciona categoría y escribe un nombre válido.");
    redirect(buildRedirect(returnParams));
  }

  const sortOrder = sortOrderRaw ? Number(sortOrderRaw) : null;
  if (sortOrder !== null && (!Number.isFinite(sortOrder) || sortOrder < 0)) {
    returnParams.set("error", "El orden de la categoría no es válido.");
    redirect(buildRedirect(returnParams));
  }

  const { supabase, userId } = await requireManager(buildRedirect(returnParams));
  const normalizedName = name.trim();

  const { data: currentCategory } = await supabase
    .from("remission_product_categories")
    .select("id,site_id,area_kind,is_active")
    .eq("id", categoryId)
    .maybeSingle();

  const current = currentCategory as {
    id: string;
    site_id: string | null;
    area_kind: string | null;
    is_active: boolean | null;
  } | null;

  if (
    !current ||
    current.site_id !== destinationSiteId ||
    normalizeAreaKind(current.area_kind) !== selectedAreaKind ||
    current.is_active === false
  ) {
    returnParams.set("error", "La categoría no pertenece a la sede y área seleccionadas.");
    redirect(buildRedirect(returnParams));
  }

  const { data: duplicateRows } = await supabase
    .from("remission_product_categories")
    .select("id,name")
    .eq("site_id", destinationSiteId)
    .eq("area_kind", selectedAreaKind)
    .eq("is_active", true);

  const duplicated = ((duplicateRows ?? []) as Array<{ id: string; name: string | null }>).some(
    (row) =>
      row.id !== categoryId &&
      String(row.name ?? "").trim().toLowerCase() === normalizedName.toLowerCase()
  );

  if (duplicated) {
    returnParams.set("error", "Ya existe otra categoría activa con ese nombre para esta área.");
    redirect(buildRedirect(returnParams));
  }

  const patch: Record<string, unknown> = {
    name: normalizedName,
    updated_by: userId,
  };

  if (sortOrder !== null) {
    patch.sort_order = sortOrder;
  }

  const { error } = await supabase
    .from("remission_product_categories")
    .update(patch)
    .eq("id", categoryId)
    .eq("site_id", destinationSiteId)
    .eq("area_kind", selectedAreaKind);

  if (error) {
    returnParams.set("error", error.message);
    redirect(buildRedirect(returnParams));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  returnParams.set("ok", "Categoría actualizada.");
  redirect(buildRedirect(returnParams));
}

export async function mergeRemissionCategory(formData: FormData) {
  "use server";

  const destinationSiteId = asText(formData.get("destination_site_id"));
  const originSiteId = asText(formData.get("origin_site_id"));
  const rawProfile = asText(formData.get("bulk_profile"));
  const selectedAreaKind = normalizeAreaKind(asText(formData.get("area_kind")));
  const sourceCategoryId = asText(formData.get("source_category_id"));
  const targetCategoryId = asText(formData.get("target_category_id"));
  const archiveSource = !["0", "false", "no"].includes(
    asText(formData.get("archive_source")).toLowerCase()
  );
  const returnParams = commonReturnParams({
    destinationSiteId,
    originSiteId,
    rawProfile,
    selectedAreaKind,
  });

  if (!destinationSiteId || !selectedAreaKind || !sourceCategoryId || !targetCategoryId) {
    returnParams.set("error", "Selecciona categoría origen y categoría destino.");
    redirect(buildRedirect(returnParams));
  }

  if (sourceCategoryId === targetCategoryId) {
    returnParams.set("error", "La categoría origen y destino no pueden ser la misma.");
    redirect(buildRedirect(returnParams));
  }

  const { supabase, userId } = await requireManager(buildRedirect(returnParams));
  const { data: categoryRows } = await supabase
    .from("remission_product_categories")
    .select("id,site_id,area_kind,is_active")
    .in("id", [sourceCategoryId, targetCategoryId]);

  const categories = (categoryRows ?? []) as Array<{
    id: string;
    site_id: string | null;
    area_kind: string | null;
    is_active: boolean | null;
  }>;

  const source = categories.find((category) => category.id === sourceCategoryId) ?? null;
  const target = categories.find((category) => category.id === targetCategoryId) ?? null;

  const validCategory = (category: typeof source) =>
    Boolean(
      category &&
      category.site_id === destinationSiteId &&
      normalizeAreaKind(category.area_kind) === selectedAreaKind &&
      category.is_active !== false
    );

  if (!validCategory(source) || !validCategory(target)) {
    returnParams.set("error", "Las categorías no pertenecen a la sede y área seleccionadas.");
    redirect(buildRedirect(returnParams));
  }

  const { error: areaError } = await supabase
    .from("product_site_area_remission_categories")
    .update({
      remission_category_id: targetCategoryId,
      updated_by: userId,
    })
    .eq("site_id", destinationSiteId)
    .eq("area_kind", selectedAreaKind)
    .eq("remission_category_id", sourceCategoryId);

  if (areaError) {
    returnParams.set("error", areaError.message);
    redirect(buildRedirect(returnParams));
  }

  const { error: fallbackError } = await supabase
    .from("product_site_settings")
    .update({
      remission_category_id: targetCategoryId,
    })
    .eq("site_id", destinationSiteId)
    .eq("remission_category_id", sourceCategoryId);

  if (fallbackError) {
    returnParams.set("error", fallbackError.message);
    redirect(buildRedirect(returnParams));
  }

  if (archiveSource) {
    const { error: archiveError } = await supabase
      .from("remission_product_categories")
      .update({
        is_active: false,
        updated_by: userId,
      })
      .eq("id", sourceCategoryId)
      .eq("site_id", destinationSiteId)
      .eq("area_kind", selectedAreaKind);

    if (archiveError) {
      returnParams.set("error", archiveError.message);
      redirect(buildRedirect(returnParams));
    }
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  returnParams.set("ok", "Categoría fusionada.");
  redirect(buildRedirect(returnParams));
}

export async function archiveRemissionCategory(formData: FormData) {
  "use server";

  const destinationSiteId = asText(formData.get("destination_site_id"));
  const originSiteId = asText(formData.get("origin_site_id"));
  const rawProfile = asText(formData.get("bulk_profile"));
  const selectedAreaKind = normalizeAreaKind(asText(formData.get("area_kind")));
  const categoryId = asText(formData.get("category_id"));
  const returnParams = commonReturnParams({
    destinationSiteId,
    originSiteId,
    rawProfile,
    selectedAreaKind,
  });

  if (!destinationSiteId || !selectedAreaKind || !categoryId) {
    returnParams.set("error", "Selecciona una categoría para archivar.");
    redirect(buildRedirect(returnParams));
  }

  const { supabase, userId } = await requireManager(buildRedirect(returnParams));

  const [{ count: areaCount }, { count: fallbackCount }] = await Promise.all([
    supabase
      .from("product_site_area_remission_categories")
      .select("product_id", { count: "exact", head: true })
      .eq("site_id", destinationSiteId)
      .eq("area_kind", selectedAreaKind)
      .eq("remission_category_id", categoryId),
    supabase
      .from("product_site_settings")
      .select("product_id", { count: "exact", head: true })
      .eq("site_id", destinationSiteId)
      .eq("remission_category_id", categoryId),
  ]);

  const assignedCount = (areaCount ?? 0) + (fallbackCount ?? 0);
  if (assignedCount > 0) {
    returnParams.set("error", "No se puede archivar una categoría con productos. Primero fusiónala con otra categoría.");
    redirect(buildRedirect(returnParams));
  }

  const { error } = await supabase
    .from("remission_product_categories")
    .update({
      is_active: false,
      updated_by: userId,
    })
    .eq("id", categoryId)
    .eq("site_id", destinationSiteId)
    .eq("area_kind", selectedAreaKind);

  if (error) {
    returnParams.set("error", error.message);
    redirect(buildRedirect(returnParams));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  returnParams.set("ok", "Categoría archivada.");
  redirect(buildRedirect(returnParams));
}

export async function deleteEmptyRemissionCategory(formData: FormData) {
  "use server";

  const destinationSiteId = asText(formData.get("destination_site_id"));
  const originSiteId = asText(formData.get("origin_site_id"));
  const rawProfile = asText(formData.get("bulk_profile"));
  const selectedAreaKind = normalizeAreaKind(asText(formData.get("area_kind")));
  const categoryId = asText(formData.get("category_id"));
  const returnParams = commonReturnParams({
    destinationSiteId,
    originSiteId,
    rawProfile,
    selectedAreaKind,
  });

  if (!destinationSiteId || !selectedAreaKind || !categoryId) {
    returnParams.set("error", "Selecciona una categoría para eliminar.");
    redirect(buildRedirect(returnParams));
  }

  const { supabase } = await requireManager(buildRedirect(returnParams));

  const [{ count: areaCount }, { count: fallbackCount }] = await Promise.all([
    supabase
      .from("product_site_area_remission_categories")
      .select("product_id", { count: "exact", head: true })
      .eq("site_id", destinationSiteId)
      .eq("area_kind", selectedAreaKind)
      .eq("remission_category_id", categoryId),
    supabase
      .from("product_site_settings")
      .select("product_id", { count: "exact", head: true })
      .eq("site_id", destinationSiteId)
      .eq("remission_category_id", categoryId),
  ]);

  const assignedCount = (areaCount ?? 0) + (fallbackCount ?? 0);
  if (assignedCount > 0) {
    returnParams.set("error", "No se puede eliminar una categoría con productos. Primero fusiónala con otra categoría.");
    redirect(buildRedirect(returnParams));
  }

  const { error } = await supabase
    .from("remission_product_categories")
    .delete()
    .eq("id", categoryId)
    .eq("site_id", destinationSiteId)
    .eq("area_kind", selectedAreaKind);

  if (error) {
    returnParams.set("error", error.message);
    redirect(buildRedirect(returnParams));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  returnParams.set("ok", "Categoría eliminada.");
  redirect(buildRedirect(returnParams));
}

export async function reorderRemissionCategories(formData: FormData) {
  "use server";

  const destinationSiteId = asText(formData.get("destination_site_id"));
  const originSiteId = asText(formData.get("origin_site_id"));
  const rawProfile = asText(formData.get("bulk_profile"));
  const selectedAreaKind = normalizeAreaKind(asText(formData.get("area_kind")));
  const categoryIds = uniqueFormValues(formData, "category_id");
  const returnParams = commonReturnParams({
    destinationSiteId,
    originSiteId,
    rawProfile,
    selectedAreaKind,
  });

  if (!destinationSiteId || !selectedAreaKind || categoryIds.length === 0) {
    returnParams.set("error", "No hay categorías para reordenar.");
    redirect(buildRedirect(returnParams));
  }

  const { supabase, userId } = await requireManager(buildRedirect(returnParams));

  const { data: categoryRows } = await supabase
    .from("remission_product_categories")
    .select("id,site_id,area_kind")
    .eq("site_id", destinationSiteId)
    .eq("area_kind", selectedAreaKind)
    .eq("is_active", true);

  const validCategoryIds = new Set(
    ((categoryRows ?? []) as Array<{ id: string | null; site_id: string | null; area_kind: string | null }>)
      .filter((category) => category.site_id === destinationSiteId && normalizeAreaKind(category.area_kind) === selectedAreaKind)
      .map((category) => String(category.id ?? "").trim())
      .filter(Boolean)
  );

  const invalidCategoryIds = categoryIds.filter((categoryId) => !validCategoryIds.has(categoryId));
  if (invalidCategoryIds.length > 0) {
    returnParams.set("error", "Hay categorías inválidas en el orden enviado.");
    redirect(buildRedirect(returnParams));
  }

  const updates = categoryIds.map((categoryId, index) =>
    supabase
      .from("remission_product_categories")
      .update({
        sort_order: index,
        updated_by: userId,
      })
      .eq("id", categoryId)
      .eq("site_id", destinationSiteId)
      .eq("area_kind", selectedAreaKind)
  );

  const results = await Promise.all(updates);
  const error = results.find((result) => result.error)?.error;
  if (error) {
    returnParams.set("error", error.message);
    redirect(buildRedirect(returnParams));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  returnParams.set("ok", "Orden de categorías actualizado.");
  redirect(buildRedirect(returnParams));
}
