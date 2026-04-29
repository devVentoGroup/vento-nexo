"use client";

import { useMemo, useState } from "react";

import { type ProductUomProfile } from "@/lib/inventory/uom";

import { TransfersItems } from "./transfers-items";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
  available_qty?: number;
};

type LocOption = {
  id: string;
  code: string | null;
  description: string | null;
};

type StockByLocation = {
  location_id: string;
  product_id: string;
  current_qty: number;
};

type Props = {
  locations: LocOption[];
  products: ProductOption[];
  stockByLocation: StockByLocation[];
  defaultUomProfiles?: ProductUomProfile[];
  action: (formData: FormData) => void | Promise<void>;
};

function locLabel(loc: LocOption | null | undefined, fallback = "Sin area") {
  if (!loc) return fallback;
  return String(loc.description ?? "").trim() || String(loc.code ?? "").trim() || loc.id;
}

export function TransfersForm({ locations, products, stockByLocation, defaultUomProfiles = [], action }: Props) {
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
  const productsInOrigin = useMemo(() => {
    if (!fromLocId) return [];
    const stockByProduct = new Map(
      stockByLocation
        .filter((row) => row.location_id === fromLocId && Number(row.current_qty ?? 0) > 0)
        .map((row) => [row.product_id, Number(row.current_qty ?? 0)])
    );

    return products
      .map((product) => ({
        ...product,
        available_qty: stockByProduct.get(product.id) ?? 0,
      }))
      .filter((product) => product.available_qty > 0);
  }, [fromLocId, products, stockByLocation]);
  const canRegister = canSubmit && productsInOrigin.length > 0;

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
                Origen {locLabel(selectedFrom)}
              </span>
            ) : null}
            {selectedTo ? (
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-900">
                Destino {locLabel(selectedTo)}
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
                  {locLabel(loc)}
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
                    {locLabel(loc)}
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
              <div className="ui-caption mt-1">
                Solo aparecen productos con saldo real en el area origen.
              </div>
            </div>
            <div className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
              {productsInOrigin.length} productos con stock
            </div>
          </div>

          {productsInOrigin.length > 0 ? (
            <TransfersItems
              key={fromLocId}
              products={productsInOrigin}
              defaultUomProfiles={defaultUomProfiles}
            />
          ) : (
            <div className="ui-alert ui-alert--neutral">
              El area origen no tiene productos disponibles para trasladar.
            </div>
          )}
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
          {locLabel(selectedFrom, "Sin origen")} -&gt; {locLabel(selectedTo, "Sin destino")}
        </div>
        <button type="submit" className="ui-btn ui-btn--brand h-12 px-5 text-base font-semibold" disabled={!canRegister}>
          Registrar traslado
        </button>
      </div>
    </form>
  );
}
