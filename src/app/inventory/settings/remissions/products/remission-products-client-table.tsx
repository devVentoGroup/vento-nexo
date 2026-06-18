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

type ServerAction = (formData: FormData) => void | Promise<void>;

type Props = {
  rows: RemissionProductsClientRow[];
  remissionCategories: RemissionCategoryOption[];
  allowedTypeOptions: ProductTypeOption[];
  canManage: boolean;
  destinationSiteId: string;
  originSiteId: string;
  bulkProfile: BulkProfile;
  profileLabel: string;
  profileHelp: string;
  applyAction: ServerAction;
  saveCategoriesAction: ServerAction;
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
  canManage,
  destinationSiteId,
  originSiteId,
  bulkProfile,
  profileLabel,
  profileHelp,
  applyAction,
  saveCategoriesAction,
}: Props) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [measurementFilter, setMeasurementFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const visibleRows = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    return rows.filter((row) => {
      if (normalizedQuery && !row.product.searchText.includes(normalizedQuery)) return false;
      if (typeFilter && row.product.productType !== typeFilter) return false;
      if (measurementFilter && row.product.measurementMode !== measurementFilter) return false;
      if (statusFilter && row.diagnostics.status !== statusFilter) return false;
      return true;
    });
  }, [measurementFilter, query, rows, statusFilter, typeFilter]);

  const readyCount = visibleRows.filter((row) => row.diagnostics.canApply).length;
  const blockedCount = visibleRows.length - readyCount;

  return (
    <>
      <form id="remission-category-form" action={saveCategoriesAction}>
        <input type="hidden" name="destination_site_id" value={destinationSiteId} />
        <input type="hidden" name="origin_site_id" value={originSiteId} />
        <input type="hidden" name="bulk_profile" value={bulkProfile} />
      </form>

      <div className="mt-6 ui-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="ui-h3">Productos</div>
              <span className="ui-chip">Perfil: {profileLabel}</span>
              <span className="ui-chip">{visibleRows.length} visibles</span>
              <span className="ui-chip ui-chip--success">{readyCount} aplicables</span>
              <span className={blockedCount > 0 ? "ui-chip ui-chip--warn" : "ui-chip"}>
                {blockedCount} revisar
              </span>
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-[var(--ui-muted)]">
              {profileHelp} Activos, equipos y modelos patrimoniales se excluyen.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              form="apply-remission-products-form"
              className="ui-btn ui-btn--brand"
              disabled={!canManage || readyCount === 0}
            >
              Aplicar a seleccionados
            </button>
            <button
              type="submit"
              form="remission-category-form"
              className="ui-btn ui-btn--ghost"
              disabled={!canManage || visibleRows.length === 0}
            >
              Guardar categorías
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-6">
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
          <div className="flex items-end">
            <button
              type="button"
              className="ui-btn ui-btn--ghost w-full"
              onClick={() => {
                setQuery("");
                setTypeFilter("");
                setMeasurementFilter("");
                setStatusFilter("");
              }}
              disabled={!query && !typeFilter && !measurementFilter && !statusFilter}
            >
              Limpiar
            </button>
          </div>
        </div>

        <form id="apply-remission-products-form" action={applyAction} className="mt-4">
          <input type="hidden" name="destination_site_id" value={destinationSiteId} />
          <input type="hidden" name="origin_site_id" value={originSiteId} />
          <input type="hidden" name="bulk_profile" value={bulkProfile} />

          <div className="max-h-[560px] min-h-[320px] overflow-y-auto overflow-x-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)]">
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
                  <TableHeaderCell className={stickyHeaderCellClass}>Sel.</TableHeaderCell>
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
                {visibleRows.map(({ product, setting, diagnostics }) => (
                  <TableRow key={product.id} className="border-t border-zinc-200/70 align-top">
                    <TableCell className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        name="product_id"
                        value={product.id}
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
                    </TableCell>
                    <TableCell className="px-3 py-3 align-top">{product.productTypeLabel}</TableCell>
                    <TableCell className="px-3 py-3 align-top">{product.measurementLabel}</TableCell>
                    <TableCell className="px-3 py-3 align-top">
                      <input
                        type="hidden"
                        name="category_product_id"
                        value={product.id}
                        form="remission-category-form"
                      />
                      <select
                        name={`remission_category_${product.id}`}
                        defaultValue={setting.remissionCategoryId}
                        className="ui-input w-full min-w-0"
                        form="remission-category-form"
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
                ))}
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
      </div>
    </>
  );
}
