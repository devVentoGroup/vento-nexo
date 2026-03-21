"use client";

import { useCallback, useState } from "react";

type Props = {
  name: string;
  label: string;
  currentUrl: string | null;
  existingImageUrls?: string[];
  productId: string;
  kind: "product" | "catalog";
};

export function ProductImageUpload({
  name,
  label,
  currentUrl,
  existingImageUrls = [],
  productId,
  kind,
}: Props) {
  const [url, setUrl] = useState<string>(currentUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const galleryUrls = Array.from(
    new Set([...(currentUrl ? [currentUrl] : []), ...existingImageUrls].map((value) => value.trim()))
  ).filter(Boolean);

  const describeImage = (imageUrl: string, index: number) => {
    try {
      const parsed = new URL(imageUrl);
      const segment = parsed.pathname.split("/").filter(Boolean).pop() || `imagen-${index + 1}`;
      return decodeURIComponent(segment);
    } catch {
      return `Imagen ${index + 1}`;
    }
  };

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);
      setUploading(true);

      const formData = new FormData();
      formData.set("file", file);
      formData.set("productId", productId);
      formData.set("kind", kind);

      try {
        const res = await fetch("/api/inventory/catalog/upload-image", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json()) as { url?: string; error?: string };

        if (!res.ok) {
          setError(data.error ?? "Error al subir");
          return;
        }
        if (data.url) {
          setUrl(data.url);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al subir");
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [productId, kind]
  );

  const displayUrl = url;

  return (
    <div className="flex flex-col gap-1">
      <span className="ui-label">{label}</span>
      <input type="hidden" name={name} value={url} readOnly />

      <div className="flex flex-wrap items-start gap-4">
        {displayUrl ? (
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayUrl} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {galleryUrls.length ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="ui-label">Usar imagen ya cargada</span>
              <select
                className="ui-input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              >
                <option value="">Seleccionar imagen existente</option>
                {galleryUrls.map((imageUrl, idx) => (
                  <option key={`${idx}-${imageUrl}`} value={imageUrl}>
                    {describeImage(imageUrl, idx)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="ui-btn ui-btn--ghost flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={uploading}
              onChange={handleFile}
            />
            {uploading ? "Subiendo…" : "Elegir archivo"}
          </label>
          <p className="text-xs text-[var(--ui-muted)]">JPEG, PNG, WebP o GIF. Máx. 5 MB.</p>
        </div>
      </div>

      {error ? <p className="text-sm ui-alert ui-alert--error">{error}</p> : null}
    </div>
  );
}
