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
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 3,
  }).format(numericValue);
}

function packageTraceLabel(trace: ReceiveBatchPackageTrace) {
  const label = String(trace.packageLabel ?? "").trim();
  if (label) return label;

  const packageId = String(trace.packageId ?? "").trim();
  return packageId ? `Empaque ${packageId.slice(0, 8)}` : "Empaque FOGO";
}

function measurementModeLabel(mode: ReceiveBatchMeasurementMode): string {
  if (mode === "variable_weight") return "Peso variable";
  if (mode === "count_with_weight") return "Conteo + peso real";
  if (mode === "bulk_volume") return "Granel / cantidad real";
  return "Presentación fija";
}

function itemRequiresActualReceiptQty(
  policy: ReceiveBatchMeasurementPolicy | null | undefined
): boolean {
  if (!policy) return false;
  if (typeof policy.requiresActualReceiptQty === "boolean") {
    return policy.requiresActualReceiptQty;
  }
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
  return (
    Boolean(policy.requiresCountAlongsideWeight) ||
    policy.measurementMode === "count_with_weight"
  );
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
    policies.find((policy) => itemRequiresActualReceiptQty(policy)) ??
    policies[0] ??
    null;

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
  if (policy.measurementMode === "count_with_weight") return "Peso real recibido";
  if (policy.measurementMode === "variable_weight") return "Cantidad real recibida";
  if (policy.measurementMode === "bulk_volume") return "Cantidad real recibida";
  return "Recibir ahora";
}

