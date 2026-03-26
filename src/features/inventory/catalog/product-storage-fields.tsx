"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { InventoryUnit } from "@/lib/inventory/uom";

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
  preCostingFields?: ReactNode;
  postCostingFields?: ReactNode;
  costingModeField: CostingModeField;
  trackingOptions: TrackingOptions;
};

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
        <strong className="text-[var(--ui-text)]">Unidad operativa:</strong> se usa en formularios cuando no hay
        empaque activo.
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
        guardan como configuracion del item y quedan listos para trazabilidad cuando ese flujo este activo.
      </p>
    </div>
  );
}

export function ProductStorageFields({
  stockUnitFieldId,
  units,
  stockUnitCode,
  defaultUnitCode,
  defaultRemissionMode = "disabled",
  stockUnitLabel = "Unidad base de stock",
  stockUnitHint = "Esta unidad es la referencia canonica para entradas, salidas y conteos.",
  defaultUnitLabel = "Unidad operativa (formularios)",
  defaultUnitHint = "Se usa en formularios cuando no hay empaque operativo.",
  rulePanel = <DefaultRulePanel />,
  profilePanel = null,
  preCostingFields = null,
  postCostingFields = null,
  costingModeField,
  trackingOptions,
}: ProductStorageFieldsProps) {
  const [selectedDefaultUnit, setSelectedDefaultUnit] = useState(defaultUnitCode);
  const [remissionMode, setRemissionMode] = useState<
    | "disabled"
    | "operation_unit"
    | "purchase_primary"
    | "remission_profile"
    | "recipe_portion"
  >(defaultRemissionMode);
  const showOperationUnitSelector = remissionMode === "operation_unit";

  useEffect(() => {
    const onRemissionModeChange = (event: Event) => {
      const custom = event as CustomEvent<{ mode?: string }>;
      const nextMode = String(custom.detail?.mode ?? "").trim().toLowerCase();
      if (
        nextMode === "disabled" ||
        nextMode === "operation_unit" ||
        nextMode === "purchase_primary" ||
        nextMode === "remission_profile" ||
        nextMode === "recipe_portion"
      ) {
        setRemissionMode(nextMode);
      }
    };
    window.addEventListener("inventory-remission-mode-change", onRemissionModeChange as EventListener);
    return () => {
      window.removeEventListener(
        "inventory-remission-mode-change",
        onRemissionModeChange as EventListener
      );
    };
  }, []);

  useEffect(() => {
    setSelectedDefaultUnit(defaultUnitCode);
  }, [defaultUnitCode]);

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

        {showOperationUnitSelector ? (
          <label className="flex flex-col gap-1">
            <span className="ui-label">{defaultUnitLabel}</span>
            <select
              name="default_unit"
              className="ui-input"
              value={selectedDefaultUnit}
              onChange={(event) => setSelectedDefaultUnit(event.target.value)}
            >
              {units.map((unit) => (
                <option key={unit.code} value={unit.code}>
                  {unit.code} - {unit.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--ui-muted)]">{defaultUnitHint}</span>
          </label>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="ui-label">{defaultUnitLabel}</span>
            <div className="ui-input flex items-center bg-[var(--ui-bg-soft)] text-[var(--ui-muted)]">
              {selectedDefaultUnit}
            </div>
            <span className="text-xs text-[var(--ui-muted)]">
              Se oculta edición porque en operación está activa la opción{" "}
              {remissionMode === "disabled"
                ? "sin remisión"
                : remissionMode === "purchase_primary"
                  ? "presentación de compra"
                  : remissionMode === "recipe_portion"
                    ? "porción de receta"
                  : "presentación de remisión manual"}
              .
            </span>
            <input type="hidden" name="default_unit" value={selectedDefaultUnit} />
          </div>
        )}

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
