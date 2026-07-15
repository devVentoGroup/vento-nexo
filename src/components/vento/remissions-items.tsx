"use client";

import { useEffect, useMemo, useState } from "react";

import { SearchableSingleSelect } from "@/components/inventory/forms/SearchableSingleSelect";
import {
  convertByProductProfile,
  isTemporaryOperationUnitProfile,
  normalizeUnitCode,
  roundQuantity,
  selectRemissionRequestUomProfile,
  type ProductUomProfile,
} from "@/lib/inventory/uom";
import {
  getRequestPolicyDisplayLabel,
  getRequestPolicyHtmlMin,
  getRequestPolicyHtmlStep,
  getRequestPolicyInputUnitCode,
  type ProductRequestPolicyOption,
} from "@/lib/inventory/request-policy";

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
  defaultRequestPolicies?: ProductRequestPolicyOption[];
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
  SALE_CATEGORY_PRIORITY.map((label, index) => [label.toLowerCase(), index]),
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
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    raw === "variable_weight" ||
    raw === "count_with_weight" ||
    raw === "bulk_volume"
  ) {
    return raw;
  }
  return "fixed_presentation";
}

function getProductMeasurementMode(
  product: Option | null | undefined,
): MeasurementMode {
  return normalizeMeasurementMode(product?.measurement_mode);
}

function isProducedPackagedProduct(
  product: Option | null | undefined,
): boolean {
  const productType = String(product?.product_type ?? "")
    .trim()
    .toLowerCase();
  const inventoryKind = String(product?.inventory_kind ?? "")
    .trim()
    .toLowerCase();
  return (
    productType === "preparacion" ||
    (productType === "venta" && inventoryKind !== "resale")
  );
}

function usesProductionPackageDispatch(
  product: Option | null | undefined,
  profile: ProductUomProfile | null | undefined,
  stockUnitCode: string,
): boolean {
  return (
    isProducedPackagedProduct(product) &&
    !isTemporaryOperationUnitProfile(profile, stockUnitCode)
  );
}

function usesFixedPresentation(product: Option | null | undefined): boolean {
  return (
    !isProducedPackagedProduct(product) &&
    getProductMeasurementMode(product) === "fixed_presentation"
  );
}

function getMeasurementModeLabel(product: Option | null | undefined): string {
  if (isProducedPackagedProduct(product)) return "Empaques disponibles";

  switch (getProductMeasurementMode(product)) {
    case "variable_weight":
      return "Peso real";
    case "count_with_weight":
      return "Conteo + peso real";
    case "bulk_volume":
      return "Cantidad real";
    case "fixed_presentation":
    default:
      return "Pedir por presentación";
  }
}

