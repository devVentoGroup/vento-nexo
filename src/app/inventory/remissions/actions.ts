"use server";

import { redirect } from "next/navigation";

import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";
import {
  checkOperationalSessionPermission,
  resolveOperationalSession,
} from "@/lib/auth/operational-session";
import {
  buildOperationalBlockMessage,
  checkOperationalPermission,
  getOperationalContext,
} from "@/lib/auth/operational-context";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import {
  attachSharedDeviceActionSignatureTarget,
  requireSharedDeviceActorSignature,
} from "@/lib/auth/shared-device-signature";
import { createClient } from "@/lib/supabase/server";
import {
  convertByProductProfile,
  normalizeUnitCode,
  roundQuantity,
  type ProductUomProfile,
} from "@/lib/inventory/uom";
import {
  getRequestPolicyInputUnitCode,
  mapProductRequestPolicyRow,
  validateRequestedPolicyQuantity,
  type ProductRequestPolicyRow,
} from "@/lib/inventory/request-policy";
import {
  asText,
  getListActionsForRemission,
  loadProductSiteRows,
  normalizeMeasurementMode,
  parseNumber,
  parseProductionPackagePlan,
  readBooleanAppSetting,
  supportsRemission,
  supportsRequestedArea,
  toFriendlyRemissionActionError,
  usesActualQuantityMode,
  usesProductionPackageDispatch,
  type MeasurementMode,
  type ProductProfileWithProduct,
  type ProductRow,
  type ProductionPackagePlanItem,
  type RemissionListAction,
} from "./page-helpers";
import {
  resolveOperationalRemissionAreaScope,
  resolveSharedDeviceOperationalRemissionAreaScope,
} from "./operational-area-scope";

const APP_ID = "nexo";
const REMISSIONS_INVENTORY_POSTING_SETTING_KEY =
  "remissions.inventory_posting_enabled";

