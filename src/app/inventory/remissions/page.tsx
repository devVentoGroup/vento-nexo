import Link from "next/link";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";
import { PRIVILEGED_ROLE_OVERRIDES, ROLE_OVERRIDE_COOKIE } from "@/lib/auth/role-override-config";
import {
  buildOperationalBlockMessage,
  getOperationalContext,
} from "@/lib/auth/operational-context";
import { createClient } from "@/lib/supabase/server";
import { RemissionsCreateForm } from "@/components/vento/remissions-create-form";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  convertByProductProfile,
  normalizeUnitCode,
  roundQuantity,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const SITE_OVERRIDE_COOKIE = "nexo_site_override_id";

const PERMISSIONS = {
  remissionsRequest: "inventory.remissions.request",
  remissionsAllSites: "inventory.remissions.all_sites",
  remissionsCancel: "inventory.remissions.cancel",
  remissionsTransit: "inventory.remissions.transit",
  remissionsEditOwnPending: "inventory.remissions.edit_own_pending",
};

type SearchParams = {
  error?: string;
  ok?: string;
  warning?: string;
  site_id?: string;
  from_site_id?: string;
  new?: string;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

type AreaRow = {
  id: string;
  name: string | null;
  kind: string | null;
  site_id: string | null;
};
type AreaKindPurposeRow = {
  code: string;
  use_for_remission?: boolean | null;
};
type SiteAreaPurposeRuleRow = {
  site_id: string | null;
  area_kind: string | null;
  purpose: string | null;
  is_enabled: boolean | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  category_id?: string | null;
};

type ProductSiteRow = {
  product_id: string;
  is_active: boolean | null;
  default_area_kind: string | null;
  audience?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

/** Filas de product_inventory_profiles con el join a products(id,name,unit) */
type ProductProfileWithProduct = {
  product_id: string;
  products: ProductRow | null;
};

type StockReferenceRow = {
  site_id: string;
  product_id: string;
  current_qty: number | null;
  updated_at: string | null;
};

type RemissionRow = {
  id: string;
  created_at: string | null;
  status: string | null;
  from_site_id: string | null;
  to_site_id: string | null;
  notes: string | null;
  created_by?: string | null;
  prepared_by?: string | null;
  prepared_at?: string | null;
  in_transit_by?: string | null;
  in_transit_at?: string | null;
  received_by?: string | null;
  received_at?: string | null;
};

type RemissionOperationalSummaryRow = {
  request_id: string | null;
  can_transit: boolean | null;
};

type RemissionItemMetricsRow = {
  request_id: string | null;
  quantity: number | null;
  prepared_quantity: number | null;
};

type EmployeeNameRow = {
  id: string;
  full_name: string | null;
  alias: string | null;
};

type ProductAudience = "SAUDO" | "VCF" | "BOTH" | "INTERNAL";

function normalizeAudience(value: string | null | undefined): ProductAudience | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "SAUDO") return "SAUDO";
  if (normalized === "VCF") return "VCF";
  if (normalized === "INTERNAL") return "INTERNAL";
  if (normalized === "BOTH") return "BOTH";
  return null;
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function inferAudienceFromSiteName(siteName: string | null | undefined): ProductAudience {
  const normalized = normalizeText(siteName);
  if (normalized.includes("saudo")) return "SAUDO";
  if (normalized.includes("vento cafe")) return "VCF";
  return "BOTH";
}

function supportsAudience(
  configuredAudience: string | null | undefined,
  requestedAudience: ProductAudience
): boolean {
  const normalized = normalizeAudience(configuredAudience);
  // Compatibilidad: filas antiguas sin audience deben seguir operando como BOTH.
  if (!normalized) return requestedAudience !== "INTERNAL";
  if (normalized === "INTERNAL") {
    return requestedAudience === "INTERNAL";
  }
  if (requestedAudience === "INTERNAL") {
    return false;
  }
  return normalized === "BOTH" || requestedAudience === "BOTH" || normalized === requestedAudience;
}

async function loadProductSiteRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  siteId: string
): Promise<ProductSiteRow[]> {
  const withAudience = await supabase
    .from("product_site_settings")
    .select("product_id,is_active,default_area_kind,audience,updated_at,created_at")
    .eq("site_id", siteId)
    .eq("is_active", true);

  if (!withAudience.error) {
    const rows = (withAudience.data ?? []) as ProductSiteRow[];
    const ordered = [...rows].sort((a, b) => {
      const aTs = new Date(String(a.updated_at ?? a.created_at ?? "")).getTime();
      const bTs = new Date(String(b.updated_at ?? b.created_at ?? "")).getTime();
      const safeA = Number.isFinite(aTs) ? aTs : 0;
      const safeB = Number.isFinite(bTs) ? bTs : 0;
      return safeB - safeA;
    });
    const byProduct = new Map<string, ProductSiteRow>();
    for (const row of ordered) {
      if (!row.product_id || byProduct.has(row.product_id)) continue;
      byProduct.set(row.product_id, row);
    }
    return Array.from(byProduct.values());
  }

  const fallback = await supabase
    .from("product_site_settings")
    .select("product_id,is_active,default_area_kind,updated_at,created_at")
    .eq("site_id", siteId)
    .eq("is_active", true);

  const legacyRows = (fallback.data ?? []) as ProductSiteRow[];
  const orderedLegacy = [...legacyRows].sort((a, b) => {
    const aTs = new Date(String(a.updated_at ?? a.created_at ?? "")).getTime();
    const bTs = new Date(String(b.updated_at ?? b.created_at ?? "")).getTime();
    const safeA = Number.isFinite(aTs) ? aTs : 0;
    const safeB = Number.isFinite(bTs) ? bTs : 0;
    return safeB - safeA;
  });
  const byProduct = new Map<string, ProductSiteRow>();
  for (const row of orderedLegacy) {
    if (!row.product_id || byProduct.has(row.product_id)) continue;
    byProduct.set(row.product_id, {
      ...row,
      audience: null,
    });
  }
  return Array.from(byProduct.values());
}

function formatStatus(status?: string | null) {
  const value = String(status ?? "").trim();
  switch (value) {
    case "dispatch_ready":
      return { label: "Lista para despacho", className: "ui-chip ui-chip--success" };
    case "pending":
      return { label: "Pendiente", className: "ui-chip ui-chip--warn" };
    case "preparing":
      return { label: "Preparando", className: "ui-chip ui-chip--brand" };
    case "in_transit":
      return { label: "En tránsito", className: "ui-chip ui-chip--warn" };
    case "partial":
      return { label: "Recepción parcial", className: "ui-chip ui-chip--warn" };
    case "received":
      return { label: "Recibida", className: "ui-chip ui-chip--success" };
    case "closed":
      return { label: "Recibida", className: "ui-chip ui-chip--success" };
    case "cancelled":
      return { label: "Cancelada", className: "ui-chip" };
    default:
      return { label: value || "Sin estado", className: "ui-chip" };
  }
}

function getEffectiveRemissionStatus(
  row: RemissionRow,
  canTransitByRequestId: Map<string, boolean>
): string {
  const baseStatus = String(row.status ?? "").trim();
  if (baseStatus === "preparing" && canTransitByRequestId.get(row.id)) {
    return "dispatch_ready";
  }
  return baseStatus;
}

