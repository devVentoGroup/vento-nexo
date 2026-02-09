"use client";

import { encodeVento } from "../_lib/zpl";
import type { BarcodeKind } from "../_lib/types";
import { BarcodeImage } from "./BarcodeImage";

export function MockMiniLabel(props: {
  widthMm: number;
  heightMm: number;
  title: string;
  note?: string;
  code: string;
  barcodeKind: BarcodeKind;
  type: "LOC" | "SKU" | "PROD";
  locVariant?: "dm" | "qr" | null;
  qrData?: string;
  renderScale?: number;
}) {
  const {
    widthMm,
    heightMm,
    title,
    note,
    code,
    barcodeKind,
    type,
    locVariant = null,
    qrData,
    renderScale = 3,
  } = props;
  const padMm = Math.max(2, Math.min(4, widthMm * 0.08));
  const titleSizeMm = Math.max(2.6, Math.min(4.2, heightMm * 0.08));
  const noteSizeMm = Math.max(2.2, Math.min(3.2, heightMm * 0.06));
  const codesTopMm = heightMm * 0.28;
  const showQrOnly = locVariant === "qr";
  const showDmOnly = locVariant === "dm" || (barcodeKind === "datamatrix" && !showQrOnly);
  const bigBarcodeMm = Math.min(heightMm * 0.42, widthMm * 0.7);
  const matrixSizeMm = locVariant ? bigBarcodeMm : Math.min(heightMm * 0.45, widthMm * 0.55);
  const barcodeHeightMm = Math.min(heightMm * 0.28, 12);
  const barcodeWidthMm = Math.min(widthMm * 0.86, widthMm - padMm * 2);
  const safeNote = note ? note.slice(0, 40) : "";

  const encoded = encodeVento(type, code);
  const dmText = encoded;
  const qrText = qrData || code;

  return (
    <div
      style={{
        position: "relative",
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        background: "#fff",
        border: "1px solid #d1d5db",
        borderRadius: "2mm",
        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${padMm}mm`,
          top: `${padMm}mm`,
          fontSize: `${titleSizeMm}mm`,
          fontWeight: 600,
          color: "#111827",
        }}
      >
        {title}
      </div>

      {safeNote ? (
        <div
          style={{
            position: "absolute",
            left: `${padMm}mm`,
            top: `${padMm + titleSizeMm + 2}mm`,
            fontSize: `${noteSizeMm}mm`,
            color: "#374151",
            maxWidth: `${widthMm - padMm * 2}mm`,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {safeNote}
        </div>
      ) : null}

      {showQrOnly ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${codesTopMm}mm`,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <BarcodeImage
            kind="qrcode"
            text={qrText}
            widthMm={matrixSizeMm}
            heightMm={matrixSizeMm}
            scale={renderScale}
          />
        </div>
      ) : showDmOnly ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${codesTopMm}mm`,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <BarcodeImage
            kind="datamatrix"
            text={dmText}
            widthMm={matrixSizeMm}
            heightMm={matrixSizeMm}
            scale={renderScale}
          />
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${codesTopMm}mm`,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <BarcodeImage
            kind="code128"
            text={encoded}
            widthMm={barcodeWidthMm}
            heightMm={barcodeHeightMm}
            scale={renderScale}
          />
        </div>
      )}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: `${padMm}mm`,
          textAlign: "center",
          fontSize: `${noteSizeMm}mm`,
          fontWeight: 600,
          color: "#111827",
        }}
      >
        {code}
      </div>
    </div>
  );
}
