"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type InternalPositionOption = {
  id: string;
  label: string;
  qty: number;
};

type LocOption = {
  id: string;
  label: string;
  qty: number;
  /**
   * Posiciones internas dentro del LOC: estantería, nivel, bin, zona, etc.
   * El padre puede enviar `positions` o `positionOptions` para mantener compatibilidad.
   */
  positions?: InternalPositionOption[];
  positionOptions?: InternalPositionOption[];
};

type MeasurementMode =
  | "fixed_presentation"
  | "variable_weight"
  | "count_with_weight"
  | "bulk_volume";

type ProductionPackagePlanItem = {
  packageId: string;
  dispatchQty: number;
  unitCode: string;
  remainingQty: number;
  label: string;
  batchId: string | null;
  fractional: boolean;
  locationId?: string | null;
  locationLabel?: string | null;
  currentRemainingQty?: number;
  status?: string | null;
};

type DraftLine = {
  id: string;
  baseItemId: string;
  productId?: string;
  productName: string;
  productType?: string | null;
  inventoryKind?: string | null;
  forceUnitOperationalQty?: boolean;
  requestedQty: number;
  unitLabel: string;
  /** Texto operativo principal: ej. 6 Bolsa 1.100 ml (6.600 ml). */
  requestedDisplayLabel?: string;
  /** Texto base opcional cuando se quiere mostrar la conversión aparte. */
  requestedBaseLabel?: string;
  /** Presentación física: ej. Bolsa 1.100 ml, Paquete x 6 bolsas. */
  presentationLabel?: string;
  measurementMode?: MeasurementMode | string | null;
  measurement_mode?: MeasurementMode | string | null;
  /**
   * Datos opcionales de presentación física. Si el padre los envía,
   * el plan de salida conserva presentación_qty + base_qty.
   */
  inputQty?: number;
  presentationQty?: number;
  inputUomProfileId?: string | null;
  uomProfileId?: string | null;
  selectedLocId: string;
  recommendedLocId: string;
  locOptions: LocOption[];
  dispatchQty: number;
  shortageReason: string;
  isVirtualSplit: boolean;
  manualLocked?: boolean;
  requiresPackageDispatch?: boolean;
  productionPackagePlan?: ProductionPackagePlanItem[];
};

type SplitDraft = {
  tempLineId: string;
  sourceItemId: string;
  splitQuantity: number;
};

type PickPayload = {
  itemId: string;
  baseItemId: string;
  productId?: string;
  sourceLocationId: string;
  sourceLocationPositionId?: string | null;
  uomProfileId?: string | null;
  presentationQty?: number;
  baseQty: number;
  shortageReason?: string;
  note?: string | null;
  productionPackageId?: string | null;
};

type PrepareWorkbenchProps = {
  requestId: string;
  returnOrigin: "" | "prepare";
  siteId: string;
  lines: DraftLine[];
  onCommit: (formData: FormData) => void | Promise<void>;
  /** Si true, la remisión ya está lista para despacho: solo resumen, sin editar ni acciones. */
  dispatchReadySummary?: boolean;
  /** En resumen listo: enlace con ?edit_prepare=1 para volver a editar. */
  correctPrepareHref?: string;
  inventoryPostingEnabled?: boolean;
};

type PrepareWorkbenchInteractiveProps = Omit<
  PrepareWorkbenchProps,
  "dispatchReadySummary" | "correctPrepareHref"
>;

