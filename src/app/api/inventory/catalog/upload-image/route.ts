import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  CATALOG_IMAGE_CACHE_SECONDS,
  optimizeCatalogImage,
} from "@/lib/inventory/catalog-image-optimization";

const BUCKET = "nexo-catalog-images";
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];


function sanitizePathToken(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || fallback;
}

function asText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKindFolder(kind: string): string {
  const value = sanitizePathToken(kind, "image");
  if (value === "presentation") return "presentations";
  if (value === "product") return "product";
  if (value === "catalog") return "catalog";
  return value;
}

function buildObjectPath(params: {
  productId: string;
  kind: string;
}) {
  const productId = sanitizePathToken(params.productId, "shared");
  const kindFolder = normalizeKindFolder(params.kind);
  const nonce = randomUUID().slice(0, 8);

  return `products/${productId}/${kindFolder}/${Date.now()}-${nonce}.webp`;
}

function extractBucketObjectPath(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  // Soporta que en algún punto interno se mande solo el path del objeto.
  if (!/^https?:\/\//i.test(raw)) {
    const objectPath = raw.replace(/^\/+/, "");
    if (!objectPath || objectPath.includes("..") || objectPath.includes("\\")) return null;
    return objectPath;
  }

  try {
    const parsed = new URL(raw);
    const decodedPath = decodeURIComponent(parsed.pathname);
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const markerIndex = decodedPath.indexOf(marker);

    if (markerIndex < 0) return null;

    const objectPath = decodedPath.slice(markerIndex + marker.length);
    if (!objectPath || objectPath.includes("..") || objectPath.includes("\\")) return null;

    return objectPath;
  } catch {
    return null;
  }
}

function storageUploadErrorResponse(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("bucket") && normalized.includes("not found")) {
    return NextResponse.json(
      { error: "No esta configurado el bucket de imagenes del catálogo. Ejecuta migraciones de Storage." },
      { status: 500 }
    );
  }

  if (normalized.includes("row-level security") || normalized.includes("policy")) {
    return NextResponse.json(
      { error: "No tienes permisos de Storage para subir imagenes. Revisa politicas del bucket." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { error: message || "Error de Storage al subir imagen." },
    { status: 500 }
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

function getProductImageLabel(kind: string): string {
  const value = kind.trim().toLowerCase();

  if (value === "presentation") return "Imagen de presentación";
  if (value === "product") return "Imagen principal";
  if (value === "catalog") return "Imagen de catálogo";

  return "Imagen de producto";
}

async function registerProductImage(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  productId: string;
  imageUrl: string;
  kind: string;
  source: "upload" | "copy";
  userId: string;
}): Promise<string | null> {
  const productId = params.productId.trim();
  const imageUrl = params.imageUrl.trim();
  const kind = sanitizePathToken(params.kind, "product");

  if (!imageUrl) {
    return "La imagen se subió, pero no se recibió una URL válida para registrarla.";
  }

  if (!isUuid(productId)) {
    return null;
  }

  const { error } = await params.supabase.from("product_images").upsert(
    {
      product_id: productId,
      image_url: imageUrl,
      kind,
      label: getProductImageLabel(kind),
      source: params.source,
      is_active: true,
      created_by: params.userId,
    },
    {
      onConflict: "product_id,image_url",
      ignoreDuplicates: true,
    }
  );

  if (error) {
    return `La imagen se subió, pero no se pudo registrar en la galería del producto: ${error.message}`;
  }

  return null;
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  const role = String(employee?.role ?? "").toLowerCase();
  if (!["propietario", "gerente_general", "bodeguero"].includes(role)) {
    return NextResponse.json({ error: "Sin permisos para subir imágenes" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formato de solicitud inválido" }, { status: 400 });
  }

  const rawProductId = asText(formData.get("productId")) || "shared";
  const rawKind = asText(formData.get("kind")) || "image";
  const productId = sanitizePathToken(rawProductId, "shared");
  const kind = sanitizePathToken(rawKind, "image");
  const copyFromUrl = asText(formData.get("copyFromUrl"));

  if (copyFromUrl) {
    const sourcePath = extractBucketObjectPath(copyFromUrl);

    if (!sourcePath) {
      return NextResponse.json(
        { error: "La imagen seleccionada no pertenece al bucket del catálogo o no tiene una ruta valida." },
        { status: 400 }
      );
    }

    const { data: sourceBlob, error: downloadErr } = await supabase.storage
      .from(BUCKET)
      .download(sourcePath);

    if (downloadErr || !sourceBlob) {
      return NextResponse.json(
        { error: downloadErr?.message || "No se pudo leer la imagen existente." },
        { status: 500 }
      );
    }

    if (sourceBlob.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "La imagen existente supera 5 MB y no puede copiarse." },
        { status: 400 }
      );
    }

    const targetPath = buildObjectPath({
      productId,
      kind,
    });

    let optimized: Buffer;
    try {
      optimized = await optimizeCatalogImage(Buffer.from(await sourceBlob.arrayBuffer()));
    } catch {
      return NextResponse.json(
        { error: "La imagen existente no se pudo optimizar." },
        { status: 400 }
      );
    }

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(targetPath, optimized, {
        contentType: "image/webp",
        cacheControl: String(CATALOG_IMAGE_CACHE_SECONDS),
        upsert: false,
      });

    if (uploadErr) {
      return storageUploadErrorResponse(String(uploadErr.message ?? ""));
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(targetPath);

    const registerError = await registerProductImage({
      supabase,
      productId: rawProductId,
      imageUrl: urlData.publicUrl,
      kind,
      source: "copy",
      userId: userData.user.id,
    });

    if (registerError) {
      return NextResponse.json({ error: registerError }, { status: 500 });
    }

    return NextResponse.json({
      url: urlData.publicUrl,
      sourceUrl: copyFromUrl,
      copied: true,
      bytes: optimized.byteLength,
      format: "webp",
    });
  }

  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "El archivo no puede superar 5 MB" }, { status: 400 });
  }

  const mime = file.type?.toLowerCase() ?? "";
  if (!ALLOWED_TYPES.includes(mime)) {
    return NextResponse.json({ error: "Solo se permiten imágenes (JPEG, PNG, WebP, GIF)" }, { status: 400 });
  }

  const path = buildObjectPath({
    productId,
    kind,
  });

  let optimized: Buffer;
  try {
    optimized = await optimizeCatalogImage(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json(
      { error: "El archivo no contiene una imagen válida." },
      { status: 400 }
    );
  }

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, optimized, {
      contentType: "image/webp",
      cacheControl: String(CATALOG_IMAGE_CACHE_SECONDS),
      upsert: false,
    });

  if (uploadErr) {
    return storageUploadErrorResponse(String(uploadErr.message ?? ""));
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const registerError = await registerProductImage({
    supabase,
    productId: rawProductId,
    imageUrl: urlData.publicUrl,
    kind,
    source: "upload",
    userId: userData.user.id,
  });

  if (registerError) {
    return NextResponse.json({ error: registerError }, { status: 500 });
  }

  return NextResponse.json({
    url: urlData.publicUrl,
    copied: false,
    bytes: optimized.byteLength,
    format: "webp",
  });
}