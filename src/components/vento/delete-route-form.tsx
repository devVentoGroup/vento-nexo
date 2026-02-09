"use client";

type Props = {
  action: (formData: FormData) => Promise<void>;
  routeId: string;
};

export function DeleteRouteForm({ action, routeId }: Props) {
  return (
    <form
      action={action}
      className="inline"
      onSubmit={(e) => {
        if (!confirm("¿Eliminar esta ruta?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={routeId} />
      <button type="submit" className="ui-btn ui-btn--danger text-sm">
        Eliminar
      </button>
    </form>
  );
}
