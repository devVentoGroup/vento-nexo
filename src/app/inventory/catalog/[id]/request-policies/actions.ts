"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { checkPermission } from "@/lib/auth/permissions";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { normalizeUnitCode } from "@/lib/inventory/uom";
import { createClient } from "@/lib/supabase/server";

const APP_ID = "nexo";
const EDIT_PERMISSION = "catalog.products";

type ConstraintMode = "free" | "strict_multiple" | "preferred_multiple";

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function positive(value: FormDataEntryValue | null): number {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function optionalPositive(value: FormDataEntryValue | null): number | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function unitCode(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function physicalUnitCode(label: string): string {
  const normalized = unitCode(label);
  if (normalized.startsWith("six_pack")) return "six_pack";
  for (const prefix of ["caja", "bandeja", "bolsa", "botella", "paquete", "pote"]) {
    if (normalized.startsWith(prefix)) return prefix;
  }
  return normalized.split("_")[0] || "presentacion";
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pathFor(productId: string): string {
  return `/inventory/catalog/${encodeURIComponent(productId)}/request-policies`;
}

function go(productId: string, key: "ok" | "error", message: string): never {
  redirect(`${pathFor(productId)}?${key}=${encodeURIComponent(message)}`);
}

async function editor(productId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user ?? null;
  if (!user) redirect(await buildShellLoginUrl(pathFor(productId)));

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = String(employee?.role ?? "").toLowerCase();
  const allowed =
    ["propietario", "gerente_general"].includes(role) ||
    (await checkPermission(supabase, APP_ID, EDIT_PERMISSION));
  if (!allowed) go(productId, "error", "No tienes permisos para administrar políticas de solicitud.");

  const { data: product } = await supabase
    .from("products")
    .select("id,unit,stock_unit_code")
    .eq("id", productId)
    .maybeSingle();
  const baseUnitCode = normalizeUnitCode(product?.stock_unit_code || product?.unit || "");
  if (!product || !baseUnitCode) go(productId, "error", "El producto no tiene una unidad base válida.");

  return { supabase, user, baseUnitCode };
}

async function makeDefault(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  policyId: string
) {
  const { data: target, error: targetError } = await supabase
    .from("product_request_policies")
    .select("id,is_active,is_default")
    .eq("id", policyId)
    .eq("product_id", productId)
    .maybeSingle();
  if (targetError) throw new Error(targetError.message);
  if (!target?.is_active) throw new Error("La política seleccionada no está activa.");
  if (target.is_default) return;

  const { data: previous } = await supabase
    .from("product_request_policies")
    .select("id")
    .eq("product_id", productId)
    .eq("is_default", true)
    .maybeSingle();

  const { error: clearError } = await supabase
    .from("product_request_policies")
    .update({ is_default: false })
    .eq("product_id", productId)
    .eq("is_default", true);
  if (clearError) throw new Error(clearError.message);

  const { error: setError } = await supabase
    .from("product_request_policies")
    .update({ is_default: true, is_active: true })
    .eq("id", policyId)
    .eq("product_id", productId);
  if (!setError) return;

  if (previous?.id) {
    await supabase
      .from("product_request_policies")
      .update({ is_default: true, is_active: true })
      .eq("id", previous.id)
      .eq("product_id", productId);
  }
  throw new Error(setError.message);
}

export async function createLogicalPolicyAction(formData: FormData) {
  const productId = text(formData.get("product_id"));
  if (!productId) redirect("/inventory/catalog");
  const { supabase, user, baseUnitCode } = await editor(productId);

  const label = text(formData.get("label"));
  const requestUnitCode = unitCode(text(formData.get("request_unit_code")) || label);
  const factor = positive(formData.get("base_qty_per_request_unit"));
  const constraintMode = text(formData.get("constraint_mode")) as ConstraintMode;
  const minimum = optionalPositive(formData.get("minimum_request_qty"));
  const step = optionalPositive(formData.get("request_step_qty"));
  const allowFraction = formData.has("allow_fraction");

  if (!label || !requestUnitCode || factor <= 0) go(productId, "error", "Completa nombre, unidad y equivalencia.");
  if (!["free", "strict_multiple", "preferred_multiple"].includes(constraintMode)) {
    go(productId, "error", "Selecciona una regla de cantidad válida.");
  }
  if (Number.isNaN(minimum) || Number.isNaN(step)) go(productId, "error", "Mínimo y paso deben ser positivos.");
  if (constraintMode === "strict_multiple" && !step) go(productId, "error", "El múltiplo obligatorio necesita un paso.");
  if (!allowFraction && ((minimum != null && !Number.isInteger(minimum)) || (step != null && !Number.isInteger(step)))) {
    go(productId, "error", "Mínimo y paso deben ser enteros si no permites fracciones.");
  }

  const { data, error } = await supabase
    .from("product_request_policies")
    .insert({
      product_id: productId,
      label,
      request_unit_code: requestUnitCode,
      base_unit_code: baseUnitCode,
      base_qty_per_request_unit: factor,
      constraint_mode: constraintMode,
      minimum_request_qty: minimum,
      request_step_qty: step,
      allow_fraction: allowFraction,
      is_default: false,
      is_active: true,
      policy_kind: "logical_group",
      physical_uom_profile_id: null,
      source: "manual",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) go(productId, "error", error.message);

  if (formData.has("is_default") && data?.id) {
    try {
      await makeDefault(supabase, productId, data.id);
    } catch (error) {
      go(productId, "error", error instanceof Error ? error.message : "No se pudo asignar como predeterminada.");
    }
  }

  revalidatePath(pathFor(productId));
  go(productId, "ok", "Agrupación lógica creada.");
}

export async function createPhysicalPolicyAction(formData: FormData) {
  const productId = text(formData.get("product_id"));
  if (!productId) redirect("/inventory/catalog");
  const { supabase, user, baseUnitCode } = await editor(productId);
  const profileId = text(formData.get("physical_uom_profile_id"));
  if (!profileId) go(productId, "error", "Selecciona una presentación física.");

  const { data: profile, error: profileError } = await supabase
    .from("product_uom_profiles")
    .select("id,label,qty_in_input_unit,qty_in_stock_unit,is_active")
    .eq("id", profileId)
    .eq("product_id", productId)
    .maybeSingle();
  if (profileError) go(productId, "error", profileError.message);
  if (!profile?.is_active) go(productId, "error", "La presentación física no está activa.");

  const inputQty = numberValue(profile.qty_in_input_unit);
  const stockQty = numberValue(profile.qty_in_stock_unit);
  if (inputQty <= 0 || stockQty <= 0) go(productId, "error", "La presentación tiene una equivalencia inválida.");

  const { data: linked } = await supabase
    .from("product_request_policies")
    .select("label")
    .eq("product_id", productId)
    .eq("physical_uom_profile_id", profileId)
    .eq("is_active", true)
    .maybeSingle();
  if (linked) go(productId, "error", `La presentación ya está vinculada a "${linked.label}".`);

  const label = text(formData.get("label")) || String(profile.label ?? "").trim();
  const requestUnitCode = unitCode(text(formData.get("request_unit_code"))) || physicalUnitCode(label);
  if (!label || !requestUnitCode) go(productId, "error", "Define nombre y unidad operativa.");

  const { data, error } = await supabase
    .from("product_request_policies")
    .insert({
      product_id: productId,
      label,
      request_unit_code: requestUnitCode,
      base_unit_code: baseUnitCode,
      base_qty_per_request_unit: stockQty / inputQty,
      constraint_mode: "strict_multiple",
      minimum_request_qty: 1,
      request_step_qty: 1,
      allow_fraction: false,
      is_default: false,
      is_active: true,
      policy_kind: "physical_presentation",
      physical_uom_profile_id: profileId,
      source: "manual",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) go(productId, "error", error.message);

  if (formData.has("is_default") && data?.id) {
    try {
      await makeDefault(supabase, productId, data.id);
    } catch (error) {
      go(productId, "error", error instanceof Error ? error.message : "No se pudo asignar como predeterminada.");
    }
  }

  revalidatePath(pathFor(productId));
  go(productId, "ok", "Presentación física vinculada.");
}

export async function setDefaultPolicyAction(formData: FormData) {
  const productId = text(formData.get("product_id"));
  const policyId = text(formData.get("policy_id"));
  if (!productId || !policyId) redirect("/inventory/catalog");
  const { supabase } = await editor(productId);
  try {
    await makeDefault(supabase, productId, policyId);
  } catch (error) {
    go(productId, "error", error instanceof Error ? error.message : "No se pudo cambiar la predeterminada.");
  }
  revalidatePath(pathFor(productId));
  go(productId, "ok", "Política predeterminada actualizada.");
}

export async function togglePolicyActiveAction(formData: FormData) {
  const productId = text(formData.get("product_id"));
  const policyId = text(formData.get("policy_id"));
  const nextActive = text(formData.get("next_active")) === "true";
  if (!productId || !policyId) redirect("/inventory/catalog");
  const { supabase } = await editor(productId);

  const { data: policy, error: readError } = await supabase
    .from("product_request_policies")
    .select("is_default,policy_kind")
    .eq("id", policyId)
    .eq("product_id", productId)
    .maybeSingle();
  if (readError) go(productId, "error", readError.message);
  if (!policy) go(productId, "error", "La política no existe.");
  if (!nextActive && policy.policy_kind === "base_unit") go(productId, "error", "La unidad base no se puede desactivar.");
  if (!nextActive && policy.is_default) go(productId, "error", "Selecciona otra predeterminada antes de desactivarla.");

  const { error } = await supabase
    .from("product_request_policies")
    .update({ is_active: nextActive })
    .eq("id", policyId)
    .eq("product_id", productId);
  if (error) go(productId, "error", error.message);

  revalidatePath(pathFor(productId));
  go(productId, "ok", nextActive ? "Política activada." : "Política desactivada.");
}
