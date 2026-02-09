"use client";

import { useRef } from "react";

type Props = {
  action: (formData: FormData) => Promise<void>;
  routeId: string;
};

export function DeleteRouteForm({ action, routeId }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm("¿Eliminar esta ruta?")) return;
    const formData = new FormData(formRef.current ?? undefined);
    action(formData);
  }

  return (
    <form ref={formRef} action={action} className="inline">
      <input type="hidden" name="id" value={routeId} />
      <button type="button" onClick={handleSubmit} className="ui-btn ui-btn--danger ui-btn--sm">
        Eliminar
      </button>
    </form>
  );
}
