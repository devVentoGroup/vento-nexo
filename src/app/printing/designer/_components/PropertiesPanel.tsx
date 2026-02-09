"use client";

import type { LabelElement, ElementType } from "../_lib/types";
import { ELEMENT_LABELS } from "../_lib/types";

type Props = {
  element: LabelElement | null;
  onUpdate: (id: string, patch: Partial<LabelElement>) => void;
  onDelete: (id: string) => void;
};

export function PropertiesPanel({ element, onUpdate, onDelete }: Props) {
  if (!element) {
    return (
      <div className="ui-panel space-y-3">
        <div className="ui-h3">Propiedades</div>
        <p className="ui-body-muted">Selecciona un elemento en el canvas para editar sus propiedades.</p>
      </div>
    );
  }

  const { id } = element;

  return (
    <div className="ui-panel space-y-4">
      <div className="flex items-center justify-between">
        <div className="ui-h3">Propiedades</div>
        <button
          type="button"
          onClick={() => onDelete(id)}
          className="ui-btn ui-btn--danger ui-btn--sm"
        >
          Eliminar
        </button>
      </div>

      <div className="space-y-3">
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-semibold">Tipo</span>
          <span className="ui-input flex items-center bg-[var(--ui-surface-2)] text-sm">{ELEMENT_LABELS[element.type]}</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-caption font-semibold">Contenido</span>
          <input
            type="text"
            value={element.content}
            onChange={(e) => onUpdate(id, { content: e.target.value })}
            className="ui-input"
            placeholder="Texto o {code}, {note}, {title}"
          />
          <span className="ui-caption text-[var(--ui-muted)]">
            Variables: {"{code}"}, {"{note}"}, {"{title}"} se reemplazan al imprimir.
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">X (mm)</span>
            <input
              type="number"
              step="0.5"
              min="0"
              value={element.x}
              onChange={(e) => onUpdate(id, { x: Number(e.target.value) || 0 })}
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">Y (mm)</span>
            <input
              type="number"
              step="0.5"
              min="0"
              value={element.y}
              onChange={(e) => onUpdate(id, { y: Number(e.target.value) || 0 })}
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">Ancho (mm)</span>
            <input
              type="number"
              step="0.5"
              min="3"
              value={element.width}
              onChange={(e) => onUpdate(id, { width: Math.max(3, Number(e.target.value) || 3) })}
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">Alto (mm)</span>
            <input
              type="number"
              step="0.5"
              min="3"
              value={element.height}
              onChange={(e) => onUpdate(id, { height: Math.max(3, Number(e.target.value) || 3) })}
              className="ui-input"
            />
          </label>
        </div>

        {(element.type === "title" || element.type === "text") && (
          <>
            <label className="flex flex-col gap-1">
              <span className="ui-caption font-semibold">Tamano fuente (dots)</span>
              <input
                type="number"
                min="12"
                max="120"
                value={element.fontSize ?? (element.type === "title" ? 36 : 24)}
                onChange={(e) => onUpdate(id, { fontSize: Number(e.target.value) || 24 })}
                className="ui-input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-caption font-semibold">Peso</span>
              <select
                value={element.fontWeight ?? "normal"}
                onChange={(e) => onUpdate(id, { fontWeight: e.target.value as "normal" | "bold" })}
                className="ui-input"
              >
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
              </select>
            </label>
          </>
        )}
      </div>
    </div>
  );
}
