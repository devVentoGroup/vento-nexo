type UnitOption = {
  code: string;
  name?: string | null;
};

type ProductRemissionUomFieldsProps = {
  units: UnitOption[];
  stockUnitCode: string;
  defaultLabel?: string;
  defaultInputUnitCode?: string;
  defaultQtyInStockUnit?: number | null;
};

export function ProductRemissionUomFields({
  units,
  stockUnitCode,
  defaultLabel,
  defaultInputUnitCode,
  defaultQtyInStockUnit,
}: ProductRemissionUomFieldsProps) {
  return (
    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
      <div className="text-sm font-semibold text-[var(--ui-text)]">
        Presentación remisión (operación)
      </div>
      <p className="mt-1 text-xs text-[var(--ui-muted)]">
        Define explícitamente cómo se mueve este producto en remisiones, traslados y formularios.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="ui-label">Nombre presentación</span>
          <input
            name="remission_uom_label"
            defaultValue={defaultLabel ?? "Unidad operativa"}
            className="ui-input"
            placeholder="Paquete, bolsa, unidad"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Unidad de remisión</span>
          <select
            name="remission_uom_code"
            defaultValue={defaultInputUnitCode ?? stockUnitCode}
            className="ui-input"
          >
            {units.map((unit) => (
              <option key={unit.code} value={unit.code}>
                {unit.code} - {unit.name ?? unit.code}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
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
            1 unidad de remisión equivale a X {stockUnitCode}.
          </span>
        </label>
      </div>
    </div>
  );
}

