import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const MOVEMENT_TYPE = "adjustment";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const sessionId =
    new URL(req.url).searchParams.get("session_id")?.trim() ||
    (await req.formData()).get("session_id")?.toString()?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "session_id requerido" }, { status: 400 });
  }

  const { data: session, error: sessErr } = await supabase
    .from("inventory_count_sessions")
    .select("id,site_id,status,scope_type,scope_location_id")
    .eq("id", sessionId)
    .single();

  if (sessErr || !session) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }
  const sess = session as { site_id: string; status: string; scope_type: string | null; scope_location_id: string | null };
  if (sess.status !== "closed") {
    return NextResponse.json({ error: "La sesión debe estar cerrada para aprobar ajustes" }, { status: 400 });
  }

  const { data: lines } = await supabase
    .from("inventory_count_lines")
    .select("id,product_id,quantity_delta,adjustment_applied_at")
    .eq("session_id", sessionId);
  const lineRows = (lines ?? []) as {
    id: string;
    product_id: string;
    quantity_delta: number | null;
    adjustment_applied_at: string | null;
  }[];
  const toApply = lineRows.filter((l) => Number(l.quantity_delta ?? 0) !== 0 && !l.adjustment_applied_at);

  for (const line of toApply) {
    const delta = Number(line.quantity_delta ?? 0);
    const note = `Ajuste por conteo sesión ${sessionId}`;

    const { error: movErr } = await supabase.from("inventory_movements").insert({
      site_id: sess.site_id,
      product_id: line.product_id,
      movement_type: MOVEMENT_TYPE,
      quantity: delta,
      note,
      created_by: user.id,
    });
    if (movErr) {
      return NextResponse.json(
        { error: "inventory_movements: " + movErr.message },
        { status: 500 }
      );
    }

    if (sess.scope_type === "loc" && sess.scope_location_id) {
      const { error: locErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
        p_location_id: sess.scope_location_id,
        p_product_id: line.product_id,
        p_delta: delta,
      });
      if (locErr) {
        return NextResponse.json(
          { error: "inventory_stock_by_location: " + locErr.message },
          { status: 500 }
        );
      }
    }

    const { data: siteStock } = await supabase
      .from("inventory_stock_by_site")
      .select("current_qty")
      .eq("site_id", sess.site_id)
      .eq("product_id", line.product_id)
      .maybeSingle();
    const currentQty = Number((siteStock as { current_qty?: number } | null)?.current_qty ?? 0);
    const newQty = Math.max(0, currentQty + delta);
    const { error: siteErr } = await supabase
      .from("inventory_stock_by_site")
      .upsert(
        {
          site_id: sess.site_id,
          product_id: line.product_id,
          current_qty: newQty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_id,product_id" }
      );
    if (siteErr) {
      return NextResponse.json(
        { error: "inventory_stock_by_site: " + siteErr.message },
        { status: 500 }
      );
    }

    await supabase
      .from("inventory_count_lines")
      .update({ adjustment_applied_at: new Date().toISOString() })
      .eq("id", line.id);
  }

  return NextResponse.json({ ok: true, applied: toApply.length });
}
