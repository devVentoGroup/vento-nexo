import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { KioskBoardStockView, type KioskBoardStockItem } from "@/components/vento/kiosk-board-stock-view";
import { KioskInlineSuccessAlert } from "@/components/vento/kiosk-inline-success-alert";
import { LocationBoardAutoRefresh } from "@/features/inventory/locations/location-board-auto-refresh";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { getCategoryPath, type InventoryCategoryRow } from "@/lib/inventory/categories";
import { formatOperationalPartLabel, type ProductUomProfile } from "@/lib/inventory/uom";

export const dynamic = "force-dynamic";

type Params = { id: string };
type SearchParams = {
  kiosk?: string;
  ok?: string;
  position_id?: string;
  success_message?: string;
  view?: string;
  search?: string;
  stock_tab?: string;
};

type PositionRow = {
  id: string;
  parent_position_id: string | null;
  code: string;
  name: string;
  kind: string;
  sort_order: number | null;
};

type PresentationStockPart = {
  uomProfileId: string;
  label: string;
  qty: number;
  baseQty: number;
  imageUrl?: string;
};

type PresentationStockRow = {
  product_id: string;
  uom_profile_id: string;
  presentation_qty: number | null;
  base_qty: number | null;
  location_position_id: string | null;
  product_uom_profiles:
  | (ProductUomProfile & { image_url?: string | null; catalog_image_url?: string | null })
  | Array<ProductUomProfile & { image_url?: string | null; catalog_image_url?: string | null }>
  | null;
};

function formatQty(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(n);
}

function roundBoardQty(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function buildLocTitle(loc: {
  description?: string | null;
  zone?: string | null;
  code?: string | null;
  id: string;
}) {
  const description = String(loc.description ?? "").trim();
  const zone = String(loc.zone ?? "").trim();
  const code = String(loc.code ?? "").trim();
  return description || zone || code || loc.id;
}

function normalizeProductRelation(
  value:
    | {
      id: string;
      name: string | null;
      stock_unit_code: string | null;
      unit: string | null;
      category_id?: string | null;
      image_url?: string | null;
      catalog_image_url?: string | null;
    }
    | Array<{
      id: string;
      name: string | null;
      stock_unit_code: string | null;
      unit: string | null;
      category_id?: string | null;
      image_url?: string | null;
      catalog_image_url?: string | null;
    }>
    | null
    | undefined
) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(date);
}

function buildChildrenByParent(positions: PositionRow[]) {
  const childrenByParentId = new Map<string, PositionRow[]>();
  for (const position of positions) {
    if (!position.parent_position_id) continue;
    const current = childrenByParentId.get(position.parent_position_id) ?? [];
    current.push(position);
    childrenByParentId.set(position.parent_position_id, current);
  }
  return childrenByParentId;
}

function collectDescendantIds(positionId: string, childrenByParentId: Map<string, PositionRow[]>) {
  const ids = [positionId];
  const stack = [...(childrenByParentId.get(positionId) ?? [])];
  while (stack.length > 0) {
    const current = stack.shift();
    if (!current) continue;
    ids.push(current.id);
    stack.push(...(childrenByParentId.get(current.id) ?? []));
  }
  return ids;
}

function findRootPosition(position: PositionRow | null, positionsById: Map<string, PositionRow>) {
  let current = position;
  while (current?.parent_position_id) {
    const parent = positionsById.get(current.parent_position_id) ?? null;
    if (!parent) break;
    current = parent;
  }
  return current;
}

function positionKindLabel(position: PositionRow) {
  const kind = String(position.kind ?? "").toLowerCase();
  if (kind === "zone") return "Zona";
  if (kind === "level") return "Nivel";
  if (kind === "bin") return "Contenedor";
  if (kind === "section") return "Seccion";
  return "Estanteria";
}

