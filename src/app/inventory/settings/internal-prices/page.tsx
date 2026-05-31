import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { safeDecodeURIComponent } from "@/lib/url";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const VIEW_PERMISSION = "internal_prices.view";
const MANAGE_PERMISSION = "internal_prices.manage";
const PAGE_PATH = "/inventory/settings/internal-prices";

type SearchParams = {
  ok?: string;
  error?: string;
  list_id?: string;
};

type CostCenterRow = {
  id: string;
  site_id: string | null;
  name: string | null;
  code: string | null;
  type: string | null;
  is_active: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_type: string | null;
  is_active: boolean | null;
};

type ProductSiteRow = {
  product_id: string;
  is_active: boolean | null;
  default_area_kind: string | null;
  area_kinds?: string[] | null;
  audience?: string | null;
  remission_enabled?: boolean | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type ProductProfileWithProduct = {
  product_id: string;
  inventory_kind: string | null;
  products: ProductRow | null;
};

type ProductUomProfileRow = {
  id: string;
  product_id: string;
  label: string | null;
  input_unit_code: string | null;
  qty_in_input_unit: number | null;
  qty_in_stock_unit: number | null;
  is_default: boolean | null;
  is_active: boolean | null;
  source: string | null;
  usage_context: string | null;
};

type RemissionPriceProductRow = ProductRow & {
  inventory_kind: string;
  suggested_unit_code: string;
  suggested_unit_label: string;
};
type InternalPriceListRow = {
  id: string;
  name: string;
  seller_cost_center_id: string;
  buyer_cost_center_id: string | null;
  buyer_site_id: string | null;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type InternalPriceListItemRow = {
  id: string;
  price_list_id: string;
  product_id: string;
  unit_price: number;
  unit_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNonNegativeNumber(value: FormDataEntryValue | null) {
  const raw = asText(value).replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function buildReturnUrl(status: { ok?: string; error?: string; listId?: string }) {
  const params = new URLSearchParams();
  if (status.ok) params.set("ok", status.ok);
  if (status.error) params.set("error", status.error);
  if (status.listId) params.set("list_id", status.listId);
  const query = params.toString();
  return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
}

function parseDateAsBogotaStartOfDay(value: FormDataEntryValue | null) {
  const raw = asText(value);
  if (!raw) return null;
  return `${raw}T00:00:00-05:00`;
}


function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: "America/Bogota",
  }).format(parsed);
}

function formatMoney(value: number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function normalizeLabel(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isSameLabel(a: string | null | undefined, b: string | null | undefined) {
  const normalizedA = normalizeLabel(a);
  const normalizedB = normalizeLabel(b);
  return Boolean(normalizedA && normalizedB && normalizedA === normalizedB);
}

function isDemoLabel(value: string | null | undefined) {
  const normalized = normalizeLabel(value);
  return normalized.includes("app review") || normalized.includes("demo");
}

function isDemoSite(row: SiteRow | null | undefined) {
  return isDemoLabel(row?.name);
}

function isDemoCostCenter(row: CostCenterRow, sitesById: Map<string, SiteRow>) {
  const site = row.site_id ? sitesById.get(row.site_id) : null;
  return isDemoLabel(row.name) || isDemoLabel(row.code) || isDemoSite(site);
}

function isProductionCostCenter(row: CostCenterRow, sitesById: Map<string, SiteRow>) {
  const site = row.site_id ? sitesById.get(row.site_id) : null;
  return row.type === "production_center" || site?.site_type === "production_center";
}

function isSatelliteCostCenter(row: CostCenterRow, sitesById: Map<string, SiteRow>) {
  const site = row.site_id ? sitesById.get(row.site_id) : null;
  return row.type === "satellite" || site?.site_type === "satellite";
}

function costCenterLabel(row: CostCenterRow | null | undefined, sitesById: Map<string, SiteRow>) {
  if (!row) return "Sin centro de costo";
  const siteName = row.site_id ? sitesById.get(row.site_id)?.name : "";
  const centerName = String(row.name ?? "").trim();
  const fallbackName = String(siteName ?? "").trim();
  const mainName = centerName || fallbackName || "Centro de costo sin nombre";

  if (siteName && !isSameLabel(mainName, siteName)) {
    return `${mainName} · ${siteName}`;
  }

  return mainName;
}


function normalizeUnitCodeLocal(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || "un";
}

function supportsRemission(row: ProductSiteRow): boolean {
  return row.remission_enabled !== false;
}

function isAssetOrEquipmentProduct(row: ProductRow | null | undefined) {
  const normalizedType = normalizeLabel(row?.product_type);
  return (
    normalizedType.includes("asset") ||
    normalizedType.includes("activo") ||
    normalizedType.includes("equipment") ||
    normalizedType.includes("equipo")
  );
}

function operationalKindLabel(kind: string | null | undefined) {
  const value = String(kind ?? "").trim();
  switch (value) {
    case "ingredient":
      return "Insumos";
    case "finished":
      return "Preparaciones";
    case "resale":
      return "Productos";
    case "packaging":
      return "Empaques";
    default:
      return "Otros remisionables";
  }
}

function operationalKindRank(kind: string | null | undefined) {
  const value = String(kind ?? "").trim();
  if (value === "finished") return 1;
  if (value === "resale") return 2;
  if (value === "ingredient") return 3;
  if (value === "packaging") return 4;
  return 9;
}

function rankUomProfile(row: ProductUomProfileRow): number {
  const usageContext = normalizeLabel(row.usage_context);
  const label = normalizeLabel(row.label);
  let rank = 0;

  if (row.is_active !== false) rank += 100;
  if (row.is_default === true) rank += 50;
  if (usageContext === "remission" || usageContext === "remisiones") rank += 30;
  if (usageContext === "general") rank += 10;
  if (label.includes("remision")) rank += 10;
  if (row.input_unit_code) rank += 5;

  return rank;
}

function pickSuggestedUnit(product: ProductRow, profiles: ProductUomProfileRow[]) {
  const sortedProfiles = [...profiles]
    .filter((profile) => profile.is_active !== false)
    .sort((a, b) => rankUomProfile(b) - rankUomProfile(a));

  const selectedProfile = sortedProfiles[0] ?? null;
  const unitCode = normalizeUnitCodeLocal(
    selectedProfile?.input_unit_code ?? product.stock_unit_code ?? product.unit ?? "un"
  );
  const label = String(selectedProfile?.label ?? unitCode).trim() || unitCode;

  return {
    unitCode,
    label,
  };
}

async function loadProductSiteRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  siteId: string
): Promise<ProductSiteRow[]> {
  const withAudience = await supabase
    .from("product_site_settings")
    .select("product_id,is_active,default_area_kind,area_kinds,audience,remission_enabled,updated_at,created_at")
    .eq("site_id", siteId)
    .eq("is_active", true);

  if (!withAudience.error) {
    const rows = (withAudience.data ?? []) as ProductSiteRow[];
    const ordered = [...rows].sort((a, b) => {
      const aTs = new Date(String(a.updated_at ?? a.created_at ?? "")).getTime();
      const bTs = new Date(String(b.updated_at ?? b.created_at ?? "")).getTime();
      const safeA = Number.isFinite(aTs) ? aTs : 0;
      const safeB = Number.isFinite(bTs) ? bTs : 0;
      return safeB - safeA;
    });
    const byProduct = new Map<string, ProductSiteRow>();
    for (const row of ordered) {
      if (!row.product_id || byProduct.has(row.product_id)) continue;
      byProduct.set(row.product_id, row);
    }
    return Array.from(byProduct.values());
  }

  const fallback = await supabase
    .from("product_site_settings")
    .select("product_id,is_active,default_area_kind,area_kinds,updated_at,created_at")
    .eq("site_id", siteId)
    .eq("is_active", true);

  const legacyRows = (fallback.data ?? []) as ProductSiteRow[];
  const orderedLegacy = [...legacyRows].sort((a, b) => {
    const aTs = new Date(String(a.updated_at ?? a.created_at ?? "")).getTime();
    const bTs = new Date(String(b.updated_at ?? b.created_at ?? "")).getTime();
    const safeA = Number.isFinite(aTs) ? aTs : 0;
    const safeB = Number.isFinite(bTs) ? bTs : 0;
    return safeB - safeA;
  });
  const byProduct = new Map<string, ProductSiteRow>();
  for (const row of orderedLegacy) {
    if (!row.product_id || byProduct.has(row.product_id)) continue;
    byProduct.set(row.product_id, {
      ...row,
      audience: null,
      remission_enabled: null,
    });
  }
  return Array.from(byProduct.values());
}

async function loadRemittableProductsForSite(
  supabase: Awaited<ReturnType<typeof createClient>>,
  siteId: string
): Promise<{ products: RemissionPriceProductRow[]; hasConfig: boolean }> {
  const productSiteRows = await loadProductSiteRows(supabase, siteId);
  const productSiteIds = productSiteRows
    .filter((row) => supportsRemission(row))
    .map((row) => row.product_id)
    .filter(Boolean);

  if (productSiteRows.length === 0 || productSiteIds.length === 0) {
    return { products: [], hasConfig: productSiteRows.length > 0 };
  }

  const profilesQuery = await supabase
    .from("product_inventory_profiles")
    .select("product_id,inventory_kind,products(id,name,sku,unit,stock_unit_code,product_type,is_active)")
    .eq("track_inventory", true)
    .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
    .in("product_id", productSiteIds)
    .order("name", { foreignTable: "products", ascending: true })
    .limit(1500);

  let productRows = ((profilesQuery.data ?? []) as unknown as ProductProfileWithProduct[])
    .map((row) => ({
      product: row.products,
      inventoryKind: String(row.inventory_kind ?? "").trim() || "other",
    }))
    .filter((row): row is { product: ProductRow; inventoryKind: string } => Boolean(row.product));

  if (productRows.length === 0) {
    const { data: fallbackProducts } = await supabase
      .from("products")
      .select("id,name,sku,unit,stock_unit_code,product_type,is_active")
      .eq("is_active", true)
      .in("id", productSiteIds)
      .order("name", { ascending: true })
      .limit(1500);

    productRows = ((fallbackProducts ?? []) as ProductRow[])
      .filter((product) => !isAssetOrEquipmentProduct(product))
      .map((product) => ({
        product,
        inventoryKind: "other",
      }));
  }

  const productIds = productRows.map((row) => row.product.id);
  const { data: uomProfilesData } = productIds.length
    ? await supabase
        .from("product_uom_profiles")
        .select(
          "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
        )
        .in("product_id", productIds)
        .eq("is_active", true)
    : { data: [] as ProductUomProfileRow[] };

  const profilesByProductId = ((uomProfilesData ?? []) as ProductUomProfileRow[]).reduce(
    (acc, row) => {
      const list = acc.get(row.product_id) ?? [];
      list.push(row);
      acc.set(row.product_id, list);
      return acc;
    },
    new Map<string, ProductUomProfileRow[]>()
  );

  const deduped = new Map<string, RemissionPriceProductRow>();
  for (const row of productRows) {
    const product = row.product;
    if (deduped.has(product.id)) continue;
    const suggestedUnit = pickSuggestedUnit(product, profilesByProductId.get(product.id) ?? []);
    deduped.set(product.id, {
      ...product,
      inventory_kind: row.inventoryKind,
      suggested_unit_code: suggestedUnit.unitCode,
      suggested_unit_label: suggestedUnit.label,
    });
  }

  const products = Array.from(deduped.values()).sort((a, b) => {
    const rankDiff = operationalKindRank(a.inventory_kind) - operationalKindRank(b.inventory_kind);
    if (rankDiff !== 0) return rankDiff;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), "es", { sensitivity: "base" });
  });

  return { products, hasConfig: true };
}

