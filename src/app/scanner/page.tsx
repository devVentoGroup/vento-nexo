import { ScannerPanel } from "@/features/scanner/scanner-panel";

export default function ScannerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scanner</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
          Escanea etiquetas LOC/LPN/AST. Formato recomendado:{" "}
          <span className="font-mono">VENTO|TYPE|CODE</span>.
        </p>
      </div>

      <ScannerPanel />

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Regla</div>
        <div className="mt-1 text-sm text-zinc-600">
          LOC navega a <span className="font-mono">/inventory/locations</span> y LPN a{" "}
          <span className="font-mono">/inventory/lpns</span>, ambos con{" "}
          <span className="font-mono">?code=</span>.
        </div>
      </div>
    </div>
  );
}
