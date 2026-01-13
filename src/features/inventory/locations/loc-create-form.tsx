"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  defaultSiteId: string;
  action: (formData: FormData) => void | Promise<void>;
};

type SiteCode = "CP" | "SAU" | "VCF" | "VGR";

const SITES: Array<{ code: SiteCode; label: string }> = [
  { code: "CP", label: "Centro de Producción" },
  { code: "SAU", label: "Saudo" },
  { code: "VCF", label: "Vento Café" },
  { code: "VGR", label: "Vento Group (Oficina)" },
];

const ZONE_CUSTOM = "__CUSTOM__";

// Zonas iniciales (las afinamos después). Lo importante es el patrón: depende de sede.
const ZONES_BY_SITE: Record<SiteCode, Array<{ code: string; label: string }>> = {
  CP: [
    { code: "F1FRI", label: "Piso 1 · Neveras (F1FRI)" },
    { code: "F1CON", label: "Piso 1 · Congeladores (F1CON)" },
    { code: "F1CF", label: "Piso 1 · Cuarto Frío (F1CF)" },
    { code: "F1CC", label: "Piso 1 · Cuarto Congelación (F1CC)" },
    { code: "F2FRI", label: "Piso 2 · Neveras (F2FRI)" },
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

export function LocCreateForm({ defaultSiteId, action }: Props) {
  const [sede, setSede] = useState<SiteCode>("CP");

  // Zona: selección lista o custom
  const zonesForSite = ZONES_BY_SITE[sede] ?? [];
  const [zoneChoice, setZoneChoice] = useState<string>(zonesForSite[0]?.code ?? "F1FRI");
  const [customZone, setCustomZone] = useState("");

  // Pasillo / Nivel en UI como número (sin prefijos)
  const [aisleNumber, setAisleNumber] = useState("1");
  const [levelNumber, setLevelNumber] = useState("0");

  const [description, setDescription] = useState("");

  // Si cambia la sede, ajusta zona por defecto (si estabas en una zona que no existe en esa sede)
  useEffect(() => {
    const allowed = new Set(zonesForSite.map((z) => z.code));
    if (zoneChoice === ZONE_CUSTOM) return;
    if (!allowed.has(zoneChoice)) {
      setZoneChoice(zonesForSite[0]?.code ?? ZONE_CUSTOM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sede]);

  const zoneFinal = useMemo(() => {
    if (zoneChoice === ZONE_CUSTOM) return (customZone || "").trim().toUpperCase();
    return (zoneChoice || "").trim().toUpperCase();
  }, [zoneChoice, customZone]);

  const aisleCode = useMemo(() => pad2FromNumberString(aisleNumber), [aisleNumber]);
  const levelCode = useMemo(() => toLevelCode(levelNumber), [levelNumber]);

  const computedCode = useMemo(() => {
    const s = (sede || "").trim().toUpperCase();
    const z = (zoneFinal || "").trim().toUpperCase();
    if (!s || !z) return "";
    return `LOC-${s}-${z}-${aisleCode}-${levelCode}`;
  }, [sede, zoneFinal, aisleCode, levelCode]);

  const canSubmit = Boolean(defaultSiteId) && Boolean(zoneFinal) && Boolean(computedCode);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Crear LOC</div>
          <div className="mt-1 text-sm text-zinc-600">
            Generador: <span className="font-mono">LOC-SEDE-ZONA-PASILLO-NIVEL</span>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
          Preview:{" "}
          <span className="font-mono text-zinc-900">{computedCode || "—"}</span>
        </div>
      </div>

      <form action={action} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* site_id */}
        {defaultSiteId ? (
          <input type="hidden" name="site_id" value={defaultSiteId} />
        ) : (
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs font-semibold text-zinc-700">Site ID (requerido)</span>
            <input
              name="site_id"
              required
              placeholder="uuid del site"
              className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400"
            />
          </label>
        )}

        {/* valores canónicos que llegan al server action */}
        <input type="hidden" name="code" value={computedCode} />
        <input type="hidden" name="zone" value={zoneFinal} />
        <input type="hidden" name="aisle" value={aisleCode} />
        <input type="hidden" name="level" value={levelCode} />

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-zinc-700">SEDE</span>
          <select
            value={sede}
            onChange={(e) => setSede(e.target.value as SiteCode)}
            className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
          >
            {SITES.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="text-[11px] text-zinc-500">
            Código: <span className="font-mono">{sede}</span>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-zinc-700">ZONA</span>
          <select
            value={zoneChoice}
            onChange={(e) => setZoneChoice(e.target.value)}
            className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
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
              placeholder="Ej: F2CC"
              className="mt-2 h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400"
            />
          ) : null}

          <div className="text-[11px] text-zinc-500">
            Guardado como: <span className="font-mono">{zoneFinal || "—"}</span>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-zinc-700">PASILLO</span>
          <input
            value={aisleNumber}
            onChange={(e) => setAisleNumber(digitsOnly(e.target.value))}
            inputMode="numeric"
            placeholder="1"
            className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400"
          />
          <div className="text-[11px] text-zinc-500">
            Código: <span className="font-mono">{aisleCode}</span>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-zinc-700">NIVEL</span>
          <input
            value={levelNumber}
            onChange={(e) => setLevelNumber(digitsOnly(e.target.value))}
            inputMode="numeric"
            placeholder="0"
            className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400"
          />
          <div className="text-[11px] text-zinc-500">
            Código: <span className="font-mono">{levelCode}</span>
          </div>
        </label>

        <label className="md:col-span-2 flex flex-col gap-1">
          <span className="text-xs font-semibold text-zinc-700">Descripción (opcional)</span>
          <input
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Nevera 1 - bandeja superior"
            className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400"
          />
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="md:col-span-2 inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          Crear LOC
        </button>
      </form>

      {defaultSiteId ? (
        <div className="mt-3 text-xs text-zinc-500">
          Site detectado: <span className="font-mono">{defaultSiteId}</span>
        </div>
      ) : (
        <div className="mt-3 text-xs text-zinc-500">
          No pude inferir tu site automáticamente; pega el UUID una vez y luego lo automatizamos.
        </div>
      )}
    </div>
  );
}
