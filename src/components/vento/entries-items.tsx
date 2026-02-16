"use client";

import { useMemo, useState } from "react";

import { SearchableSingleSelect } from "@/components/inventory/forms/SearchableSingleSelect";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
  default_unit_cost?: number | null;
};

type UnitOption = {
  code: string;
  name: string;
};

type LocationOption = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type InitialRow = {
  product_id?: string;
  location_id?: string;
  quantity_declared?: number | null;
  quantity_received?: number | null;
  input_unit_code?: string | null;
  input_unit_cost?: number | null;
  purchase_order_item_id?: string | null;
  cost_source?: "manual" | "po_prefill" | "fallback_product_cost";
  notes?: string | null;
};

type Props = {
  products: ProductOption[];
  units: UnitOption[];
  locations: LocationOption[];
  defaultLocationId?: string;
  initialRows?: InitialRow[];
};

type Row = {
  id: number;
  productId: string;
  locationId: string;
  declared: string;
  received: string;
  inputUnitCode: string;
  inputUnitCost: string;
  purchaseOrderItemId: string;
  costSource: "manual" | "po_prefill" | "fallback_product_cost";
  notes: string;
};

export function EntriesItems({
  products,
  units,
  locations,
  defaultLocationId,
  initialRows = [],
}: Props) {
  const initialLocationId = defaultLocationId || locations.find((loc) => loc.id)?.id || "";

  const [rows, setRows] = useState<Row[]>(() => {
    if (initialRows.length === 0) {
      return [
        {
          id: 0,
          productId: "",
          locationId: initialLocationId,
          declared: "",
          received: "",
          inputUnitCode: "",
          inputUnitCost: "",
          purchaseOrderItemId: "",
          costSource: "fallback_product_cost",
          notes: "",
        },
      ];
    }
    return initialRows.map((row, index) => ({
      id: index,
      productId: String(row.product_id ?? "").trim(),
      locationId: String(row.location_id ?? "").trim() || initialLocationId,
      declared: row.quantity_declared == null ? "" : String(Number(row.quantity_declared)),
      received: row.quantity_received == null ? "" : String(Number(row.quantity_received)),
      inputUnitCode: String(row.input_unit_code ?? "").trim(),
      inputUnitCost: row.input_unit_cost == null ? "" : String(Number(row.input_unit_cost)),
      purchaseOrderItemId: String(row.purchase_order_item_id ?? "").trim(),
      costSource: row.cost_source ?? "po_prefill",
      notes: String(row.notes ?? "").trim(),
    }));
  });

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: prev.length,
        productId: "",
        locationId: initialLocationId,
        declared: "",
        received: "",
        inputUnitCode: "",
        inputUnitCost: "",
        purchaseOrderItemId: "",
        costSource: "fallback_product_cost",
        notes: "",
      },
    ]);
  };

  const removeRow = (id: number) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  const completion = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const declared = Number(row.declared) || 0;
        const received = Number(row.received) || 0;
        acc.declared += declared;
        acc.received += received;
        return acc;
      },
      { declared: 0, received: 0 }
    );
  }, [rows]);

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: `${product.name ?? product.id}${product.unit ? ` (${product.unit})` : ""}`,
        searchText: `${product.name ?? ""} ${product.unit ?? ""} ${product.stock_unit_code ?? ""}`,
      })),
    [products]
  );

  const locationOptions = useMemo(
    () =>
      locations.map((loc) => ({
        value: loc.id,
        label: loc.code ?? loc.description ?? loc.zone ?? loc.id,
        searchText: `${loc.code ?? ""} ${loc.zone ?? ""} ${loc.description ?? ""}`,
      })),
    [locations]
  );

  return (
    <div className="space-y-4">
      {rows.map((row, idx) => {
        const isLast = idx === rows.length - 1;
        return (
          <div key={row.id} className="space-y-3">
            <div className="ui-card grid gap-3 md:grid-cols-8">
              <SearchableSingleSelect
                name="item_product_id"
                className="md:col-span-2"
                value={row.productId}
                onValueChange={(next) => {
                  const product = products.find((p) => p.id === next);
                  const stockUnit = product?.stock_unit_code ?? product?.unit ?? "";
                  const defaultCost = product?.default_unit_cost;
                  setRows((prev) =>
                    prev.map((current) =>
                      current.id !== row.id
                        ? current
                        : {
                            ...current,
                            productId: next,
                            inputUnitCode: stockUnit || current.inputUnitCode,
                            inputUnitCost:
                              current.purchaseOrderItemId || current.inputUnitCost
                                ? current.inputUnitCost
                                : defaultCost != null
                                  ? String(Number(defaultCost))
                                  : "",
                            costSource:
                              current.purchaseOrderItemId || current.inputUnitCost
                                ? current.costSource
                                : "fallback_product_cost",
                          }
                    )
                  );
                }}
                options={productOptions}
                placeholder="Selecciona producto"
                searchPlaceholder="Buscar producto..."
              />

              <input
                name="item_quantity_declared"
                placeholder="Cantidad declarada"
                className="ui-input"
                value={row.declared}
                onChange={(event) =>
                  setRows((prev) =>
                    prev.map((current) =>
                      current.id === row.id ? { ...current, declared: event.target.value } : current
                    )
                  )
                }
              />

              <input
                name="item_quantity_received"
                placeholder="Cantidad recibida"
                className="ui-input"
                value={row.received}
                onChange={(event) =>
                  setRows((prev) =>
                    prev.map((current) =>
                      current.id === row.id ? { ...current, received: event.target.value } : current
                    )
                  )
                }
              />

              <input
                name="item_input_unit_cost"
                placeholder="Costo unitario"
                className="ui-input"
                value={row.inputUnitCost}
                onChange={(event) =>
                  setRows((prev) =>
                    prev.map((current) =>
                      current.id !== row.id
                        ? current
                        : {
                            ...current,
                            inputUnitCost: event.target.value,
                            costSource:
                              event.target.value.trim() === ""
                                ? "fallback_product_cost"
                                : current.purchaseOrderItemId
                                  ? "po_prefill"
                                  : "manual",
                          }
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
                      current.id === row.id ? { ...current, inputUnitCode: event.target.value } : current
                    )
                  )
                }
                required
              >
                <option value="">Unidad captura</option>
                {units.map((unit) => (
                  <option key={unit.code} value={unit.code}>
                    {unit.code} - {unit.name}
                  </option>
                ))}
              </select>

              <SearchableSingleSelect
                name="item_location_id"
                className="md:col-span-2"
                value={row.locationId}
                onValueChange={(next) =>
                  setRows((prev) =>
                    prev.map((current) =>
                      current.id === row.id ? { ...current, locationId: next } : current
                    )
                  )
                }
                options={locationOptions}
                placeholder="Selecciona LOC"
                searchPlaceholder="Buscar LOC..."
              />

              <div className="flex gap-2 md:col-span-2">
                <input
                  name="item_notes"
                  placeholder="Notas (opcional)"
                  className="ui-input"
                  value={row.notes}
                  onChange={(event) =>
                    setRows((prev) =>
                      prev.map((current) =>
                        current.id === row.id ? { ...current, notes: event.target.value } : current
                      )
                    )
                  }
                />
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

              <input
                type="hidden"
                name="item_purchase_order_item_id"
                value={row.purchaseOrderItemId}
              />
              <input type="hidden" name="item_cost_source" value={row.costSource} />

              <div className="md:col-span-8 text-xs text-[var(--ui-muted)]">
                Unidad canonica:{" "}
                {products.find((p) => p.id === row.productId)?.stock_unit_code ??
                  products.find((p) => p.id === row.productId)?.unit ??
                  "-"}
              </div>
              <div className="md:col-span-8 text-xs text-[var(--ui-muted)]">
                Si dejas costo vacio, se usa el costo actual del producto para el promedio.
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

      <div className="ui-panel-soft">
        <div className="ui-caption font-semibold">Resumen rapido</div>
        <div className="mt-2 flex flex-wrap gap-3">
          <span className="ui-chip">
            Declarado: <strong>{completion.declared}</strong>
          </span>
          <span className="ui-chip">
            Recibido: <strong>{completion.received}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

