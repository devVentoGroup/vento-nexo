import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "nexo-catalog-images";
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function getExt(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

function sanitizePathToken(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || fallback;
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
  if (!["propietario", "gerente_general"].includes(role)) {
    return NextResponse.json({ error: "Sin permisos para subir imágenes" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formato de solicitud inválido" }, { status: 400 });
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

  const rawProductId = (formData.get("productId") as string)?.trim() || "shared";
  const rawKind = (formData.get("kind") as string)?.trim() || "image";
  const productId = sanitizePathToken(rawProductId, "shared");
  const kind = sanitizePathToken(rawKind, "image");
  const ext = getExt(mime);
  const path = `${productId}/${kind}-${Date.now()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: true });

  if (uploadErr) {
    const message = String(uploadErr.message ?? "");
    const normalized = message.toLowerCase();

    if (normalized.includes("bucket") && normalized.includes("not found")) {
      return NextResponse.json(
        { error: "No esta configurado el bucket de imagenes del catalogo. Ejecuta migraciones de Storage." },
        { status: 500 }
      );
    }

    if (normalized.includes("row-level security") || normalized.includes("policy")) {
      return NextResponse.json(
        { error: "No tienes permisos de Storage para subir imagenes. Revisa politicas del bucket." },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: message || "Error de Storage al subir imagen." }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: urlData.publicUrl });
}
