"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Table, TableCell, TableHeaderCell } from "@/components/vento/standard/table";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
};

type Props = {
  products: Product[];
  siteId: string;
  siteName: string;
  countScopeLabel?: string;
  zoneOrLocNote?: string;
};

type CountRowProps = {
  product: Product;
  compactMode: boolean;
  value: string;
  qtyPositive: boolean;
  onQtyChange: (productId: string, rawValue: string) => void;
  onSetZero: (productId: string) => void;
  onClear: (productId: string) => void;
  onQtyKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>,
    productId: string
  ) => void;
  registerInputRef: (productId: string, element: HTMLInputElement | null) => void;
};

const CountRow = memo(function CountRow({
  product,
  compactMode,
  value,
  qtyPositive,
  onQtyChange,
  onSetZero,
  onClear,
  onQtyKeyDown,
  registerInputRef,
}: CountRowProps) {
  return (
    <tr className={`ui-body ${qtyPositive ? "bg-emerald-50/40" : ""}`}>
      <TableCell>
        <div className="space-y-0.5">
          <div>{product.name}</div>
          {compactMode ? (
            <div className="ui-caption">
              <span className="font-mono">{product.sku ?? "-"}</span> · {product.unit ?? "-"}
            </div>
          ) : null}
        </div>
      </TableCell>
      {!compactMode ? <TableCell className="font-mono">{product.sku ?? "-"}</TableCell> : null}
      {!compactMode ? <TableCell>{product.unit ?? "-"}</TableCell> : null}
      <TableCell>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step="any"
            value={value}
            onChange={(event) => onQtyChange(product.id, event.target.value)}
            onKeyDown={(event) => onQtyKeyDown(event, product.id)}
            ref={(element) => {
              registerInputRef(product.id, element);
            }}
            placeholder="0"
            className="ui-input min-w-[110px]"
          />
          <button
            type="button"
            onClick={() => onSetZero(product.id)}
            className="ui-btn ui-btn--ghost h-9 px-3 text-xs"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => onClear(product.id)}
            className="ui-btn ui-btn--ghost h-9 px-3 text-xs"
          >
            Limpiar
          </button>
        </div>
      </TableCell>
    </tr>
  );
});