function clampQty(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function lineRequiresPackageDispatch(line: DraftLine): boolean {
  return Boolean(line.requiresPackageDispatch);
}

function packagePlanForLine(line: DraftLine): ProductionPackagePlanItem[] {
  return Array.isArray(line.productionPackagePlan) ? line.productionPackagePlan : [];
}

function packagePlanTotal(line: DraftLine): number {
  return roundQty(
    packagePlanForLine(line).reduce((sum, entry) => sum + Number(entry.dispatchQty ?? 0), 0)
  );
}

function packagePlanHasMissingLocation(line: DraftLine): boolean {
  return packagePlanForLine(line).some((entry) => !String(entry.locationId ?? "").trim());
}

function suggestedQtyForLoc(line: DraftLine, locId: string) {
  const loc = line.locOptions.find((entry) => entry.id === locId);
  const available = roundQty(Number(loc?.qty ?? 0));
  return roundQty(clampQty(Number(line.requestedQty ?? 0), 0, available));
}

function normalizeMeasurementMode(value: unknown): MeasurementMode {
  const raw = String(value ?? "").trim();
  if (
    raw === "variable_weight" ||
    raw === "count_with_weight" ||
    raw === "bulk_volume" ||
    raw === "fixed_presentation"
  ) {
    return raw;
  }
  return "fixed_presentation";
}

function getLineMeasurementMode(line: DraftLine): MeasurementMode {
  return normalizeMeasurementMode(line.measurementMode ?? line.measurement_mode);
}

function lineUsesActualQuantity(line: DraftLine): boolean {
  if (lineRequiresPackageDispatch(line)) return false;
  return getLineMeasurementMode(line) !== "fixed_presentation";
}

function formatDisplayQty(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(n);
}

function getLineRequestedDisplayLabel(line: DraftLine): string {
  return getRequestedQtyDisplayLabel(line);
}

function getLineRequestedBaseLabel(line: DraftLine): string {
  return getRequestedBaseDisplayLabel(line);
}

function getLineMeasurementLabel(
  line: DraftLine,
  inventoryPostingEnabled = true
): string {
  if (inventoryPostingEnabled && lineRequiresPackageDispatch(line)) return "Empaques FOGO";
  const mode = getLineMeasurementMode(line);
  if (mode === "variable_weight") return "Peso real";
  if (mode === "count_with_weight") return "Conteo + peso real";
  if (mode === "bulk_volume") return "Cantidad real";
  return getPresentationUnitLabel(line);
}

function getSelectedLocAvailable(line: DraftLine): number {
  const loc = line.locOptions.find((entry) => entry.id === line.selectedLocId);
  return roundQty(Number(loc?.qty ?? 0));
}

function getDispatchMaxForLine(line: DraftLine): number {
  const requestedQty = roundQty(Number(line.requestedQty ?? 0));
  if (lineRequiresPackageDispatch(line)) return packagePlanTotal(line) || requestedQty;
  if (!lineUsesActualQuantity(line)) return requestedQty;

  const selectedAvailable = getSelectedLocAvailable(line);
  if (line.selectedLocId && selectedAvailable > 0) return selectedAvailable;

  const maxLocQty = maxLocQtyForLine(line);
  return maxLocQty > 0 ? maxLocQty : requestedQty;
}

function clampDispatchQty(line: DraftLine, value: number): number {
  return roundQty(clampQty(Number(value ?? 0), 0, getDispatchMaxForLine(line)));
}


function getOverageQty(line: DraftLine): number {
  return roundQty(Math.max(Number(line.dispatchQty ?? 0) - Number(line.requestedQty ?? 0), 0));
}

function getOperationalDispatchMaxForLine(line: DraftLine): number {
  const requestedQty = roundQty(Number(line.requestedQty ?? 0));
  if (getLineMeasurementMode(line) === "fixed_presentation") return requestedQty;
  return Number.MAX_SAFE_INTEGER;
}

function clampOperationalDispatchQty(line: DraftLine, value: number): number {
  return roundQty(clampQty(Number(value ?? 0), 0, getOperationalDispatchMaxForLine(line)));
}

function normalizeOperationalLine(line: DraftLine, fillRequestedQty: boolean): DraftLine {
  const requestedQty = roundQty(Number(line.requestedQty ?? 0));
  const currentDispatchQty = roundQty(Number(line.dispatchQty ?? 0));
  const hasShortageReason = String(line.shortageReason ?? "").trim().length > 0;
  const dispatchQty =
    fillRequestedQty && currentDispatchQty <= 0 && !hasShortageReason
      ? requestedQty
      : clampOperationalDispatchQty(line, currentDispatchQty);

  return {
    ...line,
    selectedLocId: "",
    recommendedLocId: "",
    locOptions: [],
    dispatchQty,
    requiresPackageDispatch: false,
    productionPackagePlan: [],
  };
}

function normalizeWorkbenchLines(
  inputLines: DraftLine[],
  inventoryPostingEnabled: boolean,
  preserveManual: boolean
): DraftLine[] {
  if (!inventoryPostingEnabled) {
    return inputLines.map((line) => normalizeOperationalLine(line, !preserveManual));
  }

  return applySmartAllocation(inputLines.map((line) => normalizeLine(line)), preserveManual);
}

function applySmartAllocation(inputLines: DraftLine[], preserveManual: boolean): DraftLine[] {
  const lines = inputLines.map((line) => ({ ...line }));
  const byProduct = new Map<string, DraftLine[]>();

  for (const line of lines) {
    if (lineRequiresPackageDispatch(line)) continue;
    const key = `${line.productName}__${line.unitLabel}`;
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key)!.push(line);
  }

  for (const [, productLines] of byProduct) {
    const locRemaining = new Map<string, number>();
    for (const line of productLines) {
      for (const loc of line.locOptions) {
        const current = Number(locRemaining.get(loc.id) ?? 0);
        if (loc.qty > current) locRemaining.set(loc.id, Number(loc.qty));
      }
    }

    if (preserveManual) {
      for (const line of productLines) {
        if (!line.manualLocked || !line.selectedLocId) continue;
        const current = Number(locRemaining.get(line.selectedLocId) ?? 0);
        const reserved = clampDispatchQty(line, Number(line.dispatchQty ?? 0));
        locRemaining.set(line.selectedLocId, roundQty(Math.max(0, current - reserved)));
      }
    }

    const autoLines = productLines
      .filter((line) => !(preserveManual && line.manualLocked))
      .sort((a, b) => Number(b.requestedQty) - Number(a.requestedQty));

    for (const line of autoLines) {
      const ranked = line.locOptions
        .map((loc) => {
          const remaining = Number(locRemaining.get(loc.id) ?? 0);
          const alloc = roundQty(Math.min(remaining, Number(line.requestedQty)));
          const shortage = roundQty(Math.max(0, Number(line.requestedQty) - alloc));
          const slack = roundQty(Math.max(0, remaining - alloc));
          return { locId: loc.id, remaining, alloc, shortage, slack };
        })
        .sort((a, b) => {
          if (a.shortage !== b.shortage) return a.shortage - b.shortage;
          if (a.slack !== b.slack) return a.slack - b.slack;
          return b.remaining - a.remaining;
        });

      const best = ranked[0];
      if (!best || best.remaining <= 0) {
        line.selectedLocId = "";
        line.dispatchQty = 0;
        continue;
      }

      line.selectedLocId = best.locId;
      line.dispatchQty = best.alloc;
      if (best.alloc >= line.requestedQty) line.shortageReason = "";
      locRemaining.set(best.locId, roundQty(Math.max(0, best.remaining - best.alloc)));
    }
  }

  return lines.map((line) => normalizeLine(line));
}

function normalizeLine(line: DraftLine): DraftLine {
  if (lineRequiresPackageDispatch(line)) {
    const plan = packagePlanForLine(line);
    const planTotal = packagePlanTotal(line);
    const planLocIds = Array.from(
      new Set(plan.map((entry) => String(entry.locationId ?? "").trim()).filter(Boolean))
    );
    const selectedLocId = planLocIds.length === 1 ? planLocIds[0] : line.selectedLocId || "";
    const dispatchQty = planTotal > 0 ? planTotal : roundQty(Number(line.dispatchQty ?? line.requestedQty ?? 0));

    return {
      ...line,
      selectedLocId,
      recommendedLocId: selectedLocId || line.recommendedLocId || "",
      dispatchQty,
    };
  }

  const selectedLocId = line.selectedLocId || line.recommendedLocId || "";
  let dispatchQty = roundQty(Number(line.dispatchQty ?? 0));

  if (!selectedLocId) {
    dispatchQty = clampDispatchQty({ ...line, selectedLocId }, dispatchQty);
    return { ...line, selectedLocId, dispatchQty };
  }

  const suggestedQty = suggestedQtyForLoc(line, selectedLocId);
  if (dispatchQty <= 0) {
    dispatchQty = suggestedQty;
  } else {
    dispatchQty = clampDispatchQty({ ...line, selectedLocId }, dispatchQty);
  }

  return { ...line, selectedLocId, dispatchQty };
}

function roundQty(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseQty(value: string, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? roundQty(n) : fallback;
}

function sanitizeQtyInput(value: string): string {
  const normalized = value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const [head, ...tail] = normalized.split(".");
  if (!tail.length) return head;
  return `${head}.${tail.join("")}`;
}

function parseOptionalQtyInput(value: string): number | null {
  const raw = value.trim();
  if (!raw || raw === ".") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? roundQty(n) : null;
}

function formatQtyInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(roundQty(value));
}

function getLineUomProfileId(line: DraftLine): string {
  return String(line.inputUomProfileId ?? line.uomProfileId ?? "").trim();
}

function getRequestedPresentationQty(line: DraftLine): number {
  return roundQty(Number(line.inputQty ?? line.presentationQty ?? 0));
}


