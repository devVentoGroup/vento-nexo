"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { GuidedFormShell } from "@/components/inventory/forms/GuidedFormShell";
import { WizardFooter } from "@/components/inventory/forms/WizardFooter";
import type { GuidedStep } from "@/lib/inventory/forms/types";

type LocRow = {
  id: string;
  code: string | null;
  zone: string | null;
  aisle: string | null;
  level: string | null;
  description?: string | null;
};

type Props = {
  loc: LocRow;
  action: (formData: FormData) => Promise<void>;
  cancelHref: string;
};

const STEPS: GuidedStep[] = [
  {
    id: "identidad",
    title: "Identidad",
    objective: "Actualiza codigo y zona principal del LOC.",
  },
  {
    id: "metadatos",
    title: "Metadatos",
    objective: "Actualiza pasillo, nivel y descripcion.",
  },
  {
    id: "resumen",
    title: "Resumen",
    objective: "Valida cambios antes de guardar.",
  },
];

export function LocEditForm({ loc, action, cancelHref }: Props) {
  const [activeStepId, setActiveStepId] = useState(STEPS[0].id);
  const [confirmed, setConfirmed] = useState(false);

  const [code, setCode] = useState(loc.code ?? "");
  const [zone, setZone] = useState(loc.zone ?? "");
  const [aisle, setAisle] = useState(loc.aisle ?? "");
  const [level, setLevel] = useState(loc.level ?? "");
  const [description, setDescription] = useState(loc.description ?? "");

  const stepIndex = STEPS.findIndex((step) => step.id === activeStepId);
  const atFirstStep = stepIndex <= 0;
  const atLastStep = stepIndex >= STEPS.length - 1;

  const moveStep = (offset: -1 | 1) => {
    const nextIndex = Math.min(STEPS.length - 1, Math.max(0, stepIndex + offset));
    setActiveStepId(STEPS[nextIndex].id);
  };

  const canSubmit = useMemo(() => Boolean(code.trim()) && Boolean(zone.trim()), [code, zone]);
  const canSubmitFromCurrentStep = canSubmit && (activeStepId !== "resumen" || confirmed);

  return (
    <GuidedFormShell
      title="Editar LOC"
      subtitle="Flujo guiado para corregir codigo, zona y metadatos de ubicacion."
      steps={STEPS}
      currentStepId={activeStepId}
      onStepChange={setActiveStepId}
      className="mt-6"
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="loc_id" value={loc.id} />
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="zone" value={zone} />
        <input type="hidden" name="aisle" value={aisle} />
        <input type="hidden" name="level" value={level} />
        <input type="hidden" name="description" value={description} />

        <section className={activeStepId === "identidad" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 1. Identidad del LOC</div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Codigo</span>
              <input
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                className="ui-input"
                placeholder="LOC-CP-BOD-EST01"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Zona</span>
              <input
                type="text"
                value={zone}
                onChange={(event) => setZone(event.target.value.toUpperCase())}
                className="ui-input"
                placeholder="BOD, REC, FRIO"
              />
            </label>
          </div>
          <div className="ui-caption">Codigo y zona son obligatorios para guardar.</div>
        </section>

        <section className={activeStepId === "metadatos" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 2. Metadatos</div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Pasillo</span>
              <input
                type="text"
                value={aisle}
                onChange={(event) => setAisle(event.target.value.toUpperCase())}
                className="ui-input"
                placeholder="EST01"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Nivel</span>
              <input
                type="text"
                value={level}
                onChange={(event) => setLevel(event.target.value.toUpperCase())}
                className="ui-input"
                placeholder="N0"
              />
            </label>
            <label className="flex flex-col gap-1 md:col-span-3">
              <span className="ui-label">Descripcion</span>
              <input
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="ui-input"
                placeholder="Descripcion opcional"
              />
            </label>
          </div>
        </section>

        <section className={activeStepId === "resumen" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 3. Resumen</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Codigo</div>
              <div className="font-mono font-semibold mt-1">{code || "-"}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Zona</div>
              <div className="font-semibold mt-1">{zone || "-"}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Pasillo</div>
              <div className="font-semibold mt-1">{aisle || "-"}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Nivel</div>
              <div className="font-semibold mt-1">{level || "-"}</div>
            </div>
          </div>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span className="ui-caption">Confirmo que revise los cambios del LOC antes de guardar.</span>
          </label>
        </section>

        <WizardFooter
          canGoPrevious={!atFirstStep}
          canGoNext={!atLastStep}
          onPrevious={() => moveStep(-1)}
          onNext={() => moveStep(1)}
          rightActions={
            <>
              <Link href={cancelHref} className="ui-btn ui-btn--ghost">
                Cancelar
              </Link>
              <button
                type="submit"
                className="ui-btn ui-btn--brand"
                disabled={!canSubmitFromCurrentStep}
              >
                Guardar
              </button>
            </>
          }
        />
      </form>
    </GuidedFormShell>
  );
}
