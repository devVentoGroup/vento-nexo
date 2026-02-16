import {
  computeCostPerStockUnit,
  type UnitMap,
  roundQuantity,
} from "@/lib/inventory/uom";

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