function formatDateTime(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function displayEmployeeName(employee?: EmployeeNameRow | null): string {
  if (!employee) return "-";
  return String(employee.alias ?? employee.full_name ?? employee.id).trim() || employee.id;
}

function buildRemissionTraceSummary(
  row: RemissionRow,
  employeeNameMap: Map<string, string>
): string {
  const steps: string[] = [];
  const requestedBy = employeeNameMap.get(String(row.created_by ?? ""));
  if (requestedBy) steps.push(`Solicito: ${requestedBy}`);
  const preparedBy = employeeNameMap.get(String(row.prepared_by ?? ""));
  if (preparedBy) steps.push(`Preparo: ${preparedBy}`);
  const dispatchedBy = employeeNameMap.get(String(row.in_transit_by ?? ""));
  if (dispatchedBy) steps.push(`Despacho: ${dispatchedBy}`);
  const receivedBy = employeeNameMap.get(String(row.received_by ?? ""));
  if (receivedBy) steps.push(`Recibio: ${receivedBy}`);
  return steps.length ? steps.join(" · ") : "Sin trazabilidad visible todavia";
}

type RemissionListAction = "view" | "edit" | "cancel" | "delete" | "reverse_cancel";

function hasReversalMarker(notes: string | null | undefined): boolean {
  return String(notes ?? "").includes("[REVERSA_APLICADA");
}

function getListActionsForRemission(
  status: string | null | undefined,
  notes: string | null | undefined,
  canManage: boolean,
  canReverse: boolean,
  canEditOwnPending: boolean
): RemissionListAction[] {
  const normalizedStatus = String(status ?? "").trim();
  const actions: RemissionListAction[] = ["view"];

  if (canEditOwnPending && normalizedStatus === "pending") {
    actions.push("edit");
  }

  if (!canManage) return actions;

  if (["pending", "preparing"].includes(normalizedStatus)) {
    actions.push("cancel", "delete");
    return actions;
  }

  if (canReverse && ["in_transit", "partial", "received", "closed"].includes(normalizedStatus)) {
    actions.push("reverse_cancel");
    return actions;
  }

  if (normalizedStatus === "cancelled") {
    if (canReverse && !hasReversalMarker(notes)) actions.push("reverse_cancel");
    actions.push("delete");
    return actions;
  }

  return actions;
}

function toFriendlyRemissionActionError(rawMessage: string): string {
  const msg = String(rawMessage ?? "").toLowerCase();
  if (
    msg.includes("restock_request_items_request_id_fkey") ||
    msg.includes("restock_request_items")
  ) {
    return "No se pudo eliminar porque la remisión aún tiene ítems relacionados.";
  }
  if (msg.includes("related_restock_request_id") || msg.includes("inventory_movements")) {
    return "No se puede eliminar porque ya tiene movimientos de inventario asociados. Se canceló para conservar trazabilidad.";
  }
  if (msg.includes("already_reversed")) {
    return "Esta remisión ya fue anulada con reversa.";
  }
  if (msg.includes("request_not_found")) {
    return "La remisión ya no existe o no está disponible.";
  }
  if (msg.includes("permission_denied_reverse")) {
    return "No tienes permisos para anular con reversa esta remisión.";
  }
  if (msg.includes("permission denied") || msg.includes("row-level security") || msg.includes("rls")) {
    return "No tienes permisos para ejecutar esta acción sobre la remisión.";
  }
  return "No se pudo completar la acción sobre la remisión. Intenta nuevamente.";
}

async function runRemissionListAction(formData: FormData) {
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
      encodeURIComponent("Acción inválida para la remisión.")
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
      encodeURIComponent("La remisión no existe o no está disponible.")
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
      encodeURIComponent("No tienes permisos para esta acción.")
    );
  }
  const canReverseScope = canGlobal || (canFrom && canTo);
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
    canEditOwnPending
  );
  if (!actionMatrix.includes(action as RemissionListAction)) {
    redirect(
      "/inventory/remissions?error=" +
      encodeURIComponent("Esa acción no aplica para el estado actual de la remisión.")
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
        encodeURIComponent(toFriendlyRemissionActionError(error.message))
      );
    }
    redirect("/inventory/remissions?ok=" + encodeURIComponent("Remisión cancelada."));
  }

  if (action === "reverse_cancel") {
    const { error: reverseError } = await supabase.rpc("reverse_restock_request", {
      p_request_id: requestId,
    });
    if (reverseError) {
      redirect(
        "/inventory/remissions?error=" +
        encodeURIComponent(toFriendlyRemissionActionError(reverseError.message))
      );
    }
    redirect(
      "/inventory/remissions?ok=" +
      encodeURIComponent("Remisión anulada con reversa de inventario aplicada.")
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
          encodeURIComponent("No se pudo eliminar por trazabilidad. Se canceló la remisión.")
        );
      }
    }

    if (error) {
      redirect(
        "/inventory/remissions?error=" +
        encodeURIComponent(toFriendlyRemissionActionError(error.message))
      );
    }
  }

  if (!deletedRows || deletedRows.length === 0) {
    redirect(
      "/inventory/remissions?error=" +
      encodeURIComponent("No se pudo eliminar la remisión.")
    );
  }

  redirect("/inventory/remissions?ok=" + encodeURIComponent("Remisión eliminada."));
}

