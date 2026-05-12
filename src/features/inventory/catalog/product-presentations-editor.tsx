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

function createEmptyRow(stockUnitCode: string): EditableRow {
  const key = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

function usageContextLabel(value: string | null | undefined) {
  const context = String(value ?? "general").trim().toLowerCase();
  if (context === "purchase") return "Compra";
  if (context === "remission") return "Operación / remisión";
  return "General";
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
      : [createEmptyRow(stockUnitCode)]
  );
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const rowKeys = useMemo(() => rows.map((row) => row.key), [rows]);

  function addRow() {
    setRows((current) => [...current, createEmptyRow(stockUnitCode)]);
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
              Administra empaque, equivalencia e imagen propia por presentación. Esto alimenta el quiosco,
              el board de inventario y los conteos por presentación física.
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

              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-[var(--ui-text)]">
                    Presentación {index + 1}
                  </div>
                  <div className="text-xs text-[var(--ui-muted)]">
                    {row.id ? "Existente" : "Nueva"} · {usageContextLabel(row.usage_context)}
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

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Contexto</span>
                      <select
                        name={`${fieldPrefix}_usage_context`}
                        className="ui-input"
                        defaultValue={row.usage_context ?? "general"}
                      >
                        <option value="general">General</option>
                        <option value="purchase">Compra</option>
                        <option value="remission">Operación / remisión</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Unidad de entrada</span>
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
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Cantidad en unidad de entrada</span>
                      <input
                        name={`${fieldPrefix}_qty_in_input_unit`}
                        type="number"
                        step="0.001"
                        min="0.001"
                        className="ui-input"
                        defaultValue={row.qty_in_input_unit || 1}
                        required
                      />
                      <span className="text-xs text-[var(--ui-muted)]">
                        Normalmente 1. Ej. 1 bolsa.
                      </span>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Equivalencia en unidad base</span>
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
                        Ej. 100 {stockUnitCode}, 200 {stockUnitCode}, 6.000 ml.
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-5">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name={`${fieldPrefix}_is_default`}
                        defaultChecked={Boolean(row.is_default)}
                      />
                      <span className="ui-label">Predeterminada</span>
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name={`${fieldPrefix}_is_active`}
                        defaultChecked={row.is_active !== false}
                      />
                      <span className="ui-label">Activa</span>
                    </label>
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