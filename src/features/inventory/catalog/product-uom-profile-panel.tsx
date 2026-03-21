type ProductUomProfileSummary = {
  label: string;
  input_unit_code: string;
  qty_in_input_unit: number;
  qty_in_stock_unit: number;
};

type ProductUomProfilePanelProps = {
  stockUnitCode: string;
  defaultUnitCode?: string | null;
  purchaseUomProfile?: ProductUomProfileSummary | null;
  remissionUomProfile?: ProductUomProfileSummary | null;
};

export function ProductUomProfilePanel({
  stockUnitCode,
  defaultUnitCode,
  purchaseUomProfile,
  remissionUomProfile,
}: ProductUomProfilePanelProps) {
  const operationUnit = String(defaultUnitCode ?? "").trim() || stockUnitCode;

  return (
    <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)] space-y-2">
      <div className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2">
        <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">Resumen operativo</p>
        <p className="mt-1">
          <strong className="text-[var(--ui-text)]">Unidad usada por defecto en operación:</strong>{" "}
          <span className="ui-chip ui-chip--brand">{operationUnit}</span>
        </p>
        <p className="mt-1 text-xs">
          En remisiones se usa primero la presentación activa de remisión; si no existe, se usa esta unidad operativa.
        </p>
      </div>
      <p>
        <strong className="text-[var(--ui-text)]">Unidad base (consumo y costo):</strong> {stockUnitCode}
      </p>
      {purchaseUomProfile ? (
        <p>
          <strong className="text-[var(--ui-text)]">Presentacion compra:</strong> {purchaseUomProfile.label} (
          {purchaseUomProfile.qty_in_input_unit} {purchaseUomProfile.input_unit_code} ={" "}
          {purchaseUomProfile.qty_in_stock_unit} {stockUnitCode})
        </p>
      ) : null}
      {remissionUomProfile ? (
        <p>
          <strong className="text-[var(--ui-text)]">Presentacion remision:</strong> {remissionUomProfile.label} (
          {remissionUomProfile.qty_in_input_unit} {remissionUomProfile.input_unit_code} ={" "}
          {remissionUomProfile.qty_in_stock_unit} {stockUnitCode})
        </p>
      ) : null}
    </div>
  );
}