async function createRemission(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/remissions"));
  }
  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const actualRole = String(employee?.role ?? "");

  const fromSiteId = asText(formData.get("from_site_id"));
  const toSiteId = asText(formData.get("to_site_id"));
  const expectedDate = asText(formData.get("expected_date"));
  const notes = asText(formData.get("notes"));

  const productIds = formData.getAll("item_product_id").map((v) => String(v).trim());
  const quantities = formData.getAll("item_quantity").map((v) => String(v).trim());
  const inputUnits = formData
    .getAll("item_input_unit_code")
    .map((v) => normalizeUnitCode(String(v).trim()));
  const inputUomProfileIds = formData
    .getAll("item_input_uom_profile_id")
    .map((v) => String(v).trim());
  const inputQuantities = formData
    .getAll("item_quantity_in_input")
    .map((v) => String(v).trim());
  const areaKinds = formData.getAll("item_area_kind").map((v) => String(v).trim());

  const productIdsForLookup = Array.from(new Set(productIds.filter(Boolean)));
  const { data: productsData } = productIdsForLookup.length
    ? await supabase
      .from("products")
      .select("id,unit,stock_unit_code")
      .in("id", productIdsForLookup)
    : { data: [] as ProductRow[] };
  const productMap = new Map(
    ((productsData ?? []) as ProductRow[]).map((product) => [product.id, product])
  );
  const requestedUomProfileIds = Array.from(new Set(inputUomProfileIds.filter(Boolean)));
  const { data: uomProfilesData } = requestedUomProfileIds.length
    ? await supabase
      .from("product_uom_profiles")
      .select(
        "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
      )
      .in("id", requestedUomProfileIds)
    : { data: [] as ProductUomProfile[] };
  const uomProfileById = new Map(
    ((uomProfilesData ?? []) as ProductUomProfile[]).map((profile) => [profile.id, profile])
  );

  let items: Array<{
    product_id: string;
    quantity: number;
    input_qty: number;
    unit: string;
    input_unit_code: string;
    conversion_factor_to_stock: number;
    stock_unit_code: string;
    production_area_kind: string | null;
  }> = [];
  try {
    items = productIds
      .map((productId, idx) => {
        const product = productMap.get(productId);
        const stockUnitCode = normalizeUnitCode(product?.stock_unit_code || product?.unit || "un");
        const quantityInInput = roundQuantity(
          parseNumber(inputQuantities[idx] ?? quantities[idx] ?? "0")
        );
        const inputUomProfileId = inputUomProfileIds[idx] || "";
        const selectedProfile = inputUomProfileId
          ? uomProfileById.get(inputUomProfileId) ?? null
          : null;
        const conversion = convertByProductProfile({
          quantityInInput,
          inputUnitCode: normalizeUnitCode(inputUnits[idx] || stockUnitCode),
          stockUnitCode,
          profile: selectedProfile,
        });
        return {
          product_id: productId,
          quantity: conversion.quantityInStock,
          input_qty: quantityInInput,
          unit: stockUnitCode,
          input_unit_code: normalizeUnitCode(inputUnits[idx] || stockUnitCode),
          conversion_factor_to_stock: conversion.factorToStock,
          stock_unit_code: stockUnitCode,
          production_area_kind: areaKinds[idx] || null,
        };
      })
      .filter((item) => item.product_id && item.quantity > 0);
  } catch (error) {
    redirect(
      "/inventory/remissions?error=" +
      encodeURIComponent(
        error instanceof Error ? error.message : "Error en conversion de unidades."
      )
    );
  }

  if (!toSiteId || !fromSiteId) {
    redirect("/inventory/remissions?error=" + encodeURIComponent("Debes definir origen y destino."));
  }
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
          "No puedes solicitar remisiones en este momento para esta sede."
        )
      )
    );
  }

  const canRequest = await checkPermissionWithRoleOverride({
    supabase,
    appId: APP_ID,
    code: PERMISSIONS.remissionsRequest,
    context: { siteId: toSiteId },
    actualRole,
  });
  if (!canRequest) {
    redirect(
      "/inventory/remissions?error=" +
      encodeURIComponent("No tienes permiso para solicitar remisiones.")
    );
  }

  const { data: toSite } = await supabase
    .from("sites")
    .select("site_type,name")
    .eq("id", toSiteId)
    .single();

  if (String(toSite?.site_type ?? "") !== "satellite") {
    redirect(
      "/inventory/remissions?error=" +
      encodeURIComponent("Solo sedes satélite pueden solicitar remisiones.")
    );
  }

  if (items.length === 0) {
    redirect(
      "/inventory/remissions?error=" +
      encodeURIComponent("Agrega al menos un producto con cantidad mayor a 0.")
    );
  }

  const requestedAudience = inferAudienceFromSiteName(toSite?.name ?? "");
  const configuredRows = await loadProductSiteRows(supabase, toSiteId);
  if (configuredRows.length === 0) {
    redirect(
      "/inventory/remissions?error=" +
      encodeURIComponent(
        "Esta sede no tiene productos habilitados. Configura disponibilidad por sede en catalogo."
      )
    );
  }

  const allowedProductIds = new Set(
    configuredRows
      .filter((row) => supportsAudience(row.audience, requestedAudience))
      .map((row) => row.product_id)
  );
  if (allowedProductIds.size === 0) {
    redirect(
      "/inventory/remissions?error=" +
      encodeURIComponent(
        "Esta sede no tiene productos habilitados para su uso operativo. Ajusta Uso en sede en catalogo."
      )
    );
  }
  const invalidItems = items.filter((item) => !allowedProductIds.has(item.product_id));
  if (invalidItems.length > 0) {
    redirect(
      "/inventory/remissions?error=" +
      encodeURIComponent(
        "Algunos productos no estan habilitados para esta sede o flujo operativo. Revisa disponibilidad por sede."
      )
    );
  }

  const { data: request, error: requestErr } = await supabase
    .from("restock_requests")
    .insert({
      status: "pending",
      created_by: user.id,
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
      encodeURIComponent(requestErr?.message ?? "No se pudo crear la remisión.")
    );
  }

  const payload = items.map((item) => ({
    request_id: request.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit: item.unit,
    input_qty: item.input_qty,
    input_unit_code: item.input_unit_code,
    conversion_factor_to_stock: item.conversion_factor_to_stock,
    stock_unit_code: item.stock_unit_code,
    production_area_kind: item.production_area_kind,
  }));

  const { error: itemsErr } = await supabase.from("restock_request_items").insert(payload);
  if (itemsErr) {
    redirect(
      "/inventory/remissions?error=" +
      encodeURIComponent(itemsErr.message ?? "No se pudieron crear los items.")
    );
  }

  let hasLowStock = false;
  const { data: stockRows } = await supabase
    .from("inventory_stock_by_site")
    .select("product_id,current_qty")
    .eq("site_id", fromSiteId)
    .in("product_id", items.map((i) => i.product_id));
  const stockMap = new Map(
    (stockRows ?? []).map((r: { product_id: string; current_qty: number | null }) => [
      r.product_id,
      Number(r.current_qty ?? 0),
    ])
  );
  for (const item of items) {
    const available = stockMap.get(item.product_id) ?? 0;
    if (available < item.quantity) {
      hasLowStock = true;
      break;
    }
  }

  const params = new URLSearchParams({
    ok: "Remisión creada.",
    site_id: toSiteId,
  });
  if (hasLowStock) params.set("warning", "low_stock");
  redirect(`/inventory/remissions?${params.toString()}`);
}

