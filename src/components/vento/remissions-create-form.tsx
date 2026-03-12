"use client";

import { useMemo, useState } from "react";

import { StepHelp } from "@/components/inventory/forms/StepHelp";
import {
  convertByProductProfile,
  normalizeUnitCode,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

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

type OriginStockReference = {
  siteId: string;
  productId: string;
  currentQty: number;
  updatedAt: string | null;
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
  originStockRows?: OriginStockReference[];
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
  originStockRows = [],
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
  const uomProfileById = useMemo(
    () => new Map(defaultUomProfiles.map((profile) => [profile.id, profile])),
    [defaultUomProfiles]
  );
  const originStockIndex = useMemo(() => {
    const next: Record<
      string,
      Record<
        string,
        {
          currentQty: number;
          updatedAt: string | null;
        }
      >
    > = {};
    for (const row of originStockRows) {
      const siteId = String(row.siteId).trim();
      const productId = String(row.productId).trim();
      if (!siteId || !productId) continue;
      if (!next[siteId]) {
        next[siteId] = {};
      }
      next[siteId][productId] = {
        currentQty: Number.isFinite(row.currentQty) ? Number(row.currentQty) : 0,
        updatedAt: row.updatedAt ?? null,
      };
    }
    return next;
  }, [originStockRows]);
  const selectedOriginStockByProduct = useMemo(
    () => originStockIndex[fromSiteId] ?? {},
    [fromSiteId, originStockIndex]
  );

  const draftSummary = useMemo(() => {
    const productMap = new Map(products.map((product) => [product.id, product]));
    const areaMap = new Map(areaOptions.map((option) => [option.value, option.label]));
    const summary = draftRows.reduce(
      (acc, row) => {
        const product = productMap.get(row.productId);
        const qty = Number(row.quantity);
        const hasContent = Boolean(
          row.productId ||
            row.quantity.trim() ||
            row.inputUnitCode.trim() ||
            row.areaKind.trim()
        );
        const valid = Boolean(row.productId && product?.name && Number.isFinite(qty) && qty > 0);

        if (row.areaKind && areaMap.has(row.areaKind)) {
          acc.requestedAreas.add(areaMap.get(row.areaKind) ?? row.areaKind);
        }
        if (hasContent && !valid) {
          acc.incompleteRows += 1;
        }

        if (valid) {
          const stockUnitCode = normalizeUnitCode(product?.stock_unit_code || product?.unit || "un");
          const inputUnitCode = normalizeUnitCode(row.inputUnitCode || stockUnitCode);
          const selectedProfile = row.inputUomProfileId
            ? uomProfileById.get(row.inputUomProfileId) ?? null
            : null;
          let quantityInStock = Number.isFinite(qty) ? qty : 0;
          try {
            quantityInStock = convertByProductProfile({
              quantityInInput: Number.isFinite(qty) ? qty : 0,
              inputUnitCode,
              stockUnitCode,
              profile: selectedProfile,
            }).quantityInStock;
          } catch {
            quantityInStock = Number.isFinite(qty) ? qty : 0;
          }
          const referenceMeta = selectedOriginStockByProduct[row.productId] ?? null;
          const availableReference = Number(referenceMeta?.currentQty ?? 0);
          const hasReferenceShortage = quantityInStock > availableReference;
          if (hasReferenceShortage) {
            acc.referenceShortageRows += 1;
          } else {
            acc.referenceCoveredRows += 1;
          }
          acc.items.push({
            id: row.id,
            name: product?.name ?? "",
            quantity: Number.isFinite(qty) ? qty : 0,
            unit: row.inputUnitCode || product?.stock_unit_code || product?.unit || "un",
            areaKind: row.areaKind,
            stockQuantity: quantityInStock,
            availableReference,
            referenceUpdatedAt: referenceMeta?.updatedAt ?? null,
            hasReferenceShortage,
            valid,
          });
        }

        return acc;
      },
      {
        items: [] as Array<{
          id: number;
          name: string;
          quantity: number;
          unit: string;
          areaKind: string;
          stockQuantity: number;
          availableReference: number;
          referenceUpdatedAt: string | null;
          hasReferenceShortage: boolean;
          valid: boolean;
        }>,
        incompleteRows: 0,
        requestedAreas: new Set<string>(),
        referenceShortageRows: 0,
        referenceCoveredRows: 0,
      }
    );

    return {
      items: summary.items,
      incompleteRows: summary.incompleteRows,
      requestedAreas: Array.from(summary.requestedAreas),
      referenceShortageRows: summary.referenceShortageRows,
      referenceCoveredRows: summary.referenceCoveredRows,
      totalQuantity: summary.items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }, [areaOptions, draftRows, products, selectedOriginStockByProduct, uomProfileById]);

  const selectedItems = draftSummary.items;
  const reviewRows = useMemo(
    () => [
      {
        label: "Origen",
        value: selectedFromSite?.name ?? "Sin sede origen definida",
      },
      {
        label: "Destino",
        value: toSiteName,
      },
      {
        label: "Fecha esperada",
        value: expectedDate || "Sin fecha esperada",
      },
      {
        label: "Items listos",
        value: `${selectedItems.length}`,
      },
      {
        label: "Filas pendientes",
        value: `${draftSummary.incompleteRows}`,
      },
      {
        label: "Areas sugeridas",
        value: draftSummary.requestedAreas.length
          ? draftSummary.requestedAreas.join(", ")
          : "Sin area operativa",
      },
    ],
    [
      draftSummary.incompleteRows,
      draftSummary.requestedAreas,
      expectedDate,
      selectedFromSite?.name,
      selectedItems.length,
      toSiteName,
    ]
  );

  const canSubmit = Boolean(fromSiteId) && selectedItems.length > 0 && confirmed;

  return (
    <form action={action} className="space-y-6 pb-24 lg:pb-0">
      <input type="hidden" name="to_site_id" value={toSiteId} />

      <section className="ui-panel-soft space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Solicitud completa en una sola vista</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Aqui defines ruta, productos, contexto y confirmacion sin salir del hub de remisiones.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">Satelite solicita</span>
            <span className="ui-chip">Centro prepara</span>
            <span className="ui-chip">Destino fijo: {toSiteName}</span>
          </div>
        </div>
        <p className="text-sm text-[var(--ui-muted)]">
          La meta es que una persona nueva pueda pedir abastecimiento interno de forma clara, completa y sin navegar por wizard.
        </p>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Ruta y contexto de la solicitud</div>
          <p className="mt-1 ui-caption">
            Define desde que sede debe salir el abastecimiento y deja trazabilidad basica para bodega.
          </p>
        </div>

        <div className="grid gap-3 ui-mobile-stack md:grid-cols-2">
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

          <div className="flex flex-col gap-1">
            <span className="ui-label">Sede destino</span>
            <div className="ui-panel-soft flex min-h-10 items-center rounded-xl px-3 py-2 text-sm font-semibold text-[var(--ui-text)]">
              {toSiteName}
            </div>
          </div>

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

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="ui-label">Notas</span>
            <textarea
              name="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notas para bodega"
              className="ui-input min-h-24"
              rows={3}
            />
          </label>
        </div>

        <div className="ui-panel-soft p-3 text-sm text-[var(--ui-muted)]">
          La sede destino ya queda fijada por la sede activa del satelite. Bodega confirma stock real y LOC origen despues, durante preparacion.
        </div>

        {selectedFromSite ? (
          <div className="ui-panel-soft p-3 text-sm text-[var(--ui-muted)]">
            Veras stock referencial de {selectedFromSite.name} por linea para orientar la solicitud.
            La validacion final sigue ocurriendo en preparacion.
          </div>
        ) : null}

        <StepHelp
          meaning="Este bloque define la ruta interna de la remision y el contexto que vera bodega."
          whenToUse="Siempre antes de agregar items; evita pedir desde la sede equivocada o sin fecha de referencia."
          example={`Origen: Centro, destino: ${toSiteName}, fecha esperada: manana en la apertura.`}
          impact="La solicitud queda trazable desde satelite hasta preparacion y recepcion."
        />
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Items solicitados</div>
          <p className="mt-1 ui-caption">
            Captura solo productos habilitados para esta sede. Cada fila debe quedar coherente en producto, cantidad y unidad de captura.
          </p>
        </div>

        <div className="ui-panel-soft p-3 text-sm text-[var(--ui-muted)]">
          La solicitud se crea con lo que quede completo. Si una fila queda a medias, se marca abajo para que la corrijas antes de confirmar.
        </div>

        <RemissionsItems
          products={products}
          areaOptions={areaOptions}
          defaultUomProfiles={defaultUomProfiles}
          onRowsChange={setDraftRows}
          referenceStockByProduct={selectedOriginStockByProduct}
          referenceSiteName={selectedFromSite?.name ?? ""}
        />

        {selectedItems.length === 0 ? (
          <div className="ui-alert ui-alert--neutral">
            Agrega al menos un item completo para crear la solicitud.
          </div>
        ) : null}

        {draftSummary.incompleteRows > 0 ? (
          <div className="ui-alert ui-alert--warn">
            Tienes {draftSummary.incompleteRows} fila(s) incompleta(s). Completa producto, cantidad y unidad o quitalas antes de enviar.
          </div>
        ) : null}

        <StepHelp
          meaning="Cada fila representa un producto que el satelite necesita pedir a la sede origen."
          whenToUse="Agrega una fila por cada producto real que deba preparar bodega."
          example="Leche 6 lt, harina 2 kg, empaques 1 paquete."
          impact="El detalle se convierte en la base para preparar, despachar y recibir sin rehacer informacion."
        />
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Revision operativa</div>
          <p className="mt-1 ui-caption">
            Antes de crear la remision, confirma que la solicitud corresponde a lo que realmente debe preparar Centro.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {reviewRows.map((row) => (
            <div key={row.label} className="ui-panel-soft px-3 py-2">
              <div className="ui-caption">{row.label}</div>
              <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{row.value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="ui-panel-soft px-3 py-2">
            <div className="ui-caption">Cantidad total solicitada</div>
            <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
              {draftSummary.totalQuantity}
            </div>
          </div>
          <div className="ui-panel-soft px-3 py-2">
            <div className="ui-caption">Notas para bodega</div>
            <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
              {notes.trim() || "Sin notas"}
            </div>
          </div>
        </div>

        {selectedFromSite ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="ui-panel-soft px-3 py-2">
              <div className="ui-caption">Lineas cubiertas segun stock referencial</div>
              <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
                {draftSummary.referenceCoveredRows}
              </div>
            </div>
            <div className="ui-panel-soft px-3 py-2">
              <div className="ui-caption">Lineas con alerta de stock referencial</div>
              <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
                {draftSummary.referenceShortageRows}
              </div>
            </div>
          </div>
        ) : null}

        <div className="ui-panel-soft space-y-2 p-4 text-sm text-[var(--ui-muted)]">
          <p>1) El satelite crea la solicitud; la disponibilidad final se confirma al preparar.</p>
          <p>2) Usa solo productos que realmente deban salir desde la sede origen.</p>
          <p>3) Si hay diferencias, la remision se resuelve despues en preparacion o recepcion parcial.</p>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div>
          <div className="ui-h3">Confirmacion final</div>
          <p className="mt-1 ui-caption">
            Este es el ultimo control antes de enviar la solicitud a bodega.
          </p>
        </div>

        <label className="flex items-start gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span className="ui-caption">
            Confirmo que revise ruta, items, cantidades y contexto antes de crear la remision.
          </span>
        </label>
      </section>

      <div className="ui-mobile-sticky-footer flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-[var(--ui-muted)]">
          {selectedItems.length} item(s) listo(s)
          {draftSummary.incompleteRows > 0 ? ` · ${draftSummary.incompleteRows} pendiente(s)` : ""}
        </div>
        <button type="submit" className="ui-btn ui-btn--brand" disabled={!canSubmit}>
          Crear remision
        </button>
      </div>
    </form>
  );
}
