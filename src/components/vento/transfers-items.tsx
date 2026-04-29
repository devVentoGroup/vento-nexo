"use client";

import { useEffect, useMemo, useState } from "react";

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
  available_qty?: number;
};

type Props = {
  products: ProductOption[];
  defaultUomProfiles?: ProductUomProfile[];
  initialRows?: TransferDraftRow[];
  onRowsChange?: (rows: TransferDraftRow[]) => void;
  itemErrorsByProductId?: Record<string, string>;
};

export type TransferDraftRow = {
  id: number;
  productId: string;
  quantity: string;
  inputUnitCode: string;
  inputUomProfileId: string;
  notes: string;
};

function formatQty(value: number) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(value);
}

function profileOptionLabel(profile: ProductUomProfile, stockUnitCode: string) {
  const label = String(profile.label ?? "").trim() || normalizeUnitCode(profile.input_unit_code);
  return `${label} (${formatQty(Number(profile.qty_in_input_unit))} ${normalizeUnitCode(
    profile.input_unit_code
  )} = ${formatQty(Number(profile.qty_in_stock_unit))} ${stockUnitCode || "un"})`;
}

export function TransfersItems({
  products,
  defaultUomProfiles = [],
  initialRows,
  onRowsChange,
  itemErrorsByProductId = {},
}: Props) {
  const [rows, setRows] = useState<TransferDraftRow[]>(initialRows?.length ? initialRows : [
    {
      id: 0,
      productId: "",
      quantity: "",
      inputUnitCode: "",
      inputUomProfileId: "",
      notes: "",
    },
  ]);

  useEffect(() => {
    onRowsChange?.(rows);
  }, [onRowsChange, rows]);

  const profilesByProduct = useMemo(() => {
    const profilesByProduct = new Map<string, ProductUomProfile[]>();
    for (const profile of defaultUomProfiles) {
      if (!profile.is_active) continue;
      const productId = String(profile.product_id).trim();
      const current = profilesByProduct.get(productId) ?? [];
      current.push(profile);
      profilesByProduct.set(productId, current);
    }
    return profilesByProduct;
  }, [defaultUomProfiles]);

  const defaultProfileByProduct = useMemo(() => {
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
  }, [profilesByProduct]);

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
    label: `${product.name ?? product.id} - ${formatQty(product.available_qty ?? 0)} ${
      product.stock_unit_code ?? product.unit ?? "un"
    } disponibles`,
    searchText: `${product.name ?? ""} ${product.unit ?? ""} ${product.stock_unit_code ?? ""}`,
  }));

  return (
    <div className="space-y-4">
      {rows.map((row, idx) => {
        const isLast = idx === rows.length - 1;
        const product = products.find((item) => item.id === row.productId);
        const stockUnitCode = normalizeUnitCode(product?.stock_unit_code ?? product?.unit ?? "");
        const availableQty = Number(product?.available_qty ?? 0);
        const productProfiles = row.productId ? profilesByProduct.get(row.productId) ?? [] : [];
        const selectableProductProfiles = productProfiles.filter((profile) => {
          const context = String(profile.usage_context ?? "general").trim().toLowerCase();
          return context !== "general" || profile.is_default;
        });
        const defaultProfile = row.productId ? defaultProfileByProduct.get(row.productId) ?? null : null;
        const selectedProfile = row.inputUomProfileId
          ? selectableProductProfiles.find((profile) => profile.id === row.inputUomProfileId) ?? null
          : null;
        const selectedUnitValue = selectedProfile
          ? `profile:${selectedProfile.id}`
          : row.inputUnitCode
            ? `unit:${row.inputUnitCode}`
            : "";
        const selectedFactor = selectedProfile
          ? Number(selectedProfile.qty_in_stock_unit) / Number(selectedProfile.qty_in_input_unit)
          : 1;
        const availableInSelectedUnit =
          selectedProfile && Number.isFinite(selectedFactor) && selectedFactor > 0
            ? availableQty / selectedFactor
            : availableQty;
        const selectedUnitLabel = selectedProfile
          ? String(selectedProfile.label ?? selectedProfile.input_unit_code).trim()
          : stockUnitCode || "un";
        const conversionLabel = defaultProfile
          ? `${defaultProfile.qty_in_input_unit} ${defaultProfile.input_unit_code} = ${defaultProfile.qty_in_stock_unit} ${stockUnitCode || "un"}`
          : "";
        const isReady =
          Boolean(row.productId) &&
          Number.isFinite(Number(row.quantity)) &&
          Number(row.quantity) > 0 &&
          Boolean(row.inputUnitCode);
        const rowError = row.productId ? itemErrorsByProductId[row.productId] ?? "" : "";

        return (
          <div key={row.id} className="space-y-3">
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(247,250,252,0.96)_100%)] p-4 shadow-sm sm:p-5">
              {rowError ? (
                <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {rowError}
                </div>
              ) : null}

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
                <div className="flex flex-col gap-1 md:col-span-2 xl:col-span-2">
                  <span className="ui-label">Producto</span>
                  <SearchableSingleSelect
                    name="item_product_id"
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
                    mobilePresentation="sheet"
                    mobileBreakpointPx={1024}
                  />
                </div>

              {row.productId ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="flex min-h-5 items-center justify-between gap-2">
                      <span className="ui-label">Cantidad</span>
                      <span className="truncate text-xs font-normal text-[var(--ui-muted)]">
                        Disponible: {formatQty(availableInSelectedUnit)} {selectedUnitLabel}
                      </span>
                    </span>
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
                      className="ui-input h-12"
                      value={selectedUnitValue}
                      onChange={(e) =>
                        setRows((prev) => {
                          const nextValue = e.target.value;
                          const nextProfileId = nextValue.startsWith("profile:")
                            ? nextValue.slice("profile:".length)
                            : "";
                          const nextProfile = nextProfileId
                            ? selectableProductProfiles.find((profile) => profile.id === nextProfileId) ?? null
                            : null;
                          const nextUnit = nextProfile
                            ? normalizeUnitCode(nextProfile.input_unit_code)
                            : normalizeUnitCode(nextValue.replace(/^unit:/, ""));

                          return prev.map((r) =>
                            r.id === row.id
                              ? {
                                  ...r,
                                  inputUnitCode: nextUnit,
                                  inputUomProfileId: nextProfile?.id ?? "",
                                }
                              : r
                          );
                        })
                      }
                      required
                    >
                      <option value="">Unidad</option>
                      {stockUnitCode ? <option value={`unit:${stockUnitCode}`}>{stockUnitCode}</option> : null}
                      {selectableProductProfiles.map((profile) => (
                        <option key={profile.id} value={`profile:${profile.id}`}>
                          {profileOptionLabel(profile, stockUnitCode)}
                        </option>
                      ))}
                    </select>
                    <input type="hidden" name="item_input_unit_code" value={row.inputUnitCode} />
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

                    {selectedProfile ? (
                      <div className="text-xs text-[var(--ui-muted)]">
                        Conversion aplicada: {profileOptionLabel(selectedProfile, stockUnitCode)}
                      </div>
                    ) : conversionLabel ? (
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
