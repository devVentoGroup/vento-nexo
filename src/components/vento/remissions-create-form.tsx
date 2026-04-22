"use client";

import { useEffect, useMemo, useState } from "react";

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
  category_id?: string | null;
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
  categoryNameById?: Record<string, string>;
  defaultUomProfiles?: ProductUomProfile[];
  areaOptions: AreaOption[];
  originStockRows?: OriginStockReference[];
  initialExpectedDate?: string;
  initialNotes?: string;
  initialRows?: RemissionDraftRow[];
  submitLabel?: string;
  formMode?: "create" | "edit";
};

type SiteMode = "simple" | "zonified";

export function RemissionsCreateForm({
  action,
  toSiteId,
  toSiteName,
  fromSiteOptions,
  defaultFromSiteId,
  products,
  categoryNameById = {},
  defaultUomProfiles = [],
  areaOptions,
  originStockRows = [],
  initialExpectedDate = "",
  initialNotes = "",
  initialRows,
  submitLabel = "Crear remision",
  formMode = "create",
}: Props) {
  const initialRowsSource = initialRows ?? [];
  const initialRowsKey = useMemo(() => JSON.stringify(initialRowsSource), [initialRowsSource]);
  const normalizedInitialRows = useMemo<RemissionDraftRow[]>(
    () =>
      initialRowsSource.map((row, index) => ({
        id: Number.isFinite(row.id) ? row.id : index,
        productId: String(row.productId ?? "").trim(),
        quantity: String(row.quantity ?? "").trim(),
        inputUnitCode: normalizeUnitCode(String(row.inputUnitCode ?? "").trim()),
        inputUomProfileId: String(row.inputUomProfileId ?? "").trim(),
        areaKind: String(row.areaKind ?? "").trim(),
      })),
    [initialRowsKey]
  );

  const [fromSiteId, setFromSiteId] = useState(defaultFromSiteId);
  const [expectedDate, setExpectedDate] = useState(initialExpectedDate);
  const [notes, setNotes] = useState(initialNotes);
  const [draftRows, setDraftRows] = useState<RemissionDraftRow[]>(normalizedInitialRows);
  useEffect(() => {
    setFromSiteId(defaultFromSiteId);
  }, [defaultFromSiteId]);

  useEffect(() => {
    setExpectedDate(initialExpectedDate);
  }, [initialExpectedDate]);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  useEffect(() => {
    setDraftRows(normalizedInitialRows);
  }, [initialRowsKey, normalizedInitialRows]);

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
  const zonifiedAreaOptions = useMemo(
    () => areaOptions.filter((option) => option.value !== "general"),
    [areaOptions]
  );
  const siteMode: SiteMode = zonifiedAreaOptions.length > 1 ? "zonified" : "simple";
  const defaultAreaKind = siteMode === "simple" ? "general" : "";

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
        } else if (siteMode === "simple") {
          acc.requestedAreas.add("Solicitud global");
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
  }, [areaOptions, draftRows, products, selectedOriginStockByProduct, siteMode, uomProfileById]);

  const selectedItems = draftSummary.items;
  const canSubmit =
    Boolean(fromSiteId) && selectedItems.length > 0 && draftSummary.incompleteRows === 0;
  const requestedAreasLabel =
    siteMode === "simple"
      ? "Solicitud global"
      : draftSummary.requestedAreas.length
        ? draftSummary.requestedAreas.join(", ")
        : "Sin areas definidas";

  return (
    <form action={action} className="space-y-6 pb-24 lg:pb-0">
      <input type="hidden" name="to_site_id" value={toSiteId} />

      <section className="rounded-[28px] border border-[rgba(212,164,58,0.20)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,250,252,0.98)_100%)] p-5 shadow-[0_18px_48px_rgba(15,23,42,0.10)]">
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr] lg:items-start">
          <div className="space-y-4">
            <div>
              <div className="ui-chip ui-chip--brand">{formMode === "edit" ? "Solicitud abierta" : "Nueva solicitud"}</div>
              <div className="mt-3 ui-h3">{formMode === "edit" ? "Editar solicitud" : "Solicitud"}</div>
              <div className="mt-1 ui-caption">Define desde donde sale el producto, a donde llega y cuando lo esperas.</div>
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
                <div className="rounded-2xl border border-[rgba(14,116,144,0.18)] bg-[linear-gradient(180deg,rgba(240,249,255,0.92)_0%,rgba(255,255,255,0.92)_100%)] px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_10px_24px_rgba(14,116,144,0.10)]">
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

              <div className="rounded-2xl border border-[rgba(212,164,58,0.20)] bg-[linear-gradient(180deg,rgba(255,251,235,0.92)_0%,rgba(255,255,255,0.94)_100%)] px-4 py-3 shadow-[0_10px_24px_rgba(212,164,58,0.10)]">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ui-brand-700)]">
                  Ruta operativa
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm">{selectedFromSite?.name ?? "Sin origen"}</span>
                  <span className="text-[var(--ui-brand-700)]">→</span>
                  <span className="rounded-full bg-white px-3 py-1 shadow-sm">{toSiteName}</span>
                </div>
              </div>

              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="ui-label">Notas</span>
                <textarea
                  name="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Notas opcionales"
                  className="ui-input min-h-24"
                  rows={3}
                />
              </label>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-[rgba(14,116,144,0.18)] bg-[linear-gradient(180deg,rgba(240,249,255,0.92)_0%,rgba(255,255,255,0.94)_100%)] p-4 shadow-[0_14px_30px_rgba(14,116,144,0.10)]">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-sky-800">Resumen</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <div>
                  <div className="text-xs text-[var(--ui-muted)]">Items completos</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">{selectedItems.length}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--ui-muted)]">Cantidad total</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">{draftSummary.totalQuantity}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--ui-muted)]">Areas</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{requestedAreasLabel}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[rgba(212,164,58,0.20)] bg-[linear-gradient(180deg,rgba(255,251,235,0.94)_0%,rgba(255,255,255,0.96)_100%)] p-4 shadow-[0_14px_30px_rgba(212,164,58,0.10)]">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ui-brand-700)]">Estado del borrador</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="ui-chip">{selectedFromSite?.name ?? "Sin origen"}</span>
                <span className="ui-chip ui-chip--brand">{toSiteName}</span>
                <span className={`ui-chip ${siteMode === "simple" ? "" : "ui-chip--success"}`}>
                  {siteMode === "simple" ? "Recepcion global" : "Recepcion por area"}
                </span>
                {draftSummary.incompleteRows > 0 ? (
                  <span className="ui-chip ui-chip--warn">{draftSummary.incompleteRows} pendiente(s)</span>
                ) : (
                  <span className="ui-chip ui-chip--success">Listo para crear</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-[rgba(200,210,220,0.95)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,248,252,0.98)_100%)] p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Productos</div>
            <div className="mt-1 ui-caption">
              {siteMode === "simple"
                ? "Esta sede opera como un solo ambiente. Todo lo solicitado llegara como remision global."
                : "Esta sede opera por areas. Define en cada linea si va para barra, cocina o mostrador."}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">{selectedItems.length} item(s)</span>
            {draftSummary.referenceShortageRows > 0 ? (
              <span className="ui-chip ui-chip--warn">{draftSummary.referenceShortageRows} con faltante</span>
            ) : (
              <span className="ui-chip ui-chip--success">{draftSummary.referenceCoveredRows} cubiertos</span>
            )}
          </div>
        </div>

        <div className="mt-4">
          <RemissionsItems
            products={products}
            categoryNameById={categoryNameById}
            areaOptions={areaOptions}
            siteMode={siteMode}
            defaultAreaKind={defaultAreaKind}
            defaultUomProfiles={defaultUomProfiles}
            onRowsChange={setDraftRows}
            referenceStockByProduct={selectedOriginStockByProduct}
            referenceSiteName={selectedFromSite?.name ?? ""}
            initialRows={normalizedInitialRows}
          />
        </div>

        {selectedItems.length === 0 ? (
          <div className="ui-alert ui-alert--neutral mt-4">
            Agrega al menos un item completo para crear la solicitud.
          </div>
        ) : null}

        {draftSummary.incompleteRows > 0 ? (
          <div className="ui-alert ui-alert--warn mt-4">
            Hay {draftSummary.incompleteRows} fila(s) incompleta(s).
          </div>
        ) : null}

        {selectedFromSite && draftSummary.referenceShortageRows > 0 ? (
          <div className="ui-alert ui-alert--warn mt-4">
            {draftSummary.referenceShortageRows} item(s) superan el stock referencial de {selectedFromSite.name}.
          </div>
        ) : null}
      </section>

      <div className="ui-mobile-sticky-footer flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-[var(--ui-muted)]">
          {(selectedFromSite?.name ?? "Sin origen")} → {toSiteName} · {selectedItems.length} item(s)
          {draftSummary.incompleteRows > 0 ? ` · ${draftSummary.incompleteRows} pendiente(s)` : ""}
        </div>
        <button type="submit" className="ui-btn ui-btn--brand" disabled={!canSubmit}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
