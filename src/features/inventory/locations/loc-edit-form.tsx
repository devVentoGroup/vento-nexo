"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { StepHelp } from "@/components/inventory/forms/StepHelp";

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
  const [confirmed, setConfirmed] = useState(false);

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

      <section className="ui-panel-soft space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Editar LOC en una sola vista</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Aqui corriges identidad y metadatos del LOC sin navegar por pasos ocultos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">Edicion de LOC</span>
            <span className="ui-chip">LOC {loc.code ?? loc.id}</span>
          </div>
        </div>
        <p className="text-sm text-[var(--ui-muted)]">
          La idea es que crear y editar se sientan casi iguales: mismo criterio visual y misma logica de confirmacion.
        </p>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Identidad operativa</div>
          <p className="mt-1 ui-caption">
            Corrige el codigo visible y la zona principal del LOC manteniendo una convención legible para operacion.
          </p>
        </div>

        <div className="grid gap-3 ui-mobile-stack md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Codigo</span>
            <input
              type="text"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
                setConfirmed(false);
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
                setConfirmed(false);
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

        <StepHelp
          meaning="Este bloque controla la identidad visible del LOC en la operacion."
          whenToUse="Usalo cuando el codigo, la zona o la nomenclatura deban corregirse."
          example="Corregir LOC-CP-BOD-EST1 a LOC-CP-BOD-EST01."
          impact="Evita ambiguedades en conteo, scanner y movimientos."
        />
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Metadatos fisicos</div>
          <p className="mt-1 ui-caption">
            Actualiza pasillo, nivel y descripcion para reflejar la ubicacion real dentro de la zona.
          </p>
        </div>

        <div className="grid gap-3 ui-mobile-stack md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Pasillo</span>
            <input
              type="text"
              value={aisle}
              onChange={(event) => {
                setAisle(event.target.value.toUpperCase());
                setConfirmed(false);
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
                setConfirmed(false);
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
                setConfirmed(false);
              }}
              className="ui-input"
              placeholder="Descripcion opcional"
            />
          </label>
        </div>

        <StepHelp
          meaning="Estos metadatos ayudan a entender la posicion fisica del LOC."
          whenToUse="Completa o corrige estos campos cuando operacion necesite mas precision."
          example="Pasillo EST01, nivel N2, descripcion Estanteria lateral."
          impact="Facilita conteo fisico, recepcion y ubicacion de producto."
        />
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Revision operativa</div>
          <p className="mt-1 ui-caption">
            Antes de guardar, valida que el LOC actualizado siga siendo reconocible y consistente para el equipo.
          </p>
        </div>

        <div className="grid gap-3 ui-mobile-stack sm:grid-cols-2 xl:grid-cols-4">
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Codigo</div>
            <div className="mt-1 font-mono font-semibold">{code || "-"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Zona</div>
            <div className="mt-1 font-semibold">{zone || "-"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Pasillo</div>
            <div className="mt-1 font-semibold">{aisle || "-"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Nivel</div>
            <div className="mt-1 font-semibold">{level || "-"}</div>
          </div>
        </div>

        <div className="ui-panel-soft space-y-2 p-4 text-sm text-[var(--ui-muted)]">
          <p>1) Mantén un codigo estable para no romper referencias operativas.</p>
          <p>2) La zona debe reflejar la realidad fisica, no un nombre administrativo.</p>
          <p>3) Si el cambio puede confundir al equipo, actualiza tambien la descripcion.</p>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Confirmacion final</div>
          <p className="mt-1 ui-caption">
            Este es el ultimo control antes de guardar los cambios del LOC.
          </p>
        </div>

        <label className="flex items-start gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span className="ui-caption">Confirmo que revise los cambios del LOC antes de guardar.</span>
        </label>
      </section>

      <div className="ui-mobile-sticky-footer flex flex-wrap items-center justify-end gap-2">
        <Link href={cancelHref} className="ui-btn ui-btn--ghost">
          Cancelar
        </Link>
        <button type="submit" className="ui-btn ui-btn--brand" disabled={!canSubmit || !confirmed}>
          Guardar
        </button>
      </div>
    </form>
  );
}
