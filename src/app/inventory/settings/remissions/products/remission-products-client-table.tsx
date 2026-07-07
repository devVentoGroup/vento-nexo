"use client";

import { useMemo, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/vento/standard/table";

type BulkProfile =
  | "input_from_origin"
  | "sellable_from_origin"
  | "preparation_from_origin"
  | "available_not_remission"
  | "disable_remission";

type ProductDiagnostics = {
  status: "ready" | "configured" | "blocked" | "warning";
  label: string;
  issues: string[];
  canApply: boolean;
};

type OriginRouteState = {
  enabled?: boolean;
  areaKind?: string;
  inputLocationId?: string;
  outputLocationId?: string;
};

export type RemissionProductsClientRow = {
  product: {
    id: string;
    name: string;
    sku: string;
    productType: string;
    productTypeLabel: string;
    measurementMode: string;
    measurementLabel: string;
    stockUnitLabel: string;
    searchText: string;
  };
  setting: {
    remissionCategoryId: string;
    remissionEnabled: boolean;
    areaKinds: string[];
    isRemissionEnabledForSelectedArea: boolean;
    salesEnabled?: boolean;
    originRoute?: OriginRouteState | null;
  };
  diagnostics: ProductDiagnostics;
};

type RemissionCategoryOption = {
  id: string;
  name: string;
};

type ProductTypeOption = {
  value: string;
  label: string;
};

type LocationOption = {
  id: string;
  areaId: string;
  label: string;
};

type AreaOption = {
  value: string;
  id: string;
  label: string;
};

type ServerAction = (formData: FormData) => void | Promise<void>;

type Props = {
  rows: RemissionProductsClientRow[];
  remissionCategories: RemissionCategoryOption[];
  allowedTypeOptions: ProductTypeOption[];
  originLocationOptions: LocationOption[];
  originAreaOptions: AreaOption[];
  canManage: boolean;
  destinationSiteId: string;
  originSiteId: string;
  bulkProfile: BulkProfile;
  selectedAreaKind: string;
  selectedAreaLabel: string;
  profileLabel: string;
  profileHelp: string;
  saveAction: ServerAction;
};

type RowRouteConfig = {
  enabled: boolean;
  areaKind: string;
  inputLocationId: string;
  outputLocationId: string;
};

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function statusChipClass(status: ProductDiagnostics["status"]) {
  if (status === "configured") return "ui-chip ui-chip--success";
  if (status === "ready") return "ui-chip ui-chip--info";
  if (status === "warning") return "ui-chip ui-chip--warn";
  return "ui-chip ui-chip--danger";
}

function normalizeProductType(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

function canSellProductType(productType: string) {
  const normalized = normalizeProductType(productType);
  return ["venta", "reventa", "preparacion"].includes(normalized);
}

function canConfigureProductionRoute(productType: string) {
  const normalized = normalizeProductType(productType);
  return ["venta", "preparacion"].includes(normalized);
}

function firstLocationForArea(areaValue: string, areas: AreaOption[], locations: LocationOption[]) {
  const area = areas.find((item) => item.value === areaValue) ?? areas[0] ?? null;
  if (!area) return "";
  return locations.find((location) => location.areaId === area.id)?.id ?? "";
}

function resolveRouteLocationId(
  locationId: string,
  areaValue: string,
  areas: AreaOption[],
  locations: LocationOption[],
) {
  const area = areas.find((item) => item.value === areaValue) ?? areas[0] ?? null;
  if (!area) return "";
  const areaLocations = locations.filter((location) => location.areaId === area.id);
  if (areaLocations.some((location) => location.id === locationId)) return locationId;
  return areaLocations[0]?.id ?? "";
}


const stickyHeaderCellClass =
  "sticky top-0 z-20 border-b border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-left text-xs font-semibold text-[var(--ui-muted)] shadow-sm";

export function RemissionProductsClientTable({
  rows,
  remissionCategories,
  allowedTypeOptions,
  originLocationOptions,
  originAreaOptions,
  canManage,
  destinationSiteId,
  originSiteId,
  bulkProfile,
  selectedAreaKind,
  selectedAreaLabel,
  profileLabel,
  profileHelp,
  saveAction,
}: Props) {
  const defaultOriginAreaKind = originAreaOptions[0]?.value ?? "";
  const defaultOriginAreaId = originAreaOptions[0]?.id ?? "";
  const defaultOriginLocationId =
    originLocationOptions.find((location) => location.areaId === defaultOriginAreaId)?.id ??
    originLocationOptions[0]?.id ??
    "";
  const disablesRemission = bulkProfile === "available_not_remission" || bulkProfile === "disable_remission";
  const originRouteInputsAvailable =
    !disablesRemission &&
    originAreaOptions.length > 0 &&
    originAreaOptions.some((area) =>
      originLocationOptions.some((location) => location.areaId === area.id)
    );

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [measurementFilter, setMeasurementFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedByProduct, setSelectedByProduct] = useState<Record<string, boolean>>({});
  const [salesByProduct, setSalesByProduct] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      rows.map((row) => {
        const productType = normalizeProductType(row.product.productType);
        const defaultSales =
          row.setting.salesEnabled ??
          (bulkProfile === "sellable_from_origin" && ["venta", "reventa"].includes(productType));
        return [row.product.id, canSellProductType(productType) ? Boolean(defaultSales) : false];
      })
    )
  );
  const [routeByProduct, setRouteByProduct] = useState<Record<string, RowRouteConfig>>(() =>
    Object.fromEntries(
      rows.map((row) => [
        row.product.id,
        {
          enabled: Boolean(row.setting.originRoute?.enabled),
          areaKind: row.setting.originRoute?.areaKind || defaultOriginAreaKind,
          inputLocationId:
            resolveRouteLocationId(
              row.setting.originRoute?.inputLocationId || "",
              row.setting.originRoute?.areaKind || defaultOriginAreaKind,
              originAreaOptions,
              originLocationOptions,
            ) || defaultOriginLocationId,
          outputLocationId:
            resolveRouteLocationId(
              row.setting.originRoute?.outputLocationId || "",
              row.setting.originRoute?.areaKind || defaultOriginAreaKind,
              originAreaOptions,
              originLocationOptions,
            ) || defaultOriginLocationId,
        },
      ])
    )
  );
  const [routeTouchedByProduct, setRouteTouchedByProduct] = useState<Record<string, boolean>>({});
  const [categoryByProduct, setCategoryByProduct] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((row) => [row.product.id, row.setting.remissionCategoryId])
    )
  );

  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    return rows.filter((row) => {
      if (normalizedQuery && !row.product.searchText.includes(normalizedQuery)) return false;
      if (typeFilter && row.product.productType !== typeFilter) return false;
      if (measurementFilter && row.product.measurementMode !== measurementFilter) return false;
      if (categoryFilter) {
        const rowCategoryId = categoryByProduct[row.product.id] ?? "";
        if (categoryFilter === "__none__") {
          if (rowCategoryId) return false;
        } else if (rowCategoryId !== categoryFilter) {
          return false;
        }
      }
      if (statusFilter === "__review__") {
        if (row.diagnostics.canApply && row.diagnostics.status !== "warning") return false;
      } else if (statusFilter && row.diagnostics.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [categoryByProduct, categoryFilter, measurementFilter, query, rows, statusFilter, typeFilter]);

  const selectableVisibleRows = visibleRows.filter((row) => row.diagnostics.canApply && canManage);
  const readyCount = visibleRows.filter((row) => row.diagnostics.canApply).length;
  const blockedCount = visibleRows.length - readyCount;
  const changedCategoryRows = rows.filter((row) => {
    const currentCategoryId = categoryByProduct[row.product.id] ?? "";
    return currentCategoryId !== row.setting.remissionCategoryId;
  });
  const changedCategoryCount = changedCategoryRows.length;
  const selectedProductIds = Object.entries(selectedByProduct)
    .filter(([, selected]) => selected)
    .map(([productId]) => productId);
  const selectedCount = selectedProductIds.length;
  const selectedRows = rows.filter((row) => selectedByProduct[row.product.id] === true);
  const allVisibleSelected =
    selectableVisibleRows.length > 0 &&
    selectableVisibleRows.every((row) => selectedByProduct[row.product.id] === true);
  const routeIsIncomplete = selectedRows.some((row) => {
    if (!canConfigureProductionRoute(row.product.productType)) return false;
    const route = routeByProduct[row.product.id];
    if (!route?.enabled) return false;
    return !originRouteInputsAvailable || !route.areaKind || !route.inputLocationId || !route.outputLocationId;
  });
  const canSave =
    canManage &&
    !routeIsIncomplete &&
    (selectedCount > 0 || changedCategoryCount > 0);
  const pendingCount = selectedCount + changedCategoryCount;

  function markProductSelected(productId: string) {
    setSelectedByProduct((current) => ({
      ...current,
      [productId]: true,
    }));
  }

  function updateRoute(productId: string, patch: Partial<RowRouteConfig>) {
    setRouteByProduct((current) => {
      const currentRoute = current[productId] ?? {
        enabled: false,
        areaKind: defaultOriginAreaKind,
        inputLocationId: defaultOriginLocationId,
        outputLocationId: defaultOriginLocationId,
      };
      return {
        ...current,
        [productId]: {
          ...currentRoute,
          ...patch,
        },
      };
    });
    setRouteTouchedByProduct((current) => ({
      ...current,
      [productId]: true,
    }));
    markProductSelected(productId);
  }

  return (
    <form id="save-remission-products-form" action={saveAction} className="mt-6 ui-panel">
      <input type="hidden" name="destination_site_id" value={destinationSiteId} />
      <input type="hidden" name="origin_site_id" value={originSiteId} />
      <input type="hidden" name="bulk_profile" value={bulkProfile} />
      <input type="hidden" name="area_kind" value={selectedAreaKind} />
      {selectedProductIds.map((productId) => {
        const row = rows.find((item) => item.product.id === productId);
        const productType = row?.product.productType ?? "";
        const canSell = row ? canSellProductType(productType) && !disablesRemission : false;
        const canRoute = row ? canConfigureProductionRoute(productType) && !disablesRemission : false;
        const route = routeByProduct[productId] ?? {
          enabled: false,
          areaKind: defaultOriginAreaKind,
          inputLocationId: defaultOriginLocationId,
          outputLocationId: defaultOriginLocationId,
        };
        const resolvedAreaKind = route.areaKind || defaultOriginAreaKind;
        const resolvedInputLocationId = resolveRouteLocationId(
          route.inputLocationId,
          resolvedAreaKind,
          originAreaOptions,
          originLocationOptions,
        );
        const resolvedOutputLocationId = resolveRouteLocationId(
          route.outputLocationId,
          resolvedAreaKind,
          originAreaOptions,
          originLocationOptions,
        );

        return (
          <div key={`selected-${productId}`} hidden>
            <input type="hidden" name="product_id" value={productId} />
            <input
              type="hidden"
              name={`sales_enabled_${productId}`}
              value={canSell && salesByProduct[productId] ? "true" : "false"}
            />
            <input
              type="hidden"
              name={`configure_origin_route_${productId}`}
              value={canRoute && route.enabled ? "true" : "false"}
            />
            <input
              type="hidden"
              name={`origin_route_touched_${productId}`}
              value={routeTouchedByProduct[productId] ? "true" : "false"}
            />
            <input type="hidden" name={`origin_area_kind_${productId}`} value={resolvedAreaKind} />
            <input type="hidden" name={`origin_input_location_id_${productId}`} value={resolvedInputLocationId} />
            <input type="hidden" name={`origin_output_location_id_${productId}`} value={resolvedOutputLocationId} />
          </div>
        );
      })}
      {changedCategoryRows.map((row) => (
        <div key={row.product.id} hidden>
          <input type="hidden" name="category_product_id" value={row.product.id} />
          <input
            type="hidden"
            name={`remission_category_${row.product.id}`}
            value={categoryByProduct[row.product.id] ?? ""}
          />
        </div>
      ))}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="ui-h3">Productos</div>
            <span className="ui-chip">Perfil: {profileLabel}</span>
            {selectedAreaLabel ? <span className="ui-chip">Área: {selectedAreaLabel}</span> : null}
            <span className="ui-chip">{visibleRows.length} visibles</span>
            <span className="ui-chip ui-chip--success">{readyCount} aplicables</span>
            <span className={blockedCount > 0 ? "ui-chip ui-chip--warn" : "ui-chip"}>
              {blockedCount} no aplicables
            </span>
            {selectedCount > 0 ? <span className="ui-chip ui-chip--info">{selectedCount} seleccionados</span> : null}
            {changedCategoryCount > 0 ? (
              <span className="ui-chip ui-chip--warn">{changedCategoryCount} categorías pendientes</span>
            ) : null}
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-[var(--ui-muted)]">
            {profileHelp} Activos, equipos y modelos patrimoniales se excluyen.
          </p>
        </div>

        <button
          type="submit"
          className="ui-btn ui-btn--brand"
          disabled={!canSave}
        >
          {pendingCount > 0 ? `Guardar cambios (${pendingCount})` : "Guardar cambios"}
        </button>
      </div>

      {routeIsIncomplete ? (
        <div className="mt-4 ui-alert ui-alert--warn">
          Hay productos seleccionados con ruta de producción incompleta. Completa área productora, LOC de consumo y LOC de terminado, o desmarca producción CP en esa fila.
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-7">
        <label className="flex flex-col gap-1 lg:col-span-2">
          <span className="ui-label">Buscar</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="ui-input"
            placeholder="Nombre o SKU"
            type="search"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Tipo</span>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="ui-input"
          >
            <option value="">Todos los compatibles</option>
            {allowedTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Medición</span>
          <select
            value={measurementFilter}
            onChange={(event) => setMeasurementFilter(event.target.value)}
            className="ui-input"
          >
            <option value="">Todas</option>
            <option value="fixed_presentation">Presentación fija</option>
            <option value="variable_weight">Peso variable</option>
            <option value="count_with_weight">Conteo + peso</option>
            <option value="bulk_volume">Granel</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Estado</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="ui-input"
          >
            <option value="">Todos</option>
            <option value="configured">Listos</option>
            <option value="ready">Puede configurarse</option>
            <option value="__review__">Revisar / no aplicables</option>
            <option value="blocked">Bloqueado</option>
            <option value="warning">Advertencia</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-label">Categoría</span>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="ui-input"
          >
            <option value="">Todas</option>
            <option value="__none__">Sin categoría</option>
            {remissionCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            className="ui-btn ui-btn--ghost w-full"
            onClick={() => {
              setQuery("");
              setTypeFilter("");
              setMeasurementFilter("");
              setCategoryFilter("");
              setStatusFilter("");
            }}
            disabled={!query && !typeFilter && !measurementFilter && !categoryFilter && !statusFilter}
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="mt-4 max-h-[640px] min-h-[320px] overflow-y-auto overflow-x-auto rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)]">
        <Table className="min-w-[1320px] w-full table-fixed">
          <colgroup>
            <col className="w-[44px]" />
            <col className="w-[22%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[17%]" />
            <col className="w-[8%]" />
            <col className="w-[17%]" />
            <col className="w-[6%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableHeaderCell className={stickyHeaderCellClass}>
                <input
                  type="checkbox"
                  aria-label="Seleccionar visibles"
                  checked={allVisibleSelected}
                  onChange={(event) => {
                    const nextChecked = event.target.checked;
                    setSelectedByProduct((current) => {
                      const next = { ...current };
                      for (const row of selectableVisibleRows) {
                        next[row.product.id] = nextChecked;
                      }
                      return next;
                    });
                  }}
                  disabled={!canManage || selectableVisibleRows.length === 0}
                />
              </TableHeaderCell>
              <TableHeaderCell className={stickyHeaderCellClass}>Producto</TableHeaderCell>
              <TableHeaderCell className={stickyHeaderCellClass}>Tipo</TableHeaderCell>
              <TableHeaderCell className={stickyHeaderCellClass}>Medición</TableHeaderCell>
              <TableHeaderCell className={stickyHeaderCellClass}>Categoría</TableHeaderCell>
              <TableHeaderCell className={stickyHeaderCellClass}>Venta</TableHeaderCell>
              <TableHeaderCell className={stickyHeaderCellClass}>Producción CP</TableHeaderCell>
              <TableHeaderCell className={stickyHeaderCellClass}>Base</TableHeaderCell>
              <TableHeaderCell className={stickyHeaderCellClass}>Estado</TableHeaderCell>
              <TableHeaderCell className={stickyHeaderCellClass}>Diagnóstico</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map(({ product, setting, diagnostics }) => {
              const categoryChanged = (categoryByProduct[product.id] ?? "") !== setting.remissionCategoryId;
              const selected = selectedByProduct[product.id] === true;
              const canSell = canSellProductType(product.productType) && !disablesRemission;
              const canRoute = canConfigureProductionRoute(product.productType) && !disablesRemission;
              const route = routeByProduct[product.id] ?? {
                enabled: false,
                areaKind: defaultOriginAreaKind,
                inputLocationId: defaultOriginLocationId,
                outputLocationId: defaultOriginLocationId,
              };
              const routeEnabled = canRoute && route.enabled;
              const rowBlocked = !diagnostics.canApply || !canManage;
              const selectedOriginArea =
                originAreaOptions.find((area) => area.value === route.areaKind) ??
                originAreaOptions[0] ??
                null;
              const availableRouteLocations = selectedOriginArea
                ? originLocationOptions.filter((location) => location.areaId === selectedOriginArea.id)
                : [];
              const resolvedInputLocationId = availableRouteLocations.some(
                (location) => location.id === route.inputLocationId
              )
                ? route.inputLocationId
                : availableRouteLocations[0]?.id ?? "";
              const resolvedOutputLocationId = availableRouteLocations.some(
                (location) => location.id === route.outputLocationId
              )
                ? route.outputLocationId
                : availableRouteLocations[0]?.id ?? "";
              return (
                <TableRow key={product.id} className="border-t border-zinc-200/70 align-top">
                  <TableCell className="px-3 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => {
                        const nextChecked = event.target.checked;
                        setSelectedByProduct((current) => ({
                          ...current,
                          [product.id]: nextChecked,
                        }));
                      }}
                      disabled={rowBlocked}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top">
                    <div className="truncate font-semibold text-[var(--ui-text)]" title={product.name}>
                      {product.name}
                    </div>
                    <div className="mt-1 truncate text-xs text-[var(--ui-muted)]" title={product.sku}>
                      {product.sku}
                    </div>
                    {selected || categoryChanged || routeEnabled || (canSell && salesByProduct[product.id]) ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {selected ? <span className="ui-chip ui-chip--info">Seleccionado</span> : null}
                        {categoryChanged ? <span className="ui-chip ui-chip--warn">Categoría pendiente</span> : null}
                        {canSell && salesByProduct[product.id] ? <span className="ui-chip">Vende</span> : null}
                        {routeEnabled ? <span className="ui-chip">Ruta CP</span> : null}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top">{product.productTypeLabel}</TableCell>
                  <TableCell className="px-3 py-3 align-top">{product.measurementLabel}</TableCell>
                  <TableCell className="px-3 py-3 align-top">
                    <select
                      value={categoryByProduct[product.id] ?? ""}
                      onChange={(event) => {
                        const categoryId = event.target.value;
                        setCategoryByProduct((current) => ({
                          ...current,
                          [product.id]: categoryId,
                        }));
                      }}
                      className="ui-input w-full min-w-0"
                      disabled={!canManage}
                    >
                      <option value="">Sin categoría</option>
                      {remissionCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top">
                    {canSell ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={salesByProduct[product.id] === true}
                          onChange={(event) => {
                            setSalesByProduct((current) => ({
                              ...current,
                              [product.id]: event.target.checked,
                            }));
                            markProductSelected(product.id);
                          }}
                          disabled={rowBlocked}
                        />
                        <span>Vende</span>
                      </label>
                    ) : (
                      <span className="text-xs text-[var(--ui-muted)]">No aplica</span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top">
                    {canRoute ? (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={routeEnabled}
                            onChange={(event) => {
                              const nextEnabled = event.target.checked;
                              const nextAreaKind = route.areaKind || defaultOriginAreaKind;
                              const nextLocationId = firstLocationForArea(
                                nextAreaKind,
                                originAreaOptions,
                                originLocationOptions,
                              );

                              updateRoute(product.id, {
                                enabled: nextEnabled,
                                areaKind: nextAreaKind,
                                inputLocationId: nextEnabled
                                  ? resolveRouteLocationId(
                                      route.inputLocationId,
                                      nextAreaKind,
                                      originAreaOptions,
                                      originLocationOptions,
                                    ) || nextLocationId
                                  : route.inputLocationId,
                                outputLocationId: nextEnabled
                                  ? resolveRouteLocationId(
                                      route.outputLocationId,
                                      nextAreaKind,
                                      originAreaOptions,
                                      originLocationOptions,
                                    ) || nextLocationId
                                  : route.outputLocationId,
                              });
                            }}
                            disabled={rowBlocked || !originRouteInputsAvailable}
                          />
                          <span>Ruta CP</span>
                        </label>
                        {routeEnabled ? (
                          <div className="space-y-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-2">
                            <label className="flex flex-col gap-1">
                              <span className="text-[11px] font-semibold text-[var(--ui-muted)]">Área</span>
                              <select
                                value={selectedOriginArea?.value ?? ""}
                                onChange={(event) => {
                                  const nextAreaKind = event.target.value;
                                  const nextArea = originAreaOptions.find((area) => area.value === nextAreaKind) ?? null;
                                  const nextLocationId = nextArea
                                    ? originLocationOptions.find((location) => location.areaId === nextArea.id)?.id ?? ""
                                    : "";

                                  updateRoute(product.id, {
                                    areaKind: nextAreaKind,
                                    inputLocationId: nextLocationId,
                                    outputLocationId: nextLocationId,
                                  });
                                }}
                                className="ui-input h-9 text-sm"
                                disabled={rowBlocked}
                              >
                                {originAreaOptions.map((area) => (
                                  <option key={area.id} value={area.value}>
                                    {area.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-[11px] font-semibold text-[var(--ui-muted)]">Consume</span>
                              <select
                                value={resolvedInputLocationId}
                                onChange={(event) => updateRoute(product.id, { inputLocationId: event.target.value })}
                                className="ui-input h-9 text-sm"
                                disabled={rowBlocked || availableRouteLocations.length === 0}
                              >
                                {availableRouteLocations.map((location) => (
                                  <option key={location.id} value={location.id}>
                                    {location.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-[11px] font-semibold text-[var(--ui-muted)]">Terminado</span>
                              <select
                                value={resolvedOutputLocationId}
                                onChange={(event) => updateRoute(product.id, { outputLocationId: event.target.value })}
                                className="ui-input h-9 text-sm"
                                disabled={rowBlocked || availableRouteLocations.length === 0}
                              >
                                {availableRouteLocations.map((location) => (
                                  <option key={location.id} value={location.id}>
                                    {location.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {availableRouteLocations.length === 0 ? (
                              <div className="text-xs text-amber-700">
                                El área seleccionada no tiene LOC de producción activo.
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {!originRouteInputsAvailable ? (
                          <div className="text-xs text-amber-700">
                            Faltan LOCs o áreas del origen.
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--ui-muted)]">No aplica</span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top">{product.stockUnitLabel}</TableCell>
                  <TableCell className="px-3 py-3 align-top">
                    <span className={statusChipClass(diagnostics.status)}>{diagnostics.label}</span>
                    {setting.remissionEnabled ? (
                      <div className="mt-2 text-xs text-[var(--ui-muted)]">Remisión activa</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top">
                    <div className="flex flex-wrap gap-1">
                      {diagnostics.issues.map((issue) => (
                        <span key={`${product.id}-${issue}`} className="ui-chip">
                          {issue}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="ui-empty">
                  No hay productos con esos filtros.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </form>
  );
}
