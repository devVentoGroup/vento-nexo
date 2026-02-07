"use client";

import type { Preset } from "../_lib/types";

export type QueuePanelProps = {
  preset: Preset;
  queueText: string;
  setQueueText: (s: string) => void;
  parsedQueueLength: number;
};

export function QueuePanel({
  preset,
  queueText,
  setQueueText,
  parsedQueueLength,
}: QueuePanelProps) {
  const placeholder =
    preset.defaultType === "LOC"
      ? "Formato: LOC|DESCRIPCIÓN (o solo LOC)\nEj:\nLOC-VGR-OFI-01-N0|TODA LA NAVIDAD"
      : preset.defaultType === "PROD"
        ? "Formato: LOTE|PRODUCTO - Prod YYYY-MM-DD - Exp YYYY-MM-DD\nEj:\nPB-20260118-0001|PAN BURGER - Prod 2026-01-18 - Exp 2026-01-20"
        : "Formato: CODE|NOTA (o solo CODE)\nEj (3-up):\nSKU-0001|PIZZA\nSKU-0002|PIZZA\nSKU-0003|PIZZA";

  return (
    <div className="ui-panel">
      <div className="ui-h3">Cola de etiquetas</div>
      <p className="mt-1 ui-body-muted">
        Lista de etiquetas a imprimir (una por línea). Para ubicaciones LOC, usa el selector de la
        izquierda.
      </p>
      <textarea
        className="mt-4 h-64 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
        placeholder={placeholder}
        value={queueText}
        onChange={(e) => setQueueText(e.target.value)}
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="ui-caption">
          Total en cola: {parsedQueueLength}.{" "}
          {preset.columns === 3
            ? "Este preset imprime en filas de 3 (3-up)."
            : "Este preset imprime 1-up."}
        </div>

        <button
          type="button"
          onClick={() => setQueueText("")}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 ui-caption font-semibold"
        >
          Limpiar cola
        </button>
      </div>

      {preset.columns === 3 ? (
        <div className="mt-2 ui-caption">
          Si en cola no hay múltiplos de 3, se imprimen solo filas completas y lo restante queda
          esperando.
        </div>
      ) : null}
    </div>
  );
}
