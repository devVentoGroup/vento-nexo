"use client";

type Props = {
  yieldQty?: number;
  yieldUnit?: string;
  portionSize?: number;
  portionUnit?: string;
  prepTimeMinutes?: number;
  shelfLifeDays?: number;
  difficulty?: string;
  recipeDescription?: string;
};

export function RecipeMetadataFields({
  yieldQty,
  yieldUnit,
  portionSize,
  portionUnit,
  prepTimeMinutes,
  shelfLifeDays,
  difficulty,
  recipeDescription,
}: Props) {
  return (
    <div className="space-y-4">
      <span className="ui-label">Ficha de receta</span>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-semibold">Rendimiento (cantidad)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            name="yield_qty"
            defaultValue={yieldQty ?? ""}
            className="ui-input"
            placeholder="Ej. 10"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-semibold">Unidad rendimiento</span>
          <input
            type="text"
            name="yield_unit"
            defaultValue={yieldUnit ?? ""}
            className="ui-input"
            placeholder="Ej. porciones, kg, un"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-semibold">Tiempo prep. (min)</span>
          <input
            type="number"
            min="0"
            name="prep_time_minutes"
            defaultValue={prepTimeMinutes ?? ""}
            className="ui-input"
            placeholder="Ej. 30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-semibold">Porcion (tamaño)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            name="portion_size"
            defaultValue={portionSize ?? ""}
            className="ui-input"
            placeholder="Ej. 1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-semibold">Unidad porcion</span>
          <input
            type="text"
            name="portion_unit"
            defaultValue={portionUnit ?? ""}
            className="ui-input"
            placeholder="Ej. un, pieza"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-semibold">Vida util (dias)</span>
          <input
            type="number"
            min="0"
            name="shelf_life_days"
            defaultValue={shelfLifeDays ?? ""}
            className="ui-input"
            placeholder="Ej. 3"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-semibold">Dificultad</span>
          <select
            name="difficulty"
            defaultValue={difficulty ?? ""}
            className="ui-input"
          >
            <option value="">Sin definir</option>
            <option value="facil">Facil</option>
            <option value="medio">Medio</option>
            <option value="dificil">Dificil</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="ui-caption font-semibold">Descripcion de la receta</span>
        <textarea
          name="recipe_description"
          rows={3}
          defaultValue={recipeDescription ?? ""}
          className="ui-input min-h-0 py-2"
          placeholder="Descripcion general: tecnica, presentacion, notas..."
        />
      </label>
    </div>
  );
}
