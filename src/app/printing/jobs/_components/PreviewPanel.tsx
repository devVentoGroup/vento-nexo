"use client";
/* eslint-disable @next/next/no-img-element */

import type { BarcodeKind, Preset, PreviewMode } from "../_lib/types";
import type { LabelElement, LabelTemplate } from "../../designer/_lib/types";
import { BarcodeImage } from "./BarcodeImage";
import { MockMiniLabel } from "./MockMiniLabel";

export type PreviewPanelProps = {
  preset: Preset;
  dpi: number;
  dpmm: number;
  previewScale: number;
  setPreviewScale: (n: number) => void;
  previewZpl: string;
  previewZplHasError: boolean;
  previewShowMock: boolean;
  showZplCode: boolean;
  setShowZplCode: (fn: (v: boolean) => boolean) => void;
  title: string;
  barcodeKind: BarcodeKind;
  previewLocVariant: "dm" | "qr" | null;
  previewColWidthMm: number;
  previewColGapMm: number;
  previewBarcodeScale: number;
  previewQrUrl: string;
  previewItems: Array<{ code: string; note?: string }>;
  hasQueue: boolean;
  activeLayoutPreview?: LabelTemplate | null;
};

function LayoutPreview({
  layout,
  previewScale,
  barcodeScale,
}: {
  layout: LabelTemplate;
  previewScale: number;
  barcodeScale: number;
}) {
  const widthMm =
    layout.orientation === "horizontal"
      ? Math.max(layout.widthMm, layout.heightMm)
      : layout.widthMm;
  const heightMm =
    layout.orientation === "horizontal"
      ? Math.min(layout.widthMm, layout.heightMm)
      : layout.heightMm;

  function renderElement(el: LabelElement) {
    if (el.type === "barcode_qr") {
      return (
        <BarcodeImage
          kind="qrcode"
          text={el.content}
          widthMm={el.width}
          heightMm={el.height}
          scale={barcodeScale}
        />
      );
    }
    if (el.type === "barcode_dm") {
      return (
        <BarcodeImage
          kind="datamatrix"
          text={el.content}
          widthMm={el.width}
          heightMm={el.height}
          scale={barcodeScale}
        />
      );
    }
    if (el.type === "barcode_c128") {
      return (
        <BarcodeImage
          kind="code128"
          text={el.content}
          widthMm={el.width}
          heightMm={el.height}
          scale={barcodeScale}
        />
      );
    }

    const fontPx = Math.max(11, Math.round(((el.fontSize ?? (el.type === "title" ? 28 : 20)) / 203) * 96));
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: el.type === "title" ? "center" : "center",
          textAlign: "center",
          fontSize: `${fontPx}px`,
          fontWeight: el.fontWeight === "bold" ? 700 : 400,
          color: "#111827",
          lineHeight: 1.1,
          overflow: "hidden",
          wordBreak: "break-word",
        }}
      >
        {el.content}
      </div>
    );
  }

  return (
    <div style={{ transform: `scale(${previewScale})`, transformOrigin: "center" }}>
      <div
        style={{
          position: "relative",
          width: `${widthMm}mm`,
          height: `${heightMm}mm`,
          background: "#fff",
          border: "1px solid #d1d5db",
          borderRadius: "2mm",
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}
      >
        {layout.elements.map((el) => (
          <div
            key={el.id}
            style={{
              position: "absolute",
              left: `${el.x}mm`,
              top: `${el.y}mm`,
              width: `${el.width}mm`,
              height: `${el.height}mm`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {renderElement(el)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PreviewPanel({
  preset,
  dpi,
  dpmm,
  previewScale,
  setPreviewScale,
  previewZpl,
  previewZplHasError,
  previewShowMock,
  showZplCode,
  setShowZplCode,
  title,
  barcodeKind,
  previewLocVariant,
  previewColWidthMm,
  previewColGapMm,
  previewBarcodeScale,
  previewQrUrl,
  previewItems,
  hasQueue,
  activeLayoutPreview,
}: PreviewPanelProps) {
  return (
    <div className="mt-6 ui-panel ui-remission-section">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="ui-h3">3. Vista previa</div>
          <div className="mt-1 ui-caption">Confirma rápido y manda a imprimir.</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="ui-chip ui-chip--brand">
          {preset.widthMm}×{preset.heightMm} mm
        </span>
        <span className="ui-chip">
          DPI {dpi} · {dpmm} dpmm
        </span>
        <span className="ui-chip ui-chip--success">Preview local</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      <div className="mt-3 flex min-h-[180px] items-center justify-center ui-panel-soft p-4">
        {activeLayoutPreview ? (
          <LayoutPreview
            layout={activeLayoutPreview}
            previewScale={previewScale}
            barcodeScale={previewBarcodeScale}
          />
        ) : (
          <div style={{ transform: `scale(${previewScale})`, transformOrigin: "center" }}>
            {previewShowMock ? (
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
                  locVariant={previewLocVariant}
                  qrData={previewLocVariant === "qr" ? previewQrUrl : undefined}
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
          ) : (
            <p className="ui-body-muted text-center">
              {hasQueue
                ? "Generando vista previa…"
                : "Agrega una etiqueta para ver la vista previa."}
            </p>
            )}
          </div>
        )}
      </div>

      {previewLocVariant === "qr" && previewQrUrl ? (
        <div className="mt-3 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3">
          <div className="text-sm font-semibold text-cyan-900">Destino del QR</div>
          <div className="mt-1 break-all text-xs text-cyan-900">{previewQrUrl}</div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setShowZplCode((v) => !v)}
        className="mt-3 text-sm font-semibold text-[var(--ui-brand-600)] hover:underline"
      >
        {showZplCode ? "Ocultar ZPL" : "Ver ZPL"}
      </button>
      {showZplCode ? (
        <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100">
          {previewZpl || "// (vacío)"}
        </pre>
      ) : null}
    </div>
  );
}
