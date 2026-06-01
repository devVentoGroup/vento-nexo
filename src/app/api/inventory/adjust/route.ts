import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { computeWeightedAverageCost } from "@/lib/inventory/costing";

const MOVEMENT_TYPE = "adjustment";

type RequestBody = {
  site_id?: string;
  location_id?: string;
  location_position_id?: string;
  product_id?: string;
  quantity_delta?: number;
  counted_quantity?: number;
  unit_cost_for_adjust?: number;
  reason?: string;
  evidence?: string;
};

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

  let body: RequestBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const siteId = typeof body?.site_id === "string" ? body.site_id.trim() : "";
  const locationId = typeof body?.location_id === "string" ? body.location_id.trim() : "";
  const locationPositionId =
    typeof body?.location_position_id === "string" ? body.location_position_id.trim() : "";
  const productId = typeof body?.product_id === "string" ? body.product_id.trim() : "";
  const rawQuantityDelta =
    typeof body?.quantity_delta === "number" ? body.quantity_delta : NaN;
  const rawCountedQuantity =
    typeof body?.counted_quantity === "number" ? body.counted_quantity : NaN;
  const hasCountedQuantity = Number.isFinite(rawCountedQuantity);
  const unitCostForAdjust =
    typeof body?.unit_cost_for_adjust === "number" ? body.unit_cost_for_adjust : NaN;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const evidence = typeof body?.evidence === "string" ? body.evidence.trim() : "";

  if (!siteId) {
    return NextResponse.json({ error: "site_id requerido" }, { status: 400 });
  }

  if (!productId) {
    return NextResponse.json({ error: "product_id requerido" }, { status: 400 });
  }

  if (!reason) {
    return NextResponse.json({ error: "reason es obligatorio" }, { status: 400 });
  }

  if (locationPositionId && !locationId) {
    return NextResponse.json(
      { error: "location_id requerido cuando se envia location_position_id" },
      { status: 400 }
    );
  }

  if (hasCountedQuantity && rawCountedQuantity < 0) {
    return NextResponse.json(
      { error: "counted_quantity debe ser mayor o igual a 0" },
      { status: 400 }
    );
  }

  if (!hasCountedQuantity && (!Number.isFinite(rawQuantityDelta) || rawQuantityDelta === 0)) {
    return NextResponse.json(
      { error: "quantity_delta debe ser un numero diferente de 0" },
      { status: 400 }
    );
  }

  if (locationId) {
    const { data: locationRow, error: locationErr } = await supabase
      .from("inventory_locations")
      .select("id,site_id")
      .eq("id", locationId)
      .maybeSingle();

    if (locationErr) {
      return NextResponse.json(
        { error: `inventory_locations: ${locationErr.message}` },
        { status: 500 }
      );
    }

    if (!locationRow || String(locationRow.site_id ?? "") !== siteId) {
      return NextResponse.json(
        { error: "El LOC seleccionado no pertenece a la sede." },
        { status: 400 }
      );
    }
  }

  if (locationPositionId) {
    const { data: positionRow, error: positionErr } = await supabase
      .from("inventory_location_positions")
      .select("id,location_id,is_active")
      .eq("id", locationPositionId)
      .maybeSingle();

    if (positionErr) {
      return NextResponse.json(
        { error: `inventory_location_positions: ${positionErr.message}` },
        { status: 500 }
      );
    }

    if (
      !positionRow ||
      String(positionRow.location_id ?? "") !== locationId ||
      positionRow.is_active === false
    ) {
      return NextResponse.json(
        { error: "La ubicacion interna seleccionada no pertenece al LOC o esta inactiva." },
        { status: 400 }
      );
    }
  }

  const { data: currentSiteStock, error: siteStockReadErr } = await supabase
    .from("inventory_stock_by_site")
    .select("current_qty")
    .eq("site_id", siteId)
    .eq("product_id", productId)
    .maybeSingle();

  if (siteStockReadErr) {
    return NextResponse.json(
      { error: `inventory_stock_by_site (read): ${siteStockReadErr.message}` },
      { status: 500 }
    );
  }

  const currentSiteQty = Number(currentSiteStock?.current_qty ?? 0);
  let currentLocationQty = 0;
  let currentPositionQty = 0;
  let currentQty = currentSiteQty;

  if (locationId) {
    const { data: currentLocationStock, error: locationStockReadErr } = await supabase
      .from("inventory_stock_by_location")
      .select("current_qty")
      .eq("location_id", locationId)
      .eq("product_id", productId)
      .maybeSingle();

    if (locationStockReadErr) {
      return NextResponse.json(
        { error: `inventory_stock_by_location (read): ${locationStockReadErr.message}` },
        { status: 500 }
      );
    }

    currentLocationQty = Number(currentLocationStock?.current_qty ?? 0);
    currentQty = currentLocationQty;
  }

  if (locationPositionId) {
    const { data: currentPositionStock, error: positionStockReadErr } = await supabase
      .from("inventory_stock_by_position")
      .select("current_qty")
      .eq("position_id", locationPositionId)
      .eq("product_id", productId)
      .maybeSingle();

    if (positionStockReadErr) {
      return NextResponse.json(
        { error: `inventory_stock_by_position (read): ${positionStockReadErr.message}` },
        { status: 500 }
      );
    }

    currentPositionQty = Number(currentPositionStock?.current_qty ?? 0);
    currentQty = currentPositionQty;
  }

  const quantityDelta = hasCountedQuantity
    ? Number(rawCountedQuantity) - currentQty
    : Number(rawQuantityDelta);

  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    return NextResponse.json(
      { error: "No hay diferencia para ajustar." },
      { status: 400 }
    );
  }

  const newQty = currentQty + quantityDelta;
  const newSiteQty = currentSiteQty + quantityDelta;
  const newLocationQty = locationId ? currentLocationQty + quantityDelta : null;
  const newPositionQty = locationPositionId ? currentPositionQty + quantityDelta : null;

  if (newQty < 0) {
    return NextResponse.json(
      { error: "El ajuste deja el stock del alcance seleccionado en negativo." },
      { status: 400 }
    );
  }

  if (newSiteQty < 0) {
    return NextResponse.json(
      { error: "El ajuste deja el stock total de la sede en negativo." },
      { status: 400 }
    );
  }

  if (newLocationQty != null && newLocationQty < 0) {
    return NextResponse.json(
      { error: "El ajuste deja el stock del LOC en negativo." },
      { status: 400 }
    );
  }

  if (newPositionQty != null && newPositionQty < 0) {
    return NextResponse.json(
      { error: "El ajuste deja el stock de la ubicacion interna en negativo." },
      { status: 400 }
    );
  }

  const noteParts = [reason];

  if (hasCountedQuantity) {
    noteParts.push(`Conteo fisico: ${rawCountedQuantity}`);
  }

  if (locationId) {
    noteParts.push(`LOC: ${locationId}`);
  }

  if (locationPositionId) {
    noteParts.push(`Ubicacion interna: ${locationPositionId}`);
  }

  if (evidence) {
    noteParts.push(`Evidencia: ${evidence}`);
  }

  const note = noteParts.join(". ");

  const stockUnitCost =
    Number.isFinite(unitCostForAdjust) && unitCostForAdjust > 0
      ? Number(unitCostForAdjust)
      : null;

  const lineTotalCost =
    stockUnitCost != null
      ? Number(stockUnitCost) * Number(Math.max(quantityDelta, 0))
      : null;

  const movementPayload: Record<string, unknown> = {
    site_id: siteId,
    product_id: productId,
    movement_type: MOVEMENT_TYPE,
    quantity: quantityDelta,
    stock_unit_cost: stockUnitCost,
    line_total_cost: lineTotalCost,
    note,
    created_by: user.id,
  };

  if (locationId) {
    movementPayload.location_id = locationId;
  }

  if (locationPositionId) {
    movementPayload.location_position_id = locationPositionId;
  }

  const { data: insertedMovement, error: movErr } = await supabase
    .from("inventory_movements")
    .insert(movementPayload)
    .select("id")
    .single();

  if (movErr) {
    return NextResponse.json(
      { error: `inventory_movements: ${movErr.message}` },
      { status: 500 }
    );
  }

  const { error: siteStockUpsertErr } = await supabase
    .from("inventory_stock_by_site")
    .upsert(
      {
        site_id: siteId,
        product_id: productId,
        current_qty: newSiteQty,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_id,product_id" }
    );

  if (siteStockUpsertErr) {
    return NextResponse.json(
      { error: `inventory_stock_by_site (upsert): ${siteStockUpsertErr.message}` },
      { status: 500 }
    );
  }

  if (locationId && newLocationQty != null) {
    const { error: locationStockUpsertErr } = await supabase
      .from("inventory_stock_by_location")
      .upsert(
        {
          location_id: locationId,
          product_id: productId,
          current_qty: newLocationQty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "location_id,product_id" }
      );

    if (locationStockUpsertErr) {
      return NextResponse.json(
        { error: `inventory_stock_by_location (upsert): ${locationStockUpsertErr.message}` },
        { status: 500 }
      );
    }
  }

  if (locationPositionId && newPositionQty != null) {
    const { error: positionStockUpsertErr } = await supabase
      .from("inventory_stock_by_position")
      .upsert(
        {
          position_id: locationPositionId,
          product_id: productId,
          current_qty: newPositionQty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "position_id,product_id" }
      );

    if (positionStockUpsertErr) {
      return NextResponse.json(
        { error: `inventory_stock_by_position (upsert): ${positionStockUpsertErr.message}` },
        { status: 500 }
      );
    }
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
    location_id: locationId || null,
    location_position_id: locationPositionId || null,
    quantity_delta: quantityDelta,
    previous_qty: currentQty,
    new_qty: newQty,
    previous_site_qty: currentSiteQty,
    new_site_qty: newSiteQty,
    previous_location_qty: locationId ? currentLocationQty : null,
    new_location_qty: newLocationQty,
    previous_position_qty: locationPositionId ? currentPositionQty : null,
    new_position_qty: newPositionQty,
  });
}
