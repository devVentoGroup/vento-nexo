import { roundQuantity } from "@/lib/inventory/uom";

export type RecipeRequirementLine = {
  ingredient_product_id: string;
  quantity: number | null;
  is_active?: boolean | null;
};

export type ComputedIngredientRequirement = {
  ingredientProductId: string;
  requiredQty: number;
};

export type ProductionLocation = {
  id: string;
  code: string | null;
};

export type ProductionPickOrderRow = {
  location_id: string;
  priority: number | null;
  is_active: boolean | null;
};

export type AllocationStockRow = {
  locationId: string;
  availableQty: number;
  sortLabel?: string;
};

export type LocationAllocation = {
  locationId: string;
  qty: number;
};

export function computeBatchIngredientRequirements(params: {
  producedQty: number;
  recipeYieldQty: number;
  lines: RecipeRequirementLine[];
}): ComputedIngredientRequirement[] {
  const producedQty = Number(params.producedQty);
  const recipeYieldQty = Number(params.recipeYieldQty);
  const factor = recipeYieldQty > 0 ? producedQty / recipeYieldQty : 0;
  const grouped = new Map<string, number>();

  for (const line of params.lines) {
    if (line.is_active === false) continue;
    const ingredientProductId = String(line.ingredient_product_id ?? "").trim();
    const qtyPerYield = Number(line.quantity ?? 0);
    if (!ingredientProductId || !Number.isFinite(qtyPerYield) || qtyPerYield <= 0) continue;
    const prev = grouped.get(ingredientProductId) ?? 0;
    grouped.set(ingredientProductId, prev + qtyPerYield * factor);
  }

  return Array.from(grouped.entries())
    .map(([ingredientProductId, requiredQty]) => ({
      ingredientProductId,
      requiredQty: roundQuantity(requiredQty, 6),
    }))
    .filter((row) => row.requiredQty > 0);
}

export function orderLocationsForProduction(params: {
  locations: ProductionLocation[];
  pickOrderRows: ProductionPickOrderRow[];
}): string[] {
  const locationMap = new Map(params.locations.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const ordered: string[] = [];

  const prioritized = params.pickOrderRows
    .filter((row) => row.is_active !== false && locationMap.has(row.location_id))
    .sort((a, b) => {
      const priorityA = Number.isFinite(Number(a.priority)) ? Number(a.priority) : 9999;
      const priorityB = Number.isFinite(Number(b.priority)) ? Number(b.priority) : 9999;
      if (priorityA !== priorityB) return priorityA - priorityB;
      const codeA = String(locationMap.get(a.location_id)?.code ?? "").toUpperCase();
      const codeB = String(locationMap.get(b.location_id)?.code ?? "").toUpperCase();
      if (codeA !== codeB) return codeA.localeCompare(codeB);
      return a.location_id.localeCompare(b.location_id);
    });

  for (const row of prioritized) {
    if (seen.has(row.location_id)) continue;
    seen.add(row.location_id);
    ordered.push(row.location_id);
  }

  const remainder = params.locations
    .filter((row) => !seen.has(row.id))
    .sort((a, b) => {
      const codeA = String(a.code ?? "").toUpperCase();
      const codeB = String(b.code ?? "").toUpperCase();
      if (codeA !== codeB) return codeA.localeCompare(codeB);
      return a.id.localeCompare(b.id);
    });

  for (const row of remainder) {
    seen.add(row.id);
    ordered.push(row.id);
  }

  return ordered;
}

export function allocateByLocPriority(params: {
  requiredQty: number;
  stocks: AllocationStockRow[];
  orderedLocationIds: string[];
}): { allocations: LocationAllocation[]; missingQty: number } {
  const requiredQty = roundQuantity(Number(params.requiredQty), 6);
  if (!Number.isFinite(requiredQty) || requiredQty <= 0) {
    return { allocations: [], missingQty: 0 };
  }

  const orderIndex = new Map(
    params.orderedLocationIds.map((locationId, index) => [locationId, index])
  );
  const candidates = params.stocks
    .filter((row) => Number(row.availableQty) > 0)
    .sort((a, b) => {
      const idxA = orderIndex.has(a.locationId) ? Number(orderIndex.get(a.locationId)) : 99999;
      const idxB = orderIndex.has(b.locationId) ? Number(orderIndex.get(b.locationId)) : 99999;
      if (idxA !== idxB) return idxA - idxB;
      const labelA = String(a.sortLabel ?? a.locationId).toUpperCase();
      const labelB = String(b.sortLabel ?? b.locationId).toUpperCase();
      if (labelA !== labelB) return labelA.localeCompare(labelB);
      return a.locationId.localeCompare(b.locationId);
    });

  let remaining = requiredQty;
  const allocations: LocationAllocation[] = [];
  for (const candidate of candidates) {
    if (remaining <= 0) break;
    const available = roundQuantity(Number(candidate.availableQty), 6);
    if (!Number.isFinite(available) || available <= 0) continue;
    const qty = roundQuantity(Math.min(available, remaining), 6);
    if (qty <= 0) continue;
    allocations.push({ locationId: candidate.locationId, qty });
    remaining = roundQuantity(remaining - qty, 6);
  }

  return {
    allocations,
    missingQty: remaining > 0 ? remaining : 0,
  };
}
