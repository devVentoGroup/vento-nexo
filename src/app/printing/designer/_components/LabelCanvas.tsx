"use client";

import type { LabelElement, LabelTemplate } from "../_lib/types";
import { DraggableElement } from "./DraggableElement";

type Props = {
  template: LabelTemplate;
  selectedId: string | null;
  onSelectElement: (id: string | null) => void;
  onMoveElement: (id: string, x: number, y: number) => void;
  onResizeElement: (id: string, width: number, height: number) => void;
  zoom: number;
};

const BASE_SCALE = 4; // 4px per mm at zoom=1

export function LabelCanvas({
  template,
  selectedId,
  onSelectElement,
  onMoveElement,
  onResizeElement,
  zoom,
}: Props) {
  const scale = BASE_SCALE * zoom;
  const canvasWidth = template.widthMm * scale;
  const canvasHeight = template.heightMm * scale;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Rulers */}
      <div className="ui-caption text-[var(--ui-muted)]">
        {template.widthMm} x {template.heightMm} mm · {template.dpi} dpi · Zoom {Math.round(zoom * 100)}%
      </div>

      {/* Canvas container */}
      <div
        className="relative overflow-hidden border-2 border-zinc-300 bg-white shadow-lg"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
          backgroundSize: `${5 * scale}px ${5 * scale}px`,
        }}
        onMouseDown={() => onSelectElement(null)}
      >
        {/* Center guides */}
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-full w-px"
          style={{ background: "rgba(59,130,246,0.15)" }}
        />
        <div
          className="pointer-events-none absolute left-0 top-1/2 h-px w-full"
          style={{ background: "rgba(59,130,246,0.15)" }}
        />

        {/* Elements */}
        {template.elements.map((el) => (
          <DraggableElement
            key={el.id}
            element={el}
            scale={scale}
            selected={selectedId === el.id}
            onSelect={() => onSelectElement(el.id)}
            onMove={(x, y) => onMoveElement(el.id, x, y)}
            onResize={(w, h) => onResizeElement(el.id, w, h)}
          />
        ))}

        {/* Empty state */}
        {template.elements.length === 0 && (
          <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
            Agrega elementos desde la barra de herramientas
          </div>
        )}
      </div>
    </div>
  );
}
