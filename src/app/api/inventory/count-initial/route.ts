import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// POST: ejecutar conteo inicial para una sede.
// Body: { site_id: string, lines: Array<{ product_id: string, quantity: number }> }
// - Inserta inventory_movements (movement_type='count', note=count_initial:sessionId)
// - Upsert inventory_stock_by_site (current_qty = quantity; para inicial reemplaza)
// RLS exige nexo.inventory.counts o nexo.inventory.movements/stock según políticas.

const SESSION_PREFIX = "count_initial:";

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

  let body: { site_id?: string; lines?: Array<{ product_id?: string; quantity?: number }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const siteId = typeof body?.site_id === "string" ? body.site_id.trim() : "";
  const rawLines = Array.isArray(body?.lines) ? body.lines : [];

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
  const note = `${SESSION_PREFIX}${sessionId}`;

  // Usar initial_count: existe en inventory_movement_types (affects_stock=1)
  const MOVEMENT_TYPE = "initial_count";

  for (const { product_id, quantity } of lines) {
    const { error: movErr } = await supabase.from("inventory_movements").insert({
      site_id: siteId,
      product_id,
      movement_type: MOVEMENT_TYPE,
      quantity,
      note,
    });

    if (movErr) {
      return NextResponse.json(
        { error: "inventory_movements: " + movErr.message },
        { status: 500 }
      );
    }

    const { error: stockErr } = await supabase
      .from("inventory_stock_by_site")
      .upsert(
        {
          site_id: siteId,
          product_id,
          current_qty: quantity,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_id,product_id" }
      );

    if (stockErr) {
      return NextResponse.json(
        { error: "inventory_stock_by_site: " + stockErr.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, sessionId, count: lines.length });
}