function normalizeLabelForComparison(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isGenericPresentationLabel(label: string, stockUnitLabel: string): boolean {
  const normalized = normalizeLabelForComparison(label);
  const stockNormalized = normalizeLabelForComparison(stockUnitLabel);
  if (!normalized) return true;
  if (stockNormalized && normalized === stockNormalized) return true;
  return new Set(["un", "und", "uds", "u", "unidad", "unidades", "presentacion fija"]).has(normalized);
}

function isUnitLabel(value: unknown): boolean {
  const normalized = normalizeLabelForComparison(value);
  return ["un", "u", "unit", "units", "unidad", "unidades"].includes(normalized);
}

function formatUnitLabelForQty(unitLabel: string, quantity: number): string {
  if (!isUnitLabel(unitLabel)) return unitLabel;
  return roundQty(Number(quantity ?? 0)) === 1 ? "Unidad" : "Unidades";
}

function isSellableUnitProduct(line: DraftLine): boolean {
  const productType = normalizeLabelForComparison(line.productType);
  const inventoryKind = normalizeLabelForComparison(line.inventoryKind);

  // Regla operativa: reventa NO se fuerza a unidad porque puede tener presentación física.
  if (inventoryKind === "resale") return false;

  return (
    Boolean(line.forceUnitOperationalQty) ||
    productType === "venta" ||
    (productType === "preparacion" && inventoryKind === "finished" && isUnitLabel(line.unitLabel))
  );
}

function lineUsesPresentationOperationalUnit(line: DraftLine): boolean {
  if (lineRequiresPackageDispatch(line)) return false;
  if (isSellableUnitProduct(line)) return false;
  if (getLineMeasurementMode(line) !== "fixed_presentation") return false;

  const requestedPresentationQty = getRequestedPresentationQty(line);
  const requestedBaseQty = roundQty(Number(line.requestedQty ?? 0));
  if (requestedPresentationQty <= 0 || requestedBaseQty <= 0) return false;

  const factor = requestedBaseQty / requestedPresentationQty;
  const explicit = String(line.presentationLabel ?? "").trim();

  // Una presentación "Unidad" con factor 1:1 no es una presentación operativa.
  // Ejemplo: Papel Térmico pedido como 1.000 unidades debe verse como unidades,
  // no como 1.000 presentaciones.
  if (Math.abs(factor - 1) <= 0.001 && isGenericPresentationLabel(explicit, line.unitLabel)) {
    return false;
  }

  return true;
}

function getPresentationUnitLabel(line: DraftLine, quantity?: number): string {
  const explicit = String(line.presentationLabel ?? "").trim();
  if (explicit && !isGenericPresentationLabel(explicit, line.unitLabel)) return explicit;
  const qty = roundQty(Number(quantity ?? getRequestedPresentationQty(line) ?? 0));
  return qty === 1 ? "presentación física" : "presentaciones físicas";
}

function getPresentationBaseFactor(line: DraftLine): number {
  const requestedPresentationQty = getRequestedPresentationQty(line);
  const requestedBaseQty = roundQty(Number(line.requestedQty ?? 0));
  if (requestedPresentationQty <= 0 || requestedBaseQty <= 0) return 0;
  return requestedBaseQty / requestedPresentationQty;
}

function getPresentationQtyFromBase(line: DraftLine, baseQty: number): number {
  const factor = getPresentationBaseFactor(line);
  if (!lineUsesPresentationOperationalUnit(line) || factor <= 0) return roundQty(baseQty);
  return roundQty(roundQty(Number(baseQty ?? 0)) / factor);
}

function getBaseQtyFromPresentation(line: DraftLine, presentationQty: number): number {
  const factor = getPresentationBaseFactor(line);
  if (!lineUsesPresentationOperationalUnit(line) || factor <= 0) return roundQty(presentationQty);
  return roundQty(roundQty(Number(presentationQty ?? 0)) * factor);
}

function getEditableDispatchQty(line: DraftLine): number {
  if (lineUsesPresentationOperationalUnit(line)) {
    return getPresentationQtyFromBase(line, Number(line.dispatchQty ?? 0));
  }
  return roundQty(Number(line.dispatchQty ?? 0));
}

function getDispatchQtyDisplayLabel(line: DraftLine): string {
  if (lineUsesPresentationOperationalUnit(line)) {
    const presentationQty = getPresentationQtyFromBase(line, Number(line.dispatchQty ?? 0));
    const presentationLabel = getPresentationUnitLabel(line, presentationQty);
    const baseQty = roundQty(Number(line.dispatchQty ?? 0));
    const factor = getPresentationBaseFactor(line);
    const baseSuffix = factor > 0 && Math.abs(factor - 1) > 0.001
      ? ` · Base: ${formatDisplayQty(baseQty)} ${formatUnitLabelForQty(line.unitLabel, baseQty)}`
      : "";
    return `${formatDisplayQty(presentationQty)} ${presentationLabel}${baseSuffix}`.trim();
  }
  return `${formatDisplayQty(line.dispatchQty)} ${formatUnitLabelForQty(line.unitLabel, line.dispatchQty)}`.trim();
}

function getRequestedQtyDisplayLabel(line: DraftLine): string {
  if (lineUsesPresentationOperationalUnit(line)) {
    const presentationQty = getRequestedPresentationQty(line);
    const presentationLabel = getPresentationUnitLabel(line, presentationQty);
    const requestedQty = roundQty(Number(line.requestedQty ?? 0));
    const factor = getPresentationBaseFactor(line);
    const baseSuffix = factor > 0 && Math.abs(factor - 1) > 0.001
      ? ` (${formatDisplayQty(requestedQty)} ${formatUnitLabelForQty(line.unitLabel, requestedQty)})`
      : "";
    return `${formatDisplayQty(presentationQty)} ${presentationLabel}${baseSuffix}`.trim();
  }

  const explicit = String(line.requestedDisplayLabel ?? "").trim();
  if (explicit) return explicit;
  return `${formatDisplayQty(line.requestedQty)} ${formatUnitLabelForQty(line.unitLabel, line.requestedQty)}`.trim();
}

function getRequestedBaseDisplayLabel(line: DraftLine): string {
  if (lineUsesPresentationOperationalUnit(line)) {
    const factor = getPresentationBaseFactor(line);
    if (factor > 0 && Math.abs(factor - 1) > 0.001) {
      return `${formatDisplayQty(line.requestedQty)} ${formatUnitLabelForQty(line.unitLabel, line.requestedQty)}`.trim();
    }
    return "";
  }

  const explicit = String(line.requestedBaseLabel ?? "").trim();
  if (explicit) return explicit;

  const presentationQty = getRequestedPresentationQty(line);
  const presentationLabel = String(line.presentationLabel ?? "").trim();
  const requestedQty = roundQty(Number(line.requestedQty ?? 0));

  if (presentationQty > 0 && presentationLabel && requestedQty > 0) {
    return `${formatDisplayQty(requestedQty)} ${formatUnitLabelForQty(line.unitLabel, requestedQty)}`.trim();
  }

  return "";
}

function getPresentationQtyForDispatch(line: DraftLine, dispatchQty: number): number {
  const requestedPresentationQty = getRequestedPresentationQty(line);
  const requestedBaseQty = roundQty(Number(line.requestedQty ?? 0));

  if (!getLineUomProfileId(line) || requestedPresentationQty <= 0 || requestedBaseQty <= 0) {
    return 0;
  }

  return roundQty((roundQty(dispatchQty) / requestedBaseQty) * requestedPresentationQty);
}

function getPositionOptionsForLoc(loc?: LocOption | null): InternalPositionOption[] {
  const candidates = loc?.positions ?? loc?.positionOptions ?? [];
  return candidates
    .map((position) => ({
      ...position,
      qty: roundQty(Number(position.qty ?? 0)),
    }))
    .filter((position) => position.id && position.qty > 0)
    .sort((a, b) => {
      // Regla operativa: consumir primero donde queda menos stock positivo.
      if (a.qty !== b.qty) return a.qty - b.qty;
      return a.label.localeCompare(b.label);
    });
}

function buildPositionPlan(line: DraftLine): Array<{ positionId: string; label: string; qty: number }> {
  const loc = line.locOptions.find((entry) => entry.id === line.selectedLocId);
  const positions = getPositionOptionsForLoc(loc);
  const targetQty = clampDispatchQty(line, Number(line.dispatchQty ?? 0));
  let remaining = targetQty;
  const plan: Array<{ positionId: string; label: string; qty: number }> = [];

  if (!loc || targetQty <= 0 || positions.length <= 0) return plan;

  for (const position of positions) {
    if (remaining <= 0) break;
    const qty = roundQty(Math.min(remaining, Number(position.qty ?? 0)));
    if (qty <= 0) continue;
    plan.push({ positionId: position.id, label: position.label, qty });
    remaining = roundQty(remaining - qty);
  }

  return plan;
}

function buildPicksForLine(line: DraftLine): PickPayload[] {
  if (lineRequiresPackageDispatch(line)) {
    return packagePlanForLine(line)
      .map<PickPayload | null>((entry) => {
        const sourceLocationId = String(entry.locationId ?? "").trim();
        const baseQty = roundQty(Number(entry.dispatchQty ?? 0));
        if (!sourceLocationId || baseQty <= 0) return null;

        return {
          itemId: line.baseItemId,
          baseItemId: line.baseItemId,
          productId: line.productId,
          sourceLocationId,
          sourceLocationPositionId: null,
          uomProfileId: null,
          presentationQty: 0,
          baseQty,
          shortageReason: line.shortageReason.trim(),
          note: entry.fractional
            ? `FOGO: fraccionar ${entry.label || entry.packageId}`
            : `FOGO: empaque ${entry.label || entry.packageId}`,
          productionPackageId: entry.packageId,
        };
      })
      .filter((entry): entry is PickPayload => entry !== null);
  }

  const baseQty = clampDispatchQty(line, Number(line.dispatchQty ?? 0));
  const sourceLocationId = String(line.selectedLocId ?? "").trim();

  if (baseQty <= 0 || !sourceLocationId) return [];

  const loc = line.locOptions.find((entry) => entry.id === sourceLocationId);
  const positionPlan = buildPositionPlan(line);
  const uomProfileId = getLineUomProfileId(line) || null;

  const buildPick = (qty: number, sourceLocationPositionId?: string | null): PickPayload => {
    const presentationQty = getPresentationQtyForDispatch(line, qty);
    return {
      itemId: line.baseItemId,
      baseItemId: line.baseItemId,
      productId: line.productId,
      sourceLocationId,
      sourceLocationPositionId: sourceLocationPositionId || null,
      uomProfileId: uomProfileId && presentationQty > 0 ? uomProfileId : null,
      presentationQty: uomProfileId && presentationQty > 0 ? presentationQty : 0,
      baseQty: qty,
      shortageReason: line.shortageReason.trim(),
      note: line.shortageReason.trim() ? `FALTANTE ORIGEN: ${line.shortageReason.trim()}` : null,
    };
  };

  if (loc && positionPlan.length > 0) {
    const plannedQty = roundQty(positionPlan.reduce((acc, entry) => acc + entry.qty, 0));
    const picks = positionPlan.map((entry) => buildPick(entry.qty, entry.positionId));

    // Si las posiciones internas no cubren todo el despacho, dejamos el resto contra el LOC sin posición.
    // Esto permite convivir con stock no posicionado dentro del mismo LOC.
    const remainder = roundQty(baseQty - plannedQty);
    if (remainder > 0) picks.push(buildPick(remainder, null));

    return picks;
  }

  return [buildPick(baseQty, null)];
}

const DEFAULT_ORIGIN_SHORTAGE_REASON = "Sin stock en origen";

function lineHasShortage(line: DraftLine): boolean {
  return roundQty(Number(line.dispatchQty ?? 0)) < roundQty(Number(line.requestedQty ?? 0));
}

function getEffectiveShortageReason(
  line: DraftLine,
  inventoryPostingEnabled = true
): string {
  const explicit = String(line.shortageReason ?? "").trim();
  if (explicit) return explicit;
  if (!inventoryPostingEnabled && lineHasShortage(line)) return DEFAULT_ORIGIN_SHORTAGE_REASON;
  return "";
}

function getLineTone(line: DraftLine, inventoryPostingEnabled = true) {
  if (inventoryPostingEnabled && lineRequiresPackageDispatch(line)) {
    const planTotal = packagePlanTotal(line);
    if (!packagePlanForLine(line).length) return "error";
    if (packagePlanHasMissingLocation(line)) return "pending";
    if (Math.abs(planTotal - Number(line.dispatchQty ?? 0)) > 0.001) return "error";
  } else if (inventoryPostingEnabled && !line.selectedLocId && line.dispatchQty > 0) return "pending";

  const maxDispatchQty = inventoryPostingEnabled
    ? getDispatchMaxForLine(line)
    : getOperationalDispatchMaxForLine(line);

  if (line.dispatchQty < 0 || line.dispatchQty > maxDispatchQty) return "error";
  if (line.dispatchQty < line.requestedQty && !getEffectiveShortageReason(line, inventoryPostingEnabled)) return "warn";
  return "ok";
}

function getLineToneLabel(tone: "pending" | "warn" | "error" | "ok") {
  if (tone === "ok") return "Lista";
  if (tone === "error") return "Cantidad inválida";
  if (tone === "warn") return "Faltante sin motivo";
  return "Pendiente";
}

/**
 * Compatibilidad temporal: permite dividir visualmente una línea para cubrirla desde varias ubicaciones.
 * La nueva persistencia ya no duplica la línea real; genera picks contra la línea base.
 */
function canSplitDraftLine(line: DraftLine): boolean {
  if (lineRequiresPackageDispatch(line)) return false;
  if (line.isVirtualSplit) return false;
  if (lineUsesActualQuantity(line)) return false;
  return roundQty(line.requestedQty) > 1;
}

function maxLocQtyForLine(line: DraftLine): number {
  let m = 0;
  for (const loc of line.locOptions) {
    m = Math.max(m, roundQty(Number(loc.qty ?? 0)));
  }
  return roundQty(m);
}

function sumLocQtyForLine(line: DraftLine): number {
  return roundQty(line.locOptions.reduce((acc, loc) => acc + Number(loc.qty ?? 0), 0));
}

/**
 * Ninguna ubicación cubre todo el pedido sola, pero la suma entre ubicaciones sí alcanza.
 * Indica que conviene preparar desde varias ubicaciones en lugar de forzar faltante.
 */
function needsMultilocSplitHint(line: DraftLine): boolean {
  if (!canSplitDraftLine(line)) return false;
  const rq = roundQty(line.requestedQty);
  if (rq <= 1 || !line.locOptions.length) return false;
  const maxQ = maxLocQtyForLine(line);
  const sumQ = sumLocQtyForLine(line);
  return maxQ < rq && sumQ >= rq;
}

/** Cantidad sugerida para la nueva línea: lo que cubre el ubicación más llena. */
function suggestedSplitPrimaryQtyForMultiloc(line: DraftLine): number {
  const rq = roundQty(line.requestedQty);
  const maxQ = maxLocQtyForLine(line);
  const minRemainder = 0.01;
  if (maxQ > 0 && maxQ < rq && roundQty(rq - maxQ) >= minRemainder) {
    return maxQ;
  }
  const half = roundQty(rq / 2);
  if (half > 0 && half < rq) return half;
  return Math.max(1, Math.floor(rq / 2));
}

/** Cantidad sugerida para la línea nueva (lo que falta tras mantener la parte principal en la línea actual). */
function suggestedNewLineQtyForMultiloc(line: DraftLine): number {
  const rq = roundQty(line.requestedQty);
  const minRemainder = 0.01;
  const currentDispatch = roundQty(clampQty(Number(line.dispatchQty ?? 0), 0, rq));
  const primaryDefault = suggestedSplitPrimaryQtyForMultiloc(line);
  const keepQty =
    currentDispatch > 0 && currentDispatch < rq ? currentDispatch : primaryDefault;
  const newLineQty = roundQty(rq - keepQty);
  if (newLineQty >= minRemainder && newLineQty < rq) return newLineQty;

  const half = roundQty(rq / 2);
  if (half > 0 && half < rq) return half;
  return Math.max(1, Math.floor(rq / 2));
}

function ProductionPackagePlanSummary({
  line,
  compact = false,
}: {
  line: DraftLine;
  compact?: boolean;
}) {
  const plan = packagePlanForLine(line);
  if (!lineRequiresPackageDispatch(line)) return null;

  if (!plan.length) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-900">
        Esta línea requiere empaques FOGO, pero no tiene plan de empaques asociado.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-950">
      <p className="font-semibold">
        Empaques FOGO asignados · {packagePlanTotal(line)} {formatUnitLabelForQty(line.unitLabel, packagePlanTotal(line))}
      </p>
      <ul className={compact ? "mt-1 space-y-1" : "mt-2 space-y-1.5"}>
        {plan.map((entry) => {
          const locationLabel = String(entry.locationLabel ?? "").trim();
          const locationText = locationLabel || (entry.locationId ? `LOC ${entry.locationId.slice(0, 8)}…` : "Sin LOC");
          return (
            <li key={`${entry.packageId}-${entry.dispatchQty}`} className="rounded-lg bg-white/80 px-2 py-1">
              <span className="font-semibold">{entry.fractional ? "Fracción" : "Completo"}:</span>{" "}
              {entry.label || entry.packageId.slice(0, 8)} · {entry.dispatchQty} {formatUnitLabelForQty(entry.unitCode || line.unitLabel, entry.dispatchQty)}
              <span className="text-sky-900/75"> · {locationText}</span>
            </li>
          );
        })}
      </ul>
      {plan.some((entry) => entry.fractional) ? (
        <p className="mt-2 font-semibold text-amber-900">
          Incluye fraccionamiento: despacho dejará remanente físico en el empaque abierto.
        </p>
      ) : null}
    </div>
  );
}

