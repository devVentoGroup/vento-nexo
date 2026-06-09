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

type MeasurementMode =
  | "fixed_presentation"
  | "variable_weight"
  | "count_with_weight"
  | "bulk_volume";

type Option = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
  product_type?: string | null;
  inventory_kind?: string | null;
  category_id?: string | null;
  measurement_mode?: MeasurementMode | string | null;
  default_tolerance_percent?: number | null;
  requires_actual_dispatch_qty?: boolean | null;
  requires_count_alongside_weight?: boolean | null;
};

type AreaOption = {
  value: string;
  label: string;
};

export type ProductionPackageOption = {
  id: string;
  batchId: string | null;
  siteId: string;
  locationId: string | null;
  productId: string;
  packageIndex: number | null;
  packageLabel: string | null;
  originalQty: number;
  remainingQty: number;
  reservedQty: number;
  unitCode: string | null;
  status: string | null;
};

export type ProductionPackagePlanItem = {
  packageId: string;
  dispatchQty: number;
  unitCode: string;
  remainingQty: number;
  label: string;
  batchId: string | null;
  fractional: boolean;
};

type Row = {
  id: number;
  productId: string;
  quantity: string;
  inputUnitCode: string;
  inputUomProfileId: string;
  areaKind: string;
  productionPackagePlan?: ProductionPackagePlanItem[];
  acceptPackageFraction?: boolean;
};

export type RemissionDraftRow = Row;

const EMPTY_ROW: RemissionDraftRow = {
  id: 0,
  productId: "",
  quantity: "",
  inputUnitCode: "",
  inputUomProfileId: "",
  areaKind: "",
  productionPackagePlan: [],
  acceptPackageFraction: false,
};

type Props = {
  products: Option[];
  categoryNameById?: Record<string, string>;
  areaOptions: AreaOption[];
  siteMode?: "simple" | "zonified";
  defaultAreaKind?: string;
  lockAreaKind?: boolean;
  defaultUomProfiles?: ProductUomProfile[];
  productionPackageRows?: ProductionPackageOption[];
  selectedFromSiteId?: string;
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
  "Sin categoría",
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

function normalizeMeasurementMode(value: unknown): MeasurementMode {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "variable_weight" ||
    raw === "count_with_weight" ||
    raw === "bulk_volume"
  ) {
    return raw;
  }
  return "fixed_presentation";
}

function getProductMeasurementMode(product: Option | null | undefined): MeasurementMode {
  return normalizeMeasurementMode(product?.measurement_mode);
}

function isProducedPackagedProduct(product: Option | null | undefined): boolean {
  const productType = String(product?.product_type ?? "").trim().toLowerCase();
  const inventoryKind = String(product?.inventory_kind ?? "").trim().toLowerCase();
  return productType === "preparacion" || (productType === "venta" && inventoryKind !== "resale");
}

function usesFixedPresentation(product: Option | null | undefined): boolean {
  return !isProducedPackagedProduct(product) && getProductMeasurementMode(product) === "fixed_presentation";
}

function getMeasurementModeLabel(product: Option | null | undefined): string {
  if (isProducedPackagedProduct(product)) return "Empaques FOGO";

  switch (getProductMeasurementMode(product)) {
    case "variable_weight":
      return "Peso real";
    case "count_with_weight":
      return "Conteo + peso real";
    case "bulk_volume":
      return "Cantidad real";
    case "fixed_presentation":
    default:
      return "Presentación fija";
  }
}

function getActualQuantityDisplayLabel(product: Option | null | undefined, stockUnitCode: string): string {
  const measurementMode = getProductMeasurementMode(product);
  const unitCode = stockUnitCode || "un";
  if (isProducedPackagedProduct(product)) return `${unitCode} por empaques FOGO`;
  if (measurementMode === "count_with_weight") return `${unitCode} real + conteo físico`;
  if (measurementMode === "bulk_volume") return `${unitCode} real`;
  if (measurementMode === "variable_weight") return `${unitCode} real`;
  return unitCode;
}

function getQuantityFieldLabel(product: Option | null | undefined): string {
  const measurementMode = getProductMeasurementMode(product);
  if (isProducedPackagedProduct(product)) return "Cantidad solicitada";
  if (measurementMode === "fixed_presentation") return "Cantidad";
  if (measurementMode === "count_with_weight") return "Peso solicitado";
  if (measurementMode === "bulk_volume") return "Cantidad solicitada";
  return "Cantidad real solicitada";
}

