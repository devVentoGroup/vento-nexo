"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { CountLocationProductCard } from "./count-location-product-card";
import {
  buildCountLine,
  createCountEntry,
  getCountUnitOptions,
  hasExplicitCount,
  type CountLocationEntry,
  type CountLocationProduct,
  type InternalPositionOption,
} from "./count-location-model";

type Props = {
  products: CountLocationProduct[];
  siteId: string;
  siteName: string;
  locationId: string;
  locationLabel: string;
  positions?: InternalPositionOption[];
};

type Filter = "all" | "pending" | "counted";
const PAGE_SIZE = 30;

export function CountLocationForm({
  products,
  siteId,
  siteName,
  locationId,
  locationLabel,
  positions = [],
}: Props) {
  const router = useRouter();
  const storageKey = `nexo:count-location:${siteId}:${locationId}`;
  const [entries, setEntries] = useState<Record<string, CountLocationEntry[]>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setEntries(JSON.parse(raw));
    } catch {
      window.localStorage.removeItem(storageKey);
    } finally {
      setRestored(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(entries));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [entries, restored, storageKey]);

  const unitOptions = useMemo(
    () => Object.fromEntries(products.map((product) => [product.id, getCountUnitOptions(product)])),
    [products]
  );

  const getEntries = (productId: string) => entries[productId]?.length
    ? entries[productId]
    : [{ ...createCountEntry(productId), id: `${productId}:base` }];

  const countedIds = useMemo(() => new Set(
    products
      .filter((product) => getEntries(product.id).some((entry) => hasExplicitCount(entry.rawQuantity)))
      .map((product) => product.id)
  ), [entries, products]);

  const lines = useMemo(() => products.flatMap((product) =>
    getEntries(product.id).flatMap((entry) => {
      const line = buildCountLine(product, entry, unitOptions[product.id] ?? []);
      return line ? [line] : [];
    })
  ), [entries, products, unitOptions]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      if (query && !`${product.name} ${product.sku ?? ""}`.toLowerCase().includes(query)) return false;
      if (filter === "pending" && countedIds.has(product.id)) return false;
      if (filter === "counted" && !countedIds.has(product.id)) return false;
      return true;
    });
  }, [countedIds, filter, products, search]);

  const updateEntry = (productId: string, entryId: string, patch: Partial<CountLocationEntry>) => {
    setEntries((current) => {
      const productEntries = current[productId]?.length
        ? current[productId]
        : [{ ...createCountEntry(productId), id: `${productId}:base` }];
      return {
        ...current,
        [productId]: productEntries.map((entry) => entry.id === entryId ? { ...entry, ...patch } : entry),
      };
    });
  };

  const addEntry = (productId: string) => setEntries((current) => ({
    ...current,
    [productId]: [...getEntries(productId), createCountEntry(productId)],
  }));

  const removeEntry = (productId: string, entryId: string) => setEntries((current) => ({
    ...current,
    [productId]: getEntries(productId).filter((entry) => entry.id !== entryId),
  }));

  const save = async () => {
    if (!lines.length) {
      setError("Registra al menos un producto. Un cero confirmado sí cuenta como registro.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/inventory/count-initial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, lines, scope_note: `loc_id:${locationId}` }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar el conteo.");
      window.localStorage.removeItem(storageKey);
      if (data?.countSessionId) {
        router.push(`/inventory/count-initial/session/${encodeURIComponent(data.countSessionId)}`);
        return;
      }
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Error de red al guardar.");
      setLoading(false);
    }
  };

  const progress = products.length ? Math.round((countedIds.size / products.length) * 100) : 0;

  return (
    <div className="space-y-4 pb-24">
      <section className="ui-panel ui-remission-section space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Conteo físico</div>
            <p className="ui-caption mt-1">{siteName} · {locationLabel}. Vacío significa pendiente; usa 0 para confirmar ausencia.</p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900">
            {countedIds.size} de {products.length} · {progress}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="ui-input min-w-[240px] flex-1" value={search} onChange={(event) => { setSearch(event.target.value); setVisible(PAGE_SIZE); }} placeholder="Buscar producto" />
          {(["all", "pending", "counted"] as Filter[]).map((value) => (
            <button key={value} type="button" onClick={() => { setFilter(value); setVisible(PAGE_SIZE); }} className={`ui-btn ${filter === value ? "ui-btn--brand" : "ui-btn--ghost"}`}>
              {value === "all" ? "Todos" : value === "pending" ? "Pendientes" : "Registrados"}
            </button>
          ))}
        </div>
      </section>

      <div className="space-y-3">
        {filtered.slice(0, visible).map((product) => (
          <CountLocationProductCard
            key={product.id}
            product={product}
            entries={getEntries(product.id)}
            unitOptions={unitOptions[product.id] ?? []}
            positions={positions}
            onChange={(entryId, patch) => updateEntry(product.id, entryId, patch)}
            onAdd={() => addEntry(product.id)}
            onRemove={(entryId) => removeEntry(product.id, entryId)}
          />
        ))}
        {!filtered.length ? <div className="ui-alert ui-alert--warn">No hay productos para este filtro.</div> : null}
        {visible < filtered.length ? <button type="button" className="ui-btn ui-btn--ghost w-full" onClick={() => setVisible((value) => value + PAGE_SIZE)}>Mostrar más ({visible} de {filtered.length})</button> : null}
      </div>

      {error ? <div className="ui-alert ui-alert--error">{error}</div> : null}
      <div className="ui-mobile-sticky-footer flex items-center justify-between gap-3 border-t border-[var(--ui-border)] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="text-sm text-[var(--ui-muted)]">Borrador automático · {countedIds.size} productos registrados</div>
        <button type="button" className="ui-btn ui-btn--brand" disabled={loading} onClick={() => setConfirming(true)}>Revisar y guardar</button>
      </div>

      {confirming ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <div className="ui-h3">Confirmar conteo</div>
            <p className="ui-body-muted mt-2">Se guardarán {lines.length} líneas correspondientes a {countedIds.size} productos. Los productos pendientes no se enviarán.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="ui-btn ui-btn--ghost" disabled={loading} onClick={() => setConfirming(false)}>Seguir contando</button>
              <button type="button" className="ui-btn ui-btn--brand" disabled={loading} onClick={save}>{loading ? "Guardando..." : "Guardar conteo"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
