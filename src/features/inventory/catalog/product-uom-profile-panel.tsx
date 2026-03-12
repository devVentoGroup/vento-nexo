type ProductUomProfileSummary = {
  label: string;
  input_unit_code: string;
  qty_in_input_unit: number;
  qty_in_stock_unit: number;
};

type ProductUomProfilePanelProps = {
  stockUnitCode: string;
  purchaseUomProfile?: ProductUomProfileSummary | null;
  remissionUomProfile?: ProductUomProfileSummary | null;
};

export function ProductUomProfilePanel({
  stockUnitCode,
  purchaseUomProfile,
  remissionUomProfile,
}: ProductUomProfilePanelProps) {
  if (!purchaseUomProfile && !remissionUomProfile) return null;

  return (
    <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
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
