"use client";

import { useMemo, useState } from "react";

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
  const showCustomSupplier = supplierId === "__new__";

  const selectedSupplierName = useMemo(() => {
    if (showCustomSupplier) return supplierCustomName.trim() || "Proveedor manual";
    return suppliers.find((supplier) => supplier.id === supplierId)?.name ?? "Proveedor sin nombre";
  }, [showCustomSupplier, supplierCustomName, supplierId, suppliers]);

  return (
    <form className="space-y-6 pb-24 lg:pb-0" action={action}>
      <input type="hidden" name="purchase_order_id" value={purchaseOrderId ?? ""} />
      <input type="hidden" name="source_app" value={emergencyOnly ? "nexo" : "origo"} />
      <input type="hidden" name="entry_mode" value={emergencyOnly ? "emergency" : "normal"} />

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Contexto</div>
            <div className="ui-caption mt-1">Proveedor, documento y fecha para esta entrada.</div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-slate-700">
              {emergencyOnly ? "Modo emergencia" : "Modo normal"}
            </span>
            {purchaseOrderId ? (
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-900">
                Con OC vinculada
              </span>
            ) : null}
          </div>
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
              placeholder="Notas opcionales"
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
                placeholder="Motivo"
                value={emergencyReason}
                onChange={(event) => setEmergencyReason(event.target.value)}
                required
              />
            </label>
          ) : null}
        </div>
      </section>

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-2 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Productos</div>
            <div className="ui-caption mt-1">Captura lo declarado y lo realmente recibido.</div>
          </div>
          <div className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
            {locations.length} LOCs disponibles
          </div>
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
      </section>

      <div className="ui-mobile-sticky-footer ui-fade-up ui-delay-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] bg-white/92 px-4 py-3 backdrop-blur">
        <div className="text-sm text-[var(--ui-muted)]">
          {selectedSupplierName}
          {invoiceNumber.trim() ? ` · ${invoiceNumber.trim()}` : ""}
        </div>
        <button type="submit" className="ui-btn ui-btn--brand">
          Guardar entrada
        </button>
      </div>
    </form>
  );
}