function positionPath(positionId: string, positionsById: Map<string, PositionRow>) {
  const path: PositionRow[] = [];
  let current = positionsById.get(positionId) ?? null;
  while (current) {
    path.unshift(current);
    current = current.parent_position_id ? positionsById.get(current.parent_position_id) ?? null : null;
  }
  return path;
}

function compactLocationLabel(labels: string[]) {
  const unique = Array.from(new Set(labels.filter(Boolean)));
  if (unique.length <= 2) return unique.join(" / ");
  return `${unique.slice(0, 2).join(" / ")} + ${unique.length - 2}`;
}

function normalizeBoardSearch(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeUomProfileRelation(value: PresentationStockRow["product_uom_profiles"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function safeDecodeBoardParam(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function redirectBoardMessage(returnTo: string, message: string) {
  const fallback = "/inventory/stock";
  const target = returnTo || fallback;
  const joiner = target.includes("?") ? "&" : "?";

  redirect(`${target}${joiner}ok=kiosk_withdraw&success_message=${encodeURIComponent(message)}`);
}

async function hideZeroStockProductFromBoard(formData: FormData) {
  "use server";

  const locationId = formText(formData.get("location_id"));
  const productId = formText(formData.get("product_id"));
  const returnTo =
    formText(formData.get("return_to")) ||
    (locationId ? `/inventory/locations/${encodeURIComponent(locationId)}/board?kiosk=1` : "/inventory/stock");

  if (!locationId || !productId) {
    redirectBoardMessage(returnTo, "No se pudo ocultar el producto: faltan datos.");
  }

  const supabase = await createClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes.user) {
    redirectBoardMessage(returnTo, "Debes iniciar sesion para ocultar productos del quiosco.");
  }

  const { data: stockRow, error: stockErr } = await supabase
    .from("inventory_stock_by_location")
    .select("current_qty")
    .eq("location_id", locationId)
    .eq("product_id", productId)
    .maybeSingle();

  if (stockErr) {
    redirectBoardMessage(returnTo, stockErr.message);
  }

  const currentQty = Number((stockRow as { current_qty?: number | null } | null)?.current_qty ?? 0);

  if (currentQty > 0.000001) {
    redirectBoardMessage(returnTo, "No se puede ocultar un producto que todavia tiene stock.");
  }

  const { data: positionRows, error: positionsErr } = await supabase
    .from("inventory_location_positions")
    .select("id")
    .eq("location_id", locationId);

  if (positionsErr) {
    redirectBoardMessage(returnTo, positionsErr.message);
  }

  const positionIds = ((positionRows ?? []) as Array<{ id: string }>)
    .map((position) => String(position.id ?? "").trim())
    .filter(Boolean);

  if (positionIds.length > 0) {
    const { error: positionDeleteErr } = await supabase
      .from("inventory_stock_by_position")
      .delete()
      .eq("product_id", productId)
      .in("position_id", positionIds)
      .lte("current_qty", 0);

    if (positionDeleteErr) {
      redirectBoardMessage(returnTo, positionDeleteErr.message);
    }
  }

  const { error: physicalDeleteErr } = await supabase
    .from("inventory_stock_by_uom_profile")
    .delete()
    .eq("location_id", locationId)
    .eq("product_id", productId);

  if (physicalDeleteErr) {
    redirectBoardMessage(returnTo, physicalDeleteErr.message);
  }

  const { error: locDeleteErr } = await supabase
    .from("inventory_stock_by_location")
    .delete()
    .eq("location_id", locationId)
    .eq("product_id", productId)
    .lte("current_qty", 0);

  if (locDeleteErr) {
    redirectBoardMessage(returnTo, locDeleteErr.message);
  }

  revalidatePath(`/inventory/locations/${encodeURIComponent(locationId)}/board`);
  revalidatePath(`/inventory/locations/${encodeURIComponent(locationId)}/kiosk-withdraw`);

  redirectBoardMessage(returnTo, "Producto ocultado de la pestaña Sin stock.");
}

export default async function LocationBoardPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const isKiosk = String(sp.kiosk ?? "").trim() === "1";
  const positionId = String(sp.position_id ?? "").trim();
  const viewMode = String(sp.view ?? "").trim();
  const searchQuery = String(sp.search ?? "").trim();
  const stockTab = String(sp.stock_tab ?? "").trim() === "out" ? "out" : "available";
  const normalizedSearchQuery = normalizeBoardSearch(searchQuery);
  const successMessage =
    String(sp.ok ?? "").trim() === "kiosk_withdraw"
      ? safeDecodeBoardParam(sp.success_message) || "Retiro registrado correctamente."
      : "";

  const { supabase } = await requireAppAccess({
    appId: "nexo",
    returnTo: `/inventory/locations/${id}/board`,
  });

  const { data: locationData } = await supabase
    .from("inventory_locations")
    .select("id,code,zone,description,site_id")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  const location = (locationData ?? null) as {
    id: string;
    code: string | null;
    zone: string | null;
    description: string | null;
    site_id: string | null;
  } | null;

  if (!location) notFound();

  const [{ data: siteData }, { data: positionsData }] = await Promise.all([
    location.site_id
      ? supabase
        .from("sites")
        .select("id,name")
        .eq("id", location.site_id)
        .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("inventory_location_positions")
      .select("id,parent_position_id,code,name,kind,sort_order")
      .eq("location_id", id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true }),
  ]);

  const site = (siteData ?? null) as { id: string; name: string | null } | null;
  const positions = (positionsData ?? []) as PositionRow[];
  const positionsById = new Map(positions.map((position) => [position.id, position]));
  const childrenByParentId = buildChildrenByParent(positions);
  const topLevelPositions = positions.filter((position) => !position.parent_position_id);
  const selectedPosition = positionId ? positions.find((position) => position.id === positionId) ?? null : null;
  const selectedRootPosition = findRootPosition(selectedPosition, positionsById);
  const selectedPositionIds = selectedPosition
    ? collectDescendantIds(selectedPosition.id, childrenByParentId)
    : [];

  const [stockRowsQuery, allPositionStockQuery] = await Promise.all([
    selectedPosition
      ? supabase
        .from("inventory_stock_by_position")
        .select("product_id,position_id,current_qty,updated_at")
        .in("position_id", selectedPositionIds)
        .gte("current_qty", 0)
        .order("current_qty", { ascending: false })
      : supabase
        .from("inventory_stock_by_location")
        .select(
          "product_id,current_qty,updated_at,products(id,name,stock_unit_code,unit,category_id,image_url,catalog_image_url)"
        )
        .eq("location_id", id)
        .gte("current_qty", 0)
        .order("current_qty", { ascending: false }),
    !selectedPosition && positions.length > 0
      ? supabase
        .from("inventory_stock_by_position")
        .select("product_id,position_id,current_qty")
        .in("position_id", positions.map((position) => position.id))
        .gte("current_qty", 0)
      : Promise.resolve({
        data: [] as Array<{ product_id: string; position_id: string | null; current_qty: number | null }>,
      }),
  ]);

  const stockRowsData = stockRowsQuery.data ?? [];
  const allPositionStockData = allPositionStockQuery.data ?? [];

  const stockRowsRaw = (stockRowsData ?? []) as unknown as Array<{
    product_id: string;
    position_id?: string | null;
    current_qty: number | null;
    updated_at: string | null;
    products?: {
      id: string;
      name: string | null;
      stock_unit_code: string | null;
      unit: string | null;
      category_id?: string | null;
      image_url?: string | null;
      catalog_image_url?: string | null;
    } | Array<{
      id: string;
      name: string | null;
      stock_unit_code: string | null;
      unit: string | null;
      category_id?: string | null;
      image_url?: string | null;
      catalog_image_url?: string | null;
    }> | null;
  }>;

  const positionStockRows = selectedPosition
    ? stockRowsRaw.map((row) => ({
      product_id: row.product_id,
      position_id: row.position_id ?? "",
      current_qty: row.current_qty,
    }))
    : ((allPositionStockData ?? []) as Array<{ product_id: string; position_id: string | null; current_qty: number | null }>);
  const internalLocationLabelsByProduct = new Map<string, string[]>();
  for (const row of positionStockRows) {
    const positionIdForRow = String(row.position_id ?? "").trim();
    if (!positionIdForRow || Number(row.current_qty ?? 0) <= 0) continue;
    const path = positionPath(positionIdForRow, positionsById);
    const selectedIndex = selectedPosition ? path.findIndex((position) => position.id === selectedPosition.id) : -1;
    const visiblePath = selectedPosition ? path.slice(selectedIndex + 1) : path;
    const label = visiblePath.map((position) => position.name).filter(Boolean).join(", ");
    if (!label) continue;
    const current = internalLocationLabelsByProduct.get(row.product_id) ?? [];
    current.push(label);
    internalLocationLabelsByProduct.set(row.product_id, current);
  }
  const aggregatedPositionRows = selectedPosition
    ? Array.from(
      stockRowsRaw.reduce((map, row) => {
        const current = map.get(row.product_id) ?? {
          product_id: row.product_id,
          current_qty: 0,
          updated_at: row.updated_at,
        };
        current.current_qty += Number(row.current_qty ?? 0);
        const currentUpdated = String(current.updated_at ?? "");
        const rowUpdated = String(row.updated_at ?? "");
        if (rowUpdated && (!currentUpdated || new Date(rowUpdated).getTime() > new Date(currentUpdated).getTime())) {
          current.updated_at = rowUpdated;
        }
        map.set(row.product_id, current);
        return map;
      }, new Map<string, { product_id: string; current_qty: number; updated_at: string | null }>())
    ).map(([, row]) => row)
    : stockRowsRaw;
  const selectedPositionProductIds = selectedPosition ? stockRowsRaw.map((row) => row.product_id) : [];
  const { data: selectedPositionProducts } =
    selectedPosition && selectedPositionProductIds.length > 0
      ? await supabase
        .from("products")
        .select("id,name,stock_unit_code,unit,category_id,image_url,catalog_image_url")
        .in("id", selectedPositionProductIds)
      : { data: [] as Array<{ id: string; name: string | null; stock_unit_code: string | null; unit: string | null; category_id?: string | null; image_url?: string | null; catalog_image_url?: string | null }> };
  const selectedPositionProductById = new Map((selectedPositionProducts ?? []).map((product) => [product.id, product]));

  const stockRows = selectedPosition
    ? aggregatedPositionRows.map((row) => ({
      ...row,
      products: selectedPositionProductById.get(row.product_id) ?? null,
    }))
    : stockRowsRaw.map((row) => ({
      ...row,
      products: normalizeProductRelation(row.products),
    }));
  const productIds = stockRows.map((row) => row.product_id);
  const { data: presentationStockData } = productIds.length
    ? selectedPosition
      ? await supabase
        .from("inventory_stock_by_uom_profile")
        .select(
          "product_id,uom_profile_id,presentation_qty,base_qty,location_position_id,product_uom_profiles(id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context,image_url,catalog_image_url)"
        )
        .eq("location_id", id)
        .in("location_position_id", selectedPositionIds)
        .in("product_id", productIds)
        .gt("presentation_qty", 0)
      : await supabase
        .from("inventory_stock_by_uom_profile")
        .select(
          "product_id,uom_profile_id,presentation_qty,base_qty,location_position_id,product_uom_profiles(id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context,image_url,catalog_image_url)"
        )
        .eq("location_id", id)
        .in("product_id", productIds)
        .gt("presentation_qty", 0)
    : { data: [] as PresentationStockRow[] };
  const presentationRows = (presentationStockData ?? []) as unknown as PresentationStockRow[];

  const stockQtyByProduct = new Map<string, number>();
  for (const row of stockRows) {
    stockQtyByProduct.set(row.product_id, Number(row.current_qty ?? 0));
  }

  const presentationRowsByProduct = new Map<string, PresentationStockRow[]>();
  for (const row of presentationRows) {
    const qty = Number(row.presentation_qty ?? 0);
    const baseQty = Number(row.base_qty ?? 0);
    if (qty <= 0 || baseQty <= 0) continue;

    const current = presentationRowsByProduct.get(row.product_id) ?? [];
    current.push(row);
    presentationRowsByProduct.set(row.product_id, current);
  }

  const presentationPartsByProduct = new Map<string, PresentationStockPart[]>();

  for (const [productId, productRows] of presentationRowsByProduct.entries()) {
    const availableBaseQty = Number(stockQtyByProduct.get(productId) ?? 0);

    if (availableBaseQty <= 0.000001) {
      presentationPartsByProduct.set(productId, []);
      continue;
    }

    const totalPhysicalBaseQty = productRows.reduce(
      (sum, row) => sum + Number(row.base_qty ?? 0),
      0
    );
    const hasPositionRows = productRows.some((row) => Boolean(row.location_position_id));

    const rowsForDisplay =
      !selectedPosition && hasPositionRows && totalPhysicalBaseQty > availableBaseQty + 0.000001
        ? productRows.filter((row) => Boolean(row.location_position_id))
        : productRows;

    const partsByProfile = new Map<
      string,
      {
        uomProfileId: string;
        baseLabel: string;
        qty: number;
        baseQty: number;
        imageUrl: string;
      }
    >();

    for (const row of rowsForDisplay) {
      const profile = normalizeUomProfileRelation(row.product_uom_profiles);
      const qty = Number(row.presentation_qty ?? 0);
      const baseQty = Number(row.base_qty ?? 0);

      if (!profile || qty <= 0 || baseQty <= 0) continue;

      const current = partsByProfile.get(row.uom_profile_id) ?? {
        uomProfileId: row.uom_profile_id,
        baseLabel: String(profile.label || profile.input_unit_code || "presentacion").trim(),
        qty: 0,
        baseQty: 0,
        imageUrl: profile.image_url || profile.catalog_image_url || "",
      };

      current.qty = roundBoardQty(current.qty + qty);
      current.baseQty = roundBoardQty(current.baseQty + baseQty);
      partsByProfile.set(row.uom_profile_id, current);
    }

    const parts = Array.from(partsByProfile.values())
      .map((part) => ({
        uomProfileId: part.uomProfileId,
        label: formatOperationalPartLabel(part.baseLabel, part.qty),
        qty: part.qty,
        baseQty: part.baseQty,
        imageUrl: part.imageUrl,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

    presentationPartsByProduct.set(productId, parts);
  }
  const categoryIds = Array.from(
    new Set(
      stockRows
        .map((row) => String(row.products?.category_id ?? "").trim())
        .filter(Boolean)
    )
  );
  const { data: categoryRowsData } = categoryIds.length
    ? await supabase
      .from("product_categories")
      .select("id,name,parent_id,domain,site_id,is_active,applies_to_kinds")
      .in("id", categoryIds)
    : { data: [] as InventoryCategoryRow[] };
  const categoryRows = (categoryRowsData ?? []) as InventoryCategoryRow[];
  const categoryMap = new Map(categoryRows.map((row) => [row.id, row]));
  const allStockItems: KioskBoardStockItem[] = stockRows.map((row) => {
    const product = row.products;
    const qty = Number(row.current_qty ?? 0);
    const unit = product?.stock_unit_code ?? product?.unit ?? "un";
    const categoryId = String(product?.category_id ?? "").trim();
    const categoryPath = getCategoryPath(categoryId, categoryMap);
    const categoryLabel = categoryPath.split(" / ").at(-1) || "Sin categoria";

    return {
      productId: row.product_id,
      name: product?.name ?? row.product_id,
      imageUrl: product?.image_url || product?.catalog_image_url || "",
      qty,
      unit,
      categoryId,
      categoryLabel,
      categoryPath,
      internalLocationLabel: compactLocationLabel(internalLocationLabelsByProduct.get(row.product_id) ?? []),
      presentationParts: presentationPartsByProduct.get(row.product_id) ?? [],
    };
  });

  const stockItems: KioskBoardStockItem[] = normalizedSearchQuery
    ? allStockItems.filter((item) => {
      const haystack = normalizeBoardSearch(
        [
          item.name,
          item.unit,
          item.productId,
          item.internalLocationLabel,
          ...item.presentationParts.map((part) => part.label),
        ].join(" ")
      );

      return haystack.includes(normalizedSearchQuery);
    })
    : allStockItems;

  const title = buildLocTitle(location);
  const totalQty = stockItems.reduce((sum, item) => sum + Number(item.qty ?? 0), 0);
  const lastUpdatedAt = stockRows.reduce<string | null>((latest, row) => {
    const current = String(row.updated_at ?? "").trim();
    if (!current) return latest;
    if (!latest) return current;
    return new Date(current).getTime() > new Date(latest).getTime() ? current : latest;
  }, null);
  const withdrawHref = `/inventory/withdraw?loc_id=${encodeURIComponent(location.id)}${location.site_id ? `&site_id=${encodeURIComponent(location.site_id)}` : ""
    }`;
  const zoneHref =
    location.site_id && location.zone
      ? `/inventory/locations/zone?site_id=${encodeURIComponent(location.site_id)}&zone=${encodeURIComponent(location.zone)}`
      : "";

  return (
    <div className={`ui-scene w-full ${isKiosk ? "min-h-screen space-y-4 px-4 py-5" : "space-y-6"}`}>
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            {!isKiosk ? (
              <Link href={`/inventory/locations/${encodeURIComponent(location.id)}`} className="ui-caption underline">
                Volver al area
              </Link>
            ) : null}
            <div className="space-y-2">
              <div className="ui-caption">{isKiosk ? "Modo kiosco" : "Vista del area"}</div>
              <h1 className="ui-h1">{title}</h1>
              <p className="ui-body-muted">
                Vista rapida y visual de lo que hoy contiene esta area. Ideal para tablet o pantalla fija de consulta.
              </p>
            </div>
            {isKiosk ? (
              <div className="flex flex-wrap items-center gap-3">
                <LocationBoardAutoRefresh intervalSeconds={30} />
                <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm text-[var(--ui-muted)] shadow-sm">
                  Ultima actualizacion: <span className="font-semibold text-[var(--ui-text)]">{formatDateTime(lastUpdatedAt)}</span>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {site?.name ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                  {site.name}
                </span>
              ) : null}
              {location.zone ? (
                <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                  Zona {location.zone}
                </span>
              ) : null}
              {location.code ? (
                <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                  {location.code}
                </span>
              ) : null}
            </div>
            {!isKiosk ? (
              <div className="flex flex-wrap gap-3">
                <Link href={withdrawHref} className="ui-btn ui-btn--brand">
                  Registrar salida
                </Link>
                <Link
                  href={`/inventory/stock?site_id=${encodeURIComponent(location.site_id ?? "")}&view=by_loc&location_id=${encodeURIComponent(location.id)}`}
                  className="ui-btn ui-btn--ghost"
                >
                  Ver stock tecnico
                </Link>
                <Link
                  href={`/inventory/locations/${encodeURIComponent(location.id)}/board?kiosk=1`}
                  className="ui-btn ui-btn--ghost"
                >
                  Abrir modo kiosco
                </Link>
                {zoneHref ? (
                  <Link href={zoneHref} className="ui-btn ui-btn--ghost">
                    Ver zona
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Productos</div>
              <div className="ui-remission-kpi-value">{stockItems.length}</div>
              <div className="ui-remission-kpi-note">
                {searchQuery ? `Filtrados de ${allStockItems.length}` : "Activos en esta area"}
              </div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Qty total</div>
              <div className="ui-remission-kpi-value">{formatQty(totalQty)}</div>
              <div className="ui-remission-kpi-note">Suma de cantidades visibles</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Vista</div>
              <div className="ui-remission-kpi-value">{isKiosk ? "Kiosco" : "Board"}</div>
              <div className="ui-remission-kpi-note">Visual y de consulta rapida</div>
            </article>
          </div>
        </div>
      </section>

      {isKiosk && successMessage ? (
        <KioskInlineSuccessAlert message={successMessage} />
      ) : null}

      {positions.length > 0 ? (
        <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="ui-h3">Filtro interno</div>
              <div className="mt-1 ui-body-muted">
                La operacion sigue siendo por LOC. Estos filtros solo cambian la vista del board/quiosco.
              </div>
            </div>
            {!isKiosk ? (
              <Link
                href={`/inventory/locations/${encodeURIComponent(location.id)}/positions`}
                className="ui-btn ui-btn--ghost"
              >
                Administrar detalle
              </Link>
            ) : null}
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-muted)]">
                Zonas generales
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/inventory/locations/${encodeURIComponent(location.id)}/board${isKiosk ? `?kiosk=1&stock_tab=${stockTab}` : ""}`}
                  className={!selectedPosition ? "ui-chip ui-chip--brand" : "ui-chip"}
                >
                  Todo el LOC
                </Link>
                {topLevelPositions.map((position) => (
                  <Link
                    key={position.id}
                    href={`/inventory/locations/${encodeURIComponent(location.id)}/board?position_id=${encodeURIComponent(position.id)}${isKiosk ? `&kiosk=1&stock_tab=${stockTab}` : ""}`}
                    className={selectedRootPosition?.id === position.id ? "ui-chip ui-chip--brand" : "ui-chip"}
                  >
                    {position.name}
                  </Link>
                ))}
              </div>
            </div>

            {selectedRootPosition && (childrenByParentId.get(selectedRootPosition.id) ?? []).length > 0 ? (
              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ui-muted)]">
                    {positionKindLabel(selectedRootPosition)} seleccionada
                  </div>
                  <div className="text-sm font-semibold text-[var(--ui-text)]">{selectedRootPosition.name}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/inventory/locations/${encodeURIComponent(location.id)}/board?position_id=${encodeURIComponent(selectedRootPosition.id)}${isKiosk ? `&kiosk=1&stock_tab=${stockTab}` : ""}`}
                    className={selectedPosition?.id === selectedRootPosition.id ? "ui-chip ui-chip--brand" : "ui-chip"}
                  >
                    Todo {selectedRootPosition.name}
                  </Link>
                  {(childrenByParentId.get(selectedRootPosition.id) ?? []).map((position) => (
                    <Link
                      key={position.id}
                      href={`/inventory/locations/${encodeURIComponent(location.id)}/board?position_id=${encodeURIComponent(position.id)}${isKiosk ? "&kiosk=1" : ""}`}
                      className={selectedPosition?.id === position.id ? "ui-chip ui-chip--brand" : "ui-chip"}
                    >
                      {position.name}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {allStockItems.length > 0 ? (
        <KioskBoardStockView
          key={`${isKiosk ? "kiosk" : "board"}:${positionId}:${viewMode}:${stockTab}:${searchQuery}`}
          items={stockItems}
          isKiosk={isKiosk}
          locationId={location.id}
          positionId={positionId}
          initialViewMode={viewMode}
          initialSearchQuery={searchQuery}
          totalItemsCount={allStockItems.length}
          hideZeroStockAction={hideZeroStockProductFromBoard}
        />
      ) : (
        <div className={`ui-panel ui-remission-section text-center ${isKiosk ? "min-h-[45vh] flex flex-col items-center justify-center" : ""}`}>
          <div className="ui-h3">Area sin contenido visible</div>
          <p className="mt-2 ui-body-muted">
            Todavia no hay stock positivo cargado en esta ubicacion.
          </p>
        </div>
      )}
    </div>
  );
}
