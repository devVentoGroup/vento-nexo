"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useMemo, useRef, useState } from "react";

import { Table, TableCell, TableHeaderCell } from "@/components/vento/standard/table";
import {
  convertByProductProfile,
  normalizeUnitCode,
  selectProductUomProfileForContext,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  stockUnitCode?: string | null;
  profiles?: ProductUomProfile[];
};

type InternalPositionOption = {
  id: string;
  label: string;
};

type CountEntry = {
  id: string;
  rawQuantity: string;
  positionId: string;
};

type CountLine = {
  product_id: string;
  quantity: number;
  input_quantity: number;
  input_unit_code: string;
  stock_unit_code: string;
  position_id?: string;
};

type Props = {
  products: Product[];
  siteId: string;
  siteName: string;
  countScopeLabel?: string;
  zoneOrLocNote?: string;
  internalPositions?: InternalPositionOption[];
};

type CountRowProps = {
  product: Product;
  compactMode: boolean;
  entries: CountEntry[];
  qtyPositive: boolean;
  internalPositions: InternalPositionOption[];
  onEntryQtyChange: (productId: string, entryId: string, rawValue: string) => void;
  onEntryPositionChange: (productId: string, entryId: string, positionId: string) => void;
  onAddEntry: (productId: string) => void;
  onRemoveEntry: (productId: string, entryId: string) => void;
  onSetEntryZero: (productId: string, entryId: string) => void;
  onClear: (productId: string) => void;
  onQtyKeyDown: (event: React.KeyboardEvent<HTMLInputElement>, productId: string) => void;
  registerInputRef: (productId: string, element: HTMLInputElement | null) => void;
};

