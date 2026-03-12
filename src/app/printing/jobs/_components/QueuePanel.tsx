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
    <div className="ui-panel ui-remission-section">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="ui-h3">Cola de etiquetas</div>
          <div className="mt-1 ui-caption">Una línea por etiqueta.</div>
        </div>
        <div className="flex gap-2">
          <span className="ui-chip">{parsedQueueLength} en cola</span>
          <span className={preset.columns === 3 ? "ui-chip ui-chip--brand" : "ui-chip"}>{preset.columns === 3 ? "3-up" : "1-up"}</span>
        </div>
      </div>
      <textarea
        className="ui-input mt-4 h-64 w-full min-h-0 px-3 py-2 text-sm font-mono"
        placeholder={placeholder}
        value={queueText}
        onChange={(e) => setQueueText(e.target.value)}
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="ui-caption">{preset.columns === 3 ? "Se imprimen filas completas de 3." : "Se imprime una etiqueta por línea."}</div>

        <button
          type="button"
          onClick={() => setQueueText("")}
          className="ui-btn ui-btn--ghost"
        >
          Limpiar cola
        </button>
      </div>

      {preset.columns === 3 ? (
        <div className="mt-2 ui-caption">
          Si no completa un múltiplo de 3, lo restante se queda esperando en cola.
        </div>
      ) : null}
    </div>
  );
}
