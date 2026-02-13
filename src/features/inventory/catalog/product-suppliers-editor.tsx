"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type SupplierLine = {
  id?: string;
  supplier_id: string;
  supplier_sku?: string;
  purchase_unit?: string;
  purchase_unit_size?: number;
  purchase_pack_qty?: number;
  purchase_pack_unit_code?: string;
  purchase_price?: number;
  currency?: string;
  lead_time_days?: number;
  min_order_qty?: number;
  is_primary: boolean;
  _delete?: boolean;
};

type SupplierOption = { id: string; name: string | null };

type UnitOption = {
  code: string;
  family: "volume" | "mass" | "count";
  factor_to_base: number;
};

type Props = {
  name?: string;
  initialRows: SupplierLine[];
  suppliers: SupplierOption[];
  units: UnitOption[];
  stockUnitCode?: string;
  stockUnitCodeFieldId?: string;
};

const emptyLine = (): SupplierLine => ({
  supplier_id: "",
  supplier_sku: "",
  purchase_unit: "",
  purchase_unit_size: undefined,
  purchase_pack_qty: undefined,
  purchase_pack_unit_code: "",
  purchase_price: undefined,
  currency: "COP",
  lead_time_days: undefined,
  min_order_qty: undefined,
  is_primary: false,
});

