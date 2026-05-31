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

const EMPTY_ROW: RemissionDraftRow = {
  id: 0,
  productId: "",
  quantity: "",
  inputUnitCode: "",
  inputUomProfileId: "",
  areaKind: "",
};

type Props = {
  products: Option[];
  categoryNameById?: Record<string, string>;
  areaOptions: AreaOption[];
  siteMode?: "simple" | "zonified";
  defaultAreaKind?: string;
  lockAreaKind?: boolean;
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
  initialRows?: RemissionDraftRow[];
};

const SALE_CATEGORY_PRIORITY = [
  "Panaderia y bolleria",
  "Tortas y postres",
  "Helados y frios dulces",
  "Desayunos y brunch",
  "Entradas y para compartir",
  "Ensaladas y bowls",
  "Sanduches, wraps y tostadas",
  "Platos fuertes",
  "Cafe y espresso",
  "Otras bebidas calientes",
  "Bebidas frias",
  "Cocteles y alcohol",
  "Productos empacados y retail",
  "Otros de venta",
  "Sin categoria",
];

const saleCategoryPriorityMap = new Map(
  SALE_CATEGORY_PRIORITY.map((label, index) => [label.toLowerCase(), index])
);

function formatQuantity(value: number | null | undefined) {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return "0";
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 3,
  }).format(numericValue);
}

function getStockUnitCode(product: Option | null | undefined) {
  return normalizeUnitCode(product?.stock_unit_code ?? product?.unit ?? "un");
}

function getRemissionPresentationLabel(
  profile: ProductUomProfile | null | undefined,
  stockUnitCode: string
) {
  const label = String(profile?.label ?? "").trim();
  if (label) return label;
  return stockUnitCode || "Sin presentación definida";
}

function getRemissionInputUnitCode(
  profile: ProductUomProfile | null | undefined,
  stockUnitCode: string
) {
  return normalizeUnitCode(profile?.input_unit_code ?? "") || stockUnitCode || "un";
}

