"use client";

import { useMemo, useState } from "react";

import { type ProductUomProfile } from "@/lib/inventory/uom";

import { RemissionsItems, type RemissionDraftRow } from "./remissions-items";

type SiteOption = {
  id: string;
  name: string;
};

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code?: string | null;
};

type AreaOption = {
  value: string;
  label: string;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  toSiteId: string;
  toSiteName: string;
  fromSiteOptions: SiteOption[];
  defaultFromSiteId: string;
  products: ProductOption[];
  defaultUomProfiles?: ProductUomProfile[];
  areaOptions: AreaOption[];
};

export function RemissionsCreateForm({
  action,
  toSiteId,
  toSiteName,
  fromSiteOptions,
  defaultFromSiteId,
  products,
  defaultUomProfiles = [],
  areaOptions,
}: Props) {
  const [fromSiteId, setFromSiteId] = useState(defaultFromSiteId);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [draftRows, setDraftRows] = useState<RemissionDraftRow[]>([]);

  const selectedFromSite = useMemo(
    () => fromSiteOptions.find((site) => site.id === fromSiteId) ?? null,
    [fromSiteId, fromSiteOptions]
  );

  const selectedItems = useMemo(() => {
    const productMap = new Map(products.map((product) => [product.id, product]));
    return draftRows
      .map((row) => {
        const product = productMap.get(row.productId);
        const qty = Number(row.quantity);
        return {
          id: row.id,
          name: product?.name ?? "",
          quantity: Number.isFinite(qty) ? qty : 0,
          unit: row.inputUnitCode || product?.stock_unit_code || product?.unit || "un",
          areaKind: row.areaKind,
          valid: Boolean(row.productId && product?.name && Number.isFinite(qty) && qty > 0),
        };
      })
      .filter((item) => item.valid);
  }, [draftRows, products]);

  const totalQuantity = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.quantity, 0),
    [selectedItems]
  );

  const canSubmit = Boolean(fromSiteId) && selectedItems.length > 0 && confirmed;

  return (
    <form action={action} className="space-y-4 pb-24 lg:pb-0">
      <input type="hidden" name="to_site_id" value={toSiteId} />

      <section className="ui-panel space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="ui-h3">Nueva remision</h2>
            <p className="mt-1 ui-caption">
              Flujo v1 rapido: define ruta, agrega items y crea solicitud.
            </p>
          </div>
          <div className="ui-panel-soft px-3 py-2">
            <div className="ui-caption">Destino</div>
            <div className="text-sm font-semibold text-[var(--ui-text)]">{toSiteName}</div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede origen</span>
            <select
              name="from_site_id"
              value={fromSiteId}
              onChange={(event) => setFromSiteId(event.target.value)}
              className="ui-input"
              required
            >
              <option value="">Selecciona origen</option>
              {fromSiteOptions.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Fecha esperada</span>
            <input
              type="date"
              name="expected_date"
              value={expectedDate}
              onChange={(event) => setExpectedDate(event.target.value)}
              className="ui-input"
            />
          </label>

          <label className="flex flex-col gap-1 md:col-span-1">
            <span className="ui-label">Notas</span>
            <input
              name="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notas para bodega"
              className="ui-input"
            />
          </label>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Items</div>
          <p className="mt-1 ui-caption">
            Captura solo productos activos para esta sede. Cantidades en unidad operativa.
          </p>
        </div>
        <RemissionsItems
          products={products}
          areaOptions={areaOptions}
          defaultUomProfiles={defaultUomProfiles}
          onRowsChange={setDraftRows}
        />
      </section>

      <section className="ui-panel space-y-3">
        <div className="ui-h3">Revision rapida</div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="ui-panel-soft px-3 py-2">
            <div className="ui-caption">Origen</div>
            <div className="text-sm font-semibold text-[var(--ui-text)]">
              {selectedFromSite?.name ?? "Sin definir"}
            </div>
          </div>
          <div className="ui-panel-soft px-3 py-2">
            <div className="ui-caption">Destino</div>
            <div className="text-sm font-semibold text-[var(--ui-text)]">{toSiteName}</div>
          </div>
          <div className="ui-panel-soft px-3 py-2">
            <div className="ui-caption">Items validos</div>
            <div className="text-sm font-semibold text-[var(--ui-text)]">{selectedItems.length}</div>
          </div>
          <div className="ui-panel-soft px-3 py-2">
            <div className="ui-caption">Cantidad total</div>
            <div className="text-sm font-semibold text-[var(--ui-text)]">{totalQuantity}</div>
          </div>
        </div>

        <label className="flex items-start gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-2">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span className="ui-caption">
            Confirmo origen, destino y cantidades antes de enviar a bodega.
          </span>
        </label>
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-[var(--ui-border)] bg-white/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
        <button className="ui-btn ui-btn--brand w-full lg:w-auto" disabled={!canSubmit}>
          Crear remision
        </button>
      </div>
    </form>
  );
}
