"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  currentStock: Record<string, number>; // product_id -> current_qty
};

export function AdjustForm({ products, siteId, siteName, currentStock }: Props) {
  const router = useRouter();
  const [productId, setProductId] = useState<string>("");
  const [quantityDelta, setQuantityDelta] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [evidence, setEvidence] = useState<string>("");
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
    productId &&
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
      router.push(
        `/inventory/stock?site_id=${encodeURIComponent(siteId)}&adjust=1`
      );
      return;
    } catch (e) {
      setError("Error de red al guardar.");
      setLoading(false);
    }
  };

  return (
    <div className="mt-6">
      {error ? (
        <div className="mb-6 ui-alert ui-alert--error">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="ui-panel">
        <div className="text-sm font-semibold text-zinc-900">Nuevo ajuste de inventario</div>
        <div className="mt-1 text-sm text-zinc-600">
          Sede: <strong>{siteName}</strong>. Registra un ajuste manual con motivo y trazabilidad.
        </div>

        <div className="mt-6 flex flex-col gap-4">
          {/* Producto */}
          <label className="flex flex-col gap-1">
            <span className="ui-label">
              Producto <span className="text-red-500">*</span>
            </span>
            <select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setQuantityDelta("");
              }}
              required
              className="h-11 rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Selecciona un producto</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ""}
                </option>
              ))}
            </select>
          </label>

          {/* Stock actual (solo lectura, informativo) */}
          {productId ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
              <div className="font-semibold text-zinc-700">Stock actual</div>
              <div className="mt-1 text-zinc-600">
                {currentQty.toLocaleString()} {selectedProduct?.unit ?? "unidades"}
              </div>
            </div>
          ) : null}

          {/* Cantidad delta */}
          <label className="flex flex-col gap-1">
            <span className="ui-label">
              Ajuste (cantidad) <span className="text-red-500">*</span>
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="any"
                value={quantityDelta}
                onChange={(e) => setQuantityDelta(e.target.value)}
                placeholder="Ej: +10 o -5"
                required
                className="h-11 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {selectedProduct?.unit ? (
                <span className="text-sm text-zinc-600">{selectedProduct.unit}</span>
              ) : null}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Usa números positivos (+) para aumentar stock, negativos (-) para disminuir.
            </div>
            {deltaNum != null && deltaNum !== 0 && productId ? (
              <div className="mt-2 text-sm font-medium text-zinc-700">
                Stock resultante:{" "}
                <span className={newQty! >= 0 ? "text-green-600" : "text-red-600"}>
                  {newQty!.toLocaleString()} {selectedProduct?.unit ?? "unidades"}
                </span>
              </div>
            ) : null}
          </label>

          {/* Motivo (obligatorio) */}
          <label className="flex flex-col gap-1">
            <span className="ui-label">
              Motivo <span className="text-red-500">*</span>
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Merma detectada en inventario físico, Corrección por error de conteo, Producto dañado..."
              required
              rows={3}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <div className="mt-1 text-xs text-zinc-500">
              Describe el motivo del ajuste. Este campo es obligatorio para trazabilidad.
            </div>
          </label>

          {/* Evidencia (opcional) */}
          <label className="flex flex-col gap-1">
            <span className="ui-label">Evidencia (opcional)</span>
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="Ej: Foto adjunta en sistema, Nota del supervisor, Número de reporte..."
              rows={2}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <div className="mt-1 text-xs text-zinc-500">
              Información adicional que respalde el ajuste (opcional).
            </div>
          </label>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="ui-btn ui-btn--brand disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Guardando…" : "Registrar ajuste"}
          </button>
          <a
            href="/inventory/adjust"
            className="ui-btn ui-btn--ghost"
          >
            Limpiar
          </a>
          <a
            href="/inventory/stock"
            className="ui-btn ui-btn--ghost"
          >
            Ver stock
          </a>
        </div>
      </form>
    </div>
  );
}
