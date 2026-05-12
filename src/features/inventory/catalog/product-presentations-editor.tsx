"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ProductImageUpload } from "@/features/inventory/catalog/product-image-upload";

type UnitOption = {
  code: string;
  name: string | null;
};

export type ProductPresentationEditorRow = {
  id: string;
  label: string;
  input_unit_code: string;
  qty_in_input_unit: number;
  qty_in_stock_unit: number;
  is_default: boolean;
  is_active: boolean;
  source: "manual" | "supplier_primary" | "recipe_portion";
  usage_context: "general" | "purchase" | "remission" | null;
  image_url?: string | null;
  catalog_image_url?: string | null;
};

type EditableRow = ProductPresentationEditorRow & {
  key: string;
  isNew?: boolean;
};

type Props = {
  productId: string;
  productName: string;
  stockUnitCode: string;
  units: UnitOption[];
  initialRows: ProductPresentationEditorRow[];
  existingImageUrls?: string[];
  returnHref: string;
};

function createEmptyRow(stockUnitCode: string, key: string): EditableRow {
  return {
    key,
    id: "",
    label: "",
    input_unit_code: stockUnitCode || "un",
    qty_in_input_unit: 1,
    qty_in_stock_unit: 1,
    is_default: false,
    is_active: true,
    source: "manual",
    usage_context: "general",
    image_url: "",
    catalog_image_url: "",
    isNew: true,
  };
}

export function ProductPresentationsEditor({
  productId,
  productName,
  stockUnitCode,
  units,
  initialRows,
  existingImageUrls = [],
  returnHref,
}: Props) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    initialRows.length > 0
      ? initialRows.map((row) => ({
        ...row,
        key: row.id,
        image_url: row.image_url ?? "",
        catalog_image_url: row.catalog_image_url ?? "",
      }))
      : [createEmptyRow(stockUnitCode, "new-0")]
  );
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const rowKeys = useMemo(() => rows.map((row) => row.key), [rows]);

  function addRow() {
    setRows((current) => [
      ...current,
      createEmptyRow(
        stockUnitCode,
        `new-${Date.now()}-${Math.random().toString(36).slice(2)}`
      ),
    ]);
  }

  function removeRow(row: EditableRow) {
    if (row.id) {
      setDeletedIds((current) => Array.from(new Set([...current, row.id])));
    }
    setRows((current) => current.filter((item) => item.key !== row.key));
  }

  return (
    <div className="space-y-6">
      <div className="ui-panel ui-remission-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ui-caption">Presentaciones físicas</div>
            <h2 className="ui-h2">{productName}</h2>
            <p className="mt-2 ui-body-muted">
              Administra las formas físicas en las que existe este producto en bodega. La unidad mínima para
              solicitud/remisión define cómo se pide; bodega puede preparar con cualquier presentación activa equivalente.
            </p>
          </div>

          <Link href={returnHref} className="ui-btn ui-btn--ghost">
            Volver a ficha
          </Link>
        </div>
      </div>

      <input type="hidden" name="presentation_keys" value={JSON.stringify(rowKeys)} readOnly />
      <input type="hidden" name="deleted_presentation_ids" value={JSON.stringify(deletedIds)} readOnly />

      <div className="space-y-4">
        {rows.map((row, index) => {
          const fieldPrefix = `presentation_${row.key}`;

          return (
            <article
              key={row.key}
              className="rounded-[28px] border border-[var(--ui-border)] bg-white p-4 shadow-sm"
            >
              <input type="hidden" name={`${fieldPrefix}_id`} value={row.id} readOnly />
              <input type="hidden" name={`${fieldPrefix}_source`} value="manual" readOnly />
              <input type="hidden" name={`${fieldPrefix}_usage_context`} value="general" readOnly />
              <input type="hidden" name={`${fieldPrefix}_qty_in_input_unit`} value="1" readOnly />

              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-[var(--ui-text)]">
                    Presentación {index + 1}
                  </div>
                  <div className="text-xs text-[var(--ui-muted)]">
                    {row.id ? "Existente" : "Nueva"} · Presentación física de bodega
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeRow(row)}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700"
                >
                  Quitar
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div className="space-y-4">
                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Nombre de la presentación</span>
                    <input
                      name={`${fieldPrefix}_label`}
                      className="ui-input"
                      defaultValue={row.label}
                      placeholder="Ej. Bolsa 100 unidades"
                      required
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Unidad base del contenido</span>
                    <select
                      name={`${fieldPrefix}_input_unit_code`}
                      className="ui-input"
                      defaultValue={row.input_unit_code || stockUnitCode}
                      required
                    >
                      {units.map((unit) => (
                        <option key={unit.code} value={unit.code}>
                          {unit.code} - {unit.name ?? unit.code}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-[var(--ui-muted)]">
                      Unidad en la que se mide el contenido de esta presentación. Ej. un, ml, g.
                    </span>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Contenido por presentación</span>
                    <input
                      name={`${fieldPrefix}_qty_in_stock_unit`}
                      type="number"
                      step="0.001"
                      min="0.001"
                      className="ui-input"
                      defaultValue={row.qty_in_stock_unit || 1}
                      required
                    />
                    <span className="text-xs text-[var(--ui-muted)]">
                      Cuánto contiene 1 presentación. Ej. Bolsa 100 unidades = 100 {stockUnitCode};
                      paquete de 6 bolsas = 6 {stockUnitCode}.
                    </span>
                  </label>

                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-5">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name={`${fieldPrefix}_is_default`}
                          defaultChecked={Boolean(row.is_default)}
                        />
                        <span className="ui-label">Unidad mínima para solicitud/remisión</span>
                      </label>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name={`${fieldPrefix}_is_active`}
                          defaultChecked={row.is_active !== false}
                        />
                        <span className="ui-label">Presentación física activa</span>
                      </label>
                    </div>

                    <p className="text-xs text-[var(--ui-muted)]">
                      En remisiones se pide por la unidad mínima. En bodega/retiro se puede preparar o retirar con
                      cualquier presentación física activa equivalente.
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <ProductImageUpload
                    name={`${fieldPrefix}_image_url`}
                    label="Foto de esta presentación"
                    currentUrl={row.image_url || row.catalog_image_url || ""}
                    existingImageUrls={existingImageUrls}
                    productId={productId}
                    kind="presentation"
                  />
                  <p className="mt-3 text-xs text-[var(--ui-muted)]">
                    Ejemplo: bolsa de 100 unidades y bolsa de 200 unidades pueden tener fotos diferentes aunque sean el mismo producto.
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={addRow}
          className="ui-btn ui-btn--ghost"
        >
          Agregar presentación
        </button>

        <button type="submit" className="ui-btn ui-btn--brand">
          Guardar presentaciones
        </button>
      </div>
    </div>
  );
}