"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { InventoryCategoryRow } from "@/lib/inventory/categories";

export type PurchaseSuggestionRow = {
  supplierId: string;
  supplierName: string;
  itemsCount: number;
  href: string;
};

export type CatalogResultRow = {
  id: string;
  name: string;
  imageUrl?: string;
  sku: string;
  categoryId: string;
  categoryPath: string;
  categoryLabel: string;
  inventoryLabel: string;
  unitLabel: string;
  currentQtyLabel: string;
  currentQtyIsLow: boolean;
  minStockLabel: string;
  shortageLabel: string;
  shortageTone: "warn" | "success" | "muted";
  autoCostLabel: string;
  autoCostTone: "warn" | "success" | "default";
  autoCostDetail: string;
  statusLabel: string;
  primarySupplierName: string;
  fichaHref: string;
  nextIsActive: boolean;
  toggleLabel: string;
  origoHref: string;
};

type CatalogResultsPanelProps = {
  activeTab: string;
  activeTabLabel: string;
  siteLabel: string;
  lowStockCount: number;
  itemCount: number;
  siteId: string;
  viewMode: "catalogo" | "compras";
  purchaseSuggestions: PurchaseSuggestionRow[];
  rows: CatalogResultRow[];
  canManageProducts: boolean;
  catalogReturnUrl: string;
  searchQuery: string;
  categoryKind: string;
  stockAlert: string;
  categoryScope: string;
  categorySiteId: string;
  categoryDomain: string;
  effectiveCategoryId: string;
  effectiveSupplierId: string;
  showDisabled: boolean;
  categoryRows: InventoryCategoryRow[];
  onToggleProductActive: (formData: FormData) => void | Promise<void>;
  onDeleteProduct: (formData: FormData) => void | Promise<void>;
};

const TABLE_ACTION_BUTTON_CLASS =
  "ui-btn ui-btn--ghost ui-btn--sm min-w-[104px] justify-center shrink-0";
const TABLE_DELETE_BUTTON_CLASS =
  "ui-btn ui-btn--ghost ui-btn--sm min-w-[104px] justify-center shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700";

type SortDirection = "none" | "asc" | "desc";

const DEFAULT_COLUMN_WIDTHS = {
  product: 290,
  category: 230,
  unit: 120,
  stock: 120,
  minimum: 110,
  shortage: 120,
  autoCost: 140,
  status: 110,
  actions: 330,
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function ResizableHeader({
  children,
  width,
  onResize,
  className = "",
}: {
  children: ReactNode;
  width: number;
  onResize: (width: number) => void;
  className?: string;
}) {
  const startRef = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    function handleMove(event: MouseEvent) {
      if (!startRef.current) return;
      onResize(Math.max(72, startRef.current.width + event.clientX - startRef.current.x));
    }

    function handleUp() {
      startRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [onResize]);

  return (
    <th className={`relative py-2 pr-4 whitespace-nowrap ${className}`.trim()} style={{ width, minWidth: width }}>
      {children}
      <span
        aria-hidden="true"
        className="absolute right-1 top-2 h-[calc(100%-1rem)] w-1 cursor-col-resize rounded-full hover:bg-[color:var(--ui-brand)]/30"
        onMouseDown={(event) => {
          startRef.current = { x: event.clientX, width };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
      />
    </th>
  );
}
function CatalogProductImage({ src, name }: { src?: string; name: string }) {
  const imageUrl = String(src ?? "").trim();

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="px-1 text-center text-[10px] font-bold text-[var(--ui-muted)]">
          Sin foto
        </span>
      )}
    </div>
  );
}

