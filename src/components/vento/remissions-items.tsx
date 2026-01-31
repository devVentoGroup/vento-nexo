"use client";

import { useState } from "react";

type Option = {
  id: string;
  name: string | null;
  unit: string | null;
};

type AreaOption = {
  value: string;
  label: string;
};

type Props = {
  products: Option[];
  areaOptions: AreaOption[];
};

export function RemissionsItems({ products, areaOptions }: Props) {
  const [rows, setRows] = useState([0]);

  const addRow = () => {
    setRows((prev) => [...prev, prev.length]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row !== idx)));
  };

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row} className="ui-card grid gap-3 md:grid-cols-4">
          <select name="item_product_id" className="ui-input">
            <option value="">Selecciona producto</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name ?? product.id}
                {product.unit ? ` (${product.unit})` : ""}
              </option>
            ))}
          </select>
          <input name="item_quantity" placeholder="Cantidad" className="ui-input" />
          <input name="item_unit" placeholder="Unidad (ej: kg, un)" className="ui-input" />
          <div className="flex gap-2">
            <select name="item_area_kind" className="ui-input">
              <option value="">Area (opcional)</option>
              {areaOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {rows.length > 1 ? (
              <button type="button" className="ui-btn ui-btn--ghost" onClick={() => removeRow(row)}>
                Quitar
              </button>
            ) : null}
          </div>
        </div>
      ))}

      <button type="button" className="ui-btn ui-btn--ghost w-fit" onClick={addRow}>
        + Agregar otro item
      </button>
    </div>
  );
}