function parseQty(value: string | undefined) {
  const v = String(value ?? "").trim();
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function CountInitialForm({
  products,
  siteId,
  siteName,
  countScopeLabel,
  zoneOrLocNote,
}: Props) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [onlyWithQty, setOnlyWithQty] = useState(false);
  const [compactMode, setCompactMode] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const qtyByProductId = useMemo(() => {
    const next: Record<string, number> = {};
    for (const [productId, raw] of Object.entries(qty)) {
      next[productId] = parseQty(raw);
    }
    return next;
  }, [qty]);

  const lines = products
    .map((p) => ({ product_id: p.id, quantity: qtyByProductId[p.id] ?? 0 }))
    .filter((line) => line.quantity > 0);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = products;
    if (query) {
      result = result.filter((product) => {
        const name = String(product.name ?? "").toLowerCase();
        const sku = String(product.sku ?? "").toLowerCase();
        return name.includes(query) || sku.includes(query);
      });
    }
    if (onlyWithQty) {
      result = result.filter((product) => (qtyByProductId[product.id] ?? 0) > 0);
    }
    return result;
  }, [products, search, onlyWithQty, qtyByProductId]);

  const totalCountedQty = useMemo(() => {
    return products.reduce((acc, product) => acc + (qtyByProductId[product.id] ?? 0), 0);
  }, [products, qtyByProductId]);

  const filledCount = lines.length;

  const scopeToneClass = useMemo(() => {
    if (countScopeLabel?.toLowerCase().includes("loc")) return "border-emerald-200 bg-emerald-50 text-emerald-900";
    if (countScopeLabel?.toLowerCase().includes("zona")) return "border-cyan-200 bg-cyan-50 text-cyan-900";
    return "border-slate-200 bg-slate-50 text-slate-800";
  }, [countScopeLabel]);

  const searchResultLabel = useMemo(() => {
    if (onlyWithQty) {
      return `${filteredProducts.length} con cantidad de ${products.length} producto(s).`;
    }
    return `${filteredProducts.length} de ${products.length} producto(s) visibles.`;
  }, [filteredProducts.length, onlyWithQty, products.length]);

  const handleQtyChange = useCallback((productId: string, rawValue: string) => {
    setQty((state) => ({ ...state, [productId]: rawValue }));
  }, []);

  const clearProductQty = useCallback((productId: string) => {
    setQty((state) => ({ ...state, [productId]: "" }));
  }, []);

  const setProductQtyToZero = useCallback((productId: string) => {
    setQty((state) => ({ ...state, [productId]: "0" }));
  }, []);

  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) =>
      String(a.name ?? "").localeCompare(String(b.name ?? ""), "es")
    );
  }, [filteredProducts]);

  const productIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    sortedProducts.forEach((product, index) => {
      map[product.id] = index;
    });
    return map;
  }, [sortedProducts]);

  const focusQtyByOffset = useCallback((productId: string, offset: number) => {
    const currentIndex = productIndexMap[productId];
    if (typeof currentIndex !== "number") return;
    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= sortedProducts.length) return;
    const nextId = sortedProducts[nextIndex]?.id;
    if (!nextId) return;
    const input = qtyInputRefs.current[nextId];
    if (!input) return;
    input.focus();
    input.select();
  }, [productIndexMap, sortedProducts]);

  const handleQtyKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLInputElement>,
    productId: string
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      focusQtyByOffset(productId, 1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusQtyByOffset(productId, 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusQtyByOffset(productId, -1);
    }
  }, [focusQtyByOffset]);

  const registerInputRef = useCallback((productId: string, element: HTMLInputElement | null) => {
    qtyInputRefs.current[productId] = element;
  }, []);

  const handleConfirm = async () => {
    if (lines.length === 0) {
      setError("Ingresa al menos una cantidad mayor a 0.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/count-initial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          lines,
          scope_note: zoneOrLocNote ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Error al guardar el conteo.");
        setLoading(false);
        return;
      }
      if (data?.countSessionId && !data?.applied) {
        router.push(`/inventory/count-initial/session/${encodeURIComponent(data.countSessionId)}`);
        return;
      }
      router.push(`/inventory/stock?site_id=${encodeURIComponent(siteId)}&count_initial=1`);
      return;
    } catch {
      setError("Error de red al guardar.");
      setLoading(false);
    }
  };

  const openConfirm = () => {
    if (lines.length === 0) {
      setError("Ingresa al menos una cantidad mayor a 0.");
      return;
    }
    setError("");
    setShowConfirm(true);
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="space-y-6 pb-24 lg:pb-0">
        <section className="ui-panel ui-remission-section ui-fade-up ui-delay-3 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="ui-h3">Conteo</div>
              <div className="ui-caption mt-1">
                Captura cantidades reales. Puedes buscar, filtrar y revisar un resumen en vivo antes de confirmar.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-900">
                {siteName}
              </span>
              {countScopeLabel ? (
                <span className={`rounded-full border px-3 py-1 ${scopeToneClass}`}>
                  {countScopeLabel}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2">
              <div className="ui-caption">Productos con cantidad</div>
              <div className="text-lg font-semibold text-[var(--ui-text)]">{filledCount}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2">
              <div className="ui-caption">Unidades contadas</div>
              <div className="text-lg font-semibold text-[var(--ui-text)]">{totalCountedQty}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2">
              <div className="ui-caption">Ámbito activo</div>
              <div className="text-sm font-semibold text-[var(--ui-text)]">{countScopeLabel || "Sede completa"}</div>
            </div>
          </div>

          <div className="overflow-x-auto ui-scrollbar-subtle">
            <div className="mb-3 space-y-2">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-[240px] flex-1 flex-col gap-1">
                  <span className="ui-label">Buscar SKU o nombre</span>
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="SKU o nombre de producto"
                    className="ui-input"
                  />
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2 text-sm text-[var(--ui-text)]">
                  <input
                    type="checkbox"
                    checked={onlyWithQty}
                    onChange={(event) => setOnlyWithQty(event.target.checked)}
                  />
                  Solo con cantidad
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2 text-sm text-[var(--ui-text)]">
                  <input
                    type="checkbox"
                    checked={compactMode}
                    onChange={(event) => setCompactMode(event.target.checked)}
                  />
                  Modo compacto
                </label>
              </div>
              <p className="ui-caption">{searchResultLabel}</p>
            </div>
            <Table>
              <thead>
                <tr>
                  <TableHeaderCell>Producto</TableHeaderCell>
                  {!compactMode ? <TableHeaderCell>SKU</TableHeaderCell> : null}
                  {!compactMode ? <TableHeaderCell>Unidad</TableHeaderCell> : null}
                  <TableHeaderCell className="w-52">Cantidad</TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((product) => (
                  <CountRow
                    key={product.id}
                    product={product}
                    compactMode={compactMode}
                    value={qty[product.id] ?? ""}
                    qtyPositive={(qtyByProductId[product.id] ?? 0) > 0}
                    onQtyChange={handleQtyChange}
                    onSetZero={setProductQtyToZero}
                    onClear={clearProductQty}
                    onQtyKeyDown={handleQtyKeyDown}
                    registerInputRef={registerInputRef}
                  />
                ))}
                {sortedProducts.length === 0 ? (
                  <tr>
                    <TableCell colSpan={compactMode ? 2 : 4}>No hay productos para esa búsqueda.</TableCell>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </div>
          {error ? <div className="ui-alert ui-alert--error">{error}</div> : null}
        </section>

        <div className="ui-mobile-sticky-footer ui-fade-up ui-delay-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] bg-white/92 px-4 py-3 backdrop-blur">
          <div className="text-sm text-[var(--ui-muted)]">
            {siteName}
            {countScopeLabel ? ` · ${countScopeLabel}` : ""}
            {lines.length > 0 ? ` · ${lines.length} con cantidad` : ""}
          </div>
          <Link href={`/inventory/count-initial?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
            Limpiar
          </Link>
          <button
            type="button"
            onClick={openConfirm}
            disabled={loading}
            className="ui-btn ui-btn--brand disabled:opacity-50"
          >
            {loading ? "Guardando..." : "Confirmar conteo"}
          </button>
        </div>
      </div>

      {showConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-2)]">
            <div className="ui-h3">Resumen final de conteo</div>
            <p className="mt-1 ui-body-muted">
              Revisa estas líneas antes de guardar. Puedes cerrar este cuadro para ajustar cantidades.
            </p>
            <div className="mt-4 max-h-[50vh] overflow-auto rounded-xl border border-[var(--ui-border)]">
              <Table>
                <thead>
                  <tr>
                    <TableHeaderCell>Producto</TableHeaderCell>
                    <TableHeaderCell>Unidad</TableHeaderCell>
                    <TableHeaderCell>Cantidad</TableHeaderCell>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const product = products.find((p) => p.id === line.product_id);
                    return (
                      <tr key={line.product_id} className="ui-body">
                        <TableCell>{product?.name ?? line.product_id}</TableCell>
                        <TableCell>{product?.unit ?? "-"}</TableCell>
                        <TableCell className="font-mono">{line.quantity}</TableCell>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="ui-caption">
                {lines.length} producto(s) · {totalCountedQty} unidades
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="ui-btn ui-btn--ghost"
                  disabled={loading}
                >
                  Seguir editando
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="ui-btn ui-btn--brand"
                  disabled={loading}
                >
                  {loading ? "Guardando..." : "Guardar conteo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
