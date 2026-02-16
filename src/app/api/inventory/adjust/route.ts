import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { computeWeightedAverageCost } from "@/lib/inventory/costing";

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

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: {
    site_id?: string;
    product_id?: string;
    quantity_delta?: number;
    unit_cost_for_adjust?: number;
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
  const unitCostForAdjust =
    typeof body?.unit_cost_for_adjust === "number" ? body.unit_cost_for_adjust : NaN;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const evidence = typeof body?.evidence === "string" ? body.evidence.trim() : "";

  if (!siteId) return NextResponse.json({ error: "site_id requerido" }, { status: 400 });
  if (!productId) return NextResponse.json({ error: "product_id requerido" }, { status: 400 });
  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    return NextResponse.json(
      { error: "quantity_delta debe ser un numero diferente de 0" },
      { status: 400 }
    );
  }
  if (!reason) return NextResponse.json({ error: "reason es obligatorio" }, { status: 400 });

  const noteParts = [reason];
  if (evidence) noteParts.push(`Evidencia: ${evidence}`);
  const note = noteParts.join(". ");

  const stockUnitCost =
    Number.isFinite(unitCostForAdjust) && unitCostForAdjust > 0 ? Number(unitCostForAdjust) : null;
  const lineTotalCost =
    stockUnitCost != null ? Number(stockUnitCost) * Number(Math.max(quantityDelta, 0)) : null;

  const { data: insertedMovement, error: movErr } = await supabase
    .from("inventory_movements")
    .insert({
      site_id: siteId,
      product_id: productId,
      movement_type: MOVEMENT_TYPE,
      quantity: quantityDelta,
      stock_unit_cost: stockUnitCost,
      line_total_cost: lineTotalCost,
      note,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (movErr) {
    return NextResponse.json({ error: `inventory_movements: ${movErr.message}` }, { status: 500 });
  }

  const { data: currentStock, error: stockReadErr } = await supabase
    .from("inventory_stock_by_site")
    .select("current_qty")
    .eq("site_id", siteId)
    .eq("product_id", productId)
    .single();
  if (stockReadErr && stockReadErr.code !== "PGRST116") {
    return NextResponse.json(
      { error: `inventory_stock_by_site (read): ${stockReadErr.message}` },
      { status: 500 }
    );
  }

  const currentQty = Number(currentStock?.current_qty ?? 0);
  const newQty = currentQty + Number(quantityDelta);
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
      { error: `inventory_stock_by_site (upsert): ${stockUpsertErr.message}` },
      { status: 500 }
    );
  }

  if (quantityDelta > 0 && stockUnitCost != null) {
    const [{ data: productRow }, { data: profileRow }, { data: globalStockRows }, { data: policyRow }] =
      await Promise.all([
        supabase.from("products").select("cost").eq("id", productId).maybeSingle(),
        supabase
          .from("product_inventory_profiles")
          .select("track_inventory,costing_mode")
          .eq("product_id", productId)
          .maybeSingle(),
        supabase
          .from("inventory_stock_by_site")
          .select("site_id,current_qty")
          .eq("product_id", productId),
        supabase
          .from("inventory_cost_policies")
          .select("cost_basis,is_active")
          .eq("site_id", siteId)
          .maybeSingle(),
      ]);

    const trackInventory = Boolean(profileRow?.track_inventory);
    const costingMode = String(profileRow?.costing_mode ?? "");
    if (trackInventory && costingMode === "auto_primary_supplier") {
      const qtyAfterGlobal = (globalStockRows ?? []).reduce(
        (sum, row) => sum + Number(row.current_qty ?? 0),
        0
      );
      const qtyBeforeGlobal = qtyAfterGlobal - Number(quantityDelta);
      const costBefore = Number(productRow?.cost ?? 0);
      const costAfter = computeWeightedAverageCost({
        currentQty: qtyBeforeGlobal,
        currentUnitCost: costBefore,
        receivedQty: Number(quantityDelta),
        receivedUnitCost: Number(stockUnitCost),
      });
      const basis =
        policyRow && policyRow.is_active === false
          ? "net"
          : String(policyRow?.cost_basis ?? "net");

      const { error: updateCostErr } = await supabase
        .from("products")
        .update({ cost: costAfter, updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (updateCostErr) {
        return NextResponse.json({ error: updateCostErr.message }, { status: 500 });
      }

      const { error: eventErr } = await supabase.from("product_cost_events").insert({
        product_id: productId,
        site_id: siteId,
        source: "adjust",
        source_adjust_movement_id: insertedMovement?.id ?? null,
        qty_before: qtyBeforeGlobal,
        qty_in: Number(quantityDelta),
        cost_before: costBefore,
        cost_in: Number(stockUnitCost),
        cost_after: costAfter,
        basis: basis === "gross" ? "gross" : "net",
        created_by: user.id,
      });
      if (eventErr) {
        return NextResponse.json({ error: eventErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    product_id: productId,
    quantity_delta: quantityDelta,
    previous_qty: currentQty,
    new_qty: newQty,
  });
}

