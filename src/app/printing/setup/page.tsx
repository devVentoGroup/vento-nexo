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

        {/* Paso 2A: Bluetooth — activar descubrimiento */}
        <section className="ui-panel space-y-4">
          <div className="ui-h3">Paso 2: Conectar impresora por Bluetooth</div>
          <div className="ui-alert ui-alert--warn">
            <strong>Importante:</strong> Las impresoras Zebra NO son visibles por Bluetooth de fabrica. Primero debes activar el modo descubrimiento conectandola por USB y usando Zebra Setup Utility.
          </div>
          <div className="ui-h3 mt-4">A. Activar Bluetooth en la impresora (una sola vez)</div>
          <ol className="list-decimal list-inside space-y-2 ui-body-muted">
            <li>
              <strong>Conecta la impresora por USB</strong> al PC con un cable USB.
            </li>
            <li>
              Descarga e instala{" "}
              <a href="https://www.zebra.com/us/en/support-downloads/printer-software/printer-setup-utilities.html" target="_blank" rel="noopener noreferrer" className="font-medium underline text-[var(--ui-brand-600)]">
                Zebra Setup Utility (ZSU)
              </a>{" "}
              si no lo tienes. Es gratuito.
            </li>
            <li>Abre <strong>Zebra Setup Utility</strong>. Tu impresora deberia aparecer en la lista (conectada por USB).</li>
            <li>Selecciona la impresora y haz clic en <strong>&quot;Configure Printer Connectivity&quot;</strong>.</li>
            <li>Selecciona <strong>Bluetooth</strong> en el wizard.</li>
            <li>Configura un <strong>friendly name</strong> (ej. &quot;Zebra-Bodega&quot;) y un <strong>PIN</strong> (ej. &quot;1234&quot;).</li>
            <li>Haz clic en <strong>&quot;Apply&quot;</strong>. La impresora se reiniciara (es normal).</li>
            <li><strong>Desconecta el cable USB.</strong></li>
          </ol>

          <div className="ui-h3 mt-4">B. Emparejar en Windows</div>
          <ol className="list-decimal list-inside space-y-2 ui-body-muted">
            <li>Enciende la impresora (sin USB).</li>
            <li>En Windows: <strong>Configuracion → Bluetooth y dispositivos → Agregar dispositivo</strong>.</li>
            <li>Selecciona <strong>&quot;Bluetooth&quot;</strong>.</li>
            <li>Espera a que aparezca la impresora con el friendly name que configuraste (ej. &quot;Zebra-Bodega&quot;).</li>
            <li>Haz clic para emparejar. Ingresa el <strong>PIN</strong> que configuraste (ej. 1234).</li>
            <li>Windows muestra &quot;Conectado&quot; — listo.</li>
          </ol>

          <div className="ui-alert ui-alert--neutral mt-4">
            <strong>Troubleshooting:</strong>
            <ul className="mt-2 list-disc list-inside space-y-1">
              <li>Si la impresora no aparece: reiniciala y espera 30 segundos antes de buscar.</li>
              <li>Si ya fue emparejada antes y falla: ve a &quot;Bluetooth y dispositivos&quot;, elimina la impresora y repite desde el paso B.1.</li>
              <li>Si ZSU no detecta la impresora por USB: instala el driver <strong>zDesigner</strong> desde la pagina de Zebra.</li>
              <li>Algunos modelos (ZD220, ZD230 basicos) NO tienen Bluetooth integrado — verifica el modelo exacto.</li>
            </ul>
          </div>
        </section>

        {/* Paso 2B: Alternativa USB */}
        <section className="ui-panel space-y-4">
          <div className="ui-h3">Alternativa: USB directo (sin Bluetooth)</div>
          <p className="ui-body-muted">
            Si no necesitas Bluetooth, conecta la impresora por USB directamente. Es mas rapido y estable.
          </p>
          <ol className="list-decimal list-inside space-y-2 ui-body-muted">
            <li>Conecta el cable USB entre la impresora y el PC.</li>
            <li>Windows instalara el driver automaticamente (o instala el driver zDesigner manualmente).</li>
            <li>Zebra Browser Print la detectara como dispositivo USB.</li>
          </ol>
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

        {/* Solución de problemas: DataMatrix borroso */}
        <section className="ui-panel space-y-3">
          <div className="ui-h3">DataMatrix borroso o no escaneable</div>
          <p className="ui-body-muted">
            Si el DataMatrix imprime como si la tinta se corriera y el QR sale bien, prueba:
          </p>
          <ul className="list-inside list-disc space-y-1 ui-body-muted">
            <li>
              <strong>Usa el preset LOC QR grande</strong> en lugar de DataMatrix – el QR imprime más limpio y abre el retiro igual.
            </li>
            <li>
              <strong>Reduce la oscuridad</strong> en la impresora (Zebra Setup Utility → Print Darkness / ^MD) si el DataMatrix sangra.
            </li>
            <li>
              <strong>Ajusta el módulo</strong> en Ajustes avanzados (DPI y Módulo DM) – prueba valores entre 6 y 10.
            </li>
          </ul>
        </section>

        {/* Enlaces útiles */}
        <div className="ui-panel-soft p-4">
          <div className="ui-caption font-semibold text-[var(--ui-text)]">Enlaces útiles</div>
          <ul className="mt-2 space-y-1 ui-caption text-[var(--ui-muted)]">
            <li>
              <a href="https://www.zebra.com/us/en/support-downloads/software/printer-software/zebra-browser-print.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--ui-text)]">
                Zebra Browser Print (descarga)
              </a>
            </li>
            <li>
              <a href="https://www.zebra.com/us/en/support-downloads/printer-software/printer-setup-utilities.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--ui-text)]">
                Zebra Setup Utility (para configurar Bluetooth)
              </a>
            </li>
            <li>
              <a href="https://docs.zebra.com/us/en/software/zebra-print-ug/adding-a-printer/adding-a-printer-via-bluetooth.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--ui-text)]">
                Guia Zebra: agregar impresora via Bluetooth
              </a>
            </li>
            <li>
              <a href="https://supportcommunity.zebra.com/articles/en_US/Knowledge/Windows-10-Bluetooth-Setup-with-Zebra-Printers" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--ui-text)]">
                Guia: Bluetooth en Windows 10/11 con Zebra
              </a>
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
