"use client";

import { useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { BROWSERPRINT_CORE, BROWSERPRINT_ZEBRA } from "../jobs/_lib/constants";
import { usePrinterDevices } from "../jobs/_hooks/usePrinterDevices";

export default function PrintingSetupPage() {
  const {
    browserPrintOk,
    devices,
    selectedUid,
    setSelectedUid,
    detectPrinters,
    connectSelected,
    isConnected,
    isDetecting,
    lastError,
  } = usePrinterDevices();
  const [detectCount, setDetectCount] = useState<number | null>(null);

  function handleDetect() {
    detectPrinters((count) => setDetectCount(count ?? 0));
  }

  return (
    <>
      <Script src={BROWSERPRINT_CORE} strategy="afterInteractive" />
      <Script src={BROWSERPRINT_ZEBRA} strategy="afterInteractive" />

      <div className="ui-scene w-full max-w-5xl space-y-6">
        <section className="ui-remission-hero ui-fade-up">
          <div className="ui-remission-hero-grid">
            <div>
              <Link href="/printing/jobs" className="ui-btn ui-btn--ghost ui-btn--sm">
                ← Volver a impresión
              </Link>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
                Configuración de impresora Zebra
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-muted)] sm:text-base">
                Deja una impresora lista para imprimir sin tener que pelear con pasos técnicos innecesarios.
              </p>
            </div>
            <div className="ui-remission-kpis">
              <div className="ui-remission-kpi" data-tone={browserPrintOk ? "success" : undefined}>
                <div className="ui-remission-kpi-label">Bridge</div>
                <div className="ui-remission-kpi-value">{browserPrintOk ? "OK" : "NO"}</div>
                <div className="ui-remission-kpi-note">Browser Print</div>
              </div>
              <div className="ui-remission-kpi" data-tone={devices.length > 0 ? "cool" : undefined}>
                <div className="ui-remission-kpi-label">Impresoras</div>
                <div className="ui-remission-kpi-value">{devices.length}</div>
                <div className="ui-remission-kpi-note">Detectadas en este equipo</div>
              </div>
              <div className="ui-remission-kpi" data-tone={isConnected ? "success" : undefined}>
                <div className="ui-remission-kpi-label">Lista</div>
                <div className="ui-remission-kpi-value">{isConnected ? "SI" : "NO"}</div>
                <div className="ui-remission-kpi-note">Lista para imprimir</div>
              </div>
            </div>
          </div>
        </section>

        {lastError ? (
          <div className="ui-alert ui-alert--warn ui-fade-up ui-delay-1">
            Error de detección: {lastError}
          </div>
        ) : null}

        <section className="ui-panel ui-panel--halo ui-remission-section ui-fade-up ui-delay-1 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="ui-h3">Paso rápido</div>
              <div className="mt-1 ui-caption">1. Activa Browser Print. 2. Detecta. 3. Conecta. 4. Ve a imprimir.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDetect}
                disabled={!browserPrintOk || isDetecting}
                className="ui-btn ui-btn--brand"
              >
                {isDetecting ? "Detectando..." : "Detectar impresoras"}
              </button>
              <button
                type="button"
                onClick={() => connectSelected()}
                disabled={!selectedUid}
                className="ui-btn ui-btn--ghost"
              >
                {isConnected ? "Conectada" : "Conectar"}
              </button>
              <Link href="/printing/jobs" className="ui-btn ui-btn--ghost">
                Ir a imprimir
              </Link>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="ui-remission-kpi" data-tone={browserPrintOk ? "success" : undefined}>
              <div className="ui-remission-kpi-label">1. Servicio</div>
              <div className="mt-2 text-base font-semibold text-[var(--ui-text)]">
                {browserPrintOk ? "Browser Print activo" : "Instala Browser Print"}
              </div>
            </div>
            <div className="ui-remission-kpi" data-tone={devices.length > 0 ? "cool" : undefined}>
              <div className="ui-remission-kpi-label">2. Equipo</div>
              <div className="mt-2 text-base font-semibold text-[var(--ui-text)]">
                {devices.length > 0 ? `${devices.length} impresora(s) visibles` : "Aún no detecta impresora"}
              </div>
            </div>
            <div className="ui-remission-kpi" data-tone={isConnected ? "success" : undefined}>
              <div className="ui-remission-kpi-label">3. Estado</div>
              <div className="mt-2 text-base font-semibold text-[var(--ui-text)]">
                {isConnected ? "Lista para imprimir" : "Falta conectar"}
              </div>
            </div>
          </div>

          {devices.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <select
                value={selectedUid}
                onChange={(e) => setSelectedUid(e.target.value)}
                className="ui-input"
              >
                <option value="">Selecciona una impresora</option>
                {devices.map((d) => (
                  <option key={String(d.uid)} value={String(d.uid)}>
                    {String(d.name ?? d.uid)} {d.connection ? `(${d.connection})` : ""}
                  </option>
                ))}
              </select>
              <div className="ui-caption flex items-center justify-start md:justify-end">
                {detectCount !== null
                  ? detectCount === 0
                    ? "No se encontraron impresoras"
                    : `${detectCount} impresora(s) detectada(s)`
                  : isConnected
                    ? "Conexión lista"
                    : "Selecciona una impresora"}
              </div>
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2 space-y-4">
            <div className="ui-h3">Si no detecta la impresora</div>
            <div className="space-y-3 ui-body-muted">
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
                <div className="font-semibold text-[var(--ui-text)]">USB</div>
                <div className="mt-1 text-sm">Es la ruta más estable. Conecta por cable, abre Browser Print y vuelve a detectar.</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
                <div className="font-semibold text-[var(--ui-text)]">Bluetooth</div>
                <div className="mt-1 text-sm">Primero hay que activarlo una vez con Zebra Setup Utility. Después Windows la empareja y Browser Print la ve como dispositivo local.</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
                <div className="font-semibold text-[var(--ui-text)]">Wi-Fi</div>
                <div className="mt-1 text-sm">Nexo no configura IP ni red directamente. La impresora debe quedar expuesta al equipo por Browser Print o driver Zebra.</div>
              </div>
            </div>
          </div>

          <div className="ui-panel ui-remission-section ui-fade-up ui-delay-3 space-y-4">
            <div className="ui-h3">Descargas útiles</div>
            <div className="space-y-2">
              <a
                href="https://www.zebra.com/us/en/support-downloads/software/printer-software/zebra-browser-print.html"
                target="_blank"
                rel="noopener noreferrer"
                className="ui-btn ui-btn--ghost w-full justify-start"
              >
                Descargar Browser Print
              </a>
              <a
                href="https://www.zebra.com/us/en/support-downloads/printer-software/printer-setup-utilities.html"
                target="_blank"
                rel="noopener noreferrer"
                className="ui-btn ui-btn--ghost w-full justify-start"
              >
                Descargar Zebra Setup Utility
              </a>
              <Link href="/printing/jobs" className="ui-btn ui-btn--brand w-full justify-start">
                Ir a impresión rápida
              </Link>
            </div>
            <div className="ui-caption">
              Si el DataMatrix sale mal, usa el preset `LOC QR` en impresión rápida.
            </div>
          </div>
        </section>

        <details className="ui-panel-soft ui-fade-up ui-delay-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
            Ver pasos detallados y troubleshooting
          </summary>
          <div className="mt-4 space-y-6">
            <div className="space-y-3">
              <div className="ui-h3">Instalar Browser Print</div>
              <ol className="list-decimal list-inside space-y-2 ui-body-muted">
                <li>Descarga Browser Print desde Zebra.</li>
                <li>Instálalo con valores por defecto.</li>
                <li>Reabre el navegador y verifica el icono en la bandeja del sistema.</li>
              </ol>
            </div>
            <div className="space-y-3">
              <div className="ui-h3">Bluetooth por primera vez</div>
              <ol className="list-decimal list-inside space-y-2 ui-body-muted">
                <li>Conecta la impresora por USB.</li>
                <li>Abre Zebra Setup Utility y configura conectividad Bluetooth.</li>
                <li>Define nombre visible y PIN.</li>
                <li>Desconecta USB y empareja en Windows.</li>
              </ol>
            </div>
            <div className="ui-alert ui-alert--neutral">
              Algunos modelos no traen Bluetooth integrado. Si no aparece nunca, confirma el modelo exacto primero.
            </div>
          </div>
        </details>
      </div>
    </>
  );
}
