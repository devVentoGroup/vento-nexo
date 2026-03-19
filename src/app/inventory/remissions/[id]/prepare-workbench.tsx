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
  manualLocked?: boolean;
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

function clampQty(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function suggestedQtyForLoc(line: DraftLine, locId: string) {
  const loc = line.locOptions.find((entry) => entry.id === locId);
  const available = Number(loc?.qty ?? 0);
  return roundQty(clampQty(available, 0, line.requestedQty));
}

function applySmartAllocation(inputLines: DraftLine[], preserveManual: boolean): DraftLine[] {
  const lines = inputLines.map((line) => ({ ...line }));
  const byProduct = new Map<string, DraftLine[]>();

  for (const line of lines) {
    const key = `${line.productName}__${line.unitLabel}`;
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key)!.push(line);
  }

  for (const [, productLines] of byProduct) {
    const locRemaining = new Map<string, number>();
    for (const line of productLines) {
      for (const loc of line.locOptions) {
        const current = Number(locRemaining.get(loc.id) ?? 0);
        if (loc.qty > current) locRemaining.set(loc.id, Number(loc.qty));
      }
    }

    if (preserveManual) {
      for (const line of productLines) {
        if (!line.manualLocked || !line.selectedLocId) continue;
        const current = Number(locRemaining.get(line.selectedLocId) ?? 0);
        const reserved = roundQty(
          clampQty(Number(line.dispatchQty ?? 0), 0, Number(line.requestedQty ?? 0))
        );
        locRemaining.set(line.selectedLocId, roundQty(Math.max(0, current - reserved)));
      }
    }

    const autoLines = productLines
      .filter((line) => !(preserveManual && line.manualLocked))
      .sort((a, b) => Number(b.requestedQty) - Number(a.requestedQty));

    for (const line of autoLines) {
      const ranked = line.locOptions
        .map((loc) => {
          const remaining = Number(locRemaining.get(loc.id) ?? 0);
          const alloc = roundQty(Math.min(remaining, Number(line.requestedQty)));
          const shortage = roundQty(Math.max(0, Number(line.requestedQty) - alloc));
          const slack = roundQty(Math.max(0, remaining - alloc));
          return { locId: loc.id, remaining, alloc, shortage, slack };
        })
        .sort((a, b) => {
          if (a.shortage !== b.shortage) return a.shortage - b.shortage;
          if (a.slack !== b.slack) return a.slack - b.slack;
          return b.remaining - a.remaining;
        });

      const best = ranked[0];
      if (!best || best.remaining <= 0) {
        line.selectedLocId = "";
        line.dispatchQty = 0;
        continue;
      }

      line.selectedLocId = best.locId;
      line.dispatchQty = best.alloc;
      if (best.alloc >= line.requestedQty) line.shortageReason = "";
      locRemaining.set(best.locId, roundQty(Math.max(0, best.remaining - best.alloc)));
    }
  }

  return lines.map((line) => normalizeLine(line));
}

function normalizeLine(line: DraftLine): DraftLine {
  const selectedLocId = line.selectedLocId || line.recommendedLocId || "";
  let dispatchQty = roundQty(Number(line.dispatchQty ?? 0));

  if (!selectedLocId) {
    dispatchQty = roundQty(clampQty(dispatchQty, 0, line.requestedQty));
    return { ...line, selectedLocId, dispatchQty };
  }

  const suggestedQty = suggestedQtyForLoc(line, selectedLocId);
  if (dispatchQty <= 0) {
    dispatchQty = suggestedQty;
  } else {
    dispatchQty = roundQty(clampQty(dispatchQty, 0, line.requestedQty));
  }

  return { ...line, selectedLocId, dispatchQty };
}

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

/** Una línea se puede partir en dos ítems (otro LOC) si hay más de 1 unidad solicitada y no es la fila hija recién creada en el borrador. */
function canSplitDraftLine(line: DraftLine): boolean {
  if (line.isVirtualSplit) return false;
  return roundQty(line.requestedQty) > 1;
}

function maxLocQtyForLine(line: DraftLine): number {
  let m = 0;
  for (const loc of line.locOptions) {
    m = Math.max(m, roundQty(Number(loc.qty ?? 0)));
  }
  return roundQty(m);
}

