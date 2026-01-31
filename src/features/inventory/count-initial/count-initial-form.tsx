"use client";

import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";

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
};

export function CountInitialForm({ products, siteId, siteName }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<2 | 3>(2);
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
    .filter((l) => l.quantity > 0);

  const handleRevisar = () => {
    setError("");
    setStep(3);
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
        body: JSON.stringify({ site_id: siteId, lines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Error al guardar el conteo.");
        setLoading(false);
        return;
      }
      router.push(`/inventory/stock?site_id=${encodeURIComponent(siteId)}&count_initial=1`);
      return;
    } catch (e) {
      setError("Error de red al guardar.");
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      {error ? (
        <div className="ui-alert ui-alert--error">
          {error}
        </div>
      ) : null}

      {step === 2 ? (
        <>
          <div className="ui-panel">
            <div className="ui-body font-semibold">Cantidad contada por producto</div>
            <div className="mt-1 ui-body-muted">
              Sede: {siteName}. Deja en blanco o 0 los que no cuentes.
            </div>
            <div className="mt-4 overflow-x-auto">
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
                  {products.map((p) => (
                    <tr key={p.id} className="ui-body">
                      <TableCell>{p.name}</TableCell>
                      <TableCell className="font-mono">{p.sku ?? "-"}</TableCell>
                      <TableCell>{p.unit ?? "-"}</TableCell>
                      <TableCell>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={qty[p.id] ?? ""}
                          onChange={(e) => setQty((s) => ({ ...s, [p.id]: e.target.value }))}
                          placeholder="0"
                          className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleRevisar}
              className="ui-btn ui-btn--brand"
            >
              Revisar y confirmar
            </button>
            <a
              href="/inventory/count-initial"
              className="ui-btn ui-btn--ghost"
            >
              Cambiar sede
            </a>
          </div>
        </>
      ) : (
        <>
          <div className="ui-panel">
            <div className="ui-body font-semibold">Resumen del conteo inicial</div>
            <div className="mt-1 ui-body-muted">
              {lines.length} producto(s) con cantidad. Al confirmar se crean movimientos tipo &quot;count&quot; y se
              actualiza el stock.
            </div>
            <div className="mt-4 overflow-x-auto">
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
                  {lines.map((l) => {
                    const p = products.find((x) => x.id === l.product_id);
                    return (
                      <tr key={l.product_id} className="ui-body">
                        <TableCell>{p?.name ?? l.product_id}</TableCell>
                        <TableCell className="font-mono">{p?.sku ?? "-"}</TableCell>
                        <TableCell>{p?.unit ?? "-"}</TableCell>
                        <TableCell className="font-mono">{l.quantity}</TableCell>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={loading}
              className="ui-btn ui-btn--ghost disabled:opacity-50"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="ui-btn ui-btn--brand disabled:opacity-50"
            >
              {loading ? "Guardandoâ€¦" : "Confirmar conteo inicial"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