export function ProductSuppliersEditor({
  name = "supplier_lines",
  initialRows,
  suppliers,
  units,
  stockUnitCode,
  stockUnitCodeFieldId,
}: Props) {
  const [lines, setLines] = useState<SupplierLine[]>(
    initialRows.length ? initialRows : [emptyLine()]
  );
  const [liveStockUnitCode, setLiveStockUnitCode] = useState(stockUnitCode ?? "");

  const unitsByCode = useMemo(
    () =>
      new Map(
        units.map((unit) => [
          unit.code.trim().toLowerCase(),
          { ...unit, factor_to_base: Number(unit.factor_to_base) || 0 },
        ])
      ),
    [units]
  );

  const stockUnit = liveStockUnitCode
    ? unitsByCode.get(liveStockUnitCode.trim().toLowerCase()) ?? null
    : null;

  useEffect(() => {
    if (!stockUnitCodeFieldId) return;
    const node = document.getElementById(stockUnitCodeFieldId) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    if (!node) return;

    const syncValue = () => {
      setLiveStockUnitCode(node.value ?? "");
    };

    syncValue();
    node.addEventListener("change", syncValue);
    node.addEventListener("input", syncValue);
    return () => {
      node.removeEventListener("change", syncValue);
      node.removeEventListener("input", syncValue);
    };
  }, [stockUnitCodeFieldId]);

  const updateLine = useCallback((index: number, patch: Partial<SupplierLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
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

  const setPrimary = useCallback((index: number, nextValue: boolean) => {
    setLines((prev) =>
      prev.map((line, i) =>
        i === index
          ? { ...line, is_primary: nextValue }
          : nextValue
            ? { ...line, is_primary: false }
            : line
      )
    );
  }, []);

  const visibleLines = lines.filter((line) => !line._delete);

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(lines)} />

      <div className="flex items-center justify-between">
        <span className="ui-label">
          Proveedores
          {stockUnit ? ` - unidad canonica: ${stockUnit.code}` : ""}
        </span>
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
              <th className="py-2 pr-2">Empaque</th>
              <th className="py-2 pr-2">Cantidad empaque</th>
              <th className="py-2 pr-2">Unidad empaque</th>
              <th className="py-2 pr-2">Precio</th>
              <th className="py-2 pr-2">Costo/u. stock</th>
              <th className="py-2 pr-2">Moneda</th>
              <th className="py-2 pr-2">Lead time (dias)</th>
              <th className="py-2 pr-2">Min orden</th>
              <th className="py-2 pr-2">Primario</th>
              <th className="py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((line, index) => {
              const realIndex = lines.findIndex((current) => current === line);
              const packUnit = line.purchase_pack_unit_code
                ? unitsByCode.get(line.purchase_pack_unit_code.trim().toLowerCase())
                : null;
              const packQty = Number(line.purchase_pack_qty ?? 0);
              const price = Number(line.purchase_price ?? 0);

              const isFamilyCompatible =
                Boolean(stockUnit) &&
                Boolean(packUnit) &&
                stockUnit?.family === packUnit?.family;

              const stockQty =
                isFamilyCompatible && stockUnit && packUnit && packQty > 0
                  ? (packQty * packUnit.factor_to_base) / stockUnit.factor_to_base
                  : null;

              const costPerStockUnit =
                stockQty && stockQty > 0 && Number.isFinite(price) ? price / stockQty : null;

              return (
                <tr key={line.id ?? `new-${index}`} className="border-t border-zinc-200/60">
                  <td className="py-2 pr-2">
                    <select
                      value={line.supplier_id}
                      onChange={(event) =>
                        updateLine(realIndex, { supplier_id: event.target.value })
                      }
                      className="ui-input min-w-[140px]"
                    >
                      <option value="">Seleccionar</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name ?? supplier.id}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={line.supplier_sku ?? ""}
                      onChange={(event) =>
                        updateLine(realIndex, { supplier_sku: event.target.value })
                      }
                      className="ui-input w-28"
                      placeholder="SKU"
                    />
                  </td>

                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={line.purchase_unit ?? ""}
                      onChange={(event) =>
                        updateLine(realIndex, { purchase_unit: event.target.value })
                      }
                      className="ui-input w-24"
                      placeholder="pote, caja"
                    />
                  </td>

                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      step="0.000001"
                      value={line.purchase_pack_qty ?? ""}
                      onChange={(event) =>
                        updateLine(realIndex, {
                          purchase_pack_qty: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                          purchase_unit_size: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        })
                      }
                      className="ui-input w-24"
                      placeholder="-"
                    />
                  </td>

                  <td className="py-2 pr-2">
                    <select
                      value={line.purchase_pack_unit_code ?? ""}
                      onChange={(event) =>
                        updateLine(realIndex, {
                          purchase_pack_unit_code: event.target.value,
                        })
                      }
                      className="ui-input w-24"
                    >
                      <option value="">unidad</option>
                      {units.map((unit) => (
                        <option key={unit.code} value={unit.code}>
                          {unit.code}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      step="0.01"
                      value={line.purchase_price ?? ""}
                      onChange={(event) =>
                        updateLine(realIndex, {
                          purchase_price: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        })
                      }
                      className="ui-input w-24"
                      placeholder="-"
                    />
                  </td>

                  <td className="py-2 pr-2 text-xs">
                    {costPerStockUnit != null && Number.isFinite(costPerStockUnit) && stockUnit ? (
                      <span className="font-mono">
                        {costPerStockUnit.toFixed(6)} / {stockUnit.code}
                      </span>
                    ) : !isFamilyCompatible && line.purchase_pack_unit_code ? (
                      <span className="text-red-600">Familia incompatible</span>
                    ) : (
                      "-"
                    )}
                  </td>

                  <td className="py-2 pr-2">
                    <input
                      type="text"
                      value={line.currency ?? "COP"}
                      onChange={(event) =>
                        updateLine(realIndex, { currency: event.target.value })
                      }
                      className="ui-input w-16"
                      placeholder="COP"
                    />
                  </td>

                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      value={line.lead_time_days ?? ""}
                      onChange={(event) =>
                        updateLine(realIndex, {
                          lead_time_days: event.target.value
                            ? Number(event.target.value)
                            : undefined,
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
                      onChange={(event) =>
                        updateLine(realIndex, {
                          min_order_qty: event.target.value
                            ? Number(event.target.value)
                            : undefined,
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
                        onChange={(event) => setPrimary(realIndex, event.target.checked)}
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
