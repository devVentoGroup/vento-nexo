"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { LabelElement, LabelTemplate, ElementType, LocData } from "./_lib/types";
import { DEFAULT_ELEMENT_SIZES, ELEMENT_LABELS, buildLocLayout } from "./_lib/types";
import { saveTemplate, loadTemplates, generateId } from "./_lib/template-storage";
import { templateToZpl } from "./_lib/template-to-zpl";
import { LabelCanvas } from "./_components/LabelCanvas";
import { PropertiesPanel } from "./_components/PropertiesPanel";

const LOCS_API = "/api/inventory/locations?limit=500";

type LocRow = { id: string; code: string | null; description?: string | null; zone?: string | null };

function getBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

export default function DesignerPage() {
  // --- LOC data ---
  const [locs, setLocs] = useState<LocRow[]>([]);
  const [locSearch, setLocSearch] = useState("");
  const [selectedLocCode, setSelectedLocCode] = useState("");
  const [locsLoaded, setLocsLoaded] = useState(false);

  // --- Template ---
  const [template, setTemplate] = useState<LabelTemplate>({
    id: generateId(),
    name: "LOC etiqueta",
    widthMm: 50,
    heightMm: 70,
    dpi: 203,
    orientation: "vertical",
    elements: [],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(3);
  const [zplPreview, setZplPreview] = useState<string | null>(null);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<LabelTemplate[]>([]);
  const [statusMsg, setStatusMsg] = useState("");

  // --- Load LOCs ---
  const loadLocs = useCallback(async () => {
    try {
      const res = await fetch(LOCS_API);
      if (!res.ok) return;
      const data = await res.json();
      setLocs(data.locations ?? data ?? []);
      setLocsLoaded(true);
    } catch { /* skip */ }
  }, []);

  useEffect(() => { loadLocs(); }, [loadLocs]);

  const filteredLocs = useMemo(() => {
    if (!locSearch.trim()) return locs;
    const q = locSearch.toLowerCase();
    return locs.filter((l) =>
      (l.code ?? "").toLowerCase().includes(q) ||
      (l.zone ?? "").toLowerCase().includes(q) ||
      (l.description ?? "").toLowerCase().includes(q)
    );
  }, [locs, locSearch]);

  // --- When a LOC is selected, rebuild the layout ---
  const applyLoc = useCallback((code: string) => {
    const loc = locs.find((l) => l.code === code);
    if (!loc?.code) return;
    setSelectedLocCode(loc.code);
    const locData: LocData = {
      code: loc.code,
      description: loc.description ?? loc.zone ?? "",
      zone: loc.zone ?? "",
    };
    const baseUrl = getBaseUrl();
    const w = template.orientation === "horizontal" ? Math.max(template.widthMm, template.heightMm) : template.widthMm;
    const h = template.orientation === "horizontal" ? Math.min(template.widthMm, template.heightMm) : template.heightMm;
    const elements = buildLocLayout(w, h, locData, baseUrl);
    setTemplate((prev) => ({ ...prev, elements }));
    setSelectedId(null);
    setZplPreview(null);
  }, [locs, template.widthMm, template.heightMm, template.orientation]);

  // --- Orientation toggle ---
  const toggleOrientation = useCallback(() => {
    setTemplate((prev) => {
      const newOri = prev.orientation === "vertical" ? "horizontal" : "vertical";
      const loc = locs.find((l) => l.code === selectedLocCode);
      if (!loc?.code) return { ...prev, orientation: newOri };
      const locData: LocData = { code: loc.code, description: loc.description ?? loc.zone ?? "", zone: loc.zone ?? "" };
      const baseUrl = getBaseUrl();
      const w = newOri === "horizontal" ? Math.max(prev.widthMm, prev.heightMm) : prev.widthMm;
      const h = newOri === "horizontal" ? Math.min(prev.widthMm, prev.heightMm) : prev.heightMm;
      const elements = buildLocLayout(w, h, locData, baseUrl);
      return { ...prev, orientation: newOri, elements };
    });
    setSelectedId(null);
  }, [locs, selectedLocCode]);

  // --- Element mutations ---
  const selectedElement = useMemo(
    () => template.elements.find((el) => el.id === selectedId) ?? null,
    [template.elements, selectedId]
  );

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

  const addElement = useCallback((type: ElementType) => {
    const sizes = DEFAULT_ELEMENT_SIZES[type];
    const newEl: LabelElement = {
      id: `el_custom_${Date.now()}`,
      type,
      x: 5,
      y: 5,
      width: sizes.width,
      height: sizes.height,
      content: type === "title" ? "Texto" : selectedLocCode || "EJEMPLO",
      fontSize: type === "title" ? 36 : type === "text" ? 24 : undefined,
      fontWeight: type === "title" ? "bold" : "normal",
    };
    setTemplate((prev) => ({ ...prev, elements: [...prev.elements, newEl] }));
    setSelectedId(newEl.id);
  }, [selectedLocCode]);

  // --- Actions ---
  const handleSave = useCallback(() => {
    saveTemplate(template);
    setStatusMsg("Layout guardado.");
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
  }, []);

  const handleShowZpl = useCallback(() => {
    setZplPreview(templateToZpl(template));
  }, [template]);

  // --- Computed ---
  const canvasW = template.orientation === "horizontal"
    ? Math.max(template.widthMm, template.heightMm)
    : template.widthMm;
  const canvasH = template.orientation === "horizontal"
    ? Math.min(template.widthMm, template.heightMm)
    : template.heightMm;

  const savedCount = useMemo(() => {
    try { return loadTemplates().length; } catch { return 0; }
  }, []);

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/printing/jobs" className="ui-caption underline">Volver a impresion</Link>
          <h1 className="mt-2 ui-h1">Diseñador de etiquetas</h1>
          <p className="mt-2 ui-body-muted">
            Carga un LOC real, ajusta posicion y tamaño de cada elemento, cambia la orientacion y guarda el layout.
          </p>
        </div>
        <Link href="/printing/jobs" className="ui-btn ui-btn--ghost ui-btn--sm">Ir a imprimir</Link>
      </div>

      {statusMsg && <div className="ui-alert ui-alert--success">{statusMsg}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* LEFT: Canvas */}
        <div className="space-y-4">
          {/* LOC selector */}
          <div className="ui-panel space-y-3">
            <div className="ui-h3">1. Elige un LOC real</div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <span className="ui-caption font-semibold">Buscar LOC</span>
                <input
                  type="text"
                  value={locSearch}
                  onChange={(e) => setLocSearch(e.target.value)}
                  placeholder="Codigo, zona o descripcion..."
                  className="ui-input"
                />
              </label>
              <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <span className="ui-caption font-semibold">Seleccionar</span>
                <select
                  value={selectedLocCode}
                  onChange={(e) => applyLoc(e.target.value)}
                  className="ui-input"
                >
                  <option value="">— Elige un LOC —</option>
                  {filteredLocs.map((l) => (
                    <option key={l.id} value={l.code ?? ""}>
                      {l.code ?? l.id}{l.zone ? ` (${l.zone})` : ""}{l.description ? ` — ${l.description}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={loadLocs} className="ui-btn ui-btn--ghost ui-btn--sm">
                {locsLoaded ? "Recargar" : "Cargar LOCs"}
              </button>
            </div>
            {!selectedLocCode && (
              <p className="ui-caption text-[var(--ui-muted)]">Selecciona un LOC para generar la etiqueta con datos reales.</p>
            )}
          </div>

          {/* Canvas */}
          <div className="overflow-auto rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-6">
            <LabelCanvas
              template={{ ...template, widthMm: canvasW, heightMm: canvasH }}
              selectedId={selectedId}
              onSelectElement={setSelectedId}
              onMoveElement={moveElement}
              onResizeElement={resizeElement}
              zoom={zoom}
            />
          </div>

          {/* ZPL preview */}
          {zplPreview && (
            <div className="ui-panel space-y-2">
              <div className="ui-h3">ZPL generado</div>
              <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-100 font-mono">{zplPreview}</pre>
            </div>
          )}

          {/* Properties on mobile */}
          <div className="lg:hidden">
            <PropertiesPanel element={selectedElement} onUpdate={updateElement} onDelete={deleteElement} />
          </div>
        </div>

        {/* RIGHT: Controls */}
        <div className="space-y-4">
          {/* Orientation + size */}
          <div className="ui-panel space-y-3">
            <div className="ui-h3">2. Orientacion y tamaño</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={toggleOrientation}
                className={`ui-btn ui-btn--sm flex-1 ${template.orientation === "vertical" ? "ui-btn--brand" : "ui-btn--ghost"}`}
              >
                Vertical
              </button>
              <button
                type="button"
                onClick={toggleOrientation}
                className={`ui-btn ui-btn--sm flex-1 ${template.orientation === "horizontal" ? "ui-btn--brand" : "ui-btn--ghost"}`}
              >
                Horizontal
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="ui-caption font-semibold">Ancho (mm)</span>
                <input
                  type="number" min="10" max="200"
                  value={template.widthMm}
                  onChange={(e) => setTemplate((p) => ({ ...p, widthMm: Number(e.target.value) || 50 }))}
                  className="ui-input"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-caption font-semibold">Alto (mm)</span>
                <input
                  type="number" min="10" max="200"
                  value={template.heightMm}
                  onChange={(e) => setTemplate((p) => ({ ...p, heightMm: Number(e.target.value) || 70 }))}
                  className="ui-input"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-caption font-semibold">DPI</span>
                <select
                  value={template.dpi}
                  onChange={(e) => setTemplate((p) => ({ ...p, dpi: Number(e.target.value) }))}
                  className="ui-input"
                >
                  <option value={203}>203</option>
                  <option value={300}>300</option>
                </select>
              </label>
            </div>
          </div>

          {/* Zoom */}
          <div className="ui-panel space-y-2">
            <div className="ui-h3">Zoom</div>
            <div className="flex items-center gap-3">
              <input type="range" min="1" max="6" step="0.5" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
              <span className="ui-caption w-12 text-right">{Math.round(zoom * 100)}%</span>
            </div>
          </div>

          {/* Add extra elements */}
          <div className="ui-panel space-y-3">
            <div className="ui-h3">Agregar elemento</div>
            <div className="flex flex-wrap gap-2">
              {(["title", "text", "barcode_dm", "barcode_c128", "barcode_qr"] as ElementType[]).map((type) => (
                <button key={type} type="button" onClick={() => addElement(type)} className="ui-btn ui-btn--ghost ui-btn--sm">
                  + {ELEMENT_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Save / Load / ZPL */}
          <div className="ui-panel space-y-3">
            <div className="ui-h3">Acciones</div>
            <label className="flex flex-col gap-1">
              <span className="ui-caption font-semibold">Nombre del layout</span>
              <input
                type="text"
                value={template.name}
                onChange={(e) => setTemplate((p) => ({ ...p, name: e.target.value }))}
                className="ui-input"
                placeholder="Ej: LOC Bodega horizontal"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleSave} className="ui-btn ui-btn--brand ui-btn--sm">Guardar layout</button>
              <button type="button" onClick={handleLoad} className="ui-btn ui-btn--ghost ui-btn--sm">Cargar ({savedCount})</button>
              <button type="button" onClick={handleShowZpl} className="ui-btn ui-btn--ghost ui-btn--sm">Ver ZPL</button>
            </div>
          </div>

          {/* Properties panel (desktop) */}
          <div className="hidden lg:block">
            <PropertiesPanel element={selectedElement} onUpdate={updateElement} onDelete={deleteElement} />
          </div>
        </div>
      </div>

      {/* Load modal */}
      {showLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowLoadModal(false)}>
          <div className="ui-panel w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="ui-h3">Cargar layout guardado</div>
              <button type="button" onClick={() => setShowLoadModal(false)} className="ui-btn ui-btn--ghost ui-btn--sm">Cerrar</button>
            </div>
            {savedTemplates.length === 0 ? (
              <p className="ui-body-muted">No hay layouts guardados.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {savedTemplates.map((t) => (
                  <button key={t.id} type="button" onClick={() => handleLoadTemplate(t)} className="w-full text-left ui-panel-soft p-3 hover:bg-[var(--ui-surface-2)] transition-colors">
                    <div className="font-medium">{t.name}</div>
                    <div className="ui-caption text-[var(--ui-muted)]">
                      {t.widthMm}x{t.heightMm}mm · {t.orientation} · {t.elements.length} elementos
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
