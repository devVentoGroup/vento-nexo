"use client";

import { useState } from "react";

type LocOption = { id: string; code: string | null; zone: string | null };
type ProductOption = { id: string; name: string | null; unit: string | null };

type Row = {
  id: number;
  productId: string;
  quantity: string;
  unit: string;
  notes: string;
};

type Props = {
  locations: LocOption[];
  defaultLocationId: string;
  products: ProductOption[];
  siteId: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function WithdrawForm({
  locations,
  defaultLocationId,
  products,
  siteId,
  action,
}: Props) {
  const [locationId, setLocationId] = useState((defaultLocationId || locations[0]?.id) ?? "");
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
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
  };

  if (!siteId) {
    return (
      <div className="ui-panel">
        <p className="ui-body-muted">Selecciona una sede activa para retirar insumos.</p>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="ui-panel">
        <p className="ui-body-muted">
          No hay LOCs en esta sede. Crea ubicaciones en Ubicaciones (LOC) y vuelve aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="ui-panel">
      <div className="ui-h3">Retiro desde LOC</div>
      <p className="mt-1 ui-body-muted">
        Elige la ubicación y los productos/cantidades que retiras (consumo).
      </p>

      <form action={action} className="mt-4 space-y-4">
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-semibold">Ubicación (LOC)</span>
          <select
            name="location_id"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="h-11 rounded-xl border border-zinc-200 bg-white px-3 ui-body outline-none focus:border-zinc-400"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.code ?? loc.zone ?? loc.id}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4">
          <div className="ui-caption font-semibold">Ítems a retirar</div>
          <div className="mt-2 space-y-3">
            {rows.map((row, idx) => {
              const product = products.find((p) => p.id === row.productId);
              const isLast = idx === rows.length - 1;
              return (
                <div key={row.id} className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 p-3">
                  <label className="min-w-[180px] flex-1 flex-col gap-1 md:flex-initial">
                    <span className="text-[11px] text-zinc-500">Producto</span>
                    <select
                      name="item_product_id"
                      value={row.productId}
                      onChange={(e) => {
                        const next = e.target.value;
                        const p = products.find((x) => x.id === next);
                        setRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id
                              ? { ...r, productId: next, unit: p?.unit ?? r.unit }
                              : r
                          )
                        );
                      }}
                      className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400"
                    >
                      <option value="">Selecciona</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name ?? p.id}
                          {p.unit ? ` (${p.unit})` : ""}
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
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, quantity: e.target.value } : r))
                        )
                      }
                      className="mt-1 h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400"
                    />
                  </label>
                  <label className="flex w-20 flex-col gap-1">
                    <span className="text-[11px] text-zinc-500">Unidad</span>
                    <input
                      name="item_unit"
                      placeholder={product?.unit ?? "—"}
                      value={row.unit}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, unit: e.target.value } : r))
                        )
                      }
                      className="mt-1 h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400"
                    />
                  </label>
                  <label className="min-w-[120px] flex-1 flex-col gap-1 md:flex-initial">
                    <span className="text-[11px] text-zinc-500">Nota (opcional)</span>
                    <input
                      name="item_notes"
                      placeholder="Ej. para producción"
                      value={row.notes}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, notes: e.target.value } : r))
                        )
                      }
                      className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400"
                    />
                  </label>
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="h-10 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-600 hover:bg-zinc-100"
                    >
                      Quitar
                    </button>
                  ) : null}
                  {isLast ? (
                    <button
                      type="button"
                      onClick={addRow}
                      className="h-10 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-600 hover:bg-zinc-100"
                    >
                      + Otro ítem
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <button type="submit" className="ui-btn ui-btn--brand">
          Registrar retiro
        </button>
      </form>

      <p className="mt-4 text-xs text-zinc-500">
        El stock se descuenta en esta ubicación y en la sede. Para abrir directo desde un QR en la zona, usa la URL con <span className="font-mono">?loc_id=UUID</span> o <span className="font-mono">?loc=LOC-CP-BODEGA-MAIN</span>.
      </p>
    </div>
  );
}
