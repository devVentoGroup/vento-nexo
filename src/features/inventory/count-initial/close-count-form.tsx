"use client";

type Props = {
  sessionId: string;
  closeAction: (formData: FormData) => Promise<void>;
};

export function CloseCountForm({ sessionId, closeAction }: Props) {
  return (
    <form action={closeAction} className="ui-panel">
      <div className="ui-h3">Cerrar conteo (Fase 3.2–3.3)</div>
      <p className="mt-1 ui-body-muted">
        Al cerrar se calculan las diferencias (contado vs actual en sistema). Luego podrás aprobar los ajustes.
      </p>
      <div className="mt-4">
        <input type="hidden" name="session_id" value={sessionId} />
        <button type="submit" className="ui-btn ui-btn--brand">
          Cerrar conteo
        </button>
      </div>
    </form>
  );
}
