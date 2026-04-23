import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// POST: ejecutar conteo cíclico para una sede.
// Body: { site_id: string, lines: Array<{ product_id: string, quantity: number }> }
// - Inserta inventory_movements (movement_type='count', note=count:sessionId)
// - Upsert inventory_stock_by_site (current_qty = quantity; reemplaza por conteo)
// RLS exige nexo.inventory.counts o nexo.inventory.movements/stock según políticas.

const SESSION_PREFIX = "count:";

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

  let body: {
    site_id?: string;
    lines?: Array<{ product_id?: string; quantity?: number }>;
    scope_note?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const siteId = typeof body?.site_id === "string" ? body.site_id.trim() : "";
  const rawLines = Array.isArray(body?.lines) ? body.lines : [];
  const scopeNote = typeof body?.scope_note === "string" ? body.scope_note.trim() : "";

  if (!siteId) {
    return NextResponse.json({ error: "site_id requerido" }, { status: 400 });
  }

  const lines = rawLines
    .map((l) => ({
      product_id: typeof l?.product_id === "string" ? l.product_id.trim() : "",
      quantity: typeof l?.quantity === "number" && l.quantity >= 0 ? l.quantity : -1,
    }))
    .filter((l) => l.product_id && l.quantity > 0);

  if (lines.length === 0) {
    return NextResponse.json({ error: "Al menos una linea con cantidad > 0" }, { status: 400 });
  }

  const sessionId = crypto.randomUUID();
  const note = scopeNote
    ? `${SESSION_PREFIX}${sessionId} ${scopeNote}`
    : `${SESSION_PREFIX}${sessionId}`;

  const isScopedCount = /loc_id:|zone:/.test(scopeNote);

  let countSessionId: string | null = null;

  if (isScopedCount) {
    const scopeType = scopeNote.startsWith("loc_id:") ? "loc" : "zone";
    const scopeLocationId = scopeNote.startsWith("loc_id:")
      ? scopeNote.replace(/^loc_id:/, "").trim() || null
      : null;
    const scopeZone = scopeType === "zone" ? scopeNote.replace(/^zone:/, "").trim() || null : null;

    const { data: scopedResult, error: scopedErr } = await supabase.rpc(
      "create_inventory_count_session_with_lines",
      {
        p_site_id: siteId,
        p_scope_type: scopeType,
        p_scope_zone: scopeZone || null,
        p_scope_location_id: scopeLocationId || null,
        p_name: scopeZone ? `Conteo zona ${scopeZone}` : scopeLocationId ? "Conteo por LOC" : "Conteo",
        p_created_by: user.id,
        p_lines: lines,
      }
    );
    if (scopedErr) {
      return NextResponse.json(
        { error: "inventory_count_session: " + scopedErr.message },
        { status: 500 }
      );
    }
    const payload = (scopedResult ?? {}) as { countSessionId?: string };
    countSessionId = payload.countSessionId ?? null;
  }

  if (isScopedCount) {
    return NextResponse.json({
      ok: true,
      sessionId,
      countSessionId: countSessionId ?? undefined,
      count: lines.length,
    });
  }

  const { error: countErr } = await supabase.rpc("apply_inventory_site_count", {
    p_site_id: siteId,
    p_user_id: user.id,
    p_note: note,
    p_lines: lines,
  });
  if (countErr) {
    return NextResponse.json(
      { error: "apply_inventory_site_count: " + countErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    countSessionId: countSessionId ?? undefined,
    count: lines.length,
  });
}
