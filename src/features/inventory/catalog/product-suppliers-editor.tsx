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
  name?: string | null;
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

function normalizeCode(value: string | undefined | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function buildEmptyLine(stockUnitCode?: string): SupplierLine {
  const normalizedStockUnitCode = normalizeCode(stockUnitCode);
  return {
    supplier_id: "",
    supplier_sku: "",
    purchase_unit: "",
    purchase_unit_size: undefined,
    purchase_pack_qty: undefined,
    purchase_pack_unit_code: normalizedStockUnitCode || "",
    purchase_price: undefined,
    currency: "COP",
    lead_time_days: undefined,
    min_order_qty: undefined,
    is_primary: false,
  };
}

function formatNumber(value: number, maxFractionDigits = 6): string {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

function formatMoney(value: number, currencyRaw: string | undefined): string {
  const currency = (currencyRaw || "COP").trim().toUpperCase() || "COP";
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${formatNumber(value, 2)} ${currency}`;
  }
}

export function ProductSuppliersEditor({
  name = "supplier_lines",
  initialRows,
  suppliers,
  units,
  stockUnitCode,
  stockUnitCodeFieldId,
}: Props) {
  const normalizedInitialStockUnitCode = normalizeCode(stockUnitCode);
  const [lines, setLines] = useState<SupplierLine[]>(
    initialRows.length ? initialRows : [buildEmptyLine(normalizedInitialStockUnitCode)]
  );
  const [liveStockUnitCode, setLiveStockUnitCode] = useState(normalizedInitialStockUnitCode);

  const unitsByCode = useMemo(
    () =>
      new Map(
        units.map((unit) => [
          normalizeCode(unit.code),
          { ...unit, factor_to_base: Number(unit.factor_to_base) || 0 },
        ])
      ),
    [units]
  );

  const stockUnit = liveStockUnitCode
    ? unitsByCode.get(normalizeCode(liveStockUnitCode)) ?? null
    : null;

  useEffect(() => {
    if (!stockUnitCodeFieldId) return;
    const node = document.getElementById(stockUnitCodeFieldId) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
    if (!node) return;

    const syncValue = () => {
      setLiveStockUnitCode(normalizeCode(node.value));
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
    setLines((prev) => [...prev, buildEmptyLine(liveStockUnitCode)]);
  }, [liveStockUnitCode]);

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
    <div className="space-y-4">
      <input type="hidden" name={name} value={JSON.stringify(lines)} />

      <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
        <p className="font-medium text-[var(--ui-text)]">Calculadora compra -&gt; inventario</p>
        <p className="mt-1">1) Define empaque, cantidad y unidad de compra.</p>
        <p>2) El sistema convierte a la unidad base del producto.</p>
        <p>3) Calcula el costo por unidad base automaticamente.</p>
        {stockUnit ? (
          <p className="mt-2">
            Unidad base activa:{" "}
            <span className="font-semibold text-[var(--ui-text)]">
              {stockUnit.code} ({stockUnit.name ?? stockUnit.code})
            </span>
          </p>
        ) : (
          <p className="mt-2 text-[var(--ui-danger)]">
            Selecciona primero la unidad base del producto para habilitar conversiones.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="ui-label">Proveedores</span>
        <button type="button" onClick={addLine} className="ui-btn ui-btn--ghost text-sm">
          + Agregar proveedor
        </button>
      </div>

      {visibleLines.length === 0 ? (
        <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
          Sin proveedores activos en esta ficha.
        </div>
      ) : (
        <div className="space-y-4">
          {visibleLines.map((line, index) => {
            const realIndex = lines.findIndex((current) => current === line);
            const packUnitCode = normalizeCode(line.purchase_pack_unit_code);
            const packUnit = packUnitCode ? unitsByCode.get(packUnitCode) ?? null : null;
            const packQty = Number(line.purchase_pack_qty ?? 0);
            const price = Number(line.purchase_price ?? 0);
            const packLabel = line.purchase_unit?.trim() || "empaque";
            const currency = line.currency?.trim() || "COP";

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

            const packUnitOptions = stockUnit
              ? units.filter(
                  (unit) =>
                    unit.family === stockUnit.family ||
                    normalizeCode(unit.code) === packUnitCode
                )
              : units;

            return (
              <div
                key={line.id ?? `new-${index}`}
                className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ui-border)] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--ui-text)]">
                      Proveedor #{index + 1}
                    </span>
                    {line.is_primary ? (
                      <span className="rounded-full bg-[var(--ui-brand)]/15 px-2 py-0.5 text-xs font-medium text-[var(--ui-brand)]">
                        Primario
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1 text-xs text-[var(--ui-muted)]">
                      <input
                        type="checkbox"
                        checked={Boolean(line.is_primary)}
                        onChange={(event) => setPrimary(realIndex, event.target.checked)}
                      />
                      Primario
                    </label>
                    <button
                      type="button"
                      onClick={() => removeLine(realIndex)}
                      className="text-xs text-[var(--ui-danger)] hover:underline"
                      title="Quitar"
                    >
                      Quitar
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Proveedor</span>
                    <select
                      value={line.supplier_id}
                      onChange={(event) =>
                        updateLine(realIndex, { supplier_id: event.target.value })
                      }
                      className="ui-input"
                    >
                      <option value="">Seleccionar</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name ?? supplier.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">SKU proveedor</span>
                    <input
                      type="text"
                      value={line.supplier_sku ?? ""}
                      onChange={(event) =>
                        updateLine(realIndex, { supplier_sku: event.target.value })
                      }
                      className="ui-input"
                      placeholder="SKU"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Empaque</span>
                    <input
                      type="text"
                      value={line.purchase_unit ?? ""}
                      onChange={(event) =>
                        updateLine(realIndex, { purchase_unit: event.target.value })
                      }
                      className="ui-input"
                      placeholder="pote, bolsa, caja"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Cantidad por empaque</span>
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
                      className="ui-input"
                      placeholder="Ej. 2000"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Unidad de compra</span>
                    <select
                      value={line.purchase_pack_unit_code ?? ""}
                      onChange={(event) =>
                        updateLine(realIndex, {
                          purchase_pack_unit_code: event.target.value,
                        })
                      }
                      className="ui-input"
                    >
                      <option value="">Seleccionar</option>
                      {packUnitOptions.map((unit) => (
                        <option key={unit.code} value={unit.code}>
                          {unit.code} - {unit.name ?? unit.code}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Precio de compra</span>
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
                      className="ui-input"
                      placeholder="-"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Moneda</span>
                    <input
                      type="text"
                      value={line.currency ?? "COP"}
                      onChange={(event) =>
                        updateLine(realIndex, { currency: event.target.value })
                      }
                      className="ui-input"
                      placeholder="COP"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Lead time (dias)</span>
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
                      className="ui-input"
                      placeholder="-"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Minimo de orden</span>
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
                      className="ui-input"
                      placeholder="-"
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3 text-sm">
                  <p className="font-medium text-[var(--ui-text)]">
                    Calculadora de conversion de este proveedor
                  </p>
                  {!stockUnit ? (
                    <p className="mt-1 text-[var(--ui-muted)]">
                      Selecciona primero la unidad base en la seccion de almacenamiento.
                    </p>
                  ) : !packUnit || packQty <= 0 ? (
                    <p className="mt-1 text-[var(--ui-muted)]">
                      Completa cantidad y unidad de compra para calcular conversion y costo.
                    </p>
                  ) : !isFamilyCompatible ? (
                    <p className="mt-1 text-[var(--ui-danger)]">
                      Unidad incompatible: compra en familia {packUnit?.family} y stock en{" "}
                      {stockUnit.family}.
                    </p>
                  ) : (
                    <div className="mt-1 space-y-1 text-[var(--ui-text)]">
                      <p>
                        1 {packLabel} = {formatNumber(stockQty ?? 0)} {stockUnit.code}
                      </p>
                      {costPerStockUnit != null && Number.isFinite(costPerStockUnit) ? (
                        <p>
                          Costo por {stockUnit.code}: {formatMoney(costPerStockUnit, currency)}
                        </p>
                      ) : (
                        <p className="text-[var(--ui-muted)]">
                          Ingresa precio de compra para obtener costo por unidad base.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
