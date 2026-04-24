"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import bwipjs from "bwip-js";
import type { BarcodeVisualKind } from "../_lib/types";

export function BarcodeImage({
  kind,
  text,
  widthMm,
  heightMm,
  scale = 3,
}: {
  kind: BarcodeVisualKind;
  text: string;
  widthMm: number;
  heightMm: number;
  scale?: number;
}) {
  const renderKey = `${kind}:${text}:${scale}`;
  const [renderState, setRenderState] = useState<{
    key: string;
    dataUrl: string | null;
    error: string | null;
  }>({ key: renderKey, dataUrl: null, error: null });

  useEffect(() => {
    let active = true;
    if (!text) {
      return () => {
        active = false;
      };
    }

    Promise.resolve()
      .then(() => {
        if (!active) return;
        const canvas = document.createElement("canvas");
        const opts: Record<string, unknown> = {
          bcid: kind,
          text,
          scale: Math.max(2, Math.min(scale, 8)),
          includetext: false,
        };
        if (kind === "code128") {
          opts.height = 12;
        }
        bwipjs.toCanvas(canvas, opts);
        const url = canvas.toDataURL("image/png");
        if (active) setRenderState({ key: renderKey, dataUrl: url, error: null });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : String(err);
        setRenderState({ key: renderKey, dataUrl: null, error: msg });
      });

    return () => {
      active = false;
    };
  }, [kind, text, scale, renderKey]);

  const sizeStyle = {
    width: `${widthMm}mm`,
    height: `${heightMm}mm`,
  } as const;

  if (!text) {
    return (
      <div
        style={{
          ...sizeStyle,
          border: "0.2mm solid #111",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "2.2mm",
          color: "#6b7280",
          background: "#fff",
        }}
      >
        Sin datos
      </div>
    );
  }

  const dataUrl = renderState.key === renderKey ? renderState.dataUrl : null;
  const error = renderState.key === renderKey ? renderState.error : null;

  if (!dataUrl) {
    return (
      <div
        style={{
          ...sizeStyle,
          border: "0.2mm solid #111",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "2.2mm",
          color: "#6b7280",
          background: "#fff",
        }}
      >
        {error ? "Error" : "Generando..."}
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="Codigo de barras"
      style={{
        ...sizeStyle,
        objectFit: "fill",
        imageRendering: "pixelated",
        display: "block",
      }}
    />
  );
}

