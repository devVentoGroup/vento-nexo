"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { BROWSERPRINT_CORE, BROWSERPRINT_ZEBRA } from "../jobs/_lib/constants";
import { usePrinterDevices } from "../jobs/_hooks/usePrinterDevices";

export default function PrintingSetupPage() {
  const [step, setStep] = useState(1);
  const {
    browserPrintOk,
    devices,
    selectedUid,
    setSelectedUid,
    detectPrinters,
    connectSelected,
    isConnected,
  } = usePrinterDevices();
  const [detectCount, setDetectCount] = useState<number | null>(null);

  useEffect(() => {
    if (browserPrintOk) setStep(2);
  }, [browserPrintOk]);

  function handleDetect() {
    detectPrinters((count) => setDetectCount(count ?? 0));
  }

  return (
    <>
      <Script src={BROWSERPRINT_CORE} strategy="afterInteractive" />
      <Script src={BROWSERPRINT_ZEBRA} strategy="afterInteractive" />

      <div className="w-full max-w-3xl space-y-8">
        <div>
          <Link href="/printing/jobs" className="ui-btn ui-btn--ghost ui-btn--sm">
            ← Volver a impresión
          </Link>
          <h1 className="mt-4 ui-h1">Configuración de impresora Zebra</h1>
          <p className="mt-2 ui-body-muted">
            Guía paso a paso para instalar Zebra Browser Print, emparejar impresoras Bluetooth y verificar que todo funcione.
          </p>
        </div>

        {/* Checklist visual */}
        <div className="ui-panel space-y-4">
          <div className="ui-h3">Estado actual</div>
          <ul className="space-y-3">
            <li className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  browserPrintOk ? "bg-[var(--ui-success-soft)] text-[var(--ui-success)]" : "bg-[var(--ui-brand-soft)] text-[var(--ui-brand-700)]"
                }`}
              >
                {browserPrintOk ? "✓" : "1"}
              </span>
              <div>
                <span className="font-medium">Zebra Browser Print</span>
                <span className={browserPrintOk ? " text-[var(--ui-success)]" : " text-[var(--ui-muted)]"}>
                  {browserPrintOk ? " Instalado y funcionando" : " Pendiente de instalar"}
                </span>
              </div>
            </li>
            <li className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  devices.length > 0 ? "bg-[var(--ui-success-soft)] text-[var(--ui-success)]" : "bg-[var(--ui-brand-soft)] text-[var(--ui-brand-700)]"
                }`}
              >
                {devices.length > 0 ? "✓" : "2"}
              </span>
              <div>
                <span className="font-medium">Impresora detectada</span>
                <span className={devices.length > 0 ? " text-[var(--ui-success)]" : " text-[var(--ui-muted)]"}>
                  {devices.length > 0
                    ? ` ${devices.length} impresora(s) encontrada(s)`
                    : " Ninguna detectada aún"}
                </span>
              </div>
            </li>
          </ul>
        </div>

        {/* Paso 1: Instalar Zebra Browser Print */}
        <section className="ui-panel space-y-4">
          <div className="ui-h3">Paso 1: Instalar Zebra Browser Print</div>
          <p className="ui-body-muted">
            Zebra Browser Print es un puente entre el navegador y las impresoras Zebra. Sin él, la web no puede enviar etiquetas a la impresora.
          </p>
          <ol className="list-decimal list-inside space-y-2 ui-body-muted">
            <li>
              Descarga desde la{" "}
              <a
                href="https://www.zebra.com/us/en/support-downloads/software/printer-software/zebra-browser-print.html"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline text-[var(--ui-brand-600)]"
              >
                página oficial de Zebra
              </a>{" "}
              (necesitas crear cuenta o iniciar sesión).
            </li>
            <li>Ejecuta el instalador y acepta los valores por defecto.</li>
            <li>Reinicia el navegador después de instalar.</li>
            <li>Verifica que el icono de Zebra Browser Print aparezca en la bandeja del sistema (junto al reloj). Si no está, búscalo en el menú Inicio y ábrelo.</li>
          </ol>
          <div className="ui-alert ui-alert--neutral">
            <strong>Importante:</strong> El servicio debe estar en ejecución. Si no ves el icono en la bandeja, abre &quot;Zebra Browser Print&quot; desde el menú de Windows.
          </div>
        </section>

        {/* Paso 2: Emparejar Bluetooth (si aplica) */}
        <section className="ui-panel space-y-4">
          <div className="ui-h3">Paso 2: Emparejar impresora Bluetooth (si usas Bluetooth)</div>
          <p className="ui-body-muted">
            Si tu impresora Zebra es Bluetooth, debes emparejarla primero con Windows. El navegador no puede hacer el pairing directamente.
          </p>
          <ol className="list-decimal list-inside space-y-2 ui-body-muted">
            <li>
              <strong>Enciende la impresora</strong> y ponla en modo emparejamiento (en muchos modelos Zebra: mantén pulsado el botón FEED unos 5 segundos hasta que parpadee el LED azul).
            </li>
            <li>
              En Windows, ve a <strong>Configuración → Bluetooth y dispositivos</strong> (o el icono de Bluetooth en la bandeja).
            </li>
            <li>Pulsa &quot;Agregar dispositivo&quot; o &quot;Agregar dispositivo Bluetooth u otro&quot;.</li>
            <li>Selecciona &quot;Bluetooth&quot; y espera a que aparezca tu impresora (ej. &quot;ZDxxxx&quot;, &quot;Zebra ZD...&quot;).</li>
            <li>Haz clic en la impresora para emparejar. Si pide PIN, prueba <strong>0000</strong> o <strong>1234</strong>.</li>
            <li>Cuando Windows indique &quot;Conectado&quot;, la impresora ya está disponible para Zebra Browser Print.</li>
          </ol>
          <div className="ui-alert ui-alert--warn">
            <strong>USB / Red:</strong> Si usas USB o impresora de red, no necesitas Bluetooth. Conéctala por cable o asegúrate de que esté en la misma red y accesible.
          </div>
        </section>

        {/* Paso 3: Detectar y conectar */}
        <section className="ui-panel space-y-4">
          <div className="ui-h3">Paso 3: Detectar impresoras y probar</div>
          <p className="ui-body-muted">
            Una vez instalado Browser Print y emparejada la impresora (si es Bluetooth), detecta los dispositivos.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleDetect}
              disabled={!browserPrintOk}
              className="ui-btn ui-btn--brand disabled:opacity-50"
            >
              Detectar impresoras
            </button>
            {detectCount !== null && (
              <span className="ui-body-muted">
                {detectCount === 0 ? "No se encontraron impresoras." : `${detectCount} impresora(s) detectada(s).`}
              </span>
            )}
          </div>
          {!browserPrintOk && (
            <p className="ui-caption text-[var(--ui-muted)]">
              Primero instala Zebra Browser Print y recarga la página.
            </p>
          )}
          {devices.length > 0 && (
            <div className="space-y-2">
              <span className="ui-label">Seleccionar impresora</span>
              <select
                value={selectedUid}
                onChange={(e) => setSelectedUid(e.target.value)}
                className="ui-input max-w-md"
              >
                <option value="">(Elegir)</option>
                {devices.map((d) => (
                  <option key={String(d.uid)} value={String(d.uid)}>
                    {String(d.name ?? d.uid)} {d.connection ? `(${d.connection})` : ""}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => connectSelected()}
                  className="ui-btn ui-btn--ghost ui-btn--sm"
                >
                  {isConnected ? "Conectada" : "Conectar"}
                </button>
                {isConnected && (
                  <span className="ui-caption text-[var(--ui-success)] flex items-center">Lista para imprimir</span>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Ir a imprimir */}
        <div className="ui-panel ui-panel--halo p-6 text-center">
          <div className="ui-h3">¿Todo listo?</div>
          <p className="mt-2 ui-body-muted">
            Si Browser Print está OK y la impresora está detectada, ya puedes imprimir etiquetas.
          </p>
          <Link href="/printing/jobs" className="mt-4 inline-block ui-btn ui-btn--brand">
            Ir a imprimir etiquetas
          </Link>
        </div>

        {/* Enlaces útiles */}
        <div className="ui-panel-soft p-4">
          <div className="ui-caption font-semibold text-[var(--ui-text)]">Enlaces útiles</div>
          <ul className="mt-2 space-y-1 ui-caption text-[var(--ui-muted)]">
            <li>
              <a
                href="https://www.zebra.com/us/en/support-downloads/software/printer-software/zebra-browser-print.html"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[var(--ui-text)]"
              >
                Zebra Browser Print (descarga)
              </a>
            </li>
            <li>
              <a
                href="https://docs.zebra.com/us/en/software/zebra-print-ug/adding-a-printer/adding-a-printer-via-bluetooth.html"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[var(--ui-text)]"
              >
                Guía Zebra: agregar impresora vía Bluetooth
              </a>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
