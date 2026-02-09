"use client";

import type { ElementType, LabelTemplate } from "../_lib/types";
import { ELEMENT_LABELS } from "../_lib/types";

type Props = {
  template: LabelTemplate;
  onChangeTemplate: (patch: Partial<LabelTemplate>) => void;
  onAddElement: (type: ElementType) => void;
  onSave: () => void;
  onLoad: () => void;
  onExportZpl: () => void;
  onPreviewReal: () => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  savedCount: number;
  zplPreview: string | null;
  previewImageUrl: string | null;
};

const ELEMENT_TYPES: ElementType[] = ["title", "text", "barcode_dm", "barcode_c128", "barcode_qr"];

export function ToolbarDesigner({
  template,
  onChangeTemplate,
  onAddElement,
  onSave,
  onLoad,
  onExportZpl,
  onPreviewReal,
  zoom,
  onZoomChange,
  savedCount,
  zplPreview,
  previewImageUrl,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Template dimensions */}
      <div className="ui-panel space-y-3">
        <div className="ui-h3">Etiqueta</div>
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">Ancho (mm)</span>
            <input
              type="number"
              min="10"
              max="200"
              value={template.widthMm}
              onChange={(e) => onChangeTemplate({ widthMm: Number(e.target.value) || 50 })}
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">Alto (mm)</span>
            <input
              type="number"
              min="10"
              max="200"
              value={template.heightMm}
              onChange={(e) => onChangeTemplate({ heightMm: Number(e.target.value) || 70 })}
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-semibold">DPI</span>
            <select
              value={template.dpi}
              onChange={(e) => onChangeTemplate({ dpi: Number(e.target.value) })}
              className="ui-input"
            >
              <option value={203}>203</option>
              <option value={300}>300</option>
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="ui-caption font-semibold">Nombre plantilla</span>
          <input
            type="text"
            value={template.name}
            onChange={(e) => onChangeTemplate({ name: e.target.value })}
            className="ui-input"
            placeholder="Mi etiqueta"
          />
        </label>
      </div>

      {/* Add elements */}
      <div className="ui-panel space-y-3">
        <div className="ui-h3">Agregar elemento</div>
        <div className="flex flex-wrap gap-2">
          {ELEMENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onAddElement(type)}
              className="ui-btn ui-btn--ghost ui-btn--sm"
            >
              + {ELEMENT_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Zoom */}
      <div className="ui-panel space-y-3">
        <div className="ui-h3">Zoom</div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="1"
            max="5"
            step="0.5"
            value={zoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
          />
          <span className="ui-caption w-12 text-right">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* Actions */}
      <div className="ui-panel space-y-3">
        <div className="ui-h3">Acciones</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onSave} className="ui-btn ui-btn--brand ui-btn--sm">
            Guardar
          </button>
          <button type="button" onClick={onLoad} className="ui-btn ui-btn--ghost ui-btn--sm">
            Cargar ({savedCount})
          </button>
          <button type="button" onClick={onExportZpl} className="ui-btn ui-btn--ghost ui-btn--sm">
            Ver ZPL
          </button>
          <button type="button" onClick={onPreviewReal} className="ui-btn ui-btn--ghost ui-btn--sm">
            Preview real
          </button>
        </div>
      </div>

      {/* ZPL code preview */}
      {zplPreview && (
        <div className="ui-panel space-y-2">
          <div className="ui-h3">ZPL generado</div>
          <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-100 font-mono">
            {zplPreview}
          </pre>
        </div>
      )}

      {/* Real preview image */}
      {previewImageUrl && (
        <div className="ui-panel space-y-2">
          <div className="ui-h3">Preview real (Labelary)</div>
          <div className="flex justify-center rounded-lg border border-[var(--ui-border)] bg-white p-3">
            <img
              src={previewImageUrl}
              alt="Vista previa real"
              className="max-h-60 w-auto object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
