"use client";

import { useState } from "react";

type Option = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
};

type AreaOption = {
  value: string;
  label: string;
};

type Row = {
  id: number;
  productId: string;
  quantity: string;
  inputUnitCode: string;
  areaKind: string;
};

type Props = {
  products: Option[];
  areaOptions: AreaOption[];
};

export function RemissionsItems({ products, areaOptions }: Props) {
  const [rows, setRows] = useState<Row[]>([
    { id: 0, productId: "", quantity: "", inputUnitCode: "", areaKind: "" },
  ]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: prev.length,
        productId: "",
        quantity: "",
        inputUnitCode: "",
        areaKind: "",
      },
    ]);
  };

  const removeRow = (rowId: number) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== rowId)));
  };

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => {
        const isLast = idx === rows.length - 1;
        const product = products.find((item) => item.id === row.productId);
        const stockUnitCode = product?.stock_unit_code ?? product?.unit ?? "";
        return (
          <div key={row.id} className="space-y-3">
            <div className="ui-card grid gap-3 md:grid-cols-4">
              <select
                name="item_product_id"
                className="ui-input"
                value={row.productId}
                onChange={(event) => {
                  const nextProductId = event.target.value;
                  const nextProduct = products.find((item) => item.id === nextProductId);
                  const nextStockUnitCode =
                    nextProduct?.stock_unit_code ?? nextProduct?.unit ?? "";
                  setRows((prev) =>
                    prev.map((current) =>
                      current.id === row.id
                        ? {
                            ...current,
                            productId: nextProductId,
                            inputUnitCode: nextStockUnitCode || current.inputUnitCode,
                          }
                        : current
                    )
                  );
                }}
              >
                <option value="">Selecciona producto</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name ?? item.id}
                    {item.stock_unit_code
                      ? ` (${item.stock_unit_code})`
                      : item.unit
                        ? ` (${item.unit})`
                        : ""}
                  </option>
                ))}
              </select>

              <input
                name="item_quantity"
                placeholder="Cantidad"
                className="ui-input"
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
              />

              <select
                name="item_input_unit_code"
                className="ui-input"
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
                required
              >
                <option value="">Unidad</option>
                {stockUnitCode ? <option value={stockUnitCode}>{stockUnitCode}</option> : null}
              </select>

              <div className="flex gap-2">
                <select
                  name="item_area_kind"
                  className="ui-input"
                  value={row.areaKind}
                  onChange={(event) =>
                    setRows((prev) =>
                      prev.map((current) =>
                        current.id === row.id
                          ? { ...current, areaKind: event.target.value }
                          : current
                      )
                    )
                  }
                >
                  <option value="">Area (opcional)</option>
                  {areaOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost"
                    onClick={() => removeRow(row.id)}
                  >
                    Quitar
                  </button>
                ) : null}
              </div>
            </div>

            {isLast ? (
              <button type="button" className="ui-btn ui-btn--ghost w-fit" onClick={addRow}>
                + Agregar otro item
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
