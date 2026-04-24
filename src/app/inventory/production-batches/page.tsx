import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const FOGO_BASE_URL =
  process.env.NEXT_PUBLIC_FOGO_URL?.replace(/\/$/, "") ||
  "https://fogo.ventogroup.co";

function buildFogoProductionBatchesUrl(siteId?: string | null) {
  const url = new URL("/production-batches", FOGO_BASE_URL);
  url.searchParams.set("source", "nexo");
  if (siteId) url.searchParams.set("site_id", siteId);
  return url.toString();
}

export default async function ProductionBatchesInfoPage() {
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/production-batches",
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("site_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data: settings } = await supabase
    .from("employee_settings")
    .select("selected_site_id")
    .eq("employee_id", user.id)
    .maybeSingle();

  const activeSiteId = settings?.selected_site_id ?? employee?.site_id ?? "";
  const fogoHref = buildFogoProductionBatchesUrl(activeSiteId);

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="ui-caption">Producción + impresión</div>
              <h1 className="ui-h1">Lotes de producción</h1>
              <p className="ui-body-muted max-w-2xl">
                El lote ya no debe operarse en NEXO como flujo legacy. La producción vive en FOGO y desde ese lote debe salir
                la etiqueta de producto con fecha, hora, vencimiento y trazabilidad lista para Zebra.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={fogoHref} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn--brand">
                Abrir lotes en FOGO
              </a>
              <Link href="/printing/jobs" className="ui-btn ui-btn--ghost">
                Ver impresión rápida
              </Link>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Origen</div>
              <div className="ui-remission-kpi-value">FOGO</div>
              <div className="ui-remission-kpi-note">Receta, ejecución y cierre de lote</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Impresión</div>
              <div className="ui-remission-kpi-value">Zebra</div>
              <div className="ui-remission-kpi-note">Etiqueta diaria desde lote cerrado</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Sede activa</div>
              <div className="ui-remission-kpi-value">{activeSiteId ? "OK" : "?"}</div>
              <div className="ui-remission-kpi-note">{activeSiteId || "Sin sede activa detectada"}</div>
            </article>
          </div>
        </div>
      </section>

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1 space-y-4">
        <div className="ui-h3">Flujo correcto</div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="ui-panel-soft p-4">
            <div className="ui-caption">1. Planeación</div>
            <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">FOGO define qué se produce</div>
          </div>
          <div className="ui-panel-soft p-4">
            <div className="ui-caption">2. Ejecución</div>
            <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">Se crea el lote real con receta activa</div>
          </div>
          <div className="ui-panel-soft p-4">
            <div className="ui-caption">3. Metadatos</div>
            <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">Producto, batch, prod, exp, responsable</div>
          </div>
          <div className="ui-panel-soft p-4">
            <div className="ui-caption">4. Etiqueta</div>
            <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">Imprimir desde el lote, no desde texto libre</div>
          </div>
        </div>
      </section>

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-2 space-y-4">
        <div className="ui-h3">Etiquetas que deben salir de ese lote</div>
        <div className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
            <div className="text-sm font-semibold text-[var(--ui-text)]">Producto terminado</div>
            <ul className="mt-3 space-y-1 text-sm text-[var(--ui-muted)]">
              <li>Producto</li>
              <li>Batch code</li>
              <li>Fecha y hora de producción</li>
              <li>Fecha de vencimiento</li>
              <li>Cantidad / unidad</li>
              <li>Responsable / turno</li>
            </ul>
          </article>
          <article className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
            <div className="text-sm font-semibold text-[var(--ui-text)]">Preparación</div>
            <ul className="mt-3 space-y-1 text-sm text-[var(--ui-muted)]">
              <li>Producto / preparación</li>
              <li>Batch code</li>
              <li>Fecha y hora</li>
              <li>Fecha de vencimiento</li>
              <li>Área destino</li>
              <li>Responsable</li>
            </ul>
          </article>
          <article className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
            <div className="text-sm font-semibold text-[var(--ui-text)]">Mezcla porcionada</div>
            <ul className="mt-3 space-y-1 text-sm text-[var(--ui-muted)]">
              <li>Producto base / sublote</li>
              <li>Lote padre</li>
              <li>Peso o porción</li>
              <li>Fecha y hora</li>
              <li>Fecha de vencimiento</li>
              <li>QR del lote / sublote</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-3 space-y-3">
        <div className="ui-h3">Qué queda pendiente</div>
        <ul className="space-y-2 text-sm text-[var(--ui-muted)]">
          <li>La creación del lote debe ejecutarse en FOGO, no en NEXO.</li>
          <li>La etiqueta debe nacer prellenada desde `production_batches`.</li>
          <li>La Zebra debe recibir trabajos de impresión desde lote, no desde cola manual.</li>
          <li>La cola manual de `/printing/jobs` queda como soporte y reimpresión, no como núcleo del flujo diario.</li>
        </ul>
      </section>
    </div>
  );
}
