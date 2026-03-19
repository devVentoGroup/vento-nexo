"use client";

import { useMemo, useState } from "react";

type LocOption = {
  id: string;
  label: string;
  qty: number;
};

type DraftLine = {
  id: string;
  baseItemId: string;
  productName: string;
  requestedQty: number;
  unitLabel: string;
  selectedLocId: string;
  recommendedLocId: string;
  locOptions: LocOption[];
  dispatchQty: number;
  shortageReason: string;
  isVirtualSplit: boolean;
};

type SplitDraft = {
  tempLineId: string;
  sourceItemId: string;
  splitQuantity: number;
};

type PrepareWorkbenchProps = {
  requestId: string;
  returnOrigin: "" | "prepare";
  siteId: string;
  lines: DraftLine[];
  onCommit: (formData: FormData) => void | Promise<void>;
};

function roundQty(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseQty(value: string, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? roundQty(n) : fallback;
}

function getLineTone(line: DraftLine) {
  if (!line.selectedLocId) return "pending";
  if (line.dispatchQty < 0 || line.dispatchQty > line.requestedQty) return "error";
  if (line.dispatchQty < line.requestedQty && !line.shortageReason.trim()) return "warn";
  return "ok";
}

function getLineToneLabel(tone: "pending" | "warn" | "error" | "ok") {
  if (tone === "ok") return "Lista";
  if (tone === "error") return "Cantidad inválida";
  if (tone === "warn") return "Faltante sin motivo";
  return "Pendiente";
}

export function RemissionPrepareWorkbench({
  requestId,
  returnOrigin,
  siteId,
  lines: initialLines,
  onCommit,
}: PrepareWorkbenchProps) {
  const [lines, setLines] = useState<DraftLine[]>(initialLines);
  const [splitDrafts, setSplitDrafts] = useState<SplitDraft[]>([]);
  const [readyMarked, setReadyMarked] = useState(false);
  const [splitTargetId, setSplitTargetId] = useState<string>("");
  const [splitQtyInput, setSplitQtyInput] = useState<string>("");

  const splitTarget = useMemo(
    () => lines.find((line) => line.id === splitTargetId) ?? null,
    [lines, splitTargetId]
  );

  const blockers = useMemo(() => {
    const missingLoc = lines.filter((line) => !line.selectedLocId).length;
    const invalidQty = lines.filter(
      (line) => line.dispatchQty < 0 || line.dispatchQty > line.requestedQty
    ).length;
    const missingReason = lines.filter(
      (line) => line.dispatchQty < line.requestedQty && !line.shortageReason.trim()
    ).length;
    return { missingLoc, invalidQty, missingReason };
  }, [lines]);

  const allReady =
    blockers.missingLoc === 0 && blockers.invalidQty === 0 && blockers.missingReason === 0;

  const progress = useMemo(() => {
    const done = lines.filter((line) => {
      if (!line.selectedLocId) return false;
      if (line.dispatchQty < 0 || line.dispatchQty > line.requestedQty) return false;
      if (line.dispatchQty < line.requestedQty && !line.shortageReason.trim()) return false;
      return true;
    }).length;
    return { done, total: lines.length };
  }, [lines]);

  const updateLine = (lineId: string, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    );
    setReadyMarked(false);
  };

  const openSplit = (lineId: string) => {
    const line = lines.find((entry) => entry.id === lineId);
    if (!line) return;
    setSplitTargetId(lineId);
    setSplitQtyInput(String(Math.max(1, Math.floor(line.requestedQty / 2))));
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
    };

    setLines((prev) => {
      const next = prev.map((line) =>
        line.id === splitTarget.id
          ? { ...line, requestedQty: remainingQty, dispatchQty: Math.min(line.dispatchQty, remainingQty) }
          : line
      );
      const insertIndex = next.findIndex((line) => line.id === splitTarget.id);
      next.splice(insertIndex + 1, 0, virtualLine);
      return next;
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
    setReadyMarked(false);
  };

  const payload = JSON.stringify({
    lines: lines.map((line) => ({
      id: line.id,
      baseItemId: line.baseItemId,
      selectedLocId: line.selectedLocId,
      dispatchQty: line.dispatchQty,
      requestedQty: line.requestedQty,
      shortageReason: line.shortageReason.trim(),
      isVirtualSplit: line.isVirtualSplit,
    })),
    splitDrafts,
  });

  return (
    <>
      <div className="mb-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-3">
        <div className="text-sm font-semibold text-[var(--ui-text)]">Preparación operativa</div>
        <div className="mt-1 text-xs text-[var(--ui-muted)]">
          Selecciona LOC, define cantidad a despachar y registra motivo si hay faltante. Nada cambia estado hasta confirmar tránsito.
        </div>
      </div>

      <div className="space-y-3">
        {lines.map((line) => {
          const hasShortage = line.dispatchQty < line.requestedQty;
          const tone = getLineTone(line);
          return (
            <div
              key={line.id}
              className={`rounded-xl border p-4 ${
                tone === "ok"
                  ? "border-emerald-300 bg-emerald-50/50"
                  : tone === "warn"
                    ? "border-amber-300 bg-amber-50/40"
                    : tone === "error"
                      ? "border-rose-300 bg-rose-50/40"
                      : "border-[var(--ui-border)] bg-[var(--ui-bg)]"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--ui-text)]">{line.productName}</div>
                  <div className="text-xs text-[var(--ui-muted)]">
                    Solicitado: {line.requestedQty} {line.unitLabel}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
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

              {line.recommendedLocId ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
                  <span className="text-emerald-900">LOC recomendado:</span>
                  <strong className="text-emerald-950">
                    {line.locOptions.find((loc) => loc.id === line.recommendedLocId)?.label ??
                      line.recommendedLocId}
                  </strong>
                  <button
                    type="button"
                    className="text-xs font-semibold text-emerald-900 underline"
                    onClick={() => updateLine(line.id, { selectedLocId: line.recommendedLocId })}
                  >
                    Usar recomendado
                  </button>
                </div>
              ) : null}

              <div className="mt-3 grid gap-3 md:grid-cols-12">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--ui-muted)]">LOC</span>
                  <select
                    value={line.selectedLocId}
                    onChange={(e) => updateLine(line.id, { selectedLocId: e.target.value })}
                    className="ui-input h-11 md:col-span-6"
                  >
                    <option value="">Selecciona LOC</option>
                    {line.locOptions.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.label} · {loc.qty} {line.unitLabel}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--ui-muted)]">Cantidad a despachar</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    max={line.requestedQty}
                    value={line.dispatchQty}
                    onChange={(e) =>
                      updateLine(line.id, {
                        dispatchQty: parseQty(e.target.value, 0),
                      })
                    }
                    className="ui-input h-11"
                  />
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => openSplit(line.id)}
                    className="ui-btn ui-btn--ghost h-11 w-full text-sm font-semibold"
                    disabled={line.isVirtualSplit || line.dispatchQty > 0}
                  >
                    Partir línea
                  </button>
                </div>
              </div>

              {hasShortage ? (
                <label className="mt-3 flex flex-col gap-1">
                  <span className="text-xs font-semibold text-amber-900">
                    Motivo del faltante (obligatorio)
                  </span>
                  <textarea
                    value={line.shortageReason}
                    onChange={(e) => updateLine(line.id, { shortageReason: e.target.value })}
                    className="ui-input min-h-[70px]"
                    placeholder="Ejemplo: LOC sin stock suficiente, producto incompleto, merma detectada..."
                  />
                </label>
              ) : null}
            </div>
          );
        })}
      </div>

      {splitTarget ? (
        <div className="fixed inset-0 z-50 bg-black/30 px-4 py-8">
          <div className="mx-auto max-w-lg rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)] p-4">
            <div className="text-lg font-semibold text-[var(--ui-text)]">Partir línea</div>
            <div className="mt-2 text-sm text-[var(--ui-muted)]">
              {splitTarget.productName} · Solicitado {splitTarget.requestedQty} {splitTarget.unitLabel}
            </div>
            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs text-[var(--ui-muted)]">Cantidad para nueva línea</span>
              <input
                type="number"
                min={0}
                max={Math.max(splitTarget.requestedQty - 0.01, 0)}
                step="0.01"
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
                Aplicar partición
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--ui-border)] bg-[var(--ui-bg)]/98 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-[var(--ui-text)]">
            <strong>{progress.done}/{progress.total}</strong> líneas listas
            {blockers.missingLoc > 0 ? ` · ${blockers.missingLoc} sin LOC` : ""}
            {blockers.invalidQty > 0 ? ` · ${blockers.invalidQty} qty inválida` : ""}
            {blockers.missingReason > 0 ? ` · ${blockers.missingReason} sin motivo` : ""}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setReadyMarked(allReady)}
              className={`ui-btn h-11 px-4 text-sm font-semibold ${
                readyMarked ? "ui-btn--action" : "ui-btn--ghost"
              }`}
            >
              {readyMarked ? "Lista para despacho" : "Marcar lista para despacho"}
            </button>
            <form action={onCommit}>
              <input type="hidden" name="request_id" value={requestId} />
              <input type="hidden" name="return_origin" value={returnOrigin} />
              <input type="hidden" name="site_id" value={siteId} />
              <input type="hidden" name="payload" value={payload} />
              <button
                type="submit"
                className="ui-btn ui-btn--action h-11 px-4 text-sm font-semibold"
                disabled={!readyMarked || !allReady}
              >
                Poner en tránsito
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

