"use client";

import { useMemo, useState } from "react";

import { GuidedFormShell } from "@/components/inventory/forms/GuidedFormShell";
import { StepHelp } from "@/components/inventory/forms/StepHelp";
import { WizardFooter } from "@/components/inventory/forms/WizardFooter";
import { type ProductUomProfile } from "@/lib/inventory/uom";
import type { GuidedStep } from "@/lib/inventory/forms/types";

import { RemissionsItems } from "./remissions-items";

type SiteOption = {
  id: string;
  name: string;
};

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
};

type AreaOption = {
  value: string;
  label: string;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  toSiteId: string;
  toSiteName: string;
  fromSiteOptions: SiteOption[];
  defaultFromSiteId: string;
  products: ProductOption[];
  defaultUomProfiles?: ProductUomProfile[];
  areaOptions: AreaOption[];
};

const STEPS: GuidedStep[] = [
  {
    id: "ruta",
    title: "Ruta",
    objective: "Define sede origen y destino de la remision.",
  },
  {
    id: "items",
    title: "Items",
    objective: "Selecciona productos, cantidades y area de destino.",
  },
  {
    id: "revision",
    title: "Revision",
    objective: "Valida reglas antes de enviar a bodega.",
  },
  {
    id: "confirmacion",
    title: "Confirmacion",
    objective: "Confirma la solicitud y registra la remision.",
  },
];

export function RemissionsCreateForm({
  action,
  toSiteId,
  toSiteName,
  fromSiteOptions,
  defaultFromSiteId,
  products,
  defaultUomProfiles = [],
  areaOptions,
}: Props) {
  const [activeStepId, setActiveStepId] = useState(STEPS[0].id);
  const [fromSiteId, setFromSiteId] = useState(defaultFromSiteId);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const stepIndex = STEPS.findIndex((step) => step.id === activeStepId);
  const atFirstStep = stepIndex <= 0;
  const atLastStep = stepIndex >= STEPS.length - 1;

  const moveStep = (offset: -1 | 1) => {
    const nextIndex = Math.min(STEPS.length - 1, Math.max(0, stepIndex + offset));
    setActiveStepId(STEPS[nextIndex].id);
  };

  const selectedFromSite = useMemo(
    () => fromSiteOptions.find((site) => site.id === fromSiteId) ?? null,
    [fromSiteId, fromSiteOptions]
  );

  return (
    <GuidedFormShell
      title="Nueva remision"
      subtitle="Solicitud guiada de abastecimiento desde centro hacia sede satelite."
      steps={STEPS}
      currentStepId={activeStepId}
      onStepChange={setActiveStepId}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="_wizard_step" value={activeStepId} />
        <input type="hidden" name="to_site_id" value={toSiteId} />

        <section className={activeStepId === "ruta" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 1. Ruta origen-destino</div>
          <div className="grid gap-3 ui-mobile-stack md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Sede origen (centro/bodega)</span>
              <select
                name="from_site_id"
                value={fromSiteId}
                onChange={(event) => setFromSiteId(event.target.value)}
                className="ui-input"
                required
              >
                <option value="">Selecciona origen</option>
                {fromSiteOptions.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Sede destino (tu sede)</span>
              <div className="ui-input flex h-11 items-center">{toSiteName}</div>
            </label>
          </div>
          <StepHelp
            meaning="Define de donde saldra el despacho y a que sede llegara."
            whenToUse="Siempre antes de capturar items para evitar solicitudes cruzadas."
            example="Origen: Centro de Produccion. Destino: Saudo."
            impact="Bodega vera esta remision en su cola de preparacion."
          />
        </section>

        <section className={activeStepId === "items" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 2. Items y contexto</div>
          <div className="grid gap-3 ui-mobile-stack md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Fecha esperada</span>
              <input
                type="date"
                name="expected_date"
                value={expectedDate}
                onChange={(event) => setExpectedDate(event.target.value)}
                className="ui-input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Notas</span>
              <input
                name="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notas para bodega"
                className="ui-input"
              />
            </label>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
              Items solicitados
            </div>
            <p className="mt-1 text-xs text-[var(--ui-muted)]">
              Agrega solo productos activos para esta sede y define cantidad real requerida.
            </p>
          </div>
          <RemissionsItems
            products={products}
            areaOptions={areaOptions}
            defaultUomProfiles={defaultUomProfiles}
          />
        </section>

        <section className={activeStepId === "revision" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 3. Revision</div>
          <div className="ui-panel-soft p-3 space-y-1">
            <div className="ui-caption">
              Origen seleccionado: <strong>{selectedFromSite?.name ?? "Sin definir"}</strong>
            </div>
            <div className="ui-caption">
              Destino seleccionado: <strong>{toSiteName}</strong>
            </div>
            <div className="ui-caption">
              Verifica cantidades para evitar faltantes y pedidos duplicados.
            </div>
          </div>
          <StepHelp
            meaning="Paso de control previo antes de generar la solicitud."
            whenToUse="Siempre, especialmente en picos de operacion."
            example="Corregir item con unidad equivocada antes de enviar."
            impact="Reduce rechazos y retrabajo en preparacion de remisiones."
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
              Confirmo que revise origen, destino, fecha y cantidades de la solicitud.
            </span>
          </label>
          {!fromSiteId ? (
            <div className="ui-alert ui-alert--warn">
              Selecciona una sede origen antes de enviar la remision.
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
              className="ui-btn ui-btn--brand"
              disabled={!confirmed || !fromSiteId || activeStepId !== "confirmacion"}
            >
              Crear remision
            </button>
          }
        />
      </form>
    </GuidedFormShell>
  );
}
