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
      <button type="submit" className="text-sm text-red-600 hover:underline">
        Eliminar
      </button>
    </form>
  );
}
