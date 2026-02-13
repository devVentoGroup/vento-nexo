export type UnitFamily = "volume" | "mass" | "count";

export type InventoryUnit = {
  code: string;
  name: string;
  family: UnitFamily;
  factor_to_base: number;
  symbol: string | null;
  display_decimals: number | null;
  is_active: boolean;
};

export type UnitMap = Map<string, InventoryUnit>;

export function normalizeUnitCode(code: string | null | undefined): string {
  return String(code ?? "")
    .trim()
    .toLowerCase();
}

export function createUnitMap(units: InventoryUnit[]): UnitMap {
  return new Map(units.map((unit) => [normalizeUnitCode(unit.code), unit]));
}

export function roundQuantity(value: number, decimals = 6): number {
  if (!Number.isFinite(value)) return 0;
  const base = 10 ** decimals;
  return Math.round(value * base) / base;
}

export function convertQuantity(params: {
  quantity: number;
  fromUnitCode: string;
  toUnitCode: string;
  unitMap: UnitMap;
}): { quantity: number; factorToTarget: number } {
  const { quantity, fromUnitCode, toUnitCode, unitMap } = params;
  const from = unitMap.get(normalizeUnitCode(fromUnitCode));
  const to = unitMap.get(normalizeUnitCode(toUnitCode));

  if (!from) {
    throw new Error(`Unidad origen no valida: ${fromUnitCode}`);
  }
  if (!to) {
    throw new Error(`Unidad destino no valida: ${toUnitCode}`);
  }
  if (from.family !== to.family) {
    throw new Error(
      `Conversion invalida entre familias distintas (${from.family} -> ${to.family}).`
    );
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Cantidad invalida para convertir.");
  }

  const factorToTarget = from.factor_to_base / to.factor_to_base;
  const converted = roundQuantity(quantity * factorToTarget);
  return { quantity: converted, factorToTarget: roundQuantity(factorToTarget) };
}

export function computePackToStock(params: {
  packQty: number;
  packUnitCode: string;
  stockUnitCode: string;
  unitMap: UnitMap;
}): { stockQty: number; factorToStock: number } {
  const { packQty, packUnitCode, stockUnitCode, unitMap } = params;
  const converted = convertQuantity({
    quantity: packQty,
    fromUnitCode: packUnitCode,
    toUnitCode: stockUnitCode,
    unitMap,
  });
  return {
    stockQty: converted.quantity,
    factorToStock: converted.factorToTarget,
  };
}

export function computeCostPerStockUnit(params: {
  packPrice: number;
  packQty: number;
  packUnitCode: string;
  stockUnitCode: string;
  unitMap: UnitMap;
}): number {
  const { packPrice, packQty, packUnitCode, stockUnitCode, unitMap } = params;
  if (!Number.isFinite(packPrice) || packPrice < 0) {
    throw new Error("Precio de compra invalido.");
  }
  const { stockQty } = computePackToStock({
    packQty,
    packUnitCode,
    stockUnitCode,
    unitMap,
  });
  if (!Number.isFinite(stockQty) || stockQty <= 0) {
    throw new Error("No se puede calcular costo por unidad de almacenamiento.");
  }
  return roundQuantity(packPrice / stockQty, 6);
}

export function inferFamilyFromUnitCode(
  unitCode: string,
  unitMap: UnitMap
): UnitFamily | null {
  return unitMap.get(normalizeUnitCode(unitCode))?.family ?? null;
}
