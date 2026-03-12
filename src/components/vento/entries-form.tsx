"use client";

import { useMemo, useState } from "react";

import { StepHelp } from "@/components/inventory/forms/StepHelp";
import { type ProductUomProfile } from "@/lib/inventory/uom";

import { EntriesItems } from "./entries-items";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
  default_unit_cost?: number | null;
};

type LocationOption = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type SupplierOption = {
  id: string;
  name: string | null;
};

type UnitOption = {
  code: string;
  name: string;
  family?: "volume" | "mass" | "count";
  factor_to_base?: number;
};

type SupplierCostRow = {
  product_id: string;
  supplier_id: string;
  is_primary: boolean | null;
  purchase_pack_qty: number | null;
  purchase_pack_unit_code: string | null;
  purchase_price: number | null;
};

type Props = {
  products: ProductOption[];
  units: UnitOption[];
  locations: LocationOption[];
  suppliers: SupplierOption[];
  supplierCostRows?: SupplierCostRow[];
  defaultUomProfiles?: ProductUomProfile[];
  defaultLocationId?: string;
  defaultSupplierId?: string;
  defaultInvoiceNumber?: string;
  defaultNotes?: string;
  purchaseOrderId?: string;
  emergencyOnly?: boolean;
  initialRows?: Array<{
    product_id?: string;
    location_id?: string;
    quantity_declared?: number | null;
    quantity_received?: number | null;
    input_unit_code?: string | null;
    input_unit_cost?: number | null;
    purchase_order_item_id?: string | null;
    cost_source?: "manual" | "po_prefill" | "fallback_product_cost";
    notes?: string | null;
  }>;
  action: (formData: FormData) => void | Promise<void>;
};

