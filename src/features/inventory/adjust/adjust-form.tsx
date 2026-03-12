"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StepHelp } from "@/components/inventory/forms/StepHelp";

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
  const [confirmed, setConfirmed] = useState(false);
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
    if (!canSubmit || !confirmed) return;

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
        <section className="ui-panel-soft space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="ui-h3">Ajuste completo en una sola vista</div>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                Aqui seleccionas producto, defines la diferencia, justificas el cambio y confirmas sin wizard.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="ui-chip">Sede {siteName}</span>
              <span className="ui-chip">Ajuste manual</span>
            </div>
          </div>
          <p className="text-sm text-[var(--ui-muted)]">
            La meta es que una persona nueva pueda registrar un ajuste con criterio operativo y trazabilidad completa.
          </p>
        </section>

        <section className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Producto y stock actual</div>
            <p className="mt-1 ui-caption">
              Selecciona el producto exacto antes de capturar la diferencia para evitar ajustes equivocados.
            </p>
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
                setConfirmed(false);
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

          <StepHelp
            meaning="Primero defines a que producto se le aplica el ajuste."
            whenToUse="Selecciona siempre el producto exacto antes de capturar la diferencia."
            example="Leche entera (LT) con stock actual 120."
            impact="Evita ajustar inventario equivocado y mejora la trazabilidad."
          />
        </section>

        <section className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Diferencia, motivo y evidencia</div>
            <p className="mt-1 ui-caption">
              Registra la diferencia real, explica por que ocurre y agrega soporte cuando exista.
            </p>
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
                  setConfirmed(false);
                }}
                placeholder="Ej: +10 o -5"
                required
                className="ui-input flex-1"
              />
              {selectedProduct?.unit ? <span className="ui-body-muted">{selectedProduct.unit}</span> : null}
            </div>
            <div className="mt-1 ui-caption">
              Usa numeros positivos (+) para aumentar stock y negativos (-) para disminuir.
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
                setConfirmed(false);
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
                  setConfirmed(false);
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
                setConfirmed(false);
              }}
              placeholder="Ej: reporte de supervisor, foto, incidencia."
              rows={2}
              className="ui-input"
            />
          </label>

          <StepHelp
            meaning="Defines la diferencia real y su justificacion operativa."
            whenToUse="Siempre con motivo claro, aunque la diferencia sea pequena."
            example="Ajuste -2 por merma detectada en conteo fisico."
            impact="Genera historial de auditoria y protege la calidad del dato."
          />
        </section>

        <section className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Revision operativa</div>
            <p className="mt-1 ui-caption">
              Antes de guardar, valida el impacto esperado del ajuste y confirma que la justificacion sea suficiente.
            </p>
          </div>

          <div className="grid gap-3 ui-mobile-stack sm:grid-cols-2 xl:grid-cols-4">
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Producto</div>
              <div className="mt-1 font-semibold">{selectedProduct?.name ?? "Sin definir"}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Ajuste</div>
              <div className="mt-1 font-semibold">
                {deltaNum != null ? `${deltaNum} ${selectedProduct?.unit ?? ""}` : "Sin definir"}
              </div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Resultado esperado</div>
              <div className="mt-1 font-semibold">
                {newQty != null ? `${newQty} ${selectedProduct?.unit ?? ""}` : "Sin definir"}
              </div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Motivo</div>
              <div className="mt-1 font-semibold">{reason.trim() || "Sin definir"}</div>
            </div>
          </div>

          {!canSubmit ? (
            <div className="ui-alert ui-alert--warn">
              Completa producto, cantidad distinta de 0 y motivo para registrar el ajuste.
            </div>
          ) : null}

          <div className="ui-panel-soft space-y-2 p-4 text-sm text-[var(--ui-muted)]">
            <p>1) Usa ajuste positivo solo si realmente estas incorporando stock no registrado.</p>
            <p>2) Usa ajuste negativo para merma, dano, perdida o correccion de conteo.</p>
            <p>3) Si agregas costo en ajuste positivo, puede impactar costo promedio.</p>
          </div>
        </section>

        <section className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Confirmacion final</div>
            <p className="mt-1 ui-caption">
              Este es el ultimo control antes de registrar el movimiento manual en inventario.
            </p>
          </div>

          <label className="flex items-start gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span className="ui-caption">
              Confirmo que revise producto, diferencia, motivo y resultado esperado antes de registrar el ajuste.
            </span>
          </label>
        </section>

        <div className="ui-mobile-sticky-footer flex flex-wrap items-center justify-end gap-2">
          <Link href={`/inventory/adjust?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
            Limpiar
          </Link>
          <Link href={`/inventory/stock?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
            Ver stock
          </Link>
          <button
            type="submit"
            disabled={!canSubmit || !confirmed}
            className="ui-btn ui-btn--brand disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Guardando..." : "Registrar ajuste"}
          </button>
        </div>
      </form>
    </div>
  );
}
