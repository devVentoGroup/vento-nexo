"use client";

import { useMemo, useState } from "react";

import { SearchableSingleSelect } from "@/components/inventory/forms/SearchableSingleSelect";
import {
  normalizeUnitCode,
  selectProductUomProfileForContext,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

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
  inputUomProfileId: string;
  areaKind: string;
};

type Props = {
  products: Option[];
  areaOptions: AreaOption[];
  defaultUomProfiles?: ProductUomProfile[];
};

export function RemissionsItems({ products, areaOptions, defaultUomProfiles = [] }: Props) {
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
      if (!profile.is_active || !profile.is_default) continue;
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
    searchText: `${item.name ?? ""} ${item.unit ?? ""} ${item.stock_unit_code ?? ""}`,
  }));

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => {
        const isLast = idx === rows.length - 1;
        const product = products.find((item) => item.id === row.productId);
        const stockUnitCode = normalizeUnitCode(product?.stock_unit_code ?? product?.unit ?? "");
        const defaultProfile = row.productId ? defaultProfileByProduct.get(row.productId) ?? null : null;

        const conversionLabel = defaultProfile
          ? `${defaultProfile.qty_in_input_unit} ${defaultProfile.input_unit_code} = ${defaultProfile.qty_in_stock_unit} ${stockUnitCode || "un"}`
          : "";

        return (
          <div key={row.id} className="space-y-3">
            <div className="ui-card grid gap-3 md:grid-cols-4">
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
                sheetTitle="Selecciona producto"
              />

              <input
                name="item_quantity"
                placeholder="Cantidad"
                className="ui-input"
                value={row.quantity}
                onChange={(event) =>
                  setRows((prev) =>
                    prev.map((current) =>
                      current.id === row.id ? { ...current, quantity: event.target.value } : current
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
                {stockUnitCode ? <option value={stockUnitCode}>{stockUnitCode}</option> : null}
                {defaultProfile &&
                normalizeUnitCode(defaultProfile.input_unit_code) !== normalizeUnitCode(stockUnitCode) ? (
                  <option value={normalizeUnitCode(defaultProfile.input_unit_code)}>
                    {normalizeUnitCode(defaultProfile.input_unit_code)} ({defaultProfile.label})
                  </option>
                ) : null}
              </select>

              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  name="item_area_kind"
                  className="ui-input"
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

              <input type="hidden" name="item_input_uom_profile_id" value={row.inputUomProfileId} />
              <input type="hidden" name="item_quantity_in_input" value={row.quantity} />

              {conversionLabel ? (
                <div className="md:col-span-4 text-xs text-[var(--ui-muted)]">
                  Conversion aplicada: {conversionLabel}
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
