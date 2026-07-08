"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { applyReceiveBatchConfirm } from "./detail-actions";

export type ReceiveBatchPackageTrace = {
  itemId?: string;
  packageId: string;
  packageLabel?: string | null;
  batchId?: string | null;
  dispatchQty: number;
  unitCode: string;
  fractional?: boolean;
  locationLabel?: string | null;
};

export type ReceiveBatchMeasurementMode =
  | "fixed_presentation"
  | "variable_weight"
  | "count_with_weight"
  | "bulk_volume";

export type ReceiveBatchMeasurementPolicy = {
  itemId?: string;
  measurementMode: ReceiveBatchMeasurementMode;
  requiresActualReceiptQty?: boolean | null;
  requiresCountAlongsideWeight?: boolean | null;
  unitCode?: string | null;
  auxCountUnitCode?: string | null;
  defaultTolerancePercent?: number | null;
};

type ReceiveBatchContextValue = {
  selected: ReadonlySet<string>;
  toggle: (itemId: string, on: boolean) => void;
  eligibleIds: readonly string[];
  productGroups: Array<{ productId: string; itemIds: string[] }>;
  selectAllEligible: () => void;
  clearSelection: () => void;
  notes: Record<string, string>;
  setNote: (itemId: string, value: string) => void;
  receiveQty: Record<string, string>;
  setReceiveQty: (itemId: string, value: string) => void;
  auxCount: Record<string, string>;
  setAuxCount: (itemId: string, value: string) => void;
  packageTraceByItemId: Record<string, ReceiveBatchPackageTrace[]>;
  measurementByItemId: Record<string, ReceiveBatchMeasurementPolicy>;
};

const ReceiveBatchContext = createContext<ReceiveBatchContextValue | null>(null);

function useReceiveBatchContext() {
  const ctx = useContext(ReceiveBatchContext);
  if (!ctx) {
    throw new Error("ReceiveBatchLineWrapper debe ir dentro de ReceiveBatchShell.");
  }
  return ctx;
}

type ReceiveBatchShellProps = {
  requestId: string;
  returnOrigin: string;
  siteId: string;
  eligibleProductGroups: Array<{ productId: string; itemIds: string[] }>;
  packageTraceByItemId?: Record<string, ReceiveBatchPackageTrace[]>;
  measurementByItemId?: Record<string, ReceiveBatchMeasurementPolicy>;
  children: ReactNode;
};

function formatTraceQty(value: number | null | undefined) {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return "0";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(numericValue);
}

function formatQuickQty(value: number | null | undefined) {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return "0";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(numericValue);
}

function packageTraceLabel(trace: ReceiveBatchPackageTrace) {
  const label = String(trace.packageLabel ?? "").trim();
  if (label) return label;

  const packageId = String(trace.packageId ?? "").trim();
  return packageId ? `Empaque ${packageId.slice(0, 8)}` : "Empaque FOGO";
}

function itemRequiresActualReceiptQty(
  policy: ReceiveBatchMeasurementPolicy | null | undefined
): boolean {
  if (!policy) return false;
  if (typeof policy.requiresActualReceiptQty === "boolean") return policy.requiresActualReceiptQty;
  return policy.measurementMode !== "fixed_presentation";
}

function hasPositiveQuantityInput(value: string | null | undefined): boolean {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0;
}

function normalizeAuxCountUnitCode(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return normalized || "piezas";
}

function itemRequiresAuxCount(policy: ReceiveBatchMeasurementPolicy | null | undefined): boolean {
  if (!policy) return false;
  return Boolean(policy.requiresCountAlongsideWeight) || policy.measurementMode === "count_with_weight";
}

function buildProductMeasurementPolicy(
  itemIds: string[],
  measurementByItemId: Record<string, ReceiveBatchMeasurementPolicy>,
  fallbackUnitCode: string
): ReceiveBatchMeasurementPolicy {
  const policies = itemIds
    .map((itemId) => measurementByItemId[itemId])
    .filter((policy): policy is ReceiveBatchMeasurementPolicy => Boolean(policy));

  const preferred =
    policies.find((policy) => itemRequiresActualReceiptQty(policy)) ?? policies[0] ?? null;

  return {
    itemId: preferred?.itemId,
    measurementMode: preferred?.measurementMode ?? "fixed_presentation",
    requiresActualReceiptQty: policies.some(itemRequiresActualReceiptQty),
    requiresCountAlongsideWeight: policies.some(itemRequiresAuxCount),
    unitCode: preferred?.unitCode ?? fallbackUnitCode,
    auxCountUnitCode: normalizeAuxCountUnitCode(preferred?.auxCountUnitCode),
    defaultTolerancePercent: preferred?.defaultTolerancePercent ?? null,
  };
}