function groupProductsByKind(products: RemissionPriceProductRow[]) {
  return products.reduce((acc, product) => {
    const key = String(product.inventory_kind ?? "other").trim() || "other";
    const list = acc.get(key) ?? [];
    list.push(product);
    acc.set(key, list);
    return acc;
  }, new Map<string, RemissionPriceProductRow[]>());
}

async function requireInternalPricesManager() {
  const supabase = await createClient();

  return requireAppAccess({
    appId: APP_ID,
    returnTo: PAGE_PATH,
    supabase,
    permissionCode: MANAGE_PERMISSION,
  });
}

async function createInternalPriceList(formData: FormData) {
  "use server";

  const { supabase, user } = await requireInternalPricesManager();

  const name = asText(formData.get("name"));
  const sellerCostCenterId = asText(formData.get("seller_cost_center_id"));
  const buyerCostCenterId = asText(formData.get("buyer_cost_center_id"));
  const buyerSiteId = asText(formData.get("buyer_site_id"));
  const validFrom = parseDateAsBogotaStartOfDay(formData.get("valid_from"));
  const validTo = parseDateAsBogotaStartOfDay(formData.get("valid_to"));

  if (!name) {
    redirect(buildReturnUrl({ error: "Escribe un nombre para la lista." }));
  }

  if (!sellerCostCenterId) {
    redirect(buildReturnUrl({ error: "Selecciona el centro de costo vendedor." }));
  }

  if (!buyerCostCenterId && !buyerSiteId) {
    redirect(buildReturnUrl({ error: "Selecciona al menos un comprador: centro de costo o sede." }));
  }

  if (validFrom && validTo && new Date(validTo).getTime() <= new Date(validFrom).getTime()) {
    redirect(buildReturnUrl({ error: "La fecha final debe ser posterior a la fecha inicial." }));
  }

  const { data, error } = await supabase
    .from("internal_price_lists")
    .insert({
      name,
      seller_cost_center_id: sellerCostCenterId,
      buyer_cost_center_id: buyerCostCenterId || null,
      buyer_site_id: buyerSiteId || null,
      valid_from: validFrom ?? new Date().toISOString(),
      valid_to: validTo,
      is_active: true,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    redirect(buildReturnUrl({ error: error.message }));
  }

  revalidatePath(PAGE_PATH);
  redirect(buildReturnUrl({ ok: "list_created", listId: String(data.id) }));
}

async function updateInternalPriceListStatus(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalPricesManager();

  const listId = asText(formData.get("list_id"));
  const nextIsActive = asText(formData.get("next_is_active")) === "true";

  if (!listId) {
    redirect(buildReturnUrl({ error: "Lista inválida." }));
  }

  const { error } = await supabase
    .from("internal_price_lists")
    .update({
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listId);

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId }));
  }

  revalidatePath(PAGE_PATH);
  redirect(
    buildReturnUrl({
      ok: nextIsActive ? "list_enabled" : "list_disabled",
      listId,
    })
  );
}

