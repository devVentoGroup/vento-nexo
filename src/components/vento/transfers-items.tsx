"use client";

import { useMemo, useState } from "react";

import { SearchableSingleSelect } from "@/components/inventory/forms/SearchableSingleSelect";
import {
  normalizeUnitCode,
  selectProductUomProfileForContext,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
};

type Props = {
  products: ProductOption[];
  defaultUomProfiles?: ProductUomProfile[];
};

type Row = {
  id: number;
  productId: string;
  quantity: string;
  inputUnitCode: string;
  inputUomProfileId: string;
  notes: string;
};

export function TransfersItems({ products, defaultUomProfiles = [] }: Props) {
  const [rows, setRows] = useState<Row[]>([
    {
      id: 0,
      productId: "",
      quantity: "",
      inputUnitCode: "",
      inputUomProfileId: "",
      notes: "",
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
        notes: "",
      },
    ]);
  };

  const removeRow = (id: number) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  const productOptions = products.map((product) => ({
    value: product.id,
    label: `${product.name ?? product.id}${product.unit ? ` (${product.unit})` : ""}`,
    searchText: `${product.name ?? ""} ${product.unit ?? ""} ${product.stock_unit_code ?? ""}`,
  }));

  return (
    <div className="space-y-4">
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
            <div className="ui-card grid gap-3 md:grid-cols-5">
              <SearchableSingleSelect
                name="item_product_id"
                className="md:col-span-2"
                value={row.productId}
                onValueChange={(next) => {
                  const product = products.find((p) => p.id === next);
                  const stockUnit = normalizeUnitCode(product?.stock_unit_code ?? product?.unit ?? "");
                  const nextProfile = defaultProfileByProduct.get(next) ?? null;
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id
                        ? {
                            ...r,
                            productId: next,
                            inputUnitCode:
                              normalizeUnitCode(nextProfile?.input_unit_code ?? "") ||
                              stockUnit ||
                              r.inputUnitCode,
                            inputUomProfileId: nextProfile?.id ?? "",
                          }
                        : r
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
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) => (r.id === row.id ? { ...r, quantity: e.target.value } : r))
                  )
                }
              />

              <select
                name="item_input_unit_code"
                className="ui-input"
                value={row.inputUnitCode}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id
                        ? {
                            ...r,
                            inputUnitCode: normalizeUnitCode(e.target.value),
                            inputUomProfileId:
                              defaultProfile &&
                              normalizeUnitCode(defaultProfile.input_unit_code) ===
                                normalizeUnitCode(e.target.value)
                                ? defaultProfile.id
                                : "",
                          }
                        : r
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
                <input
                  name="item_notes"
                  placeholder="Notas (opcional)"
                  className="ui-input"
                  value={row.notes}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, notes: e.target.value } : r))
                    )
                  }
                />
                {rows.length > 1 ? (
                  <button type="button" className="ui-btn ui-btn--ghost" onClick={() => removeRow(row.id)}>
                    Quitar
                  </button>
                ) : null}
              </div>

              <input type="hidden" name="item_input_uom_profile_id" value={row.inputUomProfileId} />
              <input type="hidden" name="item_quantity_in_input" value={row.quantity} />

              {conversionLabel ? (
                <div className="md:col-span-5 text-xs text-[var(--ui-muted)]">
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
