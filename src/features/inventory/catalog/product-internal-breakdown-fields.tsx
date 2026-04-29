type UnitOption = {
  code: string;
  name?: string | null;
};

type ProductInternalBreakdownFieldsProps = {
  units: UnitOption[];
  stockUnitCode: string;
  defaultEnabled?: boolean;
  defaultLabel?: string | null;
  defaultInputUnitCode?: string | null;
  defaultQtyInStockUnit?: number | null;
};

export function ProductInternalBreakdownFields({
  units,
  stockUnitCode,
  defaultEnabled = false,
  defaultLabel,
  defaultInputUnitCode,
  defaultQtyInStockUnit,
}: ProductInternalBreakdownFieldsProps) {
  const normalizedUnits = units.filter((unit) => String(unit.code ?? "").trim().length > 0);

  return (
    <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--ui-text)]">Desglose visual interno</div>
          <p className="mt-1 text-xs text-[var(--ui-muted)]">
            Sirve para mostrar stock abierto en el board/quiosco sin cambiar la unidad de remision.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--ui-text)]">
          <input type="checkbox" name="internal_breakdown_enabled" defaultChecked={defaultEnabled} />
          Usar
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="ui-label">Nombre interno</span>
          <input
            name="internal_breakdown_label"
            defaultValue={defaultLabel ?? ""}
            className="ui-input"
            placeholder="bolsa, unidad, botella"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Unidad equivalente</span>
          <select
            name="internal_breakdown_unit_code"
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
            name="internal_breakdown_qty_in_stock"
            type="number"
            step="0.000001"
            min="0"
            defaultValue={defaultQtyInStockUnit ?? ""}
            className="ui-input"
            placeholder={`1 bolsa = ? ${stockUnitCode}`}
          />
          <span className="ui-caption">
            Ejemplo leche: remision = paquete x6, desglose interno = bolsa, equivalencia = 1000 ml.
          </span>
        </label>
      </div>
    </div>
  );
}
