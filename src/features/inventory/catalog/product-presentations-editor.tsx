"use client";

import Link from "next/link";
import { useMemo, useState, type MouseEvent } from "react";

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

export type ProductPresentationSuggestion = {
  key: string;
  label: string;
  input_unit_code: string;
  qty_in_stock_unit: number;
  sourceLabel: string;
};

type EditableRow = ProductPresentationEditorRow & {
  key: string;
  isNew?: boolean;
};

export type ProductMeasurementMode =
  | "fixed_presentation"
  | "variable_weight"
  | "count_with_weight"
  | "bulk_volume";

type Props = {
  productId: string;
  productName: string;
  stockUnitCode: string;
  units: UnitOption[];
  initialRows: ProductPresentationEditorRow[];
  suggestedRows?: ProductPresentationSuggestion[];
  existingImageUrls?: string[];
  returnHref: string;
  requiresRemissionDefault?: boolean;
  measurementMode?: ProductMeasurementMode | string | null;
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

function createRowFromSuggestion(suggestion: ProductPresentationSuggestion): EditableRow {
  return {
    key: `suggestion-${suggestion.key}`,
    id: "",
    label: suggestion.label,
    input_unit_code: suggestion.input_unit_code || "un",
    qty_in_input_unit: 1,
    qty_in_stock_unit: suggestion.qty_in_stock_unit,
    is_default: false,
    is_active: true,
    source: "manual",
    usage_context: "general",
    image_url: "",
    catalog_image_url: "",
    isNew: true,
  };
}

function normalizeComparableText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function presentationSignature(params: {
  label: string;
  inputUnitCode: string;
  qtyInStockUnit: number;
}) {
  return [
    normalizeComparableText(params.label),
    normalizeComparableText(params.inputUnitCode),
    Number(params.qtyInStockUnit || 0).toFixed(3),
  ].join("::");
}

function isRowAvailableForRemission(
  row: Pick<ProductPresentationEditorRow, "usage_context" | "is_default">
) {
  return row.usage_context === "remission" || Boolean(row.is_default);
}

function remissionUsageContextForRow(
  row: Pick<ProductPresentationEditorRow, "usage_context" | "is_default">
): NonNullable<ProductPresentationEditorRow["usage_context"]> {
  return isRowAvailableForRemission(row) ? "remission" : row.usage_context ?? "general";
}

function normalizeMeasurementMode(value: ProductMeasurementMode | string | null | undefined): ProductMeasurementMode {
  const raw = String(value ?? "fixed_presentation").trim().toLowerCase();
  if (raw === "variable_weight" || raw === "count_with_weight" || raw === "bulk_volume") {
    return raw;
  }
  return "fixed_presentation";
}

function measurementModeLabel(mode: ProductMeasurementMode): string {
  if (mode === "variable_weight") return "Peso variable";
  if (mode === "count_with_weight") return "Conteo + peso real";
  if (mode === "bulk_volume") return "Granel / volumen variable";
  return "Presentación fija";
}

function measurementModeDescription(mode: ProductMeasurementMode, stockUnitCode: string): string {
  if (mode === "variable_weight") {
    return `Este insumo se pide, recibe, despacha y consume por cantidad real medida en ${stockUnitCode}. Los empaques son opcionales y solo sirven como apoyo logístico, foto o referencia de proveedor.`;
  }
  if (mode === "count_with_weight") {
    return `Este insumo puede contarse por piezas, pero el inventario real se controla por peso en ${stockUnitCode}. No crees equivalencias fijas por unidad si el peso real varía.`;
  }
  if (mode === "bulk_volume") {
    return `Este insumo se controla por volumen o granel real en ${stockUnitCode}. Los recipientes o empaques son opcionales y no son requisito de remisión.`;
  }
  return "Este insumo usa presentaciones físicas con equivalencia exacta. Si se remisiona, debe existir una presentación mínima remisionable.";
}

export function ProductPresentationsEditor({
  productId,
  productName,
  stockUnitCode,
  units,
  initialRows,
  suggestedRows = [],
  existingImageUrls = [],
  returnHref,
  requiresRemissionDefault = false,
  measurementMode = "fixed_presentation",
}: Props) {
  const normalizedMeasurementMode = normalizeMeasurementMode(measurementMode);
  const usesFixedPresentation = normalizedMeasurementMode === "fixed_presentation";
  const usesCountWithWeight = normalizedMeasurementMode === "count_with_weight";
  const requiresFixedRemissionDefault = usesFixedPresentation && requiresRemissionDefault;
  const modeLabel = measurementModeLabel(normalizedMeasurementMode);
  const modeDescription = measurementModeDescription(normalizedMeasurementMode, stockUnitCode);
  const physicalConfigTitle = usesFixedPresentation
    ? "Presentaciones físicas"
    : "Empaques logísticos opcionales";
  const physicalConfigSingular = usesFixedPresentation ? "presentación" : "empaque";
  const physicalConfigSingularTitle = usesFixedPresentation ? "Presentación" : "Empaque logístico";
  const physicalConfigPlural = usesFixedPresentation ? "presentaciones" : "empaques";
  const [rows, setRows] = useState<EditableRow[]>(() => {
    const activeInitialRows = initialRows.filter((row) => row.is_active !== false);

    if (activeInitialRows.length > 0) {
      return activeInitialRows.map((row) => ({
        ...row,
        key: row.id,
        image_url: row.image_url ?? "",
        catalog_image_url: row.catalog_image_url ?? "",
      }));
    }

    return usesFixedPresentation ? [createEmptyRow(stockUnitCode, "new-0")] : [];
  });
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const [clientError, setClientError] = useState("");

  const rowKeys = useMemo(() => rows.map((row) => row.key), [rows]);

  const currentPresentationSignatures = useMemo(
    () =>
      new Set(
        rows.map((row) =>
          presentationSignature({
            label: row.label,
            inputUnitCode: row.input_unit_code,
            qtyInStockUnit: row.qty_in_stock_unit,
          })
        )
      ),
    [rows]
  );

  const availableSuggestedRows = useMemo(
    () =>
      suggestedRows.filter(
        (suggestion) =>
          !currentPresentationSignatures.has(
            presentationSignature({
              label: suggestion.label,
              inputUnitCode: suggestion.input_unit_code,
              qtyInStockUnit: suggestion.qty_in_stock_unit,
            })
          )
      ),
    [currentPresentationSignatures, suggestedRows]
  );

  function addRow() {
    setRows((current) => [
      ...current,
      createEmptyRow(
        stockUnitCode,
        `new-${Date.now()}-${Math.random().toString(36).slice(2)}`
      ),
    ]);
  }

  function addSuggestedRow(suggestion: ProductPresentationSuggestion) {
    setRows((current) => [...current, createRowFromSuggestion(suggestion)]);
  }

  function removeRow(row: EditableRow) {
    if (row.id) {
      setDeletedIds((current) => Array.from(new Set([...current, row.id])));
    }
    setRows((current) => current.filter((item) => item.key !== row.key));
  }

  function updateRow(
    key: string,
    updater: (row: EditableRow) => Partial<EditableRow>
  ) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...updater(row) } : row))
    );
  }

  function setPresentationActive(key: string, isActive: boolean) {
    updateRow(key, (row) => ({
      is_active: isActive,
      is_default: isActive ? row.is_default : false,
    }));
  }

  function setPresentationAvailableForRemission(key: string, isAvailable: boolean) {
    updateRow(key, (row) => ({
      usage_context: isAvailable ? "remission" : "general",
      is_default: isAvailable ? row.is_default : false,
    }));
  }

  function setPresentationDefault(key: string, isDefault: boolean) {
    updateRow(key, (row) => ({
      is_default: isDefault,
      is_active: isDefault ? true : row.is_active,
      usage_context:
        isDefault && requiresFixedRemissionDefault ? "remission" : row.usage_context ?? "general",
    }));
  }

  function handleSaveClick(event: MouseEvent<HTMLButtonElement>) {
    setClientError("");

    const form = event.currentTarget.closest("form");
    if (!form) return;

    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    let activeDefaultCount = 0;
    const activeRemissionRows: Array<{
      label: string;
      qtyInStockUnit: number;
      isDefault: boolean;
    }> = [];

    for (const row of rows) {
      const prefix = `presentation_${row.key}`;
      const label =
        String(formData.get(`${prefix}_label`) ?? "").trim() ||
        `Presentación ${rows.indexOf(row) + 1}`;
      const rawQty = String(formData.get(`${prefix}_qty_in_stock_unit`) ?? "")
        .trim()
        .replace(",", ".");
      const qtyInStockUnit = Number(rawQty);
      const isDefault = formData.has(`${prefix}_is_default`);
      const isActive = formData.has(`${prefix}_is_active`);
      const isAvailableForRemission = formData.has(`${prefix}_is_remission_enabled`);

      if (isDefault && !isActive) {
        setClientError(`La presentación "${label}" no puede ser mínima si está inactiva.`);
        return;
      }

      if (requiresFixedRemissionDefault && isDefault && !isAvailableForRemission) {
        setClientError(
          `La presentación "${label}" no puede ser mínima si no está disponible para solicitud/remisión.`
        );
        return;
      }

      if (
        requiresFixedRemissionDefault &&
        isActive &&
        isAvailableForRemission &&
        Number.isFinite(qtyInStockUnit) &&
        qtyInStockUnit > 0
      ) {
        activeRemissionRows.push({ label, qtyInStockUnit, isDefault });
      }

      if (isDefault && isActive && (!requiresFixedRemissionDefault || isAvailableForRemission)) {
        activeDefaultCount += 1;
      }
    }

    if (requiresFixedRemissionDefault && activeRemissionRows.length === 0) {
      setClientError(
        "Este insumo está activo para remisión en al menos un satélite. Marca al menos una presentación activa como disponible para solicitud/remisión."
      );
      return;
    }

    if (requiresFixedRemissionDefault && activeDefaultCount === 0) {
      setClientError(
        "Este insumo está activo para remisión en al menos un satélite. Marca la menor presentación remisionable como mínima para solicitud/remisión antes de guardar."
      );
      return;
    }

    if (activeDefaultCount > 1) {
      setClientError("Solo puede haber una presentación mínima activa para solicitud/remisión.");
      return;
    }

    if (requiresFixedRemissionDefault && activeDefaultCount === 1) {
      const defaultPresentation = activeRemissionRows.find((row) => row.isDefault);
      const smallestQty = Math.min(...activeRemissionRows.map((row) => row.qtyInStockUnit));
      const smallestPresentation = activeRemissionRows.find(
        (row) => Math.abs(row.qtyInStockUnit - smallestQty) < 0.000001
      );

      if (
        defaultPresentation &&
        Number.isFinite(smallestQty) &&
        defaultPresentation.qtyInStockUnit > smallestQty + 0.000001
      ) {
        setClientError(
          `La presentación mínima para remisión debe ser la de menor contenido entre las presentaciones remisionables. Marca "${smallestPresentation?.label ?? "la presentación remisionable más pequeña"}" como mínima.`
        );
        return;
      }
    }

    form.requestSubmit();
  }

  return (
    <div className="space-y-6">
      <div className="ui-panel ui-remission-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ui-caption">{physicalConfigTitle}</div>
            <h2 className="ui-h2">{productName}</h2>
            <p className="mt-2 ui-body-muted">
              {usesFixedPresentation
                ? "Administra las formas físicas con equivalencia exacta en las que existe este insumo comprado. Aquí defines qué presentaciones puede pedir o recibir el satélite."
                : "Administra empaques, fotos o referencias logísticas opcionales. En insumos de cantidad real, el flujo operativo sigue registrando peso, conteo o volumen real."}
            </p>
            <div className="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              Solo para insumos comprados · no aplica a preparaciones FOGO ni activos físicos
            </div>
          </div>

          <Link href={returnHref} className="ui-btn ui-btn--ghost">
            Volver a ficha
          </Link>
        </div>
      </div>

      <div
        className={
          usesFixedPresentation
            ? "rounded-[28px] border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950"
            : "rounded-[28px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"
        }
      >
        <div className="font-bold">Modo de medición: {modeLabel}</div>
        <p className="mt-1">{modeDescription}</p>
      </div>

      {!usesFixedPresentation ? (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-bold">
            {usesCountWithWeight ? "Conteo auxiliar, stock real por peso" : "Cantidad real manda sobre el empaque"}
          </div>
          <p className="mt-1">
            {usesCountWithWeight
              ? `Ejemplo: registra 12 piezas y el peso real en ${stockUnitCode}. No guardes “1 unidad = X ${stockUnitCode}” si cada pieza pesa diferente.`
              : `Puedes guardar empaques como referencia, pero la entrada, salida, conteo y remisión deben confirmar la cantidad real en ${stockUnitCode}.`}
          </p>
        </div>
      ) : null}

      {requiresFixedRemissionDefault ? (
        <div className="rounded-[28px] border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <div className="font-bold">Regla de remisión</div>
          <p className="mt-1">
            El satélite solicita usando la presentación mínima remisionable. Las presentaciones activas solo
            para producción o control interno no cuentan para esta regla. Si existen presentaciones remisionables
            mayores, Centro puede despachar una combinación física equivalente.
          </p>
        </div>
      ) : null}

      {!usesFixedPresentation && requiresRemissionDefault ? (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-bold">Remisión por cantidad real</div>
          <p className="mt-1">
            Este insumo está habilitado para remisión por sede, pero no necesita presentación mínima.
            El flujo operativo deberá pedir y confirmar cantidad real según su modo de medición.
          </p>
        </div>
      ) : null}

      <input type="hidden" name="presentation_keys" value={JSON.stringify(rowKeys)} readOnly />
      <input type="hidden" name="deleted_presentation_ids" value={JSON.stringify(deletedIds)} readOnly />

      {clientError ? (
        <div className="ui-alert ui-alert--error" role="alert">
          {clientError}
        </div>
      ) : null}

      {availableSuggestedRows.length > 0 ? (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-amber-950">Sugeridas desde proveedor / compra</div>
              <p className="mt-1 text-sm text-amber-900">
                {usesFixedPresentation
                  ? "Estas presentaciones vienen del empaque configurado en proveedores. Puedes agregarlas como presentaciones físicas para adjuntar foto y usarlas en bodega."
                  : "Estas sugerencias vienen del empaque configurado en proveedores. Puedes agregarlas como empaque logístico para foto o referencia, pero no reemplazan la cantidad real."}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {availableSuggestedRows.map((suggestion) => (
              <div
                key={suggestion.key}
                className="rounded-2xl border border-amber-200 bg-white p-3 shadow-sm"
              >
                <div className="text-sm font-bold text-[var(--ui-text)]">{suggestion.label}</div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  {suggestion.sourceLabel} · 1 {physicalConfigSingular} ={" "}
                  {Number(suggestion.qty_in_stock_unit || 0).toLocaleString("es-CO", {
                    maximumFractionDigits: 3,
                  })}{" "}
                  {stockUnitCode}
                </div>

                <button
                  type="button"
                  onClick={() => addSuggestedRow(suggestion)}
                  className="ui-btn ui-btn--ghost mt-3 h-10 px-4 text-sm"
                >
                  {usesFixedPresentation ? "Agregar a presentaciones físicas" : "Agregar como empaque logístico"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!usesFixedPresentation && rows.length === 0 ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-4 text-sm text-[var(--ui-muted)] shadow-sm">
          Este insumo puede operar sin empaques logísticos manuales. Para aguacate, por ejemplo, puedes dejar esta sección vacía y registrar siempre piezas + peso real en los flujos operativos.
        </div>
      ) : null}

      <div className="space-y-4">
        {rows.map((row, index) => {
          const fieldPrefix = `presentation_${row.key}`;
          const isAvailableForRemission = usesFixedPresentation && isRowAvailableForRemission(row);
          const usageContextValue = requiresFixedRemissionDefault
            ? remissionUsageContextForRow(row)
            : usesFixedPresentation
              ? row.usage_context ?? "general"
              : "general";

          return (
            <article
              key={row.key}
              className="rounded-[28px] border border-[var(--ui-border)] bg-white p-4 shadow-sm"
            >
              <input type="hidden" name={`${fieldPrefix}_id`} value={row.id} readOnly />
              <input type="hidden" name={`${fieldPrefix}_source`} value="manual" readOnly />
              <input
                type="hidden"
                name={`${fieldPrefix}_usage_context`}
                value={usageContextValue}
                readOnly
              />
              <input type="hidden" name={`${fieldPrefix}_qty_in_input_unit`} value="1" readOnly />

              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-[var(--ui-text)]">
                    {physicalConfigSingularTitle} {index + 1}
                  </div>
                  <div className="text-xs text-[var(--ui-muted)]">
                    {row.id ? "Existente" : "Nuevo"} · {usesFixedPresentation ? "Presentación física convertible" : "Referencia logística opcional"} a {stockUnitCode}
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
                    <span className="ui-label">Nombre {usesFixedPresentation ? "de la presentación" : "del empaque"}</span>
                    <input
                      name={`${fieldPrefix}_label`}
                      className="ui-input"
                      defaultValue={row.label}
                      placeholder="Ej. Bolsa 100 unidades"
                      required
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">{usesFixedPresentation ? "Unidad base del contenido" : "Unidad real de referencia"}</span>
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
                      {usesFixedPresentation
                        ? "Unidad base en la que se mide el contenido interno. Ej. ml, g, un."
                        : "Unidad base de referencia si decides registrar un empaque logístico. La operación real se mide en el flujo de compra, recepción, remisión o producción."}
                    </span>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="ui-label">{usesFixedPresentation ? "Contenido equivalente por presentación" : "Equivalencia referencial del empaque"}</span>
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
                      {usesFixedPresentation
                        ? <>Cuánto descuenta o suma 1 presentación en inventario base. Ej. Pote 2 L = 2000 {stockUnitCode}; bolsa 100 unidades = 100 {stockUnitCode}.</>
                        : <>Equivalencia referencial del empaque, si aplica. No se usa como cantidad obligatoria para remisiones ni reemplaza la medición real.</>}
                    </span>
                  </label>

                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        name={`${fieldPrefix}_is_active`}
                        checked={row.is_active !== false}
                        onChange={(event) => setPresentationActive(row.key, event.target.checked)}
                      />
                      <span>
                        <span className="ui-label block">{usesFixedPresentation ? "Presentación física activa" : "Empaque logístico activo"}</span>
                        <span className="block text-xs text-[var(--ui-muted)]">
                          {usesFixedPresentation
                            ? "Existe operativamente y puede usarse para inventario, producción, control interno o fotos."
                            : "Existe como empaque, foto o referencia logística. La cantidad real sigue mandando en los flujos operativos."}
                        </span>
                      </span>
                    </label>

                    {requiresFixedRemissionDefault ? (
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          name={`${fieldPrefix}_is_remission_enabled`}
                          checked={isAvailableForRemission}
                          onChange={(event) =>
                            setPresentationAvailableForRemission(row.key, event.target.checked)
                          }
                          disabled={row.is_active === false}
                        />
                        <span>
                          <span className="ui-label block">Disponible para solicitud/remisión</span>
                          <span className="block text-xs text-[var(--ui-muted)]">
                            El satélite puede pedir esta presentación y Centro puede usarla para despachar.
                          </span>
                        </span>
                      </label>
                    ) : null}

                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        name={`${fieldPrefix}_is_default`}
                        checked={Boolean(row.is_default)}
                        onChange={(event) => setPresentationDefault(row.key, event.target.checked)}
                        disabled={requiresFixedRemissionDefault && !isAvailableForRemission}
                      />
                      <span>
                        <span className="ui-label block">
                          {requiresFixedRemissionDefault
                            ? "Unidad mínima de solicitud/remisión"
                            : "Presentación predeterminada opcional"}
                        </span>
                        <span className="block text-xs text-[var(--ui-muted)]">
                          {requiresFixedRemissionDefault
                            ? "Debe ser la menor presentación activa disponible para remisión. Las presentaciones solo para producción no cuentan."
                            : "Puede usarse como referencia visual o predeterminada para bodega, inventario por LOC y quiosco."}
                        </span>
                      </span>
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
                    {usesFixedPresentation
                      ? "Ejemplo: bolsa de 100 unidades y bolsa de 200 unidades pueden tener fotos diferentes aunque sean el mismo producto."
                      : "Ejemplo: bolsa de proveedor, canastilla o caja logística. La foto ayuda a identificar el empaque, pero el stock sigue por cantidad real."}
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
          {usesFixedPresentation ? "Agregar presentación" : "Agregar empaque logístico"}
        </button>

        <button type="button" onClick={handleSaveClick} className="ui-btn ui-btn--brand">
          {usesFixedPresentation ? "Guardar presentaciones" : "Guardar empaques"}
        </button>
      </div>
    </div>
  );
}