function parseQty(value: string | undefined) {
  const v = String(value ?? "").trim().replace(",", ".");
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function makeDefaultEntry(productId: string): CountEntry {
  return {
    id: `${productId}:base`,
    rawQuantity: "",
    positionId: "",
  };
}

function makeNewEntry(productId: string): CountEntry {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}:${Math.random().toString(36).slice(2)}`;

  return {
    id: `${productId}:${randomId}`,
    rawQuantity: "",
    positionId: "",
  };
}

function getCaptureConfig(product: Product) {
  const stockUnitCode = normalizeUnitCode(product.stockUnitCode ?? product.unit ?? "un") || "un";
  const profile = selectProductUomProfileForContext({
    profiles: product.profiles ?? [],
    productId: product.id,
    context: "remission",
  });
  const inputUnitCode = normalizeUnitCode(profile?.input_unit_code ?? stockUnitCode) || stockUnitCode;
  const label = String(profile?.label ?? inputUnitCode).trim();
  const conversionLabel = profile
    ? `${profile.qty_in_input_unit} ${inputUnitCode} = ${profile.qty_in_stock_unit} ${stockUnitCode}`
    : `Unidad base: ${stockUnitCode}`;

  return { stockUnitCode, profile, inputUnitCode, label, conversionLabel };
}

const CountRow = memo(function CountRow({
  product,
  compactMode,
  entries,
  qtyPositive,
  internalPositions,
  onEntryQtyChange,
  onEntryPositionChange,
  onAddEntry,
  onRemoveEntry,
  onSetEntryZero,
  onClear,
  onQtyKeyDown,
  registerInputRef,
}: CountRowProps) {
  const capture = getCaptureConfig(product);
  const entryGridClass =
    internalPositions.length > 0
      ? "grid min-w-0 gap-2 xl:grid-cols-[minmax(120px,0.8fr)_minmax(190px,1fr)_auto_auto] xl:items-center"
      : "grid min-w-0 gap-2 xl:grid-cols-[minmax(120px,0.8fr)_auto_auto] xl:items-center";

  return (
    <tr className={`ui-body ${qtyPositive ? "bg-emerald-50/40" : ""}`}>
      <TableCell>
        <div className="space-y-0.5">
          <div className="font-semibold text-[var(--ui-text)]">{product.name}</div>
          {compactMode ? (
            <div className="ui-caption">
              <span className="font-mono">{product.sku ?? "-"}</span> / Conteo: {capture.label} / Base:{" "}
              {capture.stockUnitCode}
            </div>
          ) : null}
        </div>
      </TableCell>
      {!compactMode ? <TableCell className="font-mono">{product.sku ?? "-"}</TableCell> : null}
      {!compactMode ? (
        <TableCell>
          <div className="space-y-1">
            <div className="font-semibold text-[var(--ui-text)]">{capture.label}</div>
            <div className="ui-caption">{capture.conversionLabel}</div>
          </div>
        </TableCell>
      ) : null}
      <TableCell>
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <div key={entry.id} className={entryGridClass}>
              <input
                type="number"
                min={0}
                step="any"
                value={entry.rawQuantity}
                onChange={(event) => onEntryQtyChange(product.id, entry.id, event.target.value)}
                onKeyDown={(event) => onQtyKeyDown(event, product.id)}
                ref={(element) => {
                  if (index === 0) registerInputRef(product.id, element);
                }}
                placeholder={`0 ${capture.label}`}
                className="ui-input min-w-0"
              />
              {internalPositions.length > 0 ? (
                <select
                  value={entry.positionId}
                  onChange={(event) => onEntryPositionChange(product.id, entry.id, event.target.value)}
                  className="ui-input min-w-0"
                >
                  <option value="">Sin ubicacion interna</option>
                  {internalPositions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.label}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                onClick={() => onSetEntryZero(product.id, entry.id)}
                className="ui-btn ui-btn--ghost h-9 px-3 text-xs"
              >
                0
              </button>
              {entries.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onRemoveEntry(product.id, entry.id)}
                  className="ui-btn ui-btn--ghost h-9 px-3 text-xs"
                >
                  Quitar
                </button>
              ) : null}
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            {internalPositions.length > 0 ? (
              <button type="button" onClick={() => onAddEntry(product.id)} className="ui-btn ui-btn--ghost h-9 px-3 text-xs">
                + Otra ubicacion
              </button>
            ) : null}
            <button type="button" onClick={() => onClear(product.id)} className="ui-btn ui-btn--ghost h-9 px-3 text-xs">
              Limpiar producto
            </button>
          </div>
        </div>
      </TableCell>
    </tr>
  );
});

export function CountInitialForm({
  products,
  siteId,
  siteName,
  countScopeLabel,
  zoneOrLocNote,
  internalPositions = [],
}: Props) {
  const router = useRouter();
  const [entriesByProductId, setEntriesByProductId] = useState<Record<string, CountEntry[]>>({});
  const [search, setSearch] = useState("");
  const [onlyWithQty, setOnlyWithQty] = useState(false);
  const [compactMode, setCompactMode] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const getProductEntries = useCallback(
    (productId: string) => {
      const entries = entriesByProductId[productId];
      return entries?.length ? entries : [makeDefaultEntry(productId)];
    },
    [entriesByProductId]
  );

  const qtyByProductId = useMemo(() => {
    const next: Record<string, number> = {};
    for (const product of products) {
      next[product.id] = getProductEntries(product.id).reduce((acc, entry) => acc + parseQty(entry.rawQuantity), 0);
    }
    return next;
  }, [getProductEntries, products]);

  const lines = useMemo(() => {
    const next: CountLine[] = [];
    for (const product of products) {
      const capture = getCaptureConfig(product);
      const entries = getProductEntries(product.id);

      for (const entry of entries) {
        const inputQty = parseQty(entry.rawQuantity);
        if (inputQty <= 0) continue;

        const converted = convertByProductProfile({
          quantityInInput: inputQty,
          inputUnitCode: capture.inputUnitCode,
          stockUnitCode: capture.stockUnitCode,
          profile: capture.profile,
        });

        next.push({
          product_id: product.id,
          quantity: converted.quantityInStock,
          input_quantity: inputQty,
          input_unit_code: capture.inputUnitCode,
          stock_unit_code: capture.stockUnitCode,
          position_id: entry.positionId || undefined,
        });
      }
    }
    return next;
  }, [getProductEntries, products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = products;
    if (query) {
      result = result.filter((product) => {
        const capture = getCaptureConfig(product);
        const haystack = `${product.name ?? ""} ${product.sku ?? ""} ${capture.label} ${capture.stockUnitCode}`.toLowerCase();
        return haystack.includes(query);
      });
    }
    if (onlyWithQty) result = result.filter((product) => (qtyByProductId[product.id] ?? 0) > 0);
    return result;
  }, [onlyWithQty, products, qtyByProductId, search]);

  const totalBaseQty = useMemo(() => lines.reduce((acc, line) => acc + line.quantity, 0), [lines]);
  const filledLineCount = lines.length;
  const filledProductCount = useMemo(
    () => products.filter((product) => (qtyByProductId[product.id] ?? 0) > 0).length,
    [products, qtyByProductId]
  );

  const scopeToneClass = useMemo(() => {
    if (countScopeLabel?.toLowerCase().includes("area")) return "border-emerald-200 bg-emerald-50 text-emerald-900";
    if (countScopeLabel?.toLowerCase().includes("zona")) return "border-cyan-200 bg-cyan-50 text-cyan-900";
    return "border-slate-200 bg-slate-50 text-slate-800";
  }, [countScopeLabel]);

  const searchResultLabel = onlyWithQty
    ? `${filteredProducts.length} con cantidad de ${products.length} producto(s).`
    : `${filteredProducts.length} de ${products.length} producto(s) visibles.`;

  const sortedProducts = useMemo(
    () => [...filteredProducts].sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "es")),
    [filteredProducts]
  );

  const productIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    sortedProducts.forEach((product, index) => {
      map[product.id] = index;
    });
    return map;
  }, [sortedProducts]);

  const handleEntryQtyChange = useCallback((productId: string, entryId: string, rawValue: string) => {
    setEntriesByProductId((state) => {
      const entries = state[productId]?.length ? state[productId] : [makeDefaultEntry(productId)];
      return {
        ...state,
        [productId]: entries.map((entry) => (entry.id === entryId ? { ...entry, rawQuantity: rawValue } : entry)),
      };
    });
  }, []);

  const handleEntryPositionChange = useCallback((productId: string, entryId: string, positionId: string) => {
    setEntriesByProductId((state) => {
      const entries = state[productId]?.length ? state[productId] : [makeDefaultEntry(productId)];
      return {
        ...state,
        [productId]: entries.map((entry) => (entry.id === entryId ? { ...entry, positionId } : entry)),
      };
    });
  }, []);

  const addProductEntry = useCallback((productId: string) => {
    setEntriesByProductId((state) => {
      const entries = state[productId]?.length ? state[productId] : [makeDefaultEntry(productId)];
      return {
        ...state,
        [productId]: [...entries, makeNewEntry(productId)],
      };
    });
  }, []);

  const removeProductEntry = useCallback((productId: string, entryId: string) => {
    setEntriesByProductId((state) => {
      const entries = state[productId]?.length ? state[productId] : [makeDefaultEntry(productId)];
      const nextEntries = entries.filter((entry) => entry.id !== entryId);
      return {
        ...state,
        [productId]: nextEntries.length ? nextEntries : [makeDefaultEntry(productId)],
      };
    });
  }, []);

  const clearProductQty = useCallback((productId: string) => {
    setEntriesByProductId((state) => {
      const next = { ...state };
      delete next[productId];
      return next;
    });
  }, []);

  const setProductEntryQtyToZero = useCallback((productId: string, entryId: string) => {
    setEntriesByProductId((state) => {
      const entries = state[productId]?.length ? state[productId] : [makeDefaultEntry(productId)];
      return {
        ...state,
        [productId]: entries.map((entry) => (entry.id === entryId ? { ...entry, rawQuantity: "0" } : entry)),
      };
    });
  }, []);

  const focusQtyByOffset = useCallback(
    (productId: string, offset: number) => {
      const currentIndex = productIndexMap[productId];
      if (typeof currentIndex !== "number") return;
      const nextId = sortedProducts[currentIndex + offset]?.id;
      if (!nextId) return;
      qtyInputRefs.current[nextId]?.focus();
      qtyInputRefs.current[nextId]?.select();
    },
    [productIndexMap, sortedProducts]
  );

  const handleQtyKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>, productId: string) => {
      if (event.key === "Enter" || event.key === "ArrowDown") {
        event.preventDefault();
        focusQtyByOffset(productId, 1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusQtyByOffset(productId, -1);
      }
    },
    [focusQtyByOffset]
  );

  const registerInputRef = useCallback((productId: string, element: HTMLInputElement | null) => {
    qtyInputRefs.current[productId] = element;
  }, []);

  const openConfirm = () => {
    if (lines.length === 0) {
      setError("Ingresa al menos una cantidad mayor a 0.");
      return;
    }
    setError("");
    setShowConfirm(true);
  };

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
    } catch {
      setError("Error de red al guardar.");
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="space-y-6 pb-24 lg:pb-0">
        <section className="ui-panel ui-remission-section ui-fade-up ui-delay-3 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="ui-h3">Conteo</div>
              <div className="ui-caption mt-1">
                Captura en la presentacion visible. El sistema convierte a unidad base para guardar inventario.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-900">{siteName}</span>
              {countScopeLabel ? <span className={`rounded-full border px-3 py-1 ${scopeToneClass}`}>{countScopeLabel}</span> : null}
              {internalPositions.length > 0 ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-900">
                  Ubicacion interna activa
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2">
              <div className="ui-caption">Productos con cantidad</div>
              <div className="text-lg font-semibold text-[var(--ui-text)]">{filledProductCount}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2">
              <div className="ui-caption">Lineas contadas</div>
              <div className="text-lg font-semibold text-[var(--ui-text)]">{filledLineCount}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2">
              <div className="ui-caption">Cantidad base</div>
              <div className="text-lg font-semibold text-[var(--ui-text)]">{totalBaseQty}</div>
            </div>
          </div>

          <div className="overflow-x-auto ui-scrollbar-subtle">
            <div className="mb-3 space-y-2">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-[240px] flex-1 flex-col gap-1">
                  <span className="ui-label">Buscar SKU, nombre o unidad</span>
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Producto, SKU, caja, bolsa..."
                    className="ui-input"
                  />
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2 text-sm text-[var(--ui-text)]">
                  <input type="checkbox" checked={onlyWithQty} onChange={(event) => setOnlyWithQty(event.target.checked)} />
                  Solo con cantidad
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2 text-sm text-[var(--ui-text)]">
                  <input type="checkbox" checked={compactMode} onChange={(event) => setCompactMode(event.target.checked)} />
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
                  {!compactMode ? <TableHeaderCell>Unidad de conteo</TableHeaderCell> : null}
                  <TableHeaderCell>Cantidad / ubicacion</TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((product) => (
                  <CountRow
                    key={product.id}
                    product={product}
                    compactMode={compactMode}
                    entries={getProductEntries(product.id)}
                    qtyPositive={(qtyByProductId[product.id] ?? 0) > 0}
                    internalPositions={internalPositions}
                    onEntryQtyChange={handleEntryQtyChange}
                    onEntryPositionChange={handleEntryPositionChange}
                    onAddEntry={addProductEntry}
                    onRemoveEntry={removeProductEntry}
                    onSetEntryZero={setProductEntryQtyToZero}
                    onClear={clearProductQty}
                    onQtyKeyDown={handleQtyKeyDown}
                    registerInputRef={registerInputRef}
                  />
                ))}
                {sortedProducts.length === 0 ? (
                  <tr>
                    <TableCell colSpan={compactMode ? 2 : 4}>No hay productos para esa busqueda.</TableCell>
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
            {countScopeLabel ? ` / ${countScopeLabel}` : ""}
            {lines.length > 0 ? ` / ${lines.length} linea(s) con cantidad` : ""}
          </div>
          <Link href={`/inventory/count-initial?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
            Limpiar
          </Link>
          <button type="button" onClick={openConfirm} disabled={loading} className="ui-btn ui-btn--brand disabled:opacity-50">
            {loading ? "Guardando..." : "Confirmar conteo"}
          </button>
        </div>
      </div>

      {showConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--ui-border)] bg-white p-5 shadow-[var(--ui-shadow-2)]">
            <div className="ui-h3">Resumen final de conteo</div>
            <p className="mt-1 ui-body-muted">Revisa estas lineas antes de guardar. Puedes cerrar este cuadro para ajustar cantidades.</p>
            <div className="mt-4 max-h-[50vh] overflow-auto rounded-xl border border-[var(--ui-border)]">
              <Table>
                <thead>
                  <tr>
                    <TableHeaderCell>Producto</TableHeaderCell>
                    <TableHeaderCell>Conteo</TableHeaderCell>
                    <TableHeaderCell>Base</TableHeaderCell>
                    {internalPositions.length > 0 ? <TableHeaderCell>Ubicacion interna</TableHeaderCell> : null}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const product = products.find((p) => p.id === line.product_id);
                    return (
                      <tr key={`${line.product_id}:${line.position_id ?? "sin-ubicacion"}:${index}`} className="ui-body">
                        <TableCell>{product?.name ?? line.product_id}</TableCell>
                        <TableCell className="font-mono">
                          {line.input_quantity} {line.input_unit_code}
                        </TableCell>
                        <TableCell className="font-mono">
                          {line.quantity} {line.stock_unit_code}
                        </TableCell>
                        {internalPositions.length > 0 ? (
                          <TableCell>{internalPositions.find((position) => position.id === line.position_id)?.label ?? "-"}</TableCell>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="ui-caption">
                {filledLineCount} linea(s) / {filledProductCount} producto(s) / {totalBaseQty} base
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowConfirm(false)} className="ui-btn ui-btn--ghost" disabled={loading}>
                  Seguir editando
                </button>
                <button type="button" onClick={handleConfirm} className="ui-btn ui-btn--brand" disabled={loading}>
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