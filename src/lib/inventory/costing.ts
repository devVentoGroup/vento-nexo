import {
  computeCostPerStockUnit,
  normalizeUnitCode,
  type UnitMap,
  roundQuantity,
} from "@/lib/inventory/uom";

export type AutoCostPrimarySupplierInput = {
  is_primary?: boolean | null;
  purchase_pack_qty?: number | null;
  purchase_pack_unit_code?: string | null;
  purchase_price?: number | null;
  purchase_price_net?: number | null;
  purchase_price_includes_tax?: boolean | null;
  purchase_tax_rate?: number | null;
};

export type AutoCostReadinessInput = {
  costingMode?: "auto_primary_supplier" | "manual" | null;
  stockUnitCode?: string | null;
  primarySupplier?: AutoCostPrimarySupplierInput | null;
  unitMap?: UnitMap | null;
};

export function computeWeightedAverageCost(params: {
  currentQty: number;
  currentUnitCost: number;
  receivedQty: number;
  receivedUnitCost: number;
}): number {
  const { currentQty, currentUnitCost, receivedQty, receivedUnitCost } = params;
  const safeCurrentQty = Number.isFinite(currentQty) ? Math.max(0, currentQty) : 0;
  const safeCurrentCost = Number.isFinite(currentUnitCost)
    ? Math.max(0, currentUnitCost)
    : 0;
  const safeReceivedQty = Number.isFinite(receivedQty) ? Math.max(0, receivedQty) : 0;
  const safeReceivedCost = Number.isFinite(receivedUnitCost)
    ? Math.max(0, receivedUnitCost)
    : 0;

  if (safeReceivedQty <= 0) return roundQuantity(safeCurrentCost, 6);

  const denominator = safeCurrentQty + safeReceivedQty;
  if (denominator <= 0) return roundQuantity(safeReceivedCost, 6);

  const next =
    (safeCurrentCost * safeCurrentQty + safeReceivedCost * safeReceivedQty) / denominator;
  return roundQuantity(next, 6);
}

export function computeAutoCostFromPrimarySupplier(params: {
  packPrice: number;
  packQty: number;
  packUnitCode: string;
  stockUnitCode: string;
  unitMap: UnitMap;
}): number {
  return computeCostPerStockUnit({
    packPrice: params.packPrice,
    packQty: params.packQty,
    packUnitCode: params.packUnitCode,
    stockUnitCode: params.stockUnitCode,
    unitMap: params.unitMap,
  });
}

export function resolveNetSupplierPackPrice(params: {
  purchasePrice?: number | null;
  purchasePriceNet?: number | null;
  purchasePriceIncludesTax?: boolean | null;
  purchaseTaxRate?: number | null;
}): number | null {
  const explicitNet = Number(params.purchasePriceNet ?? 0);
  if (Number.isFinite(explicitNet) && explicitNet > 0) {
    return roundQuantity(explicitNet, 6);
  }

  const gross = Number(params.purchasePrice ?? 0);
  if (!Number.isFinite(gross) || gross <= 0) return null;

  const includesTax = Boolean(params.purchasePriceIncludesTax);
  if (!includesTax) return roundQuantity(gross, 6);

  const taxRate = Number(params.purchaseTaxRate ?? 0);
  const safeTaxRate = Number.isFinite(taxRate) && taxRate > 0 ? taxRate : 0;
  const divisor = 1 + safeTaxRate / 100;
  if (!Number.isFinite(divisor) || divisor <= 0) return roundQuantity(gross, 6);
  return roundQuantity(gross / divisor, 6);
}

export function computeStockUnitCostFromInput(params: {
  inputUnitCost: number;
  conversionFactorToStock: number;
}): number {
  const inputUnitCost = Number(params.inputUnitCost);
  const factor = Number(params.conversionFactorToStock);
  if (!Number.isFinite(inputUnitCost) || inputUnitCost < 0) return 0;
  if (!Number.isFinite(factor) || factor <= 0) return 0;
  return roundQuantity(inputUnitCost / factor, 6);
}

export function getAutoCostReadinessReason(params: AutoCostReadinessInput): string | null {
  const costingMode = params.costingMode ?? "auto_primary_supplier";
  if (costingMode !== "auto_primary_supplier") return null;

  const supplier = params.primarySupplier ?? null;
  if (!supplier || supplier.is_primary === false) {
    return "Falta proveedor primario.";
  }

  const packQty = Number(supplier.purchase_pack_qty ?? 0);
  if (!Number.isFinite(packQty) || packQty <= 0) {
    return "Falta cantidad por empaque del proveedor primario.";
  }

  const packUnitCode = normalizeUnitCode(supplier.purchase_pack_unit_code);
  if (!packUnitCode) {
    return "Falta unidad de compra del proveedor primario.";
  }

  const packPrice =
    resolveNetSupplierPackPrice({
      purchasePrice: supplier.purchase_price,
      purchasePriceNet: supplier.purchase_price_net,
      purchasePriceIncludesTax: supplier.purchase_price_includes_tax,
      purchaseTaxRate: supplier.purchase_tax_rate,
    }) ?? 0;
  if (!Number.isFinite(packPrice) || packPrice <= 0) {
    return "Falta precio de compra del proveedor primario.";
  }

  const stockUnitCode = normalizeUnitCode(params.stockUnitCode);
  if (!stockUnitCode) {
    return "Falta unidad base de stock del producto.";
  }

  if (params.unitMap) {
    try {
      computeAutoCostFromPrimarySupplier({
        packPrice,
        packQty,
        packUnitCode,
        stockUnitCode,
        unitMap: params.unitMap,
      });
    } catch {
      return "Unidad de compra incompatible con la unidad base.";
    }
  }

  return null;
}

export function isAutoCostReady(params: AutoCostReadinessInput): boolean {
  return getAutoCostReadinessReason(params) === null;
}
