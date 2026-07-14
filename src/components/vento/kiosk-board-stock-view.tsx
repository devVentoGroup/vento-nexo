"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";

type StockPart = {
  qty: number;
  label: string;
  baseQty: number;
  uomProfileId: string;
  imageUrl?: string;
};

type MeasurementMode = "fixed_presentation" | "variable_weight" | "count_with_weight" | "bulk_volume";

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
  measurementMode: MeasurementMode;
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

const KIOSK_INITIAL_LIMIT = 36;
const BOARD_PAGE_SIZE = 36;
const EAGER_IMAGE_COUNT = 12;


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

function isFixedPresentation(item: KioskBoardStockItem) {
  return item.measurementMode === "fixed_presentation";
}

function StockAmount({ item, size = "lg" }: { item: KioskBoardStockItem; size?: "lg" | "sm" }) {
  const presentationParts = Number(item.qty ?? 0) > 0 && isFixedPresentation(item) ? item.presentationParts : [];
  const showBaseQty = presentationParts.length === 0;
  const variableLabel =
    item.measurementMode === "bulk_volume"
      ? "Granel / volumen variable"
      : item.measurementMode === "variable_weight" || item.measurementMode === "count_with_weight"
        ? "Granel / peso variable"
        : "Sin desglose por presentación";

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
                <img
                  src={part.imageUrl}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"

                />
              ) : null}
              {formatQty(part.qty)} {part.label}
            </span>
          ))}
        </div>
      ) : null}
      {showBaseQty ? (
        <div className={size === "lg" ? "text-2xl font-semibold text-[var(--ui-text)]" : "text-lg font-semibold text-[var(--ui-text)]"}>
          {formatQty(item.qty)} {item.unit}
        </div>
      ) : null}
      {showBaseQty ? (
        <div className="text-xs font-semibold text-[var(--ui-muted)]">{variableLabel}</div>
      ) : null}
    </div>
  );
}

