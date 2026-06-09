"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type StockPart = {
  qty: number;
  label: string;
  baseQty: number;
  uomProfileId: string;
  imageUrl?: string;
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
  internalLocationLabel: string;
  presentationParts: StockPart[];
};

type Props = {
  items: KioskBoardStockItem[];
  isKiosk: boolean;
  locationId: string;
  positionId?: string;
  initialViewMode?: string;
  initialSearchQuery?: string;
  totalItemsCount?: number;
  hideZeroStockAction?: (formData: FormData) => void | Promise<void>;
};

type ViewMode = "cards" | "compact" | "list";
type StockTab = "available" | "out";


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

function stockStatusLabel(value: number) {
  if (value <= 0) return "Sin stock";
  if (value <= 3) return "Bajo";
  return "Disponible";
}

function StockAmount({ item, size = "lg" }: { item: KioskBoardStockItem; size?: "lg" | "sm" }) {
  const presentationParts = Number(item.qty ?? 0) > 0 ? item.presentationParts : [];

  return (
    <div className={size === "lg" ? "min-h-[3.75rem] space-y-1" : "min-h-[3.25rem] space-y-1"}>
      {presentationParts.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 text-sm font-medium text-[var(--ui-text)]">
          {presentationParts.map((part) => (
            <span
              key={`${item.productId}-${part.uomProfileId}`}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-950"
            >
              {part.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={part.imageUrl} alt="" className="h-6 w-6 rounded-full object-cover" loading="lazy" />
              ) : null}
              {formatQty(part.qty)} {part.label}
            </span>
          ))}
        </div>
      ) : (
        <div className={size === "lg" ? "text-2xl font-semibold text-[var(--ui-text)]" : "text-lg font-semibold text-[var(--ui-text)]"}>
          {formatQty(item.qty)} {item.unit}
        </div>
      )}
      {presentationParts.length === 0 ? (
        <div className="text-xs font-semibold text-[var(--ui-muted)]">Sin desglose por presentación</div>
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
        <img
          src={item.imageUrl}
          alt={item.name}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
        />
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
  stockTab?: StockTab;
  searchQuery?: string;
}) {
  const search = new URLSearchParams();
  const searchQuery = String(params.searchQuery ?? "").trim();

  if (params.isKiosk) search.set("kiosk", "1");
  if (params.positionId) search.set("position_id", params.positionId);
  if (params.viewMode) search.set("view", params.viewMode);
  if (params.stockTab) search.set("stock_tab", params.stockTab);
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

function HideZeroStockButton({
  action,
  item,
  locationId,
  returnTo,
  isSubmitting,
  onSubmit,
}: {
  action?: (formData: FormData) => void | Promise<void>;
  item: KioskBoardStockItem;
  locationId: string;
  returnTo: string;
  isSubmitting: boolean;
  onSubmit: () => void;
}) {
  if (!action || item.qty > 0) return null;

  return (
    <form action={action} onSubmit={onSubmit} className="mt-2">
      <input type="hidden" name="location_id" value={locationId} />
      <input type="hidden" name="product_id" value={item.productId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
      >
        {isSubmitting ? "Ocultando..." : "Ocultar de este quiosco"}
      </button>
    </form>
  );
}

export function KioskBoardStockView({
  items,
  isKiosk,
  locationId,
  positionId = "",
  initialViewMode,
  initialSearchQuery = "",
  totalItemsCount,
  hideZeroStockAction,
}: Props) {
  const searchParams = useSearchParams();
  const searchQuery = String(initialSearchQuery ?? "").trim();
  const totalCount = typeof totalItemsCount === "number" ? totalItemsCount : items.length;
  const stockTab: StockTab = searchParams.get("stock_tab") === "out" ? "out" : "available";
  const [viewMode, setViewMode] = useState<ViewMode>(() => normalizeViewMode(initialViewMode, isKiosk));
  const [visibleLimit, setVisibleLimit] = useState(() => (isKiosk ? 48 : Number.MAX_SAFE_INTEGER));
  const [openingProductId, setOpeningProductId] = useState("");
  const [hidingProductId, setHidingProductId] = useState("");

  useEffect(() => {
    setVisibleLimit(isKiosk ? 48 : Number.MAX_SAFE_INTEGER);
  }, [isKiosk, stockTab, searchQuery]);

  const availableItems = items.filter((item) => Number(item.qty ?? 0) > 0);
  const outOfStockItems = items.filter((item) => Number(item.qty ?? 0) <= 0);
  const filteredItems = stockTab === "out" ? outOfStockItems : availableItems;
  const visibleItems = filteredItems.slice(0, visibleLimit);
  const hasMoreItems = visibleItems.length < filteredItems.length;
  const currentBoardHref = buildBoardHref({
    locationId,
    isKiosk,
    positionId,
    viewMode,
    stockTab,
    searchQuery,
  });

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
              <input type="hidden" name="stock_tab" value={stockTab} />

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
                      stockTab,
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
                  placeholder="Buscar por nombre o unidad"
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
                    stockTab,
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


          <div className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:justify-between">
            <div className="inline-flex rounded-full border border-[var(--ui-border)] bg-white p-0.5 shadow-sm">
              {([
                ["available", `Disponible (${availableItems.length})`],
                ["out", `Sin stock (${outOfStockItems.length})`],
              ] as Array<[StockTab, string]>).map(([value, label]) => {
                const isActive = stockTab === value;

                return (
                  <Link
                    key={value}
                    href={buildBoardHref({
                      locationId,
                      isKiosk,
                      positionId,
                      viewMode,
                      stockTab: value,
                      searchQuery,
                    })}
                    aria-current={isActive ? "page" : undefined}
                    className={`inline-flex min-h-9 items-center justify-center rounded-full px-3.5 py-1.5 text-xs font-bold leading-none transition ${isActive
                      ? "bg-amber-100 text-amber-950"
                      : "text-[var(--ui-muted)] hover:bg-slate-50 hover:text-[var(--ui-text)]"
                      }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>

            <div className="text-center text-sm text-[var(--ui-muted)] sm:text-right">
              {searchQuery
                ? `Mostrando ${visibleItems.length} de ${filteredItems.length} resultados.`
                : stockTab === "out"
                  ? `Mostrando ${visibleItems.length} producto(s) sin stock.`
                  : `Mostrando ${visibleItems.length} de ${availableItems.length} producto(s) disponibles.`}
            </div>
          </div>
        </div>
      ) : null}

      {filteredItems.length > 0 ? (
        viewMode === "list" ? (
          <div className="overflow-hidden rounded-3xl border border-[var(--ui-border)] bg-white shadow-sm">
            <div className="divide-y divide-slate-200">
              {visibleItems.map((item) => (
                <article key={item.productId} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <ProductImage item={item} compact />
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-[var(--ui-text)]">{item.name}</div>
                      <div className="mt-1 text-sm text-[var(--ui-muted)]">{item.categoryLabel}</div>
                      {item.internalLocationLabel ? (
                        <div className="mt-1 text-xs font-semibold text-amber-900">{item.internalLocationLabel}</div>
                      ) : null}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <StockAmount item={item} size="sm" />
                    <div className="mt-1 text-xs text-[var(--ui-muted)]">
                      Base: {formatQty(item.qty)} {item.unit}
                    </div>
                    {isKiosk ? (
                      item.qty > 0 ? (
                        <Link
                          href={buildKioskWithdrawHref(locationId, item.productId)}
                          onClick={() => setOpeningProductId(item.productId)}
                          className={`ui-btn ui-btn--brand mt-3 h-14 px-4 text-base ${openingProductId === item.productId ? "pointer-events-none opacity-80" : ""
                            }`}
                          aria-disabled={openingProductId === item.productId}
                        >
                          {openingProductId === item.productId ? "Abriendo..." : "Retirar"}
                        </Link>
                      ) : (
                        <div className="mt-3">
                          <div className="inline-flex h-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 px-4 text-base font-bold text-slate-500">
                            Producto agotado
                          </div>
                          <HideZeroStockButton
                            action={hideZeroStockAction}
                            item={item}
                            locationId={locationId}
                            returnTo={currentBoardHref}
                            isSubmitting={hidingProductId === item.productId}
                            onSubmit={() => setHidingProductId(item.productId)}
                          />
                        </div>
                      )
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className={viewMode === "compact" ? "grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3" : "grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}>
            {visibleItems.map((item) => (
              <article
                key={item.productId}
                className={
                  viewMode === "compact"
                    ? "grid h-full grid-cols-[72px_1fr] gap-3 overflow-hidden rounded-3xl border border-[var(--ui-border)] bg-white p-3 shadow-sm"
                    : "flex h-full flex-col overflow-hidden rounded-[28px] border border-[var(--ui-border)] bg-white shadow-sm"
                }
              >
                {viewMode === "compact" ? <ProductImage item={item} compact /> : <ProductImage item={item} />}
                <div className={viewMode === "compact" ? "flex h-full min-w-0 flex-col gap-2" : "flex flex-1 flex-col gap-3 p-4"}>
                  <div className="line-clamp-2 min-h-10 text-base font-semibold leading-5 text-[var(--ui-text)]">{item.name}</div>
                  <div className="grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="line-clamp-1 text-sm leading-5 text-[var(--ui-muted)]">{item.categoryLabel}</div>
                    <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-bold ${toneForQty(item.qty)}`}>
                      {stockStatusLabel(item.qty)}
                    </span>
                  </div>
                  <div className="min-h-4 text-xs font-semibold leading-4 text-amber-900">
                    {item.internalLocationLabel || ""}
                  </div>
                  <StockAmount item={item} size={viewMode === "compact" ? "sm" : "lg"} />
                  <div className="text-sm text-[var(--ui-muted)]">
                    Base: {formatQty(item.qty)} {item.unit}
                  </div>
                  <div className="mt-auto">
                    {isKiosk ? (
                      item.qty > 0 ? (
                        <Link
                          href={buildKioskWithdrawHref(locationId, item.productId)}
                          onClick={() => setOpeningProductId(item.productId)}
                          className={`ui-btn ui-btn--brand h-14 w-full px-4 text-base ${openingProductId === item.productId ? "pointer-events-none opacity-80" : ""
                            }`}
                          aria-disabled={openingProductId === item.productId}
                        >
                          {openingProductId === item.productId ? "Abriendo..." : "Retirar"}
                        </Link>
                      ) : (
                        <div>
                          <div className="flex h-14 w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 px-4 text-base font-bold text-slate-500">
                            Producto agotado
                          </div>
                          <HideZeroStockButton
                            action={hideZeroStockAction}
                            item={item}
                            locationId={locationId}
                            returnTo={currentBoardHref}
                            isSubmitting={hidingProductId === item.productId}
                            onSubmit={() => setHidingProductId(item.productId)}
                          />
                        </div>
                      )
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      ) : null}

      {hasMoreItems ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            className="ui-btn ui-btn--ghost h-12 px-5 text-base"
            onClick={() => setVisibleLimit((current) => current + 48)}
          >
            Mostrar más productos
          </button>
        </div>
      ) : null}

      {filteredItems.length === 0 ? (
        <div className={`ui-panel ui-remission-section text-center ${isKiosk ? "flex min-h-[35vh] flex-col items-center justify-center" : ""}`}>
          <div className="ui-h3">
            {stockTab === "out" ? "No hay productos sin stock" : "Sin productos visibles"}
          </div>
          <p className="mt-2 ui-body-muted">
            {searchQuery
              ? `No encontramos productos para "${searchQuery}". Limpia la búsqueda o intenta con otra palabra.`
              : stockTab === "out"
                ? "Cuando un producto del LOC quede en cero, aparecerá aquí si la fila de stock se conserva."
                : "Ajusta la búsqueda o revisa la pestaña Sin stock."}
          </p>
          {searchQuery ? (
            <Link
              href={buildBoardHref({
                locationId,
                isKiosk,
                positionId,
                viewMode,
                stockTab,
                searchQuery: "",
              })}
              className="ui-btn ui-btn--brand mt-4"
            >
              Limpiar búsqueda
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