function getInputModeHelperText(product: Option | null | undefined): string {
  const measurementMode = getProductMeasurementMode(product);
  if (isProducedPackagedProduct(product)) {
    return "Se arma con empaques reales de lote. Si la cantidad es intermedia, debes aceptar fraccionamiento.";
  }
  if (measurementMode === "fixed_presentation") {
    return "El satélite pide en la presentación mínima. Centro podrá despachar una combinación equivalente.";
  }
  if (measurementMode === "count_with_weight") {
    return "Solicita por peso real. El conteo físico se confirma al preparar, despachar o recibir.";
  }
  if (measurementMode === "bulk_volume") {
    return "Solicita por cantidad real. Centro confirmará lo despachado realmente.";
  }
  return "Solicita por peso real. Centro confirmará la cantidad despachada realmente.";
}

function getOperationalEquivalenceLabel(params: {
  product: Option | null | undefined;
  profile: ProductUomProfile | null;
  presentationLabel: string;
  stockUnitCode: string;
  packagePlan: {
    items: ProductionPackagePlanItem[];
    total: number;
    covered: boolean;
    hasFractional: boolean;
    shortage: number;
  };
}) {
  const stockUnitCode = params.stockUnitCode || "un";

  if (isProducedPackagedProduct(params.product)) {
    if (!params.packagePlan.items.length) {
      return `Solicitud por empaques reales disponibles en ${stockUnitCode}.`;
    }

    const parts = params.packagePlan.items.map((item) => {
      const prefix = item.fractional ? "fracción" : "empaque";
      return `${prefix} ${item.label}: ${formatQuantity(item.dispatchQty)} ${item.unitCode || stockUnitCode}`;
    });

    return `Plan FOGO: ${parts.join(" · ")}`;
  }

  const measurementMode = getProductMeasurementMode(params.product);
  if (measurementMode === "fixed_presentation") {
    return params.profile
      ? `1 ${params.presentationLabel} = ${formatQuantity(params.profile.qty_in_stock_unit)} ${stockUnitCode}`
      : `Solicitud en unidad base: ${stockUnitCode}`;
  }
  if (measurementMode === "count_with_weight") {
    return `Solicitud por peso real en ${stockUnitCode}. El conteo físico queda para despacho/recepción.`;
  }
  if (measurementMode === "bulk_volume") {
    return `Solicitud por cantidad real en ${stockUnitCode}.`;
  }
  return `Solicitud por peso real en ${stockUnitCode}.`;
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

function productionPackageLabel(row: ProductionPackageOption, stockUnitCode: string): string {
  const unitCode = normalizeUnitCode(row.unitCode || stockUnitCode || "un");
  const label = String(row.packageLabel ?? "").trim() || `Empaque ${row.packageIndex ?? ""}`.trim();
  return `${label} · ${formatQuantity(row.remainingQty)} ${unitCode}`;
}

function buildPackagePlan(params: {
  product: Option | null | undefined;
  packages: ProductionPackageOption[];
  requestedQty: number;
  stockUnitCode: string;
}) {
  const requestedQty = roundQuantity(Number(params.requestedQty ?? 0));
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "un");

  if (!isProducedPackagedProduct(params.product) || requestedQty <= 0) {
    return {
      items: [] as ProductionPackagePlanItem[],
      total: 0,
      covered: !isProducedPackagedProduct(params.product),
      hasFractional: false,
      shortage: 0,
    };
  }

  let pendingQty = requestedQty;
  const items: ProductionPackagePlanItem[] = [];
  const sorted = [...params.packages]
    .filter((row) => Number(row.remainingQty ?? 0) > 0)
    .sort((a, b) => {
      const aQty = Number(a.remainingQty ?? 0);
      const bQty = Number(b.remainingQty ?? 0);
      if (bQty !== aQty) return bQty - aQty;
      return productionPackageLabel(a, stockUnitCode).localeCompare(
        productionPackageLabel(b, stockUnitCode),
        "es",
        { numeric: true, sensitivity: "base" }
      );
    });

  for (const row of sorted) {
    if (pendingQty <= 0.001) break;

    const remainingQty = roundQuantity(Number(row.remainingQty ?? 0));
    if (remainingQty <= 0) continue;

    const dispatchQty = roundQuantity(Math.min(remainingQty, pendingQty));
    if (dispatchQty <= 0) continue;

    const fractional = dispatchQty < remainingQty - 0.001;
    const unitCode = normalizeUnitCode(row.unitCode || stockUnitCode || "un");

    items.push({
      packageId: row.id,
      dispatchQty,
      unitCode,
      remainingQty,
      label: productionPackageLabel(row, stockUnitCode),
      batchId: row.batchId ?? null,
      fractional,
    });

    pendingQty = roundQuantity(pendingQty - dispatchQty);
  }

  const total = roundQuantity(items.reduce((sum, item) => sum + Number(item.dispatchQty ?? 0), 0));
  const shortage = roundQuantity(Math.max(requestedQty - total, 0));

  return {
    items,
    total,
    covered: shortage <= 0.001 && Math.abs(total - requestedQty) <= 0.001,
    hasFractional: items.some((item) => item.fractional),
    shortage,
  };
}

