"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ScanInput } from "@/components/vento/scan-input";

type ParsedScan =
  | { kind: "vento"; entity: "LOC" | "AST"; code: string; raw: string }
  | { kind: "raw"; raw: string };

export function WarehouseQRClient() {
  const [lastScanned, setLastScanned] = useState<ParsedScan | null>(null);
  const searchParams = useSearchParams();
  const currentSiteId = searchParams.get("site_id") ?? "";

  function handleScan(parsed: ParsedScan) {
    setLastScanned(parsed);
  }

  function handleReset() {
    setLastScanned(null);
  }

  const locCode = lastScanned?.kind === "vento" ? lastScanned.code : lastScanned?.kind === "raw" ? lastScanned.raw : "";
  const isValidLoc = lastScanned?.kind === "vento" && lastScanned.entity === "LOC";

  const viewContentHref =
    `/inventory/stock?loc=${encodeURIComponent(locCode)}` +
    (currentSiteId ? `&site_id=${encodeURIComponent(currentSiteId)}` : "");

  const requestTransferHref =
    `/inventory/remissions?from_loc=${encodeURIComponent(locCode)}` +
    (currentSiteId ? `&site_id=${encodeURIComponent(currentSiteId)}` : "");

  const returnProductHref =
    `/inventory/entries?to_loc=${encodeURIComponent(locCode)}` +
    (currentSiteId ? `&site_id=${encodeURIComponent(currentSiteId)}` : "");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center sm:mb-12">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Escanea LOC
          </h1>
          <p className="mt-3 text-base text-slate-600 sm:text-lg">
            Apunta tu móvil al código QR en el piso
          </p>
        </div>

        {/* Scanner Input */}
        <div className="mb-8">
          <ScanInput onScan={handleScan} />
        </div>

        {/* State: No scan yet */}
        {!lastScanned && (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center sm:p-12">
            <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
              <svg
                className="h-8 w-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-600">
              Busca el código QR en la ubicación del LOC y escanéalo
            </p>
            <p className="mt-2 text-xs text-slate-500">
              El código está en la etiqueta blanca con el código del LOC
            </p>
          </div>
        )}

        {/* State: Invalid scan */}
        {lastScanned && !isValidLoc && (
          <div className="rounded-2xl bg-amber-50 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <svg
                  className="h-6 w-6 text-amber-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-amber-900">Código no reconocido</h3>
                <p className="mt-1 text-sm text-amber-800">
                  El código escaneado no es un LOC válido. Intenta de nuevo.
                </p>
                <button
                  onClick={handleReset}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  Intentar de nuevo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* State: Valid LOC scanned */}
        {isValidLoc && (
          <div className="space-y-6 sm:space-y-8">
            {/* LOC Info Card */}
            <div className="rounded-2xl bg-white shadow-md">
              <div className="border-b border-slate-200 px-6 py-4 sm:px-8 sm:py-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-600">Ubicación escaneada</p>
                    <h2 className="mt-1 font-mono text-2xl font-bold text-slate-900 sm:text-3xl">
                      {locCode}
                    </h2>
                  </div>
                  <button
                    onClick={handleReset}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cambiar
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 px-6 py-4 sm:px-8 sm:py-6">
                {/* Button 1: Ver Contenido */}
                <Link
                  href={viewContentHref}
                  className="flex items-center justify-between rounded-xl bg-blue-600 px-6 py-4 text-white transition hover:bg-blue-700 sm:py-5"
                >
                  <div className="text-left">
                    <div className="font-semibold sm:text-lg">📋 Ver contenido</div>
                    <p className="mt-1 text-sm text-blue-100">
                      Mira qué productos hay en esta ubicación
                    </p>
                  </div>
                  <svg
                    className="h-6 w-6 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>

                {/* Button 2: Solicitar Traslado */}
                <Link
                  href={requestTransferHref}
                  className="flex items-center justify-between rounded-xl bg-green-600 px-6 py-4 text-white transition hover:bg-green-700 sm:py-5"
                >
                  <div className="text-left">
                    <div className="font-semibold sm:text-lg">🚚 Solicitar traslado</div>
                    <p className="mt-1 text-sm text-green-100">
                      Pide que muevan productos de aquí
                    </p>
                  </div>
                  <svg
                    className="h-6 w-6 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>

                {/* Button 3: Devolver Producto */}
                <Link
                  href={returnProductHref}
                  className="flex items-center justify-between rounded-xl bg-purple-600 px-6 py-4 text-white transition hover:bg-purple-700 sm:py-5"
                >
                  <div className="text-left">
                    <div className="font-semibold sm:text-lg">↩️ Devolver producto</div>
                    <p className="mt-1 text-sm text-purple-100">
                      Recibe productos o devuelve insumos
                    </p>
                  </div>
                  <svg
                    className="h-6 w-6 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Info Box */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
              <p className="text-sm text-slate-700">
                💡 <span className="font-semibold">Consejo:</span> Cada botón abre la herramienta
                para esa tarea. Si necesitas hacer algo diferente, vuelve atrás y escanea otro LOC.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
