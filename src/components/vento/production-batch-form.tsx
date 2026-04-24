"use client";

import { useMemo, useState } from "react";

import { normalizeUnitCode, roundQuantity } from "@/lib/inventory/uom";

type ProductOption = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
};

type LocationOption = {
  id: string;
  code: string;
  zone: string | null;
};

type RecipePreview = {
  productId: string;
  yieldQty: number;
  yieldUnit: string;
  ingredients: Array<{
    ingredientProductId: string;
    ingredientName: string;
    stockUnitCode: string;
    quantityPerYield: number;
  }>;
};

type Props = {
  siteId: string;
  siteName: string;
  products: ProductOption[];
  locations: LocationOption[];
  recipePreviews: RecipePreview[];
  defaultDestinationLocationId: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function ProductionBatchForm({
  siteId,
  siteName,
  products,
  locations,
  recipePreviews,
  defaultDestinationLocationId,
  action,
}: Props) {
  const [consumeRecipe, setConsumeRecipe] = useState(true);

  const [productId, setProductId] = useState("");
  const [producedQty, setProducedQty] = useState("");
  const [producedUnit, setProducedUnit] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState(defaultDestinationLocationId);
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [productId, products]
  );
  const recipeByProduct = useMemo(
    () => new Map(recipePreviews.map((recipe) => [recipe.productId, recipe])),
    [recipePreviews]
  );
  const selectedRecipe = productId ? recipeByProduct.get(productId) ?? null : null;
  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === destinationLocationId) ?? null,
    [destinationLocationId, locations]
  );

  const parsedQty = Number(producedQty);
  const hasValidQty = Number.isFinite(parsedQty) && parsedQty > 0;
  const hasRecipe = Boolean(selectedRecipe && selectedRecipe.ingredients.length > 0);
  const canSubmit =
    Boolean(productId) &&
    hasValidQty &&
    Boolean(producedUnit.trim()) &&
    Boolean(destinationLocationId) &&
    hasRecipe;

  const computedIngredients = useMemo(() => {
    if (!selectedRecipe || !hasValidQty) return [];
    const yieldQty = Number(selectedRecipe.yieldQty ?? 1) > 0 ? Number(selectedRecipe.yieldQty) : 1;
    const factor = parsedQty / yieldQty;
    return selectedRecipe.ingredients.map((ingredient) => ({
      ...ingredient,
      requiredQty: roundQuantity(Number(ingredient.quantityPerYield) * factor, 6),
    }));
  }, [hasValidQty, parsedQty, selectedRecipe]);

  return (
    <form action={action} className="space-y-6 pb-24 lg:pb-0">
      <input type="hidden" name="site_id" value={siteId} />
      <input type="hidden" name="consume_recipe" value={consumeRecipe ? "1" : "0"} />

      <section className="ui-panel space-y-4">
        <div className="ui-h3">Lote</div>

        <div className="ui-panel-soft p-3">
          <div className="ui-caption">Sede activa</div>
          <div className="mt-1 font-semibold">{siteName}</div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Producto terminado</span>
          <select
            name="product_id"
            className="ui-input"
            value={productId}
            onChange={(event) => {
              const nextId = event.target.value;
              setProductId(nextId);
              const nextProduct = products.find((product) => product.id === nextId);
              const nextUnit = normalizeUnitCode(
                nextProduct?.stock_unit_code ?? nextProduct?.unit ?? ""
              );
              if (nextUnit) {
                setProducedUnit(nextUnit);
              }
            }}
            required
          >
            <option value="">Selecciona producto</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name ?? product.id}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="ui-panel space-y-4">
        <div className="ui-h3">Detalle</div>

        <div className="grid gap-3 ui-mobile-stack md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Cantidad producida</span>
            <input
              name="produced_qty"
              value={producedQty}
              onChange={(event) => {
                setProducedQty(event.target.value);
              }}
              placeholder="Cantidad"
              className="ui-input"
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Unidad de lote (base)</span>
            <input
              name="produced_unit"
              value={producedUnit}
              onChange={(event) => {
                setProducedUnit(event.target.value);
              }}
              placeholder="ej: un, kg, ml"
              className="ui-input"
              required
            />
            <span className="text-xs text-[var(--ui-muted)]">
              Debe coincidir con unidad base del producto.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Área destino del terminado</span>
            <select
              name="destination_location_id"
              value={destinationLocationId}
              onChange={(event) => {
                setDestinationLocationId(event.target.value);
              }}
              className="ui-input"
              required
            >
              <option value="">Selecciona área</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code}
                  {location.zone ? ` (${location.zone})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Fecha de vencimiento</span>
            <input
              type="date"
              name="expires_at"
              value={expiresAt}
              onChange={(event) => {
                setExpiresAt(event.target.value);
              }}
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="ui-label">Notas</span>
            <input
              name="notes"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
              }}
              placeholder="Turno, observaciones, mermas relevantes"
              className="ui-input"
            />
          </label>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <div className="ui-h3">Impacto</div>

        <div className="grid gap-3 ui-mobile-stack sm:grid-cols-2 xl:grid-cols-4">
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Producto</div>
            <div className="mt-1 font-semibold">{selectedProduct?.name ?? "Sin definir"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Ingreso de terminado</div>
            <div className="mt-1 font-semibold">
              {hasValidQty ? `${parsedQty} ${producedUnit || ""}` : "Sin definir"}
            </div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Área destino</div>
            <div className="mt-1 font-semibold">{selectedLocation?.code ?? "Sin definir"}</div>
          </div>
          <div className="ui-panel-soft p-3">
            <div className="ui-caption">Receta activa</div>
            <div className="mt-1 font-semibold">{hasRecipe ? "Si" : "No"}</div>
          </div>
        </div>

        {!hasRecipe ? (
          <div className="ui-alert ui-alert--warn">
            El producto no tiene receta activa. No se puede registrar produccion automatica.
          </div>
        ) : null}
        {hasRecipe ? (
          <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
            <div className="text-sm font-semibold text-[var(--ui-text)]">Consumo estimado por receta</div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">
              Rendimiento base: {selectedRecipe?.yieldQty} {selectedRecipe?.yieldUnit}
            </div>
            <ul className="mt-3 space-y-1 text-sm text-[var(--ui-text)]">
              {computedIngredients.map((ingredient) => (
                <li key={ingredient.ingredientProductId}>
                  {ingredient.ingredientName}: {ingredient.requiredQty} {ingredient.stockUnitCode}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="ui-panel space-y-4">
        <div className="ui-h3">Opciones</div>

        <label className="flex items-start gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-3 py-3">
          <input
            type="checkbox"
            checked={consumeRecipe}
            onChange={(event) => {
              setConsumeRecipe(event.target.checked);
            }}
          />
          <span className="ui-caption">
            Consumir receta automáticamente.
          </span>
        </label>
        {!canSubmit ? (
          <div className="ui-alert ui-alert--warn">
            Completa producto, cantidad válida, área destino y receta activa.
          </div>
        ) : null}
      </section>

      <div className="ui-mobile-sticky-footer flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-[var(--ui-muted)]">
          {selectedProduct?.name ?? "Sin producto"}
          {hasValidQty ? ` · ${parsedQty} ${producedUnit || ""}` : ""}
        </div>
        <button
          type="submit"
          className="ui-btn ui-btn--brand"
          disabled={!consumeRecipe || !canSubmit}
        >
          Registrar lote
        </button>
      </div>
    </form>
  );
}
