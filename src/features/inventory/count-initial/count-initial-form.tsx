"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { GuidedFormShell } from "@/components/inventory/forms/GuidedFormShell";
import { StepHelp } from "@/components/inventory/forms/StepHelp";
import { WizardFooter } from "@/components/inventory/forms/WizardFooter";
import { Table, TableCell, TableHeaderCell } from "@/components/vento/standard/table";
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
  countScopeLabel?: string;
  zoneOrLocNote?: string;
};

const STEPS: GuidedStep[] = [
  {
    id: "captura",
    title: "Captura",
    objective: "Ingresa cantidades contadas por producto.",
  },
  {
    id: "resumen",
    title: "Resumen",
    objective: "Revisa y confirma el conteo antes de guardar.",
  },
];

export function CountInitialForm({
  products,
  siteId,
  siteName,
  countScopeLabel,
  zoneOrLocNote,
}: Props) {
  const router = useRouter();
  const [activeStepId, setActiveStepId] = useState(STEPS[0].id);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getVal = (id: string) => {
    const v = qty[id]?.trim();
    if (v === "" || v == null) return 0;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const lines = products
    .map((p) => ({ product_id: p.id, quantity: getVal(p.id) }))
    .filter((line) => line.quantity > 0);

  const stepIndex = STEPS.findIndex((step) => step.id === activeStepId);
  const atFirstStep = stepIndex <= 0;
  const atLastStep = stepIndex >= STEPS.length - 1;

  const moveStep = (offset: -1 | 1) => {
    const nextIndex = Math.min(STEPS.length - 1, Math.max(0, stepIndex + offset));
    setActiveStepId(STEPS[nextIndex].id);
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
      router.push(`/inventory/stock?site_id=${encodeURIComponent(siteId)}&count_initial=1`);
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
        title="Conteo inicial"
        subtitle={`Sede: ${siteName}${countScopeLabel && countScopeLabel !== "Toda la sede" ? ` · ${countScopeLabel}` : ""}.`}
        steps={STEPS}
        currentStepId={activeStepId}
        onStepChange={setActiveStepId}
      >
        <section className={activeStepId === "captura" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 1. Captura de cantidades</div>
          <div className="ui-body-muted">
            Ingresa cantidad contada por producto. Deja 0 o vacio los productos no contados.
          </div>
          <div className="overflow-x-auto ui-scrollbar-subtle">
            <Table>
              <thead>
                <tr>
                  <TableHeaderCell>Producto</TableHeaderCell>
                  <TableHeaderCell>SKU</TableHeaderCell>
                  <TableHeaderCell>Unidad</TableHeaderCell>
                  <TableHeaderCell className="w-36">Cantidad</TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="ui-body">
                    <TableCell>{product.name}</TableCell>
                    <TableCell className="font-mono">{product.sku ?? "-"}</TableCell>
                    <TableCell>{product.unit ?? "-"}</TableCell>
                    <TableCell>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={qty[product.id] ?? ""}
                        onChange={(event) => setQty((state) => ({ ...state, [product.id]: event.target.value }))}
                        placeholder="0"
                        className="ui-input"
                      />
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <StepHelp
            meaning="Capturas el inventario contado fisicamente para cada producto."
            whenToUse="Cuando inicias conteo de una sede, zona o LOC."
            example="Harina 12, Leche 8.5, Vasos 120."
            impact="Define la base para ajustar diferencias contra el stock actual."
          />
        </section>

        <section className={activeStepId === "resumen" ? "ui-panel space-y-4" : "hidden"}>
          <div className="ui-h3">Paso 2. Resumen</div>
          <div className="ui-body-muted">
            {lines.length} producto(s) con cantidad. Al confirmar se crean movimientos tipo
            {" "}
            <span className="font-mono">count</span>
            {zoneOrLocNote
              ? " y el ajuste de stock se aplicara al cerrar el conteo."
              : " y se actualiza stock inmediatamente."}
          </div>
          <div className="overflow-x-auto ui-scrollbar-subtle">
            <Table>
              <thead>
                <tr>
                  <TableHeaderCell>Producto</TableHeaderCell>
                  <TableHeaderCell>SKU</TableHeaderCell>
                  <TableHeaderCell>Unidad</TableHeaderCell>
                  <TableHeaderCell>Cantidad</TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const product = products.find((row) => row.id === line.product_id);
                  return (
                    <tr key={line.product_id} className="ui-body">
                      <TableCell>{product?.name ?? line.product_id}</TableCell>
                      <TableCell className="font-mono">{product?.sku ?? "-"}</TableCell>
                      <TableCell>{product?.unit ?? "-"}</TableCell>
                      <TableCell className="font-mono">{line.quantity}</TableCell>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </section>

        <WizardFooter
          canGoPrevious={!atFirstStep}
          canGoNext={!atLastStep}
          onPrevious={() => moveStep(-1)}
          onNext={() => moveStep(1)}
          rightActions={
            <>
              <Link href={`/inventory/count-initial?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
                Limpiar
              </Link>
              {activeStepId === "resumen" ? (
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={loading}
                  className="ui-btn ui-btn--brand disabled:opacity-50"
                >
                  {loading ? "Guardando..." : "Confirmar conteo"}
                </button>
              ) : null}
            </>
          }
        />
      </GuidedFormShell>
    </div>
  );
}
