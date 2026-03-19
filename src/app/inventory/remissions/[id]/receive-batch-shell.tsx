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
      <div className="relative pb-36 lg:pb-32">{children}</div>
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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:px-8"
      role="region"
      aria-label="Confirmación de recepción en bloque"
    >
      <div className="pointer-events-auto w-full max-w-5xl rounded-2xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50 via-white to-teal-50/90 p-4 shadow-[0_-12px_40px_-12px_rgba(5,80,60,0.35)] ring-1 ring-emerald-100/80 sm:p-5 lg:flex lg:items-center lg:justify-between lg:gap-8">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-bold text-emerald-950 lg:text-base">Recepción en bloque</p>
          <p className="text-sm leading-snug text-stone-600">
            {noEligible ? (
              "No hay líneas pendientes de conciliar."
            ) : n === 0 ? (
              <>
                Marca cada producto con la casilla cuando lo hayas verificado físicamente.{" "}
                <strong className="text-stone-800">Nada se guarda en el servidor</strong> hasta que
                pulses <strong className="text-stone-800">Registrar recepción</strong> (
                {eligibleCount} pendiente{eligibleCount === 1 ? "" : "s"}).
              </>
            ) : (
              <>
                Vas a confirmar <strong className="text-stone-800">{n}</strong> línea
                {n === 1 ? "" : "s"} como recibidas al 100% del envío. Revisa antes de enviar.
              </>
            )}
          </p>
          {!noEligible ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50"
                onClick={selectAllEligible}
              >
                Marcar todas
              </button>
              <button
                type="button"
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={clearSelection}
                disabled={n === 0}
              >
                Limpiar selección
              </button>
            </div>
          ) : null}
        </div>
        <form
          action={applyReceiveBatchConfirm}
          className="mt-4 flex w-full shrink-0 flex-col gap-2 lg:mt-0 lg:w-auto lg:items-end"
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
            className="h-12 w-full min-w-[220px] rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 text-base font-bold text-white shadow-lg shadow-teal-900/25 transition hover:from-teal-500 hover:to-emerald-500 disabled:cursor-not-allowed disabled:from-stone-300 disabled:to-stone-300 disabled:text-stone-500 disabled:shadow-none lg:w-auto"
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
    <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-5">
      {batchEligible ? (
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-emerald-200/90 bg-emerald-50/45 px-4 py-3 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/80 lg:w-52 lg:flex-col lg:items-start lg:justify-center lg:py-4">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => toggle(itemId, e.target.checked)}
            className="h-5 w-5 shrink-0 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm font-bold leading-snug text-emerald-950">Incluir al confirmar</span>
          <span className="text-xs font-medium leading-snug text-emerald-900/75 lg:text-[11px]">
            Solo en esta pantalla hasta registrar.
          </span>
        </label>
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
