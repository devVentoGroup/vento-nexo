import { requireAppAccess } from "@/lib/auth/guard";
import { roundQuantity } from "@/lib/inventory/uom";
import type { LocRow, RestockItemRow } from "./detail-utils";
import {
  buildLocDisplayLabel,
  formatUnitLabel,
} from "./detail-utils";

const APP_ID = "nexo";
export type TraceEmployeeRow = {
  id: string;
  full_name: string | null;
  alias: string | null;
};

export type MeasurementMode =
  | "fixed_presentation"
  | "variable_weight"
  | "count_with_weight"
  | "bulk_volume";

export type ProductInventoryProfileRow = {
  product_id: string | null;
  measurement_mode: string | null;
  default_tolerance_percent?: number | null;
  aux_count_unit_code?: string | null;
  requires_actual_receipt_qty?: boolean | null;
  requires_actual_dispatch_qty?: boolean | null;
  requires_count_alongside_weight?: boolean | null;
};

export type ProductionPackagePlanItem = {
  packageId: string;
  dispatchQty: number;
  unitCode: string;
  remainingQty: number;
  label: string;
  batchId: string | null;
  fractional: boolean;
  locationId: string | null;
  locationLabel: string | null;
  currentRemainingQty: number;
  status: string | null;
};

export type ProductionBatchPackageLookupRow = {
  id: string;
  batch_id: string | null;
  location_id: string | null;
  package_index: number | null;
  package_label: string | null;
  remaining_qty: number | null;
  unit_code: string | null;
  status: string | null;
};

export function displayTraceEmployee(employee?: TraceEmployeeRow | null): string {
  if (!employee) return "-";
  return String(employee.alias ?? employee.full_name ?? employee.id).trim() || employee.id;
}

export function normalizeMeasurementMode(value: unknown): MeasurementMode {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "variable_weight" ||
    raw === "count_with_weight" ||
    raw === "bulk_volume"
  ) {
    return raw;
  }
  return "fixed_presentation";
}

export function getItemMeasurementMode(item: RestockItemRow): MeasurementMode {
  const extendedItem = item as RestockItemRow & {
    measurement_mode?: unknown;
    product?: (RestockItemRow["product"] & { measurement_mode?: unknown }) | null;
  };
  return normalizeMeasurementMode(
    extendedItem.measurement_mode ?? extendedItem.product?.measurement_mode
  );
}

export function usesActualQuantityMode(item: RestockItemRow): boolean {
  return getItemMeasurementMode(item) !== "fixed_presentation";
}

export function parseProductionPackagePlan(value: unknown): ProductionPackagePlanItem[] {
  if (!value) return [];

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];

    const planItems: ProductionPackagePlanItem[] = [];

    for (const entry of parsed) {
      const packageId = String(entry?.packageId ?? "").trim();
      const dispatchQty = roundQuantity(Number(entry?.dispatchQty ?? 0));
      const unitCode = String(entry?.unitCode ?? "").trim();
      const remainingQty = roundQuantity(Number(entry?.remainingQty ?? 0));
      const label = String(entry?.label ?? "").trim();
      const batchId = String(entry?.batchId ?? "").trim() || null;
      const fractional = Boolean(entry?.fractional);
      const locationId = String(entry?.locationId ?? "").trim() || null;
      const locationLabel = String(entry?.locationLabel ?? "").trim() || null;
      const currentRemainingQty = Number(entry?.currentRemainingQty ?? remainingQty);
      const status = String(entry?.status ?? "").trim() || null;

      if (!packageId || dispatchQty <= 0) continue;

      planItems.push({
        packageId,
        dispatchQty,
        unitCode,
        remainingQty,
        label,
        batchId,
        fractional,
        locationId,
        locationLabel,
        currentRemainingQty: Number.isFinite(currentRemainingQty)
          ? roundQuantity(currentRemainingQty)
          : remainingQty,
        status,
      });
    }

    return planItems;
  } catch {
    return [];
  }
}

export function productionPackageLabel(
  packageRow: ProductionBatchPackageLookupRow | undefined,
  fallback: ProductionPackagePlanItem
): string {
  const label = String(packageRow?.package_label ?? fallback.label ?? "").trim();
  if (label) return label;

  const packageIndex = packageRow?.package_index;
  if (typeof packageIndex === "number") return `Empaque ${packageIndex}`;

  return fallback.packageId.slice(0, 8);
}

export function buildProductionPackagePlanForItem({
  item,
  productionPackageById,
  originLocById,
}: {
  item: RestockItemRow;
  productionPackageById: Map<string, ProductionBatchPackageLookupRow>;
  originLocById: Map<string, LocRow>;
}): ProductionPackagePlanItem[] {
  const rawPackagePlan = parseProductionPackagePlan(
    (item as RestockItemRow & { production_package_plan?: unknown }).production_package_plan
  );

  return rawPackagePlan.map((entry): ProductionPackagePlanItem => {
    const packageRow = productionPackageById.get(entry.packageId);
    const locationId: string | null = entry.locationId || packageRow?.location_id || null;
    const locRow = locationId ? originLocById.get(locationId) : undefined;
    const locationLabel: string | null =
      entry.locationLabel || (locRow ? buildLocDisplayLabel(locRow) : null);
    const currentRemainingQty = Number(
      packageRow?.remaining_qty ?? entry.currentRemainingQty ?? entry.remainingQty ?? 0
    );
    const unitCode =
      entry.unitCode ||
      packageRow?.unit_code ||
      formatUnitLabel(item.stock_unit_code ?? item.unit ?? item.product?.stock_unit_code);

    return {
      ...entry,
      batchId: entry.batchId || packageRow?.batch_id || null,
      locationId,
      locationLabel,
      currentRemainingQty: Number.isFinite(currentRemainingQty)
        ? roundQuantity(currentRemainingQty)
        : entry.remainingQty,
      status: packageRow?.status ?? entry.status ?? null,
      unitCode,
      label: productionPackageLabel(packageRow, entry),
    };
  });
}

export async function readBooleanAppSetting(
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"],
  settingKey: string,
  fallback: boolean
): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_runtime_settings")
    .select("bool_value")
    .eq("app_id", APP_ID)
    .eq("setting_key", settingKey)
    .maybeSingle();

  if (error) return fallback;
  return typeof data?.bool_value === "boolean" ? data.bool_value : fallback;
}
