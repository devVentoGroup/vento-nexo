"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type StockPart = {
  qty: number;
  label: string;
  stockQty: number;
};

export type KioskBoardStockItem = {
  productId: string;
  name: string;
  imageUrl: string;
  qty: number;
  unit: string;
  categoryId: string;
  categoryLabel: string;
  categoryPath: string;
  stockParts: StockPart[];
};

type Props = {
  items: KioskBoardStockItem[];
  isKiosk: boolean;
  locationId: string;
  positionId?: string;
  initialViewMode?: string;
  initialCategoryId?: string;
  initialSearchQuery?: string;
  totalItemsCount?: number;
};

type ViewMode = "cards" | "compact" | "list";

function formatQty(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(n);
}

function toneForQty(value: number) {
  if (value <= 0) return "border-slate-200 bg-slate-100 text-slate-700";
  if (value <= 3) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

function StockAmount({ item, size = "lg" }: { item: KioskBoardStockItem; size?: "lg" | "sm" }) {
  const primaryPart = item.stockParts[0];
  const secondaryParts = item.stockParts.slice(1);

  return (
    <div className={size === "lg" ? "space-y-1" : "space-y-1"}>
      <div className={size === "lg" ? "text-3xl font-semibold text-[var(--ui-text)]" : "text-xl font-semibold text-[var(--ui-text)]"}>
        {formatQty(primaryPart?.qty ?? item.qty)} {primaryPart?.label ?? item.unit}
      </div>
      {secondaryParts.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 text-sm font-medium text-[var(--ui-text)]">
          {secondaryParts.map((part) => (
            <span
              key={`${item.productId}-${part.label}-${part.stockQty}`}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"
            >
              + {formatQty(part.qty)} {part.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProductImage({ item, compact = false }: { item: KioskBoardStockItem; compact?: boolean }) {
  const sizeClass = compact ? "h-16 w-16 rounded-2xl" : "aspect-[4/3] w-full";
  return (
    <div className={`${sizeClass} overflow-hidden bg-[linear-gradient(135deg,rgba(245,158,11,0.14)_0%,rgba(255,255,255,1)_100%)]`}>
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-[var(--ui-muted)]">
          Sin foto
        </div>
      )}
    </div>
  );
}

function buildBoardHref(params: {
  locationId: string;
  isKiosk: boolean;
  positionId?: string;
  viewMode: ViewMode;
  categoryId: string;
  searchQuery?: string;
}) {
  const search = new URLSearchParams();
  const searchQuery = String(params.searchQuery ?? "").trim();

  if (params.isKiosk) search.set("kiosk", "1");
  if (params.positionId) search.set("position_id", params.positionId);
  if (params.viewMode) search.set("view", params.viewMode);
  if (params.categoryId && params.categoryId !== "all") search.set("category_id", params.categoryId);
  if (searchQuery) search.set("search", searchQuery);

  const qs = search.toString();
  return `/inventory/locations/${encodeURIComponent(params.locationId)}/board${qs ? `?${qs}` : ""}`;
}

function buildKioskWithdrawHref(locationId: string, productId: string) {
  const params = new URLSearchParams({ kiosk: "1", product_id: productId });
  return `/inventory/locations/${encodeURIComponent(locationId)}/kiosk-withdraw?${params.toString()}`;
}

function normalizeViewMode(value: string | undefined, isKiosk: boolean): ViewMode {
  if (value === "cards" || value === "compact" || value === "list") return value;
  return isKiosk ? "compact" : "cards";
}

export function KioskBoardStockView({
  items,
  isKiosk,
  locationId,
  positionId = "",
  initialViewMode,
  initialCategoryId,
  initialSearchQuery = "",
  totalItemsCount,
}: Props) {
  const searchQuery = String(initialSearchQuery ?? "").trim();
  const totalCount = typeof totalItemsCount === "number" ? totalItemsCount : items.length;
  const [categoryId, setCategoryId] = useState(initialCategoryId || "all");
  const [viewMode, setViewMode] = useState<ViewMode>(() => normalizeViewMode(initialViewMode, isKiosk));
  const [showCategoryFilters, setShowCategoryFilters] = useState(false);
  const categories = useMemo(() => {
    const map = new Map<string, { id: string; label: string; count: number }>();
    for (const item of items) {
      const id = item.categoryId || "uncategorized";
      const label = item.categoryLabel || "Sin categoria";
      const current = map.get(id) ?? { id, label, count: 0 };
      current.count += 1;
      map.set(id, current);
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [items]);

  const activeCategory = useMemo(() => {
    if (categoryId === "all") return null;
    return categories.find((category) => category.id === categoryId) ?? null;
  }, [categories, categoryId]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (categoryId !== "all") {
        const itemCategory = item.categoryId || "uncategorized";
        if (itemCategory !== categoryId) return false;
      }

      return true;
    });
  }, [categoryId, items]);

  const showTools = isKiosk && totalCount > 0;

  return (
    <section className="space-y-4">
      {showTools ? (
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2 space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <form
              action={`/inventory/locations/${encodeURIComponent(locationId)}/board`}
              method="get"
              className="flex flex-col gap-1"
            >
              {isKiosk ? <input type="hidden" name="kiosk" value="1" /> : null}
              {positionId ? <input type="hidden" name="position_id" value={positionId} /> : null}
              {viewMode ? <input type="hidden" name="view" value={viewMode} /> : null}
              {categoryId && categoryId !== "all" ? (
                <input type="hidden" name="category_id" value={categoryId} />
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <label htmlFor="kiosk-board-search" className="ui-label">
                  Buscar producto
                </label>

                {searchQuery ? (
                  <Link
                    href={buildBoardHref({
                      locationId,
                      isKiosk,
                      positionId,
                      viewMode,
                      categoryId,
                      searchQuery: "",
                    })}
                    className="text-xs font-semibold text-[var(--ui-muted)] underline underline-offset-4"
                  >
                    Limpiar
                  </Link>
                ) : null}
              </div>

              <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-[var(--ui-border)] bg-white px-3 shadow-sm focus-within:border-amber-300 focus-within:ring-2 focus-within:ring-amber-100">
                <input
                  id="kiosk-board-search"
                  name="search"
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  defaultValue={searchQuery}
                  className="min-h-11 flex-1 bg-transparent text-base font-semibold text-[var(--ui-text)] outline-none placeholder:text-[var(--ui-muted)]"
                  placeholder="Buscar por nombre, unidad o categoría"
                />

                <button
                  type="submit"
                  className="ui-btn ui-btn--brand h-10 px-4 text-sm"
                >
                  Buscar
                </button>
              </div>
            </form>
            <div className="flex rounded-2xl border border-[var(--ui-border)] bg-white p-1 shadow-sm">
              {[
                ["cards", "Tarjetas"],
                ["compact", "Compactas"],
                ["list", "Lista"],
              ].map(([value, label]) => (
                <Link
                  key={value}
                  onClick={() => setViewMode(value as ViewMode)}
                  href={buildBoardHref({
                    locationId,
                    isKiosk,
                    positionId,
                    viewMode: value as ViewMode,
                    categoryId,
                    searchQuery,
                  })}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${viewMode === value
                    ? "bg-amber-100 text-amber-950"
                    : "text-[var(--ui-muted)] hover:bg-slate-50 hover:text-[var(--ui-text)]"
                    }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[var(--ui-text)]">Categorias</div>
                <div className="mt-0.5 text-xs text-[var(--ui-muted)]">
                  {activeCategory
                    ? `Activa: ${activeCategory.label} (${activeCategory.count})`
                    : searchQuery
                      ? `Resultados (${items.length}) · ${totalCount} productos totales`
                      : `Todas (${totalCount}) · ${categories.length} categorias disponibles`}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCategoryFilters((value) => !value)}
                aria-expanded={showCategoryFilters}
                className="ui-btn ui-btn--ghost h-9 px-3 text-xs"
              >
                {showCategoryFilters ? "Ocultar filtros" : activeCategory ? "Cambiar" : "Ver filtros"}
              </button>
            </div>

            {activeCategory ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="ui-chip ui-chip--brand">
                  {activeCategory.label} ({activeCategory.count})
                </span>
                <Link
                  onClick={() => {
                    setCategoryId("all");
                    setShowCategoryFilters(false);
                  }}
                  href={buildBoardHref({
                    locationId,
                    isKiosk,
                    positionId,
                    viewMode,
                    categoryId: "all",
                    searchQuery,
                  })}
                  className="ui-chip"
                >
                  Limpiar categoria
                </Link>
              </div>
            ) : null}

            {showCategoryFilters ? (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--ui-border)] pt-3">
                <Link
                  onClick={() => {
                    setCategoryId("all");
                    setShowCategoryFilters(false);
                  }}
                  href={buildBoardHref({
                    locationId,
                    isKiosk,
                    positionId,
                    viewMode,
                    categoryId: "all",
                  })}
                  className={categoryId === "all" ? "ui-chip ui-chip--brand" : "ui-chip"}
                >
                  Todas ({totalCount})
                </Link>
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    onClick={() => {
                      setCategoryId(category.id);
                      setShowCategoryFilters(false);
                    }}
                    href={buildBoardHref({
                      locationId,
                      isKiosk,
                      positionId,
                      viewMode,
                      categoryId: category.id,
                      searchQuery,
                    })}
                    className={categoryId === category.id ? "ui-chip ui-chip--brand" : "ui-chip"}
                  >
                    {category.label} ({category.count})
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          <div className="text-sm text-[var(--ui-muted)]">
            {searchQuery
              ? `Mostrando ${filteredItems.length} resultados de ${totalCount} productos.`
              : `Mostrando ${filteredItems.length} de ${totalCount} productos.`}
          </div>
        </div>
      ) : null}

      {filteredItems.length > 0 ? (
        viewMode === "list" ? (
          <div className="overflow-hidden rounded-3xl border border-[var(--ui-border)] bg-white shadow-sm">
            <div className="divide-y divide-slate-200">
              {filteredItems.map((item) => (
                <article key={item.productId} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <ProductImage item={item} compact />
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-[var(--ui-text)]">{item.name}</div>
                      <div className="mt-1 text-sm text-[var(--ui-muted)]">{item.categoryLabel}</div>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <StockAmount item={item} size="sm" />
                    <div className="mt-1 text-xs text-[var(--ui-muted)]">
                      Base: {formatQty(item.qty)} {item.unit}
                    </div>
                    {isKiosk ? (
                      <a
                        href={buildKioskWithdrawHref(locationId, item.productId)}
                        className="ui-btn ui-btn--brand mt-3 h-14 px-4 text-base"
                      >
                        Retirar
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className={viewMode === "compact" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}>
            {filteredItems.map((item) => (
              <article
                key={item.productId}
                className={
                  viewMode === "compact"
                    ? "grid grid-cols-[72px_1fr] gap-3 overflow-hidden rounded-3xl border border-[var(--ui-border)] bg-white p-3 shadow-sm"
                    : "overflow-hidden rounded-[28px] border border-[var(--ui-border)] bg-white shadow-sm"
                }
              >
                {viewMode === "compact" ? <ProductImage item={item} compact /> : <ProductImage item={item} />}
                <div className={viewMode === "compact" ? "min-w-0 space-y-2" : "space-y-3 p-4"}>
                  <div className="line-clamp-2 text-base font-semibold text-[var(--ui-text)]">{item.name}</div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-sm text-[var(--ui-muted)]">{item.categoryLabel}</div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneForQty(item.qty)}`}>
                      {item.qty <= 3 ? "Bajo" : "Disponible"}
                    </span>
                  </div>
                  <StockAmount item={item} size={viewMode === "compact" ? "sm" : "lg"} />
                  <div className="text-sm text-[var(--ui-muted)]">
                    Base: {formatQty(item.qty)} {item.unit}
                  </div>
                  {isKiosk ? (
                    <a
                      href={buildKioskWithdrawHref(locationId, item.productId)}
                      className="ui-btn ui-btn--brand h-14 w-full px-4 text-base"
                    >
                      Retirar
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )
      ) : (
        <div className={`ui-panel ui-remission-section text-center ${isKiosk ? "flex min-h-[35vh] flex-col items-center justify-center" : ""}`}>
          <div className="ui-h3">Sin productos visibles</div>
          <p className="mt-2 ui-body-muted">
            {searchQuery
              ? `No encontramos productos para "${searchQuery}". Limpia la búsqueda o intenta con otra palabra.`
              : "Ajusta la búsqueda o el filtro de categoría."}
          </p>
          {searchQuery ? (
            <Link
              href={buildBoardHref({
                locationId,
                isKiosk,
                positionId,
                viewMode,
                categoryId,
                searchQuery: "",
              })}
              className="ui-btn ui-btn--brand mt-4"
            >
              Limpiar búsqueda
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