const PERMISSIONS = {
  remissionsRequest: "inventory.remissions.request",
  remissionsCancel: "inventory.remissions.cancel",
  remissionsEditOwnPending: "inventory.remissions.edit_own_pending",
};
export async function runRemissionListAction(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/remissions"));
  }

  const requestId = asText(formData.get("request_id"));
  const action = asText(formData.get("action"));
  if (!requestId || !["cancel", "delete", "reverse_cancel"].includes(action)) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("Acción inválida para la remisión."),
    );
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const actualRole = String(employee?.role ?? "");

  const { data: request } = await supabase
    .from("restock_requests")
    .select("id,status,from_site_id,to_site_id,notes,created_by")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("La remisión no existe o no está disponible."),
    );
  }

  const canFrom = request.from_site_id
    ? await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsCancel,
        context: { siteId: request.from_site_id },
        actualRole,
      })
    : false;
  const canTo = request.to_site_id
    ? await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsCancel,
        context: { siteId: request.to_site_id },
        actualRole,
      })
    : false;
  const canGlobal = await checkPermissionWithRoleOverride({
    supabase,
    appId: APP_ID,
    code: PERMISSIONS.remissionsCancel,
    actualRole,
  });
  const canCancel = canFrom || canTo || canGlobal;
  if (!canCancel) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("No tienes permisos para esta acción."),
    );
  }
  const inventoryPostingEnabled = await readBooleanAppSetting(
    supabase,
    REMISSIONS_INVENTORY_POSTING_SETTING_KEY,
    false,
  );
  const canReverseScope =
    inventoryPostingEnabled && (canGlobal || (canFrom && canTo));
  const canEditOwnPending =
    String(request.created_by ?? "") === user.id &&
    String(request.status ?? "") === "pending" &&
    String(request.to_site_id ?? "") !== "" &&
    (await checkPermissionWithRoleOverride({
      supabase,
      appId: APP_ID,
      code: PERMISSIONS.remissionsEditOwnPending,
      context: { siteId: request.to_site_id },
      actualRole,
    }));

  const actionMatrix = getListActionsForRemission(
    request.status,
    request.notes,
    true,
    canReverseScope,
    canEditOwnPending,
  );
  if (!actionMatrix.includes(action as RemissionListAction)) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          "Esa acción no aplica para el estado actual de la remisión.",
        ),
    );
  }

  if (action === "cancel") {
    const { error } = await supabase
      .from("restock_requests")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        status_updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    if (error) {
      redirect(
        "/inventory/remissions?error=" +
          encodeURIComponent(toFriendlyRemissionActionError(error.message)),
      );
    }
    redirect(
      "/inventory/remissions?ok=" + encodeURIComponent("Remisión cancelada."),
    );
  }

  if (action === "reverse_cancel") {
    const { error: reverseError } = await supabase.rpc(
      "reverse_restock_request",
      {
        p_request_id: requestId,
      },
    );
    if (reverseError) {
      redirect(
        "/inventory/remissions?error=" +
          encodeURIComponent(
            toFriendlyRemissionActionError(reverseError.message),
          ),
      );
    }
    redirect(
      "/inventory/remissions?ok=" +
        encodeURIComponent(
          "Remisión anulada con reversa de inventario aplicada.",
        ),
    );
  }

  const deleteRequest = async () =>
    supabase.from("restock_requests").delete().eq("id", requestId).select("id");
  let { data: deletedRows, error } = await deleteRequest();

  if (error) {
    const hasMovementTrace =
      /inventory_movements/i.test(error.message) ||
      /related_restock_request_id/i.test(error.message);

    if (!hasMovementTrace) {
      const { error: deleteItemsError } = await supabase
        .from("restock_request_items")
        .delete()
        .eq("request_id", requestId);
      if (!deleteItemsError) {
        const retry = await deleteRequest();
        deletedRows = retry.data;
        error = retry.error;
      } else {
        error = deleteItemsError;
      }
    }

    if (error && hasMovementTrace) {
      const { error: cancelErr } = await supabase
        .from("restock_requests")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          status_updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);
      if (!cancelErr) {
        redirect(
          "/inventory/remissions?ok=" +
            encodeURIComponent(
              "No se pudo eliminar por trazabilidad. Se canceló la remisión.",
            ),
        );
      }
    }

    if (error) {
      redirect(
        "/inventory/remissions?error=" +
          encodeURIComponent(toFriendlyRemissionActionError(error.message)),
      );
    }
  }

  if (!deletedRows || deletedRows.length === 0) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("No se pudo eliminar la remisión."),
    );
  }

  redirect(
    "/inventory/remissions?ok=" + encodeURIComponent("Remisión eliminada."),
  );
}

