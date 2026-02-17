"use client";

import { useMemo, useState } from "react";

import { GuidedFormShell } from "@/components/inventory/forms/GuidedFormShell";
import { StepHelp } from "@/components/inventory/forms/StepHelp";
import { WizardFooter } from "@/components/inventory/forms/WizardFooter";
import type { GuidedStep } from "@/lib/inventory/forms/types";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
};

type Props = {
  siteId: string;
  siteName: string;
  products: ProductOption[];
  action: (formData: FormData) => void | Promise<void>;
};

const STEPS: GuidedStep[] = [
  {
    id: "contexto",
    title: "Contexto",
    objective: "Define sede y producto para registrar el lote.",
  },
  {
    id: "lote",
    title: "Datos de lote",
    objective: "Captura cantidad, unidad, vencimiento y notas.",
  },
  {
    id: "impacto",
    title: "Impacto",
    objective: "Revisa como impactara el inventario de la sede.",
  },
  {
    id: "confirmacion",
    title: "Confirmacion",
    objective: "Confirma los datos y registra el lote.",
  },
];

export function ProductionBatchForm({ siteId, siteName, products, action }: Props) {
  const [activeStepId, setActiveStepId] = useState(STEPS[0].id);
  const [confirmed, setConfirmed] = useState(false);

  const [productId, setProductId] = useState("");
  const [producedQty, setProducedQty] = useState("");
  const [producedUnit, setProducedUnit] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [productId, products]
  );

  const stepIndex = STEPS.findIndex((step) => step.id === activeStepId);
  const atFirstStep = stepIndex <= 0;
  const atLastStep = stepIndex >= STEPS.length - 1;

  const moveStep = (offset: -1 | 1) => {
    const nextIndex = Math.min(STEPS.length - 1, Math.max(0, stepIndex + offset));
    setActiveStepId(STEPS[nextIndex].id);
  };

  const parsedQty = Number(producedQty);
  const hasValidQty = Number.isFinite(parsedQty) && parsedQty > 0;
  const canSubmit = Boolean(productId) && hasValidQty && Boolean(producedUnit.trim());

  return (
    <GuidedFormShell
      title="Registro de produccion manual"
      subtitle="Flujo guiado para crear lote, generar movimiento y actualizar stock."
      steps={STEPS}
      currentStepId={activeStepId}
      onStepChange={setActiveStepId}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="_wizard_step" value={activeStepId} />
        <input type="hidden" name="site_id" value={siteId} />

        <section className={activeStepId === "contexto" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 1. Contexto</div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Sede activa</div>
            <div className="font-semibold mt-1">{siteName}</div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Producto</span>
            <select
              name="product_id"
              className="ui-input"
              value={productId}
              onChange={(event) => {
                const nextId = event.target.value;
                setProductId(nextId);
                const nextProduct = products.find((product) => product.id === nextId);
                if (!producedUnit && nextProduct?.unit) {
                  setProducedUnit(nextProduct.unit);
                }
              }}
              required
            >
              <option value="">Selecciona producto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name ?? product.id}
                </option>
              ))}
            </select>
          </label>
          <StepHelp
            meaning="Define que producto terminado estas ingresando al inventario."
            whenToUse="Cuando finalizas un lote de produccion y necesitas subir stock."
            example="Salsa base, Pan de hamburguesa, Mix preparado."
            impact="Genera movimiento de entrada y aumenta stock de la sede."
          />
        </section>

        <section className={activeStepId === "lote" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 2. Datos de lote</div>
          <div className="grid gap-3 ui-mobile-stack md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Cantidad producida</span>
              <input
                name="produced_qty"
                value={producedQty}
                onChange={(event) => setProducedQty(event.target.value)}
                placeholder="Cantidad"
                className="ui-input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Unidad</span>
              <input
                name="produced_unit"
                value={producedUnit}
                onChange={(event) => setProducedUnit(event.target.value)}
                placeholder="ej: kg, un"
                className="ui-input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Fecha expiracion</span>
              <input
                type="date"
                name="expires_at"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="ui-input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Notas</span>
              <input
                name="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notas de produccion"
                className="ui-input"
              />
            </label>
          </div>
          <StepHelp
            meaning="Captura datos operativos del lote terminado."
            whenToUse="Completa siempre cantidad y unidad; vencimiento si aplica."
            example="12.5 kg, expira 2026-03-15, lote turno manana."
            impact="Afecta trazabilidad y control de vida util del producto."
          />
        </section>

        <section className={activeStepId === "impacto" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 3. Impacto en inventario</div>
          <div className="grid gap-3 ui-mobile-stack sm:grid-cols-2">
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Producto</div>
              <div className="font-semibold mt-1">{selectedProduct?.name ?? "Sin definir"}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Ingreso a stock</div>
              <div className="font-semibold mt-1">
                {hasValidQty ? `${parsedQty} ${producedUnit || ""}` : "Sin definir"}
              </div>
            </div>
            <div className="ui-panel-soft p-3 sm:col-span-2">
              <div className="ui-caption">Resultado</div>
              <div className="font-semibold mt-1">
                Se creara un lote y un movimiento tipo receipt en {siteName}.
              </div>
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
              Confirmo que revise producto, cantidad, unidad y fecha de expiracion antes de registrar.
            </span>
          </label>
          {!canSubmit ? (
            <div className="ui-alert ui-alert--warn">
              Completa producto, cantidad mayor a 0 y unidad antes de guardar.
            </div>
          ) : null}
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
              disabled={!confirmed || !canSubmit || activeStepId !== "confirmacion"}
            >
              Registrar lote
            </button>
          }
        />
      </form>
    </GuidedFormShell>
  );
}
