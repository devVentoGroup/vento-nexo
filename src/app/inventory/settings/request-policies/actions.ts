"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const APP_ID = "nexo";
const PATH = "/inventory/settings/request-policies";

const EPSILON = 0.000001;

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
  changeReason?: string | null;
};

export type SaveRequestConfigurationResult = {
  ok: boolean;
  message: string;
  policyId?: string;
  ignoredPresentationCount?: number;
  createdVersion?: boolean;
};

type PresentationRow = {
  id: string;
  qty_in_input_unit: number;
  qty_in_stock_unit: number;
};

type ExistingPolicy = {
  id: string;
  product_id: string;
  label: string;
  request_unit_code: string;
  base_unit_code: string;
  base_qty_per_request_unit: number;
  constraint_mode: string;
  minimum_request_qty: number | null;
  request_step_qty: number | null;
  allow_fraction: boolean;
  policy_kind: string;
  physical_uom_profile_id: string | null;
  is_default: boolean;
  version_number: number | null;
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

function sameNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  return Math.abs(Number(a) - Number(b)) < EPSILON;
}

function hasSemanticChange(
  current: ExistingPolicy,
  next: {
    request_unit_code: string;
    base_unit_code: string;
    base_qty_per_request_unit: number;
    constraint_mode: string;
    minimum_request_qty: number;
    request_step_qty: number;
    allow_fraction: boolean;
    policy_kind: string;
    physical_uom_profile_id: string | null;
  },
): boolean {
  return (
    current.request_unit_code !== next.request_unit_code ||
    current.base_unit_code !== next.base_unit_code ||
    !sameNumber(current.base_qty_per_request_unit, next.base_qty_per_request_unit) ||
    current.constraint_mode !== next.constraint_mode ||
    !sameNumber(current.minimum_request_qty, next.minimum_request_qty) ||
    !sameNumber(current.request_step_qty, next.request_step_qty) ||
    current.allow_fraction !== next.allow_fraction ||
    current.policy_kind !== next.policy_kind ||
    current.physical_uom_profile_id !== next.physical_uom_profile_id
  );
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

  const { data: product } = await supabase
    .from("products")
    .select("id,stock_unit_code,unit")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return { ok: false, message: "No se encontró el producto." };

  const canonicalBaseUnit = unitCode(product.stock_unit_code || product.unit || "");
  if (!canonicalBaseUnit || canonicalBaseUnit !== baseUnitCode) {
    return {
      ok: false,
      message: `La unidad base de la política debe coincidir con la unidad de inventario (${canonicalBaseUnit || "sin configurar"}).`,
    };
  }

  const requestedPresentationIds = Array.from(
    new Set((input.presentationIds ?? []).map(text).filter(Boolean)),
  );
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
  const preferredId = compatibleIds.includes(requestedPreferred)
    ? requestedPreferred
    : compatibleIds[0] ?? null;
  const isBasePolicy = requestUnitCode === baseUnitCode && sameNumber(baseQty, 1);
  const policyKind = isBasePolicy
    ? "base_unit"
    : compatibleIds.length === 1
      ? "physical_presentation"
      : "logical_group";
  const physicalProfileId = policyKind === "physical_presentation" ? compatibleIds[0] : null;
  const now = new Date().toISOString();

  let requestedPolicy: ExistingPolicy | null = null;
  let currentPolicy: ExistingPolicy | null = null;
  let duplicatePolicyToDeactivate: ExistingPolicy | null = null;
  const requestedPolicyId = text(input.policyId);

  if (requestedPolicyId) {
    const { data, error } = await supabase
      .from("product_request_policies")
      .select(
        "id,product_id,label,request_unit_code,base_unit_code,base_qty_per_request_unit,constraint_mode,minimum_request_qty,request_step_qty,allow_fraction,policy_kind,physical_uom_profile_id,is_default,version_number",
      )
      .eq("id", requestedPolicyId)
      .eq("product_id", productId)
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    requestedPolicy = (data as ExistingPolicy | null) ?? null;
  }

  let labelMatchQuery = supabase
    .from("product_request_policies")
    .select(
      "id,product_id,label,request_unit_code,base_unit_code,base_qty_per_request_unit,constraint_mode,minimum_request_qty,request_step_qty,allow_fraction,policy_kind,physical_uom_profile_id,is_default,version_number",
    )
    .eq("product_id", productId)
    .eq("is_active", true)
    .ilike("label", label)
    .limit(1);

  if (requestedPolicyId) {
    labelMatchQuery = labelMatchQuery.neq("id", requestedPolicyId);
  }

  const { data: labelMatchData, error: labelMatchError } =
    await labelMatchQuery.maybeSingle();
  if (labelMatchError) return { ok: false, message: labelMatchError.message };

  const labelMatch = (labelMatchData as ExistingPolicy | null) ?? null;

  if (labelMatch) {
    currentPolicy = labelMatch;
    if (requestedPolicy && requestedPolicy.id !== labelMatch.id) {
      duplicatePolicyToDeactivate = requestedPolicy;
    }
  } else {
    currentPolicy = requestedPolicy;
  }

  const semanticPayload = {
    request_unit_code: requestUnitCode,
    base_unit_code: baseUnitCode,
    base_qty_per_request_unit: baseQty,
    constraint_mode: "strict_multiple",
    minimum_request_qty: minimumQty,
    request_step_qty: stepQty,
    allow_fraction: Boolean(input.allowFraction),
    policy_kind: policyKind,
    physical_uom_profile_id: physicalProfileId,
  };
  const payload = {
    product_id: productId,
    label,
    ...semanticPayload,
    is_active: true,
    is_default: false,
    source: "manual",
    updated_at: now,
  };

  let policyId = currentPolicy?.id ?? "";
  let createdVersion = false;

  if (currentPolicy) {
    const { count: usageCount, error: usageError } = await supabase
      .from("restock_request_items")
      .select("id", { count: "exact", head: true })
      .eq("request_policy_id", currentPolicy.id);
    if (usageError) return { ok: false, message: usageError.message };

    const requiresVersion = Number(usageCount ?? 0) > 0 && hasSemanticChange(currentPolicy, semanticPayload);
    if (requiresVersion) {
      const wasDefault = Boolean(currentPolicy.is_default);
      const { error: deactivateError } = await supabase
        .from("product_request_policies")
        .update({
          is_active: false,
          is_default: false,
          change_reason: text(input.changeReason) || "Reemplazada por una nueva configuración operativa.",
          updated_at: now,
        })
        .eq("id", currentPolicy.id)
        .eq("product_id", productId);
      if (deactivateError) return { ok: false, message: deactivateError.message };

      const { data: inserted, error: insertVersionError } = await supabase
        .from("product_request_policies")
        .insert({
          ...payload,
          version_number: Number(currentPolicy.version_number ?? 1) + 1,
          supersedes_policy_id: currentPolicy.id,
          change_reason: text(input.changeReason) || "Cambio de equivalencia o reglas de solicitud.",
          created_by: user.id,
        })
        .select("id")
        .single();

      if (insertVersionError || !inserted?.id) {
        await supabase
          .from("product_request_policies")
          .update({ is_active: true, is_default: wasDefault, updated_at: new Date().toISOString() })
          .eq("id", currentPolicy.id);
        return {
          ok: false,
          message: insertVersionError?.message ?? "No fue posible crear la nueva versión de la política.",
        };
      }
      policyId = String(inserted.id);
      createdVersion = true;
    } else {
      const { data, error } = await supabase
        .from("product_request_policies")
        .update(payload)
        .eq("id", currentPolicy.id)
        .eq("product_id", productId)
        .select("id")
        .maybeSingle();
      if (error) return { ok: false, message: error.message };
      if (!data) policyId = "";
    }
  }

  if (!policyId) {
    const { data, error } = await supabase
      .from("product_request_policies")
      .insert({
        ...payload,
        version_number: 1,
        change_reason: text(input.changeReason) || "Configuración inicial.",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !data?.id) {
      return {
        ok: false,
        message: error?.message ?? "No fue posible crear la unidad de solicitud.",
      };
    }
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

  if (duplicatePolicyToDeactivate) {
    const { error: consolidateError } = await supabase
      .from("product_request_policies")
      .update({
        is_active: false,
        is_default: false,
        change_reason:
          text(input.changeReason) ||
          `Consolidada con la política activa "${label}" para evitar nombres duplicados.`,
        updated_at: now,
      })
      .eq("id", duplicatePolicyToDeactivate.id)
      .eq("product_id", productId);

    if (consolidateError) {
      return {
        ok: false,
        message:
          "La configuración se guardó, pero no fue posible desactivar la política duplicada: " +
          consolidateError.message,
      };
    }
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

  const ignoredSuffix = ignoredPresentationCount
    ? ` Se desvincularon ${ignoredPresentationCount} presentaciones incompatibles.`
    : "";
  const consolidationSuffix = duplicatePolicyToDeactivate
    ? " Se consolidó la política duplicada sin alterar solicitudes históricas."
    : "";
  return {
    ok: true,
    policyId,
    ignoredPresentationCount,
    createdVersion,
    message: createdVersion
      ? `Se creó una nueva versión sin alterar solicitudes históricas.${consolidationSuffix}${ignoredSuffix}`
      : `Configuración guardada.${consolidationSuffix}${ignoredSuffix}`,
  };
}

export async function deactivateRequestPolicy(input: {
  productId: string;
  policyId: string;
}): Promise<{ ok: boolean; message: string }> {
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
  const policyId = text(input.policyId);
  if (!productId || !policyId) return { ok: false, message: "Falta la política por desactivar." };

  const { data: activePolicies, error: policiesError } = await supabase
    .from("product_request_policies")
    .select("id,is_default")
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("is_default", { ascending: false });
  if (policiesError) return { ok: false, message: policiesError.message };

  const current = (activePolicies ?? []).find((policy) => policy.id === policyId);
  if (!current) return { ok: false, message: "La política ya no está activa o no pertenece a este producto." };
  const replacement = (activePolicies ?? []).find((policy) => policy.id !== policyId);
  if (!replacement) {
    return {
      ok: false,
      message: "No puedes desactivar la única política activa. Crea primero otra unidad de solicitud.",
    };
  }

  const now = new Date().toISOString();
  if (current.is_default) {
    const { error: clearDefaultError } = await supabase
      .from("product_request_policies")
      .update({ is_default: false, updated_at: now })
      .eq("id", policyId)
      .eq("product_id", productId);
    if (clearDefaultError) return { ok: false, message: clearDefaultError.message };

    const { error: setReplacementError } = await supabase
      .from("product_request_policies")
      .update({ is_default: true, updated_at: now })
      .eq("id", replacement.id)
      .eq("product_id", productId);
    if (setReplacementError) {
      await supabase
        .from("product_request_policies")
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq("id", policyId)
        .eq("product_id", productId);
      return { ok: false, message: setReplacementError.message };
    }
  }

  const { error: deactivateError } = await supabase
    .from("product_request_policies")
    .update({
      is_active: false,
      is_default: false,
      change_reason: "Desactivada desde configuración operativa de NEXO.",
      updated_at: now,
    })
    .eq("id", policyId)
    .eq("product_id", productId);
  if (deactivateError) return { ok: false, message: deactivateError.message };

  revalidatePath(PATH);
  revalidatePath("/inventory/remissions");
  revalidatePath(`/inventory/catalog/${encodeURIComponent(productId)}`);
  return {
    ok: true,
    message: current.is_default
      ? "Política desactivada. Se asignó otra política activa como predeterminada."
      : "Política desactivada. Las solicitudes históricas conservan su snapshot.",
  };
}