export async function createRemission(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/remissions"));
  }
  const operationalSession = await resolveOperationalSession({
    supabase,
    userId: user.id,
    appId: APP_ID,
  });
  const inventoryPostingEnabled = await readBooleanAppSetting(
    supabase,
    REMISSIONS_INVENTORY_POSTING_SETTING_KEY,
    false,
  );

  const fromSiteId = asText(formData.get("from_site_id"));
  const toSiteId = asText(formData.get("to_site_id"));
  const expectedDate = asText(formData.get("expected_date"));
  const notes = asText(formData.get("notes"));
  const sharedActorPin = asText(formData.get("shared_actor_pin"));
  if (
    operationalSession.isSharedDevice &&
    String(operationalSession.siteId ?? "").trim() !== toSiteId
  ) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("Este dispositivo compartido solo puede solicitar remisiones para su sede operativa."),
    );
  }

  const productIds = formData
    .getAll("item_product_id")
    .map((v) => String(v).trim());
  const quantities = formData
    .getAll("item_quantity")
    .map((v) => String(v).trim());
  const inputUnits = formData
    .getAll("item_input_unit_code")
    .map((v) => normalizeUnitCode(String(v).trim()));
  const inputUomProfileIds = formData
    .getAll("item_input_uom_profile_id")
    .map((v) => String(v).trim());
  const inputQuantities = formData
    .getAll("item_quantity_in_input")
    .map((v) => String(v).trim());
  const requestPolicyIds = formData
    .getAll("item_request_policy_id")
    .map((v) => String(v).trim());
  const requestedPolicyQuantities = formData
    .getAll("item_requested_policy_qty")
    .map((v) => String(v).trim());
  const areaKinds = formData
    .getAll("item_area_kind")
    .map((v) => String(v).trim());
  const productionPackagePlans = formData
    .getAll("item_production_package_plan")
    .map((v) => parseProductionPackagePlan(String(v ?? "")));

  const productIdsForLookup = Array.from(new Set(productIds.filter(Boolean)));
  const { data: productProfileLookupData } = productIdsForLookup.length
    ? await supabase
        .from("product_inventory_profiles")
        .select(
          "product_id,inventory_kind,measurement_mode,default_tolerance_percent,requires_actual_dispatch_qty,requires_count_alongside_weight,products(id,unit,stock_unit_code,product_type)",
        )
        .in("product_id", productIdsForLookup)
    : { data: [] as ProductProfileWithProduct[] };

  const productRowsFromProfiles = (
    (productProfileLookupData ?? []) as unknown as ProductProfileWithProduct[]
  )
    .map<ProductRow | null>((row) => {
      if (!row.products) return null;

      return {
        ...row.products,
        inventory_kind: row.inventory_kind ?? null,
        measurement_mode: normalizeMeasurementMode(row.measurement_mode),
        default_tolerance_percent: row.default_tolerance_percent ?? null,
        requires_actual_dispatch_qty:
          typeof row.requires_actual_dispatch_qty === "boolean"
            ? row.requires_actual_dispatch_qty
            : usesActualQuantityMode(row.measurement_mode),
        requires_count_alongside_weight:
          typeof row.requires_count_alongside_weight === "boolean"
            ? row.requires_count_alongside_weight
            : normalizeMeasurementMode(row.measurement_mode) ===
              "count_with_weight",
      };
    })
    .filter((row): row is ProductRow => row !== null);

  const profileLookupIds = new Set(
    productRowsFromProfiles.map((product) => product.id),
  );
  const missingProductIdsForLookup = productIdsForLookup.filter(
    (productId) => !profileLookupIds.has(productId),
  );
  const { data: fallbackProductsData } = missingProductIdsForLookup.length
    ? await supabase
        .from("products")
        .select("id,unit,stock_unit_code,product_type")
        .in("id", missingProductIdsForLookup)
    : { data: [] as ProductRow[] };

  const productMap = new Map(
    [
      ...productRowsFromProfiles,
      ...((fallbackProductsData ?? []) as ProductRow[]).map((product) => ({
        ...product,
        inventory_kind: null,
        measurement_mode: "fixed_presentation" as MeasurementMode,
        default_tolerance_percent: null,
        requires_actual_dispatch_qty: false,
        requires_count_alongside_weight: false,
      })),
    ].map((product) => [product.id, product]),
  );

  const selectedRequestPolicyIds = Array.from(
    new Set(requestPolicyIds.filter(Boolean)),
  );
  const { data: requestPolicyData } = selectedRequestPolicyIds.length
    ? await supabase
        .from("product_request_policies")
        .select(
          "id,product_id,label,request_unit_code,base_unit_code,base_qty_per_request_unit,constraint_mode,minimum_request_qty,request_step_qty,allow_fraction,policy_kind,physical_uom_profile_id,is_active",
        )
        .in("id", selectedRequestPolicyIds)
    : { data: [] as ProductRequestPolicyRow[] };
  const requestPolicyById = new Map(
    ((requestPolicyData ?? []) as ProductRequestPolicyRow[])
      .map(mapProductRequestPolicyRow)
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .map((policy) => [policy.id, policy] as const),
  );

  const requestedUomProfileIds = Array.from(
    new Set(inputUomProfileIds.filter(Boolean)),
  );
  const { data: uomProfilesData } = requestedUomProfileIds.length
    ? await supabase
        .from("product_uom_profiles")
        .select(
          "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context",
        )
        .in("id", requestedUomProfileIds)
    : { data: [] as ProductUomProfile[] };
  const uomProfileById = new Map(
    ((uomProfilesData ?? []) as ProductUomProfile[]).map((profile) => [
      profile.id,
      profile,
    ]),
  );

  let items: Array<{
    product_id: string;
    quantity: number;
    input_qty: number;
    unit: string;
    input_unit_code: string;
    input_uom_profile_id: string | null;
    conversion_factor_to_stock: number;
    stock_unit_code: string;
    production_area_kind: string | null;
    production_package_plan: ProductionPackagePlanItem[];
    requires_package_dispatch: boolean;
    request_policy_id: string | null;
    requested_policy_qty: number | null;
  }> = [];
  try {
    items = productIds
      .map((productId, idx) => {
        const product = productMap.get(productId);
        const requestPolicyId = requestPolicyIds[idx] || "";
        const requestedPolicyQty = roundQuantity(
          parseNumber(
            requestedPolicyQuantities[idx] ??
              inputQuantities[idx] ??
              quantities[idx] ??
              "0",
          ),
        );
        const requestPolicy = requestPolicyId
          ? (requestPolicyById.get(requestPolicyId) ?? null)
          : null;
        if (requestPolicyId) {
          if (!requestPolicy || requestPolicy.productId !== productId) {
            throw new Error(
              "La unidad seleccionada no está disponible para este producto.",
            );
          }
          validateRequestedPolicyQuantity(requestPolicy, requestedPolicyQty);
          return {
            product_id: productId,
            quantity: roundQuantity(
              requestedPolicyQty * requestPolicy.baseQtyPerRequestUnit,
            ),
            input_qty: requestedPolicyQty,
            unit: requestPolicy.baseUnitCode,
            input_unit_code: getRequestPolicyInputUnitCode(requestPolicy),
            input_uom_profile_id: requestPolicy.physicalUomProfileId,
            conversion_factor_to_stock: requestPolicy.baseQtyPerRequestUnit,
            stock_unit_code: requestPolicy.baseUnitCode,
            production_area_kind: areaKinds[idx] || null,
            production_package_plan: [],
            requires_package_dispatch: false,
            request_policy_id: requestPolicy.id,
            requested_policy_qty: requestedPolicyQty,
          };
        }

        const stockUnitCode = normalizeUnitCode(
          product?.stock_unit_code || product?.unit || "un",
        );
        const quantityInInput = roundQuantity(
          parseNumber(inputQuantities[idx] ?? quantities[idx] ?? "0"),
        );
        const rawInputUomProfileId = inputUomProfileIds[idx] || "";
        const selectedProfile = rawInputUomProfileId ? (uomProfileById.get(rawInputUomProfileId) ?? null) : null;
        const productUsesPackages = usesProductionPackageDispatch(product, selectedProfile, stockUnitCode);
        const inputUomProfileId = productUsesPackages ? "" : rawInputUomProfileId;
        const productionPackagePlan = productUsesPackages ? (productionPackagePlans[idx] ?? []) : [];

        if (
          !productUsesPackages &&
          inputUomProfileId
        ) {
          if (!selectedProfile) {
            throw new Error(
              "La presentación seleccionada no existe o no está disponible.",
            );
          }
          if (
            selectedProfile.product_id !== productId ||
            selectedProfile.is_active === false
          ) {
            throw new Error(
              "La presentación seleccionada no corresponde al producto solicitado.",
            );
          }
        }

        const inputUnitCode = normalizeUnitCode(
          productUsesPackages
            ? stockUnitCode
            : inputUnits[idx] ||
                selectedProfile?.input_unit_code ||
                stockUnitCode,
        );
        const conversion = convertByProductProfile({
          quantityInInput,
          inputUnitCode,
          stockUnitCode,
          profile: selectedProfile,
        });

        return {
          product_id: productId,
          quantity: conversion.quantityInStock,
          input_qty: quantityInInput,
          unit: stockUnitCode,
          input_unit_code: inputUnitCode,
          input_uom_profile_id: !productUsesPackages ? (selectedProfile?.id ?? null) : null,
          conversion_factor_to_stock: conversion.factorToStock,
          stock_unit_code: stockUnitCode,
          production_area_kind: areaKinds[idx] || null,
          production_package_plan: productionPackagePlan,
          requires_package_dispatch: productUsesPackages,
          request_policy_id: null,
          requested_policy_qty: null,
        };
      })
      .filter((item) => item.product_id && item.quantity > 0);
  } catch (error) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          error instanceof Error
            ? error.message
            : "Error en conversion de unidades.",
        ),
    );
  }

  if (!toSiteId || !fromSiteId) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("Debes definir origen y destino."),
    );
  }
  let activeAreaId = operationalSession.areaId;
  if (!operationalSession.isSharedDevice) {
    const opContext = await getOperationalContext({
      supabase,
      employeeId: user.id,
      siteId: toSiteId,
      appCode: APP_ID,
    });
    if (!opContext?.can_operate) {
      redirect(
        "/inventory/remissions?error=" +
          encodeURIComponent(
            buildOperationalBlockMessage(
              opContext,
              "No puedes solicitar remisiones en este momento para esta sede.",
            ),
          ),
      );
    }
    activeAreaId = opContext.active_area_id;
  }

  const canRequest = operationalSession.isSharedDevice
    ? await checkOperationalSessionPermission({
        supabase,
        session: operationalSession,
        appId: APP_ID,
        code: PERMISSIONS.remissionsRequest,
      })
    : await checkOperationalPermission({
        supabase,
        permissionCode: `${APP_ID}.${PERMISSIONS.remissionsRequest}`,
        siteId: toSiteId,
        areaId: activeAreaId,
        appCode: APP_ID,
      });
  if (!canRequest) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("No tienes permiso para solicitar remisiones."),
    );
  }

  const { data: toSite } = await supabase
    .from("site_operational_capabilities")
    .select("can_request_remissions")
    .eq("site_id", toSiteId)
    .maybeSingle();

  if (toSite?.can_request_remissions === false) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("Esta sede no solicita remisiones."),
    );
  }

  if (!toSite) {
    const { data: legacyToSite } = await supabase
      .from("sites")
      .select("site_type,name")
      .eq("id", toSiteId)
      .single();

    if (String(legacyToSite?.site_type ?? "") !== "satellite") {
      redirect(
        "/inventory/remissions?error=" +
          encodeURIComponent("Esta sede no solicita remisiones."),
      );
    }
  }

  if (items.length === 0) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          "Agrega al menos un producto con cantidad mayor a 0.",
        ),
    );
  }

  const configuredRows = await loadProductSiteRows(supabase, toSiteId);
  if (configuredRows.length === 0) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          "Esta sede no tiene productos habilitados. Configura disponibilidad por sede en catálogo.",
        ),
    );
  }

  const allowedProductIds = new Set(
    configuredRows
      .filter((row) => supportsRemission(row))
      .map((row) => row.product_id),
  );
  if (allowedProductIds.size === 0) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          "Esta sede no tiene productos habilitados para su uso operativo. Ajusta Uso en sede en catálogo.",
        ),
    );
  }
  const invalidItems = items.filter(
    (item) => !allowedProductIds.has(item.product_id),
  );
  if (invalidItems.length > 0) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          "Algunos productos no estan habilitados para esta sede o flujo operativo. Revisa disponibilidad por sede.",
        ),
    );
  }

  const configuredByProductId = new Map(
    configuredRows.map((row) => [row.product_id, row]),
  );
  const requestAreaScope = operationalSession.isSharedDevice
    ? await resolveSharedDeviceOperationalRemissionAreaScope({
        supabase,
        siteId: toSiteId,
        areaId: activeAreaId,
        canSeeAllAreas: false,
      })
    : await resolveOperationalRemissionAreaScope({
        supabase,
        userId: user.id,
        siteId: toSiteId,
        canSeeAllAreas: false,
      });
  if (requestAreaScope.blockedReason) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(requestAreaScope.blockedReason),
    );
  }
  const requestedRoleAreaKind = requestAreaScope.defaultAreaKind;
  const invalidAreaItems = items.filter((item) => {
    const row = configuredByProductId.get(item.product_id);
    if (!row) return true;
    const itemAreaKind = String(item.production_area_kind ?? "").trim();
    if (requestedRoleAreaKind && itemAreaKind !== requestedRoleAreaKind)
      return true;
    return itemAreaKind ? !supportsRequestedArea(row, itemAreaKind) : false;
  });
  if (invalidAreaItems.length > 0) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          "Algunos productos no corresponden al area operativa activa de la sede.",
        ),
    );
  }

  let createdByEmployeeId = user.id;
  let sharedDeviceSignatureId: string | null = null;

  const signatureResult = await requireSharedDeviceActorSignature({
    supabase,
    session: operationalSession,
    actorPin: sharedActorPin,
    appId: APP_ID,
    actionCode: PERMISSIONS.remissionsRequest,
    targetTable: "restock_requests",
    metadata: {
      from_site_id: fromSiteId,
      to_site_id: toSiteId,
      item_count: items.length,
    },
  });

  if (!signatureResult.ok) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(signatureResult.message),
    );
  }

  if (signatureResult.required) {
    createdByEmployeeId = signatureResult.actorEmployeeId;
    sharedDeviceSignatureId = signatureResult.signatureId;
  }
  const { data: request, error: requestErr } = await supabase
    .from("restock_requests")
    .insert({
      status: "pending",
      created_by: createdByEmployeeId,
      from_site_id: fromSiteId,
      to_site_id: toSiteId,
      requested_by_site_id: toSiteId,
      from_location: `site:${fromSiteId}`,
      to_location: `site:${toSiteId}`,
      expected_date: expectedDate || null,
      notes: notes || null,
      status_updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (requestErr || !request) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          requestErr?.message ?? "No se pudo crear la remisión.",
        ),
    );
  }


  const attachSignatureResult = await attachSharedDeviceActionSignatureTarget({
    supabase,
    signatureId: sharedDeviceSignatureId,
    targetTable: "restock_requests",
    targetId: request.id,
    metadata: { attached_after_insert: true },
  });

  if (!attachSignatureResult.ok) {
    console.error("shared device signature target attach failed", {
      request_id: request.id,
      signature_id: sharedDeviceSignatureId,
      message: attachSignatureResult.message,
    });
  }

  const payload = items.map((item) => ({
    request_id: request.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit: item.unit,
    input_qty: item.input_qty,
    input_unit_code: item.input_unit_code,
    input_uom_profile_id: item.input_uom_profile_id,
    conversion_factor_to_stock: item.conversion_factor_to_stock,
    stock_unit_code: item.stock_unit_code,
    production_area_kind: item.production_area_kind,
    production_package_plan: item.production_package_plan,
    requires_package_dispatch: item.requires_package_dispatch,
    request_policy_id: item.request_policy_id,
    requested_policy_qty: item.requested_policy_qty,
  }));

  const { data: insertedItems, error: itemsErr } = await supabase
    .from("restock_request_items")
    .insert(payload)
    .select("id,product_id,quantity,production_area_kind");
  if (itemsErr || !insertedItems?.length) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          itemsErr?.message ?? "No se pudieron crear los items.",
        ),
    );
  }

  const insertedProductIds = Array.from(
    new Set(insertedItems.map((item) => String(item.product_id)).filter(Boolean)),
  );
  const { data: fulfillmentRoutes, error: routesError } = insertedProductIds.length
    ? await supabase
      .from("product_fulfillment_routes")
      .select("id,product_id,requesting_area_kind,preparing_area_kind,preferred_source_location_id,preferred_destination_location_id,supply_mode,production_execution_mode,ready_location_id")
      .eq("from_site_id", fromSiteId)
      .eq("to_site_id", toSiteId)
      .eq("is_active", true)
      .in("product_id", insertedProductIds)
    : { data: [], error: null };
  if (routesError) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(`La solicitud se creó, pero no fue posible resolver sus rutas: ${routesError.message}`),
    );
  }

  const fulfillmentRows = insertedItems.map((item) => {
    const requestedAreaKind = String(item.production_area_kind ?? "").trim() || null;
    const productRoutes = (fulfillmentRoutes ?? []).filter(
      (candidate) => candidate.product_id === item.product_id,
    );
    const route =
      productRoutes.find(
        (candidate) => candidate.requesting_area_kind === requestedAreaKind,
      ) ??
      productRoutes.find((candidate) => candidate.requesting_area_kind === null) ??
      null;

    const preparingAreaKind = String(route?.preparing_area_kind ?? "").trim() || null;
    const rawSupplyMode = String(route?.supply_mode ?? "").trim().toLowerCase();
    const supplyMode =
      rawSupplyMode === "stock" || rawSupplyMode === "production"
        ? rawSupplyMode
        : null;
    const sourceLocationId =
      supplyMode === "stock"
        ? String(route?.preferred_source_location_id ?? "").trim() || null
        : null;
    const productionExecutionMode =
      supplyMode === "production"
        ? String(route?.production_execution_mode ?? "").trim() || null
        : null;
    const readyLocationId =
      supplyMode === "production"
        ? String(route?.ready_location_id ?? "").trim() || null
        : null;
    const destinationLocationId =
      String(route?.preferred_destination_location_id ?? "").trim() || null;
    const routeReady = Boolean(
      route &&
        preparingAreaKind &&
        supplyMode &&
        (supplyMode === "production"
          ? productionExecutionMode && readyLocationId
          : sourceLocationId),
    );

    return {
      request_item_id: item.id,
      product_id: item.product_id,
      route_id: route?.id ?? null,
      from_site_id: fromSiteId,
      to_site_id: toSiteId,
      requesting_area_kind: requestedAreaKind,
      preparing_area_kind: preparingAreaKind,
      supply_mode: supplyMode,
      production_execution_mode: productionExecutionMode,
      // Este valor es el LOC operativo donde Producción deja el terminado listo.
      // No representa estantería, nivel, posición interna ni LPN.
      ready_location_id: readyLocationId,
      // Este valor conserva el LOC operativo de salida configurado para rutas de stock.
      // La ubicación interna se resuelve al preparar y despachar.
      source_location_id: sourceLocationId,
      destination_location_id: destinationLocationId,
      status: routeReady ? "pending" : "blocked",
      requested_base_qty: Number(item.quantity ?? 0),
      shortage_reason: routeReady
        ? null
        : route
          ? !supplyMode
            ? "Ruta incompleta: el modo de abastecimiento no es válido."
            : supplyMode === "production"
              ? "Ruta de producción incompleta: falta área productora, modo de ejecución o LOC de producto listo."
              : "Ruta de stock incompleta: falta área responsable o LOC de salida."
          : "Producto sin ruta de abastecimiento.",
      notes: routeReady
        ? supplyMode === "production"
          ? "La tarea conserva el modo de producción y el LOC donde quedará listo el terminado."
          : "La ubicación interna se resolverá al preparar y despachar."
        : "Completa la ruta operativa antes de preparar esta necesidad.",
      created_by: createdByEmployeeId,
      updated_by: createdByEmployeeId,
    };
  });
  const { error: fulfillmentError } = await supabase
    .from("restock_item_fulfillments")
    .insert(fulfillmentRows);
  if (fulfillmentError) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(`La solicitud se creó, pero no fue posible generar sus tareas: ${fulfillmentError.message}`),
    );
  }

  let hasLowStock = false;

  if (inventoryPostingEnabled) {
    const { data: stockRows } = await supabase
      .from("inventory_stock_by_site")
      .select("product_id,current_qty")
      .eq("site_id", fromSiteId)
      .in(
        "product_id",
        items.map((i) => i.product_id),
      );

    const stockMap = new Map(
      (stockRows ?? []).map(
        (r: { product_id: string; current_qty: number | null }) => [
          r.product_id,
          Number(r.current_qty ?? 0),
        ],
      ),
    );

    for (const item of items) {
      const available = stockMap.get(item.product_id) ?? 0;
      if (available < item.quantity) {
        hasLowStock = true;
        break;
      }
    }
  }

  const params = new URLSearchParams({
    ok: "Remisión creada.",
    site_id: toSiteId,
  });
  if (hasLowStock) params.set("warning", "low_stock");
  redirect(`/inventory/remissions?${params.toString()}`);
}