"use server";

import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const APP_ID = "nexo";
const PATH = "/inventory/settings/request-policies";

type MeasurementMode = "fixed_presentation" | "variable_weight" | "count_with_weight" | "bulk_volume";

export type SaveMeasurementConfigurationInput = {
  productId: string;
  measurementMode: MeasurementMode;
  tolerancePercent: number;
  auxCountUnitCode: string;
  requiresActualProductionQty: boolean;
  requiresActualDispatchQty: boolean;
  requiresActualReceiptQty: boolean;
  requiresCountAlongsideWeight: boolean;
};

export type SaveMeasurementConfigurationResult = { ok: boolean; message: string };

function text(value: unknown) { return String(value ?? "").trim(); }

export async function saveMeasurementConfiguration(
  input: SaveMeasurementConfigurationInput,
): Promise<SaveMeasurementConfigurationResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
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
  const validModes: MeasurementMode[] = ["fixed_presentation", "variable_weight", "count_with_weight", "bulk_volume"];
  if (!productId || !validModes.includes(input.measurementMode)) {
    return { ok: false, message: "Configuración de medición inválida." };
  }

  const tolerance = Number(input.tolerancePercent);
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return { ok: false, message: "La tolerancia no puede ser negativa." };
  }

  const isCountWithWeight = input.measurementMode === "count_with_weight";
  const auxCountUnitCode = text(input.auxCountUnitCode).toLowerCase();
  if (isCountWithWeight && !auxCountUnitCode) {
    return { ok: false, message: "Define la unidad auxiliar, por ejemplo bolsas o piezas." };
  }

  const { data: existing, error: readError } = await supabase
    .from("product_inventory_profiles")
    .select("product_id")
    .eq("product_id", productId)
    .maybeSingle();
  if (readError) return { ok: false, message: readError.message };

  const payload = {
    measurement_mode: input.measurementMode,
    default_tolerance_percent: tolerance,
    aux_count_unit_code: isCountWithWeight ? auxCountUnitCode : null,
    requires_actual_production_qty: Boolean(input.requiresActualProductionQty),
    requires_actual_dispatch_qty: Boolean(input.requiresActualDispatchQty),
    requires_actual_receipt_qty: Boolean(input.requiresActualReceiptQty),
    requires_count_alongside_weight: isCountWithWeight || Boolean(input.requiresCountAlongsideWeight),
    updated_at: new Date().toISOString(),
  };

  const result = existing
    ? await supabase.from("product_inventory_profiles").update(payload).eq("product_id", productId)
    : await supabase.from("product_inventory_profiles").insert({ product_id: productId, ...payload });
  if (result.error) return { ok: false, message: result.error.message };

  revalidatePath(PATH);
  revalidatePath("/inventory/remissions");
  return { ok: true, message: "Medición guardada." };
}