function getActualQuantityDisplayLabel(
  product: Option | null | undefined,
  stockUnitCode: string,
): string {
  const measurementMode = getProductMeasurementMode(product);
  const unitCode = stockUnitCode || "un";
  if (isProducedPackagedProduct(product))
    return `${unitCode} por empaques disponibles`;
  if (measurementMode === "count_with_weight")
    return `${unitCode} real + conteo físico`;
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

function getRequestUnitLabel(unitCode: string | null | undefined) {
  const normalized = normalizeUnitCode(unitCode ?? "");
  return normalized || "un";
}

function getQuantityContextLabel(
  product: Option | null | undefined,
  presentationLabel: string,
  unitCode: string | null | undefined,
) {
  const normalizedPresentation = String(presentationLabel ?? "").trim();
  if (
    product &&
    normalizedPresentation &&
    normalizedPresentation !== "Selecciona producto"
  ) {
    return normalizedPresentation;
  }
  return getRequestUnitLabel(unitCode);
}

function getInputModeHelperText(product: Option | null | undefined): string {
  const measurementMode = getProductMeasurementMode(product);
  if (isProducedPackagedProduct(product)) {
    return "Se arma con empaques reales de lote. Si la cantidad es intermedia, debes aceptar fraccionamiento.";
  }
  if (measurementMode === "fixed_presentation") {
    return "La sede pide en una presentación clara. Centro podrá despachar una combinación equivalente.";
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
  stockUnitCode: string,
) {
  const normalizedStockUnitCode = normalizeUnitCode(stockUnitCode || "un");

  if (isTemporaryOperationUnitProfile(profile, normalizedStockUnitCode)) {
    return normalizedStockUnitCode || "un";
  }

  const label = String(profile?.label ?? "").trim();
  if (label) return label;

  return normalizedStockUnitCode || "Unidad base";
}

function getRemissionInputUnitCode(
  profile: ProductUomProfile | null | undefined,
  stockUnitCode: string,
) {
  return (
    normalizeUnitCode(profile?.input_unit_code ?? "") || stockUnitCode || "un"
  );
}

function productionPackageLabel(
  row: ProductionPackageOption,
  stockUnitCode: string,
): string {
  const unitCode = normalizeUnitCode(row.unitCode || stockUnitCode || "un");
  const label =
    String(row.packageLabel ?? "").trim() ||
    `Empaque ${row.packageIndex ?? ""}`.trim();
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
        { numeric: true, sensitivity: "base" },
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

  const total = roundQuantity(
    items.reduce((sum, item) => sum + Number(item.dispatchQty ?? 0), 0),
  );
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
  defaultRequestPolicies = [],
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
      const preferred = selectRemissionRequestUomProfile({
        profiles,
        productId,
      });
      if (preferred) selected.set(productId, preferred);
    }
    return selected;
  }, [defaultUomProfiles]);
  const defaultRequestPolicyByProduct = useMemo(
    () =>
      new Map(
        defaultRequestPolicies.map((policy) => [policy.productId, policy] as const),
      ),
    [defaultRequestPolicies],
  );

  const packagesByProductAndSite = useMemo(() => {
    const map = new Map<string, ProductionPackageOption[]>();

    for (const row of productionPackageRows) {
      const productId = String(row.productId ?? "").trim();
      const siteId = String(row.siteId ?? "").trim();
      if (!productId || !siteId) continue;

      const status = String(row.status ?? "available")
        .trim()
        .toLowerCase();
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
    return (
      packagesByProductAndSite.get(`${selectedFromSiteId}|${productId}`) ?? []
    );
  };

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const initialRowsSource = useMemo(() => initialRows ?? [], [initialRows]);
  const normalizedInitialRows = useMemo<RemissionDraftRow[]>(() => {
    if (!initialRowsSource.length)
      return [{ ...EMPTY_ROW, areaKind: defaultAreaKind }];

    return initialRowsSource.map((row, index) => {
      const productId = String(row.productId ?? "").trim();
      const product = productsById.get(productId) ?? null;
      const stockUnitCode = getStockUnitCode(product);
      const profile = productId
        ? (defaultProfileByProduct.get(productId) ?? null)
        : null;
      const requestPolicy = productId
        ? (defaultRequestPolicyByProduct.get(productId) ?? null)
        : null;
      const productUsesPackages =
        !requestPolicy &&
        usesProductionPackageDispatch(product, profile, stockUnitCode);
      const productUsesFixedPresentation =
        !requestPolicy &&
        (usesFixedPresentation(product) ||
          isTemporaryOperationUnitProfile(profile, stockUnitCode));
      const inputUnitCode = requestPolicy
        ? getRequestPolicyInputUnitCode(requestPolicy)
        : productUsesPackages
          ? stockUnitCode || "un"
          : productUsesFixedPresentation
            ? getRemissionInputUnitCode(profile, stockUnitCode)
            : stockUnitCode || "un";
      return {
        id: Number.isFinite(row.id) ? row.id : index,
        productId,
        quantity: String(row.quantity ?? "").trim(),
        inputUnitCode,
        inputUomProfileId: requestPolicy
          ? (requestPolicy.physicalUomProfileId ?? "")
          : productUsesFixedPresentation
            ? (profile?.id ?? "")
            : "",
        areaKind: String(row.areaKind ?? "").trim() || defaultAreaKind,
        productionPackagePlan: row.productionPackagePlan ?? [],
        acceptPackageFraction: Boolean(row.acceptPackageFraction),
      };
    });
  }, [
    defaultAreaKind,
    defaultProfileByProduct,
    defaultRequestPolicyByProduct,
    initialRowsSource,
    productsById,
  ]);

  const [rows, setRows] = useState<Row[]>(normalizedInitialRows);
  const [entryMode, setEntryMode] = useState<"table" | "cards">("table");

  useEffect(() => {
    setRows(normalizedInitialRows);
  }, [normalizedInitialRows]);

  const rowsWithDerivedPackagePlans = useMemo<RemissionDraftRow[]>(() => {
    return rows.map((row) => {
      const product = productsById.get(row.productId) ?? null;
      const stockUnitCode = getStockUnitCode(product);
      const quantityValue = Number(row.quantity);
      const requestPolicy = defaultRequestPolicyByProduct.get(row.productId) ?? null;
      const packagePlan = requestPolicy
        ? { items: [] as ProductionPackagePlanItem[] }
        : buildPackagePlan({
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
  }, [defaultRequestPolicyByProduct, packagesByProductAndSite, productsById, rows, selectedFromSiteId]);

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
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((row) => row.id !== rowId),
    );
  };

  const productOptions = useMemo(() => {
    const options = products.map((item) => {
      const groupLabel =
        categoryNameById[String(item.category_id ?? "").trim()] ??
        "Sin categoría";
      return {
        value: item.id,
        label: item.name ?? item.id,
        searchText: `${item.name ?? ""} ${groupLabel}`,
        groupLabel,
      };
    });

    options.sort((a, b) => {
      const groupA = String(a.groupLabel ?? "").trim();
      const groupB = String(b.groupLabel ?? "").trim();
      const rankA =
        saleCategoryPriorityMap.get(groupA.toLowerCase()) ??
        Number.MAX_SAFE_INTEGER;
      const rankB =
        saleCategoryPriorityMap.get(groupB.toLowerCase()) ??
        Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;

      const groupCompare = groupA.localeCompare(groupB, "es", {
        sensitivity: "base",
      });
      if (groupCompare !== 0) return groupCompare;

      return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
    });

    return options;
  }, [products, categoryNameById]);

  const tableProductsByCategory = useMemo(() => {
    const groups = new Map<string, Option[]>();
    for (const product of products) {
      const groupLabel =
        categoryNameById[String(product.category_id ?? "").trim()] ??
        "Sin categoría";
      const current = groups.get(groupLabel) ?? [];
      current.push(product);
      groups.set(groupLabel, current);
    }

    const sortedGroups = Array.from(groups.entries()).sort(
      ([groupA], [groupB]) => {
        const rankA =
          saleCategoryPriorityMap.get(groupA.toLowerCase()) ??
          Number.MAX_SAFE_INTEGER;
        const rankB =
          saleCategoryPriorityMap.get(groupB.toLowerCase()) ??
          Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) return rankA - rankB;
        return groupA.localeCompare(groupB, "es", { sensitivity: "base" });
      },
    );

    return sortedGroups.map(([groupLabel, groupProducts]) => ({
      groupLabel,
      products: groupProducts.sort((a, b) =>
        String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), "es", {
          sensitivity: "base",
        }),
      ),
    }));
  }, [categoryNameById, products]);

  const rowByProductId = useMemo(() => {
    const map = new Map<string, Row>();
    for (const row of rows) {
      if (row.productId) map.set(row.productId, row);
    }
    return map;
  }, [rows]);

  const setTableQuantity = (product: Option, nextQuantity: string) => {
    const productId = String(product.id ?? "").trim();
    if (!productId) return;

    const normalizedQuantity = String(nextQuantity ?? "").trim();
    const hasQuantity =
      normalizedQuantity !== "" &&
      Number.isFinite(Number(normalizedQuantity)) &&
      Number(normalizedQuantity) > 0;

    setRows((prev) => {
      const existing = prev.find((row) => row.productId === productId);
      if (!hasQuantity) {
        const next = prev.filter((row) => row.productId !== productId);
        return next.length
          ? next
          : [{ ...EMPTY_ROW, areaKind: defaultAreaKind }];
      }

      const stockUnitCode = getStockUnitCode(product);
      const profile = defaultProfileByProduct.get(productId) ?? null;
      const requestPolicy = defaultRequestPolicyByProduct.get(productId) ?? null;
      if (!requestPolicy) return prev;
      const productUsesPackages = false;
      const productUsesFixedPresentation = false;
      const nextRow: Row = {
        ...(existing ?? {
          ...EMPTY_ROW,
          id: prev.length ? Math.max(...prev.map((row) => row.id)) + 1 : 0,
        }),
        productId,
        quantity: normalizedQuantity,
        inputUnitCode: getRequestPolicyInputUnitCode(requestPolicy),
        inputUomProfileId: requestPolicy.physicalUomProfileId ?? "",
        areaKind: existing?.areaKind || defaultAreaKind,
        acceptPackageFraction: false,
      };

      if (existing) {
        return prev.map((row) => (row.id === existing.id ? nextRow : row));
      }
      return [...prev.filter((row) => row.productId || row.quantity), nextRow];
    });
  };

  const selectedTableRows = rowsWithDerivedPackagePlans.filter((row) => {
    const quantity = Number(row.quantity);
    return row.productId && Number.isFinite(quantity) && quantity > 0;
  });

  const hiddenInputsForRow = (row: RemissionDraftRow) => {
    const product = productsById.get(row.productId) ?? null;
    const stockUnitCode = getStockUnitCode(product);
    const defaultProfile = row.productId
      ? (defaultProfileByProduct.get(row.productId) ?? null)
      : null;
    const requestPolicy = row.productId
      ? (defaultRequestPolicyByProduct.get(row.productId) ?? null)
      : null;
    const productUsesPackages =
      !requestPolicy &&
      usesProductionPackageDispatch(product, defaultProfile, stockUnitCode);
    const productUsesFixedPresentation =
      !requestPolicy &&
      (usesFixedPresentation(product) ||
        isTemporaryOperationUnitProfile(defaultProfile, stockUnitCode));
    const effectiveInputUnitCode = requestPolicy
      ? getRequestPolicyInputUnitCode(requestPolicy)
      : productUsesPackages
        ? stockUnitCode || "un"
        : productUsesFixedPresentation
          ? getRemissionInputUnitCode(defaultProfile, stockUnitCode)
          : stockUnitCode || "un";
    const effectiveInputUomProfileId = requestPolicy
      ? (requestPolicy.physicalUomProfileId ?? "")
      : productUsesFixedPresentation
        ? (defaultProfile?.id ?? "")
        : "";

    return (
      <div key={`hidden-${row.id}`}>
        <input type="hidden" name="item_product_id" value={row.productId} />
        <input type="hidden" name="item_quantity" value={row.quantity} />
        <input
          type="hidden"
          name="item_request_policy_id"
          value={requestPolicy?.id ?? ""}
        />
        <input
          type="hidden"
          name="item_requested_policy_qty"
          value={row.quantity}
        />
        <input
          type="hidden"
          name="item_input_unit_code"
          value={effectiveInputUnitCode}
        />
        <input
          type="hidden"
          name="item_input_uom_profile_id"
          value={effectiveInputUomProfileId}
        />
        <input
          type="hidden"
          name="item_production_package_plan"
          value={JSON.stringify(row.productionPackagePlan ?? [])}
        />
        <input
          type="hidden"
          name="item_area_kind"
          value={row.areaKind || defaultAreaKind}
        />
        <input
          type="hidden"
          name="item_quantity_in_input"
          value={row.quantity}
        />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgba(200,210,220,0.95)] bg-white p-3 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-[var(--ui-text)]">
            Productos
          </div>
        </div>
        <div className="flex rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-1">
          <button
            type="button"
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${entryMode === "table"
                ? "bg-white text-[var(--ui-text)] shadow-sm"
                : "text-[var(--ui-muted)]"
              }`}
            onClick={() => setEntryMode("table")}
          >
            Tabla
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${entryMode === "cards"
                ? "bg-white text-[var(--ui-text)] shadow-sm"
                : "text-[var(--ui-muted)]"
              }`}
            onClick={() => setEntryMode("cards")}
          >
            Producto a producto
          </button>
        </div>
      </div>

      {entryMode === "table" ? (
        <div className="overflow-hidden rounded-2xl border border-[rgba(200,210,220,0.95)] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
          {selectedTableRows.map(hiddenInputsForRow)}
          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="grid grid-cols-[minmax(260px,1fr)_96px_132px] border-b border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--ui-muted)]">
                <div>Producto</div>
                <div className="text-center">Unidad</div>
                <div className="text-right">Requisición</div>
              </div>
              <div className="max-h-[68vh] overflow-auto">
                {tableProductsByCategory.map((group) => (
                  <div key={group.groupLabel}>
                    <div className="sticky top-0 z-10 border-y border-[rgba(212,164,58,0.28)] bg-[rgb(255,239,184)] px-3 py-1.5 text-center text-xs font-bold uppercase text-slate-900">
                      {group.groupLabel}
                    </div>
                    {group.products.map((product) => {
                      const row = rowByProductId.get(product.id);
                      const productProfile =
                        defaultProfileByProduct.get(product.id) ?? null;
                      const requestPolicy =
                        defaultRequestPolicyByProduct.get(product.id) ?? null;
                      const stockUnitCode = getStockUnitCode(product);
                      const productUsesPackages =
                        !requestPolicy &&
                        usesProductionPackageDispatch(
                          product,
                          productProfile,
                          stockUnitCode,
                        );
                      const unitLabel = requestPolicy
                        ? getRequestPolicyDisplayLabel(requestPolicy)
                        : productUsesPackages
                          ? stockUnitCode
                          : getRemissionPresentationLabel(
                              productProfile,
                              stockUnitCode,
                            );
const hasQuantity = Boolean(row?.quantity);

                      return (
                        <div
                          key={product.id}
                          className={`grid grid-cols-[minmax(260px,1fr)_96px_132px] items-center border-b border-[rgba(200,210,220,0.65)] px-3 py-1.5 text-sm ${hasQuantity ? "bg-yellow-50" : "bg-white"
                            }`}
                        >
                          <div className="min-w-0 truncate font-medium text-[var(--ui-text)]">
                            {product.name ?? product.id}
                          </div>
                          <div className="text-center text-xs font-semibold uppercase text-[var(--ui-muted)]">
                            {unitLabel}
                          </div>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={getRequestPolicyHtmlMin(requestPolicy)}
                            step={getRequestPolicyHtmlStep(requestPolicy)}
                            disabled={!requestPolicy}
value={row?.quantity ?? ""}
                            onChange={(event) =>
                              setTableQuantity(product, event.target.value)
                            }
                            className="h-9 rounded-lg border border-[var(--ui-border)] bg-white px-2 text-right text-sm font-semibold text-[var(--ui-text)] shadow-inner outline-none focus:border-[var(--ui-brand-500)]"
                            placeholder="0"
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-3">
            <div className="text-sm font-semibold text-[var(--ui-text)]">
              {selectedTableRows.length} producto(s) con cantidad
            </div>
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--sm"
              onClick={() =>
                setRows([{ ...EMPTY_ROW, areaKind: defaultAreaKind }])
              }
            >
              Limpiar tabla
            </button>
          </div>
        </div>
      ) : null}

      {entryMode === "cards" ? (
        <>
          {rows.map((row, idx) => {
            const isLast = idx === rows.length - 1;
            const product = productsById.get(row.productId) ?? null;
            const stockUnitCode = getStockUnitCode(product);
            const measurementMode = getProductMeasurementMode(product);
            const defaultProfile = row.productId
              ? (defaultProfileByProduct.get(row.productId) ?? null)
              : null;
            const requestPolicy = row.productId
              ? (defaultRequestPolicyByProduct.get(row.productId) ?? null)
              : null;
            const productUsesPackages =
              !requestPolicy &&
              usesProductionPackageDispatch(product, defaultProfile, stockUnitCode);
            const productUsesFixedPresentation =
              !requestPolicy &&
              (usesFixedPresentation(product) ||
                isTemporaryOperationUnitProfile(defaultProfile, stockUnitCode));
            const effectiveInputUnitCode = requestPolicy
              ? getRequestPolicyInputUnitCode(requestPolicy)
              : productUsesPackages
                ? stockUnitCode || "un"
                : productUsesFixedPresentation
                  ? getRemissionInputUnitCode(defaultProfile, stockUnitCode)
                  : stockUnitCode || "un";
            const effectiveInputUomProfileId = requestPolicy
              ? (requestPolicy.physicalUomProfileId ?? "")
              : productUsesFixedPresentation
                ? (defaultProfile?.id ?? "")
                : "";
            const remissionPresentationLabel = requestPolicy
              ? getRequestPolicyDisplayLabel(requestPolicy)
              : productUsesPackages
                ? "Empaques reales FOGO"
                : productUsesFixedPresentation
                  ? getRemissionPresentationLabel(defaultProfile, stockUnitCode)
                  : getActualQuantityDisplayLabel(product, stockUnitCode);
            const quantityValue = Number(row.quantity);
            const availablePackages = getAvailablePackages(row.productId);
            const packagePlan = requestPolicy
              ? {
                  items: [] as ProductionPackagePlanItem[],
                  total: 0,
                  covered: true,
                  hasFractional: false,
                  shortage: 0,
                }
              : buildPackagePlan({
                  product,
                  packages: availablePackages,
                  requestedQty: Number.isFinite(quantityValue) ? quantityValue : 0,
                  stockUnitCode,
                });
            const rowReady = Boolean(
              row.productId &&
              requestPolicy?.id &&
              Number.isFinite(quantityValue) &&
              quantityValue > 0 &&
              effectiveInputUnitCode,
            );
            const missingPresentation = Boolean(
              row.productId && productUsesFixedPresentation && !defaultProfile,
            );
            const referenceMeta = row.productId
              ? (referenceStockByProduct[row.productId] ?? null)
              : null;
            const selectedAreaLabel =
              areaOptions.find(
                (option) => option.value === (row.areaKind || defaultAreaKind),
              )?.label ??
              (row.areaKind || defaultAreaKind);
            const normalizedSelectedAreaLabel = String(
              selectedAreaLabel ?? "",
            ).trim();
            const areaDestinationDisplay =
              lockAreaKind &&
                normalizedSelectedAreaLabel &&
                normalizedSelectedAreaLabel.toLowerCase() !== "todos"
                ? normalizedSelectedAreaLabel
                : "Recepción global";
            const availableReference = Number(referenceMeta?.currentQty ?? 0);
            const referenceComparison =
              row.productId && referenceSiteName
                ? (() => {
                  try {
                    const requestedInStock =
                      rowReady ||
                        (Number.isFinite(quantityValue) && quantityValue > 0)
                        ? requestPolicy
                          ? roundQuantity(
                              quantityValue * requestPolicy.baseQtyPerRequestUnit,
                            )
                          : productUsesPackages
                            ? roundQuantity(quantityValue)
                            : convertByProductProfile({
                            quantityInInput: Number.isFinite(quantityValue)
                              ? quantityValue
                              : 0,
                            inputUnitCode: effectiveInputUnitCode,
                            stockUnitCode,
                            profile: defaultProfile,
                          }).quantityInStock
                        : null;
                    const shortage =
                      requestedInStock !== null
                        ? roundQuantity(
                          Math.max(
                            requestedInStock - availableReference,
                            0,
                          ),
                        )
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
                    </div>
                  </div>

                  <div className="grid gap-3 p-4 md:grid-cols-12 md:items-start">
                    <label className="flex min-w-0 flex-col gap-1 md:col-span-8">
                      <span className="ui-label">Producto</span>
                      <SearchableSingleSelect
                        name="item_product_id"
                        value={row.productId}
                        onValueChange={(nextProductId) => {
                          const nextProduct =
                            productsById.get(nextProductId) ?? null;
                          const nextStockUnitCode =
                            getStockUnitCode(nextProduct);
                          const nextProfile =
                            defaultProfileByProduct.get(nextProductId) ?? null;
                          const nextRequestPolicy =
                            defaultRequestPolicyByProduct.get(nextProductId) ?? null;
                          const nextUsesPackages =
                            !nextRequestPolicy &&
                            usesProductionPackageDispatch(
                              nextProduct,
                              nextProfile,
                              nextStockUnitCode,
                            );
                          const nextUsesFixedPresentation =
                            !nextRequestPolicy &&
                            (usesFixedPresentation(nextProduct) ||
                              isTemporaryOperationUnitProfile(
                                nextProfile,
                                nextStockUnitCode,
                              ));
setRows((prev) =>
                            prev.map((current) =>
                              current.id === row.id
                                ? {
                                  ...current,
                                  productId: nextProductId,
                                  inputUnitCode: nextRequestPolicy
                                    ? getRequestPolicyInputUnitCode(nextRequestPolicy)
                                    : nextUsesPackages
                                      ? nextStockUnitCode || "un"
                                      : nextUsesFixedPresentation
                                        ? getRemissionInputUnitCode(
                                            nextProfile,
                                            nextStockUnitCode,
                                          )
                                        : nextStockUnitCode || "un",
                                  inputUomProfileId: nextRequestPolicy
                                    ? (nextRequestPolicy.physicalUomProfileId ?? "")
                                    : nextUsesFixedPresentation
                                      ? (nextProfile?.id ?? "")
                                      : "",
acceptPackageFraction: false,
                                }
                                : current,
                            ),
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

                    <label className="flex flex-col gap-1 md:col-span-4">
                      <span className="ui-label">
                        Cantidad
                        {row.productId ? (
                          <span className="ml-1 font-semibold text-[var(--ui-muted)]">
                            (
                            {getQuantityContextLabel(
                              product,
                              remissionPresentationLabel,
                              effectiveInputUnitCode,
                            )}
                            )
                          </span>
                        ) : null}
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={getRequestPolicyHtmlMin(requestPolicy)}
                        step={getRequestPolicyHtmlStep(requestPolicy)}
                        disabled={Boolean(row.productId && !requestPolicy)}
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
                                : current,
                            ),
                          )
                        }
                      />
                    </label>

                    <input
                      type="hidden"
                      name="item_request_policy_id"
                      value={requestPolicy?.id ?? ""}
                    />
                    <input
                      type="hidden"
                      name="item_requested_policy_qty"
                      value={row.quantity}
                    />
                    <input
                      type="hidden"
                      name="item_input_unit_code"
                      value={effectiveInputUnitCode}
                    />
                    <input
                      type="hidden"
                      name="item_input_uom_profile_id"
                      value={effectiveInputUomProfileId}
                    />
                    <input
                      type="hidden"
                      name="item_production_package_plan"
                      value="[]"
                    />
                    <input
                      type="hidden"
                      name="item_area_kind"
                      value={row.areaKind || defaultAreaKind}
                    />

                    <input
                      type="hidden"
                      name="item_quantity_in_input"
                      value={row.quantity}
                    />
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
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost w-fit shadow-sm"
                    onClick={addRow}
                  >
                    + Agregar otro item
                  </button>
                ) : null}
              </div>
            );
          })}
        </>
      ) : null}
    </div>
  );
}
