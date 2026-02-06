"use client";

type LocRow = {
  id: string;
  code: string | null;
  zone: string | null;
  aisle: string | null;
  level: string | null;
  description?: string | null;
};

type Props = {
  loc: LocRow;
  action: (formData: FormData) => Promise<void>;
  cancelHref: string;
};

export function LocEditForm({ loc, action, cancelHref }: Props) {
  return (
    <div className="mt-6 ui-panel ui-panel--halo">
      <div className="ui-h3">Editar LOC</div>
      <p className="mt-1 ui-body-muted">
        Modifica código, zona, aisle, level o descripción.
      </p>
      <form action={action} className="mt-4 flex flex-wrap gap-4">
        <input type="hidden" name="loc_id" value={loc.id} />
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-medium">Código</span>
          <input
            type="text"
            name="code"
            defaultValue={loc.code ?? ""}
            required
            className="ui-input min-w-[200px]"
            placeholder="LOC-CP-BOD-EST01"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-medium">Zona</span>
          <input
            type="text"
            name="zone"
            defaultValue={loc.zone ?? ""}
            required
            className="ui-input min-w-[120px]"
            placeholder="BOD, REC, etc."
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-medium">Aisle</span>
          <input
            type="text"
            name="aisle"
            defaultValue={loc.aisle ?? ""}
            className="ui-input min-w-[120px]"
            placeholder="EST01"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-medium">Level</span>
          <input
            type="text"
            name="level"
            defaultValue={loc.level ?? ""}
            className="ui-input min-w-[80px]"
            placeholder="N0"
          />
        </label>
        <label className="flex flex-col gap-1 min-w-[240px] flex-1">
          <span className="ui-caption font-medium">Descripción</span>
          <input
            type="text"
            name="description"
            defaultValue={loc.description ?? ""}
            className="ui-input"
            placeholder="Descripción opcional"
          />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="ui-btn ui-btn--brand">
            Guardar
          </button>
          <a href={cancelHref} className="ui-btn ui-btn--ghost">
            Cancelar
          </a>
        </div>
      </form>
    </div>
  );
}
