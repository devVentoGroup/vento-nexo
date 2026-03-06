import { computeWeightedAverageCost } from "@/lib/inventory/costing";
import {
  convertQuantity,
  createUnitMap,
  normalizeUnitCode,
  roundQuantity,
  type InventoryUnit,
} from "@/lib/inventory/uom";
import type { NewProductProposal, ParsedLineItem } from "@/lib/inventory/ai/types";

export function resolveNetAndGrossUnitPrice(params: {
  unitPrice: number | null;
  taxIncluded: boolean | null;
  taxRate: number | null;
}) {
  const price = Number(params.unitPrice ?? 0);
  if (!Number.isFinite(price) || price <= 0) {
    return { net: 0, gross: 0 };
  }
  const safeRate = Number.isFinite(Number(params.taxRate)) ? Math.max(0, Number(params.taxRate)) : 0;
  const taxIncluded = params.taxIncluded === true;
  if (!taxIncluded) {
    return {
      net: roundQuantity(price, 6),
      gross: roundQuantity(price * (1 + safeRate / 100), 6),
    };
  }
  const divisor = 1 + safeRate / 100;
  if (!Number.isFinite(divisor) || divisor <= 0) {
    return { net: roundQuantity(price, 6), gross: roundQuantity(price, 6) };
  }
  return {
    net: roundQuantity(price / divisor, 6),
    gross: roundQuantity(price, 6),
  };
}

export function buildNewProductProposal(line: ParsedLineItem): NewProductProposal {
  const unit = normalizeUnitCode(line.unit || "un");
  const baseType: NewProductProposal["product_type"] =
    unit === "un" ? "venta" : "insumo";
  const baseLabel = unit === "un" ? "Unidad" : "Empaque";
  return {
    name: line.name.trim(),
    product_type: baseType,
    stock_unit_code: unit || "un",
    purchase_uom: {
      label: baseLabel,
      input_unit_code: unit || "un",
      qty_in_input_unit: 1,
      qty_in_stock_unit: Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 1,
    },
    initial_cost_net: resolveNetAndGrossUnitPrice({
      unitPrice: line.unit_price,
      taxIncluded: line.tax_included,
      taxRate: line.tax_rate,
    }).net,
  };
}

export function resolveEntryUnitConversion(params: {
  inputQty: number;
  inputUnitCode: string;
  stockUnitCode: string;
  units: InventoryUnit[];
}) {
  const unitMap = createUnitMap(params.units);
  const inputUnitCode = normalizeUnitCode(params.inputUnitCode || params.stockUnitCode || "un");
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "un");
  const factorRes = convertQuantity({
    quantity: 1,
    fromUnitCode: inputUnitCode,
    toUnitCode: stockUnitCode,
    unitMap,
  });
  const conversionFactorToStock = Number(factorRes.quantity);
  const qtyStock = roundQuantity(Number(params.inputQty) * conversionFactorToStock, 6);
  return {
    qtyStock,
    conversionFactorToStock,
    inputUnitCode,
    stockUnitCode,
  };
}

export function nextWeightedAverageCost(params: {
  qtyBefore: number;
  costBefore: number;
  qtyIn: number;
  costIn: number;
}) {
  return computeWeightedAverageCost({
    currentQty: Number(params.qtyBefore ?? 0),
    currentUnitCost: Number(params.costBefore ?? 0),
    receivedQty: Number(params.qtyIn ?? 0),
    receivedUnitCost: Number(params.costIn ?? 0),
  });
}
