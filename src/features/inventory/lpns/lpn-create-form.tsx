"use client";

import { useMemo, useState } from "react";

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

function yymmBogota() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "2-digit",
    month: "2-digit",
  }).formatToParts(new Date());

  const yy = parts.find((p) => p.type === "year")?.value ?? "00";
  const mm = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${yy}${mm}`;
}

export function LpnCreateForm({ defaultSiteId, action }: Props) {
  const [sede, setSede] = useState<SiteCode>("CP");
  const [manualSiteId, setManualSiteId] = useState("");

  const yymm = useMemo(() => yymmBogota(), []);
  const preview = useMemo(() => `LPN-${sede}-${yymm}-AUTO`, [sede, yymm]);

  const siteIdToUse = defaultSiteId || manualSiteId.trim();
  const canSubmit = Boolean(siteIdToUse);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Crear LPN</div>
          <div className="mt-1 text-sm text-zinc-600">
            Formato: <span className="font-mono">LPN-SEDE-AAMM-SEQ</span>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
          Preview: <span className="font-mono text-zinc-900">{preview}</span>
        </div>
      </div>

      <form action={action} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {defaultSiteId ? (
          <input type="hidden" name="site_id" value={defaultSiteId} />
        ) : (
          <label className="md:col-span-2 flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-700">Site ID (requerido)</span>
            <input
              value={manualSiteId}
              onChange={(e) => setManualSiteId(e.target.value)}
              name="site_id"
              required
              placeholder="uuid del site"
              className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400"
            />
          </label>
        )}

        <input type="hidden" name="sede_code" value={sede} />

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
            Código: <span className="font-mono">{sede}</span> · AAMM: <span className="font-mono">{yymm}</span>
          </div>
        </label>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          <div className="font-semibold text-zinc-900">Notas</div>
          <div className="mt-1 text-sm text-zinc-600">
            El consecutivo (SEQ) se calcula automáticamente al crear.
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="md:col-span-2 inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          Crear LPN
        </button>
      </form>

      {defaultSiteId ? (
        <div className="mt-3 text-xs text-zinc-500">
          Site detectado: <span className="font-mono">{defaultSiteId}</span>
        </div>
      ) : null}
    </div>
  );
}
