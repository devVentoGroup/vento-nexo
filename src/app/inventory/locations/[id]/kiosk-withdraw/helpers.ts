import { normalizeUnitCode, type ProductUomProfile } from "@/lib/inventory/uom";
export type Params = { id: string };
export type SearchParams = {
  error?: string;
  error_field?: string;
  error_product_id?: string;
  employee_id?: string;
  input_unit_code?: string;
  input_uom_profile_id?: string;
  kiosk?: string;
  notes?: string;
  ok?: string;
  product_id?: string;
  quantity?: string;
};

export type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_inventory_profiles?:
  | { measurement_mode?: string | null }
  | Array<{ measurement_mode?: string | null }>
  | null;
};

export type StockRow = {
  product_id: string;
  current_qty: number | null;
  products: ProductRow | ProductRow[] | null;
};

export type LocationRow = {
  id: string;
  code: string | null;
  description: string | null;
  zone: string | null;
  site_id: string | null;
};

export type ParsedKioskWithdrawItem = {
  product_id: string;
  quantity: number;
  input_qty: number;
  input_unit_code: string;
  input_uom_profile_id: string;
  conversion_factor_to_stock: number;
  stock_unit_code: string;
  note: string | null;
};

export type PresentationStockPart = {
  uomProfileId: string;
  label: string;
  qty: number;
  baseQty: number;
  imageUrl?: string;
};

export type PresentationStockRow = {
  product_id: string;
  uom_profile_id: string;
  location_position_id: string | null;
  presentation_qty: number | null;
  base_qty: number | null;
  product_uom_profiles:
  | (ProductUomProfile & { image_url?: string | null; catalog_image_url?: string | null })
  | Array<ProductUomProfile & { image_url?: string | null; catalog_image_url?: string | null }>
  | null;
};

export type PresentationStockLedgerRow = {
  product_id: string;
  uom_profile_id: string;
  location_position_id: string | null;
  presentation_qty: number | null;
  base_qty: number | null;
};

export function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeProduct(value: StockRow["products"]): ProductRow | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function productMeasurementMode(product: ProductRow | null | undefined) {
  const relation = product?.product_inventory_profiles;
  const profile = Array.isArray(relation) ? relation[0] : relation;
  const normalized = String(profile?.measurement_mode ?? "").trim().toLowerCase();

  if (normalized === "variable_weight") return "variable_weight";
  if (normalized === "count_with_weight") return "count_with_weight";
  if (normalized === "bulk_volume") return "bulk_volume";
  return "fixed_presentation";
}

export function normalizeUomProfileRelation(value: PresentationStockRow["product_uom_profiles"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export const PRESENTATION_EPSILON = 0.000001;

export function profileBaseFactor(profile: ProductUomProfile | null | undefined) {
  const inputQty = Number(profile?.qty_in_input_unit ?? 0);
  const stockQty = Number(profile?.qty_in_stock_unit ?? 0);

  if (!Number.isFinite(inputQty) || !Number.isFinite(stockQty) || inputQty <= 0 || stockQty <= 0) {
    return 0;
  }

  return stockQty / inputQty;
}

export function isWholeCompatibleMultiple(largerFactor: number, smallerFactor: number) {
  if (largerFactor <= smallerFactor || smallerFactor <= 0) return false;

  const units = largerFactor / smallerFactor;
  return Math.abs(units - Math.round(units)) < PRESENTATION_EPSILON;
}

export function selectPresentationRowsForDisplay(rows: PresentationStockRow[], availableBaseQty: number) {
  const validRows = rows.filter((row) => {
    const qty = Number(row.presentation_qty ?? 0);
    const baseQty = Number(row.base_qty ?? 0);
    return qty > 0 && baseQty > 0;
  });

  const totalPhysicalBaseQty = validRows.reduce((sum, row) => sum + Number(row.base_qty ?? 0), 0);
  const hasPositionRows = validRows.some((row) => Boolean(row.location_position_id));

  if (hasPositionRows && totalPhysicalBaseQty > availableBaseQty + PRESENTATION_EPSILON) {
    return validRows.filter((row) => Boolean(row.location_position_id));
  }

  return validRows;
}

export function selectPresentationLedgerRowsForOperation(rows: PresentationStockLedgerRow[], availableBaseQty: number) {
  const validRows = rows.filter((row) => {
    const qty = Number(row.presentation_qty ?? 0);
    const baseQty = Number(row.base_qty ?? 0);
    return qty > 0 && baseQty > 0;
  });

  const totalPhysicalBaseQty = validRows.reduce((sum, row) => sum + Number(row.base_qty ?? 0), 0);
  const hasPositionRows = validRows.some((row) => Boolean(row.location_position_id));

  if (hasPositionRows && totalPhysicalBaseQty > availableBaseQty + PRESENTATION_EPSILON) {
    return validRows.filter((row) => Boolean(row.location_position_id));
  }

  return validRows;
}

export function locLabel(loc: Pick<LocationRow, "id" | "code" | "description" | "zone"> | null | undefined) {
  if (!loc) return "LOC";
  return String(loc.description ?? "").trim() || String(loc.zone ?? "").trim() || String(loc.code ?? "").trim() || loc.id;
}

export function errorUrl(
  sourceLocationId: string,
  message: string,
  productId?: string | null,
  values?: {
    employeeId?: string;
    field?: "worker" | "product";
    inputUnitCode?: string;
    inputUomProfileId?: string;
    notes?: string;
    quantity?: string;
  }
) {
  const params = new URLSearchParams({ error: message, kiosk: "1" });
  const normalizedProductId = String(productId ?? "").trim();
  if (normalizedProductId) {
    params.set("product_id", normalizedProductId);
    params.set("error_product_id", normalizedProductId);
  }
  const employeeId = String(values?.employeeId ?? "").trim();
  const field = values?.field === "worker" ? "worker" : values?.field === "product" ? "product" : "";
  const quantity = String(values?.quantity ?? "").trim();
  const inputUnitCode = normalizeUnitCode(String(values?.inputUnitCode ?? "").trim());
  const inputUomProfileId = String(values?.inputUomProfileId ?? "").trim();
  const notes = String(values?.notes ?? "").trim();
  if (employeeId) params.set("employee_id", employeeId);
  if (field) params.set("error_field", field);
  if (quantity) params.set("quantity", quantity);
  if (inputUnitCode) params.set("input_unit_code", inputUnitCode);
  if (inputUomProfileId) params.set("input_uom_profile_id", inputUomProfileId);
  if (notes) params.set("notes", notes);
  return `/inventory/locations/${encodeURIComponent(sourceLocationId)}/kiosk-withdraw?${params.toString()}`;
}
