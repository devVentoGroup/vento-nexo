import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@supabase/ssr";

// POST: crear una sesion de conteo operativo.
// No aplica ajustes inmediatamente. La correccion se aprueba desde
// /inventory/count-initial/session/[id] despues de revisar diferencias.

type CountInputLine = {
  product_id: string;
  quantity: number;
  input_quantity: number;
  input_unit_code: string;
  uom_profile_id: string;
  position_id: string;
  stock_unit_code: string;
};

function parseScope(scopeNote: string): {
  scopeType: "site" | "zone" | "loc";
  scopeZone: string | null;
  scopeLocationId: string | null;
} {
  const note = String(scopeNote ?? "").trim();

  if (note.startsWith("loc_id:")) {
    return {
      scopeType: "loc",
      scopeZone: null,
      scopeLocationId: note.replace(/^loc_id:/, "").trim() || null,
    };
  }

  if (note.startsWith("zone:")) {
    return {
      scopeType: "zone",
      scopeZone: note.replace(/^zone:/, "").trim() || null,
      scopeLocationId: null,
    };
  }

  return {
    scopeType: "site",
    scopeZone: null,
    scopeLocationId: null,
  };
}

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
    lines?: Array<{
      product_id?: string;
      quantity?: number;
      input_quantity?: number;
      input_unit_code?: string;
      uom_profile_id?: string;
      stock_unit_code?: string;
      position_id?: string;
    }>;
    scope_note?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const siteId = typeof body?.site_id === "string" ? body.site_id.trim() : "";
  const rawLines = Array.isArray(body?.lines) ? body.lines : [];
  const scopeNote = typeof body?.scope_note === "string" ? body.scope_note.trim() : "";
  const { scopeType, scopeZone, scopeLocationId } = parseScope(scopeNote);

  if (!siteId) {
    return NextResponse.json({ error: "site_id requerido" }, { status: 400 });
  }

  if (scopeType === "loc" && !scopeLocationId) {
    return NextResponse.json({ error: "LOC requerido para conteo por LOC" }, { status: 400 });
  }

  if (scopeType === "zone" && !scopeZone) {
    return NextResponse.json({ error: "Zona requerida para conteo por zona" }, { status: 400 });
  }

  const lines: CountInputLine[] = rawLines
    .map((line) => {
      const quantity = typeof line?.quantity === "number" && line.quantity >= 0 ? line.quantity : NaN;
      const inputQuantity =
        typeof line?.input_quantity === "number" && line.input_quantity >= 0
          ? line.input_quantity
          : quantity;

      return {
        product_id: typeof line?.product_id === "string" ? line.product_id.trim() : "",
        quantity,
        input_quantity: Number.isFinite(inputQuantity) ? inputQuantity : quantity,
        input_unit_code:
          typeof line?.input_unit_code === "string" ? line.input_unit_code.trim().toLowerCase() : "",
        uom_profile_id: typeof line?.uom_profile_id === "string" ? line.uom_profile_id.trim() : "",
        stock_unit_code:
          typeof line?.stock_unit_code === "string" ? line.stock_unit_code.trim().toLowerCase() : "",
        position_id: typeof line?.position_id === "string" ? line.position_id.trim() : "",
      };
    })
    .filter((line) => line.product_id && Number.isFinite(line.quantity) && line.quantity >= 0);

  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Al menos una linea capturada. El 0 es valido para confirmar vacio fisico." },
      { status: 400 }
    );
  }

  const name =
    scopeType === "loc"
      ? "Conteo por LOC"
      : scopeType === "zone"
        ? `Conteo zona ${scopeZone}`
        : "Conteo de sede";

  const { data: scopedResult, error: scopedErr } = await supabase.rpc(
    "create_inventory_count_session_with_lines",
    {
      p_site_id: siteId,
      p_scope_type: scopeType,
      p_scope_zone: scopeZone,
      p_scope_location_id: scopeLocationId,
      p_name: name,
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

  const payload = (scopedResult ?? {}) as { countSessionId?: string; count?: number };

  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/count-initial");
  if (scopeLocationId) {
    revalidatePath(`/inventory/locations/${encodeURIComponent(scopeLocationId)}/board`);
  }

  return NextResponse.json({
    ok: true,
    countSessionId: payload.countSessionId,
    applied: false,
    count: payload.count ?? lines.length,
  });
}
