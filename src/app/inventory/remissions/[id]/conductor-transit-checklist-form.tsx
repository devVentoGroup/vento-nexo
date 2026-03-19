"use client";

import { useMemo, useState } from "react";

export type ConductorTransitLine = {
  id: string;
  productName: string;
  quantity: number;
  unitLabel: string;
  /** Texto legible de ubicación; UUID solo si no hay metadatos */
  locDetail: string | null;
};

type Props = {
  formAction: (formData: FormData) => void | Promise<void>;
  requestId: string;
  returnOrigin: string;
  siteId: string;
  prepareFingerprint: string;
  lines: ConductorTransitLine[];
  canTransitNow: boolean;
};

export function ConductorTransitChecklistForm({
  formAction,
  requestId,
  returnOrigin,
  siteId,
  prepareFingerprint,
  lines,
  canTransitNow,
}: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const allChecked = useMemo(
    () => lines.length > 0 && lines.every((line) => checked[line.id]),
    [lines, checked]
  );

  const canSubmit = canTransitNow && allChecked;

  return (
    <form action={formAction} className="mt-4 space-y-4 pb-28 sm:pb-8">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="return_origin" value={returnOrigin} />
      <input type="hidden" name="site_id" value={siteId} />
      <input type="hidden" name="prepare_fingerprint" value={prepareFingerprint} />

      {lines.map((line) => {
        const checkId = `transit-check-${line.id}`;
        const isLineChecked = Boolean(checked[line.id]);
        return (
          <div
            key={line.id}
            className="rounded-2xl border-2 border-[var(--ui-border)] bg-[var(--ui-bg)] px-3 py-4 shadow-sm sm:px-4"
          >
            <input type="hidden" name="item_id" value={line.id} />
            <input type="hidden" name="transit_note" value={notes[line.id] ?? ""} />

            <div className="flex items-stretch gap-3 sm:gap-4">
              <label
                htmlFor={checkId}
                className="flex min-h-[3.5rem] min-w-[3.5rem] shrink-0 cursor-pointer select-none items-center justify-center rounded-xl border-2 border-[var(--ui-border)] bg-[var(--ui-bg-soft)] active:scale-[0.98] sm:min-h-[4rem] sm:min-w-[4rem]"
              >
                <input
                  id={checkId}
                  type="checkbox"
                  checked={isLineChecked}
                  onChange={(e) =>
                    setChecked((prev) => ({ ...prev, [line.id]: e.target.checked }))
                  }
                  className="h-8 w-8 cursor-pointer rounded-md border-2 border-[var(--ui-border)] accent-amber-700 sm:h-9 sm:w-9"
                  aria-label={`Verificado: ${line.productName}`}
                />
              </label>

              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold leading-snug tracking-tight text-[var(--ui-text)] sm:text-xl">
                  {line.productName}
                </div>
              </div>

              <div
                className="flex shrink-0 flex-col items-end justify-center rounded-xl bg-[var(--ui-bg-soft)] px-3 py-2 text-right sm:px-4 sm:py-3"
                aria-label={`Cantidad: ${line.quantity} ${line.unitLabel}`}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                  Cantidad
                </span>
                <span className="text-3xl font-bold tabular-nums leading-none text-[var(--ui-text)] sm:text-4xl">
                  {line.quantity}
                </span>
                <span className="mt-1 max-w-[6.5rem] text-right text-sm font-medium leading-tight text-[var(--ui-text)] sm:max-w-[8rem] sm:text-base">
                  {line.unitLabel}
                </span>
              </div>
            </div>

            <details className="mt-3 rounded-xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-bg-soft)]/60 open:border-solid open:bg-[var(--ui-bg-soft)]">
              <summary className="cursor-pointer list-none px-3 py-3 text-base font-semibold leading-snug text-[var(--ui-text)] marker:content-none [&::-webkit-details-marker]:hidden sm:py-3.5 sm:text-lg">
                <span className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span>Nota u observación (opcional)</span>
                  <span className="text-sm font-normal text-[var(--ui-muted)]">
                    Tocar para desplegar u ocultar
                  </span>
                </span>
              </summary>
              <div className="border-t border-[var(--ui-border)] px-3 pb-3 pt-2">
                {line.locDetail ? (
                  <p className="mb-2 text-sm leading-snug text-[var(--ui-muted)] sm:text-base">
                    <span className="font-semibold text-[var(--ui-text)]">Ubicación: </span>
                    {line.locDetail}
                  </p>
                ) : null}
                <textarea
                  value={notes[line.id] ?? ""}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [line.id]: e.target.value }))
                  }
                  className="ui-input min-h-[5.5rem] w-full text-base sm:min-h-[6rem] sm:text-lg"
                  placeholder="Solo si necesitas dejar un comentario sobre esta línea…"
                  rows={3}
                />
              </div>
            </details>
          </div>
        );
      })}

      <div className="sticky bottom-0 z-10 -mx-1 border-t border-[var(--ui-border)] bg-[var(--ui-bg)]/95 px-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <button
          type="submit"
          className="ui-btn ui-btn--action h-14 w-full px-6 text-lg font-bold sm:h-12 sm:w-auto sm:text-base"
          disabled={!canSubmit}
        >
          Poner en tránsito
        </button>
        {!canTransitNow ? (
          <p className="mt-2 text-base text-[var(--ui-muted)] sm:text-sm">
            Aún no está lista para tránsito: completa la preparación en todas las líneas.
          </p>
        ) : !allChecked ? (
          <p className="mt-2 text-base font-medium text-[var(--ui-text)] sm:text-sm">
            Marca cada producto como verificado para habilitar el envío.
          </p>
        ) : null}
      </div>
    </form>
  );
}
