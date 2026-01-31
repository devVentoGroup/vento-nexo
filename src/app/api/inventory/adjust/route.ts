import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// POST: ejecutar ajuste de inventario para un producto en una sede.
// Body: { site_id: string, product_id: string, quantity_delta: number, reason: string, evidence?: string }
// - Inserta inventory_movements (movement_type='adjustment', quantity=quantity_delta, note=reason + evidence)
// - Actualiza inventory_stock_by_site (current_qty += quantity_delta)
// RLS exige nexo.inventory.adjustments según políticas.

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

  let body: {
    site_id?: string;
    product_id?: string;
    quantity_delta?: number;
    reason?: string;
    evidence?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const siteId = typeof body?.site_id === "string" ? body.site_id.trim() : "";
  const productId = typeof body?.product_id === "string" ? body.product_id.trim() : "";
  const quantityDelta = typeof body?.quantity_delta === "number" ? body.quantity_delta : NaN;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const evidence = typeof body?.evidence === "string" ? body.evidence.trim() : "";

  if (!siteId) {
    return NextResponse.json({ error: "site_id requerido" }, { status: 400 });
  }
  if (!productId) {
    return NextResponse.json({ error: "product_id requerido" }, { status: 400 });
  }
  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    return NextResponse.json(
      { error: "quantity_delta debe ser un número diferente de 0" },
      { status: 400 }
    );
  }
  if (!reason) {
    return NextResponse.json({ error: "reason (motivo) es obligatorio" }, { status: 400 });
  }

  // Construir nota: motivo + evidencia opcional
  const noteParts = [reason];
  if (evidence) {
    noteParts.push(`Evidencia: ${evidence}`);
  }
  const note = noteParts.join(". ");

  // 1. Insertar movimiento tipo 'adjustment'
  const { error: movErr } = await supabase.from("inventory_movements").insert({
    site_id: siteId,
    product_id: productId,
    movement_type: MOVEMENT_TYPE,
    quantity: quantityDelta,
    note,
    created_by: user.id,
  });

  if (movErr) {
    return NextResponse.json(
      { error: "inventory_movements: " + movErr.message },
      { status: 500 }
    );
  }

  // 2. Obtener stock actual (o 0 si no existe)
  const { data: currentStock, error: stockReadErr } = await supabase
    .from("inventory_stock_by_site")
    .select("current_qty")
    .eq("site_id", siteId)
    .eq("product_id", productId)
    .single();

  if (stockReadErr && stockReadErr.code !== "PGRST116") {
    // PGRST116 = no rows returned, que es válido si no hay stock previo
    return NextResponse.json(
      { error: "inventory_stock_by_site (read): " + stockReadErr.message },
      { status: 500 }
    );
  }

  const currentQty = currentStock?.current_qty ?? 0;
  const newQty = currentQty + quantityDelta;

  // 3. Upsert stock actualizado
  const { error: stockUpsertErr } = await supabase
    .from("inventory_stock_by_site")
    .upsert(
      {
        site_id: siteId,
        product_id: productId,
        current_qty: newQty,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_id,product_id" }
    );

  if (stockUpsertErr) {
    return NextResponse.json(
      { error: "inventory_stock_by_site (upsert): " + stockUpsertErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    product_id: productId,
    quantity_delta: quantityDelta,
    previous_qty: currentQty,
    new_qty: newQty,
  });
}

