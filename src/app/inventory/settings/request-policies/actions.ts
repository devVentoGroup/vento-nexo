"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const APP_ID = "nexo";
const PATH = "/inventory/settings/request-policies";

type SaveInput = {
  productId: string;
  policyId?: string | null;
  label: string;
  requestUnitCode: string;
  baseUnitCode: string;
  baseQtyPerRequestUnit: number;
  minimumRequestQty: number | null;
  requestStepQty: number | null;
  allowFraction: boolean;
  presentationIds: string[];
  preferredPresentationId?: string | null;
  supplierOfferLinks: Array<{ productSupplierId: string; uomProfileId: string | null }>;
};

export type SaveRequestConfigurationResult = {
  ok: boolean;
  message: string;
  policyId?: string;
  ignoredPresentationCount?: number;
};

type PresentationRow = {
  id: string;
  qty_in_input_unit: number;
  qty_in_stock_unit: number;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function positive(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function unitCode(value: unknown): string {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.000001;
}

export async function saveRequestConfiguration(input: SaveInput): Promise<SaveRequestConfigurationResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: "Tu sesión no está activa." };

  const [{ data: employee }, canEdit] = await Promise.all([
    supabase.from("employees").select("role").eq("id", user.id).maybeSingle(),
    checkPermission(supabase, APP_ID, "catalog.products"),
  ]);
  const role = text(employee?.role).toLowerCase();
  if (!canEdit && !["propietario", "gerente_general"].includes(role)) {
    return { ok: false, message: "No tienes permisos para editar el catálogo." };
  }

  const productId = text(input.productId);
  const label = text(input.label);
  const requestUnitCode = unitCode(input.requestUnitCode);
  const baseUnitCode = unitCode(input.baseUnitCode);
  const baseQty = positive(input.baseQtyPerRequestUnit);
  const minimumQty = positive(input.minimumRequestQty);
  const stepQty = positive(input.requestStepQty);

  if (!productId || !label || !requestUnitCode || !baseUnitCode || !baseQty) {
    return { ok: false, message: "Completa nombre, unidad de solicitud y equivalencia válida." };
  }
  if (!minimumQty) return { ok: false, message: "La cantidad mínima debe ser mayor que cero." };
  if (!stepQty) return { ok: false, message: "El incremento debe ser mayor que cero." };

  const { data: product } = await supabase.from("products").select("id").eq("id", productId).maybeSingle();
  if (!product) return { ok: false, message: "No se encontró el producto." };

  const requestedPresentationIds = Array.from(new Set((input.presentationIds ?? []).map(text).filter(Boolean)));
  let compatiblePresentations: PresentationRow[] = [];
  if (requestedPresentationIds.length) {
    const { data, error } = await supabase
      .from("product_uom_profiles")
      .select("id,qty_in_input_unit,qty_in_stock_unit")
      .eq("product_id", productId)
      .eq("is_active", true)
      .in("id", requestedPresentationIds);
    if (error) return { ok: false, message: error.message };

    const rows = (data ?? []) as PresentationRow[];
    compatiblePresentations = rows.filter((row) => {
      const inputQty = Number(row.qty_in_input_unit);
      const stockQty = Number(row.qty_in_stock_unit);
      return inputQty > 0 && stockQty > 0 && sameNumber(stockQty / inputQty, baseQty);
    });
  }

  const compatibleIds = compatiblePresentations.map((row) => row.id);
  const ignoredPresentationCount = requestedPresentationIds.length - compatibleIds.length;
  const requestedPreferred = text(input.preferredPresentationId);
  const preferredId = compatibleIds.includes(requestedPreferred) ? requestedPreferred : compatibleIds[0] ?? null;
  const policyKind = compatibleIds.length === 1 ? "physical_presentation" : "logical_group";
  const physicalProfileId = compatibleIds.length === 1 ? compatibleIds[0] : null;
  const now = new Date().toISOString();

  const { data: sameLabelPolicy, error: lookupError } = await supabase
    .from("product_request_policies")
    .select("id")
    .eq("product_id", productId)
    .eq("is_active", true)
    .ilike("label", label)
    .limit(1)
    .maybeSingle();
  if (lookupError) return { ok: false, message: lookupError.message };

  let policyId = text(sameLabelPolicy?.id) || text(input.policyId);
  const payload = {
    product_id: productId,
    label,
    request_unit_code: requestUnitCode,
    base_unit_code: baseUnitCode,
    base_qty_per_request_unit: baseQty,
    constraint_mode: "strict_multiple",
    minimum_request_qty: minimumQty,
    request_step_qty: stepQty,
    allow_fraction: Boolean(input.allowFraction),
    is_active: true,
    is_default: false,
    policy_kind: policyKind,
    physical_uom_profile_id: physicalProfileId,
    source: "manual",
    updated_at: now,
  };

  if (policyId) {
    const { data, error } = await supabase
      .from("product_request_policies")
      .update(payload)
      .eq("id", policyId)
      .eq("product_id", productId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (!data) policyId = "";
  }

  if (!policyId) {
    const { data, error } = await supabase
      .from("product_request_policies")
      .insert({ ...payload, created_by: user.id })
      .select("id")
      .single();
    if (error || !data?.id) return { ok: false, message: error?.message ?? "No fue posible crear la unidad de solicitud." };
    policyId = String(data.id);
  }

  const { error: clearLinksError } = await supabase
    .from("product_request_policy_presentations")
    .delete()
    .eq("request_policy_id", policyId);
  if (clearLinksError) return { ok: false, message: clearLinksError.message };

  if (compatibleIds.length) {
    const { error } = await supabase.from("product_request_policy_presentations").insert(
      compatibleIds.map((uomProfileId, index) => ({
        request_policy_id: policyId,
        uom_profile_id: uomProfileId,
        is_preferred: uomProfileId === preferredId,
        allow_substitution: true,
        priority: uomProfileId === preferredId ? 0 : index + 1,
        updated_at: now,
      })),
    );
    if (error) return { ok: false, message: error.message };
  }

  for (const link of input.supplierOfferLinks ?? []) {
    const offerId = text(link.productSupplierId);
    const profileId = text(link.uomProfileId) || null;
    if (!offerId) continue;
    const { error } = await supabase
      .from("product_suppliers")
      .update({ uom_profile_id: profileId })
      .eq("id", offerId)
      .eq("product_id", productId);
    if (error) return { ok: false, message: error.message };
  }

  const { error: resetError } = await supabase
    .from("product_request_policies")
    .update({ is_default: false, updated_at: now })
    .eq("product_id", productId)
    .eq("is_active", true)
    .neq("id", policyId);
  if (resetError) return { ok: false, message: resetError.message };

  const { error: defaultError } = await supabase
    .from("product_request_policies")
    .update({ is_default: true, updated_at: now })
    .eq("id", policyId)
    .eq("product_id", productId);
  if (defaultError) return { ok: false, message: defaultError.message };

  revalidatePath(PATH);
  revalidatePath("/inventory/remissions");
  revalidatePath(`/inventory/catalog/${encodeURIComponent(productId)}`);

  return {
    ok: true,
    policyId,
    ignoredPresentationCount,
    message: ignoredPresentationCount
      ? `Configuración guardada. Se desvincularon ${ignoredPresentationCount} presentaciones incompatibles.`
      : "Configuración guardada.",
  };
}