function receiveQuantityFieldLabel(policy: ReceiveBatchMeasurementPolicy): string {
  if (policy.measurementMode === "count_with_weight") return "Peso recibido";
  if (policy.measurementMode === "variable_weight") return "Cantidad real";
  if (policy.measurementMode === "bulk_volume") return "Cantidad real";
  return "Recibir";
}

function roundReceiveQty(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function parseInputNumber(value: string): number | null {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ReceiveBatchShell({
  requestId,
  returnOrigin,
  siteId,
  eligibleProductGroups,
  packageTraceByItemId = {},
  measurementByItemId = {},
  children,
}: ReceiveBatchShellProps) {
  const eligibleItemIds = useMemo(
    () => eligibleProductGroups.flatMap((group) => group.itemIds),
    [eligibleProductGroups]
  );
  const eligibleSet = useMemo(() => new Set(eligibleItemIds), [eligibleItemIds]);

  // Recepcion rapida: por defecto todo lo pendiente queda seleccionado.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(eligibleItemIds));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [receiveQty, setReceiveQtyState] = useState<Record<string, string>>({});
  const [auxCount, setAuxCountState] = useState<Record<string, string>>({});

  const toggle = useCallback(
    (itemId: string, on: boolean) => {
      if (!eligibleSet.has(itemId)) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(itemId);
        else next.delete(itemId);
        return next;
      });
    },
    [eligibleSet]
  );

  const selectAllEligible = useCallback(() => {
    setSelected(new Set(eligibleItemIds));
  }, [eligibleItemIds]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const setNote = useCallback((itemId: string, value: string) => {
    setNotes((prev) => ({ ...prev, [itemId]: value }));
  }, []);

  const setReceiveQty = useCallback((itemId: string, value: string) => {
    setReceiveQtyState((prev) => ({ ...prev, [itemId]: value }));
  }, []);

  const setAuxCount = useCallback((itemId: string, value: string) => {
    setAuxCountState((prev) => ({ ...prev, [itemId]: value }));
  }, []);

  const ctxValue = useMemo<ReceiveBatchContextValue>(
    () => ({
      selected,
      toggle,
      eligibleIds: eligibleItemIds,
      productGroups: eligibleProductGroups,
      selectAllEligible,
      clearSelection,
      notes,
      setNote,
      receiveQty,
      setReceiveQty,
      auxCount,
      setAuxCount,
      packageTraceByItemId,
      measurementByItemId,
    }),
    [
      selected,
      toggle,
      eligibleItemIds,
      eligibleProductGroups,
      selectAllEligible,
      clearSelection,
      notes,
      setNote,
      receiveQty,
      setReceiveQty,
      auxCount,
      setAuxCount,
      packageTraceByItemId,
      measurementByItemId,
    ]
  );

  return (
    <ReceiveBatchContext.Provider value={ctxValue}>
      <div className="relative max-lg:pb-32">{children}</div>
      <ReceiveBatchDock requestId={requestId} returnOrigin={returnOrigin} siteId={siteId} />
    </ReceiveBatchContext.Provider>
  );
}

type ReceiveBatchDockProps = {
  requestId: string;
  returnOrigin: string;
  siteId: string;
};

function ReceiveBatchDock({ requestId, returnOrigin, siteId }: ReceiveBatchDockProps) {
  const {
    selected,
    productGroups,
    selectAllEligible,
    clearSelection,
    notes,
    receiveQty,
    auxCount,
    measurementByItemId,
  } = useReceiveBatchContext();

  const eligibleProductsCount = productGroups.length;
  const selectedProductsCount = productGroups.filter((group) =>
    group.itemIds.every((id) => selected.has(id))
  ).length;
  const selectedMissingActualQtyCount = [...selected].filter((itemId) => {
    const policy = measurementByItemId[itemId];
    return itemRequiresActualReceiptQty(policy) && !hasPositiveQuantityInput(receiveQty[itemId]);
  }).length;
  const selectedMissingAuxCount = [...selected].filter((itemId) => {
    const policy = measurementByItemId[itemId];
    return itemRequiresAuxCount(policy) && !hasPositiveQuantityInput(auxCount[itemId]);
  }).length;
  const noEligible = eligibleProductsCount === 0;
  const selectedLines = [...selected];

  return (
    <div
      className="z-40 flex justify-center px-3 pt-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      role="region"
      aria-label="Confirmacion de recepcion"
    >
      <div className="w-full max-w-3xl rounded-xl border border-stone-200/90 bg-[var(--ui-bg)] p-2 shadow-sm ring-1 ring-stone-100/70 sm:p-3 lg:flex lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-semibold text-stone-700">
            {noEligible
              ? "Sin productos pendientes."
              : `${selectedProductsCount}/${eligibleProductsCount} seleccionados.`}
          </p>
          {selectedMissingActualQtyCount > 0 ? (
            <p className="text-[11px] font-semibold text-amber-700">
              Falta cantidad real en {selectedMissingActualQtyCount} linea{selectedMissingActualQtyCount === 1 ? "" : "s"}.
            </p>
          ) : null}
          {selectedMissingAuxCount > 0 ? (
            <p className="text-[11px] font-semibold text-amber-700">
              Falta conteo auxiliar en {selectedMissingAuxCount} linea{selectedMissingAuxCount === 1 ? "" : "s"}.
            </p>
          ) : null}
          {!noEligible ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50"
                onClick={selectAllEligible}
              >
                Marcar todas
              </button>
              <button
                type="button"
                className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={clearSelection}
                disabled={selectedLines.length === 0}
              >
                Limpiar
              </button>
            </div>
          ) : null}
        </div>
        <form
          action={applyReceiveBatchConfirm}
          className="mt-3 flex w-full shrink-0 flex-col gap-2 sm:mt-0 lg:w-auto lg:items-end"
        >
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="return_origin" value={returnOrigin} />
          <input type="hidden" name="site_id" value={siteId} />
          {selectedLines.map((id) => (
            <span key={id}>
              <input type="hidden" name="batch_receive_item_id" value={id} />
              <input type="hidden" name="batch_receive_item_note" value={notes[id] ?? ""} />
              <input type="hidden" name="batch_receive_item_receive_qty" value={receiveQty[id] ?? ""} />
              <input type="hidden" name="batch_receive_item_aux_count" value={auxCount[id] ?? ""} />
              <input
                type="hidden"
                name="batch_receive_item_aux_count_unit_code"
                value={normalizeAuxCountUnitCode(measurementByItemId[id]?.auxCountUnitCode)}
              />
            </span>
          ))}
          <button
            type="submit"
            disabled={
              selectedLines.length === 0 ||
              noEligible ||
              selectedMissingActualQtyCount > 0 ||
              selectedMissingAuxCount > 0
            }
            className="h-10 w-full min-w-[180px] rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-sm font-bold text-white shadow-lg shadow-teal-900/25 transition hover:from-teal-500 hover:to-emerald-500 disabled:cursor-not-allowed disabled:from-stone-300 disabled:to-stone-300 disabled:text-stone-500 disabled:shadow-none lg:w-auto"
          >
            Registrar recepcion
          </button>
        </form>
      </div>
    </div>
  );
}

