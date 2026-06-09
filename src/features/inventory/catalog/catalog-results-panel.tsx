"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
  onToggleProductActive: (formData: FormData) => void | Promise<void>;
  onDeleteProduct: (formData: FormData) => void | Promise<void>;
};

const TABLE_ACTION_BUTTON_CLASS =
  "ui-btn ui-btn--ghost ui-btn--sm min-w-[104px] justify-center shrink-0";
const TABLE_DELETE_BUTTON_CLASS =
  "ui-btn ui-btn--ghost ui-btn--sm min-w-[104px] justify-center shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700";
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

  const normalizedQuery = liveQuery.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!normalizedQuery) return rows;
    return rows.filter((row) => {
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
  }, [normalizedQuery, rows]);

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
        <table className="ui-table min-w-[1100px] text-sm">
          <thead className="text-left text-[var(--ui-muted)]">
            <tr>
              <th className="py-2 pr-4 whitespace-nowrap">{isAssetCatalogTab ? "Modelo" : "Producto"}</th>
              {viewMode === "catalogo" ? (
                <>
                  <th className="py-2 pr-4 whitespace-nowrap">
                    {isAssetCatalogTab ? "Categoría patrimonial" : "Categoría"}
                  </th>
                  <th className="py-2 pr-4 whitespace-nowrap">
                    {isAssetCatalogTab ? "Tipo" : "Unidad"}
                  </th>
                </>
              ) : null}
              <th className="py-2 pr-4 whitespace-nowrap">
                {isAssetCatalogTab ? "Inventario real" : "Stock sede"}
              </th>
              <th className="py-2 pr-4 whitespace-nowrap">
                {isAssetCatalogTab ? "Stock" : "Mínimo"}
              </th>
              <th className="py-2 pr-4 whitespace-nowrap">
                {isAssetCatalogTab ? "Uso" : "Faltante"}
              </th>
              {viewMode === "catalogo" ? (
                <>
                  <th className="py-2 pr-4 whitespace-nowrap">
                    {isAssetCatalogTab ? "Operación" : "Auto-costo"}
                  </th>
                  <th className="py-2 pr-4 whitespace-nowrap">Estado</th>
                </>
              ) : (
                <th className="py-2 pr-4 whitespace-nowrap">Proveedor primario</th>
              )}
              <th className="py-2 pr-4 w-[340px] whitespace-nowrap">Acciones</th>
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
                <td className="py-4 text-[var(--ui-muted)]" colSpan={viewMode === "catálogo" ? 9 : 6}>
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