function CategoryColumnMenu({
  categories,
  selectedIds,
  parentId,
  query,
  sortDirection,
  onSelectedIdsChange,
  onParentIdChange,
  onQueryChange,
  onSortDirectionChange,
}: {
  categories: InventoryCategoryRow[];
  selectedIds: string[];
  parentId: string;
  query: string;
  sortDirection: SortDirection;
  onSelectedIdsChange: (ids: string[]) => void;
  onParentIdChange: (id: string) => void;
  onQueryChange: (query: string) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    if (open) document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const parentOptions = useMemo(() => {
    const parentIds = new Set<string>();
    for (const category of categories) {
      const id = String(category.parent_id ?? "").trim();
      if (id) parentIds.add(id);
    }
    return Array.from(parentIds)
      .map((id) => categoryById.get(id))
      .filter((category): category is InventoryCategoryRow => Boolean(category))
      .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "es"));
  }, [categories, categoryById]);

  const visibleCategories = useMemo(() => {
    const normalizedQuery = normalizeText(query.trim());
    return categories
      .filter((category) => {
        if (parentId && category.parent_id !== parentId) return false;
        if (!normalizedQuery) return true;
        return normalizeText(String(category.name ?? "")).includes(normalizedQuery);
      })
      .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "es"));
  }, [categories, parentId, query]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected =
    visibleCategories.length > 0 && visibleCategories.every((category) => selectedSet.has(category.id));

  function toggleCategory(id: string) {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(Array.from(next));
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-left font-semibold text-[var(--ui-muted)] hover:bg-[color:var(--ui-brand)]/10 hover:text-[var(--ui-brand)]"
        onClick={() => setOpen((value) => !value)}
        onContextMenu={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        Categoría
        <span aria-hidden="true" className="text-[10px]">▾</span>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-[320px] rounded-xl border border-[var(--ui-border)] bg-white p-3 text-[13px] text-[var(--ui-text)] shadow-xl">
          <div className="grid gap-2">
            <button
              type="button"
              className={`rounded-lg px-2 py-1.5 text-left font-semibold hover:bg-[var(--ui-surface)] ${sortDirection === "asc" ? "text-[var(--ui-brand)]" : ""}`}
              onClick={() => onSortDirectionChange("asc")}
            >
              Ordenar de A a Z
            </button>
            <button
              type="button"
              className={`rounded-lg px-2 py-1.5 text-left font-semibold hover:bg-[var(--ui-surface)] ${sortDirection === "desc" ? "text-[var(--ui-brand)]" : ""}`}
              onClick={() => onSortDirectionChange("desc")}
            >
              Ordenar de Z a A
            </button>
            <button
              type="button"
              className="rounded-lg px-2 py-1.5 text-left font-semibold text-[var(--ui-muted)] hover:bg-[var(--ui-surface)]"
              onClick={() => onSortDirectionChange("none")}
            >
              Quitar orden
            </button>
          </div>

          <div className="my-3 h-px bg-[var(--ui-border)]" />

          <label className="grid gap-1">
            <span className="ui-label">Categoría padre</span>
            <select
              value={parentId}
              onChange={(event) => onParentIdChange(event.target.value)}
              className="ui-input h-9 text-sm"
            >
              <option value="">Todas</option>
              {parentOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name ?? category.id}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 grid gap-1">
            <span className="ui-label">Buscar</span>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              className="ui-input h-9 text-sm"
              placeholder="Nombre de categoría"
            />
          </label>

          <div className="mt-3 rounded-lg border border-[var(--ui-border)]">
            <label className="flex cursor-pointer items-center gap-2 border-b border-[var(--ui-border)] px-2 py-2 font-semibold">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={() => {
                  if (allVisibleSelected) {
                    onSelectedIdsChange(selectedIds.filter((id) => !visibleCategories.some((category) => category.id === id)));
                    return;
                  }
                  onSelectedIdsChange(Array.from(new Set([...selectedIds, ...visibleCategories.map((category) => category.id)])));
                }}
              />
              Seleccionar visibles
            </label>
            <div className="max-h-56 overflow-y-auto p-1">
              {visibleCategories.map((category) => (
                <label
                  key={category.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--ui-surface)]"
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(category.id)}
                    onChange={() => toggleCategory(category.id)}
                  />
                  <span className="truncate" title={category.name ?? category.id}>
                    {category.name ?? category.id}
                  </span>
                </label>
              ))}
              {visibleCategories.length === 0 ? (
                <div className="px-2 py-3 text-sm text-[var(--ui-muted)]">Sin coincidencias.</div>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--sm"
              onClick={() => {
                onSelectedIdsChange([]);
                onParentIdChange("");
                onQueryChange("");
              }}
            >
              Limpiar
            </button>
            <button type="button" className="ui-btn ui-btn--brand ui-btn--sm" onClick={() => setOpen(false)}>
              Aplicar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CatalogResultsPanel({
  activeTab,
  activeTabLabel,
  siteLabel,
  lowStockCount,
  itemCount,
  siteId,
  viewMode,
  purchaseSuggestions,
  rows,
  canManageProducts,
  catalogReturnUrl,
  searchQuery,
  categoryKind: _categoryKind,
  stockAlert: _stockAlert,
  categoryScope: _categoryScope,
  categorySiteId: _categorySiteId,
  categoryDomain: _categoryDomain,
  effectiveCategoryId: _effectiveCategoryId,
  effectiveSupplierId: _effectiveSupplierId,
  showDisabled: _showDisabled,
  categoryRows,
  onToggleProductActive,
  onDeleteProduct,
}: CatalogResultsPanelProps) {
  const isAssetCatalogTab = activeTab === "equipos";
  void _categoryKind;
  void _stockAlert;
  void _categoryScope;
  void _categorySiteId;
  void _categoryDomain;
  void _effectiveCategoryId;
  void _effectiveSupplierId;
  void _showDisabled;

  const [liveQuery, setLiveQuery] = useState(searchQuery ?? "");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [categoryParentId, setCategoryParentId] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    _effectiveCategoryId ? [_effectiveCategoryId] : [],
  );
  const [categorySortDirection, setCategorySortDirection] = useState<SortDirection>("none");
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);

  const categoryById = useMemo(
    () => new Map(categoryRows.map((category) => [category.id, category])),
    [categoryRows],
  );

  const normalizedQuery = liveQuery.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    const selectedSet = new Set(selectedCategoryIds);
    const byQueryAndCategory = rows.filter((row) => {
      if (categoryParentId) {
        const parentMatches = categoryById.get(row.categoryId)?.parent_id === categoryParentId;
        if (!parentMatches) return false;
      }

      if (selectedSet.size > 0 && !selectedSet.has(row.categoryId)) return false;

      if (!normalizedQuery) return true;
      const haystack = [
        row.name,
        row.sku,
        row.categoryLabel,
        row.categoryPath,
        row.unitLabel,
        row.inventoryLabel,
        row.currentQtyLabel,
        row.statusLabel,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    if (categorySortDirection === "none") return byQueryAndCategory;
    return [...byQueryAndCategory].sort((a, b) => {
      const comparison = a.categoryLabel.localeCompare(b.categoryLabel, "es");
      if (comparison !== 0) return categorySortDirection === "asc" ? comparison : -comparison;
      return a.name.localeCompare(b.name, "es");
    });
  }, [categoryById, categoryParentId, categorySortDirection, normalizedQuery, rows, selectedCategoryIds]);

  const activeColumnFilterCount =
    selectedCategoryIds.length + (categoryParentId ? 1 : 0) + (categoryQuery ? 1 : 0);

  function resizeColumn(column: keyof typeof DEFAULT_COLUMN_WIDTHS, width: number) {
    setColumnWidths((current) => ({ ...current, [column]: width }));
  }

  return (
    <div className="mt-6 ui-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="ui-h3">{activeTabLabel}</div>
          <div className="mt-1 ui-body-muted">
            {isAssetCatalogTab
              ? "Mostrando modelos base del catálogo patrimonial."
              : "Mostrando hasta 1200 items."}
          </div>
          {siteId && !isAssetCatalogTab ? (
            <div className="mt-1 text-xs text-[var(--ui-muted)]">
              Sede activa: {siteLabel}. Bajo mínimo: {lowStockCount}.
            </div>
          ) : null}
        </div>
        <div className="ui-caption">
          {isAssetCatalogTab ? "Modelos" : "Items"}: {filteredRows.length}
          {normalizedQuery ? <span className="text-[var(--ui-muted)]"> / {itemCount}</span> : null}
        </div>
      </div>

      {siteId && !isAssetCatalogTab ? (
        <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
          <details className="group" open={purchaseSuggestions.length > 0}>
            <summary className="flex cursor-pointer items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--ui-text)]">
                  Ordenes sugeridas por proveedor (ORIGO)
                </div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  Genera borradores de orden en ORIGO con productos bajo mínimo de la sede activa.
                </div>
              </div>
              <span className="ui-chip">{purchaseSuggestions.length} proveedor(es)</span>
            </summary>
            <div className="mt-3">
              {purchaseSuggestions.length === 0 ? (
                <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-3 text-sm text-[var(--ui-muted)]">
                  No hay ordenes sugeridas para la sede activa en este momento.
                </div>
              ) : (
                <div className="max-h-[280px] overflow-y-auto pr-1">
                  <div className="grid gap-2">
                    {purchaseSuggestions.map((group) => (
                      <div
                        key={group.supplierId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[var(--ui-text)]">{group.supplierName}</div>
                          <div className="text-xs text-[var(--ui-muted)]">
                            {group.itemsCount} producto(s) bajo mínimo
                          </div>
                        </div>
                        <Link href={group.href} className="ui-btn ui-btn--brand ui-btn--sm">
                          Continuar en ORIGO
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="ui-label">{isAssetCatalogTab ? "Buscar modelo patrimonial" : "Buscar producto"}</span>
            <input
              name="q"
              value={liveQuery}
              onChange={(event) => setLiveQuery(event.target.value)}
              placeholder={isAssetCatalogTab ? "SKU o nombre del modelo" : "SKU o nombre de producto"}
              className="ui-input mt-1"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="ui-btn ui-btn--ghost"
              onClick={() => {
                setLiveQuery("");
              }}
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-[var(--ui-border)]">
        <table className="ui-table table-fixed text-sm" style={{ minWidth: 1100 }}>
          <thead className="text-left text-[var(--ui-muted)]">
            <tr>
              <ResizableHeader width={columnWidths.product} onResize={(width) => resizeColumn("product", width)}>
                {isAssetCatalogTab ? "Modelo" : "Producto"}
              </ResizableHeader>
              {viewMode === "catalogo" ? (
                <>
                  <ResizableHeader width={columnWidths.category} onResize={(width) => resizeColumn("category", width)}>
                    {isAssetCatalogTab ? (
                      "Categoría patrimonial"
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <CategoryColumnMenu
                          categories={categoryRows}
                          selectedIds={selectedCategoryIds}
                          parentId={categoryParentId}
                          query={categoryQuery}
                          sortDirection={categorySortDirection}
                          onSelectedIdsChange={setSelectedCategoryIds}
                          onParentIdChange={setCategoryParentId}
                          onQueryChange={setCategoryQuery}
                          onSortDirectionChange={setCategorySortDirection}
                        />
                        {activeColumnFilterCount > 0 ? (
                          <span className="rounded-full bg-[color:var(--ui-brand)]/10 px-1.5 py-0.5 text-[10px] font-bold text-[var(--ui-brand)]">
                            {activeColumnFilterCount}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </ResizableHeader>
                  <ResizableHeader width={columnWidths.unit} onResize={(width) => resizeColumn("unit", width)}>
                    {isAssetCatalogTab ? "Tipo" : "Unidad"}
                  </ResizableHeader>
                </>
              ) : null}
              <ResizableHeader width={columnWidths.stock} onResize={(width) => resizeColumn("stock", width)}>
                {isAssetCatalogTab ? "Inventario real" : "Stock sede"}
              </ResizableHeader>
              <ResizableHeader width={columnWidths.minimum} onResize={(width) => resizeColumn("minimum", width)}>
                {isAssetCatalogTab ? "Stock" : "Mínimo"}
              </ResizableHeader>
              <ResizableHeader width={columnWidths.shortage} onResize={(width) => resizeColumn("shortage", width)}>
                {isAssetCatalogTab ? "Uso" : "Faltante"}
              </ResizableHeader>
              {viewMode === "catalogo" ? (
                <>
                  <ResizableHeader width={columnWidths.autoCost} onResize={(width) => resizeColumn("autoCost", width)}>
                    {isAssetCatalogTab ? "Operación" : "Auto-costo"}
                  </ResizableHeader>
                  <ResizableHeader width={columnWidths.status} onResize={(width) => resizeColumn("status", width)}>
                    Estado
                  </ResizableHeader>
                </>
              ) : (
                <ResizableHeader width={columnWidths.autoCost} onResize={(width) => resizeColumn("autoCost", width)}>
                  Proveedor primario
                </ResizableHeader>
              )}
              <ResizableHeader width={columnWidths.actions} onResize={(width) => resizeColumn("actions", width)}>
                Acciones
              </ResizableHeader>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-200/60">
                <td className="py-2.5 pr-4">
                  <div className="flex max-w-[280px] items-center gap-3">
                    <CatalogProductImage src={row.imageUrl} name={row.name} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-[var(--ui-text)]" title={row.name}>
                        {row.name}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[var(--ui-muted)]" title={row.sku}>
                        SKU {row.sku}
                      </div>
                    </div>
                  </div>
                </td>
                {viewMode === "catalogo" ? (
                  <>
                    <td className="py-2.5 pr-4">
                      <div className="max-w-[320px] truncate" title={row.categoryPath}>
                        {row.categoryLabel}
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{row.unitLabel}</td>
                  </>
                ) : null}
                <td className="py-2.5 pr-4 whitespace-nowrap">
                  <span className={row.currentQtyIsLow ? "font-semibold text-amber-700" : ""}>
                    {row.currentQtyLabel}
                  </span>
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{row.minStockLabel}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">
                  {row.shortageTone === "warn" ? (
                    <span className="ui-chip ui-chip--warn">{row.shortageLabel}</span>
                  ) : row.shortageTone === "success" ? (
                    <span className="ui-chip ui-chip--success">{row.shortageLabel}</span>
                  ) : (
                    <span className="text-xs text-[var(--ui-muted)]">{row.shortageLabel}</span>
                  )}
                </td>
                {viewMode === "catalogo" ? (
                  <>
                    <td className="py-2.5 pr-4">
                      {row.autoCostTone === "success" ? (
                        <span className="ui-chip ui-chip--success">{row.autoCostLabel}</span>
                      ) : row.autoCostTone === "warn" ? (
                        <div className="space-y-1">
                          <span className="ui-chip ui-chip--warn">{row.autoCostLabel}</span>
                          {row.autoCostDetail ? (
                            <div className="text-xs text-[var(--ui-muted)]">{row.autoCostDetail}</div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="ui-chip">{row.autoCostLabel}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{row.statusLabel}</td>
                  </>
                ) : (
                  <td className="py-2.5 pr-4 whitespace-nowrap">{row.primarySupplierName}</td>
                )}
                <td className="py-2.5 pr-4 align-top">
                  <div className="flex flex-nowrap items-center gap-2">
                    <Link href={row.fichaHref} className={TABLE_ACTION_BUTTON_CLASS}>
                      {isAssetCatalogTab ? "Modelo" : "Ficha"}
                    </Link>
                    {canManageProducts ? (
                      <form action={onToggleProductActive}>
                        <input type="hidden" name="product_id" value={row.id} />
                        <input type="hidden" name="return_to" value={catalogReturnUrl} />
                        <input type="hidden" name="next_is_active" value={row.nextIsActive ? "1" : "0"} />
                        <button type="submit" className={TABLE_ACTION_BUTTON_CLASS}>
                          {row.toggleLabel}
                        </button>
                      </form>
                    ) : null}
                    {canManageProducts ? (
                      <form
                        action={onDeleteProduct}
                        onSubmit={(event) => {
                          const ok = window.confirm(
                            isAssetCatalogTab
                              ? "¿Eliminar este modelo patrimonial? Esta acción no se puede deshacer."
                              : "¿Eliminar este producto? Esta acción no se puede deshacer."
                          );
                          if (!ok) event.preventDefault();
                        }}
                      >
                        <input type="hidden" name="product_id" value={row.id} />
                        <input type="hidden" name="return_to" value={catalogReturnUrl} />
                        <button type="submit" className={TABLE_DELETE_BUTTON_CLASS}>
                          Eliminar
                        </button>
                      </form>
                    ) : null}
                    {viewMode === "compras" && row.origoHref ? (
                      <Link
                        href={row.origoHref}
                        className="ui-btn ui-btn--brand ui-btn--sm min-w-[120px] justify-center"
                      >
                        ORIGO
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr>
                <td className="py-4 text-[var(--ui-muted)]" colSpan={viewMode === "catalogo" ? 9 : 6}>
                  {normalizedQuery
                    ? isAssetCatalogTab
                      ? "No hay modelos patrimoniales que coincidan con la búsqueda."
                      : "No hay productos que coincidan con la búsqueda."
                    : isAssetCatalogTab
                      ? "No hay modelos patrimoniales para mostrar con estos filtros."
                      : "No hay productos para mostrar con estos filtros."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
