"use client";

import { useEffect, useMemo, useState } from "react";

import { SearchableSingleSelect } from "@/components/inventory/forms/SearchableSingleSelect";
import {
  convertByProductProfile,
  normalizeUnitCode,
  roundQuantity,
  selectProductUomProfileForContext,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

type Option = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
  category_id?: string | null;
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
  inputUomProfileId: string;
  areaKind: string;
};

export type RemissionDraftRow = Row;

type Props = {
  products: Option[];
  categoryNameById?: Record<string, string>;
  areaOptions: AreaOption[];
  defaultUomProfiles?: ProductUomProfile[];
  onRowsChange?: (rows: RemissionDraftRow[]) => void;
  referenceStockByProduct?: Record<
    string,
    {
      currentQty: number;
      updatedAt: string | null;
    }
  >;
  referenceSiteName?: string;
};

export function RemissionsItems({
  products,
  categoryNameById = {},
  areaOptions,
  defaultUomProfiles = [],
  onRowsChange,
  referenceStockByProduct = {},
  referenceSiteName = "",
}: Props) {
  const [rows, setRows] = useState<Row[]>([
    {
      id: 0,
      productId: "",
      quantity: "",
      inputUnitCode: "",
      inputUomProfileId: "",
      areaKind: "",
    },
  ]);

  const defaultProfileByProduct = useMemo(() => {
    const profilesByProduct = new Map<string, ProductUomProfile[]>();
    for (const profile of defaultUomProfiles) {
      if (!profile.is_active) continue;
      const productId = String(profile.product_id).trim();
      const current = profilesByProduct.get(productId) ?? [];
      current.push(profile);
      profilesByProduct.set(productId, current);
    }
    const selected = new Map<string, ProductUomProfile>();
    for (const [productId, profiles] of profilesByProduct.entries()) {
      const preferred = selectProductUomProfileForContext({
        profiles,
        productId,
        context: "remission",
      });
      if (preferred) selected.set(productId, preferred);
    }
    return selected;
  }, [defaultUomProfiles]);

  useEffect(() => {
    onRowsChange?.(rows);
  }, [rows, onRowsChange]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: prev.length,
        productId: "",
        quantity: "",
        inputUnitCode: "",
        inputUomProfileId: "",
        areaKind: "",
      },
    ]);
  };

  const removeRow = (rowId: number) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== rowId)));
  };

  const productOptions = products.map((item) => ({
    value: item.id,
    label: `${item.name ?? item.id}${
      item.stock_unit_code ? ` (${item.stock_unit_code})` : item.unit ? ` (${item.unit})` : ""
    }`,
    searchText: `${item.name ?? ""} ${item.unit ?? ""} ${item.stock_unit_code ?? ""} ${
      categoryNameById[String(item.category_id ?? "").trim()] ?? ""
    }`,
    groupLabel: categoryNameById[String(item.category_id ?? "").trim()] ?? "Sin categoria",
  }));

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => {
        const isLast = idx === rows.length - 1;
        const product = products.find((item) => item.id === row.productId);
        const stockUnitCode = normalizeUnitCode(product?.stock_unit_code ?? product?.unit ?? "");
        const defaultProfile = row.productId ? defaultProfileByProduct.get(row.productId) ?? null : null;
        const quantityValue = Number(row.quantity);
        const rowReady = Boolean(row.productId && Number.isFinite(quantityValue) && quantityValue > 0);
        const conversionInputLabel = String(defaultProfile?.label ?? "").trim();
        const conversionInputUnit = conversionInputLabel || defaultProfile?.input_unit_code || "";
        const stockUnitWithContextLabel =
          stockUnitCode &&
          defaultProfile &&
          normalizeUnitCode(defaultProfile.input_unit_code) === normalizeUnitCode(stockUnitCode) &&
          String(defaultProfile.label ?? "").trim()
            ? `${stockUnitCode} (${String(defaultProfile.label ?? "").trim()})`
            : stockUnitCode;
        const conversionLabel = defaultProfile
          ? `${defaultProfile.qty_in_input_unit} ${conversionInputUnit} = ${defaultProfile.qty_in_stock_unit} ${stockUnitCode || "un"}`
          : "";
        const referenceMeta = row.productId ? referenceStockByProduct[row.productId] ?? null : null;
        const availableReference = Number(referenceMeta?.currentQty ?? 0);
        const referenceComparison =
          row.productId && referenceSiteName
            ? (() => {
                try {
                  const requestedInStock = rowReady
                    ? convertByProductProfile({
                        quantityInInput: Number.isFinite(quantityValue) ? quantityValue : 0,
                        inputUnitCode: normalizeUnitCode(row.inputUnitCode || stockUnitCode),
                        stockUnitCode,
                        profile:
                          row.inputUomProfileId && defaultProfile?.id === row.inputUomProfileId
                            ? defaultProfile
                            : null,
                      }).quantityInStock
                    : null;
                  const shortage =
                    requestedInStock !== null
                      ? roundQuantity(Math.max(requestedInStock - availableReference, 0))
                      : 0;
                  return { requestedInStock, shortage };
                } catch {
                  return { requestedInStock: null, shortage: 0 };
                }
              })()
            : null;
        return (
          <div key={row.id} className="space-y-3">
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3 sm:p-4">
              <div className="text-sm font-semibold text-[var(--ui-text)]">
                {product?.name ?? `Item ${idx + 1}`}
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-12 md:items-start">
                <label className="flex min-w-0 flex-col gap-1 md:col-span-5">
                  <span className="ui-label">Producto</span>
                  <SearchableSingleSelect
                    name="item_product_id"
                    value={row.productId}
                    onValueChange={(nextProductId) => {
                      const nextProduct = products.find((item) => item.id === nextProductId);
                      const nextStockUnitCode = normalizeUnitCode(
                        nextProduct?.stock_unit_code ?? nextProduct?.unit ?? ""
                      );
                      const nextProfile = defaultProfileByProduct.get(nextProductId) ?? null;
                      setRows((prev) =>
                        prev.map((current) =>
                          current.id === row.id
                            ? {
                                ...current,
                                productId: nextProductId,
                                inputUnitCode:
                                  normalizeUnitCode(nextProfile?.input_unit_code ?? "") ||
                                  nextStockUnitCode ||
                                  current.inputUnitCode,
                                inputUomProfileId: nextProfile?.id ?? "",
                              }
                            : current
                        )
                      );
                    }}
                    options={productOptions}
                    placeholder="Selecciona producto"
                    searchPlaceholder="Buscar producto..."
                    sheetTitle="Productos"
                    dropdownMode="inline"
                    className="min-w-0"
                  />
                </label>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="ui-label">Cantidad</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    name="item_quantity"
                    placeholder="0"
                    className="ui-input h-10"
                    value={row.quantity}
                    onChange={(event) =>
                      setRows((prev) =>
                        prev.map((current) =>
                          current.id === row.id ? { ...current, quantity: event.target.value } : current
                        )
                      )
                    }
                  />
                </label>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="ui-label">Unidad de captura</span>
                  <select
                    name="item_input_unit_code"
                    className="ui-input h-10"
                    value={row.inputUnitCode}
                    onChange={(event) =>
                      setRows((prev) =>
                        prev.map((current) =>
                          current.id === row.id
                            ? {
                                ...current,
                                inputUnitCode: normalizeUnitCode(event.target.value),
                                inputUomProfileId:
                                  defaultProfile &&
                                  normalizeUnitCode(defaultProfile.input_unit_code) ===
                                    normalizeUnitCode(event.target.value)
                                    ? defaultProfile.id
                                    : "",
                              }
                            : current
                        )
                      )
                    }
                    required
                  >
                    <option value="">Unidad</option>
                    {stockUnitCode ? (
                      <option value={stockUnitCode}>{stockUnitWithContextLabel}</option>
                    ) : null}
                    {defaultProfile &&
                    normalizeUnitCode(defaultProfile.input_unit_code) !== normalizeUnitCode(stockUnitCode) ? (
                      <option value={normalizeUnitCode(defaultProfile.input_unit_code)}>
                        {normalizeUnitCode(defaultProfile.input_unit_code)} ({defaultProfile.label})
                      </option>
                    ) : null}
                  </select>
                </label>

                <label className="flex flex-col gap-1 md:col-span-3">
                  <span className="ui-label">Area operativa</span>
                  <select
                    name="item_area_kind"
                    className="ui-input h-10"
                    value={row.areaKind}
                    onChange={(event) =>
                      setRows((prev) =>
                        prev.map((current) =>
                          current.id === row.id ? { ...current, areaKind: event.target.value } : current
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
                </label>

                <input type="hidden" name="item_input_uom_profile_id" value={row.inputUomProfileId} />
                <input type="hidden" name="item_quantity_in_input" value={row.quantity} />

                {conversionLabel ? (
                  <div className="text-xs text-[var(--ui-muted)] md:col-span-12">
                    Conversion aplicada: {conversionLabel}
                  </div>
                ) : null}

                {referenceComparison ? (
                  <div
                    className={`text-xs md:col-span-12 ${
                      referenceComparison.requestedInStock !== null &&
                      referenceComparison.requestedInStock > availableReference
                        ? "text-amber-700"
                        : "text-[var(--ui-muted)]"
                    }`}
                  >
                    Stock referencial en {referenceSiteName}: {availableReference} {stockUnitCode || "un"}
                    {referenceComparison.requestedInStock !== null
                      ? referenceComparison.requestedInStock > availableReference
                        ? ` · supera por ${referenceComparison.shortage} ${stockUnitCode || "un"}`
                        : ""
                      : ""}
                  </div>
                ) : null}
              </div>

              {rows.length > 1 ? (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost ui-btn--sm"
                    onClick={() => removeRow(row.id)}
                  >
                    Quitar item
                  </button>
                </div>
              ) : null}
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
