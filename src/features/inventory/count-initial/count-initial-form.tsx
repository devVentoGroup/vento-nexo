"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
      <div className="space-y-6 pb-24 lg:pb-0">
        <section className="ui-panel ui-remission-section ui-fade-up ui-delay-3 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="ui-h3">Conteo</div>
              <div className="ui-caption mt-1">Ingresa solo las cantidades que realmente contaste.</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-900">
                {siteName}
              </span>
              {countScopeLabel ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-900">
                  {countScopeLabel}
                </span>
              ) : null}
            </div>
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
