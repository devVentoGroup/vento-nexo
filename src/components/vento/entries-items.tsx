"use client";

import { useMemo, useState } from "react";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
};

type LocationOption = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type Props = {
  products: ProductOption[];
  locations: LocationOption[];
  defaultLocationId?: string;
};

type Row = {
  id: number;
  productId: string;
  locationId: string;
  declared: string;
  received: string;
  unit: string;
  notes: string;
};

export function EntriesItems({ products, locations, defaultLocationId }: Props) {
  const initialLocationId =
    defaultLocationId || locations.find((loc) => loc.id)?.id || "";
  const [rows, setRows] = useState<Row[]>([
    {
      id: 0,
      productId: "",
      locationId: initialLocationId,
      declared: "",
      received: "",
      unit: "",
      notes: "",
    },
  ]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: prev.length,
        productId: "",
        locationId: initialLocationId,
        declared: "",
        received: "",
        unit: "",
        notes: "",
      },
    ]);
  };

  const removeRow = (id: number) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  const completion = useMemo(() => {
    const totals = rows.reduce(
      (acc, row) => {
        const declared = Number(row.declared) || 0;
        const received = Number(row.received) || 0;
        acc.declared += declared;
        acc.received += received;
        return acc;
      },
      { declared: 0, received: 0 }
    );
    return totals;
  }, [rows]);

  return (
    <div className="space-y-4">
      {rows.map((row, idx) => {
        const isLast = idx === rows.length - 1;
        return (
          <div key={row.id} className="space-y-3">
            <div className="ui-card grid gap-3 md:grid-cols-7">
              <select
                name="item_product_id"
                className="ui-input md:col-span-2"
                value={row.productId}
                onChange={(e) => {
                  const next = e.target.value;
                  const product = products.find((p) => p.id === next);
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id
                        ? { ...r, productId: next, unit: product?.unit ?? r.unit }
                        : r
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
                name="item_quantity_declared"
                placeholder="Cantidad declarada"
                className="ui-input"
                value={row.declared}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, declared: e.target.value } : r
                    )
                  )
                }
              />

              <input
                name="item_quantity_received"
                placeholder="Cantidad recibida"
                className="ui-input"
                value={row.received}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, received: e.target.value } : r
                    )
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
                    prev.map((r) =>
                      r.id === row.id ? { ...r, unit: e.target.value } : r
                    )
                  )
                }
              />

              <select
                name="item_location_id"
                className="ui-input md:col-span-2"
                value={row.locationId}
                required
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, locationId: e.target.value } : r
                    )
                  )
                }
              >
                <option value="">Selecciona LOC</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code ?? loc.description ?? loc.zone ?? loc.id}
                  </option>
                ))}
              </select>

              <div className="flex gap-2 md:col-span-2">
                <input
                  name="item_notes"
                  placeholder="Notas (opcional)"
                  className="ui-input"
                  value={row.notes}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.id === row.id ? { ...r, notes: e.target.value } : r
                      )
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

      <div className="ui-panel-soft">
        <div className="ui-caption font-semibold">Resumen rápido</div>
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
