import { ScannerPanel } from "@/features/scanner/scanner-panel";

export default function ScannerPage() {
  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="ui-h1">Scanner</h1>
        <p className="mt-2 ui-body-muted max-w-2xl">
          Escanea etiquetas LOC (DataMatrix o QR) o pega el código. Tras escanear un LOC puedes ir a la ubicación o abrir retiro directamente.
        </p>
      </div>

      <ScannerPanel />

      <div className="ui-panel-soft">
        <div className="ui-caption font-semibold text-[var(--ui-muted)]">Formato y uso</div>
        <ul className="mt-2 list-inside list-disc space-y-1 ui-body-muted text-sm">
          <li><span className="font-mono">VENTO|LOC|CODE</span> o solo <span className="font-mono">LOC-…</span> → acciones: Ver ubicación, Abrir retiro.</li>
          <li><span className="font-mono">VENTO|AST|CODE</span> → ficha técnica (VISO).</li>
          <li>Otro código → opción “Buscar en ubicaciones”.</li>
          <li>Escáner tipo teclado (Bluetooth/USB) o cámara (QR / DataMatrix si el navegador lo soporta).</li>
        </ul>
      </div>
    </div>
  );
}

