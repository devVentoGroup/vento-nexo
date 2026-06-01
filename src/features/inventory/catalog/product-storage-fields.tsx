"use client";

import type { ReactNode } from "react";

import type { InventoryUnit } from "@/lib/inventory/uom";

export type ProductMeasurementMode =
  | "fixed_presentation"
  | "variable_weight"
  | "count_with_weight"
  | "bulk_volume";

type CostingModeField = {
  hasSuppliers: boolean;
  defaultValue?: string | null;
  label?: string;
  autoOptionLabel?: string;
  manualOptionLabel?: string;
  staticLabel?: string;
};

type TrackingOptions = {
  trackInventoryDefaultChecked: boolean;
  lotTrackingDefaultChecked: boolean;
  expiryTrackingDefaultChecked: boolean;
  collapsible?: boolean;
  title?: string;
};

type MeasurementModeField = {
  defaultValue?: ProductMeasurementMode | string | null;
  defaultTolerancePercent?: number | null;
  disabled?: boolean;
};

type ProductStorageFieldsProps = {
  stockUnitFieldId: string;
  units: InventoryUnit[];
  stockUnitCode: string;
  defaultUnitCode: string;
  defaultRemissionMode?:
    | "disabled"
    | "operation_unit"
    | "purchase_primary"
    | "remission_profile"
    | "recipe_portion";
  stockUnitLabel?: string;
  stockUnitHint?: string;
  defaultUnitLabel?: string;
  defaultUnitHint?: string;
  rulePanel?: ReactNode;
  profilePanel?: ReactNode;
  measurementModeField?: MeasurementModeField;
  preCostingFields?: ReactNode;
  postCostingFields?: ReactNode;
  costingModeField: CostingModeField;
  trackingOptions: TrackingOptions;
};

const MEASUREMENT_MODE_OPTIONS: Array<{
  value: ProductMeasurementMode;
  label: string;
  description: string;
}> = [
  {
    value: "fixed_presentation",
    label: "Presentación fija",
    description:
      "Empaques o unidades con equivalencia exacta. Ej. galón 20 L, caja 12 un, bolsa 100 un.",
  },
  {
    value: "variable_weight",
    label: "Peso variable",
    description:
      "Productos que se compran, reciben, despachan o consumen por peso real. Ej. carnes y vegetales.",
  },
  {
    value: "count_with_weight",
    label: "Conteo + peso real",
    description:
      "Productos que se cuentan físicamente pero el stock real se controla por peso. Ej. aguacate.",
  },
  {
    value: "bulk_volume",
    label: "Granel / volumen variable",
    description:
      "Líquidos, masas o graneles donde la cantidad real puede variar por recipiente o producción.",
  },
];

function normalizeMeasurementMode(value: MeasurementModeField["defaultValue"]): ProductMeasurementMode {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "variable_weight" ||
    raw === "count_with_weight" ||
    raw === "bulk_volume" ||
    raw === "fixed_presentation"
  ) {
    return raw;
  }
  return "fixed_presentation";
}

function defaultToleranceForMode(mode: ProductMeasurementMode): number {
  if (mode === "fixed_presentation") return 0;
  if (mode === "bulk_volume") return 2;
  return 5;
}

