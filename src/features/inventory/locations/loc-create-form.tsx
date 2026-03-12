"use client";

import { useMemo, useState } from "react";

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

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-2 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Ubicación</div>
            <div className="ui-caption mt-1">Define la sede y la zona operativa.</div>
          </div>
          <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
            {selectedSite?.code ?? "Sin sede"}
          </div>
        </div>

        <div className="grid gap-4 ui-mobile-stack sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede</span>
            <select
              value={siteId}
              onChange={(event) => {
                setSiteId(event.target.value);
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

      </section>

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-3 space-y-4">
        <div className="ui-h3">Código</div>

        <div className="grid gap-4 ui-mobile-stack sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Pasillo / identificador</span>
            <input
              type="text"
              value={aisle}
              onChange={(event) => {
                setAisle(event.target.value.toUpperCase().replace(/\s/g, ""));
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
      </section>

      <div className="ui-mobile-sticky-footer ui-fade-up ui-delay-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] bg-white/92 px-4 py-3 backdrop-blur">
        <div className="text-sm text-[var(--ui-muted)]">
          {selectedSite?.label ?? "Sin sede"} · {codigoGenerado || "-"}
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="ui-btn ui-btn--brand disabled:opacity-50"
        >
          Crear ubicacion
        </button>
      </div>
    </form>
  );
}
