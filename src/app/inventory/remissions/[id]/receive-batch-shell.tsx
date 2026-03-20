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
  selectAllEligible: () => void;
  clearSelection: () => void;
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
  eligibleItemIds: string[];
  children: ReactNode;
};

export function ReceiveBatchShell({
  requestId,
  returnOrigin,
  siteId,
  eligibleItemIds,
  children,
}: ReceiveBatchShellProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

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

  const ctxValue = useMemo<ReceiveBatchContextValue>(
    () => ({
      selected,
      toggle,
      eligibleIds: eligibleItemIds,
      selectAllEligible,
      clearSelection,
    }),
    [selected, toggle, eligibleItemIds, selectAllEligible, clearSelection]
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
  const { selected, eligibleIds, selectAllEligible, clearSelection } = useReceiveBatchContext();
  const n = selected.size;
  const eligibleCount = eligibleIds.length;
  const noEligible = eligibleCount === 0;

  return (
    <div
      className="z-40 flex justify-center px-3 pt-2 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      role="region"
      aria-label="Confirmación de recepción en bloque"
    >
      <div className="w-full max-w-3xl rounded-xl border border-stone-200/90 bg-[var(--ui-bg)] p-3 shadow-sm ring-1 ring-stone-100/70 sm:p-4 lg:flex lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-bold text-stone-900">Recepción en bloque</p>
          <p className="text-xs leading-snug text-stone-600 sm:text-sm">
            {noEligible
              ? "No hay líneas pendientes de conciliar."
              : n === 0
                ? "Marca las líneas con la casilla. Nada se guarda hasta Registrar recepción."
                : `Confirmarás ${n} línea${n === 1 ? "" : "s"} al 100%.`}
          </p>
          {!noEligible ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="rounded-lg border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50"
                onClick={selectAllEligible}
              >
                Marcar todas
              </button>
              <button
                type="button"
                className="rounded-lg border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={clearSelection}
                disabled={n === 0}
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
            <input key={id} type="hidden" name="batch_receive_item_id" value={id} />
          ))}
          <button
            type="submit"
            disabled={n === 0 || noEligible}
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
