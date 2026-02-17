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

export type ProductUomProfile = {
  id: string;
  product_id: string;
  label: string;
  input_unit_code: string;
  qty_in_input_unit: number;
  qty_in_stock_unit: number;
  is_default: boolean;
  is_active: boolean;
  source: "manual" | "supplier_primary";
  usage_context?: "general" | "purchase" | "remission" | null;
};

export type ProductUomUsageContext = "general" | "purchase" | "remission";

export function normalizeProductUomUsageContext(
  value: string | null | undefined
): ProductUomUsageContext {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "purchase") return "purchase";
  if (normalized === "remission") return "remission";
  return "general";
}

export function selectProductUomProfileForContext(params: {
  profiles: ProductUomProfile[];
  productId: string;
  context: ProductUomUsageContext;
}): ProductUomProfile | null {
  const productId = String(params.productId).trim();
  if (!productId) return null;

  const candidates = params.profiles.filter(
    (profile) =>
      profile.is_active &&
      profile.is_default &&
      String(profile.product_id).trim() === productId
  );
  if (!candidates.length) return null;

  const byContext = candidates.find(
    (profile) =>
      normalizeProductUomUsageContext(profile.usage_context) === params.context
  );
  if (byContext) return byContext;

  const general = candidates.find(
    (profile) => normalizeProductUomUsageContext(profile.usage_context) === "general"
  );
  return general ?? candidates[0] ?? null;
}

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

export function convertByProductProfile(params: {
  quantityInInput: number;
  inputUnitCode: string;
  stockUnitCode: string;
  profile?: ProductUomProfile | null;
}): { quantityInStock: number; factorToStock: number } {
  const quantityInInput = Number(params.quantityInInput);
  const inputUnitCode = normalizeUnitCode(params.inputUnitCode);
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode);
  const profile = params.profile ?? null;

  if (!Number.isFinite(quantityInInput) || quantityInInput < 0) {
    throw new Error("Cantidad invalida para conversion.");
  }

  if (!inputUnitCode || !stockUnitCode) {
    throw new Error("Unidad de captura o unidad base invalida.");
  }

  if (!profile) {
    if (inputUnitCode !== stockUnitCode) {
      throw new Error("No existe conversion operativa configurada para esta unidad.");
    }
    return {
      quantityInStock: roundQuantity(quantityInInput),
      factorToStock: 1,
    };
  }

  const profileInputUnitCode = normalizeUnitCode(profile.input_unit_code);
  if (profileInputUnitCode !== inputUnitCode) {
    throw new Error("La unidad de captura no coincide con el perfil operativo del producto.");
  }

  const qtyInInputUnit = Number(profile.qty_in_input_unit);
  const qtyInStockUnit = Number(profile.qty_in_stock_unit);
  if (
    !Number.isFinite(qtyInInputUnit) ||
    !Number.isFinite(qtyInStockUnit) ||
    qtyInInputUnit <= 0 ||
    qtyInStockUnit <= 0
  ) {
    throw new Error("Perfil operativo invalido para conversion.");
  }

  const factorToStock = qtyInStockUnit / qtyInInputUnit;
  return {
    quantityInStock: roundQuantity(quantityInInput * factorToStock),
    factorToStock: roundQuantity(factorToStock),
  };
}
