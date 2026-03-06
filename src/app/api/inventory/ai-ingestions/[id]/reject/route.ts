import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const params = await ctx.params;
  const id = String(params.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body: { item_ids?: string[] } = {};
  try {
    body = (await req.json()) as { item_ids?: string[] };
  } catch {
    body = {};
  }

  const itemIds = Array.isArray(body.item_ids) ? body.item_ids.filter(Boolean) : [];
  if (itemIds.length > 0) {
    const { error: itemUpdateErr } = await supabase
      .from("inventory_ai_ingestion_items")
      .update({ review_status: "rejected", updated_at: new Date().toISOString() })
      .eq("ingestion_id", id)
      .in("id", itemIds);
    if (itemUpdateErr) return NextResponse.json({ error: itemUpdateErr.message }, { status: 500 });
  } else {
    const { error: itemUpdateErr } = await supabase
      .from("inventory_ai_ingestion_items")
      .update({ review_status: "rejected", updated_at: new Date().toISOString() })
      .eq("ingestion_id", id);
    if (itemUpdateErr) return NextResponse.json({ error: itemUpdateErr.message }, { status: 500 });
  }

  const { error: actionErr } = await supabase
    .from("inventory_ai_ingestion_actions")
    .insert({
      ingestion_id: id,
      item_id: itemIds[0] ?? null,
      action_type: "reject",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      audit_payload: {
        item_ids: itemIds,
      },
    });
  if (actionErr) return NextResponse.json({ error: actionErr.message }, { status: 500 });

  const { error: ingestionErr } = await supabase
    .from("inventory_ai_ingestions")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (ingestionErr) return NextResponse.json({ error: ingestionErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
