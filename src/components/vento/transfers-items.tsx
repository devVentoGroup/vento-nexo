"use client";

import { useState } from "react";
import { SearchableSingleSelect } from "@/components/inventory/forms/SearchableSingleSelect";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
};

type Props = {
  products: ProductOption[];
};

type Row = {
  id: number;
  productId: string;
  quantity: string;
  inputUnitCode: string;
  notes: string;
};

export function TransfersItems({ products }: Props) {
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

  const productOptions = products.map((product) => ({
    value: product.id,
    label: `${product.name ?? product.id}${product.unit ? ` (${product.unit})` : ""}`,
    searchText: `${product.name ?? ""} ${product.unit ?? ""} ${product.stock_unit_code ?? ""}`,
  }));

  return (
    <div className="space-y-4">
      {rows.map((row, idx) => {
        const isLast = idx === rows.length - 1;
        return (
          <div key={row.id} className="space-y-3">
            <div className="ui-card grid gap-3 md:grid-cols-5">
              <SearchableSingleSelect
                name="item_product_id"
                className="md:col-span-2"
                value={row.productId}
                onValueChange={(next) => {
                  const product = products.find((p) => p.id === next);
                  const stockUnit = product?.stock_unit_code ?? product?.unit ?? "";
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id
                        ? { ...r, productId: next, inputUnitCode: stockUnit || r.inputUnitCode }
                        : r
                    )
                  );
                }}
                options={productOptions}
                placeholder="Selecciona producto"
                searchPlaceholder="Buscar producto..."
              />

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

              <select
                name="item_input_unit_code"
                className="ui-input"
                value={row.inputUnitCode}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, inputUnitCode: e.target.value } : r
                    )
                  )
                }
                required
              >
                <option value="">Unidad</option>
                {(() => {
                  const product = products.find((p) => p.id === row.productId);
                  const unitCode = product?.stock_unit_code ?? product?.unit ?? "";
                  return unitCode ? (
                    <option value={unitCode}>{unitCode}</option>
                  ) : (
                    <option value="">-</option>
                  );
                })()}
              </select>

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
