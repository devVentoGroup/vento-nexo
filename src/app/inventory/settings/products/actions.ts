"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type IdentityChange = { productId: string; name: string; sku: string | null; categoryId: string; isActive: boolean };

export async function applyMasterIdentityDraft(changes: IdentityChange[]) {
  if (!changes.length) return { ok: false, message: "No hay cambios para aplicar." };

  const supabase = await createClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !sessionData.user) return { ok: false, message: "Tu sesión no permite aplicar cambios." };

  const { data, error } = await supabase.rpc("apply_master_product_identity_batch", {
    p_changes: changes.map((change) => ({
      product_id: change.productId,
      name: change.name.trim(),
      sku: change.sku?.trim() || null,
      category_id: change.categoryId,
      is_active: change.isActive,
    })),
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/inventory/settings/products");
  revalidatePath("/inventory/catalog");
  return { ok: true, message: `Se aplicaron ${changes.length} cambio(s) de identidad.`, batchId: data };
}

export async function deactivateMasterRequestPolicies(policyIds: string[]) {
  if (!policyIds.length) return { ok: false, message: "Selecciona políticas activas para desactivar." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("deactivate_master_request_policy_batch", { p_policy_ids: policyIds });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/inventory/settings/products");
  revalidatePath("/inventory/settings/request-policies");
  revalidatePath("/inventory/remissions");
  return { ok: true, message: `Se desactivaron ${policyIds.length} política(s) para solicitudes futuras.`, batchId: data };
}

export async function applyMasterRequestPolicyRules(changes: Array<{ policyId: string; minimumRequestQty: number; requestStepQty: number }>) {
  if (!changes.length) return { ok: false, message: "No hay reglas modificadas para aplicar." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_master_request_policy_rules_batch", { p_changes: changes.map((change) => ({ policy_id: change.policyId, minimum_request_qty: change.minimumRequestQty, request_step_qty: change.requestStepQty })) });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/inventory/settings/products"); revalidatePath("/inventory/settings/request-policies"); revalidatePath("/inventory/remissions");
  return { ok: true, message: `Se aplicaron ${changes.length} regla(s) de solicitud.`, batchId: data };
}

export async function applyMasterRequestPolicyUnits(changes: Array<{ policyId: string; requestUnitCode: string; baseQtyPerRequestUnit: number }>) {
  if (!changes.length) return { ok: false, message: "No hay unidad ni equivalencia modificada." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_master_request_policy_units_batch", { p_changes: changes.map((change) => ({ policy_id: change.policyId, request_unit_code: change.requestUnitCode, base_qty_per_request_unit: change.baseQtyPerRequestUnit })) });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/inventory/settings/products"); revalidatePath("/inventory/settings/request-policies"); revalidatePath("/inventory/remissions");
  return { ok: true, message: `Se aplicaron ${changes.length} unidad(es) de solicitud.`, batchId: data };
}

export async function applyMasterRequestPolicies(changes: Array<{ policyId: string; requestUnitCode: string; baseQtyPerRequestUnit: number; minimumRequestQty: number; requestStepQty: number }>) {
  if (!changes.length) return { ok: false, message: "No hay cambios de solicitudes para aplicar." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_master_request_policy_batch", { p_changes: changes.map((change) => ({ policy_id: change.policyId, request_unit_code: change.requestUnitCode, base_qty_per_request_unit: change.baseQtyPerRequestUnit, minimum_request_qty: change.minimumRequestQty, request_step_qty: change.requestStepQty })) });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/inventory/settings/products"); revalidatePath("/inventory/settings/request-policies"); revalidatePath("/inventory/remissions");
  return { ok: true, message: `Se aplicaron ${changes.length} configuración(es) de solicitud.`, batchId: data };
}

export async function applyMasterSupplierPurchases(changes: Array<{ productSupplierId: string; purchasePrice: number; purchasePackQty: number; purchasePackUnitCode: string; isPrimary: boolean }>) {
  if (!changes.length) return { ok: false, message: "No hay cambios de compra para aplicar." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_master_supplier_purchase_batch", { p_changes: changes.map((change) => ({ product_supplier_id: change.productSupplierId, purchase_price: change.purchasePrice, purchase_pack_qty: change.purchasePackQty, purchase_pack_unit_code: change.purchasePackUnitCode, is_primary: change.isPrimary })) });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/inventory/settings/products"); revalidatePath("/inventory/catalog");
  return { ok: true, message: `Se aplicaron ${changes.length} configuración(es) de compra futura.`, batchId: data };
}

export async function applyMasterPresentationVersions(changes: Array<{ profileId: string; label: string; inputUnitCode: string; qtyInStockUnit: number }>) {
  if (!changes.length) return { ok: false, message: "No hay presentaciones modificadas." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_master_presentation_version_batch", { p_changes: changes.map((change) => ({ profile_id: change.profileId, label: change.label, input_unit_code: change.inputUnitCode, qty_in_stock_unit: change.qtyInStockUnit })) });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/inventory/settings/products"); revalidatePath("/inventory/catalog");
  return { ok: true, message: `Se versionaron ${changes.length} presentación(es) para operación futura.`, batchId: data };
}

export async function applyMasterProductSites(changes: Array<{ productId: string; siteId: string; isActive: boolean; inventoryEnabled: boolean; remissionEnabled: boolean; salesEnabled: boolean; minStockQty: number }>) {
  if (!changes.length) return { ok: false, message: "No hay configuraciones por sede para aplicar." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_master_product_site_batch", { p_changes: changes.map((change) => ({ product_id: change.productId, site_id: change.siteId, is_active: change.isActive, inventory_enabled: change.inventoryEnabled, remission_enabled: change.remissionEnabled, sales_enabled: change.salesEnabled, min_stock_qty: change.minStockQty })) });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/inventory/settings/products"); revalidatePath("/inventory/catalog");
  return { ok: true, message: `Se aplicaron ${changes.length} configuración(es) por sede.`, batchId: data };
}

export async function applyMasterInventoryProfiles(changes: Array<{ productId: string; trackInventory: boolean; inventoryKind: string; lotTracking: boolean; expiryTracking: boolean; measurementMode: string; defaultTolerancePercent: number }>) {
  if (!changes.length) return { ok: false, message: "No hay perfiles de inventario para aplicar." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_master_inventory_profile_batch", { p_changes: changes.map((change) => ({ product_id: change.productId, track_inventory: change.trackInventory, inventory_kind: change.inventoryKind, lot_tracking: change.lotTracking, expiry_tracking: change.expiryTracking, measurement_mode: change.measurementMode, default_tolerance_percent: change.defaultTolerancePercent })) });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/inventory/settings/products"); revalidatePath("/inventory/catalog");
  return { ok: true, message: `Se aplicaron ${changes.length} perfil(es) de inventario.`, batchId: data };
}

export async function applyMasterProductionRoutes(changes: Array<{ productId: string; siteId: string; areaKind: string; inputLocationId: string; outputLocationId: string }>) {
  if (!changes.length) return { ok: false, message: "No hay rutas de producción para aplicar." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_master_production_route_batch", { p_changes: changes.map((change) => ({ product_id: change.productId, site_id: change.siteId, area_kind: change.areaKind, input_location_id: change.inputLocationId, output_location_id: change.outputLocationId })) });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/inventory/settings/products"); revalidatePath("/inventory/catalog");
  return { ok: true, message: `Se aplicaron ${changes.length} ruta(s) de producción.`, batchId: data };
}