type ReceiveBatchLineWrapperProps = {
  itemId: string;
  batchEligible: boolean;
  children: ReactNode;
};

export function ReceiveBatchLineWrapper({
  itemId,
  batchEligible,
  children,
}: ReceiveBatchLineWrapperProps) {
  const { selected, toggle } = useReceiveBatchContext();
  const isChecked = selected.has(itemId);

  return (
    <div className="relative">
      {batchEligible ? (
        <label className="absolute left-3 top-3 z-10 flex cursor-pointer items-center gap-2 rounded-lg bg-white/90 px-2 py-1 shadow-sm ring-1 ring-stone-200/70 transition hover:bg-white">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => toggle(itemId, e.target.checked)}
            className="sr-only"
          />
          <span
            className={[
              "flex h-8 w-8 items-center justify-center rounded-full border transition",
              isChecked
                ? "border-emerald-400 bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-sm"
                : "border-stone-300 bg-white text-stone-500",
            ].join(" ")}
            aria-hidden
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={isChecked ? "opacity-100" : "opacity-0"}
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
        </label>
      ) : null}
      <div>{children}</div>
    </div>
  );
}

type ReceiveBatchCompactLineProps = {
  itemId: string;
  productName: string;
  unitLabel: string;
  shippedQty: number;
  remainingQty: number;
};

export function ReceiveBatchCompactLine({
  itemId,
  productName,
  unitLabel,
  shippedQty,
  remainingQty,
}: ReceiveBatchCompactLineProps) {
  return (
    <ReceiveBatchCompactProductLine
      productId={itemId}
      itemIds={[itemId]}
      itemPendingQtys={[remainingQty]}
      itemDisplayPendingQtys={[remainingQty]}
      productName={productName}
      unitLabel={unitLabel}
      shippedQtyTotal={shippedQty}
      pendingQtyTotal={remainingQty}
    />
  );
}

