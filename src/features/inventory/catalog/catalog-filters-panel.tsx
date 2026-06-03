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
  const isAssetCatalogTab = activeTab === "equipos";

  return (
    <div className="mt-4 ui-panel">
      <div className="ui-h3">
        {isAssetCatalogTab ? "Filtros de modelos patrimoniales" : "Filtros operativos"}
      </div>
      <form method="get" className="mt-4 grid gap-3">
        <input type="hidden" name="tab" value={activeTab} />
        <input type="hidden" name="site_id" value={isAssetCatalogTab ? "" : siteId} />
        <input type="hidden" name="category_kind" value={categoryKind} />

        <input type="hidden" name="q" value={searchQuery} />

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
            <span className="text-sm font-semibold text-[var(--ui-text)]">
              {isAssetCatalogTab ? "Filtros de catálogo patrimonial" : "Filtros avanzados"}
            </span>
            <span className="ui-caption">{hasAdvancedFilters ? "Activos" : "Mostrar"}</span>
          </summary>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="ui-label">
                {isAssetCatalogTab ? "Alcance de categoría patrimonial" : "Alcance de categoría operativa"}
              </span>
              <select name="category_scope" defaultValue={categoryScope} className="ui-input">
                <option value="all">Todas</option>
                <option value="global">Globales</option>
                <option value="site">{isAssetCatalogTab ? "Por sede" : "Sede activa"}</option>
              </select>
            </label>

            {isAssetCatalogTab ? (
              <>
                <input type="hidden" name="stock_alert" value="all" />
                <input type="hidden" name="view_mode" value="catalogo" />
                <input type="hidden" name="supplier_id" value="" />

                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-950 sm:col-span-2 lg:col-span-3">
                  <div className="font-semibold">Los modelos patrimoniales no usan estos filtros</div>
                  <p className="mt-1 leading-6">
                    Stock bajo, compras ORIGO y proveedor aplican a insumos o productos de reventa.
                    Para unidades reales, ubicación, QR, mantenimiento y conteo usa Activos físicos.
                  </p>
                </div>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1">
                  <span className="ui-label">Alerta de stock (sede activa)</span>
                  <select name="stock_alert" defaultValue={stockAlert} className="ui-input">
                    <option value="all">Todos</option>
                    <option value="low">Solo bajo mínimo</option>
                  </select>
                  <span className="ui-caption">
                    Usa el stock de la sede activa para compras del centro de producción.
                  </span>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="ui-label">Vista</span>
                  <select name="view_mode" defaultValue={viewMode} className="ui-input">
                    <option value="catalogo">Catálogo</option>
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
              </>
            )}

            {categoryScope === "site" ? (
              <label className="flex flex-col gap-1">
                <span className="ui-label">
                  {isAssetCatalogTab ? "Sede para categoría patrimonial" : "Sede para categoría operativa"}
                </span>
                <select name="category_site_id" defaultValue={categorySiteId} className="ui-input">
                  <option value="">Seleccionar sede</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name ?? site.id}
                    </option>
                  ))}
                </select>
                <span className="ui-caption">
                  {isAssetCatalogTab
                    ? "Solo aplica si estás organizando modelos patrimoniales por sede."
                    : "Solo aplica cuando el alcance es Sede activa."}
                </span>
              </label>
            ) : (
              <input type="hidden" name="category_site_id" value="" />
            )}

            {showCategoryDomain ? (
              <label className="flex flex-col gap-1">
                <span className="ui-label">
                  {isAssetCatalogTab ? "Dominio patrimonial" : "Dominio operativo"}
                </span>
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
              label={isAssetCatalogTab ? "Categoría patrimonial" : "Categoría operativa"}
              emptyOptionLabel={isAssetCatalogTab ? "Todas las categorías patrimoniales" : "Todas"}
              maxVisibleOptions={10}
            />
          </div>
        </details>
      </form>
    </div>
  );
}
