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

type FilterRadioOption = {
  value: string;
  label: string;
  caption?: string;
};

type FilterRadioGroupProps = {
  label: string;
  name: string;
  value: string;
  options: FilterRadioOption[];
  className?: string;
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

function getSelectedLabel<T extends { id: string; name: string | null }>(
  rows: T[],
  selectedId: string,
  fallback = "Seleccionado",
): string {
  if (!selectedId) return "";
  const selected = rows.find((row) => row.id === selectedId);
  return selected?.name ?? selected?.id ?? fallback;
}

function getSelectedValueLabel(
  rows: Array<{ value: string; label: string }>,
  selectedValue: string,
  fallback = "Seleccionado",
): string {
  if (!selectedValue) return "";
  const selected = rows.find((row) => row.value === selectedValue);
  return selected?.label ?? fallback;
}

function FilterRadioGroup({
  label,
  name,
  value,
  options,
  className = "",
}: FilterRadioGroupProps) {
  return (
    <fieldset className={`grid gap-2 ${className}`.trim()}>
      <legend className="ui-label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={value === option.value}
              className="peer sr-only"
            />
            <span className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[var(--ui-border)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--ui-text)] shadow-sm transition hover:border-[color:var(--ui-brand)]/50 hover:bg-[var(--ui-surface)] peer-checked:border-[color:var(--ui-brand)]/50 peer-checked:bg-[color:var(--ui-brand)]/10 peer-checked:text-[var(--ui-brand)]">
              {option.label}
              {option.caption ? (
                <span className="text-[11px] font-medium text-[var(--ui-muted)]">
                  {option.caption}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

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
  const effectiveCategoryScope = categoryScope || "all";
  const effectiveStockAlert = stockAlert || "all";
  const effectiveViewMode = viewMode || "catalogo";

  const selectedSupplierLabel = getSelectedLabel(suppliers, effectiveSupplierId, "Proveedor");
  const selectedSiteLabel = getSelectedLabel(sites, categorySiteId, "Sede");
  const selectedDomainLabel = getSelectedValueLabel(
    categoryDomainOptions,
    categoryDomain,
    "Dominio",
  );
  const selectedCategoryLabel =
    categoryRows.find((row) => row.id === effectiveCategoryId)?.name ?? "Categoría";

  const activeFilterLabels = [
    showDisabled ? "Deshabilitados" : null,
    !isAssetCatalogTab && effectiveStockAlert === "low" ? "Stock bajo" : null,
    !isAssetCatalogTab && effectiveViewMode === "compras" ? "Compras ORIGO" : null,
    !isAssetCatalogTab && effectiveSupplierId
      ? `Proveedor: ${selectedSupplierLabel}`
      : null,
    effectiveCategoryScope === "global" ? "Categorías globales" : null,
    effectiveCategoryScope === "site" ? "Categorías por sede" : null,
    effectiveCategoryScope === "site" && categorySiteId ? `Sede: ${selectedSiteLabel}` : null,
    showCategoryDomain && categoryDomain ? `Dominio: ${selectedDomainLabel}` : null,
    effectiveCategoryId ? `Categoría: ${selectedCategoryLabel}` : null,
  ].filter(Boolean) as string[];

  const hasAnyFilters = hasAdvancedFilters || activeFilterLabels.length > 0;
  const activeStatusLabel = activeFilterLabels.length
    ? `${activeFilterLabels.length} activo${activeFilterLabels.length === 1 ? "" : "s"}`
    : hasAnyFilters
      ? "Activos"
      : "Sin filtros";
  const shouldOpenMoreOptions =
    showDisabled ||
    effectiveCategoryScope !== "all" ||
    Boolean(showCategoryDomain && categoryDomain);
  const shouldShowSupplier = !isAssetCatalogTab && (effectiveViewMode === "compras" || effectiveSupplierId);

  return (
    <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="ui-h3">
            {isAssetCatalogTab ? "Afinar modelos" : "Afinar catálogo"}
          </div>
          <p className="ui-caption mt-1">
            Usa solo lo operativo: vista, stock, proveedor y categoría.
          </p>
        </div>
        <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
          {activeStatusLabel}
        </span>
      </div>

      {activeFilterLabels.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeFilterLabels.map((label) => (
            <span
              key={label}
              className="rounded-full border border-[color:var(--ui-brand)]/25 bg-[color:var(--ui-brand)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--ui-brand)]"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}

      <form method="get" className="mt-4 grid gap-4">
        <input type="hidden" name="tab" value={activeTab} />
        <input type="hidden" name="site_id" value={isAssetCatalogTab ? "" : siteId} />
        <input type="hidden" name="category_kind" value={categoryKind} />
        <input type="hidden" name="q" value={searchQuery} />

        {isAssetCatalogTab ? (
          <>
            <input type="hidden" name="stock_alert" value="all" />
            <input type="hidden" name="view_mode" value="catalogo" />
            <input type="hidden" name="supplier_id" value="" />
          </>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <FilterRadioGroup
              label="Vista"
              name="view_mode"
              value={effectiveViewMode}
              options={[
                { value: "catalogo", label: "Catálogo" },
                { value: "compras", label: "Compras", caption: "ORIGO" },
              ]}
            />

            <FilterRadioGroup
              label="Stock"
              name="stock_alert"
              value={effectiveStockAlert}
              options={[
                { value: "all", label: "Todos" },
                { value: "low", label: "Bajo mínimo" },
              ]}
            />
          </div>
        )}

        {shouldShowSupplier ? (
          <label className="grid gap-1 lg:max-w-md">
            <span className="ui-label">Proveedor</span>
            <select name="supplier_id" defaultValue={effectiveSupplierId} className="ui-input">
              <option value="">Todos los proveedores</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name ?? supplier.id}
                </option>
              ))}
            </select>
          </label>
        ) : isAssetCatalogTab ? null : (
          <input type="hidden" name="supplier_id" value="" />
        )}

        <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
          <CategoryTreeFilter
            categories={categoryRows}
            selectedCategoryId={effectiveCategoryId}
            siteNamesById={siteNamesById}
            label={isAssetCatalogTab ? "Categoría patrimonial" : "Categoría"}
            emptyOptionLabel={isAssetCatalogTab ? "Todas las categorías patrimoniales" : "Todas"}
            maxVisibleOptions={6}
          />
        </div>

        <details
          open={shouldOpenMoreOptions}
          className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)]"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-[var(--ui-text)]">
            <span>Más opciones</span>
            <span className="ui-caption">Alcance, sede, dominio y deshabilitados</span>
          </summary>

          <div className="grid gap-3 border-t border-[var(--ui-border)] p-3 lg:grid-cols-2">
            <FilterRadioGroup
              label={isAssetCatalogTab ? "Alcance patrimonial" : "Alcance de categorías"}
              name="category_scope"
              value={effectiveCategoryScope}
              options={[
                { value: "all", label: "Todas" },
                { value: "global", label: "Globales" },
                { value: "site", label: isAssetCatalogTab ? "Por sede" : "Sede activa" },
              ]}
              className="lg:col-span-2"
            />

            {effectiveCategoryScope === "site" ? (
              <label className="grid gap-1">
                <span className="ui-label">Sede de categoría</span>
                <select name="category_site_id" defaultValue={categorySiteId} className="ui-input">
                  <option value="">Seleccionar sede</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name ?? site.id}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="category_site_id" value="" />
            )}

            {showCategoryDomain ? (
              <label className="grid gap-1">
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

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--ui-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ui-text)] lg:self-end lg:justify-self-start">
              <input
                type="checkbox"
                name="show_disabled"
                value="1"
                defaultChecked={showDisabled}
              />
              Mostrar deshabilitados
            </label>
          </div>
        </details>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--ui-border)] pt-3">
          <Link href={clearHref} className="ui-btn ui-btn--ghost">
            Limpiar
          </Link>
          <button className="ui-btn ui-btn--brand">Aplicar</button>
        </div>
      </form>
    </div>
  );
}