async function addInternalPriceListItem(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalPricesManager();

  const priceListId = asText(formData.get("price_list_id"));
  const productId = asText(formData.get("product_id"));
  const unitCode = asText(formData.get("unit_code"));
  const unitPrice = parseNonNegativeNumber(formData.get("unit_price"));

  if (!priceListId) {
    redirect(buildReturnUrl({ error: "Selecciona una lista.", listId: priceListId }));
  }

  if (!productId) {
    redirect(buildReturnUrl({ error: "Selecciona un producto.", listId: priceListId }));
  }

  if (!unitCode) {
    redirect(buildReturnUrl({ error: "Escribe la unidad del precio interno.", listId: priceListId }));
  }

  if (unitPrice === null || unitPrice <= 0) {
    redirect(buildReturnUrl({ error: "El precio interno debe ser mayor a 0.", listId: priceListId }));
  }

  const { error } = await supabase.from("internal_price_list_items").insert({
    price_list_id: priceListId,
    product_id: productId,
    unit_price: unitPrice,
    unit_code: unitCode,
    is_active: true,
  });

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId: priceListId }));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  redirect(buildReturnUrl({ ok: "item_added", listId: priceListId }));
}

async function updateInternalPriceListItem(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalPricesManager();

  const itemId = asText(formData.get("item_id"));
  const priceListId = asText(formData.get("price_list_id"));
  const unitCode = asText(formData.get("unit_code"));
  const unitPrice = parseNonNegativeNumber(formData.get("unit_price"));

  if (!itemId || !priceListId) {
    redirect(buildReturnUrl({ error: "Ítem inválido.", listId: priceListId }));
  }

  if (!unitCode) {
    redirect(buildReturnUrl({ error: "La unidad no puede estar vacía.", listId: priceListId }));
  }

  if (unitPrice === null || unitPrice <= 0) {
    redirect(buildReturnUrl({ error: "El precio interno debe ser mayor a 0.", listId: priceListId }));
  }

  const { error } = await supabase
    .from("internal_price_list_items")
    .update({
      unit_code: unitCode,
      unit_price: unitPrice,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId: priceListId }));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  redirect(buildReturnUrl({ ok: "item_updated", listId: priceListId }));
}

