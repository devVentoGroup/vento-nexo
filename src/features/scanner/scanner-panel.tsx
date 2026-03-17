"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ScanInput } from "@/components/vento/scan-input";

type ParsedScan =
  | { kind: "vento"; entity: "LOC" | "AST"; code: string; raw: string }
  | { kind: "raw"; raw: string };

type Props = {
  mode?: "satellite" | "center" | "general";
  siteLabel?: string;
};

export function ScannerPanel({ mode = "general", siteLabel = "" }: Props) {
  const [lastScanned, setLastScanned] = useState<ParsedScan | null>(null);
  const searchParams = useSearchParams();
  const currentSiteId = searchParams.get("site_id") ?? "";

  function handleScan(parsed: ParsedScan) {
    setLastScanned(parsed);

    if (parsed.kind !== "vento") return;

    if (parsed.entity === "AST") {
      // AST: ficha técnica en VISO
      return;
    }

    // LOC: no redirigir; mostramos acciones debajo
  }

  const locCode = lastScanned?.kind === "vento" ? lastScanned.code : lastScanned?.kind === "raw" ? lastScanned.raw : "";
  const locHref =
    `/inventory/locations/open?loc=${encodeURIComponent(locCode)}` +
    (currentSiteId ? `&site_id=${encodeURIComponent(currentSiteId)}` : "");
  const locTitle =
    mode === "satellite"
      ? "LOC listo para retirar"
      : mode === "center"
        ? "LOC listo para operar"
        : "LOC detectado";
  const locHint =
    mode === "satellite"
      ? "Lo normal aquí es abrir este LOC y desde ahí retirar o revisar su contenido."
      : mode === "center"
        ? "Úsalo para abrir el LOC, retirar o revisar su contenido antes de seguir."
        : "Abre el LOC y elige la acción que sigue.";
  const primaryLocHref = locHref;
  const primaryLocLabel =
    mode === "satellite"
      ? "Abrir este LOC"
      : mode === "center"
        ? "Operar este LOC"
        : "Abrir LOC";

  return (
    <div className="space-y-4">
      <ScanInput onScan={handleScan} />

      {lastScanned?.kind === "vento" && lastScanned.entity === "LOC" ? (
        <div className="ui-panel ui-panel--halo ui-fade-up ui-delay-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="ui-h3">{locTitle}</div>
              <p className="mt-1 font-mono text-sm font-medium text-[var(--ui-text)]">{lastScanned.code}</p>
              <p className="mt-2 ui-caption">{locHint}</p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              {siteLabel ? `${siteLabel} · listo` : "Listo para operar"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              href={primaryLocHref}
              className="ui-btn ui-btn--brand h-14 w-full text-base font-semibold"
            >
              {primaryLocLabel}
            </Link>
          </div>
          <details className="rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
              Mas acciones
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Link
                href={locHref}
                className="ui-btn ui-btn--ghost h-12 w-full text-sm font-semibold"
              >
                Ver contenido
              </Link>
              <Link
                href={locHref}
                className="ui-btn ui-btn--ghost h-12 w-full text-sm font-semibold"
              >
                Abrir landing del LOC
              </Link>
            </div>
          </details>
        </div>
      ) : null}

      {lastScanned?.kind === "vento" && lastScanned.entity === "AST" ? (
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-1">
          <div className="ui-h3">AST detectado</div>
          <p className="mt-1 font-mono text-sm">{lastScanned.code}</p>
          <p className="mt-2 ui-body-muted">Ficha técnica pendiente en VISO.</p>
        </div>
      ) : null}

      {lastScanned?.kind === "raw" && lastScanned.raw ? (
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-1">
          <div className="ui-caption font-semibold">Código sin formato Vento</div>
          <p className="mt-1 font-mono text-sm">{lastScanned.raw}</p>
          <div className="mt-3">
            <Link
              href={`/inventory/locations?code=${encodeURIComponent(lastScanned.raw)}`}
              className="ui-btn ui-btn--ghost h-12 px-4 text-sm font-semibold"
            >
              Buscar en ubicaciones
            </Link>
          </div>
        </div>
      ) : null}
      <details className="ui-panel ui-remission-section ui-fade-up ui-delay-3">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
          Formatos compatibles
        </summary>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
            <span className="font-mono">VENTO|LOC|CODE</span> o <span className="font-mono">LOC-...</span>
          </div>
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
            <span className="font-mono">VENTO|AST|CODE</span>
          </div>
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
            Si el código no es de Vento, se busca por ubicación.
          </div>
        </div>
      </details>
    </div>
  );
}

