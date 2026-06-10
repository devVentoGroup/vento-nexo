import Link from "next/link";

type NewProductHeroProps = {
  catalogHref: string;
  catalogLabel: string;
  configTitle: string;
  hasRecipe: boolean;
  isAssetItem: boolean;
  normalizedProductType: string;
  typeLabel: string;
};

export function NewProductHero({
  catalogHref,
  catalogLabel,
  configTitle,
  hasRecipe,
  isAssetItem,
  normalizedProductType,
  typeLabel,
}: NewProductHeroProps) {
  const shortTypeLabel = isAssetItem
    ? "Activo"
    : normalizedProductType === "preparacion"
      ? "Prep"
      : normalizedProductType === "venta"
        ? "Venta"
        : "Insumo";

  return (
    <section className="ui-remission-hero ui-fade-up">
      <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
        <div className="space-y-4">
          <div className="space-y-2">
            <Link
              href={catalogHref}
              className="ui-btn ui-btn--ghost inline-flex h-12 items-center px-5 text-base font-semibold"
            >
              ← Volver a {catalogLabel}
            </Link>
            <h1 className="ui-h1">{configTitle}</h1>
            <p className="ui-body-muted">
              {isAssetItem
                ? "Crea el modelo base del catálogo patrimonial. Las unidades reales se gestionan después en Activos físicos."
                : "Crea la ficha maestra con el mismo orden de edición: identidad, receta, inventario, compra y sedes."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
              Nuevo
            </span>
            <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
              {typeLabel}
            </span>
            {hasRecipe ? (
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                Con receta
              </span>
            ) : null}
          </div>
        </div>

        <div className="ui-remission-kpis ui-remission-kpis--stack sm:grid-cols-3 lg:grid-cols-1">
          <article className="ui-remission-kpi" data-tone="warm">
            <div className="ui-remission-kpi-label">Estado</div>
            <div className="ui-remission-kpi-value">Nuevo</div>
            <div className="ui-remission-kpi-note">Se guardará como maestro activo</div>
          </article>
          <article className="ui-remission-kpi" data-tone="cool">
            <div className="ui-remission-kpi-label">Tipo</div>
            <div className="ui-remission-kpi-value">{shortTypeLabel}</div>
            <div className="ui-remission-kpi-note">Clasificación operativa del producto</div>
          </article>
          <article className="ui-remission-kpi" data-tone="success">
            <div className="ui-remission-kpi-label">{isAssetItem ? "Operación real" : "Sedes"}</div>
            <div className="ui-remission-kpi-value">{isAssetItem ? "Assets" : "0"}</div>
            <div className="ui-remission-kpi-note">
              {isAssetItem ? "Después creas activos físicos" : "Se configurarán al guardar"}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