type ReceiveBatchCompactProductLineProps = {
  productId: string;
  itemIds: string[];
  /** Cantidades pendientes en unidad base; estas son las que se envian al servidor. */
  itemPendingQtys: number[];
  /** Cantidades pendientes en unidad operativa visible: presentacion fisica o unidad base segun producto. */
  itemDisplayPendingQtys?: number[];
  productName: string;
  unitLabel: string;
  shippedQtyTotal: number;
  pendingQtyTotal: number;
};

export function ReceiveBatchCompactProductLine({
  productId: _productId,
  itemIds,
  itemPendingQtys,
  itemDisplayPendingQtys,
  productName,
  unitLabel,
  shippedQtyTotal,
  pendingQtyTotal,
}: ReceiveBatchCompactProductLineProps) {
  const {
    selected,
    toggle,
    notes,
    setNote,
    setReceiveQty,
    auxCount,
    setAuxCount,
    packageTraceByItemId,
    measurementByItemId,
  } = useReceiveBatchContext();

  const allSelected = itemIds.length > 0 && itemIds.every((id) => selected.has(id));
  const anySelected = itemIds.some((id) => selected.has(id));
  const displayPendingQtys = itemIds.map((_, index) => {
    const displayPending = Number(itemDisplayPendingQtys?.[index] ?? itemPendingQtys[index] ?? 0);
    return Number.isFinite(displayPending) ? displayPending : 0;
  });
  const [partialTotalInput, setPartialTotalInput] = useState<string>("");
  const productPackageTrace: ReceiveBatchPackageTrace[] = itemIds.flatMap((itemId) =>
    (packageTraceByItemId[itemId] ?? []).map((trace): ReceiveBatchPackageTrace => ({
      ...trace,
      itemId,
    }))
  );
  const measurementPolicy = buildProductMeasurementPolicy(itemIds, measurementByItemId, unitLabel);
  const requiresCountAlongsideWeight = itemRequiresAuxCount(measurementPolicy);
  const auxCountUnitCode = normalizeAuxCountUnitCode(measurementPolicy.auxCountUnitCode);
  const quantityFieldLabel = receiveQuantityFieldLabel(measurementPolicy);
  const noteValue = itemIds.length > 0 ? notes[itemIds[0]] ?? "" : "";
  const parsedPartialQty = parseInputNumber(partialTotalInput);
  const isPartialReceipt =
    allSelected && parsedPartialQty !== null && parsedPartialQty < Number(pendingQtyTotal ?? 0);

  const onToggleProduct = (next: boolean) => {
    for (const id of itemIds) toggle(id, next);
    if (!next) {
      setPartialTotalInput("");
      for (const id of itemIds) {
        setReceiveQty(id, "");
        setAuxCount(id, "");
        setNote(id, "");
      }
    }
  };

  const allocatePartialTotalToLines = (rawValue: string) => {
    const manualTotal = parseInputNumber(rawValue);
    if (manualTotal === null) {
      for (const id of itemIds) setReceiveQty(id, "");
      return;
    }

    if (manualTotal < 0) {
      for (const id of itemIds) setReceiveQty(id, "");
      return;
    }

    let remainingDisplay = Math.min(manualTotal, pendingQtyTotal);

    for (let i = 0; i < itemIds.length; i += 1) {
      const id = itemIds[i];
      const lineBasePending = Number(itemPendingQtys[i] ?? 0);
      const lineDisplayPending = Number(displayPendingQtys[i] ?? lineBasePending);
      const displayAlloc = Math.max(0, Math.min(lineDisplayPending, remainingDisplay));
      const baseAlloc =
        lineDisplayPending > 0
          ? roundReceiveQty((displayAlloc / lineDisplayPending) * lineBasePending)
          : roundReceiveQty(displayAlloc);

      setReceiveQty(id, String(baseAlloc));
      remainingDisplay -= displayAlloc;

      if (remainingDisplay <= 0) {
        for (let j = i + 1; j < itemIds.length; j += 1) setReceiveQty(itemIds[j], "0");
        break;
      }
    }
  };

  const allocateAuxCountToLines = (rawValue: string) => {
    const manualTotal = parseInputNumber(rawValue);
    if (manualTotal === null || manualTotal < 0) {
      for (const id of itemIds) setAuxCount(id, "");
      return;
    }

    if (itemIds.length <= 1) {
      if (itemIds[0]) setAuxCount(itemIds[0], String(manualTotal));
      return;
    }

    const totalPending = displayPendingQtys.reduce(
      (sum, qty) => sum + Math.max(0, Number(qty ?? 0)),
      0
    );
    if (totalPending <= 0) {
      for (const id of itemIds) setAuxCount(id, "0");
      return;
    }

    let assigned = 0;
    for (let i = 0; i < itemIds.length; i += 1) {
      const id = itemIds[i];
      const isLast = i === itemIds.length - 1;
      const weight = Math.max(0, Number(displayPendingQtys[i] ?? 0)) / totalPending;
      const alloc = isLast ? Math.max(0, manualTotal - assigned) : Number((manualTotal * weight).toFixed(3));

      setAuxCount(id, String(alloc));
      assigned += alloc;
    }
  };

  return (
    <div
      className={[
        "rounded-xl border bg-white px-3 py-2 shadow-sm transition",
        allSelected ? "border-emerald-200 ring-1 ring-emerald-100" : "border-[var(--ui-border)] opacity-75",
      ].join(" ")}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(116px,160px)] items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onToggleProduct(e.target.checked)}
            className="h-5 w-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
            aria-label={`Incluir ${productName} en recepcion`}
          />
          {anySelected && !allSelected ? (
            <span className="text-[11px] font-semibold text-[var(--ui-muted)]">Parcial</span>
          ) : null}
        </label>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-[var(--ui-text)] sm:text-base">
            {productName}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--ui-muted)] sm:text-xs">
            Enviado: {formatQuickQty(shippedQtyTotal)} {unitLabel} · Pendiente: {formatQuickQty(pendingQtyTotal)} {unitLabel}
          </p>
        </div>

        <label className="block text-right">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            {quantityFieldLabel}
          </span>
          <div className="mt-1 flex items-center justify-end gap-1.5">
            <input
              type="number"
              step="any"
              min={0}
              max={pendingQtyTotal}
              disabled={!allSelected}
              value={partialTotalInput}
              onChange={(event) => {
                const value = event.target.value;
                setPartialTotalInput(value);
                allocatePartialTotalToLines(value);
              }}
              className="h-10 w-20 rounded-lg border border-stone-200 bg-white px-2 text-right text-sm font-semibold tabular-nums text-stone-900 outline-none focus:border-emerald-300 disabled:cursor-not-allowed disabled:bg-stone-50 sm:w-24"
              placeholder={formatQuickQty(pendingQtyTotal)}
            />
            <span className="min-w-[42px] text-left text-xs font-medium text-[var(--ui-muted)]">
              {unitLabel}
            </span>
          </div>
        </label>
      </div>

      {requiresCountAlongsideWeight ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block">
            <span className="text-xs font-semibold text-[var(--ui-muted)]">Conteo auxiliar</span>
            <input
              type="number"
              step="any"
              min={0}
              disabled={!allSelected}
              value={itemIds.length > 0 ? auxCount[itemIds[0]] ?? "" : ""}
              onChange={(event) => allocateAuxCountToLines(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-emerald-300 disabled:cursor-not-allowed disabled:bg-stone-50"
              placeholder={`Ej. 12 ${auxCountUnitCode}`}
            />
          </label>
          <span className="rounded-full bg-stone-50 px-2 py-1 text-xs font-semibold text-stone-600 ring-1 ring-stone-200">
            {auxCountUnitCode}
          </span>
        </div>
      ) : null}

      {isPartialReceipt ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <label className="block text-xs font-semibold text-amber-950">
            Comentario por diferencia
          </label>
          <textarea
            value={noteValue}
            onChange={(event) => {
              const value = event.target.value;
              for (const id of itemIds) setNote(id, value);
            }}
            className="mt-1 w-full resize-none rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-amber-300"
            rows={2}
            placeholder="Ej. llegaron menos unidades, producto incompleto, pendiente por entregar..."
          />
        </div>
      ) : null}

      {productPackageTrace.length > 0 ? (
        <details className="mt-2 text-xs text-sky-950">
          <summary className="cursor-pointer select-none font-semibold text-sky-900">
            Ver trazabilidad FOGO
          </summary>
          <div className="mt-1 space-y-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
            {productPackageTrace.map((trace, index) => (
              <div key={`${trace.itemId ?? "item"}-${trace.packageId}-${index}`}>
                {trace.fractional ? "Fraccion" : "Completo"} · {packageTraceLabel(trace)} ·{" "}
                {formatTraceQty(trace.dispatchQty)} {trace.unitCode}
                {trace.locationLabel ? ` · ${trace.locationLabel}` : ""}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
