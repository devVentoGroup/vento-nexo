import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function escapeCsv(value: string): string {
  const s = String(value ?? "").replace(/"/g, '""');
  return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const siteId = url.searchParams.get("site_id")?.trim();
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

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

  const { data: locs } = await supabase
    .from("inventory_locations")
    .select("id,code")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .order("code", { ascending: true })
    .limit(500);

  const locList = locs ?? [];
  const locIds = locList.map((l: { id: string }) => l.id);

  const { data: stockByLoc } =
    locIds.length > 0
      ? await supabase
          .from("inventory_stock_by_location")
          .select("location_id,product_id,current_qty")
          .in("location_id", locIds)
      : { data: [] as { location_id: string; product_id: string; current_qty: number | null }[] };

  const { data: stockBySite } = await supabase
    .from("inventory_stock_by_site")
    .select("product_id,current_qty")
    .eq("site_id", siteId);

  const productIds = new Set<string>();
  for (const row of stockByLoc ?? []) {
    productIds.add(row.product_id);
  }
  for (const row of stockBySite ?? []) {
    if (Number((row as { current_qty?: number }).current_qty ?? 0) > 0) productIds.add((row as { product_id: string }).product_id);
  }

  const productIdList = Array.from(productIds);
  const { data: products } =
    productIdList.length > 0
      ? await supabase
          .from("products")
          .select("id,name,sku,unit")
          .in("id", productIdList)
      : { data: [] as { id: string; name: string | null; sku: string | null; unit: string | null }[] };

  const stockBySiteMap = new Map(
    (stockBySite ?? []).map((r: { product_id: string; current_qty: number | null }) => [
      r.product_id,
      Number(r.current_qty ?? 0),
    ])
  );
  const matrix = new Map<string, number>();
  for (const row of stockByLoc ?? []) {
    matrix.set(`${(row as { product_id: string }).product_id}|${(row as { location_id: string }).location_id}`, Number((row as { current_qty: number | null }).current_qty ?? 0));
  }
  const locById = new Map(locList.map((l: { id: string; code: string | null }) => [l.id, l.code ?? l.id]));

  const header = ["Producto", "SKU", "Unidad", ...locList.map((l: { code: string | null }) => l.code ?? ""), "Total sede"].map(escapeCsv).join(",");
  const rows: string[] = [header];

  for (const p of products ?? []) {
    const total = stockBySiteMap.get(p.id) ?? 0;
    const cells = [
      escapeCsv(p.name ?? ""),
      escapeCsv(p.sku ?? ""),
      escapeCsv(p.unit ?? ""),
      ...locList.map((loc: { id: string }) => {
        const qty = matrix.get(`${p.id}|${loc.id}`) ?? 0;
        return qty > 0 ? String(qty) : "";
      }),
      String(total),
    ];
    rows.push(cells.join(","));
  }

  const csv = rows.join("\n");
  const bom = "\uFEFF";

  return new NextResponse(bom + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="stock-por-loc.csv"',
    },
  });
}
