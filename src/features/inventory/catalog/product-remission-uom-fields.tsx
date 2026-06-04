"use client";

import { useEffect, useMemo, useState } from "react";

type UnitOption = {
  code: string;
  name?: string | null;
};

type RemissionSourceMode =
  | "disabled"
  | "operation_unit"
  | "purchase_primary"
  | "remission_profile"
  | "recipe_portion";

type ProductRemissionUomFieldsProps = {
  units: UnitOption[];
  stockUnitCode: string;
  defaultLabel?: string;
  defaultInputUnitCode?: string;
  defaultQtyInStockUnit?: number | null;
  defaultSourceMode?: RemissionSourceMode;
  allowPurchasePrimaryOption?: boolean;
  allowRecipePortionOption?: boolean;
  variant?: "default" | "preparation";
  fogoRecipeHref?: string | null;
  recipePortionAvailable?: boolean;
};

function normalizeMode(value: string): RemissionSourceMode {
  if (
    value === "disabled" ||
    value === "operation_unit" ||
    value === "purchase_primary" ||
    value === "remission_profile" ||
    value === "recipe_portion"
  ) {
    return value;
  }

  return "disabled";
}

function modeLabel(mode: RemissionSourceMode, variant: "default" | "preparation") {
  if (mode === "disabled") {
    return variant === "preparation"
      ? "No remisionar esta preparación"
      : "No usar remisión";
  }

  if (mode === "operation_unit") {
    return variant === "preparation"
      ? "Unidad operativa temporal"
      : "Unidad operativa";
  }

  if (mode === "purchase_primary") return "Presentación de compra";
  if (mode === "recipe_portion") return "Porción de receta";
  return variant === "preparation"
    ? "Presentación manual de remisión"
    : "Presentación de remisión";
}

