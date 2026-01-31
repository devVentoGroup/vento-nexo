import { ScannerPanel } from "@/features/scanner/scanner-panel";

export default function ScannerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="ui-h1">Scanner</h1>
        <p className="mt-2 ui-body-muted max-w-2xl">
          Escanea etiquetas LOC/LPN/AST. Formato recomendado:{" "}
          <span className="font-mono">VENTO|TYPE|CODE</span>.
        </p>
      </div>

      <ScannerPanel />

      <div className="ui-panel">
        <div className="ui-h3">Regla</div>
        <div className="mt-1 ui-body-muted">
          LOC navega a <span className="font-mono">/inventory/locations</span> y LPN a{" "}
          <span className="font-mono">/inventory/lpns</span>, ambos con{" "}
          <span className="font-mono">?code=</span>.
        </div>
      </div>
    </div>
  );
}

