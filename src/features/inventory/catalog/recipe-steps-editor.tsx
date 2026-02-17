"use client";

import { useCallback, useState } from "react";

export type RecipeStepLine = {
  id?: string;
  step_number: number;
  description: string;
  tip: string;
  time_minutes: number | undefined;
  step_image_url?: string;
  step_video_url?: string;
  _delete?: boolean;
};

type Props = {
  name?: string;
  initialRows: RecipeStepLine[];
  mediaOwnerId: string;
};

const emptyStep = (num: number): RecipeStepLine => ({
  step_number: num,
  description: "",
  tip: "",
  time_minutes: undefined,
  step_image_url: "",
  step_video_url: "",
});

export function RecipeStepsEditor({
  name = "recipe_steps",
  initialRows,
  mediaOwnerId,
}: Props) {
  const [steps, setSteps] = useState<RecipeStepLine[]>(
    initialRows.length ? initialRows : [emptyStep(1)]
  );
  const [uploadingStep, setUploadingStep] = useState<number | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});

  const visibleSteps = steps.filter((s) => !s._delete);

  const updateStep = useCallback((index: number, patch: Partial<RecipeStepLine>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }, []);

  const setUploadError = useCallback((index: number, message: string) => {
    setUploadErrors((prev) => ({ ...prev, [index]: message }));
  }, []);

  const clearUploadError = useCallback((index: number) => {
    setUploadErrors((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

  const uploadStepImage = useCallback(
    async (index: number, file: File) => {
      clearUploadError(index);
      setUploadingStep(index);
      const formData = new FormData();
      formData.set("file", file);
      formData.set("productId", mediaOwnerId || "recipe");
      formData.set("kind", `recipe-step-${steps[index]?.step_number ?? index + 1}`);

      try {
        const res = await fetch("/api/inventory/catalog/upload-image", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          setUploadError(index, data.error ?? "No se pudo subir la foto del paso.");
          return;
        }
        updateStep(index, { step_image_url: data.url });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "No se pudo subir la foto del paso.";
        setUploadError(index, msg);
      } finally {
        setUploadingStep(null);
      }
    },
    [clearUploadError, mediaOwnerId, setUploadError, steps, updateStep]
  );

  const addStep = useCallback(() => {
    const maxNum = visibleSteps.reduce((m, s) => Math.max(m, s.step_number), 0);
    setSteps((prev) => [...prev, emptyStep(maxNum + 1)]);
  }, [visibleSteps]);

  const removeStep = useCallback((index: number) => {
    setSteps((prev) => {
      const step = prev[index];
      if (step?.id) {
        return prev.map((s, i) => (i === index ? { ...s, _delete: true } : s));
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const moveStep = useCallback((index: number, direction: "up" | "down") => {
    setSteps((prev) => {
      const visible = prev.filter((s) => !s._delete);
      const visIdx = visible.findIndex((s) => s === prev[index]);
      if (visIdx < 0) return prev;
      const swapVisIdx = direction === "up" ? visIdx - 1 : visIdx + 1;
      if (swapVisIdx < 0 || swapVisIdx >= visible.length) return prev;

      const a = visible[visIdx];
      const b = visible[swapVisIdx];
      const tempNum = a.step_number;

      return prev.map((s) => {
        if (s === a) return { ...s, step_number: b.step_number };
        if (s === b) return { ...s, step_number: tempNum };
        return s;
      });
    });
  }, []);

  const sortedVisible = [...visibleSteps].sort((a, b) => a.step_number - b.step_number);

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(steps)} />
      <div className="flex items-center justify-between">
        <span className="ui-label">Pasos de preparacion</span>
        <button type="button" onClick={addStep} className="ui-btn ui-btn--ghost ui-btn--sm">
          + Agregar paso
        </button>
      </div>

      <div className="space-y-3">
        {sortedVisible.map((step) => {
          const realIndex = steps.findIndex((s) => s === step);
          const visIndex = sortedVisible.indexOf(step);
          return (
            <div key={step.id ?? `step-${step.step_number}`} className="ui-panel-soft p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="ui-h3">Paso {step.step_number}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => moveStep(realIndex, "up")}
                    disabled={visIndex === 0}
                    className="ui-btn ui-btn--ghost ui-btn--sm disabled:opacity-30"
                    title="Mover arriba"
                  >
                    Arriba
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(realIndex, "down")}
                    disabled={visIndex === sortedVisible.length - 1}
                    className="ui-btn ui-btn--ghost ui-btn--sm disabled:opacity-30"
                    title="Mover abajo"
                  >
                    Abajo
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStep(realIndex)}
                    className="ui-btn ui-btn--danger ui-btn--sm"
                  >
                    Quitar
                  </button>
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className="ui-caption font-semibold">Instruccion</span>
                <textarea
                  rows={3}
                  value={step.description}
                  onChange={(e) => updateStep(realIndex, { description: e.target.value })}
                  className="ui-input min-h-0 py-2"
                  placeholder="Describe que hacer en este paso..."
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="ui-caption font-semibold">Tips / notas</span>
                  <input
                    type="text"
                    value={step.tip}
                    onChange={(e) => updateStep(realIndex, { tip: e.target.value })}
                    className="ui-input"
                    placeholder="Consejo opcional"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="ui-caption font-semibold">Tiempo (minutos)</span>
                  <input
                    type="number"
                    min="0"
                    value={step.time_minutes ?? ""}
                    onChange={(e) =>
                      updateStep(realIndex, {
                        time_minutes: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="ui-input"
                    placeholder="Ej. 15"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <span className="ui-caption font-semibold">Foto del paso</span>
                  {step.step_image_url ? (
                    <div className="relative h-24 w-24 overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={step.step_image_url}
                        alt={`Foto paso ${step.step_number}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--ui-muted)]">Sin foto cargada.</p>
                  )}

                  <div className="flex items-center gap-2">
                    <label className="ui-btn ui-btn--ghost ui-btn--sm cursor-pointer">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        disabled={uploadingStep === realIndex}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          uploadStepImage(realIndex, file);
                          e.currentTarget.value = "";
                        }}
                      />
                      {uploadingStep === realIndex ? "Subiendo..." : "Subir foto"}
                    </label>
                    {step.step_image_url ? (
                      <button
                        type="button"
                        className="ui-btn ui-btn--ghost ui-btn--sm"
                        onClick={() => updateStep(realIndex, { step_image_url: "" })}
                      >
                        Quitar foto
                      </button>
                    ) : null}
                  </div>
                  {uploadErrors[realIndex] ? (
                    <p className="text-xs text-[var(--ui-danger)]">{uploadErrors[realIndex]}</p>
                  ) : null}
                </div>

                <label className="flex flex-col gap-1">
                  <span className="ui-caption font-semibold">Video del paso (URL)</span>
                  <input
                    type="url"
                    value={step.step_video_url ?? ""}
                    onChange={(e) => updateStep(realIndex, { step_video_url: e.target.value })}
                    className="ui-input"
                    placeholder="https://..."
                  />
                  <span className="text-xs text-[var(--ui-muted)]">
                    Puedes pegar enlace de YouTube, Drive o video interno.
                  </span>
                </label>
              </div>
            </div>
          );
        })}
        {sortedVisible.length === 0 && <div className="ui-empty-state">Sin pasos definidos.</div>}
      </div>
    </div>
  );
}
