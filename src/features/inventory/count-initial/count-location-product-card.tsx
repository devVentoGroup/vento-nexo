"use client";

import { memo } from "react";
import {
  hasExplicitCount,
  parseCountQuantity,
  resolveCountUnit,
  type CountLocationEntry,
  type CountLocationProduct,
  type CountUnitOption,
  type InternalPositionOption,
} from "./count-location-model";

type Props = {
  product: CountLocationProduct;
  entries: CountLocationEntry[];
  unitOptions: CountUnitOption[];
  positions: InternalPositionOption[];
  onChange: (entryId: string, patch: Partial<CountLocationEntry>) => void;
  onAdd: () => void;
  onRemove: (entryId: string) => void;
};

export const CountLocationProductCard = memo(function CountLocationProductCard({
  product,
  entries,
  unitOptions,
  positions,
  onChange,
  onAdd,
  onRemove,
}: Props) {
  const explicit = entries.some((entry) => hasExplicitCount(entry.rawQuantity));
  const total = entries.reduce((sum, entry) => sum + parseCountQuantity(entry.rawQuantity), 0);
  const stateLabel = !explicit ? "Pendiente" : total === 0 ? "Cero confirmado" : "Registrado";
  const stateClass = !explicit
    ? "border-slate-200 bg-slate-50 text-slate-700"
    : total === 0
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";

  return (
    <article className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--ui-text)]">{product.name}</h3>
          {product.sku ? <div className="mt-1 text-xs font-mono text-[var(--ui-muted)]">{product.sku}</div> : null}
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${stateClass}`}>{stateLabel}</span>
      </div>

      <div className="mt-4 space-y-3">
        {entries.map((entry) => {
          const selected = resolveCountUnit(unitOptions, entry);
          return (
            <div key={entry.id} className="grid gap-2 md:grid-cols-[minmax(120px,0.65fr)_minmax(180px,1fr)_minmax(200px,1fr)_auto]">
              <input
                type="number"
                min={0}
                step="any"
                value={entry.rawQuantity}
                onChange={(event) => onChange(entry.id, { rawQuantity: event.target.value })}
                placeholder="Cantidad"
                className="ui-input text-lg font-semibold"
              />
              <select
                value={selected.value}
                onChange={(event) => onChange(entry.id, { unitValue: event.target.value })}
                className="ui-input"
                title={selected.conversionLabel}
              >
                {unitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {positions.length > 0 ? (
                <select
                  value={entry.positionId}
                  onChange={(event) => onChange(entry.id, { positionId: event.target.value })}
                  className="ui-input"
                >
                  <option value="">Sin posición interna</option>
                  {positions.map((position) => <option key={position.id} value={position.id}>{position.selectedLabel ?? position.label}</option>)}
                </select>
              ) : <div />}
              <div className="flex gap-2">
                <button type="button" className="ui-btn ui-btn--ghost px-3" onClick={() => onChange(entry.id, { rawQuantity: "0" })}>0</button>
                {entries.length > 1 ? <button type="button" className="ui-btn ui-btn--ghost px-3" onClick={() => onRemove(entry.id)}>Quitar</button> : null}
              </div>
            </div>
          );
        })}
      </div>

      <button type="button" className="ui-btn ui-btn--ghost mt-3 h-9 px-3 text-xs" onClick={onAdd}>+ Otra presentación o posición</button>
    </article>
  );
});
