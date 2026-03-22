"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export type SupplierLine = {
  id?: string;
  supplier_id: string;
  supplier_sku?: string;
  purchase_unit?: string;
  purchase_unit_size?: number;
  purchase_pack_qty?: number;
  purchase_pack_unit_code?: string;
  purchase_price?: number;
  purchase_price_net?: number;
  purchase_price_includes_tax?: boolean;
  purchase_tax_rate?: number;
  currency?: string;
  lead_time_days?: number;
  min_order_qty?: number;
  is_primary: boolean;
  use_in_operations?: boolean;
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
  mode?: "simple" | "full";
};

type SupplierValidationIssue = {
  message: string;
  label: string;
  targetId: string;
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
    purchase_price_net: undefined,
    purchase_price_includes_tax: false,
    purchase_tax_rate: undefined,
    currency: "COP",
    lead_time_days: undefined,
    min_order_qty: undefined,
    is_primary: false,
    use_in_operations: false,
  };
}

function parseTaxRateInput(raw: string): number | undefined {
  const normalized = raw.replace(",", ".").trim();
  if (!normalized) return undefined;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return undefined;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
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
  mode = "full",
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasErrorParam = Boolean(searchParams?.get("error"));
  const draftKey = useMemo(() => {
    const type = searchParams?.get("type") ?? "";
    const modeParam = searchParams?.get("mode") ?? "";
    return `nexo:supplier-lines:${pathname || "unknown"}:${name}:${type}:${modeParam}`;
  }, [name, pathname, searchParams]);
  const isSimpleMode = mode === "simple";
  const normalizedInitialStockUnitCode = normalizeCode(stockUnitCode);
  const normalizedInitialRows =
    initialRows.length > 0
      ? initialRows.map((line, index) =>
          isSimpleMode && index === 0 ? { ...line, is_primary: true } : line
        )
      : [];
  const [lines, setLines] = useState<SupplierLine[]>(
    normalizedInitialRows.length
      ? normalizedInitialRows
      : [{ ...buildEmptyLine(normalizedInitialStockUnitCode), is_primary: isSimpleMode }]
  );
  const [liveStockUnitCode, setLiveStockUnitCode] = useState(normalizedInitialStockUnitCode);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);

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
    if (!hasErrorParam || restoredFromDraft || typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(draftKey);
    if (!raw) {
      setRestoredFromDraft(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as SupplierLine[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setLines(parsed);
      }
    } catch {
      // ignore invalid draft
    } finally {
      setRestoredFromDraft(true);
    }
  }, [draftKey, hasErrorParam, restoredFromDraft]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(draftKey, JSON.stringify(lines));
  }, [draftKey, lines]);

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
          ? { ...line, is_primary: nextValue, use_in_operations: nextValue ? line.use_in_operations : false }
          : nextValue
            ? { ...line, is_primary: false, use_in_operations: false }
            : line
      )
    );
  }, []);

  const visibleLines = lines.filter((line) => !line._delete);
  const validationIssue = useMemo<SupplierValidationIssue | null>(() => {
    const activeLines = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => !line._delete);
    if (activeLines.length === 0) {
      return {
        message: "Debes agregar al menos un proveedor para este producto.",
        label: "al menos un proveedor",
        targetId: `${name}-add-line`,
      };
    }

    const linkedSuppliers = activeLines.filter(({ line }) => Boolean(line.supplier_id));
    if (linkedSuppliers.length === 0) {
      return {
        message: "Debes seleccionar al menos un proveedor.",
        label: "proveedor",
        targetId: `${name}-line-${activeLines[0]?.index ?? 0}-supplier`,
      };
    }

    const primaryEntry =
      linkedSuppliers.find(({ line }) => Boolean(line.is_primary)) ??
      linkedSuppliers[0];
    if (!primaryEntry) return null;

    const baseId = `${name}-line-${primaryEntry.index}`;
    const packQty = Number(primaryEntry.line.purchase_pack_qty ?? primaryEntry.line.purchase_unit_size ?? 0);
    const packUnitCode = normalizeCode(primaryEntry.line.purchase_pack_unit_code);
    const purchaseUnitLabel = String(primaryEntry.line.purchase_unit ?? "").trim();
    const purchasePrice = Number(primaryEntry.line.purchase_price ?? 0);

    if (!purchaseUnitLabel) {
      return {
        message: "Completa el empaque del proveedor principal.",
        label: "empaque del proveedor principal",
        targetId: `${baseId}-purchase-unit`,
      };
    }
    if (!(packQty > 0)) {
      return {
        message: "Completa la cantidad por empaque del proveedor principal.",
        label: "cantidad por empaque",
        targetId: `${baseId}-purchase-pack-qty`,
      };
    }
    if (!packUnitCode) {
      return {
        message: "Selecciona la unidad de compra del proveedor principal.",
        label: "unidad de compra",
        targetId: `${baseId}-purchase-pack-unit`,
      };
    }
    if (!(purchasePrice > 0)) {
      return {
        message: "Completa el precio de compra del proveedor principal.",
        label: "precio de compra",
        targetId: `${baseId}-purchase-price`,
      };
    }

    const packUnit = unitsByCode.get(packUnitCode);
    if (stockUnit && packUnit && stockUnit.family !== packUnit.family) {
      return {
        message:
          "La unidad de compra no es compatible con la unidad base. Ajusta unidad base o unidad de compra.",
        label: "unidad de compra compatible",
        targetId: `${baseId}-purchase-pack-unit`,
      };
    }

    return null;
  }, [lines, name, stockUnit, unitsByCode]);

  return (
    <div className="space-y-4">
      <input type="hidden" name={name} value={JSON.stringify(lines)} />
      <input
        type="hidden"
        name={`${name}__client_validation`}
        value={validationIssue ? "" : "ok"}
        data-required-custom="true"
        data-required-label={validationIssue?.label ?? "proveedor principal completo"}
        data-required-target={validationIssue?.targetId ?? `${name}-add-line`}
      />

      <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
        <p className="font-medium text-[var(--ui-text)]">Fase 1 - Compra principal (proveedor)</p>
        <p className="mt-1">1) Define empaque, cantidad y unidad de compra.</p>
        <p>2) El sistema convierte a la unidad base del producto.</p>
        <p>3) Calcula el costo por unidad base automaticamente.</p>
        {isSimpleMode ? (
          <p className="mt-2">
            En este paso solo necesitas completar la <strong className="text-[var(--ui-text)]">compra principal</strong>.
            Los proveedores extra son opcionales.
          </p>
        ) : null}
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
        <span className="ui-label">{isSimpleMode ? "Compra principal" : "Proveedores"}</span>
        <button id={`${name}-add-line`} type="button" onClick={addLine} className="ui-btn ui-btn--ghost text-sm">
          {isSimpleMode ? "+ Agregar proveedor adicional" : "+ Agregar proveedor"}
        </button>
      </div>
      {validationIssue ? (
        <div className="ui-alert ui-alert--error">
          {validationIssue.message}
        </div>
      ) : null}

      {visibleLines.length === 0 ? (
        <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
          Sin proveedores activos en esta ficha.
        </div>
      ) : (
        <div className="space-y-4">
          {visibleLines.map((line, index) => {
            const realIndex = lines.findIndex((current) => current === line);
            const isMainSimpleRow = isSimpleMode && index === 0;
            const packUnitCode = normalizeCode(line.purchase_pack_unit_code);
            const packUnit = packUnitCode ? unitsByCode.get(packUnitCode) ?? null : null;
            const packQty = Number(line.purchase_pack_qty ?? 0);
            const price = Number(line.purchase_price ?? 0);
            const includesTax = Boolean(line.purchase_price_includes_tax);
            const taxRateRaw = Number(line.purchase_tax_rate ?? 0);
            const taxRate = Number.isFinite(taxRateRaw) && taxRateRaw >= 0 ? taxRateRaw : 0;
            const netPackPrice =
              price > 0
                ? includesTax
                  ? price / (1 + taxRate / 100)
                  : price
                : 0;
            const packLabel = line.purchase_unit?.trim() || "empaque";
            const currency = line.currency?.trim() || "COP";
            const hasPurchaseData =
              Boolean(line.supplier_id) &&
              Boolean(line.purchase_unit?.trim()) &&
              packQty > 0 &&
              netPackPrice > 0;

            const isFamilyCompatible =
              Boolean(stockUnit) &&
              Boolean(packUnit) &&
              stockUnit?.family === packUnit?.family;

            const isReadyForAutoCost =
              Boolean(line.is_primary) &&
              hasPurchaseData &&
              Boolean(stockUnit) &&
              Boolean(packUnit) &&
              isFamilyCompatible;

            const stockQty =
              isFamilyCompatible && stockUnit && packUnit && packQty > 0
                ? (packQty * packUnit.factor_to_base) / stockUnit.factor_to_base
                : null;

            const costPerStockUnit =
              stockQty && stockQty > 0 && Number.isFinite(netPackPrice) ? netPackPrice / stockQty : null;

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
                      {isSimpleMode
                        ? index === 0
                          ? "Proveedor principal"
                          : `Proveedor adicional #${index}`
                        : `Proveedor #${index + 1}`}
                    </span>
                    {line.is_primary ? (
                      <span className="rounded-full bg-[var(--ui-brand)]/15 px-2 py-0.5 text-xs font-medium text-[var(--ui-brand)]">
                        Primario
                      </span>
                    ) : null}
                    {line.is_primary ? (
                      <span
                        className={
                          isReadyForAutoCost
                            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                            : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                        }
                      >
                        {isReadyForAutoCost ? "Listo para auto-costo" : "Falta completar compra"}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    {isMainSimpleRow ? (
                      <span className="text-xs text-[var(--ui-muted)]">
                        Este proveedor queda como primario por defecto.
                      </span>
                    ) : (
                      <label className="flex items-center gap-1 text-xs text-[var(--ui-muted)]">
                        <input
                          id={`${name}-line-${realIndex}-is-primary`}
                          type="checkbox"
                          checked={Boolean(line.is_primary)}
                          onChange={(event) => setPrimary(realIndex, event.target.checked)}
                        />
                        Primario
                      </label>
                    )}
                    {line.is_primary ? (
                      <label
                        className="flex items-center gap-1 text-xs text-[var(--ui-muted)]"
                        title="Permite usar este empaque en remisiones, traslados y retiros sin hacer conversion manual."
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(line.use_in_operations)}
                          onChange={(event) =>
                            updateLine(realIndex, { use_in_operations: event.target.checked })
                          }
                        />
                        Usar empaque en operacion
                      </label>
                    ) : null}
                    {!isSimpleMode || index > 0 ? (
                      <button
                        type="button"
                        onClick={() => removeLine(realIndex)}
                        className="text-xs text-[var(--ui-danger)] hover:underline"
                        title="Quitar"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <label className="flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50/60 p-2">
                    <span className="ui-label">Proveedor *</span>
                    <select
                      id={`${name}-line-${realIndex}-supplier`}
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

                  <label className="flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50/60 p-2">
                    <span className="ui-label">Empaque *</span>
                    <input
                      id={`${name}-line-${realIndex}-purchase-unit`}
                      type="text"
                      value={line.purchase_unit ?? ""}
                      onChange={(event) =>
                        updateLine(realIndex, { purchase_unit: event.target.value })
                      }
                      className="ui-input"
                      placeholder="pote, bolsa, caja"
                    />
                  </label>

                  <label className="flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50/60 p-2">
                    <span className="ui-label">Cantidad por empaque *</span>
                    <input
                      id={`${name}-line-${realIndex}-purchase-pack-qty`}
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

                  <label className="flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50/60 p-2">
                    <span className="ui-label">Unidad de compra *</span>
                    <select
                      id={`${name}-line-${realIndex}-purchase-pack-unit`}
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
                    <span className="text-xs text-[var(--ui-muted)]">
                      Unidad en la que factura el proveedor. Para liquidos usa l/ml, para peso kg/g, para piezas un.
                    </span>
                  </label>

                  <label className="flex flex-col gap-1 rounded-xl border border-amber-200 bg-amber-50/60 p-2">
                    <span className="ui-label">Precio de compra *</span>
                    <input
                      id={`${name}-line-${realIndex}-purchase-price`}
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
                    <span className="text-xs text-[var(--ui-muted)]">
                      Precio del empaque completo (no por unidad base).
                    </span>
                    <label className="mt-1 flex items-center gap-2 text-xs text-[var(--ui-muted)]">
                      <input
                        type="checkbox"
                        checked={Boolean(line.purchase_price_includes_tax)}
                        onChange={(event) =>
                          updateLine(realIndex, {
                            purchase_price_includes_tax: event.target.checked,
                          })
                        }
                      />
                      Incluye IVA
                    </label>
                    {Boolean(line.purchase_price_includes_tax) ? (
                      <label className="flex items-center gap-2 text-xs text-[var(--ui-muted)]">
                        <span>% IVA</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.purchase_tax_rate ?? ""}
                          onChange={(event) =>
                            updateLine(realIndex, {
                              purchase_tax_rate: parseTaxRateInput(event.target.value),
                            })
                          }
                          className="ui-input h-9 w-28"
                          placeholder=""
                        />
                      </label>
                    ) : null}
                    {price > 0 ? (
                      <span className="text-xs text-[var(--ui-muted)]">
                        Neto sin IVA: {formatMoney(netPackPrice, currency)}
                      </span>
                    ) : null}
                  </label>
                </div>

                <details className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-[var(--ui-text)]">
                    Campos avanzados
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                </details>

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
