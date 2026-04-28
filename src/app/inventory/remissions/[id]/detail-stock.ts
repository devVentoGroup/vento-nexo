import { buildLocFriendlyLabel, type LocRow, type SupabaseClient } from "./detail-utils";

export type StockLocCandidate = {
  locationId: string;
  code: string;
  label: string;
  qty: number;
};

type StockBySiteRow = { product_id: string; current_qty: number | null };
type StockByLocRow = {
  location_id: string;
  product_id: string;
  current_qty: number | null;
  location?: {
    code: string | null;
    zone?: string | null;
    aisle?: string | null;
    level?: string | null;
    description?: string | null;
  } | null;
};

export async function loadOriginStockContext(params: {
  supabase: SupabaseClient;
  fromSiteId: string;
}) {
  const { supabase, fromSiteId } = params;

  const { data: stockBySiteData } = fromSiteId
    ? await supabase
        .from("inventory_stock_by_site")
        .select("product_id,current_qty")
        .eq("site_id", fromSiteId)
    : { data: [] as StockBySiteRow[] };

  const stockBySiteMap = new Map<string, number>(
    (stockBySiteData ?? []).map((r: StockBySiteRow) => [r.product_id, Number(r.current_qty ?? 0)])
  );

  const { data: locsFromSite } = fromSiteId
    ? await supabase
        .from("inventory_locations")
        .select("id,code,zone,aisle,level,description")
        .eq("site_id", fromSiteId)
        .eq("is_active", true)
        .order("code", { ascending: true })
        .limit(500)
    : { data: [] as LocRow[] };

  const originLocRows = (locsFromSite ?? []) as LocRow[];
  const locIdsFromSite = originLocRows.map((row) => row.id);

  const { data: stockByLocData } =
    fromSiteId && locIdsFromSite.length > 0
      ? await supabase
          .from("inventory_stock_by_location")
          .select(
            "location_id,product_id,current_qty,location:inventory_locations(code,zone,aisle,level,description)"
          )
          .in("location_id", locIdsFromSite)
          .gt("current_qty", 0)
      : { data: [] as StockByLocRow[] };

  const stockByLocRows = (stockByLocData ?? []) as StockByLocRow[];
  const stockByLocValueMap = new Map<string, number>();
  const stockByLocCandidates = new Map<string, StockLocCandidate[]>();

  for (const row of stockByLocRows) {
    const code = row.location?.code ?? row.location_id?.slice(0, 8) ?? "";
    const label = buildLocFriendlyLabel(row.location);
    const qty = Number(row.current_qty ?? 0);
    stockByLocValueMap.set(`${row.location_id}|${row.product_id}`, qty);
    if (!qty) continue;
    const key = row.product_id;
    if (!stockByLocCandidates.has(key)) stockByLocCandidates.set(key, []);
    stockByLocCandidates.get(key)!.push({
      locationId: row.location_id,
      code,
      label,
      qty,
    });
  }

  for (const candidates of stockByLocCandidates.values()) {
    candidates.sort((a, b) => b.qty - a.qty || a.code.localeCompare(b.code));
  }

  return {
    stockBySiteMap,
    stockByLocValueMap,
    stockByLocCandidates,
    originLocRows,
    originLocById: new Map(originLocRows.map((row) => [row.id, row])),
  };
}
