"use client";

import { useMemo, useState } from "react";

import { GuidedFormShell } from "@/components/inventory/forms/GuidedFormShell";
import type { GuidedStep } from "@/lib/inventory/forms/types";

type SiteCode = "CP" | "SAU" | "VCF" | "VGR";

type SiteOption = {
  id: string;
  code: SiteCode;
  label: string;
};

type Props = {
  sites: SiteOption[];
  defaultSiteId: string;
  action: (formData: FormData) => void | Promise<void>;
};

const ZONAS_ESTANDAR = [
  { code: "BOD", label: "Bodega (BOD)" },
  { code: "EMP", label: "Empaques / Estibas (EMP)" },
  { code: "REC", label: "Recepcion (REC)" },
  { code: "DSP", label: "Despacho (DSP)" },
  { code: "BODEGA", label: "Bodega general" },
  { code: "FRIO", label: "Cuarto frio" },
  { code: "CONG", label: "Congelacion" },
  { code: "N2P", label: "Nevera 2 puertas" },
  { code: "N3P", label: "Nevera 3 puertas" },
  { code: "SECOS1", label: "Secos primer piso" },
  { code: "SECPREP", label: "Secos preparados" },
  { code: "COC", label: "Cocina (COC)" },
  { code: "BAR", label: "Bar (BAR)" },
  { code: "OFI", label: "Oficina (OFI)" },
  { code: "EXT", label: "Externo (EXT)" },
];

const STEPS: GuidedStep[] = [
  {
    id: "sede-zona",
    title: "Sede y zona",
    objective: "Selecciona sede operativa y zona fisica.",
  },
  {
    id: "codigo",
    title: "Codigo y metadatos",
    objective: "Define pasillo, nivel y descripcion del LOC.",
  },
  {
    id: "resumen",
    title: "Resumen",
    objective: "Valida el codigo generado y guarda.",
  },
];

function StepHelp(props: { meaning: string; whenToUse: string; example: string; impact?: string }) {
  return (
    <div className="ui-panel-soft space-y-1 p-3">
      <div className="ui-caption">
        <strong>Que significa:</strong> {props.meaning}
      </div>
      <div className="ui-caption">
        <strong>Cuando usarlo:</strong> {props.whenToUse}
      </div>
      <div className="ui-caption">
        <strong>Ejemplo:</strong> {props.example}
      </div>
      {props.impact ? (
        <div className="ui-caption">
          <strong>Impacto:</strong> {props.impact}
        </div>
      ) : null}
    </div>
  );
}

