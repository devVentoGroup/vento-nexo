"use client";

import { useMemo, useState } from "react";

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
};

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
}: Props) {
  const [fromSiteId, setFromSiteId] = useState(defaultFromSiteId);
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
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
  const canSubmit =
    Boolean(fromSiteId) && selectedItems.length > 0 && draftSummary.incompleteRows === 0;

  return (
    <form action={action} className="space-y-6 pb-24 lg:pb-0">
      <input type="hidden" name="to_site_id" value={toSiteId} />

      <section className="ui-panel space-y-4">
        <div className="ui-h3">Solicitud</div>

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
              placeholder="Notas opcionales"
              className="ui-input min-h-24"
              rows={3}
            />
          </label>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div className="ui-h3">Productos</div>

        <RemissionsItems
          products={products}
          categoryNameById={categoryNameById}
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
            Hay {draftSummary.incompleteRows} fila(s) incompleta(s).
          </div>
        ) : null}

        {selectedFromSite && draftSummary.referenceShortageRows > 0 ? (
          <div className="ui-alert ui-alert--warn">
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
          Crear remision
        </button>
      </div>
    </form>
  );
}