function sumLocQtyForLine(line: DraftLine): number {
  return roundQty(line.locOptions.reduce((acc, loc) => acc + Number(loc.qty ?? 0), 0));
}

/**
 * Ningún LOC tiene stock suficiente para el pedido solo, pero la suma entre LOCs sí alcanza.
 * Indica que conviene partir la línea en lugar de forzar faltante en un solo LOC.
 */
function needsMultilocSplitHint(line: DraftLine): boolean {
  if (!canSplitDraftLine(line)) return false;
  const rq = roundQty(line.requestedQty);
  if (rq <= 1 || !line.locOptions.length) return false;
  const maxQ = maxLocQtyForLine(line);
  const sumQ = sumLocQtyForLine(line);
  return maxQ < rq && sumQ >= rq;
}

/** Cantidad sugerida para la nueva línea: lo que cubre el LOC más lleno (típico 6+4 cuando el máximo en un LOC es 6). */
function suggestedSplitQtyForMultiloc(line: DraftLine): number {
  const rq = roundQty(line.requestedQty);
  const maxQ = maxLocQtyForLine(line);
  const minRemainder = 0.01;
  if (maxQ > 0 && maxQ < rq && roundQty(rq - maxQ) >= minRemainder) {
    return maxQ;
  }
  const half = roundQty(rq / 2);
  if (half > 0 && half < rq) return half;
  return Math.max(1, Math.floor(rq / 2));
}

