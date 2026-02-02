"use client";

import { TransfersItems } from "./transfers-items";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
};

type LocOption = {
  id: string;
  code: string | null;
  name: string | null;
};

type Props = {
  locations: LocOption[];
  products: ProductOption[];
  action: (formData: FormData) => void | Promise<void>;
};

export function TransfersForm({ locations, products, action }: Props) {
  return (
    <form className="space-y-6" action={action}>
      <div className="ui-panel">
        <div className="ui-h3">Nuevo traslado interno</div>
        <div className="mt-2 ui-body-muted">
          Registra el movimiento entre LOCs dentro de la misma sede.
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="ui-label">LOC origen</span>
            <select name="from_loc_id" className="ui-input" defaultValue="">
              <option value="" disabled>
                Selecciona LOC origen
              </option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code ?? loc.name ?? loc.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">LOC destino</span>
            <select name="to_loc_id" className="ui-input" defaultValue="">
              <option value="" disabled>
                Selecciona LOC destino
              </option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code ?? loc.name ?? loc.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="ui-label">Notas</span>
            <input name="notes" className="ui-input" placeholder="Observaciones" />
          </label>
        </div>
      </div>

      <div className="ui-panel">
        <div className="ui-h3">Ítems</div>
        <div className="mt-2 ui-body-muted">
          Define productos y cantidades a mover.
        </div>
        <div className="mt-4">
          <TransfersItems products={products} />
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="ui-btn ui-btn--brand">
          Registrar traslado
        </button>
      </div>
    </form>
  );
}