export function LocCreateForm({ sites, defaultSiteId, action }: Props) {
  const initialSiteId = defaultSiteId || sites[0]?.id || "";

  const [activeStepId, setActiveStepId] = useState(STEPS[0].id);
  const [siteId, setSiteId] = useState(initialSiteId);
  const [zone, setZone] = useState("BOD");
  const [aisle, setAisle] = useState("MAIN");
  const [level, setLevel] = useState("");
  const [description, setDescription] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const stepIndex = STEPS.findIndex((step) => step.id === activeStepId);
  const atFirstStep = stepIndex <= 0;
  const atLastStep = stepIndex >= STEPS.length - 1;

  const moveStep = (offset: -1 | 1) => {
    const nextIndex = Math.min(STEPS.length - 1, Math.max(0, stepIndex + offset));
    setActiveStepId(STEPS[nextIndex].id);
  };

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === siteId) ?? null,
    [siteId, sites]
  );
  const siteCode = (selectedSite?.code ?? "CP").toUpperCase();
  const zoneUpper = (zone || "BOD").trim().toUpperCase();
  const aisleUpper = (aisle || "MAIN").trim().toUpperCase();
  const levelUpper = (level || "").trim().toUpperCase();

  const codigoGenerado = useMemo(() => {
    if (!siteCode || !zoneUpper || !aisleUpper) return "";
    const base = `LOC-${siteCode}-${zoneUpper}-${aisleUpper}`;
    return levelUpper ? `${base}-${levelUpper}` : base;
  }, [siteCode, zoneUpper, aisleUpper, levelUpper]);

  const siteIdToSend = siteId || defaultSiteId || "";
  const canSubmit = Boolean(siteIdToSend) && Boolean(codigoGenerado);

  return (
    <GuidedFormShell
      title="Nueva ubicacion"
      subtitle="Convencion: LOC-SEDE-ZONA-PASILLO o LOC-SEDE-ZONA-PASILLO-NIVEL."
      steps={STEPS}
      currentStepId={activeStepId}
      onStepChange={setActiveStepId}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="site_id" value={siteIdToSend} />
        <input type="hidden" name="code" value={codigoGenerado} />
        <input type="hidden" name="zone" value={zoneUpper} />
        <input type="hidden" name="aisle" value={aisleUpper} />
        <input type="hidden" name="level" value={levelUpper} />
        <input type="hidden" name="description" value={description} />

        <section className={activeStepId === "sede-zona" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 1. Sede y zona</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Sede</span>
              <select value={siteId} onChange={(event) => setSiteId(event.target.value)} className="ui-input" required>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.label} ({site.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Zona</span>
              <select value={zone} onChange={(event) => setZone(event.target.value)} className="ui-input" required>
                {ZONAS_ESTANDAR.map((zona) => (
                  <option key={zona.code} value={zona.code}>
                    {zona.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <StepHelp
            meaning="Define en que sede y zona fisica existira el LOC."
            whenToUse="Selecciona la zona real donde estara el inventario."
            example="Sede CP, Zona BOD."
            impact="Determina visibilidad y trazabilidad por sede."
          />
        </section>

        <section className={activeStepId === "codigo" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 2. Codigo y metadatos</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Pasillo / identificador</span>
              <input
                type="text"
                value={aisle}
                onChange={(event) => setAisle(event.target.value.toUpperCase().replace(/\s/g, ""))}
                placeholder="MAIN, EST01"
                className="ui-input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Nivel (opcional)</span>
              <input
                type="text"
                value={level}
                onChange={(event) => setLevel(event.target.value.toUpperCase().replace(/\s/g, ""))}
                placeholder="N0, 1"
                className="ui-input"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-3">
              <span className="ui-label">Descripcion (opcional)</span>
              <input
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ej: Estanteria 1"
                className="ui-input"
              />
            </label>
          </div>
          <StepHelp
            meaning="Completa el identificador del LOC dentro de la zona."
            whenToUse="Usa pasillo obligatorio; nivel solo si aplica verticalidad."
            example="PASILLO MAIN, NIVEL N2."
            impact="Mejora lectura en scanner y operaciones de conteo."
          />
        </section>

        <section className={activeStepId === "resumen" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 3. Resumen</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Sede</div>
              <div className="font-semibold mt-1">{selectedSite?.label ?? "Sin definir"}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Zona</div>
              <div className="font-semibold mt-1">{zoneUpper || "Sin definir"}</div>
            </div>
            <div className="ui-panel-soft p-3 sm:col-span-2">
              <div className="ui-caption">Codigo generado</div>
              <div className="font-mono font-semibold mt-1">{codigoGenerado || "-"}</div>
            </div>
          </div>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span className="ui-caption">Confirmo que la ubicacion y el codigo son correctos.</span>
          </label>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => moveStep(-1)} disabled={atFirstStep}>
              Anterior
            </button>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => moveStep(1)} disabled={atLastStep}>
              Siguiente
            </button>
          </div>
          <button
            type="submit"
            disabled={!canSubmit || !confirmed || activeStepId !== "resumen"}
            className="ui-btn ui-btn--brand disabled:opacity-50"
          >
            Crear ubicacion
          </button>
        </div>
      </form>
    </GuidedFormShell>
  );
}