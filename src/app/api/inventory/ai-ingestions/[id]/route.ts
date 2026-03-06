import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
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
    .select(
      "id,site_id,supplier_id,flow_type,source_type,source_filename,status,error_message,parsed_document,created_at,updated_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (ingestionErr) return NextResponse.json({ error: ingestionErr.message }, { status: 500 });
  if (!ingestion) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { data: items, error: itemsErr } = await supabase
    .from("inventory_ai_ingestion_items")
    .select("id,line_no,raw_payload,normalized_payload,match_status,confidence,review_status")
    .eq("ingestion_id", id)
    .order("line_no", { ascending: true });
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  const itemIds = (items ?? []).map((row) => row.id);
  const { data: matches, error: matchesErr } = itemIds.length
    ? await supabase
        .from("inventory_ai_ingestion_matches")
        .select("id,item_id,product_id_candidate,score,reason")
        .in("item_id", itemIds)
        .order("score", { ascending: false })
    : { data: [] as Array<Record<string, unknown>>, error: null };
  if (matchesErr) return NextResponse.json({ error: matchesErr.message }, { status: 500 });

  const { data: actions, error: actionsErr } = await supabase
    .from("inventory_ai_ingestion_actions")
    .select("id,item_id,action_type,approved_by,approved_at,audit_payload")
    .eq("ingestion_id", id)
    .order("approved_at", { ascending: false });
  if (actionsErr) return NextResponse.json({ error: actionsErr.message }, { status: 500 });

  return NextResponse.json({
    ingestion,
    items: items ?? [],
    matches: matches ?? [],
    actions: actions ?? [],
  });
}
