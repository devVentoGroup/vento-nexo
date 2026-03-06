import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { ParsedDocument } from "@/lib/inventory/ai/types";
import type { InventoryUnit } from "@/lib/inventory/uom";
import { buildItemSuggestions } from "@/app/api/inventory/ai-ingestions/_lib";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const params = await ctx.params;
  const id = String(params.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { data: ingestion, error: ingestionErr } = await supabase
    .from("inventory_ai_ingestions")
    .select("id,flow_type,supplier_id,parsed_document")
    .eq("id", id)
    .maybeSingle();
  if (ingestionErr) return NextResponse.json({ error: ingestionErr.message }, { status: 500 });
  if (!ingestion) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const parsed = (ingestion.parsed_document ?? {}) as ParsedDocument;
  const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
  if (!lines.length) {
    return NextResponse.json({ error: "NO_PARSED_LINES_TO_REPROCESS" }, { status: 400 });
  }

  const [{ data: productsData }, { data: aliasesData }, { data: unitsData }] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,sku,unit,stock_unit_code")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(1200),
    ingestion.supplier_id
      ? supabase
          .from("inventory_supplier_aliases")
          .select("product_id,alias_text,supplier_sku,confidence_boost")
          .eq("supplier_id", ingestion.supplier_id)
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
    parsed,
    flowType: ingestion.flow_type as "catalog_create" | "supplier_entries",
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

  const { error: deleteMatchErr } = await supabase
    .from("inventory_ai_ingestion_matches")
    .delete()
    .in(
      "item_id",
      (
        await supabase
          .from("inventory_ai_ingestion_items")
          .select("id")
          .eq("ingestion_id", id)
      ).data?.map((row) => row.id) ?? []
    );
  if (deleteMatchErr) return NextResponse.json({ error: deleteMatchErr.message }, { status: 500 });

  const { error: deleteItemsErr } = await supabase
    .from("inventory_ai_ingestion_items")
    .delete()
    .eq("ingestion_id", id);
  if (deleteItemsErr) return NextResponse.json({ error: deleteItemsErr.message }, { status: 500 });

  if (suggestions.length > 0) {
    const { data: insertedItems, error: itemsErr } = await supabase
      .from("inventory_ai_ingestion_items")
      .insert(
        suggestions.map((row) => ({
          ingestion_id: id,
          line_no: row.line_no,
          raw_payload: row.raw_payload,
          normalized_payload: row.normalized_payload,
          match_status: row.match_status,
          confidence: row.confidence,
          review_status: "needs_review",
        }))
      )
      .select("id,line_no");
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

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
      if (matchesErr) return NextResponse.json({ error: matchesErr.message }, { status: 500 });
    }
  }

  const { error: updateErr } = await supabase
    .from("inventory_ai_ingestions")
    .update({
      status: "needs_review",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, lines_count: suggestions.length });
}
