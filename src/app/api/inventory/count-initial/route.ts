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

  const MOVEMENT_TYPE = "count";
  const isScopedCount = /loc_id:|zone:/.test(scopeNote);
  const productIds = lines.map((line) => line.product_id);
  const { data: productUnitsData } = productIds.length
    ? await supabase
        .from("products")
        .select("id,unit,stock_unit_code")
        .in("id", productIds)
    : { data: [] as Array<{ id: string; unit: string | null; stock_unit_code: string | null }> };
  const productUnitMap = new Map(
    (productUnitsData ?? []).map((row) => [row.id, row.stock_unit_code ?? row.unit ?? "un"])
  );

  let countSessionId: string | null = null;

  if (isScopedCount) {
    const scopeType = scopeNote.startsWith("loc_id:") ? "loc" : "zone";
    const scopeLocationId = scopeNote.startsWith("loc_id:")
      ? scopeNote.replace(/^loc_id:/, "").trim() || null
      : null;
    const scopeZone = scopeType === "zone" ? scopeNote.replace(/^zone:/, "").trim() || null : null;

    const { data: sessionRow, error: sessionErr } = await supabase
      .from("inventory_count_sessions")
      .insert({
        site_id: siteId,
        status: "open",
        scope_type: scopeType,
        scope_zone: scopeZone || null,
        scope_location_id: scopeLocationId || null,
        name: scopeZone ? `Conteo zona ${scopeZone}` : scopeLocationId ? "Conteo por LOC" : "Conteo",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (!sessionErr && sessionRow?.id) {
      countSessionId = sessionRow.id;
      const currentQtyAtOpen = new Map<string, number>();
      if (scopeType === "loc" && scopeLocationId) {
        const { data: stockLocData } = await supabase
          .from("inventory_stock_by_location")
          .select("product_id,current_qty")
          .eq("location_id", scopeLocationId)
          .in("product_id", productIds);
        for (const row of stockLocData ?? []) {
          currentQtyAtOpen.set(row.product_id, Number(row.current_qty ?? 0));
        }
      } else if (scopeType === "zone" && scopeZone) {
        const { data: locRows } = await supabase
          .from("inventory_locations")
          .select("id")
          .eq("site_id", siteId)
          .eq("zone", scopeZone)
          .limit(1000);
        const locIds = (locRows ?? []).map((row) => row.id);
        if (locIds.length > 0) {
          const { data: stockLocData } = await supabase
            .from("inventory_stock_by_location")
            .select("product_id,current_qty")
            .in("location_id", locIds)
            .in("product_id", productIds);
          for (const row of stockLocData ?? []) {
            const prev = currentQtyAtOpen.get(row.product_id) ?? 0;
            currentQtyAtOpen.set(row.product_id, prev + Number(row.current_qty ?? 0));
          }
        }
      } else {
        const { data: stockSiteData } = await supabase
          .from("inventory_stock_by_site")
          .select("product_id,current_qty")
          .eq("site_id", siteId)
          .in("product_id", productIds);
        for (const row of stockSiteData ?? []) {
          currentQtyAtOpen.set(row.product_id, Number(row.current_qty ?? 0));
        }
      }

      for (const { product_id, quantity } of lines) {
        const { error: lineErr } = await supabase.from("inventory_count_lines").insert({
          session_id: countSessionId,
          product_id,
          quantity_counted: quantity,
          current_qty_at_open: currentQtyAtOpen.get(product_id) ?? 0,
        });
        if (lineErr) break;
      }
    }
    // Si las tablas no existen (migración no ejecutada), sessionErr; seguimos con movimientos igual
  }

  if (isScopedCount) {
    return NextResponse.json({
      ok: true,
      sessionId,
      countSessionId: countSessionId ?? undefined,
      count: lines.length,
    });
  }

  for (const { product_id, quantity } of lines) {
    const { error: movErr } = await supabase.from("inventory_movements").insert({
      site_id: siteId,
      product_id,
      movement_type: MOVEMENT_TYPE,
      quantity,
      input_qty: quantity,
      input_unit_code: productUnitMap.get(product_id) ?? "un",
      conversion_factor_to_stock: 1,
      stock_unit_code: productUnitMap.get(product_id) ?? "un",
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

  return NextResponse.json({
    ok: true,
    sessionId,
    countSessionId: countSessionId ?? undefined,
    count: lines.length,
  });
}
