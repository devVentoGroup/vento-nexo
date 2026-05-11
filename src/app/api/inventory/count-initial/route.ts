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

type CountInputLine = {
  product_id: string;
  quantity: number;
  input_quantity: number;
  input_unit_code: string;
  uom_profile_id: string;
  position_id: string;
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
      input_quantity?: number;
      input_unit_code?: string;
      uom_profile_id?: string;
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

  const lines: CountInputLine[] = rawLines
    .map((l) => ({
      product_id: typeof l?.product_id === "string" ? l.product_id.trim() : "",
      quantity: typeof l?.quantity === "number" && l.quantity >= 0 ? l.quantity : -1,
      input_quantity: typeof l?.input_quantity === "number" && l.input_quantity >= 0 ? l.input_quantity : 0,
      input_unit_code: typeof l?.input_unit_code === "string" ? l.input_unit_code.trim().toLowerCase() : "",
      uom_profile_id: typeof l?.uom_profile_id === "string" ? l.uom_profile_id.trim() : "",
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

        const affectedPhysicalScopes = new Map<
          string,
          {
            product_id: string;
            location_position_id: string | null;
          }
        >();

        const physicalLinesByProfile = new Map<
          string,
          {
            product_id: string;
            uom_profile_id: string;
            location_position_id: string | null;
            presentation_qty: number;
            base_qty: number;
          }
        >();

        for (const line of lines) {
          const locationPositionId = line.position_id || null;
          const scopeKey = `${line.product_id}:${locationPositionId ?? "sin-posicion"}`;

          if (!affectedPhysicalScopes.has(scopeKey)) {
            affectedPhysicalScopes.set(scopeKey, {
              product_id: line.product_id,
              location_position_id: locationPositionId,
            });
          }

          if (!line.uom_profile_id || line.input_quantity <= 0) continue;

          const physicalKey = `${line.product_id}:${line.uom_profile_id}:${locationPositionId ?? "sin-posicion"}`;

          const current = physicalLinesByProfile.get(physicalKey) ?? {
            product_id: line.product_id,
            uom_profile_id: line.uom_profile_id,
            location_position_id: locationPositionId,
            presentation_qty: 0,
            base_qty: 0,
          };

          current.presentation_qty += line.input_quantity;
          current.base_qty += line.quantity;
          physicalLinesByProfile.set(physicalKey, current);
        }

        for (const scope of affectedPhysicalScopes.values()) {
          let deletePhysicalQuery = supabase
            .from("inventory_stock_by_uom_profile")
            .delete()
            .eq("location_id", scopeLocationId)
            .eq("product_id", scope.product_id);

          deletePhysicalQuery = scope.location_position_id
            ? deletePhysicalQuery.eq("location_position_id", scope.location_position_id)
            : deletePhysicalQuery.is("location_position_id", null);

          const { error: deletePhysicalErr } = await deletePhysicalQuery;

          if (deletePhysicalErr) {
            return NextResponse.json(
              { error: "delete inventory_stock_by_uom_profile: " + deletePhysicalErr.message },
              { status: 500 }
            );
          }
        }

        for (const physicalLine of physicalLinesByProfile.values()) {
          if (physicalLine.presentation_qty <= 0 || physicalLine.base_qty <= 0) continue;

          const { error: physicalErr } = await supabase.rpc("upsert_inventory_stock_by_uom_profile", {
            p_location_id: scopeLocationId,
            p_product_id: physicalLine.product_id,
            p_uom_profile_id: physicalLine.uom_profile_id,
            p_presentation_delta: physicalLine.presentation_qty,
            p_base_delta: physicalLine.base_qty,
            p_location_position_id: physicalLine.location_position_id,
          });

          if (physicalErr) {
            return NextResponse.json(
              { error: "upsert_inventory_stock_by_uom_profile: " + physicalErr.message },
              { status: 500 }
            );
          }
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
