"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StepHelp } from "@/components/inventory/forms/StepHelp";
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

export function CountInitialForm({
  products,
  siteId,
  siteName,
  countScopeLabel,
  zoneOrLocNote,
}: Props) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
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

  const handleConfirm = async () => {
    if (lines.length === 0) {
      setError("Ingresa al menos una cantidad mayor a 0.");
      return;
    }
    if (!confirmed) {
      setError("Confirma el conteo antes de guardar.");
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

      <div className="space-y-6 pb-24 lg:pb-0">
        <section className="ui-panel-soft space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="ui-h3">Conteo inicial en una sola vista</div>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                Aqui capturas cantidades, revisas el resumen y confirmas el conteo sin navegar por wizard.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="ui-chip">Sede {siteName}</span>
              {countScopeLabel && countScopeLabel !== "Toda la sede" ? (
                <span className="ui-chip">{countScopeLabel}</span>
              ) : null}
            </div>
          </div>
          <p className="text-sm text-[var(--ui-muted)]">
            La idea es que una persona nueva pueda completar el conteo entendiendo el alcance y el impacto antes de guardar.
          </p>
        </section>

        <section className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Captura de cantidades</div>
            <p className="mt-1 ui-caption">
              Ingresa cantidad contada por producto. Deja `0` o vacio en productos no contados.
            </p>
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
                        onChange={(event) => {
                          setQty((state) => ({ ...state, [product.id]: event.target.value }));
                          setConfirmed(false);
                        }}
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

        <section className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Revision operativa</div>
            <p className="mt-1 ui-caption">
              Antes de guardar, valida el alcance del conteo y el total de productos con cantidad capturada.
            </p>
          </div>

          <div className="grid gap-3 ui-mobile-stack sm:grid-cols-2 xl:grid-cols-4">
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Sede</div>
              <div className="mt-1 font-semibold">{siteName}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Alcance</div>
              <div className="mt-1 font-semibold">{countScopeLabel ?? "Toda la sede"}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Productos con cantidad</div>
              <div className="mt-1 font-semibold">{lines.length}</div>
            </div>
            <div className="ui-panel-soft p-3">
              <div className="ui-caption">Aplicacion</div>
              <div className="mt-1 font-semibold">
                {zoneOrLocNote ? "Al cierre del conteo" : "Inmediata"}
              </div>
            </div>
          </div>

          <div className="ui-body-muted">
            {lines.length} producto(s) con cantidad. Al confirmar se crean movimientos tipo{" "}
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
                {lines.length === 0 ? (
                  <tr>
                    <TableCell colSpan={4} className="ui-empty">
                      Aun no hay productos con cantidad mayor a 0.
                    </TableCell>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </div>

          <div className="ui-panel-soft space-y-2 p-4 text-sm text-[var(--ui-muted)]">
            <p>1) Registra solo cantidades realmente contadas.</p>
            <p>2) Si el alcance es zona o LOC, el ajuste puede quedar pendiente hasta cierre.</p>
            <p>3) Revisa productos omitidos antes de confirmar.</p>
          </div>
        </section>

        <section className="ui-panel space-y-4">
          <div>
            <div className="ui-h3">Confirmacion final</div>
            <p className="mt-1 ui-caption">
              Este es el ultimo control antes de registrar el conteo inicial.
            </p>
          </div>

          <label className="flex items-start gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span className="ui-caption">
              Confirmo que revise cantidades, alcance del conteo y productos incluidos antes de guardar.
            </span>
          </label>
        </section>

        <div className="ui-mobile-sticky-footer flex flex-wrap items-center justify-end gap-2">
          <Link href={`/inventory/count-initial?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
            Limpiar
          </Link>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="ui-btn ui-btn--brand disabled:opacity-50"
          >
            {loading ? "Guardando..." : "Confirmar conteo"}
          </button>
        </div>
      </div>
    </div>
  );
}
