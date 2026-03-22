import Link from "next/link";

import { CategoryTreeFilter } from "@/components/inventory/CategoryTreeFilter";
import type { InventoryCategoryRow } from "@/lib/inventory/categories";

type SupplierOption = {
  id: string;
  name: string | null;
};

type SiteOption = {
  id: string;
  name: string | null;
};

type CatalogFiltersPanelProps = {
  activeTab: string;
  siteId: string;
  categoryKind: string;
  searchQuery: string;
  showDisabled: boolean;
  clearHref: string;
  hasAdvancedFilters: boolean;
  categoryScope: string;
  stockAlert: string;
  viewMode: string;
  effectiveSupplierId: string;
  suppliers: SupplierOption[];
  categorySiteId: string;
  sites: SiteOption[];
  showCategoryDomain: boolean;
  categoryDomain: string;
  categoryDomainOptions: Array<{ value: string; label: string }>;
  categoryRows: InventoryCategoryRow[];
  effectiveCategoryId: string;
  siteNamesById: Record<string, string>;
};

export function CatalogFiltersPanel({
  activeTab,
  siteId,
  categoryKind,
  searchQuery,
  showDisabled,
  clearHref,
  hasAdvancedFilters,
  categoryScope,
  stockAlert,
  viewMode,
  effectiveSupplierId,
  suppliers,
  categorySiteId,
  sites,
  showCategoryDomain,
  categoryDomain,
  categoryDomainOptions,
  categoryRows,
  effectiveCategoryId,
  siteNamesById,
}: CatalogFiltersPanelProps) {
  return (
    <div className="mt-4 ui-panel">
      <div className="ui-h3">Filtros operativos</div>
      <form method="get" className="mt-4 grid gap-3">
        <input type="hidden" name="tab" value={activeTab} />
        <input type="hidden" name="site_id" value={siteId} />
        <input type="hidden" name="category_kind" value={categoryKind} />

        <label className="flex flex-col gap-1">
          <span className="ui-label">Buscar SKU o nombre</span>
          <input
            name="q"
            defaultValue={searchQuery}
            placeholder="SKU o nombre de producto"
            className="ui-input"
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-[var(--ui-text)]">
          <input
            type="checkbox"
            name="show_disabled"
            value="1"
            defaultChecked={showDisabled}
          />
          Mostrar deshabilitados
        </label>

        <div className="flex flex-wrap gap-2">
          <button className="ui-btn ui-btn--brand">Aplicar filtros</button>
          <Link href={clearHref} className="ui-btn ui-btn--ghost">
            Limpiar
          </Link>
        </div>

        <details className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
          <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--ui-border)] bg-white/80 px-3 py-2">
            <span className="text-sm font-semibold text-[var(--ui-text)]">Filtros avanzados</span>
            <span className="ui-caption">{hasAdvancedFilters ? "Activos" : "Mostrar"}</span>
          </summary>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Alcance de categoria operativa</span>
              <select name="category_scope" defaultValue={categoryScope} className="ui-input">
                <option value="all">Todas</option>
                <option value="global">Globales</option>
                <option value="site">Sede activa</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Alerta de stock (sede activa)</span>
              <select name="stock_alert" defaultValue={stockAlert} className="ui-input">
                <option value="all">Todos</option>
                <option value="low">Solo bajo minimo</option>
              </select>
              <span className="ui-caption">
                Usa el stock de la sede activa para compras del centro de produccion.
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Vista</span>
              <select name="view_mode" defaultValue={viewMode} className="ui-input">
                <option value="catalogo">Catalogo</option>
                <option value="compras">Compras (ORIGO)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Proveedor</span>
              <select name="supplier_id" defaultValue={effectiveSupplierId} className="ui-input">
                <option value="">Todos</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name ?? supplier.id}
                  </option>
                ))}
              </select>
            </label>

            {categoryScope === "site" ? (
              <label className="flex flex-col gap-1">
                <span className="ui-label">Sede para categoria operativa</span>
                <select name="category_site_id" defaultValue={categorySiteId} className="ui-input">
                  <option value="">Seleccionar sede</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name ?? site.id}
                    </option>
                  ))}
                </select>
                <span className="ui-caption">Solo aplica cuando el alcance es Sede activa.</span>
              </label>
            ) : (
              <input type="hidden" name="category_site_id" value="" />
            )}

            {showCategoryDomain ? (
              <label className="flex flex-col gap-1">
                <span className="ui-label">Dominio operativo</span>
                <select name="category_domain" defaultValue={categoryDomain} className="ui-input">
                  <option value="">Todos</option>
                  {categoryDomainOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="category_domain" value="" />
            )}

            <CategoryTreeFilter
              categories={categoryRows}
              selectedCategoryId={effectiveCategoryId}
              siteNamesById={siteNamesById}
              className="sm:col-span-2 lg:col-span-4"
              label="Categoria operativa"
              emptyOptionLabel="Todas"
              maxVisibleOptions={10}
            />
          </div>
        </details>
      </form>
    </div>
  );
}
