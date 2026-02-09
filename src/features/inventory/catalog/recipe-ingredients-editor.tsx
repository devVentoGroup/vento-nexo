"use client";

import { useCallback, useMemo, useState } from "react";

export type IngredientLine = {
  id?: string;
  ingredient_product_id: string;
  quantity: number | undefined;
  _delete?: boolean;
};

type ProductOption = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  cost: number | null;
};

type Props = {
  name?: string;
  initialRows: IngredientLine[];
  products: ProductOption[];
};

const emptyLine = (): IngredientLine => ({
  ingredient_product_id: "",
  quantity: undefined,
});

export function RecipeIngredientsEditor({
  name = "ingredient_lines",
  initialRows,
  products,
}: Props) {
  const [lines, setLines] = useState<IngredientLine[]>(
    initialRows.length ? initialRows : [emptyLine()]
  );
  const [search, setSearch] = useState("");

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  const updateLine = useCallback((index: number, patch: Partial<IngredientLine>) => {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, emptyLine()]);
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => {
      const line = prev[index];
      if (line?.id) {
        return prev.map((l, i) => (i === index ? { ...l, _delete: true } : l));
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const visibleLines = lines.filter((l) => !l._delete);

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const totalCost = useMemo(() => {
    let total = 0;
    for (const line of visibleLines) {
      const p = productMap.get(line.ingredient_product_id);
      if (p?.cost && line.quantity) total += p.cost * line.quantity;
    }
    return total;
  }, [visibleLines, productMap]);

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(lines)} />
      <div className="flex items-center justify-between">
        <span className="ui-label">Ingredientes (BOM)</span>
        <button type="button" onClick={addLine} className="ui-btn ui-btn--ghost ui-btn--sm">
          + Agregar ingrediente
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar ingrediente por nombre o SKU..."
        className="ui-input w-full"
      />

      <div className="overflow-x-auto">
        <table className="ui-table min-w-full text-sm">
          <thead>
            <tr>
              <th className="ui-th">Ingrediente</th>
              <th className="ui-th">Cantidad</th>
              <th className="ui-th">Unidad</th>
              <th className="ui-th">Costo unit.</th>
              <th className="ui-th">Subtotal</th>
              <th className="ui-th w-10" />
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((line, index) => {
              const realIndex = lines.findIndex((l) => l === line);
              const product = productMap.get(line.ingredient_product_id);
              const subtotal =
                product?.cost && line.quantity ? product.cost * line.quantity : null;
              return (
                <tr key={line.id ?? `new-${index}`}>
                  <td className="ui-td pr-2">
                    <select
                      value={line.ingredient_product_id}
                      onChange={(e) =>
                        updateLine(realIndex, { ingredient_product_id: e.target.value })
                      }
                      className="ui-input min-w-[200px]"
                    >
                      <option value="">Seleccionar</option>
                      {filteredProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name ?? p.id}
                          {p.sku ? ` (${p.sku})` : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="ui-td pr-2">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={line.quantity ?? ""}
                      onChange={(e) =>
                        updateLine(realIndex, {
                          quantity: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="ui-input w-24"
                      placeholder="0"
                    />
                  </td>
                  <td className="ui-td pr-2">
                    <span className="ui-caption">{product?.unit ?? "—"}</span>
                  </td>
                  <td className="ui-td pr-2">
                    <span className="ui-caption font-mono">
                      {product?.cost != null ? `$${product.cost.toLocaleString()}` : "—"}
                    </span>
                  </td>
                  <td className="ui-td pr-2">
                    <span className="ui-caption font-mono font-semibold">
                      {subtotal != null ? `$${subtotal.toLocaleString()}` : "—"}
                    </span>
                  </td>
                  <td className="ui-td">
                    <button
                      type="button"
                      onClick={() => removeLine(realIndex)}
                      className="ui-btn ui-btn--danger ui-btn--sm"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              );
            })}
            {visibleLines.length === 0 && (
              <tr>
                <td className="ui-td ui-empty" colSpan={6}>
                  Sin ingredientes. Agrega al menos uno.
                </td>
              </tr>
            )}
          </tbody>
          {totalCost > 0 && (
            <tfoot>
              <tr>
                <td className="ui-td font-semibold" colSpan={4}>
                  Costo total estimado
                </td>
                <td className="ui-td font-mono font-semibold">
                  ${totalCost.toLocaleString()}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
