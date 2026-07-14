import {
  convertByProductProfile,
  normalizeProductUomUsageContext,
  normalizeUnitCode,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

export type CountLocationProduct = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  stockUnitCode?: string | null;
  measurementMode?: string | null;
  profiles?: ProductUomProfile[];
};

export type InternalPositionOption = {
  id: string;
  label: string;
  selectedLabel?: string;
};

export type CountLocationEntry = {
  id: string;
  rawQuantity: string;
  unitValue: string;
  positionId: string;
};

export type CountLocationLine = {
  product_id: string;
  quantity: number;
  input_quantity: number;
  input_unit_code: string;
  input_unit_label: string;
  uom_profile_id?: string;
  stock_unit_code: string;
  position_id?: string;
};

export type CountUnitOption = {
  value: string;
  inputUnitCode: string;
  label: string;
  conversionLabel: string;
  profile: ProductUomProfile | null;
};

export function normalizeMeasurementMode(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "variable_weight") return "variable_weight";
  if (normalized === "count_with_weight") return "count_with_weight";
  if (normalized === "bulk_volume") return "bulk_volume";
  return "fixed_presentation";
}

export function parseCountQuantity(value: string | undefined) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return 0;
  const quantity = Number(normalized);
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
}

export function hasExplicitCount(value: string | undefined) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return false;
  const quantity = Number(normalized);
  return Number.isFinite(quantity) && quantity >= 0;
}

export function createCountEntry(productId: string): CountLocationEntry {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}:${Math.random().toString(36).slice(2)}`;

  return {
    id: `${productId}:${suffix}`,
    rawQuantity: "",
    unitValue: "",
    positionId: "",
  };
}

function isPhysicalProfile(profile: ProductUomProfile) {
  if (!profile.is_active || profile.source !== "manual") return false;
  if (normalizeProductUomUsageContext(profile.usage_context) !== "general") return false;
  const inputQty = Number(profile.qty_in_input_unit);
  const stockQty = Number(profile.qty_in_stock_unit);
  return Number.isFinite(inputQty) && inputQty > 0 && Number.isFinite(stockQty) && stockQty > 0;
}

function formatFactor(value: number) {
  return value.toLocaleString("es-CO", { maximumFractionDigits: 3 });
}

export function getCountUnitOptions(product: CountLocationProduct): CountUnitOption[] {
  const stockUnitCode = normalizeUnitCode(product.stockUnitCode ?? product.unit ?? "un") || "un";
  const measurementMode = normalizeMeasurementMode(product.measurementMode);
  const base: CountUnitOption = {
    value: `stock:${stockUnitCode}`,
    inputUnitCode: stockUnitCode,
    label: stockUnitCode,
    conversionLabel: `Unidad base: ${stockUnitCode}`,
    profile: null,
  };

  if (measurementMode !== "fixed_presentation") return [base];

  const seen = new Set<string>();
  const profiles = (product.profiles ?? [])
    .filter(isPhysicalProfile)
    .sort((a, b) => Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)))
    .flatMap((profile) => {
      const inputUnitCode = normalizeUnitCode(profile.input_unit_code);
      if (!inputUnitCode || seen.has(profile.id)) return [];
      seen.add(profile.id);
      const inputQty = Number(profile.qty_in_input_unit);
      const stockQty = Number(profile.qty_in_stock_unit);
      const factor = stockQty / inputQty;
      const label = String(profile.label || inputUnitCode).trim();
      return [{
        value: `profile:${profile.id}`,
        inputUnitCode,
        label,
        conversionLabel: `1 ${label} = ${formatFactor(factor)} ${stockUnitCode}`,
        profile,
      } satisfies CountUnitOption];
    });

  return profiles.length ? [...profiles, base] : [base];
}

export function resolveCountUnit(options: CountUnitOption[], entry: CountLocationEntry) {
  return options.find((option) => option.value === entry.unitValue) ?? options[0];
}

export function buildCountLine(
  product: CountLocationProduct,
  entry: CountLocationEntry,
  options: CountUnitOption[]
): CountLocationLine | null {
  if (!hasExplicitCount(entry.rawQuantity)) return null;
  const selectedUnit = resolveCountUnit(options, entry);
  const inputQuantity = parseCountQuantity(entry.rawQuantity);
  const stockUnitCode = normalizeUnitCode(product.stockUnitCode ?? product.unit ?? "un") || "un";
  const converted = convertByProductProfile({
    quantityInInput: inputQuantity,
    inputUnitCode: selectedUnit.inputUnitCode,
    stockUnitCode,
    profile: selectedUnit.profile,
  });

  return {
    product_id: product.id,
    quantity: converted.quantityInStock,
    input_quantity: inputQuantity,
    input_unit_code: selectedUnit.inputUnitCode,
    input_unit_label: selectedUnit.label,
    uom_profile_id: selectedUnit.profile?.id,
    stock_unit_code: stockUnitCode,
    position_id: entry.positionId || undefined,
  };
}