async function updateInternalPriceListItemStatus(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalPricesManager();

  const itemId = asText(formData.get("item_id"));
  const priceListId = asText(formData.get("price_list_id"));
  const nextIsActive = asText(formData.get("next_is_active")) === "true";

  if (!itemId || !priceListId) {
    redirect(buildReturnUrl({ error: "Ítem inválido.", listId: priceListId }));
  }

  if (nextIsActive) {
    const { data: itemToActivate } = await supabase
      .from("internal_price_list_items")
      .select("unit_price,unit_code")
      .eq("id", itemId)
      .maybeSingle();

    const unitPrice = Number(itemToActivate?.unit_price ?? 0);
    const unitCode = String(itemToActivate?.unit_code ?? "").trim();

    if (!unitCode || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      redirect(
        buildReturnUrl({
          error: "Antes de activar el producto, define una unidad y un precio interno mayor a 0.",
          listId: priceListId,
        })
      );
    }
  }

  const { error } = await supabase
    .from("internal_price_list_items")
    .update({
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId: priceListId }));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  redirect(
    buildReturnUrl({
      ok: nextIsActive ? "item_enabled" : "item_disabled",
      listId: priceListId,
    })
  );
}


async function importMissingRemissionPriceItems(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalPricesManager();

  const priceListId = asText(formData.get("price_list_id"));
  if (!priceListId) {
    redirect(buildReturnUrl({ error: "Selecciona una lista." }));
  }

  const { data: priceList, error: priceListError } = await supabase
    .from("internal_price_lists")
    .select("id,buyer_cost_center_id,buyer_site_id")
    .eq("id", priceListId)
    .maybeSingle();

  if (priceListError || !priceList) {
    redirect(
      buildReturnUrl({
        error: priceListError?.message ?? "La lista no existe.",
        listId: priceListId,
      })
    );
  }

  let buyerSiteId = String(priceList.buyer_site_id ?? "").trim();

  if (!buyerSiteId && priceList.buyer_cost_center_id) {
    const { data: buyerCostCenter } = await supabase
      .from("cost_centers")
      .select("site_id")
      .eq("id", priceList.buyer_cost_center_id)
      .maybeSingle();

    buyerSiteId = String(buyerCostCenter?.site_id ?? "").trim();
  }

  if (!buyerSiteId) {
    redirect(
      buildReturnUrl({
        error: "La lista no tiene sede compradora. Selecciona una sede para poder cargar productos de remisión.",
        listId: priceListId,
      })
    );
  }

  const remittableResult = await loadRemittableProductsForSite(supabase, buyerSiteId);
  if (!remittableResult.products.length) {
    redirect(
      buildReturnUrl({
        error: "No hay productos remisionables configurados para la sede compradora.",
        listId: priceListId,
      })
    );
  }

  const { data: existingItems } = await supabase
    .from("internal_price_list_items")
    .select("product_id")
    .eq("price_list_id", priceListId);

  const existingProductIds = new Set(
    ((existingItems ?? []) as Array<{ product_id: string | null }>)
      .map((row) => String(row.product_id ?? "").trim())
      .filter(Boolean)
  );

  const rows = remittableResult.products
    .filter((product) => !existingProductIds.has(product.id))
    .map((product) => ({
      price_list_id: priceListId,
      product_id: product.id,
      unit_price: 0,
      unit_code: product.suggested_unit_code,
      is_active: false,
    }));

  if (rows.length === 0) {
    redirect(buildReturnUrl({ ok: "import_empty", listId: priceListId }));
  }

  const { error } = await supabase.from("internal_price_list_items").insert(rows);

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId: priceListId }));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  redirect(buildReturnUrl({ ok: "import_added", listId: priceListId }));
}

