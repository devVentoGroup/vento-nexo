"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import type { BarcodeVisualKind } from "../_lib/types";

type BwipJsModule = {
  toCanvas: (canvas: HTMLCanvasElement, opts: Record<string, unknown>) => void;
};

let bwipjsPromise: Promise<BwipJsModule> | null = null;

async function loadBwipJs(): Promise<BwipJsModule> {
  if (!bwipjsPromise) {
    bwipjsPromise = import("bwip-js").then(
      (mod) => ((mod as { default?: BwipJsModule }).default ?? mod) as BwipJsModule
    );
  }
  return bwipjsPromise;
}

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
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!text) {
      setDataUrl(null);
      return () => {
        active = false;
      };
    }
    setDataUrl(null);
    setError(null);

    loadBwipJs()
      .then((bwipjs) => {
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
        if (active) setDataUrl(url);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      });

    return () => {
      active = false;
    };
  }, [kind, text, scale]);

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
      alt="Código de barras"
      style={{
        ...sizeStyle,
        objectFit: "fill",
        imageRendering: "pixelated",
        display: "block",
      }}
    />
  );
}
