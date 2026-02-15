"use client";

import { useState } from "react";

import { GuidedFormShell } from "@/components/inventory/forms/GuidedFormShell";
import { StepHelp } from "@/components/inventory/forms/StepHelp";
import { WizardFooter } from "@/components/inventory/forms/WizardFooter";
import type { GuidedStep } from "@/lib/inventory/forms/types";

import { EntriesItems } from "./entries-items";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
};

type LocationOption = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type SupplierOption = {
  id: string;
  name: string | null;
};

type UnitOption = {
  code: string;
  name: string;
};

type Props = {
  products: ProductOption[];
  units: UnitOption[];
  locations: LocationOption[];
  suppliers: SupplierOption[];
  defaultLocationId?: string;
  action: (formData: FormData) => void | Promise<void>;
};

const STEPS: GuidedStep[] = [
  {
    id: "proveedor",
    title: "Proveedor y documento",
    objective: "Define origen de la entrada y contexto de la factura.",
  },
  {
    id: "items",
    title: "Items y unidades",
    objective: "Captura productos, cantidades y LOC destino.",
  },
  {
    id: "revision",
    title: "Revision",
    objective: "Verifica consistencia antes de confirmar.",
  },
  {
    id: "confirmacion",
    title: "Confirmacion",
    objective: "Confirma responsabilidad operativa y guarda.",
  },
];

export function EntriesForm({
  products,
  units,
  locations,
  suppliers,
  defaultLocationId,
  action,
}: Props) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "__new__");
  const [activeStepId, setActiveStepId] = useState(STEPS[0].id);
  const [confirmed, setConfirmed] = useState(false);
  const showCustomSupplier = supplierId === "__new__";

  const stepIndex = STEPS.findIndex((step) => step.id === activeStepId);
  const atFirstStep = stepIndex <= 0;
  const atLastStep = stepIndex >= STEPS.length - 1;

  const moveStep = (offset: -1 | 1) => {
    const nextIndex = Math.min(STEPS.length - 1, Math.max(0, stepIndex + offset));
    setActiveStepId(STEPS[nextIndex].id);
  };

  return (
    <GuidedFormShell
      title="Nueva entrada"
      subtitle="Flujo guiado para registrar entrada con factura y LOC."
      steps={STEPS}
      currentStepId={activeStepId}
      onStepChange={setActiveStepId}
    >
      <form className="space-y-4" action={action}>
        <input type="hidden" name="_wizard_step" value={activeStepId} />

        <section className={activeStepId === "proveedor" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 1. Proveedor y documento</div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Proveedor</span>
              <select
                name="supplier_id"
                className="ui-input"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="__new__">Crear proveedor...</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name ?? supplier.id}
                  </option>
                ))}
              </select>
            </label>
            {showCustomSupplier ? (
              <label className="flex flex-col gap-1">
                <span className="ui-label">Nombre proveedor</span>
                <input name="supplier_custom" className="ui-input" placeholder="Nombre proveedor" />
              </label>
            ) : null}
            <label className="flex flex-col gap-1">
              <span className="ui-label">Factura (opcional)</span>
              <input name="invoice_number" className="ui-input" placeholder="FAC-0001" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Fecha de recepcion</span>
              <input type="date" name="received_at" className="ui-input" />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Notas</span>
              <input name="notes" className="ui-input" placeholder="Observaciones" />
            </label>
          </div>
          <StepHelp
            meaning="Este paso define trazabilidad del documento de entrada."
            whenToUse="Siempre que recibas mercancia con o sin factura formal."
            example="Proveedor X, factura FAC-1023, fecha de recepcion hoy."
            impact="Permite auditar diferencias entre declarado y recibido."
          />
        </section>

        <section className={activeStepId === "items" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 2. Items y unidades</div>
          <div className="ui-body-muted">
            Declara cantidades y lo recibido. El sistema calcula estado pendiente/parcial/recibida.
          </div>
          <EntriesItems
            products={products}
            units={units}
            locations={locations}
            defaultLocationId={defaultLocationId}
          />
          <StepHelp
            meaning="Cada item registra cantidad, unidad de captura y LOC destino."
            whenToUse="Agrega un item por producto recibido en la factura."
            example="Harina: declarada 20 kg, recibida 19.5 kg, LOC BOD-MAIN."
            impact="Afecta stock por sede y por ubicacion fisica."
          />
        </section>

        <section className={activeStepId === "revision" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 3. Revision</div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">
              Revisa que cada item tenga producto, cantidad declarada mayor a 0 y LOC definido.
            </div>
            <div className="ui-caption mt-1">
              Si hay diferencias entre declarado y recibido, la entrada quedara en estado parcial.
            </div>
          </div>
          <StepHelp
            meaning="Validacion operativa previa al guardado."
            whenToUse="Siempre antes de confirmar la entrada."
            example="Detectar un item sin LOC y corregir antes de guardar."
            impact="Evita movimientos incompletos o inconsistentes."
          />
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
              Confirmo que revise proveedor, documento, cantidades y ubicaciones antes de guardar.
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
              Guardar entrada
            </button>
          }
        />
      </form>
    </GuidedFormShell>
  );
}
