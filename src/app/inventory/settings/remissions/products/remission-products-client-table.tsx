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
  label: string;
};

type AreaOption = {
  value: string;
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
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [measurementFilter, setMeasurementFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedByProduct, setSelectedByProduct] = useState<Record<string, boolean>>({});
  const [salesEnabled, setSalesEnabled] = useState(bulkProfile === "sellable_from_origin");
  const [configureOriginRoute, setConfigureOriginRoute] = useState(false);
  const [originAreaKind, setOriginAreaKind] = useState(originAreaOptions[0]?.value ?? "");
  const [originInputLocationId, setOriginInputLocationId] = useState(originLocationOptions[0]?.id ?? "");
  const [originOutputLocationId, setOriginOutputLocationId] = useState(originLocationOptions[0]?.id ?? "");
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
      if (statusFilter && row.diagnostics.status !== statusFilter) return false;
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
  const allVisibleSelected =
    selectableVisibleRows.length > 0 &&
    selectableVisibleRows.every((row) => selectedByProduct[row.product.id] === true);
  const disablesRemission = bulkProfile === "available_not_remission" || bulkProfile === "disable_remission";
  const canConfigureSales = bulkProfile === "sellable_from_origin" || bulkProfile === "preparation_from_origin";
  const canConfigureOriginRoute =
    !disablesRemission && originLocationOptions.length > 0 && originAreaOptions.length > 0;
  const routeIsIncomplete =
    configureOriginRoute &&
    canConfigureOriginRoute &&
    (!originAreaKind || !originInputLocationId || !originOutputLocationId);
  const canSave =
    canManage &&
    !routeIsIncomplete &&
    (selectedCount > 0 || changedCategoryCount > 0);
  const pendingCount = selectedCount + changedCategoryCount;

  return (
    <form id="save-remission-products-form" action={saveAction} className="mt-6 ui-panel">
      <input type="hidden" name="destination_site_id" value={destinationSiteId} />
      <input type="hidden" name="origin_site_id" value={originSiteId} />
      <input type="hidden" name="bulk_profile" value={bulkProfile} />
      <input type="hidden" name="area_kind" value={selectedAreaKind} />
      <input type="hidden" name="sales_enabled" value={salesEnabled && canConfigureSales ? "true" : "false"} />
      <input
        type="hidden"
        name="configure_origin_route"
        value={configureOriginRoute && canConfigureOriginRoute ? "true" : "false"}
      />
      <input type="hidden" name="origin_area_kind" value={originAreaKind} />
      <input type="hidden" name="origin_input_location_id" value={originInputLocationId} />
      <input type="hidden" name="origin_output_location_id" value={originOutputLocationId} />
      {selectedProductIds.map((productId) => (
        <input key={`selected-${productId}`} type="hidden" name="product_id" value={productId} />
      ))}
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
              {blockedCount} revisar
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

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-3">
          <div className="text-sm font-semibold text-[var(--ui-text)]">Venta en sede destino</div>
          <label className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={salesEnabled && canConfigureSales}
              onChange={(event) => setSalesEnabled(event.target.checked)}
              disabled={!canManage || !canConfigureSales}
            />
            <span>Se vende en esta sede</span>
          </label>
          <p className="mt-2 text-xs leading-relaxed text-[var(--ui-muted)]">
            Disponible para productos vendibles o preparaciones remitidas. En insumos se guarda apagado.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-3 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[var(--ui-text)]">Ruta de producción del origen</div>
              <p className="mt-1 text-xs text-[var(--ui-muted)]">
                Crea o actualiza la ruta en la sede origen para los productos seleccionados.
              </p>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={configureOriginRoute && canConfigureOriginRoute}
                onChange={(event) => setConfigureOriginRoute(event.target.checked)}
                disabled={!canManage || !canConfigureOriginRoute}
              />
              <span>Configurar LOCs</span>
            </label>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Área productora</span>
              <select
                value={originAreaKind}
                onChange={(event) => setOriginAreaKind(event.target.value)}
                className="ui-input"
                disabled={!canManage || !configureOriginRoute || !canConfigureOriginRoute}
              >
                {originAreaOptions.map((area) => (
                  <option key={area.value} value={area.value}>
                    {area.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Consume insumos desde</span>
              <select
                value={originInputLocationId}
                onChange={(event) => setOriginInputLocationId(event.target.value)}
                className="ui-input"
                disabled={!canManage || !configureOriginRoute || !canConfigureOriginRoute}
              >
                {originLocationOptions.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Terminado queda en</span>
              <select
                value={originOutputLocationId}
                onChange={(event) => setOriginOutputLocationId(event.target.value)}
                className="ui-input"
                disabled={!canManage || !configureOriginRoute || !canConfigureOriginRoute}
              >
                {originLocationOptions.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-muted)]">
            Qué pasa con lo producido: <span className="font-semibold text-[var(--ui-text)]">Queda para remisión</span>.
          </div>
          {!canConfigureOriginRoute ? (
            <div className="mt-3 ui-alert ui-alert--warn">
              Para configurar LOCs el origen necesita LOCs activos y áreas operativas configuradas.
            </div>
          ) : null}
        </div>
      </div>

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
            <option value="blocked">Bloqueado</option>
            <option value="warning">Revisar</option>
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

      <div className="mt-4 max-h-[560px] min-h-[320px] overflow-y-auto overflow-x-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)]">
        <Table className="w-full table-fixed">
          <colgroup>
            <col className="w-[44px]" />
            <col className="w-[24%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="w-[20%]" />
            <col className="w-[7%]" />
            <col className="w-[14%]" />
            <col className="w-[13%]" />
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
              <TableHeaderCell className={stickyHeaderCellClass}>Base</TableHeaderCell>
              <TableHeaderCell className={stickyHeaderCellClass}>Estado</TableHeaderCell>
              <TableHeaderCell className={stickyHeaderCellClass}>Diagnóstico</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map(({ product, setting, diagnostics }) => {
              const categoryChanged = (categoryByProduct[product.id] ?? "") !== setting.remissionCategoryId;
              const selected = selectedByProduct[product.id] === true;
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
                      disabled={!diagnostics.canApply || !canManage}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-3 align-top">
                    <div className="truncate font-semibold text-[var(--ui-text)]" title={product.name}>
                      {product.name}
                    </div>
                    <div className="mt-1 truncate text-xs text-[var(--ui-muted)]" title={product.sku}>
                      {product.sku}
                    </div>
                    {selected || categoryChanged ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {selected ? <span className="ui-chip ui-chip--info">Seleccionado</span> : null}
                        {categoryChanged ? <span className="ui-chip ui-chip--warn">Categoría pendiente</span> : null}
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
                <TableCell colSpan={8} className="ui-empty">
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