function ProductImage({
  item,
  compact = false,
  priority = false,
}: {
  item: KioskBoardStockItem;
  compact?: boolean;
  priority?: boolean;
}) {
  const sizeClass = compact ? "h-16 w-16 rounded-2xl" : "aspect-[4/3] w-full";
  const src = String(item.imageUrl ?? "").trim();
  return (
    <div className={`${sizeClass} overflow-hidden bg-white`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={item.name}
          className="h-full w-full object-contain p-2"
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "low"}

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

function defaultVisibleLimit(isKiosk: boolean) {
  return isKiosk ? KIOSK_INITIAL_LIMIT : Number.MAX_SAFE_INTEGER;
}

function normalizeSearchText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
  const totalCount = typeof totalItemsCount === "number" ? totalItemsCount : items.length;
  const [searchQuery, setSearchQuery] = useState(() => String(initialSearchQuery ?? "").trim());
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [stockTab, setStockTab] = useState<StockTab>(() =>
    searchParams.get("stock_tab") === "out" ? "out" : "available"
  );
  const [viewMode, setViewMode] = useState<ViewMode>(() => normalizeViewMode(initialViewMode, isKiosk));
  const [visibleLimitState, setVisibleLimitState] = useState(() => ({
    key: `${isKiosk ? "kiosk" : "board"}:available:${normalizeSearchText(initialSearchQuery)}`,
    limit: defaultVisibleLimit(isKiosk),
  }));
  const [openingProductId, setOpeningProductId] = useState("");
  const [hidingProductId, setHidingProductId] = useState("");

  const searchableItems = useMemo(
    () =>
      items.map((item) => ({
        item,
        searchText: normalizeSearchText(
          [
            item.name,
            item.unit,
            item.categoryLabel,
            item.categoryPath,
            item.internalLocationLabel,
            ...item.presentationParts.map((part) => part.label),
          ].join(" ")
        ),
      })),
    [items]
  );
  const normalizedSearchQuery = useMemo(() => normalizeSearchText(deferredSearchQuery), [deferredSearchQuery]);
  const availableItems = useMemo(
    () => searchableItems.filter(({ item }) => Number(item.qty ?? 0) > 0),
    [searchableItems]
  );
  const outOfStockItems = useMemo(
    () => searchableItems.filter(({ item }) => Number(item.qty ?? 0) <= 0),
    [searchableItems]
  );
  const filteredAvailableItems = useMemo(
    () =>
      availableItems
        .filter(({ item, searchText }) => !normalizedSearchQuery || searchText.includes(normalizedSearchQuery))
        .map(({ item }) => item),
    [availableItems, normalizedSearchQuery]
  );
  const filteredOutOfStockItems = useMemo(
    () =>
      outOfStockItems
        .filter(({ item, searchText }) => !normalizedSearchQuery || searchText.includes(normalizedSearchQuery))
        .map(({ item }) => item),
    [outOfStockItems, normalizedSearchQuery]
  );
  const filteredItems = stockTab === "out" ? filteredOutOfStockItems : filteredAvailableItems;
  const visibleLimitKey = `${isKiosk ? "kiosk" : "board"}:${stockTab}:${normalizedSearchQuery}`;
  const visibleLimit =
    visibleLimitState.key === visibleLimitKey
      ? visibleLimitState.limit
      : defaultVisibleLimit(isKiosk);
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
              onSubmit={(event) => event.preventDefault()}
              className="flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="kiosk-board-search" className="ui-label">
                  Buscar producto
                </label>

                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-xs font-semibold text-[var(--ui-muted)] underline underline-offset-4"
                  >
                    Limpiar
                  </button>
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
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="min-h-11 flex-1 bg-transparent text-base font-semibold text-[var(--ui-text)] outline-none placeholder:text-[var(--ui-muted)]"
                  placeholder="Buscar por nombre, unidad o ubicación"
                />

                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Limpiar búsqueda"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold text-[var(--ui-muted)] transition hover:bg-slate-50 hover:text-[var(--ui-text)]"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </form>
            <div className="flex rounded-2xl border border-[var(--ui-border)] bg-white p-1 shadow-sm">
              {[
                ["cards", "Tarjetas"],
                ["compact", "Compactas"],
                ["list", "Lista"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setViewMode(value as ViewMode)}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${viewMode === value
                    ? "bg-amber-100 text-amber-950"
                    : "text-[var(--ui-muted)] hover:bg-slate-50 hover:text-[var(--ui-text)]"
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>


          <div className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:justify-between">
            <div className="inline-flex rounded-full border border-[var(--ui-border)] bg-white p-0.5 shadow-sm">
              {([
                ["available", `Disponible (${filteredAvailableItems.length})`],
                ["out", `Sin stock (${filteredOutOfStockItems.length})`],
              ] as Array<[StockTab, string]>).map(([value, label]) => {
                const isActive = stockTab === value;

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStockTab(value)}
                    aria-current={isActive ? "page" : undefined}
                    className={`inline-flex min-h-9 items-center justify-center rounded-full px-3.5 py-1.5 text-xs font-bold leading-none transition ${isActive
                      ? "bg-amber-100 text-amber-950"
                      : "text-[var(--ui-muted)] hover:bg-slate-50 hover:text-[var(--ui-text)]"
                      }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="text-center text-sm text-[var(--ui-muted)] sm:text-right">
              {normalizedSearchQuery
                ? `Mostrando ${visibleItems.length} de ${filteredItems.length} resultado(s).`
                : stockTab === "out"
                  ? `Mostrando ${visibleItems.length} producto(s) sin stock.`
                  : `Mostrando ${visibleItems.length} de ${filteredAvailableItems.length} producto(s) disponibles.`}
            </div>
          </div>
        </div>
      ) : null}

      {filteredItems.length > 0 ? (
        viewMode === "list" ? (
          <div className="overflow-hidden rounded-3xl border border-[var(--ui-border)] bg-white shadow-sm">
            <div className="divide-y divide-slate-200">
              {visibleItems.map((item, index) => (
                <article key={item.productId} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <ProductImage item={item} compact priority={index < EAGER_IMAGE_COUNT} />
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
                          prefetch={false}
                          onClick={() => setOpeningProductId(item.productId)}
                          className={`ui-btn ui-btn--brand mt-3 h-14 px-4 text-base transition active:scale-[0.98] ${openingProductId === item.productId ? "pointer-events-none opacity-80" : ""
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
            {visibleItems.map((item, index) => (
              <article
                key={item.productId}
                className={
                  viewMode === "compact"
                    ? "grid h-full grid-cols-[72px_1fr] gap-3 overflow-hidden rounded-3xl border border-[var(--ui-border)] bg-white p-3 shadow-sm [content-visibility:auto] [contain-intrinsic-size:180px]"
                    : "flex h-full flex-col overflow-hidden rounded-[28px] border border-[var(--ui-border)] bg-white shadow-sm [content-visibility:auto] [contain-intrinsic-size:360px]"
                }
              >
                {viewMode === "compact" ? (
                  <ProductImage item={item} compact priority={index < EAGER_IMAGE_COUNT} />
                ) : (
                  <ProductImage item={item} priority={index < EAGER_IMAGE_COUNT} />
                )}
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
                          prefetch={false}
                          onClick={() => setOpeningProductId(item.productId)}
                          className={`ui-btn ui-btn--brand h-14 w-full px-4 text-base transition active:scale-[0.98] ${openingProductId === item.productId ? "pointer-events-none opacity-80" : ""
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
            onClick={() =>
              setVisibleLimitState((current) => ({
                key: visibleLimitKey,
                limit: (current.key === visibleLimitKey ? current.limit : defaultVisibleLimit(isKiosk)) + BOARD_PAGE_SIZE,
              }))
            }
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
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="ui-btn ui-btn--brand mt-4"
            >
              Limpiar búsqueda
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