export default async function RemissionsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const okMsg = sp.ok ? safeDecodeURIComponent(sp.ok) : "";

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/remissions",
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("site_id,role")
    .eq("id", user.id)
    .single();
  const { data: settings } = await supabase
    .from("employee_settings")
    .select("selected_site_id")
    .eq("employee_id", user.id)
    .maybeSingle();
  const cookieStore = await cookies();

  const actualRole = String(employee?.role ?? "");
  const roleOverride = String(cookieStore.get(ROLE_OVERRIDE_COOKIE)?.value ?? "").trim().toLowerCase();
  const canUseRoleOverride =
    Boolean(roleOverride) && PRIVILEGED_ROLE_OVERRIDES.has(actualRole.toLowerCase());
  const effectiveRole = (canUseRoleOverride ? roleOverride : actualRole).toLowerCase();
  const canViewAll = await checkPermissionWithRoleOverride({
    supabase,
    appId: APP_ID,
    code: PERMISSIONS.remissionsAllSites,
    actualRole,
  });

  const { data: sitesRows } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(50);

  const employeeSiteRows = (sitesRows ?? []) as EmployeeSiteRow[];
  const defaultSiteId = employeeSiteRows[0]?.site_id ?? employee?.site_id ?? "";
  const siteOverrideId = String(cookieStore.get(SITE_OVERRIDE_COOKIE)?.value ?? "").trim();
  const selectedSiteId = String(settings?.selected_site_id ?? "").trim();
  let activeSiteId =
    sp.site_id !== undefined
      ? String(sp.site_id).trim()
      : siteOverrideId || selectedSiteId || (canViewAll ? "" : defaultSiteId);
  if (!activeSiteId && !canViewAll) {
    activeSiteId = defaultSiteId;
  }

  const siteIds = employeeSiteRows
    .map((row) => row.site_id)
    .filter((id): id is string => Boolean(id));

  const { data: sites } = siteIds.length
    ? await supabase
      .from("sites")
      .select("id,name,site_type")
      .in("id", siteIds)
      .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  const siteRows = (sites ?? []) as SiteRow[];
  const siteMap = new Map(siteRows.map((site) => [site.id, site]));
  if (activeSiteId && !siteMap.has(activeSiteId)) {
    activeSiteId = defaultSiteId;
  }
  const activeSite = activeSiteId ? siteMap.get(activeSiteId) : undefined;
  const isAllSites = !activeSiteId && canViewAll;
  const activeSiteName = isAllSites ? "Todas las sedes" : activeSite?.name ?? activeSiteId;
  const activeSiteType = String(activeSite?.site_type ?? "");
  const isProductionCenter = activeSiteType === "production_center";

  const canRequestPermission = activeSiteId
    ? await checkPermissionWithRoleOverride({
      supabase,
      appId: APP_ID,
      code: PERMISSIONS.remissionsRequest,
      context: { siteId: activeSiteId },
      actualRole,
    })
    : false;
  const canTransitPermission = activeSiteId
    ? await checkPermissionWithRoleOverride({
      supabase,
      appId: APP_ID,
      code: PERMISSIONS.remissionsTransit,
      context: { siteId: activeSiteId },
      actualRole,
    })
    : false;

  const viewMode = isAllSites ? "all" : isProductionCenter ? "bodega" : "satélite";
  const canCreate = viewMode === "satélite" && canRequestPermission;
  const canCancelPermission = await checkPermissionWithRoleOverride({
    supabase,
    appId: APP_ID,
    code: PERMISSIONS.remissionsCancel,
    actualRole,
  });
  const canManageRemissionActions = canCancelPermission;
  const canEditOwnPendingPermission = activeSiteId
    ? await checkPermissionWithRoleOverride({
      supabase,
      appId: APP_ID,
      code: PERMISSIONS.remissionsEditOwnPending,
      context: { siteId: activeSiteId },
      actualRole,
    })
    : false;
  const employeeAccessibleSiteIds = new Set(
    employeeSiteRows
      .map((row) => String(row.site_id ?? "").trim())
      .filter(Boolean)
  );

  const { data: routes } = await supabase
    .from("site_supply_routes")
    .select("fulfillment_site_id")
    .eq("requesting_site_id", activeSiteId)
    .eq("is_active", true)
    .limit(1);

  const fulfillmentSiteIds = (routes ?? [])
    .map((route: { fulfillment_site_id: string | null }) => route.fulfillment_site_id)
    .filter((id: string | null): id is string => Boolean(id));

  const { data: fulfillmentSites } = fulfillmentSiteIds.length
    ? await supabase
      .from("sites")
      .select("id,name,site_type")
      .in("id", fulfillmentSiteIds)
      .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  let fulfillmentSiteRows = (fulfillmentSites ?? []) as SiteRow[];
  if (activeSiteId && fulfillmentSiteRows.length === 0) {
    const { data: fallbackSites } = await supabase
      .from("sites")
      .select("id,name,site_type")
      .eq("site_type", "production_center")
      .order("name", { ascending: true })
      .limit(50);
    fulfillmentSiteRows = (fallbackSites ?? []) as SiteRow[];
  }
  const requestedFromSiteId = sp.from_site_id ? String(sp.from_site_id).trim() : "";
  const selectedFromSiteId =
    requestedFromSiteId && fulfillmentSiteRows.some((site) => site.id === requestedFromSiteId)
      ? requestedFromSiteId
      : fulfillmentSiteRows[0]?.id ?? "";
  const requestedCreateParam = String(sp.new ?? "")
    .trim()
    .toLowerCase();
  const showCreatePanel =
    requestedCreateParam === "1" ||
    requestedCreateParam === "true" ||
    requestedCreateParam === "new";
  const buildHubHref = (opts?: { showCreate?: boolean; hash?: string }) => {
    const params = new URLSearchParams();
    if (activeSiteId) params.set("site_id", activeSiteId);
    if (selectedFromSiteId) params.set("from_site_id", selectedFromSiteId);
    if (opts?.showCreate) params.set("new", "1");
    const qs = params.toString();
    const hash = opts?.hash ? `#${opts.hash}` : "";
    return `/inventory/remissions${qs ? `?${qs}` : ""}${hash}`;
  };
  let remissionsQuery = supabase
    .from("restock_requests")
    .select(
      "id, created_at, status, from_site_id, to_site_id, notes, created_by, prepared_by, prepared_at, in_transit_by, in_transit_at, received_by, received_at"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (activeSiteId) {
    remissionsQuery =
      viewMode === "bodega"
        ? remissionsQuery.eq("from_site_id", activeSiteId)
        : remissionsQuery.eq("to_site_id", activeSiteId);
  }
  const { data: remissions } = await remissionsQuery;
  const remissionRows = (remissions ?? []) as RemissionRow[];
  const remissionIds = remissionRows.map((row) => row.id).filter(Boolean);
  const { data: operationalSummaryData } = remissionIds.length
    ? await supabase
        .from("restock_operational_summary")
        .select("request_id,can_transit")
        .in("request_id", remissionIds)
    : { data: [] as RemissionOperationalSummaryRow[] };
  const canTransitByRequestId = new Map<string, boolean>();
  for (const row of (operationalSummaryData ?? []) as RemissionOperationalSummaryRow[]) {
    const requestId = String(row.request_id ?? "").trim();
    if (!requestId) continue;
    canTransitByRequestId.set(requestId, Boolean(row.can_transit));
  }
  // Fallback: calcular "lista para despacho" desde ítems cuando la vista
  // operacional no devuelve filas (RLS/contexto), para mantener consistencia
  // con el detalle de la remisión.
  const missingOperationalIds = remissionIds.filter((id) => !canTransitByRequestId.has(id));
  if (missingOperationalIds.length) {
    const { data: itemMetricsData } = await supabase
      .from("restock_request_items")
      .select("request_id,quantity,prepared_quantity")
      .in("request_id", missingOperationalIds);
    const itemsByRequestId = new Map<string, RemissionItemMetricsRow[]>();
    for (const row of (itemMetricsData ?? []) as RemissionItemMetricsRow[]) {
      const requestId = String(row.request_id ?? "").trim();
      if (!requestId) continue;
      const list = itemsByRequestId.get(requestId) ?? [];
      list.push(row);
      itemsByRequestId.set(requestId, list);
    }
    for (const requestId of missingOperationalIds) {
      const rows = itemsByRequestId.get(requestId) ?? [];
      if (!rows.length) {
        canTransitByRequestId.set(requestId, false);
        continue;
      }
      let hasDispatchReady = false;
      let hasDispatchBlocked = false;
      for (const row of rows) {
        const requestedQty = Number(row.quantity ?? 0);
        if (requestedQty <= 0) continue;
        const preparedQty = Number(row.prepared_quantity ?? 0);
        if (preparedQty > 0) hasDispatchReady = true;
        else hasDispatchBlocked = true;
      }
      canTransitByRequestId.set(requestId, hasDispatchReady && !hasDispatchBlocked);
    }
  }
  const remissionActorIds = Array.from(
    new Set(
      remissionRows
        .flatMap((row) => [
          String(row.created_by ?? ""),
          String(row.prepared_by ?? ""),
          String(row.in_transit_by ?? ""),
          String(row.received_by ?? ""),
        ])
        .filter(Boolean)
    )
  );
  const { data: remissionEmployeesData } = remissionActorIds.length
    ? await supabase
        .from("employees")
        .select("id,full_name,alias")
        .in("id", remissionActorIds)
    : { data: [] as EmployeeNameRow[] };
  const remissionEmployeeMap = new Map(
    ((remissionEmployeesData ?? []) as EmployeeNameRow[]).map((employee) => [
      employee.id,
      displayEmployeeName(employee),
    ])
  );

  const areaFilterSiteId = canCreate ? activeSiteId : selectedFromSiteId;
  const { data: areas } = areaFilterSiteId
    ? await supabase
      .from("areas")
      .select("id,name,kind,site_id")
      .eq("site_id", areaFilterSiteId)
      .order("name", { ascending: true })
    : { data: [] as AreaRow[] };

  const areaRows = (areas ?? []) as AreaRow[];
  const { data: areaKindsPurposeData, error: areaKindsPurposeError } = await supabase
    .from("area_kinds")
    .select("code,use_for_remission");
  const { data: siteAreaPurposeRulesData } = areaFilterSiteId
    ? await supabase
        .from("site_area_purpose_rules")
        .select("site_id,area_kind,purpose,is_enabled")
        .eq("site_id", areaFilterSiteId)
        .eq("purpose", "remission")
    : { data: [] as SiteAreaPurposeRuleRow[] };
  const siteOverrideKinds = new Set(
    ((siteAreaPurposeRulesData ?? []) as SiteAreaPurposeRuleRow[])
      .filter((row) => Boolean(row.is_enabled))
      .map((row) => String(row.area_kind ?? "").trim())
      .filter(Boolean)
  );
  const hasSiteOverride = siteOverrideKinds.size > 0;
  const remissionAreaKindCodes = !areaKindsPurposeError
    ? new Set(
        ((areaKindsPurposeData ?? []) as AreaKindPurposeRow[])
          .filter((row) => Boolean(row.use_for_remission))
          .map((row) => String(row.code ?? "").trim())
          .filter(Boolean)
      )
    : new Set(["mostrador", "bar", "cocina", "general"]);
  remissionAreaKindCodes.add("general");
  const areaOptionsMap = Array.from(
    areaRows.reduce((map, row) => {
      const key = String(row.kind ?? "").trim();
      if (!key) return map;
      if (hasSiteOverride && !siteOverrideKinds.has(key)) return map;
      if (!remissionAreaKindCodes.has(key)) return map;
      if (!map.has(key)) {
        map.set(key, {
          value: key,
          label: key === "general" ? "Todos" : row.name ?? key,
        });
      }
      return map;
    }, new Map<string, { value: string; label: string }>())
  ).map(([, value]) => value);

  const areaOptions = (() => {
    const base = [...areaOptionsMap];
    if (!base.some((option) => option.value === "general")) {
      base.unshift({ value: "general", label: "Todos" });
    } else {
      const general = base.find((option) => option.value === "general");
      if (general) general.label = "Todos";
    }
    return base.sort((a, b) => {
      if (a.value === "general") return -1;
      if (b.value === "general") return 1;
      return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
    });
  })();

  // Insumos por satélite: filtrar por sede DESTINO (Saudo), no por sede origen (Centro).
  // Cuando el satélite solicita, solo debe ver productos configurados para su sede.
  const productFilterSiteId = canCreate ? activeSiteId : selectedFromSiteId;
  const requestedAudience = inferAudienceFromSiteName(activeSite?.name ?? "");
  const productSiteRows = productFilterSiteId
    ? await loadProductSiteRows(supabase, productFilterSiteId)
    : [];
  const hasActiveSiteProductConfig = productSiteRows.length > 0;
  const productSiteIds = productSiteRows
    .filter((row) => supportsAudience(row.audience, requestedAudience))
    .map((row) => row.product_id);
  const hasAudienceProducts = productSiteIds.length > 0;

  let productRows: ProductRow[] = [];
  if (hasAudienceProducts) {
    const productsQuery = await supabase
      .from("product_inventory_profiles")
      .select("product_id, products(id,name,unit,stock_unit_code,category_id)")
      .eq("track_inventory", true)
      .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
      .in("product_id", productSiteIds)
      .order("name", { foreignTable: "products", ascending: true })
      .limit(400);

    productRows = ((productsQuery.data ?? []) as unknown as ProductProfileWithProduct[])
      .map((row) => row.products)
      .filter((r): r is ProductRow => Boolean(r));

    if (productRows.length === 0) {
      const { data: fallbackProducts } = await supabase
        .from("products")
        .select("id,name,unit,stock_unit_code,category_id")
        .eq("is_active", true)
        .in("id", productSiteIds)
        .order("name", { ascending: true })
        .limit(400);
      productRows = (fallbackProducts ?? []) as unknown as ProductRow[];
    }
  }
  const productIds = productRows.map((row) => row.id);
  const categoryIds = Array.from(
    new Set(productRows.map((row) => String(row.category_id ?? "").trim()).filter(Boolean))
  );
  const { data: categoryData } = categoryIds.length
    ? await supabase
      .from("product_categories")
      .select("id,name,parent_id")
      .in("id", categoryIds)
    : { data: [] as Array<{ id: string; name: string | null; parent_id: string | null }> };
  const categoryNameById = new Map(
    ((categoryData ?? []) as Array<{ id: string; name: string | null }>).map((row) => [
      row.id,
      String(row.name ?? "").trim() || "Sin categoria",
    ])
  );
  const { data: uomProfilesData } = productIds.length
    ? await supabase
      .from("product_uom_profiles")
      .select(
        "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
      )
      .in("product_id", productIds)
      .eq("is_active", true)
    : { data: [] as ProductUomProfile[] };
  const defaultUomProfiles = (uomProfilesData ?? []) as ProductUomProfile[];
  const canCreateWithConfiguredCatalog =
    canCreate && hasActiveSiteProductConfig && hasAudienceProducts;
  const pendingCount = remissionRows.filter((row) =>
    ["pending", "preparing"].includes(String(row.status ?? ""))
  ).length;
  const transitCount = remissionRows.filter((row) =>
    ["in_transit", "partial"].includes(String(row.status ?? ""))
  ).length;
  const receivedCount = remissionRows.filter((row) =>
    ["received", "closed"].includes(String(row.status ?? ""))
  ).length;
  const openRemissionRows = remissionRows.filter((row) =>
    ["pending", "preparing", "in_transit", "partial"].includes(String(row.status ?? ""))
  );
  const nextReceiveRow = remissionRows.find((row) =>
    ["in_transit", "partial"].includes(String(row.status ?? ""))
  );
  const nextPrepareRow = remissionRows.find((row) =>
    ["pending", "preparing"].includes(String(row.status ?? ""))
  );
  const heroViewLabel =
    viewMode === "all"
      ? "Todas las sedes"
      : viewMode === "bodega"
        ? "Centro operando"
        : activeSiteName;
  const heroContextTone =
    viewMode === "bodega" ? "center" : viewMode === "satélite" ? "satellite" : "all";
  const heroTitle =
    viewMode === "bodega"
      ? "Preparar solicitudes"
      : canCreate
        ? "Pedir a Centro"
        : "Recibir desde Centro";
  const heroSubtitle =
    viewMode === "bodega"
      ? "Centro solo ve lo necesario para preparar y despachar."
      : canCreate
        ? "Elige productos y envía la solicitud. Luego solo sigues el estado."
        : "Aquí solo aparecen las remisiones que todavía te toca recibir.";
  const heroPrimaryHref =
    viewMode === "bodega"
      ? canTransitPermission
        ? "/inventory/remissions/transit"
        : nextPrepareRow
          ? `/inventory/remissions/${nextPrepareRow.id}?from=prepare`
          : "/inventory/remissions/prepare"
      : nextReceiveRow
        ? `/inventory/remissions/${nextReceiveRow.id}`
        : canCreate
          ? buildHubHref({ showCreate: true, hash: "nueva-remision" })
          : "/inventory/remissions";
  const heroPrimaryLabel =
    viewMode === "bodega"
      ? canTransitPermission
        ? "Cola tránsito"
        : nextPrepareRow
          ? "Abrir siguiente"
          : "Abrir cola"
      : nextReceiveRow
        ? "Recibir ahora"
        : canCreate
          ? "Nueva solicitud"
          : "Ver remisiones";
  const compactOperatorView = viewMode !== "all";
  const detailHrefForRow = (rowId: string) =>
    activeSiteId
      ? `/inventory/remissions/${rowId}?site_id=${encodeURIComponent(activeSiteId)}`
      : `/inventory/remissions/${rowId}`;
  const actionRows = openRemissionRows;
  const historyRows = remissionRows.filter((row) =>
    ["received", "closed", "cancelled"].includes(String(row.status ?? ""))
  );
  const fulfillmentSiteIdsForStock = fulfillmentSiteRows
    .map((site) => site.id)
    .filter((id): id is string => Boolean(id));
  const { data: stockReferenceData } =
    canCreateWithConfiguredCatalog && fulfillmentSiteIdsForStock.length > 0 && productIds.length > 0
      ? await supabase
        .from("inventory_stock_by_site")
        .select("site_id,product_id,current_qty,updated_at")
        .in("site_id", fulfillmentSiteIdsForStock)
        .in("product_id", productIds)
      : { data: [] as StockReferenceRow[] };
  const originStockRows = ((stockReferenceData ?? []) as StockReferenceRow[]).map((row) => ({
    siteId: row.site_id,
    productId: row.product_id,
    currentQty: Number(row.current_qty ?? 0),
    updatedAt: row.updated_at,
  }));

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up" data-context={heroContextTone}>
        <div className="ui-remission-hero-grid">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="ui-chip ui-chip--brand">{heroViewLabel}</span>
                {viewMode === "bodega" ? (
                  <span className="ui-chip ui-chip--ops-center">Centro</span>
                ) : null}
                {viewMode === "satélite" ? (
                  <span className="ui-chip ui-chip--ops-satellite">Satelite</span>
                ) : null}
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
                {heroTitle}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-muted)] sm:text-base">
                {heroSubtitle}
              </p>
            </div>
            {activeSiteId ? (
              <Link
                href={heroPrimaryHref}
                className="ui-btn ui-btn--brand h-12 px-5 text-base font-semibold"
              >
                {heroPrimaryLabel}
              </Link>
            ) : null}
          </div>
          <div className="ui-remission-kpis">
            <div className="ui-remission-kpi">
              <div className="ui-remission-kpi-label">Por preparar</div>
              <div className="ui-remission-kpi-value">{pendingCount}</div>
              <div className="ui-remission-kpi-note">Pendientes o preparando</div>
            </div>
            <div className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">En movimiento</div>
              <div className="ui-remission-kpi-value">{transitCount}</div>
              <div className="ui-remission-kpi-note">En viaje o parciales</div>
            </div>
            <div className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Recibidas</div>
              <div className="ui-remission-kpi-value">{receivedCount}</div>
              <div className="ui-remission-kpi-note">Cierre operativo</div>
            </div>
          </div>
        </div>
      </section>

      {errorMsg ? (
        <div className="ui-alert ui-alert--error ui-fade-up ui-delay-1">
          Error: {errorMsg}
        </div>
      ) : null}

      {okMsg ? (
        <div className="ui-alert ui-alert--success ui-fade-up ui-delay-1">{okMsg}</div>
      ) : null}

      {sp.warning === "low_stock" ? (
        <div className="ui-alert ui-alert--warn ui-fade-up ui-delay-1">
          Algunos items podrian no tener stock suficiente en Centro.
        </div>
      ) : null}

      <div className="ui-panel ui-panel--halo ui-remission-section ui-fade-up ui-delay-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Sede activa</div>
            <div className="mt-1 ui-caption">
              Vista:{" "}
              {viewMode === "all"
                ? "Todas las sedes"
                : viewMode === "bodega"
                  ? "Bodega (Centro)"
                  : "Sede satélite"}
            </div>
          </div>
          {compactOperatorView ? (
            <details className="rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                Cambiar sede
              </summary>
              <form method="get" className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <select
                  name="site_id"
                  defaultValue={activeSiteId}
                  className="ui-input"
                >
                  {canViewAll ? <option value="">Todas las sedes</option> : null}
                  {employeeSiteRows.map((row) => {
                    const siteId = row.site_id ?? "";
                    if (!siteId) return null;
                    const site = siteMap.get(siteId);
                    const label = site?.name ? `${site.name}` : siteId;
                    const suffix = row.is_primary ? " (principal)" : "";
                    return (
                      <option key={siteId} value={siteId}>
                        {label}
                        {suffix}
                      </option>
                    );
                  })}
                </select>
                <button className="ui-btn ui-btn--ghost">Usar sede</button>
              </form>
            </details>
          ) : (
            <form method="get" className="flex items-center gap-3">
              <select
                name="site_id"
                defaultValue={activeSiteId}
                className="ui-input"
              >
                {canViewAll ? <option value="">Todas las sedes</option> : null}
                {employeeSiteRows.map((row) => {
                  const siteId = row.site_id ?? "";
                  if (!siteId) return null;
                  const site = siteMap.get(siteId);
                  const label = site?.name ? `${site.name}` : siteId;
                  const suffix = row.is_primary ? " (principal)" : "";
                  return (
                    <option key={siteId} value={siteId}>
                      {label}
                      {suffix}
                    </option>
                  );
                })}
              </select>
              <button className="ui-btn ui-btn--ghost">
                Cambiar
              </button>
            </form>
          )}
        </div>

        {!activeSiteId ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            {canViewAll
              ? "Vista global activa. Selecciona una sede para operar remisiones."
              : "No hay sede activa. Asigna una sede al empleado para operar remisiones."}
          </div>
        ) : null}

        {!canCreate && viewMode === "satélite" ? (
          <div className="mt-4 ui-alert ui-alert--neutral">
            {activeSiteId && !canRequestPermission && effectiveRole === "conductor" ? (
              <>
                El rol <strong>conductor</strong> no puede solicitar remisiones en sede satélite.
                Este rol opera remisiones en tránsito/recepción.
                Cambia a <code>cajero</code>, <code>barista</code>, <code>cocinero</code> o{" "}
                <code>propietario</code> para crear solicitudes.
              </>
            ) : activeSiteId && !canRequestPermission ? (
              <>
                No puedes crear remisiones en esta sede porque falta el permiso{" "}
                <code>nexo.inventory.remissions.request</code> para tu rol actual.
                Verifica rol/sede activa y permisos en BD.
              </>
            ) : (
              <>
                Esta vista queda en modo recepción. Cuando una remisión salga desde Centro, aquí podrás abrirla y recibirla.
              </>
            )}
          </div>
        ) : null}

        {canCreate && activeSiteId && fulfillmentSiteIds.length === 0 ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            No hay rutas de abastecimiento para {activeSiteName}. Configúralas en{" "}
            <Link href="/inventory/settings/supply-routes" className="font-semibold underline">
              Configuración → Rutas de abastecimiento
            </Link>
            .
          </div>
        ) : null}

        {canCreate && !hasActiveSiteProductConfig ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            Esta sede no tiene productos habilitados. Configura disponibilidad por sede en{" "}
            <Link href="/inventory/catalog" className="font-semibold underline">
              Catalogo
            </Link>
            .
          </div>
        ) : null}

        {canCreate && hasActiveSiteProductConfig && !hasAudienceProducts ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            Esta sede no tiene productos habilitados para su uso operativo. Ajusta Uso en sede en{" "}
            <Link href="/inventory/catalog" className="font-semibold underline">
              Catalogo
            </Link>
            .
          </div>
        ) : null}

        {canCreate && hasActiveSiteProductConfig && hasAudienceProducts && productRows.length === 0 ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            No hay insumos configurados para {activeSiteName}. Añade la sede en{" "}
            <Link href="/inventory/catalog" className="font-semibold underline">
              Catálogo
            </Link>
            → ficha del producto → Sedes.
          </div>
        ) : null}

      </div>

      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2" id="solicitudes-abiertas">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ui-h3">
              {viewMode === "bodega"
                ? "Requieren accion ahora"
                : nextReceiveRow
                  ? "Requieren accion ahora"
                  : canCreate
                    ? "Solicitudes abiertas"
                    : "Remisiones abiertas"}
            </div>
            <div className="mt-1 ui-caption">
              {actionRows.length} remision(es) pendientes, preparando, en transito o parciales
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">{pendingCount} activas</span>
            <span className="ui-chip ui-chip--warn">{transitCount} en curso</span>
            <span className="ui-chip ui-chip--success">{receivedCount} recibidas</span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                {viewMode !== "bodega" ? <TableHeaderCell>Origen</TableHeaderCell> : null}
                {viewMode !== "satélite" ? <TableHeaderCell>Destino</TableHeaderCell> : null}
                {!compactOperatorView ? <TableHeaderCell>Trazabilidad</TableHeaderCell> : null}
                <TableHeaderCell>Acciones</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {actionRows.map((row) => {
                const effectiveStatus = getEffectiveRemissionStatus(row, canTransitByRequestId);
                const fromSiteId = row.from_site_id ?? "";
                const toSiteId = row.to_site_id ?? "";
                const rowCanFrom = canCancelPermission && employeeAccessibleSiteIds.has(fromSiteId);
                const rowCanTo = canCancelPermission && employeeAccessibleSiteIds.has(toSiteId);
                const rowCanManageBasic = canManageRemissionActions && (canViewAll || rowCanFrom || rowCanTo);
                const rowCanReverse = canManageRemissionActions && (canViewAll || (rowCanFrom && rowCanTo));
                const rowCanEditOwnPending =
                  canEditOwnPendingPermission &&
                  String(row.created_by ?? "") === user.id &&
                  String(row.status ?? "") === "pending" &&
                  String(row.to_site_id ?? "") === activeSiteId;

                const rowActions = getListActionsForRemission(
                  row.status,
                  row.notes,
                  rowCanManageBasic,
                  rowCanReverse,
                  rowCanEditOwnPending
                );
                return (
                  <tr key={row.id} className="ui-body">
                    <TableCell>{formatDateTime(row.created_at)}</TableCell>
                    <TableCell>
                      <span
                        className={`${formatStatus(effectiveStatus).className} ui-chip--status-${String(effectiveStatus ?? "unknown")}`}
                      >
                        {formatStatus(effectiveStatus).label}
                      </span>
                    </TableCell>
                    {viewMode !== "bodega" ? (
                      <TableCell>
                        {siteMap.get(fromSiteId)?.name ?? fromSiteId}
                      </TableCell>
                    ) : null}
                    {viewMode !== "satélite" ? (
                      <TableCell>
                        {siteMap.get(toSiteId)?.name ?? toSiteId}
                      </TableCell>
                    ) : null}
                    {!compactOperatorView ? (
                      <TableCell>
                        <div className="font-medium text-[var(--ui-text)]">
                          {buildRemissionTraceSummary(row, remissionEmployeeMap)}
                        </div>
                        {row.notes ? <div className="ui-caption mt-1">Nota: {row.notes}</div> : null}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={detailHrefForRow(row.id)}
                          className="ui-btn ui-btn--ghost h-11 px-4 text-sm font-semibold"
                        >
                          {viewMode === "bodega"
                            ? canTransitPermission && String(row.status ?? "") === "preparing"
                              ? "Checklist tránsito"
                              : "Preparar"
                            : ["in_transit", "partial"].includes(String(row.status ?? ""))
                              ? "Recibir"
                              : "Ver"}
                        </Link>
                        {rowActions.includes("edit") ? (
                          <Link
                            href={
                              activeSiteId
                                ? `/inventory/remissions/${row.id}/edit?site_id=${encodeURIComponent(activeSiteId)}`
                                : `/inventory/remissions/${row.id}/edit`
                            }
                            className="ui-btn ui-btn--ghost ui-btn--compact px-3 text-sm font-semibold"
                          >
                            Editar
                          </Link>
                        ) : null}
                        {rowActions.includes("cancel") ? (
                          <form action={runRemissionListAction}>
                            <input type="hidden" name="request_id" value={row.id} />
                            <input type="hidden" name="action" value="cancel" />
                            <button className="ui-btn ui-btn--ghost ui-btn--compact px-3 text-sm font-semibold">
                              Cancelar
                            </button>
                          </form>
                        ) : null}
                        {rowActions.includes("reverse_cancel") ? (
                          <form action={runRemissionListAction}>
                            <input type="hidden" name="request_id" value={row.id} />
                            <input type="hidden" name="action" value="reverse_cancel" />
                            <button className="ui-btn ui-btn--action ui-btn--compact px-3 text-sm font-semibold">
                              Anular + reversa
                            </button>
                          </form>
                        ) : null}
                        {rowActions.includes("delete") ? (
                          <form action={runRemissionListAction}>
                            <input type="hidden" name="request_id" value={row.id} />
                            <input type="hidden" name="action" value="delete" />
                            <button className="ui-btn ui-btn--danger ui-btn--compact px-3 text-sm font-semibold">
                              Eliminar
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </TableCell>
                  </tr>
                );
              })}

              {!actionRows.length ? (
                <tr>
                  <TableCell colSpan={compactOperatorView ? 4 : 6} className="ui-empty">
                    No hay remisiones que requieran accion en este momento.
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </div>

      {canCreateWithConfiguredCatalog && !showCreatePanel ? (
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2" id="nueva-remision">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="ui-h3">Nueva remisión</div>
              <div className="mt-1 ui-caption">
                Formulario oculto para mantener esta pantalla limpia.
              </div>
            </div>
            <Link
              href={buildHubHref({ showCreate: true, hash: "nueva-remision" })}
              className="ui-btn ui-btn--brand h-11 px-4 text-sm font-semibold"
            >
              Abrir formulario
            </Link>
          </div>
        </div>
      ) : null}

      {canCreateWithConfiguredCatalog && showCreatePanel ? (
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2" id="nueva-remision">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="ui-h3">Nueva remisión</div>
              <div className="mt-1 ui-caption">
                Esta vista solo sirve para crear una solicitud nueva.
              </div>
            </div>
            <Link
              href={buildHubHref({ hash: "solicitudes-abiertas" })}
              className="ui-btn ui-btn--ghost h-11 px-4 text-sm font-semibold"
            >
              Ocultar formulario
            </Link>
          </div>
          <div className="mt-4">
            <RemissionsCreateForm
              action={createRemission}
              toSiteId={activeSiteId}
              toSiteName={activeSiteName}
              fromSiteOptions={fulfillmentSiteRows.map((site) => ({
                id: site.id,
                name: site.name ?? site.id,
              }))}
              defaultFromSiteId={selectedFromSiteId}
              products={productRows}
              categoryNameById={Object.fromEntries(categoryNameById)}
              defaultUomProfiles={defaultUomProfiles}
              areaOptions={areaOptions}
              originStockRows={originStockRows}
            />
          </div>
        </div>
      ) : null}

      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ui-h3">Historial reciente</div>
            <div className="mt-1 ui-caption">
              {historyRows.length} remision(es) ya recibidas o canceladas
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip ui-chip--success">{receivedCount} recibidas</span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                {viewMode !== "bodega" ? <TableHeaderCell>Origen</TableHeaderCell> : null}
                {viewMode !== "satélite" ? <TableHeaderCell>Destino</TableHeaderCell> : null}
                {!compactOperatorView ? <TableHeaderCell>Trazabilidad</TableHeaderCell> : null}
                <TableHeaderCell>Acciones</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {historyRows.slice(0, 20).map((row) => {
                const effectiveStatus = getEffectiveRemissionStatus(row, canTransitByRequestId);
                const fromSiteId = row.from_site_id ?? "";
                const toSiteId = row.to_site_id ?? "";
                const rowCanFrom = canCancelPermission && employeeAccessibleSiteIds.has(fromSiteId);
                const rowCanTo = canCancelPermission && employeeAccessibleSiteIds.has(toSiteId);
                const rowCanManageBasic = canManageRemissionActions && (canViewAll || rowCanFrom || rowCanTo);
                const rowCanReverse = canManageRemissionActions && (canViewAll || (rowCanFrom && rowCanTo));
                const rowCanEditOwnPending =
                  canEditOwnPendingPermission &&
                  String(row.created_by ?? "") === user.id &&
                  String(row.status ?? "") === "pending" &&
                  String(row.to_site_id ?? "") === activeSiteId;

                const rowActions = getListActionsForRemission(
                  row.status,
                  row.notes,
                  rowCanManageBasic,
                  rowCanReverse,
                  rowCanEditOwnPending
                );
                return (
                  <tr key={row.id} className="ui-body">
                    <TableCell>{formatDateTime(row.created_at)}</TableCell>
                    <TableCell>
                      <span
                        className={`${formatStatus(effectiveStatus).className} ui-chip--status-${String(effectiveStatus ?? "unknown")}`}
                      >
                        {formatStatus(effectiveStatus).label}
                      </span>
                    </TableCell>
                    {viewMode !== "bodega" ? (
                      <TableCell>{siteMap.get(fromSiteId)?.name ?? fromSiteId}</TableCell>
                    ) : null}
                    {viewMode !== "satélite" ? (
                      <TableCell>{siteMap.get(toSiteId)?.name ?? toSiteId}</TableCell>
                    ) : null}
                    {!compactOperatorView ? (
                      <TableCell>
                        <div className="font-medium text-[var(--ui-text)]">
                          {buildRemissionTraceSummary(row, remissionEmployeeMap)}
                        </div>
                        {row.notes ? <div className="ui-caption mt-1">Nota: {row.notes}</div> : null}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={detailHrefForRow(row.id)}
                          className="ui-btn ui-btn--ghost h-11 px-4 text-sm font-semibold"
                        >
                          Ver
                        </Link>
                        {rowActions.includes("edit") ? (
                          <Link
                            href={
                              activeSiteId
                                ? `/inventory/remissions/${row.id}/edit?site_id=${encodeURIComponent(activeSiteId)}`
                                : `/inventory/remissions/${row.id}/edit`
                            }
                            className="ui-btn ui-btn--ghost ui-btn--compact px-3 text-sm font-semibold"
                          >
                            Editar
                          </Link>
                        ) : null}
                        {rowActions.includes("cancel") ? (
                          <form action={runRemissionListAction}>
                            <input type="hidden" name="request_id" value={row.id} />
                            <input type="hidden" name="action" value="cancel" />
                            <button className="ui-btn ui-btn--ghost ui-btn--compact px-3 text-sm font-semibold">
                              Cancelar
                            </button>
                          </form>
                        ) : null}
                        {rowActions.includes("reverse_cancel") ? (
                          <form action={runRemissionListAction}>
                            <input type="hidden" name="request_id" value={row.id} />
                            <input type="hidden" name="action" value="reverse_cancel" />
                            <button className="ui-btn ui-btn--action ui-btn--compact px-3 text-sm font-semibold">
                              Anular + reversa
                            </button>
                          </form>
                        ) : null}
                        {rowActions.includes("delete") ? (
                          <form action={runRemissionListAction}>
                            <input type="hidden" name="request_id" value={row.id} />
                            <input type="hidden" name="action" value="delete" />
                            <button className="ui-btn ui-btn--danger ui-btn--compact px-3 text-sm font-semibold">
                              Eliminar
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </TableCell>
                  </tr>
                );
              })}

              {!historyRows.length ? (
                <tr>
                  <TableCell colSpan={compactOperatorView ? 4 : 6} className="ui-empty">
                    Todavia no hay historial reciente.
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}

