"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ScanInput } from "@/components/vento/scan-input";

type ParsedScan =
  | { kind: "vento"; entity: "LOC" | "AST"; code: string; raw: string }
  | { kind: "raw"; raw: string };

export function ScannerPanel() {
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
  const withdrawHref =
    `/inventory/withdraw?loc=${encodeURIComponent(locCode)}` +
    (currentSiteId ? `&site_id=${encodeURIComponent(currentSiteId)}` : "");

  return (
    <div className="space-y-4">
      <ScanInput onScan={handleScan} />

      {lastScanned?.kind === "vento" && lastScanned.entity === "LOC" ? (
        <div className="ui-panel border-[var(--ui-brand)]/20 bg-[var(--ui-brand-soft)]">
          <div className="ui-h3">LOC detectado</div>
          <p className="mt-1 font-mono text-sm font-medium text-[var(--ui-text)]">{lastScanned.code}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/inventory/locations?code=${encodeURIComponent(lastScanned.code)}${currentSiteId ? `&site_id=${encodeURIComponent(currentSiteId)}` : ""}`}
              className="ui-btn ui-btn--ghost"
            >
              Ver ubicación
            </Link>
            <Link
              href={withdrawHref}
              className="ui-btn ui-btn--brand"
            >
              Abrir retiro
            </Link>
          </div>
        </div>
      ) : null}

      {lastScanned?.kind === "vento" && lastScanned.entity === "AST" ? (
        <div className="ui-panel ui-alert ui-alert--neutral">
          <div className="ui-h3">AST detectado</div>
          <p className="mt-1 font-mono text-sm">{lastScanned.code}</p>
          <p className="mt-2 ui-body-muted">Ficha técnica: pendiente (VISO).</p>
        </div>
      ) : null}

      {lastScanned?.kind === "raw" && lastScanned.raw ? (
        <div className="ui-panel-soft">
          <div className="ui-caption font-semibold">Código sin formato Vento</div>
          <p className="mt-1 font-mono text-sm">{lastScanned.raw}</p>
          <div className="mt-3">
            <Link
              href={`/inventory/locations?code=${encodeURIComponent(lastScanned.raw)}`}
              className="ui-btn ui-btn--ghost text-sm"
            >
              Buscar en ubicaciones
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

