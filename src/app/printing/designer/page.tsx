"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";

import type { LabelElement, LabelTemplate, ElementType } from "./_lib/types";
import { DEFAULT_ELEMENT_SIZES } from "./_lib/types";
import { saveTemplate, loadTemplates, generateId } from "./_lib/template-storage";
import { templateToZpl } from "./_lib/template-to-zpl";
import { LabelCanvas } from "./_components/LabelCanvas";
import { PropertiesPanel } from "./_components/PropertiesPanel";
import { ToolbarDesigner } from "./_components/ToolbarDesigner";

function createDefaultTemplate(): LabelTemplate {
  return {
    id: generateId(),
    name: "Etiqueta nueva",
    widthMm: 50,
    heightMm: 70,
    dpi: 203,
    elements: [],
  };
}

export default function DesignerPage() {
  const [template, setTemplate] = useState<LabelTemplate>(createDefaultTemplate);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(3);
  const [zplPreview, setZplPreview] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  const [statusMsg, setStatusMsg] = useState("");

  const selectedElement = useMemo(
    () => template.elements.find((el) => el.id === selectedId) ?? null,
    [template.elements, selectedId]
  );

  // --- Template mutations ---
  const updateTemplate = useCallback((patch: Partial<LabelTemplate>) => {
    setTemplate((prev) => ({ ...prev, ...patch }));
  }, []);

  const addElement = useCallback((type: ElementType) => {
    const sizes = DEFAULT_ELEMENT_SIZES[type];
    const newEl: LabelElement = {
      id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      x: 5,
      y: 5,
      width: sizes.width,
      height: sizes.height,
      content: type === "title" ? "VENTO" : type === "text" ? "{code}" : "{code}",
      fontSize: type === "title" ? 36 : type === "text" ? 24 : undefined,
      fontWeight: type === "title" ? "bold" : "normal",
    };
    setTemplate((prev) => ({ ...prev, elements: [...prev.elements, newEl] }));
    setSelectedId(newEl.id);
  }, []);

  const moveElement = useCallback((id: string, x: number, y: number) => {
    setTemplate((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, x, y } : el)),
    }));
  }, []);

  const resizeElement = useCallback((id: string, width: number, height: number) => {
    setTemplate((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, width, height } : el)),
    }));
  }, []);

  const updateElement = useCallback((id: string, patch: Partial<LabelElement>) => {
    setTemplate((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    }));
  }, []);

  const deleteElement = useCallback((id: string) => {
    setTemplate((prev) => ({
      ...prev,
      elements: prev.elements.filter((el) => el.id !== id),
    }));
    setSelectedId(null);
  }, []);

  // --- Actions ---
  const handleSave = useCallback(() => {
    saveTemplate(template);
    setStatusMsg("Plantilla guardada.");
    setTimeout(() => setStatusMsg(""), 2000);
  }, [template]);

  const handleLoad = useCallback(() => {
    setSavedTemplates(loadTemplates());
    setShowLoadModal(true);
  }, []);

  const handleLoadTemplate = useCallback((t: LabelTemplate) => {
    setTemplate(t);
    setSelectedId(null);
    setShowLoadModal(false);
    setZplPreview(null);
    setPreviewImageUrl(null);
  }, []);

  const handleExportZpl = useCallback(() => {
    const zpl = templateToZpl(template, { code: "EJEMPLO-001", note: "Texto ejemplo", title: "VENTO" });
    setZplPreview(zpl);
  }, [template]);

  const handlePreviewReal = useCallback(async () => {
    const zpl = templateToZpl(template, { code: "EJEMPLO-001", note: "Texto ejemplo", title: "VENTO" });
    setZplPreview(zpl);
    try {
      const dpmm = Math.round(template.dpi / 25.4);
      const widthIn = (template.widthMm / 25.4).toFixed(2);
      const heightIn = (template.heightMm / 25.4).toFixed(2);
      const res = await fetch(
        `/api/labelary?width=${widthIn}&height=${heightIn}&dpmm=${dpmm}`,
        {
          method: "POST",
          headers: { "Content-Type": "text/plain", Accept: "image/png" },
          body: zpl,
        }
      );
      if (!res.ok) throw new Error("Labelary error");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreviewImageUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      setPreviewImageUrl(null);
      setStatusMsg("Error al generar preview real.");
      setTimeout(() => setStatusMsg(""), 3000);
    }
  }, [template]);

  const savedCount = useMemo(() => {
    try { return loadTemplates().length; } catch { return 0; }
  }, []);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/printing/jobs" className="ui-caption underline">
            Volver a impresion
          </Link>
          <h1 className="mt-2 ui-h1">Diseñador de etiquetas</h1>
          <p className="mt-2 ui-body-muted">
            Arrastra y posiciona elementos para diseñar tu etiqueta. Guarda como plantilla y usala al imprimir.
          </p>
        </div>
        <Link href="/printing/jobs" className="ui-btn ui-btn--ghost ui-btn--sm">
          Ir a imprimir
        </Link>
      </div>

      {statusMsg && <div className="ui-alert ui-alert--success">{statusMsg}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: Canvas */}
        <div className="space-y-4">
          <div className="overflow-auto rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-6">
            <LabelCanvas
              template={template}
              selectedId={selectedId}
              onSelectElement={setSelectedId}
              onMoveElement={moveElement}
              onResizeElement={resizeElement}
              zoom={zoom}
            />
          </div>

          {/* Properties below canvas on small screens */}
          <div className="lg:hidden">
            <PropertiesPanel
              element={selectedElement}
              onUpdate={updateElement}
              onDelete={deleteElement}
            />
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <ToolbarDesigner
            template={template}
            onChangeTemplate={updateTemplate}
            onAddElement={addElement}
            onSave={handleSave}
            onLoad={handleLoad}
            onExportZpl={handleExportZpl}
            onPreviewReal={handlePreviewReal}
            zoom={zoom}
            onZoomChange={setZoom}
            savedCount={savedCount}
            zplPreview={zplPreview}
            previewImageUrl={previewImageUrl}
          />

          {/* Properties on desktop */}
          <div className="hidden lg:block">
            <PropertiesPanel
              element={selectedElement}
              onUpdate={updateElement}
              onDelete={deleteElement}
            />
          </div>
        </div>
      </div>

      {/* Load modal */}
      {showLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowLoadModal(false)}>
          <div className="ui-panel w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="ui-h3">Cargar plantilla</div>
              <button type="button" onClick={() => setShowLoadModal(false)} className="ui-btn ui-btn--ghost ui-btn--sm">
                Cerrar
              </button>
            </div>
            {savedTemplates.length === 0 ? (
              <p className="ui-body-muted">No hay plantillas guardadas.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {savedTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleLoadTemplate(t)}
                    className="w-full text-left ui-panel-soft p-3 hover:bg-[var(--ui-surface-2)] transition-colors"
                  >
                    <div className="font-medium">{t.name}</div>
                    <div className="ui-caption text-[var(--ui-muted)]">
                      {t.widthMm}x{t.heightMm}mm · {t.elements.length} elementos
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