function receiveQuantityHelpText(policy: ReceiveBatchMeasurementPolicy, unitLabel: string): string {
  if (policy.measurementMode === "count_with_weight") {
    return `Ingresa el peso real recibido en ${unitLabel}. El conteo auxiliar se registra aparte y no cambia el stock base.`;
  }
  if (policy.measurementMode === "variable_weight") {
    return `Ingresa la cantidad real medida en ${unitLabel}. No se asume que el empaque enviado equivalga exactamente a lo recibido.`;
  }
  if (policy.measurementMode === "bulk_volume") {
    return `Ingresa la cantidad real recibida en ${unitLabel}. El recipiente o empaque es solo referencia logística.`;
  }
  return "Si ingresas una cantidad menor al pendiente, el sistema registra solo lo recibido ahora y deja la diferencia pendiente para seguimiento posterior.";
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
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [receiveQty, setReceiveQtyState] = useState<Record<string, string>>({});
  const [auxCount, setAuxCountState] = useState<Record<string, string>>({});

  const eligibleItemIds = useMemo(
    () => eligibleProductGroups.flatMap((g) => g.itemIds),
    [eligibleProductGroups]
  );

  const eligibleSet = useMemo(() => new Set(eligibleItemIds), [eligibleItemIds]);

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
      <div className="relative max-lg:pb-36">{children}</div>
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
    packageTraceByItemId,
    measurementByItemId,
  } = useReceiveBatchContext();

  const eligibleProductsCount = productGroups.length;
  const selectedProductsCount = productGroups.filter((g) =>
    g.itemIds.every((id) => selected.has(id))
  ).length;

  const selectedPackageTraceCount = [...selected].reduce(
    (acc, itemId) => acc + (packageTraceByItemId[itemId]?.length ?? 0),
    0
  );
  const selectedMissingActualQtyCount = [...selected].filter((itemId) => {
    const policy = measurementByItemId[itemId];
    return itemRequiresActualReceiptQty(policy) && !hasPositiveQuantityInput(receiveQty[itemId]);
  }).length;
  const selectedMissingAuxCount = [...selected].filter((itemId) => {
    const policy = measurementByItemId[itemId];
    return itemRequiresAuxCount(policy) && !hasPositiveQuantityInput(auxCount[itemId]);
  }).length;
  const noEligible = eligibleProductsCount === 0;

  return (
    <div
      className="z-40 flex justify-center px-3 pt-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      role="region"
      aria-label="Confirmación de recepción en bloque"
    >
      <div className="w-full max-w-3xl rounded-xl border border-stone-200/90 bg-[var(--ui-bg)] p-2 shadow-sm ring-1 ring-stone-100/70 sm:p-3 lg:flex lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-semibold text-stone-700">
            {noEligible
              ? "Sin productos pendientes."
              : selectedProductsCount === 0
                ? `${eligibleProductsCount} pendiente${eligibleProductsCount === 1 ? "" : "s"}.`
                : `${selectedProductsCount} seleccionad${selectedProductsCount === 1 ? "o" : "os"}.`}
            {selectedPackageTraceCount > 0 ? (
              <span className="ml-1 text-emerald-700">
                · {selectedPackageTraceCount} empaque{selectedPackageTraceCount === 1 ? "" : "s"} FOGO
              </span>
            ) : null}
          </p>
          {selectedMissingActualQtyCount > 0 ? (
            <p className="text-[11px] font-semibold text-amber-700">
              Falta cantidad real recibida en {selectedMissingActualQtyCount} línea{selectedMissingActualQtyCount === 1 ? "" : "s"}.
            </p>
          ) : null}
          {selectedMissingAuxCount > 0 ? (
            <p className="text-[11px] font-semibold text-amber-700">
              Falta conteo auxiliar en {selectedMissingAuxCount} línea{selectedMissingAuxCount === 1 ? "" : "s"}.
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
                disabled={selectedProductsCount === 0}
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
          {[...selected].map((id) => (
            <span key={id}>
              <input type="hidden" name="batch_receive_item_id" value={id} />
              <input
                type="hidden"
                name="batch_receive_item_note"
                value={notes[id] ?? ""}
              />
              <input
                type="hidden"
                name="batch_receive_item_receive_qty"
                value={receiveQty[id] ?? ""}
              />
              <input
                type="hidden"
                name="batch_receive_item_aux_count"
                value={auxCount[id] ?? ""}
              />
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
              selectedProductsCount === 0 ||
              noEligible ||
              selectedMissingActualQtyCount > 0 ||
              selectedMissingAuxCount > 0
            }
            className="h-10 w-full min-w-[180px] rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-sm font-bold text-white shadow-lg shadow-teal-900/25 transition hover:from-teal-500 hover:to-emerald-500 disabled:cursor-not-allowed disabled:from-stone-300 disabled:to-stone-300 disabled:text-stone-500 disabled:shadow-none lg:w-auto"
          >
            Confirmar llegada
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
  const { selected, toggle, notes, setNote, packageTraceByItemId } = useReceiveBatchContext();
  const isChecked = selected.has(itemId);
  const packageTrace: ReceiveBatchPackageTrace[] = packageTraceByItemId[itemId] ?? [];

  return (
    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-3 shadow-sm">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => toggle(itemId, e.target.checked)}
            className="h-5 w-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
            aria-label={`Incluir ${productName} en recepción`}
          />
        </label>

        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold text-[var(--ui-text)]">
            {productName}
          </p>
        </div>

        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
            Enviado / Pendiente
          </div>
          <div className="text-sm font-bold tabular-nums text-[var(--ui-text)]">
            {shippedQty} · {remainingQty} {unitLabel}
          </div>
        </div>
      </div>

      {packageTrace.length > 0 ? (
        <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
          <div className="font-semibold">Empaques FOGO recibidos</div>
          <div className="mt-1 space-y-1">
            {packageTrace.map((trace, index) => (
              <div key={`${trace.packageId}-${index}`}>
                {trace.fractional ? "Fracción" : "Completo"} · {packageTraceLabel(trace)} ·{" "}
                {formatTraceQty(trace.dispatchQty)} {trace.unitCode}
                {trace.locationLabel ? ` · ${trace.locationLabel}` : ""}
              </div>
            ))}
          </div>
        </div>
      ) : null}


      <details className="mt-2 group">
        <summary className="cursor-pointer list-none select-none text-sm text-[var(--ui-muted)]">
          Nota opcional
        </summary>
        <div className="mt-2">
          <textarea
            disabled={!isChecked}
            value={notes[itemId] ?? ""}
            onChange={(e) => setNote(itemId, e.target.value)}
            className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none focus:border-emerald-300 focus:ring-0 disabled:cursor-not-allowed disabled:bg-stone-50"
            rows={2}
            placeholder="Opcional: incidencias o comentarios…"
          />
        </div>
      </details>
    </div>
  );
}

type ReceiveBatchCompactProductLineProps = {
  productId: string;
  itemIds: string[];
  itemPendingQtys: number[];
  productName: string;
  unitLabel: string;
  shippedQtyTotal: number;
  pendingQtyTotal: number;
};

export function ReceiveBatchCompactProductLine({
  itemIds,
  itemPendingQtys,
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
    receiveQty,
    setReceiveQty,
    auxCount,
    setAuxCount,
    packageTraceByItemId,
    measurementByItemId,
  } = useReceiveBatchContext();

  const allSelected = itemIds.length > 0 && itemIds.every((id) => selected.has(id));
  const anySelected = itemIds.some((id) => selected.has(id));

  const [partialTotalInput, setPartialTotalInput] = useState<string>("");
  const productPackageTrace: ReceiveBatchPackageTrace[] = itemIds.flatMap((itemId) =>
    (packageTraceByItemId[itemId] ?? []).map((trace): ReceiveBatchPackageTrace => ({
      ...trace,
      itemId,
    }))
  );
  const measurementPolicy = buildProductMeasurementPolicy(
    itemIds,
    measurementByItemId,
    unitLabel
  );
  const requiresActualReceiptQty = itemRequiresActualReceiptQty(measurementPolicy);
  const requiresCountAlongsideWeight = itemRequiresAuxCount(measurementPolicy);
  const auxCountUnitCode = normalizeAuxCountUnitCode(measurementPolicy.auxCountUnitCode);
  const quantityFieldLabel = receiveQuantityFieldLabel(measurementPolicy);
  const quantityHelpText = receiveQuantityHelpText(measurementPolicy, unitLabel);

  const onToggleProduct = (next: boolean) => {
    for (const id of itemIds) toggle(id, next);
    if (!next) {
      setPartialTotalInput("");
      for (const id of itemIds) {
        setReceiveQty(id, "");
        setAuxCount(id, "");
      }
    }
  };

  const noteValue = itemIds.length > 0 ? notes[itemIds[0]] ?? "" : "";

  const allocatePartialTotalToLines = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      for (const id of itemIds) setReceiveQty(id, "");
      return;
    }

    const normalized = trimmed.replace(",", ".");
    const manualTotal = Number(normalized);

    if (!Number.isFinite(manualTotal) || manualTotal < 0) {
      for (const id of itemIds) setReceiveQty(id, "");
      return;
    }

    let remaining = Math.min(manualTotal, pendingQtyTotal);

    for (let i = 0; i < itemIds.length; i += 1) {
      const id = itemIds[i];
      const linePending = itemPendingQtys[i] ?? 0;
      const alloc = Math.max(0, Math.min(linePending, remaining));

      setReceiveQty(id, String(alloc));
      remaining -= alloc;

      if (remaining <= 0) {
        for (let j = i + 1; j < itemIds.length; j += 1) {
          setReceiveQty(itemIds[j], "0");
        }
        break;
      }
    }
  };

  const allocateAuxCountToLines = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      for (const id of itemIds) setAuxCount(id, "");
      return;
    }

    const normalized = trimmed.replace(",", ".");
    const manualTotal = Number(normalized);

    if (!Number.isFinite(manualTotal) || manualTotal < 0) {
      for (const id of itemIds) setAuxCount(id, "");
      return;
    }

    if (itemIds.length <= 1) {
      if (itemIds[0]) setAuxCount(itemIds[0], String(manualTotal));
      return;
    }

    const totalPending = itemPendingQtys.reduce((sum, qty) => sum + Math.max(0, Number(qty ?? 0)), 0);
    if (totalPending <= 0) {
      for (const id of itemIds) setAuxCount(id, "0");
      return;
    }

    let assigned = 0;
    for (let i = 0; i < itemIds.length; i += 1) {
      const id = itemIds[i];
      const isLast = i === itemIds.length - 1;
      const weight = Math.max(0, Number(itemPendingQtys[i] ?? 0)) / totalPending;
      const alloc = isLast
        ? Math.max(0, manualTotal - assigned)
        : Number((manualTotal * weight).toFixed(3));

      setAuxCount(id, String(alloc));
      assigned += alloc;
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-3 shadow-sm">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onToggleProduct(e.target.checked)}
            className="h-5 w-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
            aria-label={`Incluir ${productName} en recepción`}
          />
          {anySelected && !allSelected ? (
            <span className="text-[11px] font-semibold text-[var(--ui-muted)]">Parcial</span>
          ) : null}
        </label>

        <div className="min-w-0 text-left">
          <p className="truncate text-base font-semibold leading-snug text-[var(--ui-text)] sm:text-lg">
            {productName}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-600">
              {measurementModeLabel(measurementPolicy.measurementMode)}
            </span>
            {requiresActualReceiptQty ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-800">
                Requiere cantidad real
              </span>
            ) : null}
          </div>
        </div>

        <div className="text-right">
          <div className="space-y-0.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
              Recibir ahora
            </div>
            <div className="text-sm font-bold tabular-nums text-[var(--ui-text)]">
              {pendingQtyTotal} {unitLabel}
            </div>
          </div>
        </div>
      </div>

      {productPackageTrace.length > 0 ? (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">Trazabilidad FOGO</div>
            <div className="font-semibold text-sky-900">
              {productPackageTrace.length} empaque{productPackageTrace.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="mt-2 space-y-1">
            {productPackageTrace.map((trace, index) => (
              <div
                key={`${trace.itemId ?? "item"}-${trace.packageId}-${index}`}
                className="rounded-lg bg-white/80 px-2 py-1"
              >
                <span className="font-semibold">
                  {trace.fractional ? "Fracción" : "Completo"}
                </span>{" "}
                · {packageTraceLabel(trace)} · {formatTraceQty(trace.dispatchQty)} {trace.unitCode}
                {trace.locationLabel ? ` · ${trace.locationLabel}` : ""}
              </div>
            ))}
          </div>
          <p className="mt-2 text-sky-900/75">
            La recepción entra como cantidad base; el origen físico queda trazado desde los empaques de lote.
          </p>
        </div>
      ) : null}

      <details className="mt-2 group">
        <summary className="cursor-pointer list-none select-none text-sm text-[var(--ui-muted)]">
          Nota opcional
        </summary>
        <div className="mt-2">
          <textarea
            disabled={!allSelected}
            value={noteValue}
            onChange={(e) => {
              const v = e.target.value;
              for (const id of itemIds) setNote(id, v);
            }}
            className="w-full resize-none rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none focus:border-emerald-300 focus:ring-0 disabled:cursor-not-allowed disabled:bg-stone-50"
            rows={2}
            placeholder="Opcional: incidencias o comentarios…"
          />
        </div>
      </details>

      {requiresCountAlongsideWeight ? (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <label className="block font-semibold">
            Conteo auxiliar recibido
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              step="any"
              min={0}
              disabled={!allSelected}
              value={itemIds.length > 0 ? auxCount[itemIds[0]] ?? "" : ""}
              onChange={(event) => allocateAuxCountToLines(event.target.value)}
              className="ui-input h-10 flex-1 rounded-xl bg-white disabled:cursor-not-allowed disabled:bg-stone-50"
              placeholder={`Ej. 12 ${auxCountUnitCode}`}
            />
            <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200">
              {auxCountUnitCode}
            </span>
          </div>
          <p className="mt-1">
            Registra las piezas físicas recibidas. El stock contable se guarda por peso real en {unitLabel}.
          </p>
        </div>
      ) : null}

      <details className="mt-2 group" open={requiresActualReceiptQty}>
        <summary className="cursor-pointer list-none select-none text-sm text-[var(--ui-muted)]">
          {requiresActualReceiptQty ? "Registrar cantidad real recibida" : "Registrar llegada parcial"}
        </summary>
        <div className="mt-2">
          <label className="block text-xs font-semibold text-[var(--ui-muted)]">
            {quantityFieldLabel}
          </label>
          <input
            type="number"
            step="any"
            min={0}
            max={pendingQtyTotal}
            disabled={!allSelected}
            value={partialTotalInput}
            onChange={(e) => {
              const v = e.target.value;
              setPartialTotalInput(v);
              allocatePartialTotalToLines(v);
            }}
            className="mt-1 ui-input h-11 w-full rounded-xl disabled:cursor-not-allowed disabled:bg-stone-50"
            placeholder={`${pendingQtyTotal} ${unitLabel}`}
          />
          <p className="mt-1 text-[11px] leading-snug text-stone-500">
            {quantityHelpText}
          </p>
        </div>
      </details>
    </div>
  );
}
