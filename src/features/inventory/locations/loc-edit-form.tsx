"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { STANDARD_LOCATION_ZONES } from "./location-form-options";

type LocRow = {
  id: string;
  code: string | null;
  zone: string | null;
  aisle: string | null;
  level: string | null;
  description?: string | null;
};

type Props = {
  loc: LocRow;
  action: (formData: FormData) => Promise<void>;
  cancelHref: string;
};

export function LocEditForm({ loc, action, cancelHref }: Props) {
  const [code, setCode] = useState(loc.code ?? "");
  const [zone, setZone] = useState(loc.zone ?? "");
  const [aisle, setAisle] = useState(loc.aisle ?? "");
  const [level, setLevel] = useState(loc.level ?? "");
  const [description, setDescription] = useState(loc.description ?? "");

  const canSubmit = useMemo(() => Boolean(code.trim()) && Boolean(zone.trim()), [code, zone]);
  const zoneOptions = useMemo(() => {
    const normalizedZone = zone.trim().toUpperCase();
    if (!normalizedZone) return STANDARD_LOCATION_ZONES;
    if (STANDARD_LOCATION_ZONES.some((option) => option.code === normalizedZone)) {
      return STANDARD_LOCATION_ZONES;
    }
    return [{ code: normalizedZone, label: `${normalizedZone} (actual)` }, ...STANDARD_LOCATION_ZONES];
  }, [zone]);

  return (
    <form action={action} className="mt-6 space-y-6 pb-24 lg:pb-0">
      <input type="hidden" name="loc_id" value={loc.id} />
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="zone" value={zone} />
      <input type="hidden" name="aisle" value={aisle} />
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="description" value={description} />

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-2 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Ubicación</div>
            <div className="ui-caption mt-1">Corrige identidad y zona del LOC seleccionado.</div>
          </div>
          <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
            {loc.id.slice(0, 8)}
          </div>
        </div>

        <div className="grid gap-3 ui-mobile-stack md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Codigo</span>
            <input
              type="text"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
              }}
              className="ui-input"
              placeholder="LOC-CP-BOD-EST01"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Zona</span>
            <select
              value={zone}
              onChange={(event) => {
                setZone(event.target.value.toUpperCase());
              }}
              className="ui-input"
            >
              {zoneOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="ui-caption">Codigo y zona son obligatorios para guardar.</div>
      </section>

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-3 space-y-4">
        <div className="ui-h3">Detalle</div>

        <div className="grid gap-3 ui-mobile-stack md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Pasillo</span>
            <input
              type="text"
              value={aisle}
              onChange={(event) => {
                setAisle(event.target.value.toUpperCase());
              }}
              className="ui-input"
              placeholder="EST01"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Nivel</span>
            <input
              type="text"
              value={level}
              onChange={(event) => {
                setLevel(event.target.value.toUpperCase());
              }}
              className="ui-input"
              placeholder="N0"
            />
          </label>
          <label className="flex flex-col gap-1 md:col-span-3">
            <span className="ui-label">Descripcion</span>
            <input
              type="text"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              className="ui-input"
              placeholder="Descripcion opcional"
            />
          </label>
        </div>
      </section>

      <div className="ui-mobile-sticky-footer ui-fade-up ui-delay-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] bg-white/92 px-4 py-3 backdrop-blur">
        <div className="text-sm text-[var(--ui-muted)]">
          {code || "-"} · {zone || "-"}
        </div>
        <Link href={cancelHref} className="ui-btn ui-btn--ghost">
          Cancelar
        </Link>
        <button type="submit" className="ui-btn ui-btn--brand" disabled={!canSubmit}>
          Guardar
        </button>
      </div>
    </form>
  );
}
