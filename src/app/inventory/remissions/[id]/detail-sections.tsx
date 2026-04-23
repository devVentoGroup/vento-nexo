import Link from "next/link";

type TraceabilityItem = {
  label: string;
  value: string;
  at?: string;
  done?: boolean;
};

type HeroProps = {
  backHref: string;
  backLabel: string;
  phaseLabel: string | null;
  statusLabel: string;
  statusClassName: string;
  requestId: string;
  fromSiteName: string;
  toSiteName: string;
  compactSatelliteView: boolean;
  itemCount: number;
  activeSignals: number;
  expectedDateLabel: string;
  responsibleActor: string;
  traceability?: TraceabilityItem[];
};

function TraceabilityRows({
  traceability,
  compact = false,
}: {
  traceability: TraceabilityItem[];
  compact?: boolean;
}) {
  if (!traceability.length) {
    return <div className="ui-caption">Sin trazabilidad visible todavia.</div>;
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-1 ui-caption"}>
      {traceability.map((item) => (
        <div
          key={item.label}
          className={
            compact
              ? "rounded-xl border border-[var(--ui-border)] bg-white/85 px-3 py-2"
              : undefined
          }
        >
          <div className={compact ? "flex flex-wrap items-center justify-between gap-2" : undefined}>
            <div className={compact ? "text-xs font-semibold text-[var(--ui-muted)]" : undefined}>
              <strong>{item.label}:</strong> {!compact ? item.value : null}
            </div>
            {compact ? (
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                  item.done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                {item.done ? "Firmado" : "Pendiente"}
              </span>
            ) : null}
          </div>
          {compact ? (
            <div className="mt-1 text-sm text-[var(--ui-text)]">
              <strong>{item.value || "-"}</strong>
            </div>
          ) : null}
          <div className={compact ? "mt-1 text-xs text-[var(--ui-muted)]" : "text-[var(--ui-muted)]"}>
            {item.at ? item.at : compact ? "Sin fecha/hora registrada" : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RemissionHeroSection(props: HeroProps) {
  const {
    backHref,
    backLabel,
    phaseLabel,
    statusLabel,
    statusClassName,
    requestId,
    fromSiteName,
    toSiteName,
    compactSatelliteView,
    itemCount,
    activeSignals,
    expectedDateLabel,
    responsibleActor,
    traceability = [],
  } = props;

  return (
    <section
      className="ui-remission-hero ui-fade-up"
      data-context={compactSatelliteView ? "satellite" : "center"}
    >
      <div className="ui-remission-hero-grid">
        <div>
          <Link href={backHref} className="ui-caption underline">
            {backLabel}
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {phaseLabel ? <span className="ui-chip ui-chip--brand">{phaseLabel}</span> : null}
            <span
              className={`ui-chip ${compactSatelliteView ? "ui-chip--ops-satellite" : "ui-chip--ops-center"}`}
            >
              {compactSatelliteView ? "Satelite" : "Centro"}
            </span>
            <span className={statusClassName}>{statusLabel}</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
            Remision #{String(requestId).slice(0, 8)}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-muted)] sm:text-base">
            {fromSiteName || "-"} → {toSiteName || "-"}
          </p>
        </div>
        {compactSatelliteView ? (
          <div className="ui-remission-kpis">
            <div
              className="ui-remission-kpi"
              data-tone={statusLabel === "Recibida" ? "success" : "cool"}
            >
              <div className="ui-remission-kpi-label">Lineas</div>
              <div className="ui-remission-kpi-value">{itemCount}</div>
              <div className="ui-remission-kpi-note">
                {statusLabel === "Recibida" ? "Productos conciliados" : "Productos por revisar"}
              </div>
            </div>
            <div className="ui-remission-kpi" data-tone={activeSignals > 0 ? "warm" : "success"}>
              <div className="ui-remission-kpi-label">Entrega</div>
              <div className="ui-remission-kpi-value">{activeSignals}</div>
              <div className="ui-remission-kpi-note">{expectedDateLabel}</div>
            </div>
          </div>
        ) : (
          <div className="ui-remission-kpis">
            <div className="ui-remission-kpi">
              <div className="ui-remission-kpi-label">Actor actual</div>
              <div className="mt-2 text-base font-semibold text-[var(--ui-text)]">{responsibleActor}</div>
              <div className="ui-remission-kpi-note">Responsable operativo visible</div>
            </div>
            <div className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Lineas</div>
              <div className="ui-remission-kpi-value">{itemCount}</div>
              <div className="ui-remission-kpi-note">Items dentro de la remision</div>
            </div>
            <div className="ui-remission-kpi" data-tone={activeSignals > 0 ? "warm" : "success"}>
              <div className="ui-remission-kpi-label">Senales activas</div>
              <div className="ui-remission-kpi-value">{activeSignals}</div>
              <div className="ui-remission-kpi-note">{expectedDateLabel}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

type SummaryProps = {
  compactSatelliteView: boolean;
  fromSiteName: string;
  toSiteName: string;
  expectedDateLabel: string;
  createdAtLabel: string;
  notes: string;
  currentStatusClassName: string;
  currentStatusLabel: string;
  stateSupportText: string;
  responsibleActor: string;
  traceability?: TraceabilityItem[];
};

export function RemissionSummarySection(props: SummaryProps) {
  const {
    compactSatelliteView,
    fromSiteName,
    toSiteName,
    expectedDateLabel,
    createdAtLabel,
    notes,
    currentStatusClassName,
    currentStatusLabel,
    stateSupportText,
    responsibleActor,
    traceability = [],
  } = props;

  if (compactSatelliteView) {
    return (
      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ui-h3">Resumen</div>
            <div className="mt-3 ui-body">
              Llega desde <strong>{fromSiteName || "-"}</strong> hacia <strong>{toSiteName || "-"}</strong>.
            </div>
            <div className="mt-2 ui-caption">
              {currentStatusLabel === "Recibida" ? "Entrega registrada: " : "Entrega esperada: "}
              {expectedDateLabel}
            </div>
            {notes && notes !== "-" ? <div className="mt-2 ui-caption">Nota: {notes}</div> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={currentStatusClassName}>{currentStatusLabel}</span>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-[rgba(200,210,220,0.8)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,247,251,0.96)_100%)] px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ui-muted)]">
            Firmas del flujo
          </div>
          <div className="mt-3">
            <TraceabilityRows traceability={traceability} compact />
          </div>
        </div>
        <div className="mt-3 ui-caption">{stateSupportText}</div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-1">
        <div className="ui-h3">Detalle</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5 ui-body">
          <div>
            <div className="ui-caption">Origen</div>
            <div>{fromSiteName || "-"}</div>
          </div>
          <div>
            <div className="ui-caption">Destino</div>
            <div>{toSiteName || "-"}</div>
          </div>
          <div>
            <div className="ui-caption">Creada</div>
            <div>{createdAtLabel}</div>
          </div>
          <div>
            <div className="ui-caption">Fecha esperada</div>
            <div>{expectedDateLabel}</div>
          </div>
          <div>
            <div className="ui-caption">Notas</div>
            <div>{notes || "-"}</div>
          </div>
        </div>
      </div>

      <div className="ui-panel ui-panel--halo ui-remission-section ui-fade-up ui-delay-2">
        <div className="ui-h3">Estado</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={currentStatusClassName}>{currentStatusLabel}</span>
        </div>
        <div className="mt-3 ui-caption">
          Actor actual: <strong>{responsibleActor}</strong>
        </div>
        <div className="mt-4 rounded-2xl border border-[rgba(200,210,220,0.8)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,247,251,0.96)_100%)] px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ui-muted)]">
            Trazabilidad
          </div>
          <div className="mt-2">
            <TraceabilityRows traceability={traceability} />
          </div>
        </div>
        <div className="mt-3 ui-caption">{stateSupportText}</div>
      </div>
    </div>
  );
}
