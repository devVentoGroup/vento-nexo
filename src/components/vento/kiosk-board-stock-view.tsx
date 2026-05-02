"use client";

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

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

export function KioskBoardStockView({ items, isKiosk }: Props) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>(isKiosk ? "compact" : "cards");

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

  const filteredItems = useMemo(() => {
    const needle = normalizeSearch(query);
    return items.filter((item) => {
      if (categoryId !== "all") {
        const itemCategory = item.categoryId || "uncategorized";
        if (itemCategory !== categoryId) return false;
      }
      if (!needle) return true;
      const haystack = normalizeSearch(`${item.name} ${item.unit} ${item.categoryPath}`);
      return haystack.includes(needle);
    });
  }, [categoryId, items, query]);

  const showTools = isKiosk && items.length > 0;

  return (
    <section className="space-y-4">
      {showTools ? (
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2 space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Buscar producto</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="ui-input h-12"
                placeholder="Nombre, unidad o categoria"
              />
            </label>
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
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    viewMode === value
                      ? "bg-amber-100 text-amber-950"
                      : "text-[var(--ui-muted)] hover:bg-slate-50 hover:text-[var(--ui-text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryId("all")}
              className={categoryId === "all" ? "ui-chip ui-chip--brand" : "ui-chip"}
            >
              Todas ({items.length})
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                className={categoryId === category.id ? "ui-chip ui-chip--brand" : "ui-chip"}
              >
                {category.label} ({category.count})
              </button>
            ))}
          </div>

          <div className="text-sm text-[var(--ui-muted)]">
            Mostrando {filteredItems.length} de {items.length} productos.
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
                </div>
              </article>
            ))}
          </div>
        )
      ) : (
        <div className={`ui-panel ui-remission-section text-center ${isKiosk ? "flex min-h-[35vh] flex-col items-center justify-center" : ""}`}>
          <div className="ui-h3">Sin productos visibles</div>
          <p className="mt-2 ui-body-muted">
            Ajusta la busqueda o el filtro de categoria.
          </p>
        </div>
      )}
    </section>
  );
}
