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

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type FulfillmentRouteSnapshot = {
  id: string;
  product_id: string;
  from_site_id: string;
  to_site_id: string;
  requesting_area_kind: string | null;
  preparing_area_kind: string | null;
  preferred_source_location_id: string | null;
  preferred_destination_location_id: string | null;
  supply_mode: string;
  production_execution_mode: string | null;
  ready_location_id: string | null;
  is_active: boolean;
};

function fulfillmentRouteBlockReason(route: FulfillmentRouteSnapshot): string | null {
  if (!route.is_active) return "La ruta operativa está inactiva.";

  const missing: string[] = [];
  if (!normalizeAreaKind(route.preparing_area_kind)) missing.push("área responsable");

  if (route.supply_mode === "production") {
    if (!route.production_execution_mode) missing.push("modo de ejecución de producción");
    if (!route.ready_location_id) missing.push("LOC de producto listo");
  } else if (!route.preferred_source_location_id) {
    missing.push("LOC de salida");
  }

  return missing.length > 0 ? `Ruta incompleta: falta ${missing.join(", ")}.` : null;
}

async function recalculateBlockedTasksForRoute(params: {
  supabase: SupabaseClient;
  route: FulfillmentRouteSnapshot;
  userId: string;
}): Promise<{ count: number; error: string | null }> {
  const { supabase, route, userId } = params;
  const requestingAreaKind = normalizeAreaKind(route.requesting_area_kind) || null;
  const preparingAreaKind = normalizeAreaKind(route.preparing_area_kind) || null;
  const isProduction = route.supply_mode === "production";
  const blockReason = fulfillmentRouteBlockReason(route);

  let candidateQuery = supabase
    .from("restock_item_fulfillments")
    .select("id,route_id,shortage_reason")
    .eq("product_id", route.product_id)
    .eq("from_site_id", route.from_site_id)
    .eq("to_site_id", route.to_site_id)
    .eq("status", "blocked")
    .eq("reserved_base_qty", 0)
    .eq("ready_base_qty", 0)
    .eq("allocated_base_qty", 0)
    .eq("released_base_qty", 0)
    .eq("cancelled_base_qty", 0);

  candidateQuery = requestingAreaKind
    ? candidateQuery.eq("requesting_area_kind", requestingAreaKind)
    : candidateQuery.is("requesting_area_kind", null);

  const { data: candidates, error: candidatesError } = await candidateQuery;
  if (candidatesError) return { count: 0, error: candidatesError.message };

  const taskIds = (candidates ?? [])
    .filter((task) => {
      const reason = String(task.shortage_reason ?? "").toLowerCase();
      return !task.route_id || reason.includes("ruta") || reason.includes("abastecimiento");
    })
    .map((task) => String(task.id ?? "").trim())
    .filter(Boolean);

  if (taskIds.length === 0) return { count: 0, error: null };

  const { data, error } = await supabase
    .from("restock_item_fulfillments")
    .update({
      route_id: route.id,
      preparing_area_kind: preparingAreaKind,
      source_location_id: isProduction ? null : route.preferred_source_location_id,
      destination_location_id: route.preferred_destination_location_id,
      supply_mode: route.supply_mode,
      production_execution_mode: isProduction ? route.production_execution_mode : null,
      ready_location_id: isProduction ? route.ready_location_id : null,
      status: blockReason ? "blocked" : "pending",
      shortage_reason: blockReason,
      notes: blockReason
        ? "La tarea se recalculó después de actualizar su ruta, pero la configuración sigue incompleta."
        : isProduction
          ? "Ruta corregida. La tarea conserva el modo de producción y el LOC donde quedará listo el terminado."
          : "Ruta corregida. La ubicación interna se resolverá al preparar y despachar.",
      updated_by: userId,
    })
    .in("id", taskIds)
    .eq("status", "blocked")
    .select("id");

  return {
    count: data?.length ?? 0,
    error: error?.message ?? null,
  };
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
    touched: boolean;
    enabled: boolean;
    areaKind: string;
    sourceLocationId: string;
    supplyMode: string;
  }> = [];

  if (productIds.length > 0) {
    const [
      { data: capabilityRows },
      { data: productsData },
      { data: profilesData },
      { data: locationsData },
      { data: originAreasData },
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
        .select("id,site_id,is_active,area_id")
        .eq("site_id", originSiteId)
        .eq("is_active", true),
      supabase
        .from("areas")
        .select("id,site_id,kind,is_active")
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

    type OriginLocationRow = LocationRow & { area_id?: string | null };
    type OriginAreaRow = { id: string; kind: string | null; is_active: boolean | null };

    const originLocations = (locationsData ?? []) as OriginLocationRow[];
    const originAreas = (originAreasData ?? []) as OriginAreaRow[];
    const hasOriginLocation = originLocations.some((location) => location.is_active !== false);
    const originLocationById = new Map(
      originLocations
        .map((location) => [String(location.id ?? "").trim(), location] as const)
        .filter(([locationId]) => Boolean(locationId))
    );
    const originAreaById = new Map(
      originAreas
        .map((area) => [String(area.id ?? "").trim(), area] as const)
        .filter(([areaId]) => Boolean(areaId))
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

    const validProductIdSet = new Set(
      settingRows.map((row) => String(row.product_id ?? "")).filter(Boolean)
    );
    const allowedSupplyModes = new Set(["stock", "production"]);
    const defaultSupplyMode = bulkProfile === "preparation_from_origin" ? "production" : "stock";

    routeDrafts = productIds
      .filter((productId) => validProductIdSet.has(productId))
      .map((productId) => {
        const touched = checked(formData.get(`origin_route_touched_${productId}`));
        if (!touched) return null;

        const enabled = checked(formData.get(`origin_route_enabled_${productId}`));
        const areaKind = normalizeAreaKind(asText(formData.get(`origin_area_kind_${productId}`)));
        const sourceLocationId = asText(
          formData.get(`origin_source_location_id_${productId}`)
        );
        const rawSupplyMode = asText(formData.get(`origin_supply_mode_${productId}`));
        const supplyMode = allowedSupplyModes.has(rawSupplyMode)
          ? rawSupplyMode
          : defaultSupplyMode;

        return {
          productId,
          touched,
          enabled,
          areaKind,
          sourceLocationId,
          supplyMode,
        };
      })
      .filter(
        (
          draft
        ): draft is {
          productId: string;
          touched: true;
          enabled: boolean;
          areaKind: string;
          sourceLocationId: string;
          supplyMode: string;
        } => draft !== null
      );

    const incompleteRoute = routeDrafts.some(
      (draft) => draft.enabled && (!draft.areaKind || !draft.sourceLocationId)
    );
    if (incompleteRoute) {
      returnParams.set(
        "error",
        "Completa el área responsable o productora y el LOC asociado en las rutas operativas activas."
      );
      redirect(buildRedirect(returnParams));
    }

    const invalidRoute = routeDrafts.some((draft) => {
      if (!draft.enabled) return false;
      const location = originLocationById.get(draft.sourceLocationId);
      if (!location || location.is_active === false || location.site_id !== originSiteId) return true;
      const areaId = String(location.area_id ?? "").trim();
      const area = areaId ? originAreaById.get(areaId) : null;
      return !area || area.is_active === false || normalizeAreaKind(area.kind) !== draft.areaKind;
    });
    if (invalidRoute) {
      returnParams.set(
        "error",
        "El LOC de salida debe pertenecer al área responsable seleccionada y a la sede origen."
      );
      redirect(buildRedirect(returnParams));
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

    const { error } = await supabase
      .from("product_site_area_remission_categories")
      .upsert(categoryRowsToSave, {
        onConflict: "product_id,site_id,area_kind",
      });
    if (error) {
      returnParams.set("error", error.message);
      redirect(buildRedirect(returnParams));
    }
    savedCategoryCount = categoryRowsToSave.length;
  }

  let savedRouteCount = 0;
  let recalculatedTaskCount = 0;
  if (routeDrafts.length > 0) {
    const routeProductIds = Array.from(new Set(routeDrafts.map((draft) => draft.productId)));
    const { data: existingRoutes, error: existingRoutesError } = await supabase
      .from("product_fulfillment_routes")
      .select("id,product_id,requesting_area_kind,is_active,updated_at,production_execution_mode")
      .eq("from_site_id", originSiteId)
      .eq("to_site_id", destinationSiteId)
      .in("product_id", routeProductIds);

    if (existingRoutesError) {
      returnParams.set("error", existingRoutesError.message);
      redirect(buildRedirect(returnParams));
    }

    type ExistingFulfillmentRoute = {
      id: string;
      product_id: string;
      requesting_area_kind: string | null;
      is_active: boolean | null;
      updated_at: string | null;
      production_execution_mode: string | null;
    };

    const existingRoutesByProductId = new Map<string, ExistingFulfillmentRoute[]>();
    for (const route of (existingRoutes ?? []) as ExistingFulfillmentRoute[]) {
      if (normalizeAreaKind(route.requesting_area_kind) !== selectedAreaKind) continue;
      const productId = String(route.product_id ?? "").trim();
      if (!productId) continue;
      const current = existingRoutesByProductId.get(productId) ?? [];
      current.push(route);
      existingRoutesByProductId.set(productId, current);
    }

    const routeTimestamp = (route: ExistingFulfillmentRoute) => {
      const timestamp = Date.parse(String(route.updated_at ?? ""));
      return Number.isFinite(timestamp) ? timestamp : 0;
    };

    for (const draft of routeDrafts) {
      const matchingRoutes = existingRoutesByProductId.get(draft.productId) ?? [];
      const orderedRoutes = [...matchingRoutes].sort((left, right) => {
        const activeDifference = Number(right.is_active !== false) - Number(left.is_active !== false);
        if (activeDifference !== 0) return activeDifference;
        return routeTimestamp(right) - routeTimestamp(left);
      });
      const canonicalRoute = orderedRoutes[0] ?? null;
      const activeRouteIds = matchingRoutes
        .filter((route) => route.is_active !== false)
        .map((route) => route.id);

      if (!draft.enabled) {
        if (activeRouteIds.length > 0) {
          const { error } = await supabase
            .from("product_fulfillment_routes")
            .update({ is_active: false, updated_by: userId })
            .in("id", activeRouteIds);
          if (error) {
            returnParams.set("error", error.message);
            redirect(buildRedirect(returnParams));
          }
          savedRouteCount += activeRouteIds.length;
        }
        continue;
      }

      // La ruta lógica es única por producto + origen + destino + área solicitante.
      // Antes de actualizarla, desactiva cualquier duplicado activo del mismo alcance.
      const duplicateActiveRouteIds = activeRouteIds.filter(
        (routeId) => routeId !== canonicalRoute?.id
      );
      if (duplicateActiveRouteIds.length > 0) {
        const { error } = await supabase
          .from("product_fulfillment_routes")
          .update({ is_active: false, updated_by: userId })
          .in("id", duplicateActiveRouteIds);
        if (error) {
          returnParams.set("error", error.message);
          redirect(buildRedirect(returnParams));
        }
      }

      const isProductionRoute = draft.supplyMode === "production";
      const productionExecutionMode = isProductionRoute
        ? canonicalRoute?.production_execution_mode === "recipe"
          ? "recipe"
          : "simple"
        : null;
      const routePatch = {
        preparing_area_kind: draft.areaKind,
        preferred_source_location_id: isProductionRoute ? null : draft.sourceLocationId,
        preferred_destination_location_id: null,
        supply_mode: draft.supplyMode,
        production_execution_mode: productionExecutionMode,
        ready_location_id: isProductionRoute ? draft.sourceLocationId : null,
        is_active: true,
        updated_by: userId,
      };

      let savedRoute: FulfillmentRouteSnapshot | null = null;
      if (canonicalRoute?.id) {
        const { data, error } = await supabase
          .from("product_fulfillment_routes")
          .update(routePatch)
          .eq("id", canonicalRoute.id)
          .select(
            "id,product_id,from_site_id,to_site_id,requesting_area_kind,preparing_area_kind,preferred_source_location_id,preferred_destination_location_id,supply_mode,production_execution_mode,ready_location_id,is_active"
          )
          .single();
        if (error || !data) {
          returnParams.set("error", error?.message ?? "No fue posible actualizar la ruta operativa.");
          redirect(buildRedirect(returnParams));
        }
        savedRoute = data as FulfillmentRouteSnapshot;
      } else {
        const { data, error } = await supabase
          .from("product_fulfillment_routes")
          .insert({
            product_id: draft.productId,
            from_site_id: originSiteId,
            to_site_id: destinationSiteId,
            requesting_area_kind: selectedAreaKind,
            ...routePatch,
            dispatch_policy: "next_available",
            estimated_lead_minutes: null,
            allow_substitution: false,
            notes: null,
            created_by: userId,
          })
          .select(
            "id,product_id,from_site_id,to_site_id,requesting_area_kind,preparing_area_kind,preferred_source_location_id,preferred_destination_location_id,supply_mode,production_execution_mode,ready_location_id,is_active"
          )
          .single();
        if (error || !data) {
          returnParams.set("error", error?.message ?? "No fue posible crear la ruta operativa.");
          redirect(buildRedirect(returnParams));
        }
        savedRoute = data as FulfillmentRouteSnapshot;
      }

      const recalculation = await recalculateBlockedTasksForRoute({
        supabase,
        route: savedRoute,
        userId,
      });
      if (recalculation.error) {
        returnParams.set(
          "error",
          `La ruta se guardó, pero no fue posible recalcular sus tareas bloqueadas: ${recalculation.error}`
        );
        redirect(buildRedirect(returnParams));
      }
      recalculatedTaskCount += recalculation.count;
      savedRouteCount += 1;
    }
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/settings/remissions");
  revalidatePath("/inventory/settings/fulfillment-routes");
  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/remissions");
  revalidatePath("/inventory/remissions/fulfillment");

  const summary = [
    settingRows.length > 0 ? `${settingRows.length} producto(s)` : "",
    savedCategoryCount > 0 ? `${savedCategoryCount} categoría(s)` : "",
    savedRouteCount > 0 ? `${savedRouteCount} ruta(s) operativa(s)` : "",
    recalculatedTaskCount > 0 ? `${recalculatedTaskCount} tarea(s) desbloqueada(s)` : "",
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