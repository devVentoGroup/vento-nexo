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
  children: ReactNode;
};

export function ReceiveBatchShell({
  requestId,
  returnOrigin,
  siteId,
  eligibleProductGroups,
  children,
}: ReceiveBatchShellProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [receiveQty, setReceiveQtyState] = useState<Record<string, string>>({});

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
  const { selected, productGroups, selectAllEligible, clearSelection, notes, receiveQty } =
    useReceiveBatchContext();

  const eligibleProductsCount = productGroups.length;
  const selectedProductsCount = productGroups.filter((g) =>
    g.itemIds.every((id) => selected.has(id))
  ).length;

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
          </p>
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
            </span>
          ))}
          <button
            type="submit"
            disabled={selectedProductsCount === 0 || noEligible}
            className="h-10 w-full min-w-[180px] rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-sm font-bold text-white shadow-lg shadow-teal-900/25 transition hover:from-teal-500 hover:to-emerald-500 disabled:cursor-not-allowed disabled:from-stone-300 disabled:to-stone-300 disabled:text-stone-500 disabled:shadow-none lg:w-auto"
          >
            Registrar recepción
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
  const { selected, toggle, notes, setNote } = useReceiveBatchContext();
  const isChecked = selected.has(itemId);

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
  itemShippedQtys: number[];
  productName: string;
  unitLabel: string;
  shippedQtyTotal: number;
  pendingQtyTotal: number;
};

export function ReceiveBatchCompactProductLine({
  itemIds,
  itemShippedQtys,
  productName,
  unitLabel,
  shippedQtyTotal,
  pendingQtyTotal,
}: ReceiveBatchCompactProductLineProps) {
  const { selected, toggle, notes, setNote, receiveQty, setReceiveQty } =
    useReceiveBatchContext();

  const allSelected = itemIds.length > 0 && itemIds.every((id) => selected.has(id));
  const anySelected = itemIds.some((id) => selected.has(id));

  const [partialTotalInput, setPartialTotalInput] = useState<string>("");

  const onToggleProduct = (next: boolean) => {
    for (const id of itemIds) toggle(id, next);
    if (!next) {
      setPartialTotalInput("");
      for (const id of itemIds) setReceiveQty(id, "");
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

    let remaining = manualTotal;
    for (let i = 0; i < itemIds.length; i += 1) {
      const id = itemIds[i];
      const lineShipped = itemShippedQtys[i] ?? 0;
      const alloc = Math.max(0, Math.min(lineShipped, remaining));
      setReceiveQty(id, String(alloc));
      remaining -= alloc;
      if (remaining <= 0) {
        // En esta línea ya no hay restante: lo demás queda en 0.
        for (let j = i + 1; j < itemIds.length; j += 1) {
          setReceiveQty(itemIds[j], "0");
        }
        break;
      }
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

      <details className="mt-2 group">
        <summary className="cursor-pointer list-none select-none text-sm text-[var(--ui-muted)]">
          Recibir parcial (opcional)
        </summary>
        <div className="mt-2">
          <label className="block text-xs font-semibold text-[var(--ui-muted)]">
            Recibir ahora
          </label>
          <input
            type="number"
            step="any"
            min={0}
            max={shippedQtyTotal}
            disabled={!allSelected}
            value={partialTotalInput}
            onChange={(e) => {
              const v = e.target.value;
              setPartialTotalInput(v);
              allocatePartialTotalToLines(v);
            }}
            className="mt-1 ui-input h-11 w-full rounded-xl disabled:cursor-not-allowed disabled:bg-stone-50"
            placeholder={`${shippedQtyTotal} ${unitLabel}`}
          />
          <p className="mt-1 text-[11px] leading-snug text-stone-500">
            Si pones un valor menor, el sistema registra faltante automático para el producto.
          </p>
        </div>
      </details>
    </div>
  );
}
