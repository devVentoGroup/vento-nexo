"use client";

import { useMemo, useState } from "react";
import { EntriesItems } from "./entries-items";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
};

type LocationOption = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type Props = {
  products: ProductOption[];
  locations: LocationOption[];
  defaultLocationId?: string;
  action: (formData: FormData) => void | Promise<void>;
};

type EntryStatus = "pending" | "partial" | "received";

function statusChip(status: EntryStatus) {
  switch (status) {
    case "pending":
      return { label: "Pendiente", className: "ui-chip ui-chip--warn" };
    case "partial":
      return { label: "Parcial", className: "ui-chip ui-chip--warn" };
    case "received":
      return { label: "Recibida", className: "ui-chip ui-chip--success" };
    default:
      return { label: "Pendiente", className: "ui-chip ui-chip--warn" };
  }
}

export function EntriesForm({ products, locations, defaultLocationId, action }: Props) {
  const [status, setStatus] = useState<EntryStatus>("pending");
  const statusView = useMemo(() => statusChip(status), [status]);

  return (
    <form
      className="space-y-6"
      action={action}
    >
      <input type="hidden" name="entry_status" value={status} />
      <div className="ui-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Nueva entrada</div>
            <div className="mt-1 ui-body-muted">
              Registro manual por factura. Permite recepción parcial.
            </div>
          </div>
          <span className={statusView.className}>{statusView.label}</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Proveedor</span>
            <input name="supplier_name" className="ui-input" placeholder="Nombre proveedor" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Factura (opcional)</span>
            <input name="invoice_number" className="ui-input" placeholder="FAC-0001" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Fecha de recepción</span>
            <input type="date" name="received_at" className="ui-input" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Notas</span>
            <input name="notes" className="ui-input" placeholder="Observaciones" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setStatus("pending")}>
            Pendiente
          </button>
          <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setStatus("partial")}>
            Recibir parcial
          </button>
          <button type="button" className="ui-btn ui-btn--brand" onClick={() => setStatus("received")}>
            Recibir completo
          </button>
        </div>
      </div>

      <div className="ui-panel">
        <div className="ui-h3">Ítems recibidos</div>
        <div className="mt-2 ui-body-muted">
          Declara cantidades y lo recibido. El sistema marcará parciales cuando aplique.
        </div>
        <div className="mt-4">
          <EntriesItems
            products={products}
            locations={locations}
            defaultLocationId={defaultLocationId}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="ui-btn ui-btn--brand">
          Guardar entrada
        </button>
      </div>
    </form>
  );
}
