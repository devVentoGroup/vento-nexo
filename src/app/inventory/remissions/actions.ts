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
  }> = [];
  try {
    items = productIds
      .map((productId, idx) => {
        const product = productMap.get(productId);
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
  }));

  const { error: itemsErr } = await supabase
    .from("restock_request_items")
    .insert(payload);
  if (itemsErr) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          itemsErr.message ?? "No se pudieron crear los items.",
        ),
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