export function ProductRemissionUomFields({
  units,
  stockUnitCode,
  defaultLabel,
  defaultInputUnitCode,
  defaultQtyInStockUnit,
  defaultSourceMode = "disabled",
  allowPurchasePrimaryOption = true,
  allowRecipePortionOption = false,
  variant = "default",
  fogoRecipeHref,
  recipePortionAvailable = false,
}: ProductRemissionUomFieldsProps) {
  const [mode, setMode] = useState<RemissionSourceMode>(defaultSourceMode);
  const showManualFields = mode === "remission_profile";
  const isPreparation = variant === "preparation";

  const normalizedUnits = useMemo(
    () => units.filter((unit) => String(unit.code ?? "").trim().length > 0),
    [units]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("inventory-remission-mode-change", {
        detail: { mode },
      })
    );
  }, [mode]);

  const panelClass = isPreparation
    ? "rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4"
    : "rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4";

  return (
    <div className={panelClass}>
      <div className={isPreparation ? "text-sm font-semibold text-cyan-950" : "text-sm font-semibold text-[var(--ui-text)]"}>
        {isPreparation ? "Remisión ligada a producción / FOGO" : "Presentación remisión (operación)"}
      </div>
      <p className={isPreparation ? "mt-1 text-xs leading-5 text-cyan-900" : "mt-1 text-xs text-[var(--ui-muted)]"}>
        {isPreparation
          ? "Define cómo se moverá esta preparación cuando salga del centro de producción. Lo ideal es usar porción/rendimiento de receta cuando FOGO ya la tenga publicada."
          : "Define explícitamente cómo se mueve este producto en remisiones, traslados y formularios."}
      </p>

      {mode === "disabled" ? (
        <div className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
          <input type="hidden" name="remission_source_mode" value="disabled" />
          <p className="text-sm text-[var(--ui-muted)]">
            {isPreparation
              ? "Esta preparación queda como WIP interno: se puede producir y consumir internamente, pero no queda habilitada para remisiones operativas."
              : "No aplica para satélites: este producto queda solo para operación interna del centro."}
          </p>
          <button
            type="button"
            onClick={() => setMode("operation_unit")}
            className="mt-2 ui-btn ui-btn--ghost ui-btn--sm"
          >
            {isPreparation ? "Configurar salida operativa" : "Configurar remisión"}
          </button>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="ui-label">
              {isPreparation ? "Fuente de unidad para remisión" : "Usar en operación"}
            </span>
            <select
              name="remission_source_mode"
              value={mode}
              onChange={(event) => setMode(normalizeMode(event.target.value))}
              className="ui-input"
            >
              <option value="disabled">
                {isPreparation
                  ? "No remisionar esta preparación"
                  : "No usar remisión (solo centro de producción)"}
              </option>
              <option value="operation_unit">
                {isPreparation
                  ? "Unidad operativa temporal"
                  : "Unidad operativa (arriba)"}
              </option>
              {allowPurchasePrimaryOption ? (
                <option value="purchase_primary">Presentación de compra (proveedor primario)</option>
              ) : null}
              {allowRecipePortionOption ? (
                <option value="recipe_portion">Porción de receta publicada</option>
              ) : null}
              <option value="remission_profile">
                {isPreparation
                  ? "Presentación manual de remisión"
                  : "Presentación de remisión (este bloque)"}
              </option>
            </select>
            <span className="ui-caption">
              {isPreparation
                ? "Para preparaciones, la mejor fuente es FOGO cuando ya existe receta publicada con rendimiento o porción."
                : "Esta selección define qué unidad se usa en remisiones."}
            </span>
          </label>

          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--ui-border)] bg-white/70 p-3">
              <div className="ui-caption">Selección actual</div>
              <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
                {modeLabel(mode, variant)}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-white/70 p-3">
              <div className="ui-caption">Unidad base</div>
              <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
                {stockUnitCode || "-"}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-white/70 p-3">
              <div className="ui-caption">{isPreparation ? "FOGO" : "Origen"}</div>
              <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
                {mode === "recipe_portion"
                  ? recipePortionAvailable
                    ? "Receta publicada"
                    : "Pendiente"
                  : mode === "purchase_primary"
                    ? "Proveedor"
                    : "NEXO"}
              </div>
            </div>
          </div>

          {mode === "recipe_portion" ? (
            <div className="sm:col-span-2 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-950">
              <div className="font-semibold">Porción de receta publicada</div>
              <p className="mt-1 leading-6">
                Esta opción debe usarse cuando FOGO ya tenga receta publicada con rendimiento, porción o presentación
                remisionable. NEXO tomará esa referencia como unidad operativa para remisiones.
              </p>
              {!recipePortionAvailable ? (
                <p className="mt-2 text-xs text-cyan-900">
                  Si la receta todavía no está publicada, guarda temporalmente con unidad operativa o presentación manual.
                </p>
              ) : null}
              {fogoRecipeHref ? (
                <a
                  href={fogoRecipeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex ui-btn ui-btn--ghost ui-btn--sm"
                >
                  Abrir receta en FOGO
                </a>
              ) : null}
            </div>
          ) : null}

          {mode === "operation_unit" && isPreparation ? (
            <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <div className="font-semibold">Unidad temporal</div>
              <p className="mt-1 leading-6">
                Úsala solo mientras la receta no tenga rendimiento publicado en FOGO. Cuando FOGO publique la porción,
                cambia esta fuente a “Porción de receta publicada”.
              </p>
            </div>
          ) : null}

          {showManualFields ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="ui-label">
                  {isPreparation ? "Nombre presentación operativa" : "Nombre presentación"}
                </span>
                <input
                  name="remission_uom_label"
                  defaultValue={defaultLabel ?? "Unidad operativa"}
                  className="ui-input"
                  placeholder={isPreparation ? "Botella, lote, porción, bolsa" : "Paquete, bolsa, unidad"}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="ui-label">Unidad de remisión</span>
                <select
                  name="remission_uom_code"
                  defaultValue={defaultInputUnitCode ?? stockUnitCode}
                  className="ui-input"
                >
                  {normalizedUnits.map((unit) => (
                    <option key={unit.code} value={unit.code}>
                      {unit.code} - {unit.name ?? unit.code}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="ui-label">Equivalencia a base</span>
                <input
                  name="remission_uom_qty_in_stock"
                  type="number"
                  step="0.000001"
                  min="0"
                  defaultValue={defaultQtyInStockUnit ?? 1}
                  className="ui-input"
                  placeholder={`1 ${defaultInputUnitCode ?? stockUnitCode} = ? ${stockUnitCode}`}
                />
                <span className="ui-caption">
                  {isPreparation
                    ? "Equivalencia temporal hasta que FOGO publique rendimiento o porción de receta."
                    : "Solo aplica cuando “Usar en operación” = “Presentación de remisión”."}
                </span>
              </label>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
