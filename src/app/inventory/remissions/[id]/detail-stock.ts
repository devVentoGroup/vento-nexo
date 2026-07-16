import { buildLocFriendlyLabel, type LocRow, type SupabaseClient } from "./detail-utils";

export type StockPositionCandidate = {
  positionId: string;
  label: string;
  qty: number;
  uomProfileStocks?: Array<{
    uomProfileId: string;
    presentationQty: number;
    baseQty: number;
  }>;
};

export type StockLocCandidate = {
  locationId: string;
  code: string;
  label: string;
  qty: number;
  positions?: StockPositionCandidate[];
  positionOptions?: StockPositionCandidate[];
  uomProfileStocks?: Array<{
    uomProfileId: string;
    presentationQty: number;
    baseQty: number;
  }>;
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

type PositionRow = {
  id: string;
  location_id: string;
  parent_position_id: string | null;
  code: string | null;
  name: string | null;
  kind: string | null;
  sort_order: number | null;
};

type StockByPositionRow = {
  position_id: string;
  product_id: string;
  current_qty: number | null;
};

type StockByUomProfileRow = {
  location_id: string;
  location_position_id: string | null;
  product_id: string;
  uom_profile_id: string;
  presentation_qty: number | null;
  base_qty: number | null;
};

function roundQty(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function buildPositionLabels(positions: PositionRow[]) {
  const byId = new Map(positions.map((position) => [position.id, position]));
  const labelById = new Map<string, string>();

  function labelFor(position: PositionRow): string {
    const cached = labelById.get(position.id);
    if (cached) return cached;

    const ownLabel = String(position.name || position.code || position.id.slice(0, 8)).trim();
    const parent = position.parent_position_id ? byId.get(position.parent_position_id) : null;
    const label = parent ? `${labelFor(parent)} / ${ownLabel}` : ownLabel;
    labelById.set(position.id, label);
    return label;
  }

  for (const position of positions) labelFor(position);
  return labelById;
}

function sortPositionsForPicking(a: StockPositionCandidate, b: StockPositionCandidate) {
  // Regla operativa: consumir primero donde hay menos stock positivo para liberar niveles/espacios.
  if (a.qty !== b.qty) return a.qty - b.qty;
  return a.label.localeCompare(b.label);
}

export async function loadOriginStockContext(params: {
  supabase: SupabaseClient;
  fromSiteId: string;
  /**
   * LOCs operativos permitidos por las rutas de la remisión.
   * Cuando se envía este arreglo, el stock candidato queda limitado a esos LOCs.
   * Las posiciones internas se consultan únicamente dentro de esos LOCs y nunca
   * forman parte de la configuración permanente de la ruta.
   */
  allowedLocationIds?: string[] | null;
}) {
  const { supabase, fromSiteId } = params;
  const hasLocationScope = Array.isArray(params.allowedLocationIds);
  const allowedLocationIdSet = new Set(
    (params.allowedLocationIds ?? [])
      .map((locationId) => String(locationId ?? "").trim())
      .filter(Boolean)
  );

  const { data: stockBySiteData } = fromSiteId && !hasLocationScope
    ? await supabase
        .from("inventory_stock_by_site")
        .select("product_id,current_qty")
        .eq("site_id", fromSiteId)
    : { data: [] as StockBySiteRow[] };

  const stockBySiteMap = new Map<string, number>(
    (stockBySiteData ?? []).map((row: StockBySiteRow) => [
      row.product_id,
      Number(row.current_qty ?? 0),
    ])
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
  const stockLocRows = hasLocationScope
    ? originLocRows.filter((row) => allowedLocationIdSet.has(String(row.id ?? "").trim()))
    : originLocRows;
  const stockLocationIds = stockLocRows.map((row) => row.id);

  const { data: stockByLocData } =
    fromSiteId && stockLocationIds.length > 0
      ? await supabase
          .from("inventory_stock_by_location")
          .select(
            "location_id,product_id,current_qty,location:inventory_locations(code,zone,aisle,level,description)"
          )
          .in("location_id", stockLocationIds)
          .gt("current_qty", 0)
      : { data: [] as StockByLocRow[] };

  const stockByLocRows = (stockByLocData ?? []) as StockByLocRow[];

  if (hasLocationScope) {
    stockBySiteMap.clear();
    for (const row of stockByLocRows) {
      const current = Number(stockBySiteMap.get(row.product_id) ?? 0);
      stockBySiteMap.set(row.product_id, roundQty(current + Number(row.current_qty ?? 0)));
    }
  }

  const { data: positionsData } =
    stockLocationIds.length > 0
      ? await supabase
          .from("inventory_location_positions")
          .select("id,location_id,parent_position_id,code,name,kind,sort_order")
          .in("location_id", stockLocationIds)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("code", { ascending: true })
      : { data: [] as PositionRow[] };

  const positionRows = (positionsData ?? []) as PositionRow[];
  const positionIds = positionRows.map((position) => position.id);
  const positionLabels = buildPositionLabels(positionRows);
  const positionById = new Map(positionRows.map((position) => [position.id, position]));

  const productIdsWithLocStock = Array.from(
    new Set(stockByLocRows.map((row) => row.product_id).filter(Boolean))
  );

  const { data: stockByPositionData } =
    positionIds.length > 0 && productIdsWithLocStock.length > 0
      ? await supabase
          .from("inventory_stock_by_position")
          .select("position_id,product_id,current_qty")
          .in("position_id", positionIds)
          .in("product_id", productIdsWithLocStock)
          .gt("current_qty", 0)
      : { data: [] as StockByPositionRow[] };

  const stockByPositionRows = (stockByPositionData ?? []) as StockByPositionRow[];

  const { data: uomProfileStockData } =
    stockLocationIds.length > 0 && productIdsWithLocStock.length > 0
      ? await supabase
          .from("inventory_stock_by_uom_profile")
          .select(
            "location_id,location_position_id,product_id,uom_profile_id,presentation_qty,base_qty"
          )
          .in("location_id", stockLocationIds)
          .in("product_id", productIdsWithLocStock)
          .gt("base_qty", 0)
      : { data: [] as StockByUomProfileRow[] };

  const uomProfileStockRows = (uomProfileStockData ?? []) as StockByUomProfileRow[];

  const stockByLocValueMap = new Map<string, number>();
  const stockByPositionValueMap = new Map<string, number>();
  const stockByLocCandidates = new Map<string, StockLocCandidate[]>();
  const uomStocksByLocProduct = new Map<
    string,
    Array<{ uomProfileId: string; presentationQty: number; baseQty: number }>
  >();
  const uomStocksByPositionProduct = new Map<
    string,
    Array<{ uomProfileId: string; presentationQty: number; baseQty: number }>
  >();

  for (const row of uomProfileStockRows) {
    const entry = {
      uomProfileId: row.uom_profile_id,
      presentationQty: roundQty(Number(row.presentation_qty ?? 0)),
      baseQty: roundQty(Number(row.base_qty ?? 0)),
    };

    if (entry.baseQty <= 0) continue;

    if (row.location_position_id) {
      const key = `${row.location_position_id}|${row.product_id}`;
      const current = uomStocksByPositionProduct.get(key) ?? [];
      current.push(entry);
      uomStocksByPositionProduct.set(key, current);
    } else {
      const key = `${row.location_id}|${row.product_id}`;
      const current = uomStocksByLocProduct.get(key) ?? [];
      current.push(entry);
      uomStocksByLocProduct.set(key, current);
    }
  }

  const positionsByLocProduct = new Map<string, StockPositionCandidate[]>();
  for (const row of stockByPositionRows) {
    const qty = roundQty(Number(row.current_qty ?? 0));
    if (qty <= 0) continue;

    const position = positionById.get(row.position_id);
    if (!position) continue;

    const key = `${position.location_id}|${row.product_id}`;
    const lines = positionsByLocProduct.get(key) ?? [];
    const label = positionLabels.get(row.position_id) ?? position.name ?? position.code ?? row.position_id.slice(0, 8);

    stockByPositionValueMap.set(`${row.position_id}|${row.product_id}`, qty);

    lines.push({
      positionId: row.position_id,
      label,
      qty,
      uomProfileStocks: uomStocksByPositionProduct.get(`${row.position_id}|${row.product_id}`) ?? [],
    });

    positionsByLocProduct.set(key, lines);
  }

  for (const positions of positionsByLocProduct.values()) {
    positions.sort(sortPositionsForPicking);
  }

  for (const row of stockByLocRows) {
    const code = row.location?.code ?? row.location_id?.slice(0, 8) ?? "";
    const label = buildLocFriendlyLabel(row.location);
    const qty = roundQty(Number(row.current_qty ?? 0));
    stockByLocValueMap.set(`${row.location_id}|${row.product_id}`, qty);
    if (!qty) continue;

    const key = row.product_id;
    const locProductKey = `${row.location_id}|${row.product_id}`;
    const positionOptions = positionsByLocProduct.get(locProductKey) ?? [];

    if (!stockByLocCandidates.has(key)) stockByLocCandidates.set(key, []);
    stockByLocCandidates.get(key)!.push({
      locationId: row.location_id,
      code,
      label,
      qty,
      positions: positionOptions,
      positionOptions,
      uomProfileStocks: uomStocksByLocProduct.get(locProductKey) ?? [],
    });
  }

  for (const candidates of stockByLocCandidates.values()) {
    candidates.sort((a, b) => {
      // Primero ubicaciones que cubren más cantidad; dentro de cada LOC el workbench
      // consumirá posiciones internas con menor stock primero.
      if (b.qty !== a.qty) return b.qty - a.qty;
      return a.code.localeCompare(b.code);
    });
  }

  return {
    stockBySiteMap,
    stockByLocValueMap,
    stockByPositionValueMap,
    stockByLocCandidates,
    originLocRows,
    originLocById: new Map(originLocRows.map((row) => [row.id, row])),
    positionLabels,
  };
}