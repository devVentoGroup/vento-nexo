"use client";

import { useEffect } from "react";
import type { Preset } from "../_lib/types";
import { buildSingleLabelZpl, buildThreeUpRowZpl } from "../_lib/zpl";

type PreviewItem = { code: string; note?: string };

export function usePreviewZpl(
  preset: Preset | null,
  opts: {
    dpi: number;
    offsetXDots: number;
    offsetYDots: number;
    barcodeKind: "datamatrix" | "code128";
    code128HeightDots: number;
    dmModuleDots: number;
    title: string;
    previewItems: PreviewItem[];
    baseUrl: string;
  },
  setPreviewZpl: (zpl: string) => void
) {
  useEffect(() => {
    if (!preset) return;
    try {
      if (preset.columns === 1) {
        const first = opts.previewItems[0] ?? { code: "EJEMPLO-001", note: "Demo" };
        const zpl = buildSingleLabelZpl({
          preset,
          dpi: opts.dpi,
          offsetXDots: opts.offsetXDots,
          offsetYDots: opts.offsetYDots,
          barcodeKind: opts.barcodeKind,
          code128HeightDots: opts.code128HeightDots,
          dmModuleDots: opts.dmModuleDots,
          type: preset.defaultType,
          title: opts.title,
          code: first.code,
          note: first.note,
          baseUrlForQr:
            preset.id === "LOC_50x70" && preset.defaultType === "LOC" ? opts.baseUrl : undefined,
        });
        setPreviewZpl(zpl);
      } else {
        const zpl = buildThreeUpRowZpl({
          preset,
          dpi: opts.dpi,
          offsetXDots: opts.offsetXDots,
          offsetYDots: opts.offsetYDots,
          barcodeKind: opts.barcodeKind,
          code128HeightDots: opts.code128HeightDots,
          dmModuleDots: opts.dmModuleDots,
          type: preset.defaultType,
          title: opts.title,
          items: opts.previewItems,
        });
        setPreviewZpl(zpl);
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setPreviewZpl(`// Error generando ZPL: ${errMsg}`);
    }
  }, [
    preset,
    opts.dpi,
    opts.offsetXDots,
    opts.offsetYDots,
    opts.barcodeKind,
    opts.code128HeightDots,
    opts.dmModuleDots,
    opts.title,
    opts.previewItems,
    opts.baseUrl,
    setPreviewZpl,
  ]);
}
