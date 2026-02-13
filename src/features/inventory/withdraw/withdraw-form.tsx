"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { GuidedFormShell } from "@/components/inventory/forms/GuidedFormShell";
import type { GuidedStep } from "@/lib/inventory/forms/types";

type LocOption = { id: string; code: string | null; zone: string | null };
type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
};

type Row = {
  id: number;
  productId: string;
  quantity: string;
  inputUnitCode: string;
  notes: string;
};

type Props = {
  locations: LocOption[];
  defaultLocationId: string;
  products: ProductOption[];
  siteId: string;
  action: (formData: FormData) => void | Promise<void>;
};

const STEPS: GuidedStep[] = [
  {
    id: "contexto",
    title: "LOC y contexto",
    objective: "Selecciona la ubicacion origen del retiro y su contexto operativo.",
  },
  {
    id: "items",
    title: "Items",
    objective: "Indica que productos y cantidades salen del LOC.",
  },
  {
    id: "impacto",
    title: "Impacto",
    objective: "Revisa como afectara el stock por ubicacion.",
  },
  {
    id: "confirmacion",
    title: "Confirmacion",
    objective: "Confirma el retiro y guarda el movimiento.",
  },
];

function StepHelp(props: { meaning: string; whenToUse: string; example: string; impact?: string }) {
  return (
    <div className="ui-panel-soft space-y-1 p-3">
      <div className="ui-caption">
        <strong>Que significa:</strong> {props.meaning}
      </div>
      <div className="ui-caption">
        <strong>Cuando usarlo:</strong> {props.whenToUse}
      </div>
      <div className="ui-caption">
        <strong>Ejemplo:</strong> {props.example}
      </div>
      {props.impact ? (
        <div className="ui-caption">
          <strong>Impacto:</strong> {props.impact}
        </div>
      ) : null}
    </div>
  );
}

