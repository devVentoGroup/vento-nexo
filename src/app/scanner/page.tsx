import { ScannerPanel } from "@/features/scanner/scanner-panel";

export default function ScannerPage() {
  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <h1 className="ui-h1">Scanner</h1>
              <p className="ui-body-muted max-w-2xl">
                Escanea etiquetas LOC o pega el código para saltar rápido a la acción correcta desde celular o tablet.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                QR + DataMatrix
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                LOC y AST
              </span>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">LOC</div>
              <div className="ui-remission-kpi-value">Retiro</div>
              <div className="ui-remission-kpi-note">Abre retiro o ubicación desde el código escaneado</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">AST</div>
              <div className="ui-remission-kpi-value">Ficha</div>
              <div className="ui-remission-kpi-note">Preparado para enlazar ficha técnica en VISO</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Modo</div>
              <div className="ui-remission-kpi-value">Móvil</div>
              <div className="ui-remission-kpi-note">Pensado para cámara o escáner tipo teclado</div>
            </article>
          </div>
        </div>
      </section>

      <ScannerPanel />

      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-3">
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
            <span className="font-mono">VENTO|LOC|CODE</span> o <span className="font-mono">LOC-...</span>
          </div>
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
            <span className="font-mono">VENTO|AST|CODE</span>
          </div>
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
            Cualquier otro código se puede buscar en ubicaciones
          </div>
        </div>
      </div>
    </div>
  );
}

