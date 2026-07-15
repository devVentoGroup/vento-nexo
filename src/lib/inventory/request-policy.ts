export type ProductRequestPolicyOption = {
  id: string;
  productId: string;
  label: string;
  requestUnitCode: string;
  baseUnitCode: string;
  baseQtyPerRequestUnit: number;
  constraintMode: string;
  minimumRequestQty: number | null;
  requestStepQty: number;
  allowFraction: boolean;
  policyKind: string;
  physicalUomProfileId: string | null;
};

export type ProductRequestPolicyRow = {
  id: string | null;
  product_id: string | null;
  label: string | null;
  request_unit_code: string | null;
  base_unit_code: string | null;
  base_qty_per_request_unit: number | string | null;
  constraint_mode: string | null;
  minimum_request_qty: number | string | null;
  request_step_qty: number | string | null;
  allow_fraction: boolean | null;
  policy_kind: string | null;
  physical_uom_profile_id: string | null;
  is_active?: boolean | null;
};

function asPositiveNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function mapProductRequestPolicyRow(
  row: ProductRequestPolicyRow,
): ProductRequestPolicyOption | null {
  const id = String(row.id ?? "").trim();
  const productId = String(row.product_id ?? "").trim();
  const requestUnitCode = String(row.request_unit_code ?? "").trim().toLowerCase();
  const baseUnitCode = String(row.base_unit_code ?? "").trim().toLowerCase();
  if (!id || !productId || !requestUnitCode || !baseUnitCode) return null;
  if (row.is_active === false) return null;

  return {
    id,
    productId,
    label: String(row.label ?? "").trim(),
    requestUnitCode,
    baseUnitCode,
    baseQtyPerRequestUnit: asPositiveNumber(row.base_qty_per_request_unit, 1),
    constraintMode: String(row.constraint_mode ?? "").trim().toLowerCase(),
    minimumRequestQty:
      row.minimum_request_qty === null || row.minimum_request_qty === undefined
        ? null
        : asPositiveNumber(row.minimum_request_qty, 0),
    requestStepQty: asPositiveNumber(row.request_step_qty, 1),
    allowFraction: Boolean(row.allow_fraction),
    policyKind: String(row.policy_kind ?? "base_unit").trim().toLowerCase(),
    physicalUomProfileId: String(row.physical_uom_profile_id ?? "").trim() || null,
  };
}

export function getRequestPolicyDisplayLabel(
  policy: ProductRequestPolicyOption | null | undefined,
): string {
  return String(policy?.label ?? "").trim() || policy?.requestUnitCode || "un";
}

export function getRequestPolicyInputUnitCode(
  policy: ProductRequestPolicyOption,
): string {
  // input_qty stores the quantity the user actually entered. Its unit must
  // therefore always be the request unit (paquete, caja, kg, etc.), while
  // quantity/stock_unit_code remain canonical base inventory quantities.
  return policy.requestUnitCode;
}

export function getRequestPolicyHtmlMin(
  policy: ProductRequestPolicyOption | null | undefined,
): number {
  if (!policy) return 0;
  if (policy.minimumRequestQty && policy.minimumRequestQty > 0) {
    return policy.minimumRequestQty;
  }
  return policy.allowFraction ? 0 : 1;
}

export function getRequestPolicyHtmlStep(
  policy: ProductRequestPolicyOption | null | undefined,
): number | "any" {
  if (!policy) return "any";
  if (policy.requestStepQty > 0) return policy.requestStepQty;
  return policy.allowFraction ? "any" : 1;
}

export function validateRequestedPolicyQuantity(
  policy: ProductRequestPolicyOption,
  quantity: number,
): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("La cantidad solicitada debe ser mayor a cero.");
  }
  if (!policy.allowFraction && Math.abs(quantity - Math.round(quantity)) > 0.000001) {
    throw new Error("La unidad " + getRequestPolicyDisplayLabel(policy) + " no permite fracciones.");
  }
  if (policy.minimumRequestQty && quantity < policy.minimumRequestQty) {
    throw new Error(
      "La cantidad mínima para " + getRequestPolicyDisplayLabel(policy) + " es " + policy.minimumRequestQty + ".",
    );
  }
  if (policy.constraintMode === "strict_multiple" && policy.requestStepQty > 0) {
    const ratio = quantity / policy.requestStepQty;
    if (Math.abs(ratio - Math.round(ratio)) > 0.000001) {
      throw new Error(
        "La cantidad de " + getRequestPolicyDisplayLabel(policy) + " debe avanzar de " + policy.requestStepQty + " en " + policy.requestStepQty + ".",
      );
    }
  }
}
