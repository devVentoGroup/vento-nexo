"use client";

import { useMemo, useState } from "react";

import { StepHelp } from "@/components/inventory/forms/StepHelp";
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
  name: string | null;
};

type Props = {
  locations: LocOption[];
  products: ProductOption[];
  defaultUomProfiles?: ProductUomProfile[];
  action: (formData: FormData) => void | Promise<void>;
};

export function TransfersForm({ locations, products, defaultUomProfiles = [], action }: Props) {
  const [confirmed, setConfirmed] = useState(false);
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
  const sameLocation = fromLocId !== "" && fromLocId === toLocId;
  const reviewRows = useMemo(
    () => [
      {
        label: "Origen",
        value: selectedFrom?.code ?? selectedFrom?.name ?? "Sin LOC origen",
      },
      {
        label: "Destino",
        value: selectedTo?.code ?? selectedTo?.name ?? "Sin LOC destino",
      },
      {
        label: "Regla operativa",
        value: sameLocation
          ? "Origen y destino no pueden ser iguales"
          : "Traslado entre dos LOC distintos",
      },
      {
        label: "Notas",
        value: notes.trim() || "Sin notas operativas",
      },
    ],
    [notes, sameLocation, selectedFrom, selectedTo]
  );

  return (
    <form className="space-y-6 pb-24 lg:pb-0" action={action}>
      <section className="ui-panel-soft space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Traslado completo en una sola vista</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Aqui defines origen, destino, items y confirmacion sin navegar por pasos ocultos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">Traslado interno</span>
            <span className="ui-chip">Misma sede</span>
          </div>
        </div>
        <p className="text-sm text-[var(--ui-muted)]">
          La meta es que una persona nueva pueda registrar un traslado completo desde una sola pantalla.
        </p>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Origen, destino y contexto</div>
          <p className="mt-1 ui-caption">
            Define desde donde sale el stock, a donde llega y deja trazabilidad basica del movimiento.
          </p>
        </div>

        <div className="grid gap-3 ui-mobile-stack md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="ui-label">LOC origen</span>
            <select
              name="from_loc_id"
              className="ui-input"
              value={fromLocId}
              onChange={(event) => setFromLocId(event.target.value)}
              required
            >
              <option value="">Selecciona LOC origen</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code ?? loc.name ?? loc.id}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">LOC destino</span>
            <select
              name="to_loc_id"
              className="ui-input"
              value={toLocId}
              onChange={(event) => setToLocId(event.target.value)}
              required
            >
              <option value="">Selecciona LOC destino</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code ?? loc.name ?? loc.id}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
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

        {sameLocation ? (
          <div className="ui-alert ui-alert--error">
            Origen y destino no pueden ser iguales. Corrigelo antes de registrar el traslado.
          </div>
        ) : null}

        <StepHelp
          meaning="Este bloque define el recorrido fisico del stock dentro de la sede."
          whenToUse="Siempre antes de cargar items; evita errores de ubicacion y doble movimiento."
          example="Origen: LOC-CP-BOD-MAIN, Destino: LOC-CP-BAR-MAIN."
          impact="El sistema descuenta del origen y suma en el destino."
        />
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Items, cantidades y unidad de captura</div>
          <p className="mt-1 ui-caption">
            Agrega una fila por producto que realmente va a salir del origen y entrar al destino.
          </p>
        </div>

        <div className="ui-panel-soft p-3 text-sm text-[var(--ui-muted)]">
          Cada linea debe quedar con producto, cantidad mayor a cero y unidad coherente para conversion a stock.
        </div>

        <TransfersItems products={products} defaultUomProfiles={defaultUomProfiles} />

        <StepHelp
          meaning="Cada fila representa un producto a trasladar."
          whenToUse="Agrega una fila por cada producto y cantidad."
          example="Leche 6 lt, Azucar 2 kg, Vasos 1 caja."
          impact="Define el detalle que afectara stock por LOC."
        />
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Revision operativa</div>
          <p className="mt-1 ui-caption">
            Antes de guardar, confirma que el movimiento corresponde al traslado real que va a ejecutar bodega.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {reviewRows.map((row) => (
            <div key={row.label} className="ui-panel-soft px-3 py-2">
              <div className="ui-caption">{row.label}</div>
              <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{row.value}</div>
            </div>
          ))}
        </div>

        <div className="ui-panel-soft space-y-2 p-4 text-sm text-[var(--ui-muted)]">
          <p>1) Origen y destino deben ser distintos.</p>
          <p>2) Cada item debe tener producto, cantidad y unidad de captura.</p>
          <p>3) El sistema valida stock disponible en el LOC origen antes de registrar.</p>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Confirmacion final</div>
          <p className="mt-1 ui-caption">
            Este es el ultimo control antes de mover stock entre LOCs.
          </p>
        </div>

        <label className="flex items-start gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span className="ui-caption">
            Confirmo que revise origen, destino, cantidades y coherencia operativa antes de registrar el traslado.
          </span>
        </label>
      </section>

      <div className="ui-mobile-sticky-footer flex flex-wrap items-center justify-end gap-2">
        <button type="submit" className="ui-btn ui-btn--brand" disabled={!confirmed || sameLocation}>
          Registrar traslado
        </button>
      </div>
    </form>
  );
}
