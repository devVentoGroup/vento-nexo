"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GuidedFormShell } from "@/components/inventory/forms/GuidedFormShell";
import { StepHelp } from "@/components/inventory/forms/StepHelp";
import { WizardFooter } from "@/components/inventory/forms/WizardFooter";
import type { GuidedStep } from "@/lib/inventory/forms/types";

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

const STEPS: GuidedStep[] = [
  {
    id: "producto",
    title: "Producto",
    objective: "Selecciona el producto y revisa su stock actual en la sede.",
  },
  {
    id: "ajuste",
    title: "Ajuste",
    objective: "Define cantidad, motivo y evidencia del ajuste manual.",
  },
  {
    id: "confirmacion",
    title: "Confirmacion",
    objective: "Valida el impacto final y registra el movimiento.",
  },
];

export function AdjustForm({ products, siteId, siteName, currentStock }: Props) {
  const router = useRouter();
  const [activeStepId, setActiveStepId] = useState(STEPS[0].id);
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

  const stepIndex = STEPS.findIndex((step) => step.id === activeStepId);
  const atFirstStep = stepIndex <= 0;
  const atLastStep = stepIndex >= STEPS.length - 1;

  const moveStep = (offset: -1 | 1) => {
    const nextIndex = Math.min(STEPS.length - 1, Math.max(0, stepIndex + offset));
    setActiveStepId(STEPS[nextIndex].id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || activeStepId !== "confirmacion") return;

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

      <GuidedFormShell
        title="Nuevo ajuste de inventario"
        subtitle={`Sede: ${siteName}. Registra un ajuste manual con motivo y trazabilidad.`}
        steps={STEPS}
        currentStepId={activeStepId}
        onStepChange={setActiveStepId}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <section className={activeStepId === "producto" ? "ui-panel space-y-4" : "hidden"}>
            <div className="ui-h3">Paso 1. Producto</div>
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

            {productId ? (
              <div className="ui-panel-soft p-3 text-sm">
                <div className="font-semibold text-zinc-700">Stock actual</div>
                <div className="mt-1 text-zinc-600">
                  {currentQty.toLocaleString()} {selectedProduct?.unit ?? "unidades"}
                </div>
              </div>
            ) : null}

            <StepHelp
              meaning="Primero defines a que producto se le aplica el ajuste."
              whenToUse="Selecciona siempre el producto exacto antes de capturar la diferencia."
              example="Leche entera (LT) con stock actual 120."
              impact="Evita ajustar inventario equivocado y mejora la trazabilidad."
            />
          </section>

          <section className={activeStepId === "ajuste" ? "ui-panel space-y-4" : "hidden"}>
            <div className="ui-h3">Paso 2. Ajuste</div>
            <label className="flex flex-col gap-1">
              <span className="ui-label">
                Ajuste (cantidad) <span className="text-[var(--ui-danger)]">*</span>
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  value={quantityDelta}
                  onChange={(event) => setQuantityDelta(event.target.value)}
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
                onChange={(event) => setReason(event.target.value)}
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
                  onChange={(event) => setUnitCostForAdjust(event.target.value)}
                  placeholder="Si lo dejas vacio, no cambia costo promedio"
                  className="ui-input"
                />
              </label>
            ) : null}

            <label className="flex flex-col gap-1">
              <span className="ui-label">Evidencia (opcional)</span>
              <textarea
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
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

          <section className={activeStepId === "confirmacion" ? "ui-panel space-y-4" : "hidden"}>
            <div className="ui-h3">Paso 3. Confirmacion</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="ui-panel-soft p-3">
                <div className="ui-caption">Producto</div>
                <div className="font-semibold mt-1">{selectedProduct?.name ?? "Sin definir"}</div>
              </div>
              <div className="ui-panel-soft p-3">
                <div className="ui-caption">Ajuste</div>
                <div className="font-semibold mt-1">
                  {deltaNum != null ? `${deltaNum} ${selectedProduct?.unit ?? ""}` : "Sin definir"}
                </div>
              </div>
              <div className="ui-panel-soft p-3 sm:col-span-2">
                <div className="ui-caption">Resultado esperado</div>
                <div className="font-semibold mt-1">
                  {newQty != null ? `${newQty} ${selectedProduct?.unit ?? ""}` : "Sin definir"}
                </div>
              </div>
            </div>
            {!canSubmit ? (
              <div className="ui-alert ui-alert--warn">
                Completa producto, cantidad distinta de 0 y motivo para registrar el ajuste.
              </div>
            ) : null}
          </section>

          <WizardFooter
            canGoPrevious={!atFirstStep}
            canGoNext={!atLastStep}
            onPrevious={() => moveStep(-1)}
            onNext={() => moveStep(1)}
            rightActions={
              <>
                <Link href={`/inventory/adjust?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
                  Limpiar
                </Link>
                <Link href={`/inventory/stock?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
                  Ver stock
                </Link>
                <button
                  type="submit"
                  disabled={!canSubmit || activeStepId !== "confirmacion"}
                  className="ui-btn ui-btn--brand disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Guardando..." : "Registrar ajuste"}
                </button>
              </>
            }
          />
        </form>
      </GuidedFormShell>
    </div>
  );
}