export default async function InternalPricesSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};

  const okMsg =
    sp.ok === "list_created"
      ? "Lista de precios internos creada."
      : sp.ok === "list_enabled"
        ? "Lista activada."
        : sp.ok === "list_disabled"
          ? "Lista desactivada."
          : sp.ok === "item_added"
            ? "Producto agregado a la lista."
            : sp.ok === "item_updated"
              ? "Precio interno actualizado."
              : sp.ok === "item_enabled"
                ? "Producto activado en la lista."
                : sp.ok === "item_disabled"
                  ? "Producto desactivado en la lista."
                  : sp.ok === "import_added"
                    ? "Productos remisionables cargados como pendientes de precio."
                    : sp.ok === "import_empty"
                      ? "No había productos remisionables nuevos por cargar."
                      : "";

  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: PAGE_PATH,
    permissionCode: VIEW_PERMISSION,
  });

  const canManage = await checkPermission(supabase, APP_ID, MANAGE_PERMISSION);

  const [
    { data: costCentersData },
    { data: sitesData },
    { data: priceListsData },
  ] = await Promise.all([
    supabase
      .from("cost_centers")
      .select("id,site_id,name,code,type,is_active")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("sites")
      .select("id,name,site_type")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("internal_price_lists")
      .select(
        "id,name,seller_cost_center_id,buyer_cost_center_id,buyer_site_id,valid_from,valid_to,is_active,created_by,created_at,updated_at"
      )
      .order("updated_at", { ascending: false }),
  ]);

  const costCenters = (costCentersData ?? []) as CostCenterRow[];
  const sites = (sitesData ?? []) as SiteRow[];
  const priceLists = (priceListsData ?? []) as InternalPriceListRow[];

  const costCentersById = new Map(costCenters.map((row) => [row.id, row]));
  const sitesById = new Map(sites.map((row) => [row.id, row]));

  const operationalSites = sites.filter((site) => !isDemoSite(site));
  const operationalCostCenters = costCenters.filter(
    (row) => !isDemoCostCenter(row, sitesById)
  );

  const activePriceLists = priceLists.filter((row) => row.is_active);
  const selectedListId = String(sp.list_id ?? priceLists[0]?.id ?? "").trim();
  const selectedPriceList =
    priceLists.find((row) => row.id === selectedListId) ?? priceLists[0] ?? null;
  const selectedBuyerCostCenter = selectedPriceList?.buyer_cost_center_id
    ? costCentersById.get(selectedPriceList.buyer_cost_center_id) ?? null
    : null;
  const selectedBuyerSiteId = String(
    selectedPriceList?.buyer_site_id ?? selectedBuyerCostCenter?.site_id ?? ""
  ).trim();
  const selectedBuyerSite = selectedBuyerSiteId ? sitesById.get(selectedBuyerSiteId) ?? null : null;
  const remittableResult = selectedBuyerSiteId
    ? await loadRemittableProductsForSite(supabase, selectedBuyerSiteId)
    : { products: [] as RemissionPriceProductRow[], hasConfig: false };
  const remittableProducts = remittableResult.products;
  const remittableProductsById = new Map(remittableProducts.map((product) => [product.id, product]));

  const { data: priceItemsData } = selectedPriceList
    ? await supabase
        .from("internal_price_list_items")
        .select("id,price_list_id,product_id,unit_price,unit_code,is_active,created_at,updated_at")
        .eq("price_list_id", selectedPriceList.id)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false })
    : { data: [] };

  const priceItems = (priceItemsData ?? []) as InternalPriceListItemRow[];
  const activeItems = priceItems.filter((row) => row.is_active);
  const inactiveItems = priceItems.filter((row) => !row.is_active);
  const pricedProductIds = new Set(
    priceItems.map((row) => String(row.product_id ?? "").trim()).filter(Boolean)
  );
  const extraProductIds = Array.from(pricedProductIds).filter(
    (productId) => !remittableProductsById.has(productId)
  );
  const { data: extraProductsData } = extraProductIds.length
    ? await supabase
        .from("products")
        .select("id,name,sku,unit,stock_unit_code,product_type,is_active")
        .in("id", extraProductIds)
    : { data: [] as ProductRow[] };
  const productsById = new Map<string, ProductRow>();
  for (const product of remittableProducts) {
    productsById.set(product.id, product);
  }
  for (const product of (extraProductsData ?? []) as ProductRow[]) {
    productsById.set(product.id, product);
  }
  const pendingRemissionProducts = remittableProducts.filter(
    (product) => !pricedProductIds.has(product.id)
  );
  const pendingProductsByKind = groupProductsByKind(pendingRemissionProducts);
  const pendingKindEntries = Array.from(pendingProductsByKind.entries()).sort(
    ([a], [b]) => operationalKindRank(a) - operationalKindRank(b)
  );

  const productionCostCenters = operationalCostCenters.filter((row) =>
    isProductionCostCenter(row, sitesById)
  );
  const satelliteBuyerCostCenters = operationalCostCenters.filter((row) =>
    isSatelliteCostCenter(row, sitesById)
  );
  const buyerCostCenters = satelliteBuyerCostCenters.length
    ? satelliteBuyerCostCenters
    : operationalCostCenters.filter((row) => !isProductionCostCenter(row, sitesById));

  const defaultSellerCostCenterId =
    productionCostCenters[0]?.id ?? operationalCostCenters[0]?.id ?? "";
  const defaultBuyerCostCenterId =
    buyerCostCenters.find((row) => row.id !== defaultSellerCostCenterId)?.id ??
    operationalCostCenters.find((row) => row.id !== defaultSellerCostCenterId)?.id ??
    "";

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Precios internos</h1>
          <p className="mt-2 ui-body-muted">
            Administra listas de precios para transferencias internas entre centros de costo.
            Estos valores no son costo real ni precio fiscal al cliente.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/settings/remissions" className="ui-btn ui-btn--ghost">
            Configuración de remisiones
          </Link>
          <Link href="/inventory/remissions" className="ui-btn ui-btn--ghost">
            Ir a remisiones
          </Link>
        </div>
      </div>

      {errorMsg ? <div className="mt-6 ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div> : null}

      {!canManage ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          Puedes ver precios internos, pero no tienes permiso para gestionarlos.
        </div>
      ) : null}

      <div className="mt-6 ui-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ui-h3">Cómo configurarlo</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Crea una lista por cada satélite que compra al centro de producción. No uses App Review
              para operación real.
            </p>
          </div>
          <span className="ui-chip ui-chip--success">Centro de Producción → Satélite</span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
            <div className="ui-caption">1. Vendedor</div>
            <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
              Centro de Producción
            </div>
            <p className="mt-1 text-xs text-[var(--ui-muted)]">
              Es quien produce o despacha internamente.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
            <div className="ui-caption">2. Comprador</div>
            <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
              Molka, Saudo o Vento Café
            </div>
            <p className="mt-1 text-xs text-[var(--ui-muted)]">
              Es el centro de costo que recibirá y pagará la remisión interna.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
            <div className="ui-caption">3. Sede compradora</div>
            <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
              Usa la misma sede del comprador
            </div>
            <p className="mt-1 text-xs text-[var(--ui-muted)]">
              Esto ayuda a que NEXO encuentre la lista correcta al valorizar remisiones.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
          <div className="ui-caption">Listas activas</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
            {activePriceLists.length}
          </div>
          <div className="mt-1 text-xs text-[var(--ui-muted)]">
            {priceLists.length} listas totales
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
          <div className="ui-caption">Lista seleccionada</div>
          <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
            {selectedPriceList?.name ?? "Sin lista seleccionada"}
          </div>
          <div className="mt-1 text-xs text-[var(--ui-muted)]">
            {selectedPriceList?.is_active ? "Activa" : selectedPriceList ? "Inactiva" : "Sin estado"}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
          <div className="ui-caption">Productos en lista</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
            {activeItems.length}
          </div>
          <div className="mt-1 text-xs text-[var(--ui-muted)]">
            {inactiveItems.length} desactivados
          </div>
        </div>
      </div>

      {canManage ? (
        <div className="mt-6 ui-panel">
          <div className="ui-h3">Crear lista de precios internos</div>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Crea una lista por relación interna, por ejemplo Centro de Producción → Molka.
          </p>

          <form action={createInternalPriceList} className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className="ui-label">Nombre de la lista</span>
              <input
                name="name"
                className="ui-input"
                placeholder="Ej. Centro de Producción → Molka"
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Centro de costo vendedor</span>
              <select
                name="seller_cost_center_id"
                className="ui-input"
                defaultValue={defaultSellerCostCenterId}
                required
              >
                <option value="">Seleccionar vendedor</option>
                {(productionCostCenters.length ? productionCostCenters : operationalCostCenters).map((row) => (
                  <option key={row.id} value={row.id}>
                    {costCenterLabel(row, sitesById)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Centro de costo comprador</span>
              <select
                name="buyer_cost_center_id"
                className="ui-input"
                defaultValue={defaultBuyerCostCenterId}
              >
                <option value="">Sin comprador específico</option>
                {buyerCostCenters.map((row) => (
                  <option key={row.id} value={row.id}>
                    {costCenterLabel(row, sitesById)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Sede compradora opcional</span>
              <select name="buyer_site_id" className="ui-input" defaultValue="">
                <option value="">Sin sede específica</option>
                {operationalSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.id}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Vigente desde</span>
                <input name="valid_from" type="date" className="ui-input" />
              </label>

              <label className="flex flex-col gap-1">
                <span className="ui-label">Vigente hasta</span>
                <input name="valid_to" type="date" className="ui-input" />
              </label>
            </div>

            <div className="lg:col-span-2">
              <button type="submit" className="ui-btn ui-btn--brand">
                Crear lista
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="ui-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="ui-h3">Listas creadas</div>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                Selecciona una lista para administrar sus productos.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {priceLists.length ? (
              priceLists.map((list) => {
                const isSelected = selectedPriceList?.id === list.id;
                const seller = costCentersById.get(list.seller_cost_center_id);
                const buyer = list.buyer_cost_center_id
                  ? costCentersById.get(list.buyer_cost_center_id)
                  : null;
                const buyerSite = list.buyer_site_id ? sitesById.get(list.buyer_site_id) : null;

                return (
                  <div
                    key={list.id}
                    className={
                      isSelected
                        ? "rounded-2xl border border-[var(--ui-brand)] bg-[var(--ui-surface-2)] p-4"
                        : "rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`${PAGE_PATH}?list_id=${encodeURIComponent(list.id)}`}
                          className="text-sm font-semibold text-[var(--ui-text)] hover:underline"
                        >
                          {list.name}
                        </Link>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          {costCenterLabel(seller, sitesById)} →{" "}
                          {buyer ? costCenterLabel(buyer, sitesById) : buyerSite?.name ?? "Comprador general"}
                        </div>
                      </div>

                      <span
                        className={
                          list.is_active
                            ? "ui-chip ui-chip--success"
                            : "ui-chip ui-chip--warn"
                        }
                      >
                        {list.is_active ? "Activa" : "Inactiva"}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-[var(--ui-muted)] sm:grid-cols-2">
                      <div>Desde: {formatDate(list.valid_from)}</div>
                      <div>Hasta: {list.valid_to ? formatDate(list.valid_to) : "Sin cierre"}</div>
                    </div>

                    {canManage ? (
                      <form action={updateInternalPriceListStatus} className="mt-3">
                        <input type="hidden" name="list_id" value={list.id} />
                        <input
                          type="hidden"
                          name="next_is_active"
                          value={list.is_active ? "false" : "true"}
                        />
                        <button type="submit" className="ui-btn ui-btn--ghost">
                          {list.is_active ? "Desactivar lista" : "Activar lista"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm text-[var(--ui-muted)]">
                Aún no hay listas de precios internos.
              </div>
            )}
          </div>
        </div>

        <div className="ui-panel">
          {selectedPriceList ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="ui-h3">{selectedPriceList.name}</div>
                  <p className="mt-1 text-sm text-[var(--ui-muted)]">
                    Define el precio interno que se congelará al valorizar remisiones cerradas.
                  </p>
                </div>

                <span
                  className={
                    selectedPriceList.is_active
                      ? "ui-chip ui-chip--success"
                      : "ui-chip ui-chip--warn"
                  }
                >
                  {selectedPriceList.is_active ? "Lista activa" : "Lista inactiva"}
                </span>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                  <div className="ui-caption">Vendedor</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
                    {costCenterLabel(
                      costCentersById.get(selectedPriceList.seller_cost_center_id),
                      sitesById
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                  <div className="ui-caption">Comprador</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
                    {selectedPriceList.buyer_cost_center_id
                      ? costCenterLabel(
                          costCentersById.get(selectedPriceList.buyer_cost_center_id),
                          sitesById
                        )
                      : selectedPriceList.buyer_site_id
                        ? sitesById.get(selectedPriceList.buyer_site_id)?.name ?? "Sede sin nombre"
                        : "General"}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                  <div className="ui-caption">Vigencia</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
                    {formatDate(selectedPriceList.valid_from)}
                  </div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                    {selectedPriceList.valid_to
                      ? `Hasta ${formatDate(selectedPriceList.valid_to)}`
                      : "Sin fecha final"}
                  </div>
                </div>
              </div>

              {selectedBuyerSiteId ? (
                <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="ui-caption">Catálogo remisionable usado para esta lista</div>
                      <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
                        {selectedBuyerSite?.name ?? "Sede compradora sin nombre"}
                      </div>
                      <p className="mt-1 text-xs text-[var(--ui-muted)]">
                        Solo se muestran productos habilitados para remisiones en esta sede. Equipos y activos quedan fuera por defecto.
                      </p>
                    </div>
                    <span className="ui-chip">
                      {remittableProducts.length} remisionables · {pendingRemissionProducts.length} pendientes
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 ui-alert ui-alert--warn">
                  Esta lista no tiene sede compradora asociada. Para cargar productos desde remisiones, crea la lista indicando sede compradora.
                </div>
              )}

              {canManage && selectedBuyerSiteId ? (
                <div className="mt-6 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="ui-h3">Productos remisionables pendientes de precio</div>
                      <p className="mt-1 text-sm text-[var(--ui-muted)]">
                        Esta lista sale de la configuración real de remisiones de la sede compradora.
                        La unidad sugerida viene de las unidades operativas del producto.
                      </p>
                    </div>

                    {pendingRemissionProducts.length ? (
                      <form action={importMissingRemissionPriceItems}>
                        <input type="hidden" name="price_list_id" value={selectedPriceList.id} />
                        <button type="submit" className="ui-btn ui-btn--ghost">
                          Cargar todos como pendientes
                        </button>
                      </form>
                    ) : null}
                  </div>

                  {!remittableResult.hasConfig ? (
                    <div className="mt-4 ui-alert ui-alert--warn">
                      La sede compradora todavía no tiene productos configurados para remisiones.
                    </div>
                  ) : pendingRemissionProducts.length ? (
                    <div className="mt-4 space-y-5">
                      {pendingKindEntries.map(([kind, rows]) => (
                        <div key={kind}>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-[var(--ui-text)]">
                              {operationalKindLabel(kind)}
                            </div>
                            <span className="text-xs text-[var(--ui-muted)]">
                              {rows.length} pendientes
                            </span>
                          </div>

                          <div className="space-y-2">
                            {rows.map((product) => (
                              <form
                                key={product.id}
                                action={addInternalPriceListItem}
                                className="grid gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 lg:grid-cols-[1fr_150px_160px_auto]"
                              >
                                <input type="hidden" name="price_list_id" value={selectedPriceList.id} />
                                <input type="hidden" name="product_id" value={product.id} />

                                <div>
                                  <div className="text-sm font-medium text-[var(--ui-text)]">
                                    {product.name ?? product.id}
                                  </div>
                                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                                    {product.sku ? `SKU ${product.sku}` : "Sin SKU"} · {operationalKindLabel(product.inventory_kind)}
                                  </div>
                                </div>

                                <label className="flex flex-col gap-1">
                                  <span className="ui-label">Unidad</span>
                                  <input
                                    name="unit_code"
                                    className="ui-input"
                                    defaultValue={product.suggested_unit_code}
                                    title={product.suggested_unit_label}
                                    required
                                  />
                                </label>

                                <label className="flex flex-col gap-1">
                                  <span className="ui-label">Precio interno</span>
                                  <input
                                    name="unit_price"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="ui-input"
                                    placeholder="0"
                                    required
                                  />
                                </label>

                                <div className="flex items-end">
                                  <button type="submit" className="ui-btn ui-btn--brand">
                                    Agregar
                                  </button>
                                </div>
                              </form>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4 text-sm text-[var(--ui-muted)]">
                      Todos los productos remisionables de esta sede ya están en la lista.
                    </div>
                  )}
                </div>
              ) : null}

              <div className="mt-6">
                <div className="ui-h3">Productos de la lista</div>

                <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--ui-border)]">
                  <table className="min-w-full divide-y divide-[var(--ui-border)] text-sm">
                    <thead className="bg-[var(--ui-surface-2)]">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                          Producto
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                          Unidad
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                          Precio
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                          Estado
                        </th>
                        {canManage ? (
                          <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                            Acciones
                          </th>
                        ) : null}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[var(--ui-border)] bg-[var(--ui-surface)]">
                      {priceItems.length ? (
                        priceItems.map((item) => {
                          const product = productsById.get(item.product_id);
                          return (
                            <tr key={item.id}>
                              <td className="px-4 py-3 align-top">
                                <div className="font-medium text-[var(--ui-text)]">
                                  {product?.name ?? item.product_id}
                                </div>
                                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                                  {product?.sku ? `SKU ${product.sku}` : "Sin SKU"}
                                </div>
                              </td>

                              <td className="px-4 py-3 align-top">
                                {canManage ? (
                                  <form action={updateInternalPriceListItem} className="flex gap-2">
                                    <input type="hidden" name="item_id" value={item.id} />
                                    <input
                                      type="hidden"
                                      name="price_list_id"
                                      value={selectedPriceList.id}
                                    />
                                    <input
                                      name="unit_code"
                                      className="ui-input w-28"
                                      defaultValue={item.unit_code}
                                      required
                                    />
                                    <input
                                      name="unit_price"
                                      type="hidden"
                                      value={String(item.unit_price)}
                                    />
                                    <button type="submit" className="ui-btn ui-btn--ghost">
                                      Guardar unidad
                                    </button>
                                  </form>
                                ) : (
                                  <span className="text-[var(--ui-text)]">{item.unit_code}</span>
                                )}
                              </td>

                              <td className="px-4 py-3 align-top">
                                {canManage ? (
                                  <form action={updateInternalPriceListItem} className="flex gap-2">
                                    <input type="hidden" name="item_id" value={item.id} />
                                    <input
                                      type="hidden"
                                      name="price_list_id"
                                      value={selectedPriceList.id}
                                    />
                                    <input type="hidden" name="unit_code" value={item.unit_code} />
                                    <input
                                      name="unit_price"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      className="ui-input w-36"
                                      defaultValue={String(item.unit_price)}
                                      required
                                    />
                                    <button type="submit" className="ui-btn ui-btn--ghost">
                                      Guardar precio
                                    </button>
                                  </form>
                                ) : (
                                  <span className="font-semibold text-[var(--ui-text)]">
                                    {formatMoney(item.unit_price)}
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-3 align-top">
                                <span
                                  className={
                                    item.is_active
                                      ? "ui-chip ui-chip--success"
                                      : "ui-chip ui-chip--warn"
                                  }
                                >
                                  {item.is_active ? "Activo" : "Inactivo"}
                                </span>
                              </td>

                              {canManage ? (
                                <td className="px-4 py-3 align-top">
                                  <form action={updateInternalPriceListItemStatus}>
                                    <input type="hidden" name="item_id" value={item.id} />
                                    <input
                                      type="hidden"
                                      name="price_list_id"
                                      value={selectedPriceList.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="next_is_active"
                                      value={item.is_active ? "false" : "true"}
                                    />
                                    <button type="submit" className="ui-btn ui-btn--ghost">
                                      {item.is_active ? "Desactivar" : "Activar"}
                                    </button>
                                  </form>
                                </td>
                              ) : null}
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={canManage ? 5 : 4}
                            className="px-4 py-8 text-center text-[var(--ui-muted)]"
                          >
                            Esta lista aún no tiene productos.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm text-[var(--ui-muted)]">
              Crea una lista para comenzar a cargar precios internos.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