export function RemissionPrepareWorkbench({
  requestId,
  returnOrigin,
  siteId,
  lines: initialLines,
  onCommit,
}: PrepareWorkbenchProps) {
  const [lines, setLines] = useState<DraftLine[]>(() =>
    applySmartAllocation(initialLines.map((line) => normalizeLine(line)), false)
  );
  const [splitDrafts, setSplitDrafts] = useState<SplitDraft[]>([]);
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
    setLines((prev) => {
      const patched = prev.map((line) => {
        if (line.id !== lineId) return line;
        const next = { ...line, ...patch, manualLocked: true };
        if (Object.prototype.hasOwnProperty.call(patch, "selectedLocId")) {
          const selectedLocId = String(patch.selectedLocId ?? "").trim();
          if (selectedLocId) {
            next.dispatchQty = suggestedQtyForLoc(next, selectedLocId);
            if (next.dispatchQty >= next.requestedQty) next.shortageReason = "";
          }
        }
        next.dispatchQty = roundQty(clampQty(Number(next.dispatchQty ?? 0), 0, next.requestedQty));
        return next;
      });
      return applySmartAllocation(patched, true);
    });
  };

  const openSplit = (lineId: string, overrideSuggestedQty?: number) => {
    const line = lines.find((entry) => entry.id === lineId);
    if (!line || !canSplitDraftLine(line)) return;
    const rq = roundQty(line.requestedQty);
    let suggested: number;
    if (overrideSuggestedQty !== undefined && Number.isFinite(overrideSuggestedQty)) {
      const clamped = roundQty(clampQty(overrideSuggestedQty, 0.01, rq - 0.01));
      suggested = clamped > 0 && clamped < rq ? clamped : Number.NaN;
    } else {
      suggested = Number.NaN;
    }
    if (!Number.isFinite(suggested)) {
      const half = roundQty(rq / 2);
      suggested = half > 0 && half < rq ? half : Math.max(1, Math.floor(rq / 2));
    }
    setSplitTargetId(lineId);
    setSplitQtyInput(String(suggested));
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
      manualLocked: false,
    };

    setLines((prev) => {
      const next = prev.map((line) =>
        line.id === splitTarget.id
          ? { ...line, requestedQty: remainingQty, dispatchQty: Math.min(line.dispatchQty, remainingQty) }
          : line
      );
      const insertIndex = next.findIndex((line) => line.id === splitTarget.id);
      next.splice(insertIndex + 1, 0, virtualLine);
      return applySmartAllocation(next, true);
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
      <div className="overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg)]">
        <div className="hidden grid-cols-[minmax(220px,1.2fr)_minmax(260px,1.3fr)_120px_minmax(220px,1fr)_120px] gap-3 border-b border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)] lg:grid">
          <div>Insumo</div>
          <div>LOC</div>
          <div>Cantidad</div>
          <div>Faltante</div>
          <div>Estado</div>
        </div>
        {lines.map((line) => {
          const hasShortage = line.dispatchQty < line.requestedQty;
          const tone = getLineTone(line);
          const multilocHint = needsMultilocSplitHint(line);
          const multilocSuggested = multilocHint ? suggestedSplitQtyForMultiloc(line) : 0;
          const multilocRemainder = multilocHint
            ? roundQty(line.requestedQty - multilocSuggested)
            : 0;
          return (
            <div key={line.id} className="border-t border-[var(--ui-border)] first:border-t-0">
              <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(220px,1.2fr)_minmax(260px,1.3fr)_120px_minmax(220px,1fr)_120px] lg:items-start">
                <div>
                  <div className="text-sm font-semibold text-[var(--ui-text)]">{line.productName}</div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                    Solicitado: {line.requestedQty} {line.unitLabel}
                  </div>
                  {line.recommendedLocId ? (
                    <div className="mt-2 text-xs text-emerald-700">
                      Asignación inteligente:{" "}
                      <strong>
                        {(line.locOptions.find((loc) => loc.id === line.selectedLocId)?.label ??
                          line.selectedLocId) || "Sin LOC"}
                      </strong>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <select
                    value={line.selectedLocId}
                    onChange={(e) => updateLine(line.id, { selectedLocId: e.target.value })}
                    className="ui-input h-10"
                  >
                    <option value="">Selecciona LOC</option>
                    {line.locOptions.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.label} · {loc.qty} {line.unitLabel}
                      </option>
                    ))}
                  </select>
                  {multilocHint ? (
                    <div className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-950">
                      <p className="font-semibold leading-snug">
                        Ningún LOC cubre todo el pedido; entre LOCs sí alcanza.
                      </p>
                      <p className="mt-1 leading-snug text-sky-900/80">
                        Partí la línea para asignar un LOC distinto a cada parte.
                      </p>
                      <button
                        type="button"
                        onClick={() => openSplit(line.id, multilocSuggested)}
                        className="mt-2 text-left text-sm font-semibold text-sky-900 underline-offset-4 transition hover:underline"
                      >
                        Partición sugerida: {multilocSuggested} + {multilocRemainder}{" "}
                        {line.unitLabel}
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openSplit(line.id)}
                    className="ui-btn ui-btn--ghost h-9 text-xs font-semibold"
                    disabled={!canSplitDraftLine(line)}
                    title={
                      canSplitDraftLine(line)
                        ? "Divide en dos líneas para asignar otro LOC a parte de la cantidad."
                        : "Solo aplica con más de 1 unidad solicitada (no en líneas hijas de un split)."
                    }
                  >
                    Partir línea
                  </button>
                </div>

                <div>
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
                    className="ui-input h-10 w-full"
                  />
                </div>

                <div>
                  {hasShortage ? (
                    <textarea
                      value={line.shortageReason}
                      onChange={(e) => updateLine(line.id, { shortageReason: e.target.value })}
                      className="ui-input min-h-[60px] w-full"
                      placeholder="Motivo obligatorio..."
                    />
                  ) : (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs text-emerald-800">
                      Sin faltante
                    </div>
                  )}
                </div>

                <div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
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
              </div>
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
          </div>
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <button
              type="button"
              onClick={() => {
                setLines((prev) =>
                  applySmartAllocation(
                    prev.map((line) => ({ ...line, manualLocked: false })),
                    false
                  )
                );
              }}
              className="text-left text-sm font-medium text-[var(--ui-text)]/55 underline-offset-4 transition hover:text-[var(--ui-text)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-ring)]"
            >
              Reoptimizar asignación
            </button>
            <form action={onCommit}>
              <input type="hidden" name="request_id" value={requestId} />
              <input type="hidden" name="return_origin" value={returnOrigin} />
              <input type="hidden" name="site_id" value={siteId} />
              <input type="hidden" name="payload" value={payload} />
              <button
                type="submit"
                className="ui-btn ui-btn--action h-11 px-4 text-sm font-semibold"
                disabled={!allReady}
              >
                Marcar lista para despacho
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

