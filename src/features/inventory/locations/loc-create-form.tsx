"use client";

import { useMemo, useState } from "react";

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

/** Convención estándar: LOC-{SEDE}-{ZONA}-{PASILLO} o LOC-{SEDE}-{ZONA}-{PASILLO}-{NIVEL} */
const ZONAS_ESTANDAR = [
  { code: "BOD", label: "Bodega (BOD)" },
  { code: "EMP", label: "Empaques / Estibas (EMP)" },
  { code: "REC", label: "Recepción (REC)" },
  { code: "DSP", label: "Despacho (DSP)" },
  { code: "BODEGA", label: "Bodega general" },
  { code: "FRIO", label: "Cuarto frío" },
  { code: "CONG", label: "Congelación" },
  { code: "N2P", label: "Nevera 2 puertas" },
  { code: "N3P", label: "Nevera 3 puertas" },
  { code: "SECOS1", label: "Secos primer piso" },
  { code: "SECPREP", label: "Secos preparados" },
  { code: "COC", label: "Cocina (COC)" },
  { code: "BAR", label: "Bar (BAR)" },
  { code: "OFI", label: "Oficina (OFI)" },
  { code: "EXT", label: "Externo (EXT)" },
];

export function LocCreateForm({
  sites,
  defaultSiteId,
  action,
}: Props) {
  const initialSiteId = defaultSiteId || sites[0]?.id || "";
  const [siteId, setSiteId] = useState(initialSiteId);
  const [zone, setZone] = useState("BOD");
  const [aisle, setAisle] = useState("MAIN");
  const [level, setLevel] = useState("");
  const [description, setDescription] = useState("");

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === siteId) ?? null,
    [sites, siteId],
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
    <div className="ui-panel">
      <div className="mb-4">
        <h2 className="ui-h3">Nueva ubicación</h2>
        <p className="mt-1 ui-body-muted">
          Convención: <span className="font-mono">LOC-SEDE-ZONA-PASILLO</span> o{" "}
          <span className="font-mono">LOC-SEDE-ZONA-PASILLO-NIVEL</span>. Ej: LOC-CP-BOD-EST01, LOC-VGR-FRIO-MAIN.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="site_id" value={siteIdToSend} />
        <input type="hidden" name="code" value={codigoGenerado} />
        <input type="hidden" name="zone" value={zoneUpper} />
        <input type="hidden" name="aisle" value={aisleUpper} />
        <input type="hidden" name="level" value={levelUpper} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">Sede</span>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="ui-input"
              required
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.code})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">Zona</span>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="ui-input"
              required
            >
              {ZONAS_ESTANDAR.map((z) => (
                <option key={z.code} value={z.code}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">Pasillo / identificador</span>
            <input
              type="text"
              value={aisle}
              onChange={(e) => setAisle(e.target.value.toUpperCase().replace(/\s/g, ""))}
              placeholder="MAIN, EST01, PEND…"
              className="ui-input"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">Nivel (opcional)</span>
            <input
              type="text"
              value={level}
              onChange={(e) => setLevel(e.target.value.toUpperCase().replace(/\s/g, ""))}
              placeholder="N0, 1…"
              className="ui-input"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="ui-caption font-semibold">Descripción (opcional)</span>
          <input
            type="text"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Estantería 1, Cuarto frío principal"
            className="ui-input"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 ui-caption">
            <span className="text-[var(--ui-muted)]">Código: </span>
            <span className="font-mono font-semibold text-[var(--ui-text)]">
              {codigoGenerado || "—"}
            </span>
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="ui-btn ui-btn--brand disabled:opacity-50"
          >
            Crear ubicación
          </button>
        </div>
      </form>
    </div>
  );
}
