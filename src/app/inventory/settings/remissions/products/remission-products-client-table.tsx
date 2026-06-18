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
      <div className="mt-6 ui-panel">
        <div className="grid gap-3 lg:grid-cols-6">
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
        <p className="mt-3 text-xs text-[var(--ui-muted)]">
          Estos filtros son instantáneos y no recargan la página.
        </p>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="ui-panel">
          <div className="ui-caption">Perfil</div>
          <div className="mt-1 text-sm font-semibold">{profileLabel}</div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--ui-muted)]">{profileHelp}</p>
        </div>
        <div className="ui-panel">
          <div className="ui-caption">Productos visibles</div>
          <div className="mt-1 text-sm font-semibold">{visibleRows.length}</div>
        </div>
        <div className="ui-panel">
          <div className="ui-caption">Aplicables visibles</div>
          <div className="mt-1 text-sm font-semibold">{readyCount}</div>
        </div>
        <div className="ui-panel">
          <div className="ui-caption">Bloqueados / revisar visibles</div>
          <div className="mt-1 text-sm font-semibold">{blockedCount}</div>
        </div>
      </div>

      <form id="remission-category-form" action={saveCategoriesAction}>
        <input type="hidden" name="destination_site_id" value={destinationSiteId} />
        <input type="hidden" name="origin_site_id" value={originSiteId} />
        <input type="hidden" name="bulk_profile" value={bulkProfile} />
      </form>

      <form action={applyAction} className="mt-6 ui-panel">
        <input type="hidden" name="destination_site_id" value={destinationSiteId} />
        <input type="hidden" name="origin_site_id" value={originSiteId} />
        <input type="hidden" name="bulk_profile" value={bulkProfile} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Productos</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Solo aparecen productos compatibles con el perfil elegido. Activos, equipos y modelos patrimoniales se excluyen.
            </p>
          </div>
          <button
            type="submit"
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

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Sel.</TableHeaderCell>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Medición</TableHeaderCell>
                <TableHeaderCell>Categoría remisión</TableHeaderCell>
                <TableHeaderCell>Base</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Diagnóstico</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleRows.map(({ product, setting, diagnostics }) => (
                <TableRow key={product.id} className="border-t border-zinc-200/70 align-top">
                  <TableCell>
                    <input
                      type="checkbox"
                      name="product_id"
                      value={product.id}
                      disabled={!diagnostics.canApply || !canManage}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-[var(--ui-text)]">{product.name}</div>
                    <div className="mt-1 text-xs text-[var(--ui-muted)]">{product.sku}</div>
                  </TableCell>
                  <TableCell>{product.productTypeLabel}</TableCell>
                  <TableCell>{product.measurementLabel}</TableCell>
                  <TableCell>
                    <input
                      type="hidden"
                      name="category_product_id"
                      value={product.id}
                      form="remission-category-form"
                    />
                    <select
                      name={`remission_category_${product.id}`}
                      defaultValue={setting.remissionCategoryId}
                      className="ui-input min-w-[180px]"
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
                  <TableCell>{product.stockUnitLabel}</TableCell>
                  <TableCell>
                    <span className={statusChipClass(diagnostics.status)}>{diagnostics.label}</span>
                    {setting.remissionEnabled ? (
                      <div className="mt-2 text-xs text-[var(--ui-muted)]">Remisión activa</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-[420px] flex-wrap gap-1">
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
    </>
  );
}
