"use client";

import type { BarcodeKind, Preset } from "../_lib/types";
import type { LabelTemplate } from "../../designer/_lib/types";
import { MockMiniLabel } from "./MockMiniLabel";
import { BarcodeImage } from "./BarcodeImage";

function LayoutLabel({
  layout,
  barcodeScale,
}: {
  layout: LabelTemplate;
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

  return (
    <div
      style={{
        position: "relative",
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      {layout.elements.map((el) => {
        let content: React.ReactNode;
        if (el.type === "barcode_qr") {
          content = (
            <BarcodeImage
              kind="qrcode"
              text={el.content}
              widthMm={el.width}
              heightMm={el.height}
              scale={barcodeScale}
            />
          );
        } else if (el.type === "barcode_dm") {
          content = (
            <BarcodeImage
              kind="datamatrix"
              text={el.content}
              widthMm={el.width}
              heightMm={el.height}
              scale={barcodeScale}
            />
          );
        } else if (el.type === "barcode_c128") {
          content = (
            <BarcodeImage
              kind="code128"
              text={el.content}
              widthMm={el.width}
              heightMm={el.height}
              scale={barcodeScale}
            />
          );
        } else {
          const fontPx = Math.max(
            11,
            Math.round(((el.fontSize ?? (el.type === "title" ? 28 : 20)) / 203) * 96)
          );
          content = (
            <div
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
            {content}
          </div>
        );
      })}
    </div>
  );
}

export function PrintSheet({
  preset,
  title,
  barcodeKind,
  previewLocVariant,
  previewBarcodeScale,
  previewItems,
  previewQrBase,
  activeLayoutSheets,
}: {
  preset: Preset;
  title: string;
  barcodeKind: BarcodeKind;
  previewLocVariant: "dm" | "qr" | null;
  previewBarcodeScale: number;
  previewItems: Array<{ code: string; note?: string }>;
  previewQrBase: string;
  activeLayoutSheets: LabelTemplate[] | null;
}) {
  return (
    <div className="print-only">
      <div className="print-sheet">
        {activeLayoutSheets
          ? activeLayoutSheets.map((layout, idx) => (
              <div key={`layout-${idx}`} className="print-label-card">
                <LayoutLabel layout={layout} barcodeScale={previewBarcodeScale} />
              </div>
            ))
          : previewItems.map((item, idx) => (
              <div key={`${item.code}-${idx}`} className="print-label-card">
                <MockMiniLabel
                  widthMm={preset.widthMm}
                  heightMm={preset.heightMm}
                  title={title}
                  note={item.note}
                  code={item.code}
                  barcodeKind={barcodeKind}
                  type={preset.defaultType}
                  locVariant={previewLocVariant}
                  qrData={
                    previewLocVariant === "qr"
                      ? `${previewQrBase.replace(/\/$/, "")}/inventory/locations/open?loc=${encodeURIComponent(item.code)}`
                      : undefined
                  }
                  renderScale={previewBarcodeScale}
                />
              </div>
            ))}
      </div>
    </div>
  );
}
