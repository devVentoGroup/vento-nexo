"use client";

import { useCallback, useRef } from "react";
import type { LabelElement } from "../_lib/types";
import { ELEMENT_LABELS } from "../_lib/types";

type Props = {
  element: LabelElement;
  scale: number; // px per mm
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
};

export function DraggableElement({ element, scale, selected, onSelect, onMove, onResize }: Props) {
  const dragRef = useRef<{ startX: number; startY: number; elX: number; elY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; elW: number; elH: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        elX: element.x,
        elY: element.y,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = (ev.clientX - dragRef.current.startX) / scale;
        const dy = (ev.clientY - dragRef.current.startY) / scale;
        onMove(
          Math.max(0, Math.round((dragRef.current.elX + dx) * 10) / 10),
          Math.max(0, Math.round((dragRef.current.elY + dy) * 10) / 10)
        );
      };

      const handleMouseUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [element.x, element.y, scale, onSelect, onMove]
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        elW: element.width,
        elH: element.height,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const dx = (ev.clientX - resizeRef.current.startX) / scale;
        const dy = (ev.clientY - resizeRef.current.startY) / scale;
        onResize(
          Math.max(3, Math.round((resizeRef.current.elW + dx) * 10) / 10),
          Math.max(3, Math.round((resizeRef.current.elH + dy) * 10) / 10)
        );
      };

      const handleMouseUp = () => {
        resizeRef.current = null;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [element.width, element.height, scale, onResize]
  );

  const isBarcode = element.type.startsWith("barcode_");
  const displayContent = element.content || ELEMENT_LABELS[element.type];

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute cursor-move select-none"
      style={{
        left: element.x * scale,
        top: element.y * scale,
        width: element.width * scale,
        height: element.height * scale,
      }}
    >
      <div
        className={`relative h-full w-full overflow-hidden rounded-sm border ${
          selected
            ? "border-blue-500 border-2 shadow-md"
            : "border-dashed border-zinc-400 hover:border-zinc-600"
        }`}
        style={{ background: "rgba(255,255,255,0.85)" }}
      >
        {/* Content preview */}
        <div className="flex h-full w-full items-center justify-center p-0.5">
          {isBarcode ? (
            <div className="flex flex-col items-center justify-center gap-0.5 text-center">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.5">
                {element.type === "barcode_qr" ? (
                  <>
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                    <rect x="14" y="14" width="4" height="4" />
                  </>
                ) : element.type === "barcode_dm" ? (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="1" />
                    <path d="M7 7h2v2H7zM11 7h2v2h-2zM15 7h2v2h-2zM7 11h2v2H7zM11 11h2v2h-2zM7 15h2v2H7z" fill="currentColor" />
                  </>
                ) : (
                  <>
                    <path d="M4 4v16M7 4v16M10 4v16M12 4v16M15 4v16M18 4v16M20 4v16" />
                  </>
                )}
              </svg>
              <span className="text-[8px] text-zinc-500 leading-none">{ELEMENT_LABELS[element.type]}</span>
            </div>
          ) : (
            <span
              className="truncate leading-tight text-zinc-800"
              style={{
                fontSize: Math.max(8, Math.min(16, element.height * scale * 0.5)),
                fontWeight: element.fontWeight === "bold" ? 700 : 400,
              }}
            >
              {displayContent}
            </span>
          )}
        </div>

        {/* Resize handle */}
        {selected && (
          <div
            onMouseDown={handleResizeMouseDown}
            className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-blue-500"
            style={{ borderTopLeftRadius: 2 }}
          />
        )}
      </div>

      {/* Label badge */}
      {selected && (
        <div className="absolute -top-4 left-0 rounded bg-blue-500 px-1 py-0.5 text-[9px] font-semibold text-white leading-none">
          {ELEMENT_LABELS[element.type]}
        </div>
      )}
    </div>
  );
}
