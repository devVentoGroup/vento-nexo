"use client";
/* eslint-disable @next/next/no-img-element */

import type { BarcodeKind, Preset, PreviewMode } from "../_lib/types";
import { MockMiniLabel } from "./MockMiniLabel";

export type PreviewPanelProps = {
  preset: Preset;
  dpi: number;
  dpmm: number;
  previewMode: PreviewMode;
  setPreviewMode: (m: PreviewMode) => void;
  previewScale: number;
  setPreviewScale: (n: number) => void;
  previewRefreshKey: number;
  setPreviewRefreshKey: (fn: (v: number) => number) => void;
  previewZpl: string;
  previewZplHasError: boolean;
  previewShowImage: boolean;
  previewShowMock: boolean;
  previewImageUrl: string | null;
  previewImageError: string | null;
  showZplCode: boolean;
  setShowZplCode: (fn: (v: boolean) => boolean) => void;
  title: string;
  barcodeKind: BarcodeKind;
  previewDualMatrix: boolean;
  previewColWidthMm: number;
  previewColGapMm: number;
  previewBarcodeScale: number;
  previewQrUrl: string;
  previewItems: Array<{ code: string; note?: string }>;
  hasQueue: boolean;
};

export function PreviewPanel({
  preset,
  dpi,
  dpmm,
  previewMode,
  setPreviewMode,
  previewScale,
  setPreviewScale,
  previewRefreshKey: _previewRefreshKey,
  setPreviewRefreshKey,
  previewZpl,
  previewZplHasError,
  previewShowImage,
  previewShowMock,
  previewImageUrl,
  previewImageError,
  showZplCode,
  setShowZplCode,
  title,
  barcodeKind,
  previewDualMatrix,
  previewColWidthMm,
  previewColGapMm,
  previewBarcodeScale,
  previewQrUrl,
  previewItems,
  hasQueue,
}: PreviewPanelProps) {
  return (
    <div className="mt-6">
      <div className="ui-h3">Vista previa (cómo se verá impresa)</div>
      <p className="mt-1 ui-body-muted">
        Vista real renderizada desde el ZPL. Si falla, puedes usar el modo mock para validar tamaño
        y layout.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="ui-chip ui-chip--brand">
          {preset.widthMm}×{preset.heightMm} mm
        </span>
        <span className="ui-chip">
          DPI {dpi} · {dpmm} dpmm
        </span>
        {previewImageUrl ? (
          <span className="ui-chip ui-chip--success">Render OK</span>
        ) : previewImageError ? (
          <span className="ui-chip ui-chip--warn">Render falló</span>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="ui-caption">Vista</span>
          <select
            className="ui-input min-w-0 px-3 py-2 text-xs"
            value={previewMode}
            onChange={(e) => setPreviewMode(e.target.value as PreviewMode)}
          >
            <option value="auto">Auto (real + mock)</option>
            <option value="real">Solo real</option>
            <option value="mock">Solo mock</option>
          </select>

          <span className="ui-caption">Zoom</span>
          <input
            type="range"
            min={0.6}
            max={2.2}
            step={0.1}
            value={previewScale}
            onChange={(e) => setPreviewScale(Number(e.target.value))}
            aria-label="Zoom de vista previa"
          />
          <span className="ui-caption w-10 text-right">{Math.round(previewScale * 100)}%</span>
          <button
            type="button"
            onClick={() => setPreviewScale(1)}
            className="ui-btn ui-btn--ghost text-xs"
          >
            1:1
          </button>
          <button
            type="button"
            onClick={() => setPreviewRefreshKey((v) => v + 1)}
            className="ui-btn ui-btn--ghost text-xs"
          >
            Reintentar
          </button>

          {previewImageUrl ? (
            <a
              href={previewImageUrl}
              download={`etiqueta-${preset.id}.png`}
              className="ui-btn ui-btn--ghost text-xs"
            >
              Descargar PNG
            </a>
          ) : (
            <span className="ui-btn ui-btn--ghost text-xs opacity-50 pointer-events-none">
              Descargar PNG
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex min-h-[180px] items-center justify-center ui-panel-soft p-4">
        <div style={{ transform: `scale(${previewScale})`, transformOrigin: "center" }}>
          {previewShowImage ? (
            <div className="rounded-md border border-zinc-200 bg-white p-2 shadow-sm">
              <img
                src={previewImageUrl ?? ""}
                alt="Vista previa de la etiqueta"
                className="max-h-80 w-auto object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            </div>
          ) : previewShowMock ? (
            <div
              style={{
                width: `${preset.widthMm}mm`,
                height: `${preset.heightMm}mm`,
                display: "grid",
                gridTemplateColumns:
                  preset.columns === 1 ? "1fr" : `repeat(${preset.columns}, ${previewColWidthMm}mm)`,
                columnGap: preset.columns === 1 ? "0mm" : `${previewColGapMm}mm`,
                alignItems: "stretch",
              }}
            >
              {preset.columns === 1 ? (
                <MockMiniLabel
                  widthMm={preset.widthMm}
                  heightMm={preset.heightMm}
                  title={title}
                  note={previewItems[0]?.note}
                  code={previewItems[0]?.code ?? ""}
                  barcodeKind={barcodeKind}
                  type={preset.defaultType}
                  dualMatrix={previewDualMatrix}
                  qrData={previewDualMatrix ? previewQrUrl : undefined}
                  renderScale={previewBarcodeScale}
                />
              ) : (
                previewItems.map((item, idx) => (
                  <MockMiniLabel
                    key={`${item.code}-${idx}`}
                    widthMm={previewColWidthMm}
                    heightMm={preset.heightMm}
                    title={title}
                    note={item.note}
                    code={item.code}
                    barcodeKind={barcodeKind}
                    type={preset.defaultType}
                    renderScale={previewBarcodeScale}
                  />
                ))
              )}
            </div>
          ) : previewZplHasError ? (
            <p className="ui-body-muted text-center">
              Error generando ZPL. Revisa la cola o los parámetros.
            </p>
          ) : previewImageError ? (
            <p className="ui-body-muted text-center">No se pudo generar la vista previa real.</p>
          ) : (
            <p className="ui-body-muted text-center">
              {hasQueue
                ? "Generando vista previa…"
                : "Agrega una etiqueta para ver la vista previa."}
            </p>
          )}
        </div>
      </div>

      {previewImageError ? (
        <div className="mt-2 ui-caption text-[var(--ui-brand-700)]">
          Vista real falló: {previewImageError}.{" "}
          {previewMode === "auto"
            ? "Mostrando simulación."
            : "Cambia a modo mock si quieres seguir revisando."}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setShowZplCode((v) => !v)}
        className="mt-3 text-sm font-semibold text-[var(--ui-brand-600)] hover:underline"
      >
        {showZplCode ? "Ocultar código de impresora" : "Ver código de impresora (ZPL)"}
      </button>
      {showZplCode ? (
        <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100">
          {previewZpl || "// (vacío)"}
        </pre>
      ) : null}
    </div>
  );
}