export function EntriesForm({
  products,
  units,
  locations,
  suppliers,
  supplierCostRows = [],
  defaultUomProfiles = [],
  defaultLocationId,
  defaultSupplierId,
  defaultInvoiceNumber,
  defaultNotes,
  purchaseOrderId,
  emergencyOnly = false,
  initialRows,
  action,
}: Props) {
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? suppliers[0]?.id ?? "__new__");
  const [supplierCustomName, setSupplierCustomName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(defaultInvoiceNumber ?? "");
  const [receivedAt, setReceivedAt] = useState("");
  const [notes, setNotes] = useState(defaultNotes ?? "");
  const [emergencyReason, setEmergencyReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const showCustomSupplier = supplierId === "__new__";

  const selectedSupplierName = useMemo(() => {
    if (showCustomSupplier) return supplierCustomName.trim() || "Proveedor manual";
    return suppliers.find((supplier) => supplier.id === supplierId)?.name ?? "Proveedor sin nombre";
  }, [showCustomSupplier, supplierCustomName, supplierId, suppliers]);

  const reviewRows = useMemo(
    () => [
      { label: "Proveedor", value: selectedSupplierName },
      { label: "Documento", value: invoiceNumber.trim() || "Sin factura / documento" },
      { label: "Fecha de recepcion", value: receivedAt || "Sin fecha cargada" },
      {
        label: "Modo",
        value: emergencyOnly ? "Entrada de contingencia en NEXO" : "Entrada operativa",
      },
      {
        label: "Fuente",
        value: purchaseOrderId
          ? `Orden ${purchaseOrderId}`
          : emergencyOnly
            ? "Carga manual directa"
            : "Sin orden asociada",
      },
      { label: "Notas", value: notes.trim() || "Sin notas" },
    ],
    [emergencyOnly, invoiceNumber, notes, purchaseOrderId, receivedAt, selectedSupplierName]
  );

  return (
    <form className="space-y-6 pb-24 lg:pb-0" action={action}>
      <input type="hidden" name="purchase_order_id" value={purchaseOrderId ?? ""} />
      <input type="hidden" name="source_app" value={emergencyOnly ? "nexo" : "origo"} />
      <input type="hidden" name="entry_mode" value={emergencyOnly ? "emergency" : "normal"} />

      <section className="ui-panel-soft space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Captura completa en una sola vista</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Aqui completas contexto, items, ubicaciones y confirmacion sin navegar por wizard.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">
              {emergencyOnly ? "Modo contingencia" : "Modo operativo"}
            </span>
            {purchaseOrderId ? <span className="ui-chip">Con orden asociada</span> : null}
          </div>
        </div>
        <p className="text-sm text-[var(--ui-muted)]">
          La meta es que una persona nueva pueda registrar una entrada completa desde una sola pantalla.
        </p>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Contexto del documento</div>
          <p className="mt-1 ui-caption">
            Define proveedor, documento y trazabilidad basica de la recepcion.
          </p>
        </div>

        <div className="grid gap-3 ui-mobile-stack md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Proveedor</span>
            <select
              name="supplier_id"
              className="ui-input"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
            >
              <option value="__new__">Crear proveedor...</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name ?? supplier.id}
                </option>
              ))}
            </select>
          </label>

          {showCustomSupplier ? (
            <label className="flex flex-col gap-1">
              <span className="ui-label">Nombre proveedor</span>
              <input
                name="supplier_custom"
                className="ui-input"
                placeholder="Nombre proveedor"
                value={supplierCustomName}
                onChange={(event) => setSupplierCustomName(event.target.value)}
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="ui-label">Factura / documento</span>
            <input
              name="invoice_number"
              className="ui-input"
              placeholder="FAC-0001"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Fecha de recepcion</span>
            <input
              type="date"
              name="received_at"
              className="ui-input"
              value={receivedAt}
              onChange={(event) => setReceivedAt(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="ui-label">Notas</span>
            <input
              name="notes"
              className="ui-input"
              placeholder="Observaciones para inventario o bodega"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          {emergencyOnly ? (
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Motivo de emergencia</span>
              <input
                name="emergency_reason"
                className="ui-input"
                placeholder="Ej: reposicion urgente para no detener operacion"
                value={emergencyReason}
                onChange={(event) => setEmergencyReason(event.target.value)}
                required
              />
            </label>
          ) : null}
        </div>

        <StepHelp
          meaning="Este bloque define la trazabilidad principal de la entrada."
          whenToUse="Siempre que recibas mercancia con o sin factura formal."
          example="Proveedor X, factura FAC-1023, recepcion hoy."
          impact="Permite auditar diferencias entre declarado y recibido."
        />
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Items, unidades y LOC destino</div>
          <p className="mt-1 ui-caption">
            Captura productos, cantidades declaradas/recibidas, costo de referencia y ubicacion fisica.
          </p>
        </div>

        <div className="ui-panel-soft p-3 text-sm text-[var(--ui-muted)]">
          Si dejas costo unitario vacio, el sistema intenta proveedor y luego costo actual del producto.
          Si recibes menos que lo declarado, la entrada quedara parcial.
        </div>

        <EntriesItems
          products={products}
          units={units}
          locations={locations}
          selectedSupplierId={supplierId}
          supplierCostRows={supplierCostRows}
          defaultLocationId={defaultLocationId}
          defaultUomProfiles={defaultUomProfiles}
          initialRows={initialRows}
        />

        <StepHelp
          meaning="Cada linea deja listo el movimiento de stock y la ubicacion destino."
          whenToUse="Agrega una linea por producto realmente recibido."
          example="Harina: declarada 20 kg, recibida 19.5 kg, LOC BOD-MAIN."
          impact="Afecta stock por sede, por ubicacion y costo promedio cuando aplica."
        />
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Revision operativa</div>
          <p className="mt-1 ui-caption">
            Antes de guardar, confirma que el contexto y las lineas correspondan a la recepcion real.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {reviewRows.map((row) => (
            <div key={row.label} className="ui-panel-soft px-3 py-2">
              <div className="ui-caption">{row.label}</div>
              <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{row.value}</div>
            </div>
          ))}
        </div>

        <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)] space-y-2">
          <p>1) Cada item debe tener producto, cantidad declarada y LOC destino.</p>
          <p>2) Si recibido es menor que declarado, la entrada queda parcial y eso es valido.</p>
          <p>3) Si no tienes factura formal, igual puedes registrar la recepcion con trazabilidad basica.</p>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Confirmacion final</div>
          <p className="mt-1 ui-caption">
            Este es el ultimo control antes de generar la entrada y mover stock.
          </p>
        </div>

        <label className="flex items-start gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span className="ui-caption">
            Confirmo que revise proveedor, documento, cantidades, costos y ubicaciones antes de guardar.
          </span>
        </label>
      </section>

      <div className="ui-mobile-sticky-footer flex flex-wrap items-center justify-end gap-2">
        <button type="submit" className="ui-btn ui-btn--brand" disabled={!confirmed}>
          Guardar entrada
        </button>
      </div>
    </form>
  );
}
