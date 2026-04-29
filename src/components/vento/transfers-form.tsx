"use client";

import { useMemo, useState } from "react";

import { type ProductUomProfile } from "@/lib/inventory/uom";

import { TransfersItems } from "./transfers-items";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
};

type LocOption = {
  id: string;
  code: string | null;
  description: string | null;
};

type Props = {
  locations: LocOption[];
  products: ProductOption[];
  defaultUomProfiles?: ProductUomProfile[];
  action: (formData: FormData) => void | Promise<void>;
};

export function TransfersForm({ locations, products, defaultUomProfiles = [], action }: Props) {
  const [fromLocId, setFromLocId] = useState("");
  const [toLocId, setToLocId] = useState("");
  const [notes, setNotes] = useState("");

  const selectedFrom = useMemo(
    () => locations.find((loc) => loc.id === fromLocId) ?? null,
    [fromLocId, locations]
  );
  const selectedTo = useMemo(
    () => locations.find((loc) => loc.id === toLocId) ?? null,
    [toLocId, locations]
  );
  const hasOrigin = Boolean(fromLocId);
  const sameLocation = fromLocId !== "" && fromLocId === toLocId;
  const canSubmit = Boolean(fromLocId) && Boolean(toLocId) && !sameLocation;
  const destinationOptions = useMemo(
    () => locations.filter((loc) => loc.id !== fromLocId),
    [fromLocId, locations]
  );

  return (
    <form className="space-y-6 pb-24 lg:pb-0" action={action}>
      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Ruta</div>
            <div className="ui-caption mt-1">Selecciona el area de salida y el area de llegada.</div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {selectedFrom ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-900">
                Origen {selectedFrom.code ?? selectedFrom.description}
              </span>
            ) : null}
            {selectedTo ? (
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-900">
                Destino {selectedTo.code ?? selectedTo.description}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 ui-mobile-stack md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Area origen</span>
            <select
              name="from_loc_id"
              className="ui-input"
              value={fromLocId}
              onChange={(event) => setFromLocId(event.target.value)}
              required
            >
              <option value="">Selecciona area origen</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code ?? loc.description ?? loc.id}
                </option>
              ))}
            </select>
          </label>

          {hasOrigin ? (
            <label className="flex flex-col gap-1">
              <span className="ui-label">Area destino</span>
              <select
                name="to_loc_id"
                className="ui-input"
                value={toLocId}
                onChange={(event) => setToLocId(event.target.value)}
                required
              >
                <option value="">Selecciona area destino</option>
                {destinationOptions.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code ?? loc.description ?? loc.id}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-4 text-sm text-[var(--ui-muted)]">
              Primero elige el origen. Enseguida aparece el destino.
            </div>
          )}
        </div>

        {hasOrigin ? (
          <details className="rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
              Nota opcional
            </summary>
            <div className="mt-3">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Notas</span>
                <input
                  name="notes"
                  className="ui-input"
                  placeholder="Observaciones del traslado"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </div>
          </details>
        ) : null}

        {sameLocation ? (
          <div className="ui-alert ui-alert--error">
            Origen y destino no pueden ser iguales.
          </div>
        ) : null}
      </section>

      {canSubmit ? (
        <section className="ui-panel ui-remission-section ui-fade-up ui-delay-2 space-y-4 !overflow-visible">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="ui-h3">Productos</div>
              <div className="ui-caption mt-1">Captura lo que realmente se mueve entre ambas areas.</div>
            </div>
            <div className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
              {locations.length} areas disponibles
            </div>
          </div>

          <TransfersItems products={products} defaultUomProfiles={defaultUomProfiles} />
        </section>
      ) : (
        <section className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
          <div className="ui-alert ui-alert--neutral">
            Primero define origen y destino. Luego aparecen los productos del traslado.
          </div>
        </section>
      )}

      <div className="ui-mobile-sticky-footer ui-fade-up ui-delay-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] bg-white/92 px-4 py-3 backdrop-blur">
        <div className="text-sm text-[var(--ui-muted)]">
          {(selectedFrom?.code ?? selectedFrom?.description ?? "Sin origen")} -&gt;{" "}
          {selectedTo?.code ?? selectedTo?.description ?? "Sin destino"}
        </div>
        <button type="submit" className="ui-btn ui-btn--brand h-12 px-5 text-base font-semibold" disabled={!canSubmit}>
          Registrar traslado
        </button>
      </div>
    </form>
  );
}