export function WithdrawForm({
  locations,
  defaultLocationId,
  products,
  siteId,
  action,
}: Props) {
  const [locationId, setLocationId] = useState((defaultLocationId || locations[0]?.id) ?? "");
  const [activeStepId, setActiveStepId] = useState(STEPS[0].id);
  const [confirmed, setConfirmed] = useState(false);
  const [rows, setRows] = useState<Row[]>([
    { id: 0, productId: "", quantity: "", inputUnitCode: "", notes: "" },
  ]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: prev.length, productId: "", quantity: "", inputUnitCode: "", notes: "" },
    ]);
  };

  const removeRow = (id: number) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  const stepIndex = STEPS.findIndex((step) => step.id === activeStepId);
  const atFirstStep = stepIndex <= 0;
  const atLastStep = stepIndex >= STEPS.length - 1;

  const moveStep = (offset: -1 | 1) => {
    const nextIndex = Math.min(STEPS.length - 1, Math.max(0, stepIndex + offset));
    setActiveStepId(STEPS[nextIndex].id);
  };

  const selectedLocation = useMemo(
    () => locations.find((loc) => loc.id === locationId) ?? null,
    [locationId, locations]
  );

  const linesWithQty = useMemo(
    () =>
      rows.filter((row) => {
        const qty = Number(row.quantity);
        return Number.isFinite(qty) && qty > 0 && row.productId;
      }),
    [rows]
  );

  const totalUnits = useMemo(
    () => linesWithQty.reduce((sum, row) => sum + Number(row.quantity), 0),
    [linesWithQty]
  );

  if (!siteId) {
    return (
      <div className="ui-panel">
        <p className="ui-body-muted">Selecciona una sede activa para retirar insumos.</p>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="ui-panel space-y-3">
        <p className="ui-body-muted">
          No hay LOCs en esta sede. Puede que la sede activa no tenga ubicaciones, o que el LOC
          escaneado pertenezca a otra sede. Crea ubicaciones, cambia la sede activa en el menu, o
          escanea un QR de un LOC de tu sede actual.
        </p>
        <Link href="/inventory/locations" className="ui-btn ui-btn--ghost ui-btn--sm">
          Ir a Ubicaciones (LOC)
        </Link>
      </div>
    );
  }

  return (
    <GuidedFormShell
      title="Retiro desde LOC"
      subtitle="Flujo guiado para registrar consumos y retiros por ubicacion."
      steps={STEPS}
      currentStepId={activeStepId}
      onStepChange={setActiveStepId}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="_wizard_step" value={activeStepId} />

        <section className={activeStepId === "contexto" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 1. LOC y contexto</div>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Ubicacion (LOC)</span>
            <select
              name="location_id"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              className="ui-input"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code ?? loc.zone ?? loc.id}
                </option>
              ))}
            </select>
            <span className="ui-caption">
              El retiro siempre descuenta de este LOC y de la sede activa.
            </span>
          </label>
          <StepHelp
            meaning="Define el punto exacto desde donde sale el inventario."
            whenToUse="Antes de cargar productos para no descontar del lugar equivocado."
            example="LOC-CP-BOD-MAIN para consumo de produccion."
            impact="Afecta trazabilidad de inventario por ubicacion y por sede."
          />
        </section>

        <section className={activeStepId === "items" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 2. Items a retirar</div>
          <div className="space-y-3">
            {rows.map((row, idx) => {
              const product = products.find((p) => p.id === row.productId);
              const isLast = idx === rows.length - 1;
              return (
                <div key={row.id} className="flex flex-wrap items-end gap-3 ui-panel-soft p-3">
                  <label className="min-w-[180px] flex-1 flex-col gap-1 md:flex-initial">
                    <span className="text-[11px] text-zinc-500">Producto</span>
                    <select
                      name="item_product_id"
                      value={row.productId}
                      onChange={(event) => {
                        const next = event.target.value;
                        const selectedProduct = products.find((item) => item.id === next);
                        const stockUnit = selectedProduct?.stock_unit_code ?? selectedProduct?.unit ?? "";
                        setRows((prev) =>
                          prev.map((current) =>
                            current.id === row.id
                              ? {
                                  ...current,
                                  productId: next,
                                  inputUnitCode: stockUnit || current.inputUnitCode,
                                }
                              : current
                          )
                        );
                      }}
                      className="ui-input mt-1 h-10 w-full min-w-0"
                    >
                      <option value="">Selecciona</option>
                      {products.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name ?? item.id}
                          {item.unit ? ` (${item.unit})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex w-24 flex-col gap-1">
                    <span className="text-[11px] text-zinc-500">Cantidad</span>
                    <input
                      name="item_quantity"
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={row.quantity}
                      onChange={(event) =>
                        setRows((prev) =>
                          prev.map((current) =>
                            current.id === row.id
                              ? { ...current, quantity: event.target.value }
                              : current
                          )
                        )
                      }
                      className="ui-input mt-1 h-10 min-w-0"
                    />
                  </label>
                  <label className="flex w-24 flex-col gap-1">
                    <span className="text-[11px] text-zinc-500">Unidad</span>
                    <select
                      name="item_input_unit_code"
                      value={row.inputUnitCode}
                      onChange={(event) =>
                        setRows((prev) =>
                          prev.map((current) =>
                            current.id === row.id
                              ? { ...current, inputUnitCode: event.target.value }
                              : current
                          )
                        )
                      }
                      className="ui-input mt-1 h-10 min-w-0"
                      required
                    >
                      <option value="">-</option>
                      {(() => {
                        const unitCode = product?.stock_unit_code ?? product?.unit ?? "";
                        return unitCode ? <option value={unitCode}>{unitCode}</option> : null;
                      })()}
                    </select>
                  </label>
                  <label className="min-w-[120px] flex-1 flex-col gap-1 md:flex-initial">
                    <span className="text-[11px] text-zinc-500">Nota (opcional)</span>
                    <input
                      name="item_notes"
                      placeholder="Ej. para produccion"
                      value={row.notes}
                      onChange={(event) =>
                        setRows((prev) =>
                          prev.map((current) =>
                            current.id === row.id ? { ...current, notes: event.target.value } : current
                          )
                        )
                      }
                      className="ui-input mt-1 h-10 w-full min-w-0"
                    />
                  </label>
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="ui-btn ui-btn--ghost h-10 text-sm"
                    >
                      Quitar
                    </button>
                  ) : null}
                  {isLast ? (
                    <button
                      type="button"
                      onClick={addRow}
                      className="ui-btn ui-btn--ghost h-10 text-sm"
                    >
                      + Otro item
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <StepHelp
            meaning="Cada fila representa un consumo o retiro real."
            whenToUse="Agrega todos los productos retirados en esta misma operacion."
            example="Leche 2 lt, Harina 1 kg, Empaques 20 un."
            impact="Se descuenta inventario en LOC y sede con trazabilidad."
          />
        </section>

        <section className={activeStepId === "impacto" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 3. Impacto en stock</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">LOC seleccionado</div>
              <div className="font-semibold mt-1">
                {selectedLocation?.code ?? selectedLocation?.zone ?? selectedLocation?.id ?? "-"}
              </div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Items con cantidad</div>
              <div className="font-semibold mt-1">{linesWithQty.length}</div>
            </div>
            <div className="ui-panel-soft p-3 sm:col-span-2">
              <div className="ui-caption">Cantidad total capturada</div>
              <div className="font-semibold mt-1">{totalUnits}</div>
            </div>
          </div>
          <div className="ui-caption">
            Verifica unidades y cantidades. Si una cantidad supera stock disponible, el servidor bloqueara el guardado.
          </div>
        </section>

        <section className={activeStepId === "confirmacion" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 4. Confirmacion</div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span className="ui-caption">
              Confirmo que revise LOC, productos, cantidades y unidades antes de registrar el retiro.
            </span>
          </label>
          <p className="ui-caption">
            Para abrir desde QR puedes usar <span className="font-mono">?loc_id=UUID</span> o{" "}
            <span className="font-mono">?loc=LOC-CP-BODEGA-MAIN</span>.
          </p>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => moveStep(-1)}
              disabled={atFirstStep}
            >
              Anterior
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => moveStep(1)}
              disabled={atLastStep}
            >
              Siguiente
            </button>
          </div>
          <button
            type="submit"
            className="ui-btn ui-btn--brand"
            disabled={!confirmed || activeStepId !== "confirmacion"}
          >
            Registrar retiro
          </button>
        </div>
      </form>
    </GuidedFormShell>
  );
}