export function RemissionsItems({
  products,
  categoryNameById = {},
  areaOptions,
  siteMode = "zonified",
  defaultAreaKind = "",
  lockAreaKind = false,
  defaultUomProfiles = [],
  productionPackageRows = [],
  selectedFromSiteId = "",
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

  const packagesByProductAndSite = useMemo(() => {
    const map = new Map<string, ProductionPackageOption[]>();

    for (const row of productionPackageRows) {
      const productId = String(row.productId ?? "").trim();
      const siteId = String(row.siteId ?? "").trim();
      if (!productId || !siteId) continue;

      const status = String(row.status ?? "available").trim().toLowerCase();
      if (!["available", "opened", "reserved"].includes(status)) continue;

      const remainingQty = Number(row.remainingQty ?? 0);
      if (!Number.isFinite(remainingQty) || remainingQty <= 0) continue;

      const key = `${siteId}|${productId}`;
      const current = map.get(key) ?? [];
      current.push(row);
      map.set(key, current);
    }

    return map;
  }, [productionPackageRows]);

  const getAvailablePackages = (productId: string) => {
    if (!selectedFromSiteId || !productId) return [];
    return packagesByProductAndSite.get(`${selectedFromSiteId}|${productId}`) ?? [];
  };

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
      const productUsesFixedPresentation = usesFixedPresentation(product);
      const productUsesPackages = isProducedPackagedProduct(product);
      const profile =
        productId && productUsesFixedPresentation
          ? defaultProfileByProduct.get(productId) ?? null
          : null;
      const inputUnitCode = productUsesPackages
        ? stockUnitCode || "un"
        : productUsesFixedPresentation
          ? getRemissionInputUnitCode(profile, stockUnitCode)
          : stockUnitCode || "un";
      return {
        id: Number.isFinite(row.id) ? row.id : index,
        productId,
        quantity: String(row.quantity ?? "").trim(),
        inputUnitCode,
        inputUomProfileId: productUsesFixedPresentation ? profile?.id ?? "" : "",
        areaKind: String(row.areaKind ?? "").trim() || defaultAreaKind,
        productionPackagePlan: row.productionPackagePlan ?? [],
        acceptPackageFraction: Boolean(row.acceptPackageFraction),
      };
    });
  }, [defaultAreaKind, defaultProfileByProduct, initialRowsSource, productsById]);

  const [rows, setRows] = useState<Row[]>(normalizedInitialRows);

  useEffect(() => {
    setRows(normalizedInitialRows);
  }, [normalizedInitialRows]);

  const rowsWithDerivedPackagePlans = useMemo<RemissionDraftRow[]>(() => {
    return rows.map((row) => {
      const product = productsById.get(row.productId) ?? null;
      const stockUnitCode = getStockUnitCode(product);
      const quantityValue = Number(row.quantity);
      const packagePlan = buildPackagePlan({
        product,
        packages: getAvailablePackages(row.productId),
        requestedQty: Number.isFinite(quantityValue) ? quantityValue : 0,
        stockUnitCode,
      });

      return {
        ...row,
        productionPackagePlan: packagePlan.items,
      };
    });
  }, [packagesByProductAndSite, productsById, rows, selectedFromSiteId]);

  useEffect(() => {
    onRowsChange?.(rowsWithDerivedPackagePlans);
  }, [rowsWithDerivedPackagePlans, onRowsChange]);

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
      const groupLabel = categoryNameById[String(item.category_id ?? "").trim()] ?? "Sin categoría";
      const stockUnitCode = getStockUnitCode(item);
      const productUsesPackages = isProducedPackagedProduct(item);
      const measurementMode = getProductMeasurementMode(item);
      const productUsesFixedPresentation = usesFixedPresentation(item);
      const profile = productUsesFixedPresentation ? defaultProfileByProduct.get(item.id) ?? null : null;
      const availablePackages = selectedFromSiteId ? getAvailablePackages(item.id) : [];
      const availablePackageQty = availablePackages.reduce(
        (sum, row) => sum + Number(row.remainingQty ?? 0),
        0
      );
      const presentationLabel = productUsesPackages
        ? `${availablePackages.length} empaque(s) · ${formatQuantity(availablePackageQty)} ${stockUnitCode}`
        : productUsesFixedPresentation
          ? getRemissionPresentationLabel(profile, stockUnitCode)
          : getActualQuantityDisplayLabel(item, stockUnitCode);
      const modeLabel = getMeasurementModeLabel(item);
      const hasPresentation = Boolean(profile?.id);
      return {
        value: item.id,
        label: `${item.name ?? item.id} — ${presentationLabel}`,
        searchText: `${item.name ?? ""} ${item.unit ?? ""} ${item.stock_unit_code ?? ""} ${presentationLabel} ${modeLabel} ${groupLabel}`,
        groupLabel:
          productUsesPackages
            ? `${groupLabel} · Empaques FOGO`
            : productUsesFixedPresentation && !hasPresentation
              ? `${groupLabel} · Sin presentación mínima`
              : `${groupLabel} · ${modeLabel}`,
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
  }, [products, categoryNameById, defaultProfileByProduct, packagesByProductAndSite, selectedFromSiteId]);

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => {
        const isLast = idx === rows.length - 1;
        const product = productsById.get(row.productId) ?? null;
        const stockUnitCode = getStockUnitCode(product);
        const measurementMode = getProductMeasurementMode(product);
        const productUsesPackages = isProducedPackagedProduct(product);
        const productUsesFixedPresentation = usesFixedPresentation(product);
        const defaultProfile =
          row.productId && productUsesFixedPresentation
            ? defaultProfileByProduct.get(row.productId) ?? null
            : null;
        const effectiveInputUnitCode = productUsesPackages
          ? stockUnitCode || "un"
          : productUsesFixedPresentation
            ? getRemissionInputUnitCode(defaultProfile, stockUnitCode)
            : stockUnitCode || "un";
        const effectiveInputUomProfileId = productUsesFixedPresentation ? defaultProfile?.id ?? "" : "";
        const remissionPresentationLabel = productUsesPackages
          ? "Empaques reales FOGO"
          : productUsesFixedPresentation
            ? getRemissionPresentationLabel(defaultProfile, stockUnitCode)
            : getActualQuantityDisplayLabel(product, stockUnitCode);
        const quantityValue = Number(row.quantity);
        const availablePackages = getAvailablePackages(row.productId);
        const packagePlan = buildPackagePlan({
          product,
          packages: availablePackages,
          requestedQty: Number.isFinite(quantityValue) ? quantityValue : 0,
          stockUnitCode,
        });
        const packagePlanReady =
          !productUsesPackages ||
          (packagePlan.covered && (!packagePlan.hasFractional || Boolean(row.acceptPackageFraction)));
        const rowReady = Boolean(
          row.productId &&
          Number.isFinite(quantityValue) &&
          quantityValue > 0 &&
          effectiveInputUnitCode &&
          packagePlanReady
        );
        const missingPresentation = Boolean(row.productId && productUsesFixedPresentation && !defaultProfile);
        const conversionLabel = getOperationalEquivalenceLabel({
          product,
          profile: defaultProfile,
          presentationLabel: remissionPresentationLabel,
          stockUnitCode,
          packagePlan,
        });
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
                const requestedInStock = rowReady || (Number.isFinite(quantityValue) && quantityValue > 0)
                  ? productUsesPackages
                    ? roundQuantity(quantityValue)
                    : convertByProductProfile({
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
                    {rowReady ? "Línea lista para solicitud" : "Completa producto, cantidad y empaques"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {row.productId ? (
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-800">
                      {getMeasurementModeLabel(product)}
                    </span>
                  ) : null}
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
                      const nextUsesFixedPresentation = usesFixedPresentation(nextProduct);
                      const nextUsesPackages = isProducedPackagedProduct(nextProduct);
                      const nextProfile = nextUsesFixedPresentation
                        ? defaultProfileByProduct.get(nextProductId) ?? null
                        : null;
                      setRows((prev) =>
                        prev.map((current) =>
                          current.id === row.id
                            ? {
                              ...current,
                              productId: nextProductId,
                              inputUnitCode: nextUsesPackages
                                ? nextStockUnitCode || "un"
                                : nextUsesFixedPresentation
                                  ? getRemissionInputUnitCode(nextProfile, nextStockUnitCode)
                                  : nextStockUnitCode || "un",
                              inputUomProfileId: nextUsesFixedPresentation ? nextProfile?.id ?? "" : "",
                              acceptPackageFraction: false,
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
                  <span className="ui-label">{getQuantityFieldLabel(product)}</span>
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
                          current.id === row.id
                            ? {
                                ...current,
                                quantity: event.target.value,
                                acceptPackageFraction: false,
                              }
                            : current
                        )
                      )
                    }
                  />
                </label>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="ui-label">{productUsesPackages ? "Empaque de solicitud" : productUsesFixedPresentation ? "Presentación de solicitud" : "Unidad real de solicitud"}</span>
                  <div className="ui-input flex h-10 items-center bg-[linear-gradient(180deg,rgba(255,251,235,0.9)_0%,rgba(255,255,255,0.92)_100%)] font-semibold text-[var(--ui-text)]">
                    {row.productId ? remissionPresentationLabel : "Selecciona producto"}
                  </div>
                  <input type="hidden" name="item_input_unit_code" value={effectiveInputUnitCode} />
                  <input type="hidden" name="item_input_uom_profile_id" value={effectiveInputUomProfileId} />
                  <input type="hidden" name="item_production_package_plan" value={productUsesPackages ? JSON.stringify(packagePlan.items) : "[]"} />
                  <span className="text-xs text-[var(--ui-muted)]">
                    {getInputModeHelperText(product)}
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
                    Este insumo es de presentación fija y no tiene presentación mínima para solicitud/remisión. Configúrala en la ficha del producto antes de usarlo en operación real.
                  </div>
                ) : null}

                {productUsesPackages ? (
                  <div className="rounded-2xl border border-[rgba(14,116,144,0.14)] bg-[linear-gradient(180deg,rgba(240,249,255,0.88)_0%,rgba(255,255,255,0.92)_100%)] px-3 py-3 text-xs text-sky-950 md:col-span-12">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-[var(--ui-text)]">
                        Empaques reales disponibles: {availablePackages.length}
                      </div>
                      <div className="font-semibold">
                        Plan: {formatQuantity(packagePlan.total)} / {Number.isFinite(quantityValue) ? formatQuantity(quantityValue) : "0"} {stockUnitCode || "un"}
                      </div>
                    </div>

                    {availablePackages.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {availablePackages.slice(0, 8).map((entry) => (
                          <span key={entry.id} className="ui-chip">
                            {productionPackageLabel(entry, stockUnitCode)}
                          </span>
                        ))}
                        {availablePackages.length > 8 ? (
                          <span className="ui-chip">+{availablePackages.length - 8}</span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-2 font-semibold text-amber-800">
                        No hay empaques disponibles en el origen seleccionado.
                      </div>
                    )}

                    {packagePlan.items.length > 0 ? (
                      <div className="mt-3 space-y-1">
                        {packagePlan.items.map((item) => (
                          <div key={`${row.id}-${item.packageId}`} className="rounded-xl border border-sky-100 bg-white px-3 py-2">
                            {item.fractional ? "Fracción" : "Completo"} · {item.label} → {formatQuantity(item.dispatchQty)} {item.unitCode || stockUnitCode}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {packagePlan.shortage > 0 ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-900">
                        Faltan {formatQuantity(packagePlan.shortage)} {stockUnitCode || "un"} en empaques disponibles del origen.
                      </div>
                    ) : null}

                    {packagePlan.hasFractional ? (
                      <label className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={Boolean(row.acceptPackageFraction)}
                          onChange={(event) =>
                            setRows((prev) =>
                              prev.map((current) =>
                                current.id === row.id
                                  ? { ...current, acceptPackageFraction: event.target.checked }
                                  : current
                              )
                            )
                          }
                        />
                        <span>
                          Acepto fraccionar un empaque. El despacho deberá dejar remanente físico del empaque abierto.
                        </span>
                      </label>
                    ) : null}
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