export function RemissionsItems({
  products,
  categoryNameById = {},
  areaOptions,
  siteMode = "zonified",
  defaultAreaKind = "",
  lockAreaKind = false,
  defaultUomProfiles = [],
  onRowsChange,
  referenceStockByProduct = {},
  referenceSiteName = "",
  initialRows,
}: Props) {
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

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const initialRowsSource = useMemo(() => initialRows ?? [], [initialRows]);
  const normalizedInitialRows = useMemo<RemissionDraftRow[]>(() => {
    if (!initialRowsSource.length) return [{ ...EMPTY_ROW, areaKind: defaultAreaKind }];

    return initialRowsSource.map((row, index) => {
      const productId = String(row.productId ?? "").trim();
      const product = productsById.get(productId) ?? null;
      const stockUnitCode = getStockUnitCode(product);
      const profile = productId ? defaultProfileByProduct.get(productId) ?? null : null;
      const inputUnitCode = getRemissionInputUnitCode(profile, stockUnitCode);
      return {
        id: Number.isFinite(row.id) ? row.id : index,
        productId,
        quantity: String(row.quantity ?? "").trim(),
        inputUnitCode,
        inputUomProfileId: profile?.id ?? "",
        areaKind: String(row.areaKind ?? "").trim() || defaultAreaKind,
      };
    });
  }, [defaultAreaKind, defaultProfileByProduct, initialRowsSource, productsById]);

  const [rows, setRows] = useState<Row[]>(normalizedInitialRows);

  useEffect(() => {
    setRows(normalizedInitialRows);
  }, [normalizedInitialRows]);

  useEffect(() => {
    onRowsChange?.(rows);
  }, [rows, onRowsChange]);

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        ...EMPTY_ROW,
        areaKind: defaultAreaKind,
        id: prev.length ? Math.max(...prev.map((row) => row.id)) + 1 : 0,
      },
    ]);
  };

  const removeRow = (rowId: number) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== rowId)));
  };

  const productOptions = useMemo(() => {
    const options = products.map((item) => {
      const groupLabel = categoryNameById[String(item.category_id ?? "").trim()] ?? "Sin categoria";
      const stockUnitCode = getStockUnitCode(item);
      const profile = defaultProfileByProduct.get(item.id) ?? null;
      const presentationLabel = getRemissionPresentationLabel(profile, stockUnitCode);
      const hasPresentation = Boolean(profile?.id);
      return {
        value: item.id,
        label: `${item.name ?? item.id} — ${presentationLabel}`,
        searchText: `${item.name ?? ""} ${item.unit ?? ""} ${item.stock_unit_code ?? ""} ${presentationLabel} ${groupLabel}`,
        groupLabel: hasPresentation ? groupLabel : `${groupLabel} · Sin presentación mínima`,
      };
    });

    options.sort((a, b) => {
      const groupA = String(a.groupLabel ?? "").trim();
      const groupB = String(b.groupLabel ?? "").trim();
      const rankA = saleCategoryPriorityMap.get(groupA.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const rankB = saleCategoryPriorityMap.get(groupB.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;

      const groupCompare = groupA.localeCompare(groupB, "es", { sensitivity: "base" });
      if (groupCompare !== 0) return groupCompare;

      return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
    });

    return options;
  }, [products, categoryNameById, defaultProfileByProduct]);

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => {
        const isLast = idx === rows.length - 1;
        const product = productsById.get(row.productId) ?? null;
        const stockUnitCode = getStockUnitCode(product);
        const defaultProfile = row.productId ? defaultProfileByProduct.get(row.productId) ?? null : null;
        const effectiveInputUnitCode = getRemissionInputUnitCode(defaultProfile, stockUnitCode);
        const effectiveInputUomProfileId = defaultProfile?.id ?? "";
        const remissionPresentationLabel = getRemissionPresentationLabel(defaultProfile, stockUnitCode);
        const quantityValue = Number(row.quantity);
        const rowReady = Boolean(
          row.productId && Number.isFinite(quantityValue) && quantityValue > 0 && effectiveInputUnitCode
        );
        const missingPresentation = Boolean(row.productId && !defaultProfile);
        const conversionLabel = defaultProfile
          ? `1 ${remissionPresentationLabel} = ${formatQuantity(defaultProfile.qty_in_stock_unit)} ${stockUnitCode || "un"}`
          : stockUnitCode
            ? `Solicitud en unidad base: ${stockUnitCode}`
            : "";
        const referenceMeta = row.productId ? referenceStockByProduct[row.productId] ?? null : null;
        const selectedAreaLabel =
          areaOptions.find((option) => option.value === (row.areaKind || defaultAreaKind))?.label ??
          (row.areaKind || defaultAreaKind);
        const normalizedSelectedAreaLabel = String(selectedAreaLabel ?? "").trim();
        const areaDestinationDisplay =
          lockAreaKind && normalizedSelectedAreaLabel && normalizedSelectedAreaLabel.toLowerCase() !== "todos"
            ? normalizedSelectedAreaLabel
            : "Recepción global";
        const availableReference = Number(referenceMeta?.currentQty ?? 0);
        const referenceComparison =
          row.productId && referenceSiteName
            ? (() => {
              try {
                const requestedInStock = rowReady
                  ? convertByProductProfile({
                    quantityInInput: Number.isFinite(quantityValue) ? quantityValue : 0,
                    inputUnitCode: effectiveInputUnitCode,
                    stockUnitCode,
                    profile: defaultProfile,
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
            <div className="overflow-hidden rounded-[24px] border border-[rgba(200,210,220,0.95)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(243,247,251,0.98)_100%)] shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(200,210,220,0.75)] bg-[linear-gradient(90deg,rgba(212,164,58,0.12)_0%,rgba(14,116,144,0.08)_100%)] px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--ui-text)]">
                    {product?.name ?? `Item ${idx + 1}`}
                  </div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                    {rowReady ? "Línea lista para solicitud" : "Completa producto y cantidad"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                    rowReady
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border border-slate-200 bg-white text-slate-600"
                  }`}>
                    {rowReady ? "Completo" : "Pendiente"}
                  </span>
                  {referenceComparison?.shortage ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800">
                      Falta referencia
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 p-4 md:grid-cols-12 md:items-start">
                <label className="flex min-w-0 flex-col gap-1 md:col-span-5">
                  <span className="ui-label">Producto</span>
                  <SearchableSingleSelect
                    name="item_product_id"
                    value={row.productId}
                    onValueChange={(nextProductId) => {
                      const nextProduct = productsById.get(nextProductId) ?? null;
                      const nextStockUnitCode = getStockUnitCode(nextProduct);
                      const nextProfile = defaultProfileByProduct.get(nextProductId) ?? null;
                      setRows((prev) =>
                        prev.map((current) =>
                          current.id === row.id
                            ? {
                              ...current,
                              productId: nextProductId,
                              inputUnitCode: getRemissionInputUnitCode(nextProfile, nextStockUnitCode),
                              inputUomProfileId: nextProfile?.id ?? "",
                            }
                            : current
                        )
                      );
                    }}
                    options={productOptions}
                    allowEmptySelection={false}
                    placeholder="Selecciona producto"
                    searchPlaceholder="Buscar producto..."
                    sheetTitle="Productos"
                    mobilePresentation="sheet"
                    mobileBreakpointPx={1024}
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
                  <span className="ui-label">Presentación de solicitud</span>
                  <div className="ui-input flex h-10 items-center bg-[linear-gradient(180deg,rgba(255,251,235,0.9)_0%,rgba(255,255,255,0.92)_100%)] font-semibold text-[var(--ui-text)]">
                    {row.productId ? remissionPresentationLabel : "Selecciona producto"}
                  </div>
                  <input type="hidden" name="item_input_unit_code" value={effectiveInputUnitCode} />
                  <input type="hidden" name="item_input_uom_profile_id" value={effectiveInputUomProfileId} />
                  <span className="text-xs text-[var(--ui-muted)]">
                    El satélite pide en la presentación mínima. Centro podrá despachar una combinación equivalente.
                  </span>
                </label>

                <label className="flex flex-col gap-1 md:col-span-3">
                  <span className="ui-label">Área destino en sede</span>
                  {siteMode === "simple" || lockAreaKind ? (
                    <>
                      <div className="ui-input flex h-10 items-center bg-[linear-gradient(180deg,rgba(255,251,235,0.9)_0%,rgba(255,255,255,0.92)_100%)] font-semibold text-[var(--ui-text)]">
                        {areaDestinationDisplay}
                      </div>
                      <input type="hidden" name="item_area_kind" value={row.areaKind || defaultAreaKind} />
                    </>
                  ) : (
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
                      <option value="">Área destino (opcional)</option>
                      {areaOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.value === "general" ? "Recepción global" : option.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="text-xs text-[var(--ui-muted)]">
                    Indica dónde se recibe en la sede solicitante. El área/LOC de preparación se define en la ficha del producto y en despacho.
                  </span>
                </label>

                <input type="hidden" name="item_quantity_in_input" value={row.quantity} />

                {missingPresentation ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 md:col-span-12">
                    Este producto no tiene presentación mínima para solicitud/remisión. Configúrala en la ficha del producto antes de usarlo en operación real.
                  </div>
                ) : null}

                {conversionLabel ? (
                  <div className="rounded-2xl border border-[rgba(14,116,144,0.14)] bg-[linear-gradient(180deg,rgba(240,249,255,0.88)_0%,rgba(255,255,255,0.92)_100%)] px-3 py-2 text-xs text-sky-900 md:col-span-12">
                    Equivalencia operativa: {conversionLabel}
                  </div>
                ) : null}

                {referenceComparison ? (
                  <div
                    className={`rounded-2xl border px-3 py-2 text-xs md:col-span-12 ${
                      referenceComparison.requestedInStock !== null &&
                      referenceComparison.requestedInStock > availableReference
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800"
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
                <div className="flex justify-end border-t border-[rgba(200,210,220,0.75)] bg-white/70 px-4 py-3">
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
              <button type="button" className="ui-btn ui-btn--ghost w-fit shadow-sm" onClick={addRow}>
                + Agregar otro item
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