function RemissionPrepareReadonlySummary({
  lines,
  correctPrepareHref,
  inventoryPostingEnabled = false,
}: {
  lines: DraftLine[];
  correctPrepareHref?: string;
  inventoryPostingEnabled?: boolean;
}) {
  return (
    <>
      <p className="mb-3 text-sm text-[var(--ui-muted)]">
        Plan de salida registrado. El conductor revisa y pone en tránsito desde su cola.
      </p>
      {correctPrepareHref ? (
        <div className="mb-3">
          <Link
            href={correctPrepareHref}
            className="ui-btn ui-btn--ghost inline-flex h-10 items-center px-4 text-sm font-semibold"
          >
            Corregir preparación
          </Link>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)]">
        <div className="hidden grid-cols-[minmax(220px,1.2fr)_minmax(260px,1.3fr)_120px_minmax(220px,1fr)_120px] gap-3 border-b border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)] lg:grid">
          <div>Producto</div>
          <div>Plan de salida</div>
          <div>Cantidad</div>
          <div>Faltante</div>
          <div>Estado</div>
        </div>
        {lines.map((line) => {
          const hasShortage = line.dispatchQty < line.requestedQty;
          const tone = getLineTone(line, inventoryPostingEnabled);
          const locEntry = line.locOptions.find((loc) => loc.id === line.selectedLocId);
          const locText = !inventoryPostingEnabled
            ? "Sin LOC requerido"
            : lineRequiresPackageDispatch(line)
              ? "Empaques reales del lote"
              : locEntry
                ? `${locEntry.label} · ${locEntry.qty} ${formatUnitLabelForQty(line.unitLabel, locEntry.qty)}`
                : (line.selectedLocId || "Sin ubicación").trim() || "Sin ubicación";
          return (
            <div key={line.id} className="border-t border-[var(--ui-border)] first:border-t-0">
              <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(220px,1.2fr)_minmax(260px,1.3fr)_120px_minmax(220px,1fr)_120px] lg:items-start">
                <div>
                  <div className="text-sm font-semibold text-[var(--ui-text)]">{line.productName}</div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                    Solicitado: {getLineRequestedDisplayLabel(line)}
                  </div>
                  {getLineRequestedBaseLabel(line) ? (
                    <div className="mt-0.5 text-[11px] text-[var(--ui-muted)]/75">
                      Base: {getLineRequestedBaseLabel(line)}
                    </div>
                  ) : null}
                  <div className="mt-1 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ui-muted)]">
                    {getLineMeasurementLabel(line, inventoryPostingEnabled)}
                  </div>
                </div>
                <div className="text-sm text-[var(--ui-text)]">
                  {inventoryPostingEnabled && lineRequiresPackageDispatch(line) ? (
                    <ProductionPackagePlanSummary line={line} compact />
                  ) : (
                    locText
                  )}
                </div>
                <div className="text-sm font-medium text-[var(--ui-text)]">
                  {getDispatchQtyDisplayLabel(line)}
                </div>
                <div>
                  {hasShortage ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-950">
                      <span className="font-semibold">Faltante: </span>
                      {getEffectiveShortageReason(line, inventoryPostingEnabled) || "—"}
                    </div>
                  ) : (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs text-emerald-800">
                      Sin faltante
                    </div>
                  )}
                </div>
                <div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      tone === "ok"
                        ? "bg-emerald-100 text-emerald-900"
                        : tone === "warn"
                          ? "bg-amber-100 text-amber-900"
                          : tone === "error"
                            ? "bg-rose-100 text-rose-900"
                            : "bg-[var(--ui-bg-soft)] text-[var(--ui-muted)]"
                    }`}
                  >
                    {getLineToneLabel(tone)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function RemissionPrepareWorkbenchInteractive({
  requestId,
  returnOrigin,
  siteId,
  lines: initialLines,
  onCommit,
  inventoryPostingEnabled = false,
}: PrepareWorkbenchInteractiveProps) {
  const [lines, setLines] = useState<DraftLine[]>(() =>
    normalizeWorkbenchLines(initialLines, inventoryPostingEnabled, false)
  );
  const [splitDrafts, setSplitDrafts] = useState<SplitDraft[]>([]);
  const [splitTargetId, setSplitTargetId] = useState<string>("");
  const [splitQtyInput, setSplitQtyInput] = useState<string>("");
  const [editingDispatchLineId, setEditingDispatchLineId] = useState<string | null>(null);
  const [dispatchQtyDraft, setDispatchQtyDraft] = useState<string>("");

  const splitTarget = useMemo(
    () => lines.find((line) => line.id === splitTargetId) ?? null,
    [lines, splitTargetId]
  );

  const blockers = useMemo(() => {
    const missingLoc = inventoryPostingEnabled
      ? lines.filter((line) => line.dispatchQty > 0 && !line.selectedLocId).length
      : 0;
    const invalidQty = lines.filter((line) => getLineTone(line, inventoryPostingEnabled) === "error").length;
    const missingReason = lines.filter(
      (line) => line.dispatchQty < line.requestedQty && !getEffectiveShortageReason(line, inventoryPostingEnabled)
    ).length;
    return { missingLoc, invalidQty, missingReason };
  }, [inventoryPostingEnabled, lines]);

  const allReady =
    blockers.missingLoc === 0 && blockers.invalidQty === 0 && blockers.missingReason === 0;

  const progress = useMemo(() => {
    const done = lines.filter((line) => {
      if (inventoryPostingEnabled && line.dispatchQty > 0 && !line.selectedLocId) return false;
      if (getLineTone(line, inventoryPostingEnabled) === "error") return false;
      if (line.dispatchQty < line.requestedQty && !getEffectiveShortageReason(line, inventoryPostingEnabled)) return false;
      return true;
    }).length;
    return { done, total: lines.length };
  }, [inventoryPostingEnabled, lines]);

  const updateLine = (lineId: string, patch: Partial<DraftLine>) => {
    setLines((prev) => {
      const patched = prev.map((line) => {
        if (line.id !== lineId) return line;
        const next = { ...line, ...patch, manualLocked: true };

        if (!inventoryPostingEnabled) {
          next.dispatchQty = clampOperationalDispatchQty(next, Number(next.dispatchQty ?? 0));
          return normalizeOperationalLine(next, false);
        }

        if (Object.prototype.hasOwnProperty.call(patch, "selectedLocId")) {
          const selectedLocId = String(patch.selectedLocId ?? "").trim();
          if (selectedLocId) {
            next.dispatchQty = suggestedQtyForLoc(next, selectedLocId);
            if (next.dispatchQty >= next.requestedQty) next.shortageReason = "";
          }
        }
        next.dispatchQty = clampDispatchQty(next, Number(next.dispatchQty ?? 0));
        return next;
      });
      return inventoryPostingEnabled
        ? applySmartAllocation(patched, true)
        : patched.map((line) => normalizeOperationalLine(line, false));
    });
  };

  const startDispatchQtyEdit = (line: DraftLine) => {
    setEditingDispatchLineId(line.id);
    const currentQty = getEditableDispatchQty(line);
    setDispatchQtyDraft(currentQty === 0 ? "" : formatQtyInput(currentQty));
  };

  const changeDispatchQtyInput = (line: DraftLine, rawValue: string) => {
    const nextValue = sanitizeQtyInput(rawValue);
    setDispatchQtyDraft(nextValue);

    const parsedQty = parseOptionalQtyInput(nextValue);
    const dispatchQty = lineUsesPresentationOperationalUnit(line)
      ? getBaseQtyFromPresentation(line, parsedQty ?? 0)
      : parsedQty ?? 0;
    updateLine(line.id, { dispatchQty });
  };

  const finishDispatchQtyEdit = () => {
    setEditingDispatchLineId(null);
    setDispatchQtyDraft("");
  };

  const openSplit = (lineId: string, overrideSuggestedQty?: number) => {
    const line = lines.find((entry) => entry.id === lineId);
    if (!line || !canSplitDraftLine(line)) return;
    const rq = roundQty(line.requestedQty);
    let suggested: number;
    if (overrideSuggestedQty !== undefined && Number.isFinite(overrideSuggestedQty)) {
      const clamped = roundQty(clampQty(overrideSuggestedQty, 0.01, rq - 0.01));
      suggested = clamped > 0 && clamped < rq ? clamped : Number.NaN;
    } else {
      suggested = Number.NaN;
    }
    if (!Number.isFinite(suggested)) {
      if (needsMultilocSplitHint(line)) {
        suggested = suggestedNewLineQtyForMultiloc(line);
      } else {
        const half = roundQty(rq / 2);
        suggested = half > 0 && half < rq ? half : Math.max(1, Math.floor(rq / 2));
      }
    }
    setSplitTargetId(lineId);
    setSplitQtyInput(String(suggested));
  };

  const applySplit = () => {
    if (!splitTarget) return;
    const splitQty = parseQty(splitQtyInput, 0);
    if (splitQty <= 0 || splitQty >= splitTarget.requestedQty) return;

    const newLineId = `tmp-${splitTarget.baseItemId}-${Date.now()}`;
    const remainingQty = roundQty(splitTarget.requestedQty - splitQty);
    const virtualLine: DraftLine = {
      ...splitTarget,
      id: newLineId,
      requestedQty: splitQty,
      dispatchQty: 0,
      selectedLocId: "",
      shortageReason: "",
      isVirtualSplit: true,
      manualLocked: false,
    };

    setLines((prev) => {
      const next = prev.map((line) =>
        line.id === splitTarget.id
          ? { ...line, requestedQty: remainingQty, dispatchQty: Math.min(line.dispatchQty, remainingQty) }
          : line
      );
      const insertIndex = next.findIndex((line) => line.id === splitTarget.id);
      next.splice(insertIndex + 1, 0, virtualLine);
      return normalizeWorkbenchLines(next, inventoryPostingEnabled, true);
    });

    setSplitDrafts((prev) => [
      ...prev,
      {
        tempLineId: newLineId,
        sourceItemId: splitTarget.baseItemId,
        splitQuantity: splitQty,
      },
    ]);

    setSplitTargetId("");
    setSplitQtyInput("");
  };

  const shouldUsePickPayload =
    inventoryPostingEnabled &&
    lines.every(
      (line) =>
        roundQty(Number(line.dispatchQty ?? 0)) > 0 &&
        (!lineRequiresPackageDispatch(line) || !packagePlanHasMissingLocation(line))
    );
  const payload = JSON.stringify({
    lines: lines.map((line) => ({
      id: line.id,
      baseItemId: line.baseItemId,
      selectedLocId: line.selectedLocId,
      dispatchQty: line.dispatchQty,
      requestedQty: line.requestedQty,
      shortageReason: getEffectiveShortageReason(line, inventoryPostingEnabled),
      isVirtualSplit: line.isVirtualSplit,
    })),
    // En modo operativo se permite cantidad 0 como faltante origen; en inventario real solo se usan picks si todas las líneas salen con cantidad.
    splitDrafts: shouldUsePickPayload ? [] : splitDrafts,
    picks: shouldUsePickPayload ? lines.flatMap((line) => buildPicksForLine(line)) : [],
  });

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)]">
        <div className="hidden grid-cols-[minmax(220px,1.2fr)_minmax(260px,1.3fr)_120px_minmax(220px,1fr)_120px] gap-3 border-b border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)] lg:grid">
          <div>Producto</div>
          <div>Plan de salida</div>
          <div>Cantidad</div>
          <div>Faltante</div>
          <div>Estado</div>
        </div>
        {lines.map((line) => {
          const hasShortage = line.dispatchQty < line.requestedQty;
          const tone = getLineTone(line, inventoryPostingEnabled);
          const multilocHint = needsMultilocSplitHint(line);
          const multilocPrimarySuggested = multilocHint
            ? suggestedSplitPrimaryQtyForMultiloc(line)
            : 0;
          const multilocSuggested = multilocHint ? suggestedNewLineQtyForMultiloc(line) : 0;
          const dispatchMax = inventoryPostingEnabled
            ? getDispatchMaxForLine(line)
            : getOperationalDispatchMaxForLine(line);
          const overageQty = getOverageQty(line);
          return (
            <div key={line.id} className="border-t border-[var(--ui-border)] first:border-t-0">
              <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(220px,1.2fr)_minmax(260px,1.3fr)_120px_minmax(220px,1fr)_120px] lg:items-start">
                <div>
                  <div className="text-sm font-semibold text-[var(--ui-text)]">{line.productName}</div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                    Solicitado: {getLineRequestedDisplayLabel(line)}
                  </div>
                  {getLineRequestedBaseLabel(line) ? (
                    <div className="mt-0.5 text-[11px] text-[var(--ui-muted)]/75">
                      Base: {getLineRequestedBaseLabel(line)}
                    </div>
                  ) : null}
                  <div className="mt-1 inline-flex rounded-full border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ui-muted)]">
                    {getLineMeasurementLabel(line, inventoryPostingEnabled)}
                  </div>
                  {inventoryPostingEnabled && lineRequiresPackageDispatch(line) ? (
                    <div className="mt-2">
                      <ProductionPackagePlanSummary line={line} />
                    </div>
                  ) : null}
                  {inventoryPostingEnabled && !lineRequiresPackageDispatch(line) && line.recommendedLocId ? (
                    <div className="mt-2 text-xs text-emerald-700">
                      Ubicación sugerida:{" "}
                      <strong>
                        {(line.locOptions.find((loc) => loc.id === line.selectedLocId)?.label ??
                          line.selectedLocId) || "Sin ubicación"}
                      </strong>
                    </div>
                  ) : inventoryPostingEnabled && !lineRequiresPackageDispatch(line) && line.locOptions.length === 0 ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                      No hay stock disponible en ubicaciones del origen. Déjalo en 0 y registra el faltante como pendiente de producción.
                    </div>
                  ) : null}
                  {lineUsesActualQuantity(line) ? (
                    <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-950">
                      Registra la cantidad real que sale. Puede quedar por encima o por debajo de lo solicitado; NEXO guardará la diferencia operativa.
                    </div>
                  ) : null}
                  {(() => {
                    const loc = line.locOptions.find((entry) => entry.id === line.selectedLocId);
                    const plan = buildPositionPlan(line);
                    const positions = getPositionOptionsForLoc(loc);
                    if (!loc || line.dispatchQty <= 0 || positions.length <= 0) return null;
                    if (positions.length === 1) {
                      return (
                        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900">
                          Sale de {positions[0].label}.
                        </div>
                      );
                    }
                    return (
                      <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-950">
                        <p className="font-semibold">Plan interno sugerido</p>
                        <ul className="mt-1 space-y-1">
                          {plan.map((entry) => (
                            <li key={entry.positionId}>
                              {entry.label}: {entry.qty} {formatUnitLabelForQty(line.unitLabel, entry.qty)}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-1 text-sky-900/75">
                          Prioriza posiciones con menor stock para liberar niveles primero.
                        </p>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex flex-col gap-2">
                  {!inventoryPostingEnabled ? (
                    <div className="ui-input flex h-10 items-center bg-[var(--ui-bg-soft)] text-xs font-semibold text-[var(--ui-muted)]">
                      Sin LOC requerido
                    </div>
                  ) : lineRequiresPackageDispatch(line) ? (
                    <div className="ui-input flex h-10 items-center bg-[linear-gradient(180deg,rgba(240,249,255,0.9)_0%,rgba(255,255,255,0.92)_100%)] text-xs font-semibold text-sky-950">
                      Empaques FOGO asignados
                    </div>
                  ) : (
                    <select
                      value={line.selectedLocId}
                      onChange={(e) => updateLine(line.id, { selectedLocId: e.target.value })}
                      className="ui-input h-10"
                    >
                      <option value="">
                        {line.locOptions.length > 0 ? "Selecciona ubicación" : "Sin stock en ubicaciones"}
                      </option>
                      {line.locOptions.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.label} · {loc.qty} {formatUnitLabelForQty(line.unitLabel, loc.qty)}
                        </option>
                      ))}
                    </select>
                  )}
                  {inventoryPostingEnabled && !lineRequiresPackageDispatch(line) && multilocHint ? (
                    <div className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-950">
                      <p className="font-semibold leading-snug">
                        Ninguna ubicación cubre todo el pedido; entre ubicaciones sí alcanza.
                      </p>
                      <p className="mt-1 leading-snug text-sky-900/80">
                        Usa varias ubicaciones para cubrir el pedido sin registrar faltante.
                      </p>
                      <button
                        type="button"
                        onClick={() => openSplit(line.id, multilocSuggested)}
                        className="mt-2 text-left text-sm font-semibold text-sky-900 underline-offset-4 transition hover:underline"
                      >
                        Distribución sugerida: {multilocPrimarySuggested} + {multilocSuggested}{" "}
                        {formatUnitLabelForQty(line.unitLabel, multilocSuggested)}
                      </button>
                    </div>
                  ) : null}
                  {inventoryPostingEnabled ? (
                    <button
                      type="button"
                      onClick={() => openSplit(line.id, multilocHint ? multilocSuggested : undefined)}
                      className="ui-btn ui-btn--ghost h-9 text-xs font-semibold"
                      disabled={lineRequiresPackageDispatch(line) || !canSplitDraftLine(line)}
                      title={
                        canSplitDraftLine(line)
                          ? "Divide el preparado en dos partes para escoger otra ubicación de salida."
                          : lineUsesActualQuantity(line)
                            ? "Los productos de cantidad real se ajustan registrando el peso/volumen exacto preparado."
                            : "Solo aplica con más de 1 unidad solicitada."
                      }
                    >
                      Usar varias ubicaciones
                    </button>
                  ) : null}
                </div>

                <div>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    value={
                      editingDispatchLineId === line.id
                        ? dispatchQtyDraft
                        : formatQtyInput(getEditableDispatchQty(line))
                    }
                    disabled={inventoryPostingEnabled && lineRequiresPackageDispatch(line)}
                    onFocus={(event) => {
                      startDispatchQtyEdit(line);
                      event.currentTarget.select();
                    }}
                    onChange={(event) => changeDispatchQtyInput(line, event.target.value)}
                    onBlur={finishDispatchQtyEdit}
                    placeholder="0"
                    className="ui-input h-10 w-full disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"
                  />
                  {inventoryPostingEnabled && lineRequiresPackageDispatch(line) ? (
                    <div className="mt-1 text-xs text-[var(--ui-muted)]">
                      Cantidad fijada por empaques reales FOGO.
                    </div>
                  ) : lineUsesPresentationOperationalUnit(line) ? (
                    <div className="mt-1 text-xs text-[var(--ui-muted)]">
                      Edita presentaciones. {getDispatchQtyDisplayLabel(line)}
                    </div>
                  ) : null}
                  {inventoryPostingEnabled && line.locOptions.length === 0 && line.dispatchQty === 0 ? (
                    <div className="mt-1 text-xs text-[var(--ui-muted)]">
                      Sin despacho hasta que producción cargue stock a una ubicación.
                    </div>
                  ) : null}
                  {lineUsesActualQuantity(line) && overageQty > 0 ? (
                    <div className="mt-1 text-xs font-semibold text-sky-800">
                      Diferencia real: +{overageQty} {formatUnitLabelForQty(line.unitLabel, overageQty)} frente a lo solicitado.
                    </div>
                  ) : null}
                </div>

                <div>
                  {hasShortage ? (
                    <div className="space-y-2">
                      {!inventoryPostingEnabled && !line.shortageReason.trim() ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-950">
                          <span className="font-semibold">Faltante origen automático: </span>
                          {DEFAULT_ORIGIN_SHORTAGE_REASON}.
                        </div>
                      ) : null}
                      <textarea
                        value={line.shortageReason}
                        onChange={(e) => updateLine(line.id, { shortageReason: e.target.value })}
                        className="ui-input min-h-[60px] w-full"
                        placeholder={
                          inventoryPostingEnabled
                            ? "Motivo obligatorio si sale menos de lo solicitado..."
                            : `Opcional. Por defecto: ${DEFAULT_ORIGIN_SHORTAGE_REASON}.`
                        }
                      />
                    </div>
                  ) : (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs text-emerald-800">
                      Sin faltante
                    </div>
                  )}
                </div>

                <div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      tone === "ok"
                        ? "bg-emerald-100 text-emerald-900"
                        : tone === "warn"
                          ? "bg-amber-100 text-amber-900"
                          : tone === "error"
                            ? "bg-rose-100 text-rose-900"
                            : "bg-[var(--ui-bg-soft)] text-[var(--ui-muted)]"
                    }`}
                  >
                    {getLineToneLabel(tone)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {splitTarget ? (
        <div className="fixed inset-0 z-50 bg-black/30 px-4 py-8">
          <div className="mx-auto max-w-lg rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-4">
            <div className="text-lg font-semibold text-[var(--ui-text)]">Usar varias ubicaciones</div>
            <div className="mt-2 text-sm text-[var(--ui-muted)]">
              {splitTarget.productName} · Solicitado {getLineRequestedDisplayLabel(splitTarget)}
            </div>
            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs text-[var(--ui-muted)]">Cantidad que saldrá de otra ubicación</span>
              <input
                type="number"
                min={0}
                max={Math.max(splitTarget.requestedQty - 0.01, 0)}
                step="any"
                value={splitQtyInput}
                onChange={(e) => setSplitQtyInput(e.target.value)}
                className="ui-input h-11"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="ui-btn ui-btn--ghost h-11 px-4 text-sm font-semibold"
                onClick={() => {
                  setSplitTargetId("");
                  setSplitQtyInput("");
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--action h-11 px-4 text-sm font-semibold"
                onClick={applySplit}
              >
                Aplicar distribución
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--ui-border)] bg-[var(--ui-bg)]/98 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-[var(--ui-text)]">
            <strong>{progress.done}/{progress.total}</strong> líneas listas
          </div>
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            {inventoryPostingEnabled ? (
              <button
                type="button"
                onClick={() => {
                  setLines((prev) =>
                    normalizeWorkbenchLines(
                      prev.map((line) => ({ ...line, manualLocked: false })),
                      inventoryPostingEnabled,
                      false
                    )
                  );
                }}
                className="text-left text-sm font-medium text-[var(--ui-text)]/55 underline-offset-4 transition hover:text-[var(--ui-text)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-ring)]"
              >
                Recalcular ubicaciones
              </button>
            ) : null}
            <form action={onCommit}>
              <input type="hidden" name="request_id" value={requestId} />
              <input type="hidden" name="return_origin" value={returnOrigin} />
              <input type="hidden" name="site_id" value={siteId} />
              <input type="hidden" name="payload" value={payload} />
              <button
                type="submit"
                className="ui-btn ui-btn--action h-11 px-4 text-sm font-semibold"
                disabled={!allReady}
              >
                Marcar lista para despacho
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

export function RemissionPrepareWorkbench(props: PrepareWorkbenchProps) {
  if (props.dispatchReadySummary) {
    return (
      <RemissionPrepareReadonlySummary
        lines={props.lines}
        correctPrepareHref={props.correctPrepareHref}
        inventoryPostingEnabled={Boolean(props.inventoryPostingEnabled)}
      />
    );
  }
  return (
    <RemissionPrepareWorkbenchInteractive
      requestId={props.requestId}
      returnOrigin={props.returnOrigin}
      siteId={props.siteId}
      lines={props.lines}
      onCommit={props.onCommit}
      inventoryPostingEnabled={Boolean(props.inventoryPostingEnabled)}
    />
  );
}
