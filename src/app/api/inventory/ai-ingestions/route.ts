import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { parseDocumentWithOpenAI } from "@/lib/inventory/ai/openai";
import type { InventoryUnit } from "@/lib/inventory/uom";
import {
  AI_DOC_BUCKET,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  buildItemSuggestions,
  computeSha256Hex,
  fileExtensionFromMime,
  inferSourceTypeFromMime,
  parseFlowType,
} from "@/app/api/inventory/ai-ingestions/_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveCurrentSiteId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const [{ data: employee }, { data: settings }] = await Promise.all([
    supabase.from("employees").select("site_id").eq("id", userId).maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", userId)
      .maybeSingle(),
  ]);
  return settings?.selected_site_id ?? employee?.site_id ?? null;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const siteId = await resolveCurrentSiteId(supabase, user.id);
  if (!siteId) return NextResponse.json({ error: "NO_ACTIVE_SITE" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const flowType = parseFlowType((searchParams.get("flow_type") || "").trim());
  const { data, error } = await supabase
    .from("inventory_ai_ingestions")
    .select("id,site_id,supplier_id,flow_type,source_type,source_filename,status,error_message,created_at,updated_at")
    .eq("site_id", siteId)
    .eq("flow_type", flowType)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const siteId = await resolveCurrentSiteId(supabase, user.id);
  if (!siteId) return NextResponse.json({ error: "NO_ACTIVE_SITE" }, { status: 400 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_MULTIPART" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 400 });
  }
  const sourceMime = String(file.type || "").toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(sourceMime)) {
    return NextResponse.json({ error: "UNSUPPORTED_FILE_TYPE" }, { status: 400 });
  }

  const flowType = parseFlowType(String(formData.get("flow_type") || ""));
  const supplierIdRaw = String(formData.get("supplier_id") || "").trim();
  const supplierId = supplierIdRaw || null;

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const sourceDocumentSha256 = computeSha256Hex(fileBuffer);
  const ext = fileExtensionFromMime(sourceMime);
  const sourceStoragePath = `${siteId}/${sourceDocumentSha256}.${ext}`;
  const sourceType = inferSourceTypeFromMime(sourceMime);

  const { data: existingByHash } = await supabase
    .from("inventory_ai_ingestions")
    .select("id,status")
    .eq("site_id", siteId)
    .eq("supplier_id", supplierId)
    .eq("source_document_sha256", sourceDocumentSha256)
    .maybeSingle();
  if (existingByHash?.id) {
    return NextResponse.json({
      ingestion_id: existingByHash.id,
      deduplicated: true,
      status: existingByHash.status ?? "needs_review",
    });
  }

  const upload = await supabase.storage
    .from(AI_DOC_BUCKET)
    .upload(sourceStoragePath, fileBuffer, {
      contentType: sourceMime,
      upsert: true,
    });
  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
  }

  const { data: ingestion, error: ingestionErr } = await supabase
    .from("inventory_ai_ingestions")
    .insert({
      site_id: siteId,
      supplier_id: supplierId,
      flow_type: flowType,
      source_type: sourceType,
      source_filename: file.name,
      source_mime: sourceMime,
      source_size_bytes: file.size,
      source_document_sha256: sourceDocumentSha256,
      source_storage_path: sourceStoragePath,
      status: "processing",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (ingestionErr || !ingestion?.id) {
    return NextResponse.json({ error: ingestionErr?.message ?? "INGESTION_CREATE_FAILED" }, { status: 500 });
  }

  try {
    const parsedRes = await parseDocumentWithOpenAI({
      sourceMime,
      sourceFilename: file.name || `document.${ext}`,
      fileBase64: fileBuffer.toString("base64"),
    });

    const [{ data: productsData }, { data: aliasesData }, { data: unitsData }] = await Promise.all([
      supabase
        .from("products")
        .select("id,name,sku,unit,stock_unit_code")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(1200),
      supplierId
        ? supabase
            .from("inventory_supplier_aliases")
            .select("product_id,alias_text,supplier_sku,confidence_boost")
            .eq("supplier_id", supplierId)
            .eq("is_active", true)
            .limit(1200)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      supabase
        .from("inventory_units")
        .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
        .eq("is_active", true)
        .limit(500),
    ]);

    const suggestions = buildItemSuggestions({
      parsed: parsedRes.parsed,
      flowType,
      products: (productsData ?? []) as Array<{
        id: string;
        name: string | null;
        sku: string | null;
        unit: string | null;
        stock_unit_code: string | null;
      }>,
      aliases: (aliasesData ?? []) as Array<{
        product_id: string;
        alias_text: string;
        supplier_sku: string | null;
        confidence_boost: number | null;
      }>,
      units: (unitsData ?? []) as InventoryUnit[],
    });

    const { error: updateErr } = await supabase
      .from("inventory_ai_ingestions")
      .update({
        status: "needs_review",
        raw_extraction: parsedRes.raw,
        parsed_document: parsedRes.parsed,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ingestion.id);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const itemsPayload = suggestions.map((row) => ({
      ingestion_id: ingestion.id,
      line_no: row.line_no,
      raw_payload: row.raw_payload,
      normalized_payload: row.normalized_payload,
      match_status: row.match_status,
      confidence: row.confidence,
      review_status: "needs_review",
    }));
    if (itemsPayload.length > 0) {
      const { data: insertedItems, error: itemsErr } = await supabase
        .from("inventory_ai_ingestion_items")
        .insert(itemsPayload)
        .select("id,line_no");
      if (itemsErr) {
        return NextResponse.json({ error: itemsErr.message }, { status: 500 });
      }

      const itemIdByLine = new Map((insertedItems ?? []).map((row) => [Number(row.line_no), row.id as string]));
      const matchesPayload = suggestions.flatMap((row) => {
        const itemId = itemIdByLine.get(Number(row.line_no));
        if (!itemId) return [];
        return row.topMatches.map((candidate) => ({
          item_id: itemId,
          product_id_candidate: candidate.product_id,
          score: candidate.score,
          reason: candidate.reason,
        }));
      });
      if (matchesPayload.length > 0) {
        const { error: matchesErr } = await supabase
          .from("inventory_ai_ingestion_matches")
          .insert(matchesPayload);
        if (matchesErr) {
          return NextResponse.json({ error: matchesErr.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({
      ingestion_id: ingestion.id,
      status: "needs_review",
      lines_count: suggestions.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PROCESSING_FAILED";
    await supabase
      .from("inventory_ai_ingestions")
      .update({
        status: "failed",
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ingestion.id);
    return NextResponse.json({ ingestion_id: ingestion.id, error: message }, { status: 500 });
  }
}
