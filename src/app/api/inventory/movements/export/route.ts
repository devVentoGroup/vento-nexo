import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function escapeCsv(value: string): string {
  const s = String(value ?? "").replace(/"/g, '""');
  return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
}

function startOfDayIso(dateStr: string) {
  return `${dateStr}T00:00:00`;
}
function endOfDayIso(dateStr: string) {
  return `${dateStr}T23:59:59`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const siteId = url.searchParams.get("site_id")?.trim() ?? "";
  const movementType = url.searchParams.get("type")?.trim() ?? "";
  const productId = url.searchParams.get("product")?.trim() ?? "";
  const fromDate = url.searchParams.get("from")?.trim() ?? "";
  const toDate = url.searchParams.get("to")?.trim() ?? "";

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

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  const role = String((employee as { role?: string } | null)?.role ?? "");
  const canExport = ["gerente_general", "propietario"].includes(role);
  if (!canExport) {
    return NextResponse.json(
      { error: "Solo gerentes y propietarios pueden exportar." },
      { status: 403 }
    );
  }

  let q = supabase
    .from("inventory_movements")
    .select(
      "id,site_id,product_id,movement_type,quantity,note,created_at, product:products(id,name,sku,unit)"
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  if (siteId) q = q.eq("site_id", siteId);
  if (movementType) q = q.eq("movement_type", movementType);
  if (productId) q = q.eq("product_id", productId);
  if (fromDate) q = q.gte("created_at", startOfDayIso(fromDate));
  if (toDate) q = q.lte("created_at", endOfDayIso(toDate));

  const { data: rows, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: sites } = await supabase.from("sites").select("id,name");
  const siteNameMap = new Map(
    (sites ?? []).map((s: { id: string; name: string | null }) => [s.id, s.name ?? s.id])
  );

  const header = ["Fecha", "Tipo", "Sede", "Producto", "SKU", "Qty", "Unidad", "Nota"].map(escapeCsv).join(",");
  const csvRows: string[] = [header];

  for (const row of rows ?? []) {
    const r = row as {
      created_at?: string;
      movement_type?: string;
      site_id?: string;
      product_id?: string;
      quantity?: number;
      note?: string;
      product?: { name?: string; sku?: string; unit?: string } | null;
    };
    const siteName = siteNameMap.get(String(r.site_id ?? "")) ?? r.site_id ?? "";
    const productName = r.product?.name ?? r.product_id ?? "";
    const productSku = r.product?.sku ?? "";
    const unit = r.product?.unit ?? "";
    csvRows.push(
      [
        escapeCsv(r.created_at ?? ""),
        escapeCsv(r.movement_type ?? ""),
        escapeCsv(siteName),
        escapeCsv(productName),
        escapeCsv(productSku),
        String(r.quantity ?? ""),
        escapeCsv(unit),
        escapeCsv(r.note ?? ""),
      ].join(",")
    );
  }

  const csv = csvRows.join("\n");
  const bom = "\uFEFF";

  return new NextResponse(bom + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="movimientos.csv"',
    },
  });
}