function MeasurementModePanel({ field }: { field: MeasurementModeField }) {
  const defaultMode = normalizeMeasurementMode(field.defaultValue);
  const defaultTolerancePercent =
    field.defaultTolerancePercent != null &&
    Number.isFinite(Number(field.defaultTolerancePercent)) &&
    Number(field.defaultTolerancePercent) >= 0
      ? Number(field.defaultTolerancePercent)
      : defaultToleranceForMode(defaultMode);

  return (
    <div className="rounded-[28px] border border-[var(--ui-border)] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2">
        <div>
          <div className="ui-label">Modo de medición operativa</div>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Define cómo se comporta este producto en compras, recepción, remisiones, conteos y producción.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Cómo se mide este producto</span>
            <select
              name="measurement_mode"
              className="ui-input"
              defaultValue={defaultMode}
              disabled={Boolean(field.disabled)}
            >
              {MEASUREMENT_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {field.disabled ? (
              <input type="hidden" name="measurement_mode" value={defaultMode} />
            ) : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Tolerancia normal (%)</span>
            <input
              name="default_tolerance_percent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              className="ui-input"
              defaultValue={defaultTolerancePercent}
              disabled={Boolean(field.disabled)}
            />
            {field.disabled ? (
              <input
                type="hidden"
                name="default_tolerance_percent"
                value={defaultTolerancePercent}
              />
            ) : null}
          </label>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          {MEASUREMENT_MODE_OPTIONS.map((option) => (
            <div
              key={option.value}
              className={`rounded-2xl border px-3 py-2 text-xs ${
                option.value === defaultMode
                  ? "border-cyan-200 bg-cyan-50 text-cyan-950"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              <div className="font-bold">{option.label}</div>
              <p className="mt-1">{option.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DefaultRulePanel() {
  return (
    <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
      <p className="font-medium text-[var(--ui-text)]">Regla clara de unidades</p>
      <p className="mt-1">
        <strong className="text-[var(--ui-text)]">Unidad base:</strong> stock, costo y recetas.
      </p>
      <p>
        <strong className="text-[var(--ui-text)]">Unidad de compra:</strong> la defines en proveedor.
      </p>
      <p>
        <strong className="text-[var(--ui-text)]">Unidad operativa fallback:</strong> referencia simple para formularios.
        Las presentaciones físicas se administran aparte.
      </p>
    </div>
  );
}

function TrackingOptionsPanel({
  trackInventoryDefaultChecked,
  lotTrackingDefaultChecked,
  expiryTrackingDefaultChecked,
}: TrackingOptions) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="track_inventory" defaultChecked={trackInventoryDefaultChecked} />
          <span className="ui-label">Controlar stock</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="lot_tracking" defaultChecked={lotTrackingDefaultChecked} />
          <span className="ui-label">Lotes</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="expiry_tracking" defaultChecked={expiryTrackingDefaultChecked} />
          <span className="ui-label">Vencimiento</span>
        </label>
      </div>
      <p className="text-xs text-[var(--ui-muted)]">
        Controlar stock activa el item en entradas/salidas, remisiones, ajustes y stock. Lotes y vencimiento se
        guardan como configuración del item y quedan listos para trazabilidad cuando ese flujo este activo.
      </p>
    </div>
  );
}

export function ProductStorageFields({
  stockUnitFieldId,
  units,
  stockUnitCode,
  defaultUnitCode,
  stockUnitLabel = "Unidad base de stock",
  stockUnitHint = "Esta unidad es la referencia canónica para entradas, salidas y conteos.",
  defaultUnitLabel = "Unidad operativa fallback",
  defaultUnitHint = "Referencia simple para formularios. No reemplaza las presentaciones físicas del producto.",
  rulePanel = <DefaultRulePanel />,
  profilePanel = null,
  measurementModeField,
  preCostingFields = null,
  postCostingFields = null,
  costingModeField,
  trackingOptions,
}: ProductStorageFieldsProps) {
  const trackingContent = (
    <TrackingOptionsPanel
      trackInventoryDefaultChecked={trackingOptions.trackInventoryDefaultChecked}
      lotTrackingDefaultChecked={trackingOptions.lotTrackingDefaultChecked}
      expiryTrackingDefaultChecked={trackingOptions.expiryTrackingDefaultChecked}
    />
  );

  return (
    <>
      {rulePanel}
      {profilePanel}
      {measurementModeField ? <MeasurementModePanel field={measurementModeField} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="ui-label">{stockUnitLabel}</span>
          <select
            id={stockUnitFieldId}
            name="stock_unit_code"
            className="ui-input"
            defaultValue={stockUnitCode}
            required
          >
            {units.map((unit) => (
              <option key={unit.code} value={unit.code}>
                {unit.code} - {unit.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-[var(--ui-muted)]">{stockUnitHint}</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">{defaultUnitLabel}</span>
          <select
            name="default_unit"
            className="ui-input"
            defaultValue={defaultUnitCode}
          >
            {units.map((unit) => (
              <option key={unit.code} value={unit.code}>
                {unit.code} - {unit.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-[var(--ui-muted)]">{defaultUnitHint}</span>
        </label>

        {preCostingFields}

        <label className="flex flex-col gap-1">
          <span className="ui-label">{costingModeField.label ?? "Politica de costo"}</span>
          {costingModeField.hasSuppliers ? (
            <select
              name="costing_mode"
              className="ui-input"
              defaultValue={costingModeField.defaultValue ?? "auto_primary_supplier"}
            >
              <option value="auto_primary_supplier">
                {costingModeField.autoOptionLabel ?? "Auto desde proveedor primario"}
              </option>
              <option value="manual">{costingModeField.manualOptionLabel ?? "Manual"}</option>
            </select>
          ) : (
            <>
              <input type="hidden" name="costing_mode" value="manual" />
              <div className="ui-input flex items-center">
                {costingModeField.staticLabel ?? "Manual / externo"}
              </div>
            </>
          )}
        </label>

        {postCostingFields}
      </div>

      {trackingOptions.collapsible ? (
        <details className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3 text-sm">
          <summary className="cursor-pointer font-medium text-[var(--ui-text)]">
            {trackingOptions.title ?? "Opciones avanzadas de almacenamiento"}
          </summary>
          <div className="mt-3">{trackingContent}</div>
        </details>
      ) : (
        trackingContent
      )}
    </>
  );
}
