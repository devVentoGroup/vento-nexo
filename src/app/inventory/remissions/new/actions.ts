"use server";

import { redirect } from "next/navigation";

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
  asText,
  loadProductSiteRows,
  readBooleanAppSetting,
  supportsRemission,
  supportsRequestedArea,
  toFriendlyRemissionActionError,
} from "../page-helpers";
import {
  resolveOperationalRemissionAreaScope,
  resolveSharedDeviceOperationalRemissionAreaScope,
} from "../operational-area-scope";

const APP_ID = "nexo";
const INVENTORY_POSTING_SETTING = "remissions.inventory_posting_enabled";
const REQUEST_PERMISSION = "inventory.remissions.request";

type PolicyRow = {
  id: string;
  product_id: string;
  is_active: boolean;
  base_unit_code: string;
  base_qty_per_request_unit: number | string;
};

function positiveNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function errorRedirect(message: string): never {
  redirect(`/inventory/remissions/new?error=${encodeURIComponent(message)}`);
}

export async function createPolicyRemission(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) redirect(await buildShellLoginUrl("/inventory/remissions/new"));

  const operationalSession = await resolveOperationalSession({
    supabase,
    userId: user.id,
    appId: APP_ID,
  });

  const fromSiteId = asText(formData.get("from_site_id"));
  const toSiteId = asText(formData.get("to_site_id"));
  const expectedDate = asText(formData.get("expected_date"));
  const notes = asText(formData.get("notes"));
  const sharedActorPin = asText(formData.get("shared_actor_pin"));

  const productIds = formData.getAll("item_product_id").map((value) => String(value).trim());
  const policyIds = formData.getAll("item_request_policy_id").map((value) => String(value).trim());
  const requestedQuantities = formData
    .getAll("item_requested_policy_qty")
    .map((value) => String(value).trim());
  const areaKinds = formData.getAll("item_area_kind").map((value) => String(value).trim());

  if (!fromSiteId || !toSiteId) errorRedirect("Debes definir origen y destino.");
  if (
    operationalSession.isSharedDevice &&
    String(operationalSession.siteId ?? "").trim() !== toSiteId
  ) {
    errorRedirect("Este dispositivo compartido solo puede solicitar para su sede operativa.");
  }
  if (
    !productIds.length ||
    productIds.length !== policyIds.length ||
    productIds.length !== requestedQuantities.length
  ) {
    errorRedirect("La información de los productos está incompleta.");
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
      errorRedirect(
        buildOperationalBlockMessage(
          opContext,
          "No puedes solicitar remisiones para esta sede.",
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
        code: REQUEST_PERMISSION,
      })
    : await checkOperationalPermission({
        supabase,
        permissionCode: `${APP_ID}.${REQUEST_PERMISSION}`,
        siteId: toSiteId,
        areaId: activeAreaId,
        appCode: APP_ID,
      });
  if (!canRequest) errorRedirect("No tienes permiso para solicitar remisiones.");

  const { data: capability } = await supabase
    .from("site_operational_capabilities")
    .select("can_request_remissions")
    .eq("site_id", toSiteId)
    .maybeSingle();
  if (capability?.can_request_remissions === false) {
    errorRedirect("Esta sede no solicita remisiones.");
  }

  const uniquePolicyIds = Array.from(new Set(policyIds.filter(Boolean)));
  const { data: policyData, error: policyError } = uniquePolicyIds.length
    ? await supabase
        .from("product_request_policies")
        .select("id,product_id,is_active,base_unit_code,base_qty_per_request_unit")
        .in("id", uniquePolicyIds)
    : { data: [] as PolicyRow[], error: null };
  if (policyError) errorRedirect(policyError.message);

  const policyById = new Map(
    ((policyData ?? []) as PolicyRow[]).map((policy) => [policy.id, policy]),
  );
  const items = productIds
    .map((productId, index) => {
      const policyId = policyIds[index] ?? "";
      const requestedQty = positiveNumber(requestedQuantities[index] ?? "");
      const policy = policyById.get(policyId) ?? null;
      if (!productId || !policyId || requestedQty <= 0) return null;
      if (!policy || !policy.is_active || policy.product_id !== productId) {
        throw new Error(
          "Una política seleccionada está inactiva o no corresponde al producto.",
        );
      }
      const factor = Number(policy.base_qty_per_request_unit);
      if (!Number.isFinite(factor) || factor <= 0) {
        throw new Error("Una política tiene una equivalencia inválida.");
      }
      return {
        product_id: productId,
        request_policy_id: policyId,
        requested_policy_qty: requestedQty,
        base_unit_code: policy.base_unit_code,
        factor,
        production_area_kind: areaKinds[index] || null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (!items.length) errorRedirect("Agrega al menos un producto con cantidad mayor a cero.");

  const configuredRows = await loadProductSiteRows(supabase, toSiteId);
  const allowedRows = configuredRows.filter((row) => supportsRemission(row));
  const allowedProductIds = new Set(allowedRows.map((row) => row.product_id));
  if (items.some((item) => !allowedProductIds.has(item.product_id))) {
    errorRedirect("Algunos productos no están habilitados para esta sede.");
  }

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
  if (requestAreaScope.blockedReason) errorRedirect(requestAreaScope.blockedReason);

  const configuredByProduct = new Map(allowedRows.map((row) => [row.product_id, row]));
  const roleAreaKind = requestAreaScope.defaultAreaKind;
  if (
    items.some((item) => {
      const configured = configuredByProduct.get(item.product_id);
      const itemArea = String(item.production_area_kind ?? "").trim();
      if (!configured) return true;
      if (roleAreaKind && itemArea !== roleAreaKind) return true;
      return itemArea ? !supportsRequestedArea(configured, itemArea) : false;
    })
  ) {
    errorRedirect("Algunos productos no corresponden al área operativa activa.");
  }

  let createdBy = user.id;
  let signatureId: string | null = null;
  const signature = await requireSharedDeviceActorSignature({
    supabase,
    session: operationalSession,
    actorPin: sharedActorPin,
    appId: APP_ID,
    actionCode: REQUEST_PERMISSION,
    targetTable: "restock_requests",
    metadata: { from_site_id: fromSiteId, to_site_id: toSiteId, item_count: items.length },
  });
  if (!signature.ok) errorRedirect(signature.message);
  if (signature.required) {
    createdBy = signature.actorEmployeeId;
    signatureId = signature.signatureId;
  }

  const { data: request, error: requestError } = await supabase
    .from("restock_requests")
    .insert({
      status: "pending",
      created_by: createdBy,
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
  if (requestError || !request) {
    errorRedirect(requestError?.message ?? "No se pudo crear la remisión.");
  }

  const attachResult = await attachSharedDeviceActionSignatureTarget({
    supabase,
    signatureId,
    targetTable: "restock_requests",
    targetId: request.id,
    metadata: { attached_after_insert: true },
  });
  if (!attachResult.ok) {
    console.error("shared device signature target attach failed", {
      request_id: request.id,
      signature_id: signatureId,
      message: attachResult.message,
    });
  }

  const payload = items.map((item) => ({
    request_id: request.id,
    product_id: item.product_id,
    quantity: 1,
    unit: item.base_unit_code,
    input_qty: item.requested_policy_qty,
    input_unit_code: item.base_unit_code,
    input_uom_profile_id: null,
    conversion_factor_to_stock: item.factor,
    stock_unit_code: item.base_unit_code,
    production_area_kind: item.production_area_kind,
    production_package_plan: [],
    requires_package_dispatch: false,
    request_policy_id: item.request_policy_id,
    requested_policy_qty: item.requested_policy_qty,
  }));

  const { error: itemsError } = await supabase.from("restock_request_items").insert(payload);
  if (itemsError) {
    await supabase.from("restock_requests").delete().eq("id", request.id);
    errorRedirect(toFriendlyRemissionActionError(itemsError.message));
  }

  let hasLowStock = false;
  const inventoryPostingEnabled = await readBooleanAppSetting(
    supabase,
    INVENTORY_POSTING_SETTING,
    false,
  );
  if (inventoryPostingEnabled) {
    const { data: stockRows } = await supabase
      .from("inventory_stock_by_site")
      .select("product_id,current_qty")
      .eq("site_id", fromSiteId)
      .in("product_id", items.map((item) => item.product_id));
    const stockByProduct = new Map(
      (stockRows ?? []).map((row: { product_id: string; current_qty: number | null }) => [
        row.product_id,
        Number(row.current_qty ?? 0),
      ]),
    );
    hasLowStock = items.some(
      (item) =>
        (stockByProduct.get(item.product_id) ?? 0) <
        item.requested_policy_qty * item.factor,
    );
  }

  const params = new URLSearchParams({ ok: "Remisión creada.", site_id: toSiteId });
  if (hasLowStock) params.set("warning", "low_stock");
  redirect(`/inventory/remissions?${params.toString()}`);
}
