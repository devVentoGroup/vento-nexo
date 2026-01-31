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
  createCpTemplateAction?: (formData: FormData) => void | Promise<void>;
};

const ZONE_CUSTOM = "__CUSTOM__";

const ZONES_BY_SITE: Record<
  SiteCode,
  Array<{ code: string; label: string }>
> = {
  CP: [
    { code: "BOD", label: "Bodega seca (BOD)" },
    { code: "EMP", label: "Empaques / Estibas (EMP)" },
    { code: "REC", label: "Recepción / Staging (REC)" },
    { code: "DSP", label: "Despacho (DSP)" },
  ],
  SAU: [
    { code: "BOD", label: "Bodega (BOD)" },
    { code: "COC", label: "Cocina (COC)" },
    { code: "BAR", label: "Bar (BAR)" },
    { code: "OFI", label: "Oficina (OFI)" },
    { code: "EXT", label: "Externo (EXT)" },
  ],
  VCF: [
    { code: "BOD", label: "Bodega (BOD)" },
    { code: "COC", label: "Cocina (COC)" },
    { code: "BAR", label: "Bar (BAR)" },
    { code: "OFI", label: "Oficina (OFI)" },
    { code: "EXT", label: "Externo (EXT)" },
  ],
  VGR: [
    { code: "OFI", label: "Oficina (OFI)" },
    { code: "BOD", label: "Bodega (BOD)" },
    { code: "EXT", label: "Externo (EXT)" },
  ],
};

function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
}

function pad2FromNumberString(v: string) {
  const n = digitsOnly(v).slice(0, 2);
  if (!n) return "00";
  return n.length === 1 ? `0${n}` : n;
}

function toLevelCode(v: string) {
  const n = digitsOnly(v).slice(0, 2);
  return `N${n ? n : "0"}`;
}

