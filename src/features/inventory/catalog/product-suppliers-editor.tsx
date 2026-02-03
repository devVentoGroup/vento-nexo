"use client";

import { useCallback, useState } from "react";

export type SupplierLine = {
  id?: string;
  supplier_id: string;
  supplier_sku?: string;
  purchase_unit?: string;
  purchase_unit_size?: number;
  purchase_price?: number;
  currency?: string;
  lead_time_days?: number;
  min_order_qty?: number;
  is_primary: boolean;
  _delete?: boolean;
};

type SupplierOption = { id: string; name: string | null };

type Props = {
  name?: string;
  initialRows: SupplierLine[];
  suppliers: SupplierOption[];
};

const emptyLine = (): SupplierLine => ({
  supplier_id: "",
  supplier_sku: "",
  purchase_unit: "",
  purchase_unit_size: undefined,
  purchase_price: undefined,
  currency: "COP",
  lead_time_days: undefined,
  min_order_qty: undefined,
  is_primary: false,
});

export function ProductSuppliersEditor({ name = "supplier_lines", initialRows, suppliers }: Props) {
  const [lines, setLines] = useState<SupplierLine[]>(
    initialRows.length ? initialRows : [emptyLine()]
  );

  const updateLine = useCallback((index: number, patch: Partial<SupplierLine>) => {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, emptyLine()]);
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => {
      const line = prev[index];
      if (line?.id) {
        return prev.map((l, i) => (i === index ? { ...l, _delete: true } : l));
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const visibleLines = lines.filter((l) => !l._delete);

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(lines)} />
      <div className="flex items-center justify-between">
        <span className="ui-label">Proveedores</span>
        <button type="button" onClick={addLine} className="ui-btn ui-btn--ghost text-sm">
          + Agregar proveedor
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-[var(--ui-muted)]">
            <tr>
              <th className="py-2 pr-2">Proveedor</th>
              <th className="py-2 pr-2">SKU proveedor</th>
              <th className="py-2 pr-2">Unidad compra</th>
              <th className="py-2 pr-2">Tamaño</th>
              <th className="py-2 pr-2">Precio</th>
              <th className="py-2 pr-2">Moneda</th>
              <th className="py-2 pr-2">Lead time (días)</th>
              <th className="py-2 pr-2">Mín orden</th>
              <th className="py-2 pr-2">Primario</th>
              <th className="py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((line, index) => {
              const realIndex = lines.findIndex((l) => l === line);
              return (
                <tr key={line.id ?? `new-${index}`} className="border-t border-zinc-200/60">
                  <td className="py-2 pr-2">
                    <select
                      value={line.supplier_id}
                      onChange={(e) => updateLine(realIndex, { supplier_id: e.target.value })}
                      className="ui-input min-w-[140px]"
                    >
                      <option value="">Seleccionar</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name ?? s.id}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={line.supplier_sku ?? ""}
                      onChange={(e) => updateLine(realIndex, { supplier_sku: e.target.value })}
                      className="ui-input w-28"
                      placeholder="SKU"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={line.purchase_unit ?? ""}
                      onChange={(e) => updateLine(realIndex, { purchase_unit: e.target.value })}
                      className="ui-input w-24"
                      placeholder="unidad"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      step="0.01"
                      value={line.purchase_unit_size ?? ""}
                      onChange={(e) =>
                        updateLine(realIndex, {
                          purchase_unit_size: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="ui-input w-20"
                      placeholder="-"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      step="0.01"
                      value={line.purchase_price ?? ""}
                      onChange={(e) =>
                        updateLine(realIndex, {
                          purchase_price: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="ui-input w-24"
                      placeholder="-"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={line.currency ?? "COP"}
                      onChange={(e) => updateLine(realIndex, { currency: e.target.value })}
                      className="ui-input w-16"
                      placeholder="COP"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      value={line.lead_time_days ?? ""}
                      onChange={(e) =>
                        updateLine(realIndex, {
                          lead_time_days: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="ui-input w-20"
                      placeholder="-"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      step="0.01"
                      value={line.min_order_qty ?? ""}
                      onChange={(e) =>
                        updateLine(realIndex, {
                          min_order_qty: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="ui-input w-20"
                      placeholder="-"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={Boolean(line.is_primary)}
                        onChange={(e) => updateLine(realIndex, { is_primary: e.target.checked })}
                      />
                      <span className="text-xs">Prim.</span>
                    </label>
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => removeLine(realIndex)}
                      className="text-red-600 hover:underline text-xs"
                      title="Quitar"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
