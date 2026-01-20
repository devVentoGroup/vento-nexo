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
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {step === 2 ? (
        <>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">Cantidad contada por producto</div>
            <div className="mt-1 text-sm text-zinc-600">
              Sede: {siteName}. Deja en blanco o 0 los que no cuentes.
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                    <th className="border-b border-zinc-200 pb-2">Producto</th>
                    <th className="border-b border-zinc-200 pb-2">SKU</th>
                    <th className="border-b border-zinc-200 pb-2">Unidad</th>
                    <th className="border-b border-zinc-200 pb-2 w-36">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="text-sm text-zinc-800">
                      <td className="border-b border-zinc-100 py-3">{p.name}</td>
                      <td className="border-b border-zinc-100 py-3 font-mono">{p.sku ?? "-"}</td>
                      <td className="border-b border-zinc-100 py-3">{p.unit ?? "-"}</td>
                      <td className="border-b border-zinc-100 py-3">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={qty[p.id] ?? ""}
                          onChange={(e) => setQty((s) => ({ ...s, [p.id]: e.target.value }))}
                          placeholder="0"
                          className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleRevisar}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-500"
            >
              Revisar y confirmar
            </button>
            <a
              href="/inventory/count-initial"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Cambiar sede
            </a>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-zinc-900">Resumen del conteo inicial</div>
            <div className="mt-1 text-sm text-zinc-600">
              {lines.length} producto(s) con cantidad. Al confirmar se crean movimientos tipo &quot;count&quot; y se
              actualiza el stock.
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                    <th className="border-b border-zinc-200 pb-2">Producto</th>
                    <th className="border-b border-zinc-200 pb-2">SKU</th>
                    <th className="border-b border-zinc-200 pb-2">Unidad</th>
                    <th className="border-b border-zinc-200 pb-2">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const p = products.find((x) => x.id === l.product_id);
                    return (
                      <tr key={l.product_id} className="text-sm text-zinc-800">
                        <td className="border-b border-zinc-100 py-3">{p?.name ?? l.product_id}</td>
                        <td className="border-b border-zinc-100 py-3 font-mono">{p?.sku ?? "-"}</td>
                        <td className="border-b border-zinc-100 py-3">{p?.unit ?? "-"}</td>
                        <td className="border-b border-zinc-100 py-3 font-mono">{l.quantity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {loading ? "Guardando…" : "Confirmar conteo inicial"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
