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
            <div className="ui-h3">Nombre y zona</div>
            <div className="ui-caption mt-1">Primero corrige lo que la gente usa para reconocer esta ubicación.</div>
          </div>
          <div className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
            {loc.zone ?? "Sin zona"}
          </div>
        </div>

        <div className="grid gap-3 ui-mobile-stack md:grid-cols-2">
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="ui-label">Nombre visible del área</span>
            <input
              type="text"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              className="ui-input"
              placeholder="Descripcion corta para reconocerlo rapido"
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

        <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
          {description.trim()
            ? `Esta área se mostrara como "${description.trim()}" en la operacion.`
            : "Si le das un nombre corto, será más fácil encontrarlo al preparar o retirar stock."}
        </div>
      </section>

      <details className="ui-panel ui-remission-section ui-fade-up ui-delay-3 space-y-4">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Codigo tecnico</div>
            <div className="ui-caption mt-1">Abre esto solo si necesitas corregir el identificador interno.</div>
          </div>
          <span className="ui-chip">Opcional</span>
        </summary>

        <div className="grid gap-3 pt-2 ui-mobile-stack md:grid-cols-2">
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
        </div>

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
        </div>

        <div className="ui-caption">Codigo y zona siguen siendo obligatorios para guardar.</div>
      </details>

      <div className="ui-mobile-sticky-footer ui-fade-up ui-delay-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] bg-white/92 px-4 py-3 backdrop-blur">
        <div className="text-sm text-[var(--ui-muted)]">
          {description.trim() || code || "-"} · {zone || "-"}
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
