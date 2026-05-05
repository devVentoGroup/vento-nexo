import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
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
        setAll() { },
      },
    }
  );

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: {
    site_id?: string;
    lines?: Array<{
      product_id?: string;
      quantity?: number;
      position_id?: string;
    }>;
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
      position_id: typeof l?.position_id === "string" ? l.position_id.trim() : "",
    }))
    .filter((l) => l.product_id && l.quantity > 0);

  if (lines.length === 0) {
    return NextResponse.json({ error: "Al menos una linea con cantidad > 0" }, { status: 400 });
  }

  const countLinesByProductId = new Map<string, { product_id: string; quantity: number }>();
  for (const line of lines) {
    const current = countLinesByProductId.get(line.product_id);
    if (current) {
      current.quantity += line.quantity;
    } else {
      countLinesByProductId.set(line.product_id, {
        product_id: line.product_id,
        quantity: line.quantity,
      });
    }
  }

  const countLines = Array.from(countLinesByProductId.values());

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
        p_lines: countLines,
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

    if (scopeType === "loc" && countSessionId) {
      const { error: closeErr } = await supabase.rpc("close_inventory_count_session", {
        p_session_id: countSessionId,
        p_closed_by: user.id,
      });
      if (closeErr) {
        return NextResponse.json(
          { error: "close_inventory_count_session: " + closeErr.message },
          { status: 500 }
        );
      }

      const { error: applyErr } = await supabase.rpc("apply_inventory_count_adjustments", {
        p_session_id: countSessionId,
        p_user_id: user.id,
      });
      if (applyErr) {
        return NextResponse.json(
          { error: "apply_inventory_count_adjustments: " + applyErr.message },
          { status: 500 }
        );
      }

      if (scopeLocationId) {
        const { error: positionErr } = await supabase.rpc("reconcile_inventory_stock_positions_for_count", {
          p_location_id: scopeLocationId,
          p_lines: lines,
          p_created_by: user.id,
          p_note: `count:${countSessionId}`,
        });

        if (positionErr) {
          return NextResponse.json(
            { error: "reconcile_inventory_stock_positions_for_count: " + positionErr.message },
            { status: 500 }
          );
        }

        revalidatePath(`/inventory/locations/${encodeURIComponent(scopeLocationId)}/board`);
      }
    }

    revalidatePath("/inventory/stock");
    revalidatePath("/inventory/count-initial");

    return NextResponse.json({
      ok: true,
      sessionId,
      countSessionId: countSessionId ?? undefined,
      applied: scopeType === "loc",
      count: countLines.length,
    });
  }

  const { error: countErr } = await supabase.rpc("apply_inventory_site_count", {
    p_site_id: siteId,
    p_user_id: user.id,
    p_note: note,
    p_lines: countLines,
  });
  if (countErr) {
    return NextResponse.json(
      { error: "apply_inventory_site_count: " + countErr.message },
      { status: 500 }
    );
  }

  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/count-initial");

  return NextResponse.json({
    ok: true,
    sessionId,
    countSessionId: countSessionId ?? undefined,
    count: countLines.length,
  });
}