export function LocCreateForm({
  sites,
  defaultSiteId,
  action,
  createCpTemplateAction,
}: Props) {
  const initialSiteId = defaultSiteId || sites[0]?.id || "";
  const [selectedSiteId, setSelectedSiteId] = useState(initialSiteId);

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );

  const siteCode: SiteCode = selectedSite?.code ?? "CP";
  const zonesForSite = ZONES_BY_SITE[siteCode] ?? ZONES_BY_SITE.CP;

  const [zoneChoice, setZoneChoice] = useState<string>(
    zonesForSite[0]?.code ?? "BOD",
  );
  const [customZone, setCustomZone] = useState("");

  // CP: identificadores por zona
  const [cpShelfNumber, setCpShelfNumber] = useState("1"); // BOD
  const [cpPalletNumber, setCpPalletNumber] = useState("1"); // EMP
  const [cpRecState, setCpRecState] = useState<"PEND" | "OK" | "QUAR">("PEND"); // REC

  // No-CP: pasillo/nivel clásico
  const [aisleNumber, setAisleNumber] = useState("1");
  const [levelNumber, setLevelNumber] = useState("0");

  const [description, setDescription] = useState("");

  const zoneFinal = useMemo(() => {
    if (zoneChoice === ZONE_CUSTOM)
      return (customZone || "").trim().toUpperCase();
    return (zoneChoice || "").trim().toUpperCase();
  }, [zoneChoice, customZone]);

  const computed = useMemo(() => {
    const s = (siteCode || "").trim().toUpperCase();
    const z = (zoneFinal || "").trim().toUpperCase();
    if (!s || !z) return { code: "", aisle: "", level: "" };

    // Reglas CP definitivas
    if (s === "CP") {
      if (z === "BOD") {
        const aisle = `EST${pad2FromNumberString(cpShelfNumber)}`;
        return { code: `LOC-${s}-BOD-${aisle}`, aisle, level: "" };
      }
      if (z === "EMP") {
        const aisle = `ESTIBA${pad2FromNumberString(cpPalletNumber)}`;
        return { code: `LOC-${s}-EMP-${aisle}`, aisle, level: "" };
      }
      if (z === "REC") {
        const aisle = cpRecState;
        return { code: `LOC-${s}-REC-${aisle}`, aisle, level: "" };
      }
      if (z === "DSP") {
        const aisle = "MAIN";
        return { code: `LOC-${s}-DSP-${aisle}`, aisle, level: "" };
      }

      // CP + zona custom: fallback simple
      const aisle = `EST${pad2FromNumberString(cpShelfNumber)}`;
      return { code: `LOC-${s}-${z}-${aisle}`, aisle, level: "" };
    }

    // No-CP: patrón clásico LOC-SEDE-ZONA-PASILLO-NIVEL
    const aisle = pad2FromNumberString(aisleNumber);
    const level = toLevelCode(levelNumber);
    return { code: `LOC-${s}-${z}-${aisle}-${level}`, aisle, level };
  }, [
    siteCode,
    zoneFinal,
    cpShelfNumber,
    cpPalletNumber,
    cpRecState,
    aisleNumber,
    levelNumber,
  ]);

  const siteIdToSend = selectedSiteId || defaultSiteId || "";
  const canSubmit =
    Boolean(siteIdToSend) && Boolean(zoneFinal) && Boolean(computed.code);

  return (
    <div className="ui-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="ui-body font-semibold">Crear LOC</div>
          <div className="mt-1 ui-body-muted">
            CP: <span className="font-mono">BOD/EMP/REC/DSP</span> (definitivo).
          </div>
        </div>

        <div className="rounded-xl bg-zinc-50 px-3 py-2 ui-caption">
          Preview:{" "}
          <span className="font-mono text-zinc-900">
            {computed.code || "—"}
          </span>
        </div>
      </div>

      {/* FORM: crear LOC individual */}
      <form
        action={action}
        className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        {/* site_id */}
        {sites.length > 0 ? (
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="ui-caption font-semibold">SEDE</span>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="h-11 rounded-xl border border-zinc-200 bg-white px-3 ui-body outline-none focus:border-zinc-400"
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} ({s.code})
                </option>
              ))}
            </select>
            <div className="text-[11px] text-zinc-500">
              Site ID: <span className="font-mono">{siteIdToSend}</span>
            </div>
          </label>
        ) : (
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="ui-caption font-semibold">
              Site ID (requerido)
            </span>
            <input
              name="site_id"
              required
              placeholder="uuid del site"
              className="h-11 rounded-xl border border-zinc-200 bg-white px-4 ui-body outline-none focus:border-zinc-400"
            />
          </label>
        )}

        {/* valores canónicos al server action */}
        <input type="hidden" name="site_id" value={siteIdToSend} />
        <input type="hidden" name="site_code" value={siteCode} />
        <input type="hidden" name="code" value={computed.code} />
        <input type="hidden" name="zone" value={zoneFinal} />
        <input type="hidden" name="aisle" value={computed.aisle} />
        <input type="hidden" name="level" value={computed.level} />

        {/* ZONA */}
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-semibold">ZONA</span>
          <select
            value={zoneChoice}
            onChange={(e) => setZoneChoice(e.target.value)}
            className="h-11 rounded-xl border border-zinc-200 bg-white px-3 ui-body outline-none focus:border-zinc-400"
          >
            {zonesForSite.map((z) => (
              <option key={z.code} value={z.code}>
                {z.label}
              </option>
            ))}
            <option value={ZONE_CUSTOM}>Otra… (escribir)</option>
          </select>

          {zoneChoice === ZONE_CUSTOM ? (
            <input
              value={customZone}
              onChange={(e) => setCustomZone(e.target.value.toUpperCase())}
              placeholder="Ej: HV (alto valor)"
              className="mt-2 h-11 rounded-xl border border-zinc-200 bg-white px-4 ui-body outline-none focus:border-zinc-400"
            />
          ) : null}

          <div className="text-[11px] text-zinc-500">
            Guardado como: <span className="font-mono">{zoneFinal || "—"}</span>
          </div>
        </label>

        {/* Identificador dinámico */}
        {siteCode === "CP" && zoneFinal === "BOD" ? (
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">
              ESTANTERÍA (1–12)
            </span>
            <input
              value={cpShelfNumber}
              onChange={(e) => setCpShelfNumber(digitsOnly(e.target.value))}
              inputMode="numeric"
              placeholder="1"
              className="h-11 rounded-xl border border-zinc-200 bg-white px-4 ui-body outline-none focus:border-zinc-400"
            />
            <div className="text-[11px] text-zinc-500">
              Aisle: <span className="font-mono">{computed.aisle || "—"}</span>
            </div>
          </label>
        ) : null}

        {siteCode === "CP" && zoneFinal === "EMP" ? (
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">
              ESTIBA (1–2)
            </span>
            <input
              value={cpPalletNumber}
              onChange={(e) => setCpPalletNumber(digitsOnly(e.target.value))}
              inputMode="numeric"
              placeholder="1"
              className="h-11 rounded-xl border border-zinc-200 bg-white px-4 ui-body outline-none focus:border-zinc-400"
            />
            <div className="text-[11px] text-zinc-500">
              Aisle: <span className="font-mono">{computed.aisle || "—"}</span>
            </div>
          </label>
        ) : null}

        {siteCode === "CP" && zoneFinal === "REC" ? (
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">
              ESTADO RECEPCIÓN
            </span>
            <select
              value={cpRecState}
              onChange={(e) => setCpRecState(e.target.value as any)}
              className="h-11 rounded-xl border border-zinc-200 bg-white px-3 ui-body outline-none focus:border-zinc-400"
            >
              <option value="PEND">PEND (pendiente)</option>
              <option value="OK">OK (revisado)</option>
              <option value="QUAR">QUAR (cuarentena)</option>
            </select>
            <div className="text-[11px] text-zinc-500">
              Aisle: <span className="font-mono">{computed.aisle || "—"}</span>
            </div>
          </label>
        ) : null}

        {siteCode === "CP" && zoneFinal === "DSP" ? (
          <div className="ui-alert ui-alert--neutral">
            Despacho es único. Aisle fijo:{" "}
            <span className="font-mono">MAIN</span>
          </div>
        ) : null}

        {/* No-CP: pasillo + nivel */}
        {siteCode !== "CP" ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="ui-caption font-semibold">
                PASILLO
              </span>
              <input
                value={aisleNumber}
                onChange={(e) => setAisleNumber(digitsOnly(e.target.value))}
                inputMode="numeric"
                placeholder="1"
                className="h-11 rounded-xl border border-zinc-200 bg-white px-4 ui-body outline-none focus:border-zinc-400"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-caption font-semibold">NIVEL</span>
              <input
                value={levelNumber}
                onChange={(e) => setLevelNumber(digitsOnly(e.target.value))}
                inputMode="numeric"
                placeholder="0"
                className="h-11 rounded-xl border border-zinc-200 bg-white px-4 ui-body outline-none focus:border-zinc-400"
              />
            </label>
          </>
        ) : null}

        <label className="md:col-span-2 flex flex-col gap-1">
          <span className="ui-caption font-semibold">
            Descripción (opcional)
          </span>
          <input
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Estantería 3 (insumos secos)"
            className="h-11 rounded-xl border border-zinc-200 bg-white px-4 ui-body outline-none focus:border-zinc-400"
          />
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="md:col-span-2 ui-btn ui-btn--brand disabled:opacity-40"
        >
          Crear LOC
        </button>
      </form>

      {/* Plantilla CP */}
      {siteCode === "CP" && createCpTemplateAction ? (
        <div className="mt-6 ui-panel">
          <div className="ui-body font-semibold">
            Inicializar Centro de Producción (Plantilla)
          </div>
          <div className="mt-1 ui-body-muted">
            Crea LOCs base definitivos: BOD(12 estanterías) + EMP(2 estibas) +
            REC(PEND/OK/QUAR) + DSP(MAIN).
          </div>

          <form
            action={createCpTemplateAction}
            className="mt-4 flex items-center gap-3"
          >
            <input type="hidden" name="site_id" value={siteIdToSend} />
            <input type="hidden" name="site_code" value={siteCode} />
            <button
              type="submit"
              disabled={!siteIdToSend}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
            >
              Crear LOCs base (CP)
            </button>
          </form>

          <div className="mt-3 ui-caption">
            Recomendación operativa: imprime estas etiquetas primero y pégalas
            físicamente.
          </div>
        </div>
      ) : null}
    </div>
  );
}






