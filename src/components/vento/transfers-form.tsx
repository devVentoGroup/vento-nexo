"use client";

import { useMemo, useState } from "react";

import { GuidedFormShell } from "@/components/inventory/forms/GuidedFormShell";
import { StepHelp } from "@/components/inventory/forms/StepHelp";
import { WizardFooter } from "@/components/inventory/forms/WizardFooter";
import { type ProductUomProfile } from "@/lib/inventory/uom";
import type { GuidedStep } from "@/lib/inventory/forms/types";

import { TransfersItems } from "./transfers-items";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
};

type LocOption = {
  id: string;
  code: string | null;
  name: string | null;
};

type Props = {
  locations: LocOption[];
  products: ProductOption[];
  defaultUomProfiles?: ProductUomProfile[];
  action: (formData: FormData) => void | Promise<void>;
};

const STEPS: GuidedStep[] = [
  {
    id: "origen-destino",
    title: "Origen y destino",
    objective: "Selecciona LOC origen, LOC destino y contexto del traslado.",
  },
  {
    id: "items",
    title: "Items",
    objective: "Define productos, cantidades y unidad de captura.",
  },
  {
    id: "revision",
    title: "Revision",
    objective: "Valida que no haya errores operativos antes de enviar.",
  },
  {
    id: "confirmacion",
    title: "Confirmacion",
    objective: "Confirma responsabilidad y registra el traslado.",
  },
];

export function TransfersForm({ locations, products, defaultUomProfiles = [], action }: Props) {
  const [activeStepId, setActiveStepId] = useState(STEPS[0].id);
  const [confirmed, setConfirmed] = useState(false);
  const [fromLocId, setFromLocId] = useState("");
  const [toLocId, setToLocId] = useState("");

  const stepIndex = STEPS.findIndex((step) => step.id === activeStepId);
  const atFirstStep = stepIndex <= 0;
  const atLastStep = stepIndex >= STEPS.length - 1;

  const moveStep = (offset: -1 | 1) => {
    const nextIndex = Math.min(STEPS.length - 1, Math.max(0, stepIndex + offset));
    setActiveStepId(STEPS[nextIndex].id);
  };

  const selectedFrom = useMemo(
    () => locations.find((loc) => loc.id === fromLocId) ?? null,
    [fromLocId, locations]
  );
  const selectedTo = useMemo(
    () => locations.find((loc) => loc.id === toLocId) ?? null,
    [toLocId, locations]
  );

  return (
    <GuidedFormShell
      title="Nuevo traslado interno"
      subtitle="Flujo guiado para mover inventario entre LOCs en la misma sede."
      steps={STEPS}
      currentStepId={activeStepId}
      onStepChange={setActiveStepId}
    >
      <form className="space-y-4" action={action}>
        <input type="hidden" name="_wizard_step" value={activeStepId} />

        <section className={activeStepId === "origen-destino" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 1. Origen y destino</div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">LOC origen</span>
              <select
                name="from_loc_id"
                className="ui-input"
                value={fromLocId}
                onChange={(event) => setFromLocId(event.target.value)}
                required
              >
                <option value="">Selecciona LOC origen</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code ?? loc.name ?? loc.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">LOC destino</span>
              <select
                name="to_loc_id"
                className="ui-input"
                value={toLocId}
                onChange={(event) => setToLocId(event.target.value)}
                required
              >
                <option value="">Selecciona LOC destino</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code ?? loc.name ?? loc.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Notas</span>
              <input name="notes" className="ui-input" placeholder="Observaciones" />
            </label>
          </div>
          <StepHelp
            meaning="Define desde donde sale y a donde llega el stock."
            whenToUse="Siempre antes de cargar items; evita errores de ubicacion."
            example="Origen: LOC-CP-BOD-MAIN, Destino: LOC-CP-BAR-MAIN."
            impact="El movimiento resta en origen y suma en destino."
          />
        </section>

        <section className={activeStepId === "items" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 2. Items</div>
          <div className="ui-body-muted">Captura productos y cantidades que se moveran.</div>
          <TransfersItems products={products} defaultUomProfiles={defaultUomProfiles} />
          <StepHelp
            meaning="Cada fila representa un producto a trasladar."
            whenToUse="Agrega una fila por cada producto y cantidad."
            example="Leche 6 lt, Azucar 2 kg, Vasos 1 caja."
            impact="Define el detalle de movimientos de inventario."
          />
        </section>

        <section className={activeStepId === "revision" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 3. Revision</div>
          <div className="ui-panel-soft space-y-1 p-3">
            <div className="ui-caption">
              Revisa que origen y destino no sean iguales y que cada item tenga cantidad mayor a 0.
            </div>
            <div className="ui-caption">
              Origen actual: <strong>{selectedFrom?.code ?? selectedFrom?.name ?? "-"}</strong>.
            </div>
            <div className="ui-caption">
              Destino actual: <strong>{selectedTo?.code ?? selectedTo?.name ?? "-"}</strong>.
            </div>
          </div>
        </section>

        <section className={activeStepId === "confirmacion" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 4. Confirmacion</div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span className="ui-caption">
              Confirmo que revise origen/destino y cantidades antes de registrar el traslado.
            </span>
          </label>
        </section>

        <WizardFooter
          canGoPrevious={!atFirstStep}
          canGoNext={!atLastStep}
          onPrevious={() => moveStep(-1)}
          onNext={() => moveStep(1)}
          rightActions={
            <button
              type="submit"
              className="ui-btn ui-btn--brand"
              disabled={!confirmed || activeStepId !== "confirmacion"}
            >
              Registrar traslado
            </button>
          }
        />
      </form>
    </GuidedFormShell>
  );
}
