"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
  currentStock: Record<string, number>;
};

export function AdjustForm({ products, siteId, siteName, currentStock }: Props) {
  const router = useRouter();
  const [productId, setProductId] = useState<string>("");
  const [quantityDelta, setQuantityDelta] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [evidence, setEvidence] = useState<string>("");
  const [unitCostForAdjust, setUnitCostForAdjust] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedProduct = products.find((p) => p.id === productId);
  const currentQty = productId ? currentStock[productId] ?? 0 : 0;
  const deltaNum = (() => {
    const v = quantityDelta.trim();
    if (v === "" || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  })();
  const newQty = deltaNum != null ? currentQty + deltaNum : null;

  const canSubmit =
    Boolean(productId) &&
    deltaNum != null &&
    deltaNum !== 0 &&
    reason.trim().length > 0 &&
    !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          product_id: productId,
          quantity_delta: deltaNum,
          unit_cost_for_adjust:
            deltaNum != null && deltaNum > 0 && unitCostForAdjust.trim() !== ""
              ? Number(unitCostForAdjust)
              : undefined,
          reason: reason.trim(),
          evidence: evidence.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Error al guardar el ajuste.");
        setLoading(false);
        return;
      }
      router.push(`/inventory/stock?site_id=${encodeURIComponent(siteId)}&adjust=1`);
      return;
    } catch {
      setError("Error de red al guardar.");
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      {error ? <div className="ui-alert ui-alert--error">{error}</div> : null}

      <form onSubmit={handleSubmit} className="space-y-6 pb-24 lg:pb-0">
        <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="ui-h3">Contexto</div>
              <div className="ui-caption mt-1">Elige producto y valida el stock actual antes de corregir.</div>
            </div>
            <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              {siteName}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="ui-label">
              Producto <span className="text-[var(--ui-danger)]">*</span>
            </span>
            <select
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value);
                setQuantityDelta("");
              }}
              required
              className="ui-input"
            >
              <option value="">Selecciona un producto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} {product.sku ? `(${product.sku})` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 ui-mobile-stack md:grid-cols-2 xl:grid-cols-3">
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Sede</div>
              <div className="mt-1 font-semibold">{siteName}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Producto</div>
              <div className="mt-1 font-semibold">{selectedProduct?.name ?? "Sin definir"}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Stock actual</div>
              <div className="mt-1 font-semibold">
                {productId ? `${currentQty.toLocaleString()} ${selectedProduct?.unit ?? "unidades"}` : "Selecciona un producto"}
              </div>
            </div>
          </div>

        </section>

        <section className="ui-panel ui-remission-section ui-fade-up ui-delay-2 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="ui-h3">Detalle</div>
              <div className="ui-caption mt-1">Define el cambio y deja el motivo registrado.</div>
            </div>
            {deltaNum != null && deltaNum !== 0 && productId ? (
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${newQty != null && newQty >= 0 ? "border border-emerald-200 bg-emerald-50 text-emerald-900" : "border border-red-200 bg-red-50 text-red-900"}`}>
                Resultado {newQty?.toLocaleString()} {selectedProduct?.unit ?? "un"}
              </div>
            ) : null}
          </div>

          <label className="flex flex-col gap-1">
            <span className="ui-label">
              Ajuste (cantidad) <span className="text-[var(--ui-danger)]">*</span>
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="any"
                value={quantityDelta}
                onChange={(event) => {
                  setQuantityDelta(event.target.value);
                }}
                placeholder="Ej: +10 o -5"
                required
                className="ui-input flex-1"
              />
              {selectedProduct?.unit ? <span className="ui-body-muted">{selectedProduct.unit}</span> : null}
            </div>
            {deltaNum != null && deltaNum !== 0 && productId ? (
              <div className="mt-2 text-sm font-medium text-zinc-700">
                Stock resultante:{" "}
                <span className={newQty != null && newQty >= 0 ? "text-green-600" : "text-red-600"}>
                  {newQty?.toLocaleString()} {selectedProduct?.unit ?? "unidades"}
                </span>
              </div>
            ) : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">
              Motivo <span className="text-[var(--ui-danger)]">*</span>
            </span>
            <textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
              placeholder="Ej: Merma detectada, correccion por conteo, producto danado."
              required
              rows={3}
              className="ui-input"
            />
          </label>

          {deltaNum != null && deltaNum > 0 ? (
            <label className="flex flex-col gap-1">
              <span className="ui-label">Costo unitario del ajuste (opcional)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitCostForAdjust}
                onChange={(event) => {
                  setUnitCostForAdjust(event.target.value);
                }}
                placeholder="Si lo dejas vacio, no cambia costo promedio"
                className="ui-input"
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="ui-label">Evidencia (opcional)</span>
            <textarea
              value={evidence}
              onChange={(event) => {
                setEvidence(event.target.value);
              }}
              placeholder="Ej: reporte de supervisor, foto, incidencia."
              rows={2}
              className="ui-input"
            />
          </label>

          {!canSubmit ? (
            <div className="ui-alert ui-alert--warn">
              Completa producto, cantidad distinta de 0 y motivo.
            </div>
          ) : null}
        </section>

        <div className="ui-mobile-sticky-footer ui-fade-up ui-delay-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] bg-white/92 px-4 py-3 backdrop-blur">
          <div className="text-sm text-[var(--ui-muted)]">
            {selectedProduct?.name ?? "Sin producto"}
            {newQty != null ? ` · ${newQty} ${selectedProduct?.unit ?? ""}` : ""}
          </div>
          <Link href={`/inventory/adjust?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
            Limpiar
          </Link>
          <Link href={`/inventory/stock?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
            Ver stock
          </Link>
          <button
            type="submit"
            disabled={!canSubmit}
            className="ui-btn ui-btn--brand disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Guardando..." : "Registrar ajuste"}
          </button>
        </div>
      </form>
    </div>
  );
}
