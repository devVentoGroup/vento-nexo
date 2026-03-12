"use client";

import { useMemo, useState } from "react";

import { StepHelp } from "@/components/inventory/forms/StepHelp";

import { STANDARD_LOCATION_ZONES } from "./location-form-options";

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

export function LocCreateForm({ sites, defaultSiteId, action }: Props) {
  const initialSiteId = defaultSiteId || sites[0]?.id || "";

  const [siteId, setSiteId] = useState(initialSiteId);
  const [zone, setZone] = useState("BOD");
  const [aisle, setAisle] = useState("MAIN");
  const [level, setLevel] = useState("");
  const [description, setDescription] = useState("");
  const [confirmed, setConfirmed] = useState(false);

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
    <form action={action} className="space-y-6 pb-24 lg:pb-0">
      <input type="hidden" name="site_id" value={siteIdToSend} />
      <input type="hidden" name="code" value={codigoGenerado} />
      <input type="hidden" name="zone" value={zoneUpper} />
      <input type="hidden" name="aisle" value={aisleUpper} />
      <input type="hidden" name="level" value={levelUpper} />
      <input type="hidden" name="description" value={description} />

      <section className="ui-panel-soft space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Nueva ubicacion en una sola vista</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Aqui defines sede, zona, estructura y validas el codigo final sin navegar por wizard.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">Alta de LOC</span>
            <span className="ui-chip">Convencion estandar</span>
          </div>
        </div>
        <p className="text-sm text-[var(--ui-muted)]">
          La meta es que alguien nuevo pueda crear una ubicacion completa entendiendo el codigo que va a quedar.
        </p>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Sede y zona operativa</div>
          <p className="mt-1 ui-caption">
            Define en que sede va a existir el LOC y en que zona fisica se usara realmente.
          </p>
        </div>

        <div className="grid gap-4 ui-mobile-stack sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede</span>
            <select
              value={siteId}
              onChange={(event) => {
                setSiteId(event.target.value);
                setConfirmed(false);
              }}
              className="ui-input"
              required
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.label} ({site.code})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Zona</span>
            <select
              value={zone}
              onChange={(event) => {
                setZone(event.target.value);
                setConfirmed(false);
              }}
              className="ui-input"
              required
            >
              {STANDARD_LOCATION_ZONES.map((zona) => (
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

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Estructura del LOC</div>
          <p className="mt-1 ui-caption">
            Completa el identificador dentro de la zona y revisa el codigo estandar que va a generarse.
          </p>
        </div>

        <div className="grid gap-4 ui-mobile-stack sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Pasillo / identificador</span>
            <input
              type="text"
              value={aisle}
              onChange={(event) => {
                setAisle(event.target.value.toUpperCase().replace(/\s/g, ""));
                setConfirmed(false);
              }}
              placeholder="MAIN, EST01"
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Nivel (opcional)</span>
            <input
              type="text"
              value={level}
              onChange={(event) => {
                setLevel(event.target.value.toUpperCase().replace(/\s/g, ""));
                setConfirmed(false);
              }}
              placeholder="N0, 1"
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-3">
            <span className="ui-label">Descripcion (opcional)</span>
            <input
              type="text"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setConfirmed(false);
              }}
              placeholder="Ej: Estanteria 1"
              className="ui-input"
            />
          </label>
        </div>

        <div className="ui-panel-soft p-4">
          <div className="ui-caption">Codigo generado</div>
          <div className="mt-1 font-mono text-sm font-semibold text-[var(--ui-text)]">
            {codigoGenerado || "-"}
          </div>
        </div>

        <StepHelp
          meaning="Completa el identificador del LOC dentro de la zona."
          whenToUse="Usa pasillo obligatorio; nivel solo si aplica verticalidad."
          example="PASILLO MAIN, NIVEL N2."
          impact="Mejora lectura en scanner y operaciones de conteo."
        />
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Revision operativa</div>
          <p className="mt-1 ui-caption">
            Antes de crear, valida que el LOC refleje la ubicacion fisica real que va a usar operacion.
          </p>
        </div>

        <div className="grid gap-3 ui-mobile-stack sm:grid-cols-2 xl:grid-cols-4">
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Sede</div>
            <div className="mt-1 font-semibold">{selectedSite?.label ?? "Sin definir"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Zona</div>
            <div className="mt-1 font-semibold">{zoneUpper || "Sin definir"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Pasillo</div>
            <div className="mt-1 font-semibold">{aisleUpper || "Sin definir"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Codigo</div>
            <div className="mt-1 font-mono font-semibold">{codigoGenerado || "-"}</div>
          </div>
        </div>

        <div className="ui-panel-soft space-y-2 p-4 text-sm text-[var(--ui-muted)]">
          <p>1) Usa un pasillo corto y estable para que el LOC no cambie de significado.</p>
          <p>2) Usa nivel solo cuando realmente exista estructura vertical que operacion reconozca.</p>
          <p>3) El codigo final debe ser entendible para conteo, recepcion y scanner.</p>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Confirmacion final</div>
          <p className="mt-1 ui-caption">
            Este es el ultimo control antes de crear la ubicacion y dejarla visible en operacion.
          </p>
        </div>

        <label className="flex items-start gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span className="ui-caption">Confirmo que la ubicacion y el codigo son correctos.</span>
        </label>
      </section>

      <div className="ui-mobile-sticky-footer flex flex-wrap items-center justify-end gap-2">
        <button
          type="submit"
          disabled={!canSubmit || !confirmed}
          className="ui-btn ui-btn--brand disabled:opacity-50"
        >
          Crear ubicacion
        </button>
      </div>
    </form>
  );
}
