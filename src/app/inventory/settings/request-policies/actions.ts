"use server";

import { revalidatePath } from "next/cache";

import { checkPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const APP_ID = "nexo";
const PATH = "/inventory/settings/request-policies";

type SaveRequestConfigurationInput = {
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
  supplierOfferLinks: Array<{
    productSupplierId: string;
    uomProfileId: string | null;
  }>;
};

export type SaveRequestConfigurationResult = {
  ok: boolean;
  message: string;
  policyId?: string;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function positiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeUnitCode(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function saveRequestConfiguration(
  input: SaveRequestConfigurationInput,
): Promise<SaveRequestConfigurationResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user ?? null;

  if (!user) {
    return { ok: false, message: "Tu sesión no está activa." };
  }

  const [{ data: employee }, canEditByPermission] = await Promise.all([
    supabase.from("employees").select("role").eq("id", user.id).maybeSingle(),
    checkPermission(supabase, APP_ID, "catalog.products"),
  ]);

  const role = cleanText(employee?.role).toLowerCase();
  const canEditByRole = ["propietario", "gerente_general"].includes(role);
  if (!canEditByRole && !canEditByPermission) {
    return { ok: false, message: "No tienes permisos para editar el catálogo." };
  }

  const productId = cleanText(input.productId);
  const label = cleanText(input.label);
  const requestUnitCode = normalizeUnitCode(input.requestUnitCode);
  const baseUnitCode = normalizeUnitCode(input.baseUnitCode);
  const baseQty = positiveNumber(input.baseQtyPerRequestUnit);
  const minimumQty = input.minimumRequestQty == null ? null : positiveNumber(input.minimumRequestQty);
  const stepQty = input.requestStepQty == null ? null : positiveNumber(input.requestStepQty);
  const presentationIds = Array.from(
    new Set((input.presentationIds ?? []).map(cleanText).filter(Boolean)),
  );
  const preferredPresentationId = cleanText(input.preferredPresentationId) || null;

  if (!productId || !label || !requestUnitCode || !baseUnitCode || !baseQty) {
    return {
      ok: false,
      message: "Completa nombre, unidad de solicitud y equivalencia válida.",
    };
  }

  if (minimumQty == null) {
    return { ok: false, message: "La cantidad mínima debe ser mayor que cero." };
  }

  if (stepQty == null) {
    return { ok: false, message: "El incremento debe ser mayor que cero." };
  }

  if (preferredPresentationId && !presentationIds.includes(preferredPresentationId)) {
    return {
      ok: false,
      message: "La presentación preferida debe estar incluida entre las aceptadas.",
    };
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();

  if (productError || !product) {
    return { ok: false, message: "No se encontró el producto." };
  }

  if (presentationIds.length > 0) {
    const { data: presentationRows, error: presentationError } = await supabase
      .from("product_uom_profiles")
      .select("id")
      .eq("product_id", productId)
      .in("id", presentationIds);

    if (presentationError) {
      return { ok: false, message: presentationError.message };
    }

    if ((presentationRows ?? []).length !== presentationIds.length) {
      return {
        ok: false,
        message: "Una de las presentaciones seleccionadas no pertenece al producto.",
      };
    }
  }

  const policyKind =
    presentationIds.length === 1 ? "physical_presentation" : "logical_group";
  const physicalUomProfileId =
    presentationIds.length === 1 ? presentationIds[0] : null;
  const now = new Date().toISOString();

  const { error: resetDefaultsError } = await supabase
    .from("product_request_policies")
    .update({ is_default: false, updated_at: now })
    .eq("product_id", productId)
    .eq("is_active", true)
    .eq("is_default", true);

  if (resetDefaultsError) {
    return { ok: false, message: resetDefaultsError.message };
  }

  let policyId = cleanText(input.policyId);
  const policyPayload = {
    product_id: productId,
    label,
    request_unit_code: requestUnitCode,
    base_unit_code: baseUnitCode,
    base_qty_per_request_unit: baseQty,
    constraint_mode: "strict_multiple",
    minimum_request_qty: minimumQty,
    request_step_qty: stepQty,
    allow_fraction: Boolean(input.allowFraction),
    is_default: true,
    is_active: true,
    policy_kind: policyKind,
    physical_uom_profile_id: physicalUomProfileId,
    source: "manual",
    updated_at: now,
  };

  if (policyId) {
    const { data: updatedPolicy, error: updateError } = await supabase
      .from("product_request_policies")
      .update(policyPayload)
      .eq("id", policyId)
      .eq("product_id", productId)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return { ok: false, message: updateError.message };
    }

    if (!updatedPolicy) {
      policyId = "";
    }
  }

  if (!policyId) {
    const { data: insertedPolicy, error: insertError } = await supabase
      .from("product_request_policies")
      .insert({ ...policyPayload, created_by: user.id })
      .select("id")
      .single();

    if (insertError || !insertedPolicy?.id) {
      return {
        ok: false,
        message: insertError?.message ?? "No fue posible crear la unidad de solicitud.",
      };
    }

    policyId = String(insertedPolicy.id);
  }

  const { error: deleteLinksError } = await supabase
    .from("product_request_policy_presentations")
    .delete()
    .eq("request_policy_id", policyId);

  if (deleteLinksError) {
    return { ok: false, message: deleteLinksError.message };
  }

  if (presentationIds.length > 0) {
    const { error: insertLinksError } = await supabase
      .from("product_request_policy_presentations")
      .insert(
        presentationIds.map((uomProfileId, index) => ({
          request_policy_id: policyId,
          uom_profile_id: uomProfileId,
          is_preferred: preferredPresentationId
            ? uomProfileId === preferredPresentationId
            : index === 0,
          allow_substitution: true,
          priority: preferredPresentationId
            ? uomProfileId === preferredPresentationId
              ? 0
              : index + 1
            : index,
          updated_at: now,
        })),
      );

    if (insertLinksError) {
      return { ok: false, message: insertLinksError.message };
    }
  }

  for (const link of input.supplierOfferLinks ?? []) {
    const productSupplierId = cleanText(link.productSupplierId);
    const uomProfileId = cleanText(link.uomProfileId) || null;
    if (!productSupplierId) continue;

    if (uomProfileId && !presentationIds.includes(uomProfileId)) {
      const { data: presentation } = await supabase
        .from("product_uom_profiles")
        .select("id")
        .eq("id", uomProfileId)
        .eq("product_id", productId)
        .maybeSingle();

      if (!presentation) {
        return {
          ok: false,
          message: "La presentación seleccionada para un proveedor no pertenece al producto.",
        };
      }
    }

    const { error: supplierLinkError } = await supabase
      .from("product_suppliers")
      .update({ uom_profile_id: uomProfileId })
      .eq("id", productSupplierId)
      .eq("product_id", productId);

    if (supplierLinkError) {
      return { ok: false, message: supplierLinkError.message };
    }
  }

  revalidatePath(PATH);
  revalidatePath("/inventory/remissions");
  revalidatePath(`/inventory/catalog/${encodeURIComponent(productId)}`);

  return {
    ok: true,
    message: "Configuración guardada.",
    policyId,
  };
}
