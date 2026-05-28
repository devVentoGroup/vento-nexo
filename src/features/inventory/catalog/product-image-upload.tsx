"use client";

import { useCallback, useState } from "react";

type Props = {
  name: string;
  label: string;
  currentUrl: string | null;
  existingImageUrls?: string[];
  productId: string;
  kind: "product" | "catalog" | "presentation";
};

type UploadImageResponse = {
  url?: string;
  error?: string;
  copied?: boolean;
  sourceUrl?: string;
};

function sanitizePathToken(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || fallback;
}

function normalizeKindFolder(kind: Props["kind"]): string {
  if (kind === "presentation") return "presentations";
  if (kind === "product") return "product";
  if (kind === "catalog") return "catalog";
  return "image";
}

function isAlreadyOrganizedForProduct(params: {
  imageUrl: string;
  productId: string;
  kind: Props["kind"];
}): boolean {
  try {
    const parsed = new URL(params.imageUrl);
    const path = decodeURIComponent(parsed.pathname);
    const productToken = sanitizePathToken(params.productId, "shared");
    const kindFolder = normalizeKindFolder(params.kind);
    return path.includes(`/products/${productToken}/${kindFolder}/`);
  } catch {
    return false;
  }
}

export function ProductImageUpload({
  name,
  label,
  currentUrl,
  existingImageUrls = [],
  productId,
  kind,
}: Props) {
  const [url, setUrl] = useState<string>(currentUrl ?? "");
  const [localImageUrls, setLocalImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const galleryUrls = Array.from(
    new Set(
      [
        ...(currentUrl ? [currentUrl] : []),
        ...existingImageUrls,
        ...localImageUrls,
      ].map((value) => value.trim())
    )
  ).filter(Boolean);

  const describeImage = (imageUrl: string, index: number) => {
    if (imageUrl === currentUrl) return "Imagen actual";

    try {
      const parsed = new URL(imageUrl);
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      const segment = pathParts.at(-1) || `imagen-${index + 1}`;
      const folder = pathParts.at(-2);

      if (folder === "presentations") {
        return `Presentación · ${decodeURIComponent(segment)}`;
      }

      if (folder === "product" || folder === "catalog") {
        return `Foto anterior del producto · ${decodeURIComponent(segment)}`;
      }

      return decodeURIComponent(segment);
    } catch {
      return `Imagen ${index + 1}`;
    }
  };

  const rememberLocalUrl = useCallback((nextUrl: string) => {
    setLocalImageUrls((current) =>
      current.includes(nextUrl) ? current : [...current, nextUrl]
    );
  }, []);

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
        const data = (await res.json()) as UploadImageResponse;

        if (!res.ok) {
          setError(data.error ?? "Error al subir");
          return;
        }

        if (data.url) {
          setUrl(data.url);
          rememberLocalUrl(data.url);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al subir");
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [productId, kind, rememberLocalUrl]
  );

  const handleExistingImageChange = useCallback(
    async (selectedUrl: string) => {
      setError(null);

      if (!selectedUrl) {
        setUrl("");
        return;
      }

      if (selectedUrl === url) return;

      const shouldCopyToPresentationPath =
        kind === "presentation" &&
        !isAlreadyOrganizedForProduct({
          imageUrl: selectedUrl,
          productId,
          kind,
        });

      if (!shouldCopyToPresentationPath) {
        setUrl(selectedUrl);
        rememberLocalUrl(selectedUrl);
        return;
      }

      setCopying(true);

      const formData = new FormData();
      formData.set("copyFromUrl", selectedUrl);
      formData.set("productId", productId);
      formData.set("kind", kind);

      try {
        const res = await fetch("/api/inventory/catalog/upload-image", {
          method: "POST",
          body: formData,
        });
        const data = (await res.json()) as UploadImageResponse;

        if (!res.ok) {
          setError(data.error ?? "No se pudo preparar la imagen seleccionada.");
          return;
        }

        if (data.url) {
          setUrl(data.url);
          rememberLocalUrl(data.url);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo preparar la imagen seleccionada."
        );
      } finally {
        setCopying(false);
      }
    },
    [kind, productId, rememberLocalUrl, url]
  );

  const displayUrl = url;
  const busy = uploading || copying;

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
              <span className="ui-label">Usar imagen de este producto</span>
              <select
                className="ui-input"
                value={url}
                disabled={busy}
                onChange={(e) => {
                  void handleExistingImageChange(e.target.value);
                }}
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
              disabled={busy}
              onChange={handleFile}
            />
            {uploading
              ? "Subiendo…"
              : copying
                ? "Preparando imagen…"
                : "Elegir archivo"}
          </label>

          <p className="text-xs text-[var(--ui-muted)]">
            JPEG, PNG, WebP o GIF. Máx. 5 MB.
          </p>

          {kind === "presentation" ? (
            <p className="text-xs text-[var(--ui-muted)]">
              Si eliges una foto anterior del producto, se copiará a la carpeta de presentaciones de este producto.
            </p>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm ui-alert ui-alert--error">{error}</p> : null}
    </div>
  );
}