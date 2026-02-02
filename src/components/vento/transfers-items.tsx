"use client";

import { useState } from "react";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
};

type Props = {
  products: ProductOption[];
};

type Row = {
  id: number;
  productId: string;
  quantity: string;
  unit: string;
  notes: string;
};

export function TransfersItems({ products }: Props) {
  const [rows, setRows] = useState<Row[]>([
    { id: 0, productId: "", quantity: "", unit: "", notes: "" },
  ]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: prev.length, productId: "", quantity: "", unit: "", notes: "" },
    ]);
  };

  const removeRow = (id: number) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  return (
    <div className="space-y-4">
      {rows.map((row, idx) => {
        const isLast = idx === rows.length - 1;
        return (
          <div key={row.id} className="space-y-3">
            <div className="ui-card grid gap-3 md:grid-cols-5">
              <select
                name="item_product_id"
                className="ui-input md:col-span-2"
                value={row.productId}
                onChange={(e) => {
                  const next = e.target.value;
                  const product = products.find((p) => p.id === next);
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, productId: next, unit: product?.unit ?? r.unit } : r
                    )
                  );
                }}
              >
                <option value="">Selecciona producto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name ?? product.id}
                    {product.unit ? ` (${product.unit})` : ""}
                  </option>
                ))}
              </select>

              <input
                name="item_quantity"
                placeholder="Cantidad"
                className="ui-input"
                value={row.quantity}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, quantity: e.target.value } : r))
                  )
                }
              />

              <input
                name="item_unit"
                placeholder="Unidad"
                className="ui-input"
                value={row.unit}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, unit: e.target.value } : r))
                  )
                }
              />

              <div className="flex gap-2">
                <input
                  name="item_notes"
                  placeholder="Notas (opcional)"
                  className="ui-input"
                  value={row.notes}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, notes: e.target.value } : r))
                    )
                  }
                />
                {rows.length > 1 ? (
                  <button type="button" className="ui-btn ui-btn--ghost" onClick={() => removeRow(row.id)}>
                    Quitar
                  </button>
                ) : null}
              </div>
            </div>

            {isLast ? (
              <button type="button" className="ui-btn ui-btn--ghost w-fit" onClick={addRow}>
                + Agregar otro ítem
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
