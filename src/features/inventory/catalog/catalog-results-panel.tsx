"use client";

import Link from "next/link";

export type PurchaseSuggestionRow = {
  supplierId: string;
  supplierName: string;
  itemsCount: number;
  href: string;
};

export type CatalogResultRow = {
  id: string;
  name: string;
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
  categoryKind,
  stockAlert,
  categoryScope,
  categorySiteId,
  categoryDomain,
  effectiveCategoryId,
  effectiveSupplierId,
  showDisabled,
  onToggleProductActive,
  onDeleteProduct,
}: CatalogResultsPanelProps) {
  return (
    <div className="mt-6 ui-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="ui-h3">{activeTabLabel}</div>
          <div className="mt-1 ui-body-muted">Mostrando hasta 1200 items.</div>
          {siteId ? (
            <div className="mt-1 text-xs text-[var(--ui-muted)]">
              Sede activa: {siteLabel}. Bajo minimo: {lowStockCount}.
            </div>
          ) : null}
        </div>
        <div className="ui-caption">Items: {itemCount}</div>
      </div>

      {siteId ? (
        <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
          <details className="group" open={purchaseSuggestions.length > 0}>
            <summary className="flex cursor-pointer items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--ui-text)]">
                  Ordenes sugeridas por proveedor (ORIGO)
                </div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  Genera borradores de orden en ORIGO con productos bajo minimo de la sede activa.
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
                            {group.itemsCount} producto(s) bajo minimo
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

      <form method="get" className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
        <input type="hidden" name="tab" value={activeTab} />
        <input type="hidden" name="site_id" value={siteId} />
        <input type="hidden" name="category_kind" value={categoryKind} />
        <input type="hidden" name="stock_alert" value={stockAlert} />
        <input type="hidden" name="view_mode" value={viewMode} />
        <input type="hidden" name="supplier_id" value={effectiveSupplierId} />
        <input type="hidden" name="category_scope" value={categoryScope} />
        <input type="hidden" name="category_site_id" value={categorySiteId} />
        <input type="hidden" name="category_domain" value={categoryDomain} />
        <input type="hidden" name="category_id" value={effectiveCategoryId} />
        {showDisabled ? <input type="hidden" name="show_disabled" value="1" /> : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="ui-label">Buscar producto</span>
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="SKU o nombre de producto"
              className="ui-input mt-1"
            />
          </label>
          <div className="flex gap-2">
            <button className="ui-btn ui-btn--brand">Buscar</button>
            <button
              type="submit"
              className="ui-btn ui-btn--ghost"
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (!form) return;
                const queryInput = form.elements.namedItem("q") as HTMLInputElement | null;
                if (queryInput) queryInput.value = "";
              }}
            >
              Limpiar
            </button>
          </div>
        </div>
      </form>

      <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-[var(--ui-border)]">
        <table className="ui-table min-w-[1100px] text-sm">
          <thead className="text-left text-[var(--ui-muted)]">
            <tr>
              <th className="py-2 pr-4 whitespace-nowrap">Producto</th>
              {viewMode === "catalogo" ? (
                <>
                  <th className="py-2 pr-4 whitespace-nowrap">Categoria</th>
                  <th className="py-2 pr-4 whitespace-nowrap">Unidad</th>
                </>
              ) : null}
              <th className="py-2 pr-4 whitespace-nowrap">Stock sede</th>
              <th className="py-2 pr-4 whitespace-nowrap">Minimo</th>
              <th className="py-2 pr-4 whitespace-nowrap">Faltante</th>
              {viewMode === "catalogo" ? (
                <>
                  <th className="py-2 pr-4 whitespace-nowrap">Auto-costo</th>
                  <th className="py-2 pr-4 whitespace-nowrap">Estado</th>
                </>
              ) : (
                <th className="py-2 pr-4 whitespace-nowrap">Proveedor primario</th>
              )}
              <th className="py-2 pr-4 w-[340px] whitespace-nowrap">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-zinc-200/60">
                <td className="py-2.5 pr-4">
                  <div className="max-w-[220px] truncate" title={row.name}>
                    {row.name}
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
                      Ficha
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
                            "¿Eliminar este producto? Esta acción no se puede deshacer."
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
            {rows.length === 0 ? (
              <tr>
                <td className="py-4 text-[var(--ui-muted)]" colSpan={viewMode === "catalogo" ? 9 : 6}>
                  No hay productos para mostrar con estos filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
