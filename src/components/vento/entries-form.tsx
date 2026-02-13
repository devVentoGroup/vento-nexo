"use client";

import { useState } from "react";
import { EntriesItems } from "./entries-items";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
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
};

type Props = {
  products: ProductOption[];
  units: UnitOption[];
  locations: LocationOption[];
  suppliers: SupplierOption[];
  defaultLocationId?: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function EntriesForm({
  products,
  units,
  locations,
  suppliers,
  defaultLocationId,
  action,
}: Props) {
  const [supplierId, setSupplierId] = useState(
    suppliers[0]?.id ?? "__new__"
  );
  const showCustomSupplier = supplierId === "__new__";

  return (
    <form
      className="space-y-6"
      action={action}
    >
      <div className="ui-panel">
        <div className="ui-h3">Nueva entrada</div>
        <div className="mt-1 ui-body-muted">
          Registro manual por factura. El estado (Pendiente / Parcial / Recibida) se calcula al guardar según cantidades declaradas vs recibidas por ítem.
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Proveedor</span>
            <select
              name="supplier_id"
              className="ui-input"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
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
              <input name="supplier_custom" className="ui-input" placeholder="Nombre proveedor" />
            </label>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="ui-label">Factura (opcional)</span>
            <input name="invoice_number" className="ui-input" placeholder="FAC-0001" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Fecha de recepción</span>
            <input type="date" name="received_at" className="ui-input" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Notas</span>
            <input name="notes" className="ui-input" placeholder="Observaciones" />
          </label>
        </div>
      </div>

      <div className="ui-panel">
        <div className="ui-h3">Ítems recibidos</div>
        <div className="mt-2 ui-body-muted">
          Declara cantidades y lo recibido. El sistema marcará parciales cuando aplique.
        </div>
        <div className="mt-4">
          <EntriesItems
            products={products}
            units={units}
            locations={locations}
            defaultLocationId={defaultLocationId}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="ui-btn ui-btn--brand">
          Guardar entrada
        </button>
      </div>
    </form>
  );
}
