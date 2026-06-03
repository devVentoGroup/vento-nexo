"use client";

import { useMemo, useState } from "react";

export type ProductionRouteFormProduct = {
  id: string;
  label: string;
};

export type ProductionRouteFormArea = {
  id: string;
  kind: string;
  label: string;
};

export type ProductionRouteFormLocation = {
  id: string;
  label: string;
  areaKind: string | null;
  areaLabel: string | null;
  locationType: string | null;
};

export type ProductionRouteFormPosition = {
  id: string;
  locationId: string;
  label: string;
};

type ProductionOutputMode = "inventory_stock" | "sellable_stock" | "order_fulfillment";

type ProductionRouteFormProps = {
  siteId: string;
  action: (formData: FormData) => void | Promise<void>;
  products: ProductionRouteFormProduct[];
  areas: ProductionRouteFormArea[];
  locations: ProductionRouteFormLocation[];
  positions: ProductionRouteFormPosition[];
};

function outputModeHelp(mode: ProductionOutputMode) {
  if (mode === "order_fulfillment") {
    return "No se crea stock terminado. El POS o pedido queda como preparado/servido y solo se descuentan insumos.";
  }

  if (mode === "sellable_stock") {
    return "El resultado queda como producto listo para vender, por ejemplo vitrina, mostrador o barra.";
  }

  return "El resultado queda guardado como inventario interno, por ejemplo nevera, cuarto frío o bodega.";
}

export function ProductionRouteForm({
  siteId,
  action,
  products,
  areas,
  locations,
  positions,
}: ProductionRouteFormProps) {
  const [selectedAreaKind, setSelectedAreaKind] = useState("");
  const [outputMode, setOutputMode] = useState<ProductionOutputMode>("inventory_stock");
  const [outputLocationId, setOutputLocationId] = useState("");

  const inputLocations = useMemo(() => {
    if (!selectedAreaKind) return locations;
    const matching = locations.filter((location) => location.areaKind === selectedAreaKind);
    return matching.length > 0 ? matching : locations;
  }, [locations, selectedAreaKind]);

  const outputPositions = useMemo(() => {
    if (!outputLocationId) return [];
    return positions.filter((position) => position.locationId === outputLocationId);
  }, [outputLocationId, positions]);

  const isOrderFulfillment = outputMode === "order_fulfillment";

  return (
    <form action={action} className="mt-5 grid gap-4 xl:grid-cols-3">
      <input type="hidden" name="site_id" value={siteId} />
      {isOrderFulfillment ? (
        <>
          <input type="hidden" name="output_location_id" value="" />
          <input type="hidden" name="output_position_id" value="" />
        </>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="ui-label">Producto o preparación</span>
        <select name="product_id" className="ui-input" required>
          <option value="">Seleccionar producto</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--ui-muted)]">
          Producto terminado o preparación que saldrá de la receta.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="ui-label">Área que produce</span>
        <select
          name="area_kind"
          className="ui-input"
          required
          value={selectedAreaKind}
          onChange={(event) => setSelectedAreaKind(event.target.value)}
        >
          <option value="">Seleccionar área</option>
          {areas.map((area) => (
            <option key={area.id} value={area.kind}>
              {area.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--ui-muted)]">
          Al elegir un área, el LOC de consumo se filtra a esa área cuando sea posible.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="ui-label">LOC donde consume insumos</span>
        <select name="input_location_id" className="ui-input" required>
          <option value="">Seleccionar LOC</option>
          {inputLocations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.label}
              {location.areaLabel ? ` · ${location.areaLabel}` : ""}
            </option>
          ))}
        </select>
        <span className="text-xs text-[var(--ui-muted)]">
          Aquí se descuentan los ingredientes cuando FOGO ejecute la receta.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="ui-label">Qué pasa con lo producido</span>
        <select
          name="output_mode"
          className="ui-input"
          value={outputMode}
          onChange={(event) => {
            const nextMode = event.target.value as ProductionOutputMode;
            setOutputMode(nextMode);
            if (nextMode === "order_fulfillment") {
              setOutputLocationId("");
            }
          }}
          required
        >
          <option value="inventory_stock">Guardar como inventario</option>
          <option value="sellable_stock">Listo para vender</option>
          <option value="order_fulfillment">Pedido POS / entrega directa</option>
        </select>
        <span className="text-xs text-[var(--ui-muted)]">{outputModeHelp(outputMode)}</span>
      </label>

      {isOrderFulfillment ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 xl:col-span-2">
          <div className="font-semibold">Salida directa a pedido/POS</div>
          <p className="mt-1">
            No selecciones LOC de salida. Esta ruta consumirá insumos desde el LOC productivo y no aumentará stock
            de producto terminado.
          </p>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="ui-label">LOC donde queda lo producido</span>
            <select
              name="output_location_id"
              className="ui-input"
              value={outputLocationId}
              onChange={(event) => setOutputLocationId(event.target.value)}
              required
            >
              <option value="">Seleccionar LOC de salida</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                  {location.locationType ? ` · ${location.locationType}` : ""}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--ui-muted)]">
              Obligatorio si la salida genera inventario o producto listo para vender.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Ubicación interna de salida</span>
            <select name="output_position_id" className="ui-input" disabled={!outputLocationId}>
              <option value="">Sin ubicación interna</option>
              {outputPositions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--ui-muted)]">
              Opcional. Solo muestra ubicaciones internas del LOC de salida seleccionado.
            </span>
          </label>
        </>
      )}

      <label className="flex flex-col gap-1">
        <span className="ui-label">Nombre de ruta</span>
        <input
          name="route_name"
          className="ui-input"
          placeholder="Ej. Galletería a cuarto frío"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="ui-label">ID receta FOGO</span>
        <input
          name="external_recipe_id"
          className="ui-input"
          placeholder="Opcional"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="ui-label">Notas</span>
        <input
          name="notes"
          className="ui-input"
          placeholder="Opcional"
        />
      </label>

      <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm xl:col-span-2">
        <input name="is_default" type="checkbox" defaultChecked />
        <span>Usar como ruta principal para este producto, sede y área</span>
      </label>

      <div className="flex items-end">
        <button type="submit" className="ui-btn ui-btn--brand h-12 px-5">
          Crear ruta
        </button>
      </div>
    </form>
  );
}
