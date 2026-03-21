type ProductCostStatusPanelProps = {
  hasSuppliers: boolean;
  hasRecipe: boolean;
  hasComputedCost: boolean;
  costingMode?: "auto_primary_supplier" | "manual" | null;
  autoCostReady: boolean;
  autoCostReadinessReason?: string | null;
  currentCost?: number | null;
};

export function ProductCostStatusPanel({
  hasSuppliers,
  hasRecipe,
  hasComputedCost,
  costingMode,
  autoCostReady,
  autoCostReadinessReason,
  currentCost,
}: ProductCostStatusPanelProps) {
  const statusLabel = hasSuppliers
    ? costingMode === "manual"
      ? "Manual"
      : autoCostReady
        ? "Listo"
        : "Incompleto"
    : hasRecipe
      ? hasComputedCost
        ? "Listo (externo)"
        : "Pendiente (externo)"
      : "Manual";

  return (
    <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3 text-sm text-[var(--ui-muted)] lg:col-span-2">
      <p className="font-medium text-[var(--ui-text)]">Estado de costo: {statusLabel}</p>
      <p className="mt-1">
        Costo actual:{" "}
        <strong className="text-[var(--ui-text)]">
          {currentCost != null ? `$${Number(currentCost).toLocaleString("es-CO")}` : "Sin calcular"}
        </strong>
      </p>
      {hasSuppliers && costingMode === "auto_primary_supplier" ? (
        <p className="mt-1">
          {autoCostReadinessReason
            ? `Falta completar: ${autoCostReadinessReason}`
            : "Se actualiza automaticamente con proveedor primario y entradas."}
        </p>
      ) : hasRecipe ? (
        <p className="mt-1">Se actualiza desde receta y lotes en FOGO (ingredientes / rendimiento).</p>
      ) : (
        <p className="mt-1">Modo manual activo. Puedes volver a automatico cuando quieras.</p>
      )}
    </div>
  );
}
