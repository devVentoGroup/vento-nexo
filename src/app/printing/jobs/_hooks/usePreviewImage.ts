"use client";

import { useEffect, useRef } from "react";

const DEBOUNCE_MS = 400;

export function usePreviewImage(
  previewZpl: string,
  previewMode: "auto" | "real" | "mock",
  presetWidthMm: number,
  presetHeightMm: number,
  dpmm: number,
  previewRefreshKey: number,
  setPreviewImageUrl: (url: string | null) => void,
  setPreviewImageError: (err: string | null) => void
) {
  const previewObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (previewMode === "mock") {
      setPreviewImageUrl(null);
      setPreviewImageError(null);
      return;
    }
    if (!previewZpl || previewZpl.startsWith("//")) {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      setPreviewImageUrl(null);
      setPreviewImageError(null);
      return;
    }

    const id = setTimeout(() => {
      const url = `/api/labelary?w=${presetWidthMm}&h=${presetHeightMm}&dpmm=${dpmm}`;
      setPreviewImageError(null);
      fetch(url, {
        method: "POST",
        body: previewZpl,
        headers: { Accept: "image/png", "Content-Type": "text/plain" },
      })
        .then(async (res) => {
          if (!res.ok) {
            const raw = await res.text();
            let msg = raw;
            try {
              const json = JSON.parse(raw) as Record<string, unknown> | null;
              if (json && typeof json === "object") {
                msg =
                  (json.error != null ? String(json.error) : null) ??
                  (json.message != null ? String(json.message) : null) ??
                  raw;
              }
            } catch {
              // noop
            }
            throw new Error(msg || `HTTP ${res.status}`);
          }
          return res.blob();
        })
        .then((blob) => {
          if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
          const u = URL.createObjectURL(blob);
          previewObjectUrlRef.current = u;
          setPreviewImageUrl(u);
        })
        .catch((err: unknown) => {
          setPreviewImageUrl(null);
          const msg = err instanceof Error ? err.message : String(err);
          setPreviewImageError(msg);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(id);
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
      setPreviewImageUrl(null);
    };
  }, [
    previewZpl,
    presetWidthMm,
    presetHeightMm,
    dpmm,
    previewRefreshKey,
    previewMode,
    setPreviewImageUrl,
    setPreviewImageError,
  ]);
}
