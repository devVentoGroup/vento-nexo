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

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ChevronGlyph({ open, className }: { open?: boolean; className?: string }) {
  return (
    <svg
      className={`${className ?? ""} transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

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
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});

  const allChecked = useMemo(
    () => lines.length > 0 && lines.every((line) => checked[line.id]),
    [lines, checked]
  );

  const canSubmit = canTransitNow && allChecked;

  return (
    <form action={formAction} className="mt-5 space-y-5 pb-28 sm:pb-8">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="return_origin" value={returnOrigin} />
      <input type="hidden" name="site_id" value={siteId} />
      <input type="hidden" name="prepare_fingerprint" value={prepareFingerprint} />

      {lines.map((line) => {
        const checkId = `transit-check-${line.id}`;
        const isLineChecked = Boolean(checked[line.id]);
        const detailsOpen = Boolean(openDetails[line.id]);

        return (
          <div
            key={line.id}
            className={[
              "relative overflow-hidden rounded-2xl border transition-[box-shadow,border-color,transform] duration-300 sm:rounded-3xl",
              isLineChecked
                ? "border-amber-300/60 bg-gradient-to-br from-amber-50/90 via-white to-stone-50/80 shadow-[0_12px_40px_-12px_rgba(180,83,9,0.22)] ring-1 ring-amber-200/50"
                : "border-stone-200/90 bg-white shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08)] hover:border-stone-300 hover:shadow-[0_8px_32px_-10px_rgba(15,23,42,0.12)]",
            ].join(" ")}
          >
            {/* Acento lateral sutil */}
            <div
              className={[
                "absolute bottom-0 left-0 top-0 w-1 rounded-l-2xl sm:rounded-l-3xl transition-colors duration-300",
                isLineChecked ? "bg-gradient-to-b from-amber-400 to-amber-600" : "bg-stone-200/80",
              ].join(" ")}
              aria-hidden
            />

            <input type="hidden" name="item_id" value={line.id} />
            <input type="hidden" name="transit_note" value={notes[line.id] ?? ""} />

            <div className="flex items-center gap-3 pl-4 pr-3 py-4 sm:gap-5 sm:pl-5 sm:pr-4 sm:py-5">
              {/* Checkbox: un solo control circular, sin caja anidada */}
              <label
                htmlFor={checkId}
                className="relative flex shrink-0 cursor-pointer select-none [-webkit-tap-highlight-color:transparent]"
              >
                <input
                  id={checkId}
                  type="checkbox"
                  checked={isLineChecked}
                  onChange={(e) =>
                    setChecked((prev) => ({ ...prev, [line.id]: e.target.checked }))
                  }
                  className="peer sr-only"
                  aria-label={`Marcar como verificado: ${line.productName}`}
                />
                <span
                  className={[
                    "flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full border-[3px] transition-all duration-300 sm:h-14 sm:w-14",
                    "border-stone-300 bg-white shadow-inner shadow-stone-900/[0.04]",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400 peer-focus-visible:ring-offset-2",
                    "peer-active:scale-95",
                    "peer-checked:border-amber-500 peer-checked:bg-gradient-to-br peer-checked:from-amber-500 peer-checked:to-amber-600 peer-checked:shadow-lg peer-checked:shadow-amber-600/25",
                  ].join(" ")}
                >
                  <CheckGlyph
                    className={`h-7 w-7 text-white transition-all duration-200 sm:h-8 sm:w-8 ${
                      isLineChecked ? "scale-100 opacity-100" : "scale-50 opacity-0"
                    }`}
                  />
                </span>
              </label>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-bold leading-snug tracking-tight text-stone-900 sm:text-xl">
                    {line.productName}
                  </p>
                  {isLineChecked ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-900/90">
                      Listo
                    </span>
                  ) : null}
                </div>
                {!isLineChecked ? (
                  <p className="mt-1 text-sm text-stone-500 sm:text-base">
                    Toca el círculo para marcar como revisado
                  </p>
                ) : null}
              </div>

              {/* Cantidad: chip compacto, no “caja dentro de caja” */}
              <div
                className={[
                  "flex shrink-0 flex-col items-center justify-center rounded-2xl px-3 py-2.5 text-center sm:rounded-3xl sm:px-4 sm:py-3",
                  isLineChecked
                    ? "bg-white/80 ring-1 ring-amber-200/60"
                    : "bg-stone-100/90 ring-1 ring-stone-200/80",
                ].join(" ")}
                aria-label={`Cantidad: ${line.quantity} ${line.unitLabel}`}
              >
                <span className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-stone-400 sm:text-xs">
                  Cant.
                </span>
                <span className="mt-0.5 text-3xl font-bold tabular-nums leading-none text-stone-900 sm:text-4xl">
                  {line.quantity}
                </span>
                <span className="mt-1 max-w-[5.5rem] text-center text-xs font-medium leading-tight text-stone-600 sm:max-w-[7rem] sm:text-sm">
                  {line.unitLabel}
                </span>
              </div>
            </div>

            {/* Notas: barra inferior integrada a la tarjeta */}
            <div className="border-t border-stone-100/90 bg-stone-50/50">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-stone-100/80 sm:px-5 sm:py-4"
                onClick={() =>
                  setOpenDetails((prev) => ({ ...prev, [line.id]: !prev[line.id] }))
                }
                aria-expanded={detailsOpen}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-stone-500 shadow-sm ring-1 ring-stone-200/80">
                    <ChevronGlyph open={detailsOpen} className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-base font-semibold text-stone-800 sm:text-lg">
                      Nota u observación
                    </span>
                    <span className="text-sm text-stone-500">Opcional · ubicación y comentarios</span>
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-500 ring-1 ring-stone-200/80 sm:text-sm">
                  {detailsOpen ? "Cerrar" : "Abrir"}
                </span>
              </button>

              {detailsOpen ? (
                <div className="space-y-3 border-t border-stone-100/90 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
                  {line.locDetail ? (
                    <div className="rounded-xl bg-white px-3.5 py-3 text-sm leading-relaxed text-stone-600 shadow-sm ring-1 ring-stone-200/70 sm:text-base">
                      <span className="font-semibold text-stone-800">Ubicación · </span>
                      {line.locDetail}
                    </div>
                  ) : null}
                  <textarea
                    value={notes[line.id] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [line.id]: e.target.value }))
                    }
                    className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-base text-stone-900 shadow-sm outline-none ring-0 transition-shadow placeholder:text-stone-400 focus:border-amber-300 focus:shadow-[0_0_0_3px_rgba(251,191,36,0.2)] sm:min-h-[6rem] sm:px-4 sm:py-3.5 sm:text-lg"
                    placeholder="Comentario del conductor para esta línea…"
                    rows={3}
                  />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      <div className="sticky bottom-0 z-10 -mx-1 border-t border-stone-200/80 bg-[var(--ui-bg)]/95 px-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-md sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <button
          type="submit"
          disabled={!canSubmit}
          className={[
            "h-14 w-full rounded-2xl px-6 text-lg font-bold tracking-tight shadow-lg transition-all duration-200 sm:h-[3.25rem] sm:w-auto sm:rounded-xl sm:px-10 sm:text-base",
            canSubmit
              ? "bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-amber-600/30 hover:from-amber-500 hover:to-amber-400 hover:shadow-xl hover:shadow-amber-500/25 active:scale-[0.99]"
              : "cursor-not-allowed bg-stone-200 text-stone-500 shadow-none",
          ].join(" ")}
        >
          Poner en tránsito
        </button>
        {!canTransitNow ? (
          <p className="mt-3 text-base text-stone-500 sm:text-sm">
            Aún no está lista para tránsito: completa la preparación en todas las líneas.
          </p>
        ) : !allChecked ? (
          <p className="mt-3 text-base font-medium text-stone-700 sm:text-sm">
            Marca cada producto como verificado para habilitar el envío.
          </p>
        ) : null}
      </div>
    </form>
  );
}
