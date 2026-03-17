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
        const isReady =
          Boolean(row.productId) &&
          Number.isFinite(Number(row.quantity)) &&
          Number(row.quantity) > 0 &&
          Boolean(row.inputUnitCode);

        return (
          <div key={row.id} className="space-y-3">
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(247,250,252,0.96)_100%)] p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold text-[var(--ui-text)]">Item {idx + 1}</div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isReady ? "border border-emerald-200 bg-emerald-50 text-emerald-900" : "border border-slate-200 bg-slate-100 text-slate-700"}`}>
                    {isReady ? "Listo" : "Pendiente"}
                  </span>
                </div>
                {rows.length > 1 ? (
                  <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => removeRow(row.id)}>
                    Quitar
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SearchableSingleSelect
                name="item_product_id"
                className="md:col-span-2 xl:col-span-2"
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

              {row.productId ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Cantidad</span>
                    <input
                      name="item_quantity"
                      placeholder="Cantidad"
                      className="ui-input h-12"
                      value={row.quantity}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => (r.id === row.id ? { ...r, quantity: e.target.value } : r))
                        )
                      }
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Unidad</span>
                    <select
                      name="item_input_unit_code"
                      className="ui-input h-12"
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
                  </label>
                </>
              ) : (
                <>
                  <input type="hidden" name="item_quantity" value={row.quantity} />
                  <input type="hidden" name="item_input_unit_code" value={row.inputUnitCode} />
                  <input type="hidden" name="item_notes" value={row.notes} />
                </>
              )}
              </div>

              {row.productId ? (
                <details className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                    Nota y detalle opcional
                  </summary>
                  <div className="mt-4 space-y-3">
                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Notas</span>
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
                    </label>

                    {conversionLabel ? (
                      <div className="text-xs text-[var(--ui-muted)]">
                        Conversion aplicada: {conversionLabel}
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : (
                <input type="hidden" name="item_optional_details_collapsed" value="1" />
              )}

              <input type="hidden" name="item_input_uom_profile_id" value={row.inputUomProfileId} />
              <input type="hidden" name="item_quantity_in_input" value={row.quantity} />

              {isLast ? (
                <button type="button" className="ui-btn ui-btn--ghost mt-3 w-fit" onClick={addRow}>
                  + Agregar otro item
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
