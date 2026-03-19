import { updateStatus } from "./detail-actions";

type RemissionTopActionsProps = {
  title: string;
  requestId: string;
  returnOrigin: string;
  siteId: string;
  canPreparePending: boolean;
  canStartPreparationNow: boolean;
  pendingLocSelectionLines: number;
  canTransitAction: boolean;
  canTransitNow: boolean;
  dispatchBlockedLines: number;
  canReceiveAction: boolean;
  canReceivePartialAction: boolean;
  hasPrimaryTopAction: boolean;
};

export function RemissionTopActions(props: RemissionTopActionsProps) {
  const {
    title,
    requestId,
    returnOrigin,
    siteId,
    canPreparePending,
    canStartPreparationNow,
    pendingLocSelectionLines,
    canTransitAction,
    canTransitNow,
    dispatchBlockedLines,
    canReceiveAction,
    canReceivePartialAction,
    hasPrimaryTopAction,
  } = props;

  return (
    <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
      <div className="ui-h3">{title}</div>
      <div className="mt-4 flex flex-col gap-3">
        {canPreparePending ? (
          <>
            <form action={updateStatus}>
              <input type="hidden" name="request_id" value={requestId} />
              <input type="hidden" name="return_origin" value={returnOrigin} />
              <input type="hidden" name="site_id" value={siteId} />
              <input type="hidden" name="action" value="prepare" />
              <button
                disabled={!canStartPreparationNow}
                aria-disabled={!canStartPreparationNow}
                className="ui-btn ui-btn--action ui-btn--compact w-full text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:min-w-[180px]"
              >
                Empezar preparación
              </button>
            </form>
            {!canStartPreparationNow ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Selecciona un LOC en las <strong>{pendingLocSelectionLines}</strong> línea(s) faltantes para habilitar la preparación.
              </div>
            ) : null}
          </>
        ) : null}

        {canTransitAction ? (
          canTransitNow ? (
            <form action={updateStatus}>
              <input type="hidden" name="request_id" value={requestId} />
              <input type="hidden" name="return_origin" value={returnOrigin} />
              <input type="hidden" name="site_id" value={siteId} />
              <input type="hidden" name="action" value="transit" />
              <button className="ui-btn ui-btn--action ui-btn--compact w-full text-sm font-semibold sm:w-auto sm:min-w-[180px]">
                Despachar a destino
              </button>
            </form>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Aún no puedes despachar. Faltan <strong>{dispatchBlockedLines}</strong> linea(s) por completar.
            </div>
          )
        ) : null}

        {canReceiveAction ? (
          <form action={updateStatus}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="return_origin" value={returnOrigin} />
            <input type="hidden" name="site_id" value={siteId} />
            <input type="hidden" name="action" value="receive" />
            <button className="ui-btn ui-btn--action ui-btn--compact w-full text-sm font-semibold sm:w-auto sm:min-w-[180px]">
              Confirmar recepción
            </button>
          </form>
        ) : null}

        {canReceivePartialAction ? (
          <form action={updateStatus}>
            <input type="hidden" name="request_id" value={requestId} />
            <input type="hidden" name="return_origin" value={returnOrigin} />
            <input type="hidden" name="site_id" value={siteId} />
            <input type="hidden" name="action" value="receive_partial" />
            <button className="ui-btn ui-btn--action ui-btn--compact w-full text-sm font-semibold sm:w-auto sm:min-w-[180px]">
              Guardar recepcion parcial
            </button>
          </form>
        ) : null}
      </div>

      {!hasPrimaryTopAction ? (
        <div className="mt-3 ui-caption">
          Completa primero las líneas para desbloquear la siguiente acción.
        </div>
      ) : null}
    </div>
  );
}
