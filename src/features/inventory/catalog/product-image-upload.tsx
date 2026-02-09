"use client";

import { useCallback, useState } from "react";

type Props = {
  name: string;
  label: string;
  currentUrl: string | null;
  productId: string;
  kind: "product" | "catalog";
};

export function ProductImageUpload({ name, label, currentUrl, productId, kind }: Props) {
  const [url, setUrl] = useState<string>(currentUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
