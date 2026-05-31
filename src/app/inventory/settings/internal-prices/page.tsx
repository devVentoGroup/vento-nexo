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

type ProductUomProfileRow = {
  id: string;
  product_id: string | null;
  label: string | null;
  input_unit_code: string | null;
  qty_in_input_unit: number | null;
  qty_in_stock_unit: number | null;
  is_default: boolean | null;
  is_active: boolean | null;
  source: string | null;
  usage_context: string | null;
};

type ProductSiteSettingRow = {
  product_id: string | null;
  site_id: string | null;
  is_active: boolean | null;
  remission_enabled: boolean | null;
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
  uom_profile_id: string | null;
  pricing_label: string | null;
  pricing_input_unit_code: string | null;
  pricing_qty_in_input_unit: number | null;
  pricing_qty_in_stock_unit: number | null;
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

function formatQty(value: number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 3,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function normalizeUnitCodeLocal(value: string | null | undefined) {
  return String(value ?? "").trim() || "un";
}

function rankUomProfile(profile: ProductUomProfileRow) {
  let score = 0;
  const usageContext = String(profile.usage_context ?? "").trim().toLowerCase();
  const source = String(profile.source ?? "").trim().toLowerCase();

  if (usageContext === "remission") score += 100;
  if (profile.is_default) score += 50;
  if (source === "manual") score += 20;
  if (source === "recipe_portion") score += 10;

  return score;
}

function buildProductPriceOptionValue(productId: string, uomProfileId?: string | null) {
  return `${productId}|${uomProfileId ?? ""}`;
}

function parseProductPriceOption(value: string) {
  const [productId = "", uomProfileId = ""] = value.split("|");

  return {
    productId: productId.trim(),
    uomProfileId: uomProfileId.trim(),
  };
}

function buildPresentationEquivalenceLabel(params: {
  label?: string | null;
  inputUnitCode?: string | null;
  qtyInInputUnit?: number | null;
  stockUnitCode?: string | null;
  qtyInStockUnit?: number | null;
}) {
  const label = String(params.label ?? "").trim();
  const inputUnitCode = String(params.inputUnitCode ?? "").trim();
  const stockUnitCode = String(params.stockUnitCode ?? "").trim();
  const qtyInInputUnit = Number(params.qtyInInputUnit ?? 0);
  const qtyInStockUnit = Number(params.qtyInStockUnit ?? 0);

  const presentation = label || inputUnitCode || "Presentación";

  if (qtyInInputUnit > 0 && qtyInStockUnit > 0 && stockUnitCode) {
    return `${presentation} · ${formatQty(qtyInInputUnit)} ${inputUnitCode || "un"} = ${formatQty(qtyInStockUnit)} ${stockUnitCode}`;
  }

  return presentation;
}

function presentationShortLabel(params: {
  label?: string | null;
  inputUnitCode?: string | null;
}) {
  const label = String(params.label ?? "").trim();
  const inputUnitCode = String(params.inputUnitCode ?? "").trim();

  if (label && inputUnitCode && label !== inputUnitCode) {
    return `${label} (${inputUnitCode})`;
  }

  return label || inputUnitCode || "Sin presentación";
}

function isPresentationUnitCode(value: string | null | undefined) {
  const normalized = normalizeUnitCodeLocal(value).toLowerCase();

  return ["un", "und", "unidad", "unid", "u"].includes(normalized);
}

function isManualPhysicalPresentation(profile: ProductUomProfileRow) {
  const source = String(profile.source ?? "").trim().toLowerCase();
  const label = normalizeLabel(profile.label);
  const inputUnitCode = String(profile.input_unit_code ?? "").trim();
  const qtyInInputUnit = Number(profile.qty_in_input_unit ?? 0);
  const qtyInStockUnit = Number(profile.qty_in_stock_unit ?? 0);
  const usageContext = String(profile.usage_context ?? "").trim().toLowerCase();

  if (profile.is_active === false) return false;
  if (source !== "manual") return false;
  if (!label) return false;
  if (label.includes("unidad operativa")) return false;
  if (label.includes("costo")) return false;
  if (["purchase", "compra", "operation", "operacion", "operational", "stock", "base"].includes(usageContext)) {
    return false;
  }
  if (!isPresentationUnitCode(inputUnitCode)) return false;
  if (!Number.isFinite(qtyInInputUnit) || qtyInInputUnit <= 0) return false;
  if (!Number.isFinite(qtyInStockUnit) || qtyInStockUnit <= 0) return false;

  return true;
}

function resolveBuyerSiteId(params: {
  priceList: InternalPriceListRow | null;
  costCentersById: Map<string, CostCenterRow>;
}) {
  const directSiteId = String(params.priceList?.buyer_site_id ?? "").trim();
  if (directSiteId) return directSiteId;

  const buyerCostCenterId = String(params.priceList?.buyer_cost_center_id ?? "").trim();
  const buyerCostCenter = buyerCostCenterId
    ? params.costCentersById.get(buyerCostCenterId)
    : null;

  return String(buyerCostCenter?.site_id ?? "").trim();
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

function productLabel(row: ProductRow | null | undefined) {
  if (!row) return "Producto no encontrado";
  const sku = row.sku ? ` · ${row.sku}` : "";
  const unit = row.stock_unit_code || row.unit ? ` · ${row.stock_unit_code ?? row.unit}` : "";
  return `${row.name ?? row.id}${sku}${unit}`;
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

  if (buyerCostCenterId && buyerCostCenterId === sellerCostCenterId) {
    redirect(buildReturnUrl({ error: "El comprador no puede ser el mismo centro de costo vendedor." }));
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
  const productOption = asText(formData.get("product_option"));
  const { productId, uomProfileId } = parseProductPriceOption(productOption);
  const unitPrice = parseNonNegativeNumber(formData.get("unit_price"));
  let unitCode = "";

  if (!priceListId) {
    redirect(buildReturnUrl({ error: "Selecciona una lista.", listId: priceListId }));
  }

  if (!productId) {
    redirect(buildReturnUrl({ error: "Selecciona un producto y presentación.", listId: priceListId }));
  }

  if (uomProfileId) {
    const { data: profile, error: profileError } = await supabase
      .from("product_uom_profiles")
      .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_active")
      .eq("id", uomProfileId)
      .maybeSingle();

    if (profileError || !profile) {
      redirect(
        buildReturnUrl({
          error: profileError?.message ?? "La presentación seleccionada no existe.",
          listId: priceListId,
        })
      );
    }

    if (String(profile.product_id ?? "") !== productId || profile.is_active === false) {
      redirect(
        buildReturnUrl({
          error: "La presentación seleccionada no pertenece al producto o está inactiva.",
          listId: priceListId,
        })
      );
    }

    unitCode = normalizeUnitCodeLocal(profile.input_unit_code);
  } else {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id,unit,stock_unit_code")
      .eq("id", productId)
      .maybeSingle();

    if (productError || !product) {
      redirect(
        buildReturnUrl({
          error: productError?.message ?? "El producto seleccionado no existe.",
          listId: priceListId,
        })
      );
    }

    unitCode = normalizeUnitCodeLocal(product.stock_unit_code ?? product.unit);
  }

  if (!unitCode) {
    redirect(
      buildReturnUrl({
        error: "Selecciona una presentación válida para el precio interno.",
        listId: priceListId,
      })
    );
  }

  if (unitPrice === null) {
    redirect(buildReturnUrl({ error: "El precio interno debe ser mayor o igual a 0.", listId: priceListId }));
  }

  const insertPayload: {
    price_list_id: string;
    product_id: string;
    unit_price: number;
    unit_code: string;
    uom_profile_id: string | null;
    pricing_label?: string | null;
    pricing_input_unit_code?: string | null;
    pricing_qty_in_input_unit?: number | null;
    pricing_qty_in_stock_unit?: number | null;
    is_active: boolean;
  } = {
    price_list_id: priceListId,
    product_id: productId,
    unit_price: unitPrice,
    unit_code: unitCode,
    uom_profile_id: uomProfileId || null,
    is_active: true,
  };

  if (uomProfileId) {
    const { data: profileSnapshot } = await supabase
      .from("product_uom_profiles")
      .select("label,input_unit_code,qty_in_input_unit,qty_in_stock_unit")
      .eq("id", uomProfileId)
      .maybeSingle();

    insertPayload.pricing_label = profileSnapshot?.label ?? null;
    insertPayload.pricing_input_unit_code = profileSnapshot?.input_unit_code ?? unitCode;
    insertPayload.pricing_qty_in_input_unit = profileSnapshot?.qty_in_input_unit ?? null;
    insertPayload.pricing_qty_in_stock_unit = profileSnapshot?.qty_in_stock_unit ?? null;
  }

  const { error } = await supabase.from("internal_price_list_items").insert(insertPayload);

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

  if (unitPrice === null) {
    redirect(buildReturnUrl({ error: "El precio interno debe ser mayor o igual a 0.", listId: priceListId }));
  }

  const payload: {
    unit_price: number;
    updated_at: string;
    unit_code?: string;
  } = {
    unit_price: unitPrice,
    updated_at: new Date().toISOString(),
  };

  if (unitCode) {
    payload.unit_code = unitCode;
  }

  const { error } = await supabase
    .from("internal_price_list_items")
    .update(payload)
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
    { data: productsData },
    { data: productUomProfilesData },
    { data: productSiteSettingsData },
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
    supabase
      .from("products")
      .select("id,name,sku,unit,stock_unit_code,product_type,is_active")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(1500),
    supabase
      .from("product_uom_profiles")
      .select(
        "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
      )
      .eq("is_active", true)
      .eq("source", "manual")
      .order("label", { ascending: true })
      .limit(5000),
    supabase
      .from("product_site_settings")
      .select("product_id,site_id,is_active,remission_enabled")
      .eq("is_active", true)
      .eq("remission_enabled", true)
      .limit(10000),
  ]);

  const costCenters = (costCentersData ?? []) as CostCenterRow[];
  const sites = (sitesData ?? []) as SiteRow[];
  const priceLists = (priceListsData ?? []) as InternalPriceListRow[];
  const products = (productsData ?? []) as ProductRow[];
  const productUomProfiles = (productUomProfilesData ?? []) as ProductUomProfileRow[];
  const productSiteSettings = (productSiteSettingsData ?? []) as ProductSiteSettingRow[];

  const costCentersById = new Map(costCenters.map((row) => [row.id, row]));
  const sitesById = new Map(sites.map((row) => [row.id, row]));
  const productsById = new Map(products.map((row) => [row.id, row]));

  const profilesByProductId = new Map<string, ProductUomProfileRow[]>();

  for (const profile of productUomProfiles) {
    const productId = String(profile.product_id ?? "").trim();
    if (!productId || !productsById.has(productId)) continue;
    if (!isManualPhysicalPresentation(profile)) continue;

    const current = profilesByProductId.get(productId) ?? [];
    current.push(profile);
    profilesByProductId.set(productId, current);
  }

  for (const [productId, profiles] of profilesByProductId) {
    profilesByProductId.set(
      productId,
      [...profiles].sort((a, b) => {
        const rankDiff = rankUomProfile(b) - rankUomProfile(a);
        if (rankDiff !== 0) return rankDiff;
        return String(a.label ?? "").localeCompare(String(b.label ?? ""), "es");
      })
    );
  }

  const operationalSites = sites.filter((site) => !isDemoSite(site));
  const operationalCostCenters = costCenters.filter(
    (row) => !isDemoCostCenter(row, sitesById)
  );

  const activePriceLists = priceLists.filter((row) => row.is_active);
  const selectedListId = String(sp.list_id ?? priceLists[0]?.id ?? "").trim();
  const selectedPriceList =
    priceLists.find((row) => row.id === selectedListId) ?? priceLists[0] ?? null;

  const { data: priceItemsData } = selectedPriceList
    ? await supabase
        .from("internal_price_list_items")
        .select("id,price_list_id,product_id,unit_price,unit_code,uom_profile_id,pricing_label,pricing_input_unit_code,pricing_qty_in_input_unit,pricing_qty_in_stock_unit,is_active,created_at,updated_at")
        .eq("price_list_id", selectedPriceList.id)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false })
    : { data: [] };

  const priceItems = (priceItemsData ?? []) as InternalPriceListItemRow[];
  const activeItems = priceItems.filter((row) => row.is_active);
  const inactiveItems = priceItems.filter((row) => !row.is_active);

  const selectedBuyerSiteId = resolveBuyerSiteId({
    priceList: selectedPriceList,
    costCentersById,
  });
  const remissionProductIdsForBuyerSite = new Set(
    productSiteSettings
      .filter((row) => String(row.site_id ?? "").trim() === selectedBuyerSiteId)
      .map((row) => String(row.product_id ?? "").trim())
      .filter(Boolean)
  );
  const existingActiveProductProfileKeys = new Set(
    activeItems.map((item) => `${item.product_id}|${item.uom_profile_id ?? ""}`)
  );
  const productsMissingManualPresentation = selectedBuyerSiteId
    ? products
        .filter((product) => remissionProductIdsForBuyerSite.has(product.id))
        .filter((product) => (profilesByProductId.get(product.id) ?? []).length === 0)
    : [];
  const productPriceOptions = selectedBuyerSiteId
    ? products
        .filter((product) => remissionProductIdsForBuyerSite.has(product.id))
        .flatMap((product) => {
          const profiles = profilesByProductId.get(product.id) ?? [];

          return profiles
            .map((profile) => ({
              key: `${product.id}:${profile.id}`,
              value: buildProductPriceOptionValue(product.id, profile.id),
              label: `${product.name ?? product.id} — ${buildPresentationEquivalenceLabel({
                label: profile.label,
                inputUnitCode: profile.input_unit_code,
                qtyInInputUnit: profile.qty_in_input_unit,
                qtyInStockUnit: profile.qty_in_stock_unit,
                stockUnitCode: product.stock_unit_code ?? product.unit,
              })}`,
            }))
            .filter((option) => !existingActiveProductProfileKeys.has(option.value));
        })
    : [];

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
      <section className="relative overflow-hidden rounded-[2rem] border border-[var(--ui-border)] bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.10),transparent_28%),linear-gradient(135deg,#ffffff_0%,#fbfdff_60%,#fffaf0_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="pointer-events-none absolute left-1/3 -bottom-24 h-48 w-48 rounded-full bg-sky-200/25 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Centro de costos
              </span>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                Precios por presentación
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                Remisiones valorizadas
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-[var(--ui-text)]">
              Precios internos
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ui-muted)]">
              Administra listas de precios para transferencias internas entre centros de costo.
              Cada precio se amarra a una presentación real del producto para que NEXO pueda valorizar remisiones cerradas sin unidades libres ni ambigüedades.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/inventory/cost-center" className="ui-btn ui-btn--ghost bg-white/80 shadow-sm">
              Centros de costo
            </Link>
            <Link href="/inventory/settings/remissions" className="ui-btn ui-btn--ghost bg-white/80 shadow-sm">
              Configuración de remisiones
            </Link>
            <Link href="/inventory/remissions" className="ui-btn ui-btn--ghost bg-white/80 shadow-sm">
              Ir a remisiones
            </Link>
          </div>
        </div>

        <div className="relative mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-amber-400 bg-white/90 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Listas activas</div>
            <div className="mt-2 text-3xl font-bold text-[var(--ui-text)]">{activePriceLists.length}</div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">{priceLists.length} listas totales</div>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-sky-500 bg-white/90 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">Lista seleccionada</div>
            <div className="mt-2 line-clamp-2 text-sm font-bold text-[var(--ui-text)]">
              {selectedPriceList?.name ?? "Sin lista seleccionada"}
            </div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">
              {selectedPriceList?.is_active ? "Activa" : selectedPriceList ? "Inactiva" : "Sin estado"}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-emerald-500 bg-white/90 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Productos activos</div>
            <div className="mt-2 text-3xl font-bold text-[var(--ui-text)]">{activeItems.length}</div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">{inactiveItems.length} desactivados</div>
          </div>
        </div>
      </section>

      {errorMsg ? <div className="mt-6 ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div> : null}

      {!canManage ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          Puedes ver precios internos, pero no tienes permiso para gestionarlos.
        </div>
      ) : null}

      <div className="mt-6 rounded-[1.75rem] border border-[var(--ui-border)] bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.09),transparent_28%),linear-gradient(135deg,#ffffff_0%,#fbfdff_72%,#fffaf0_100%)] p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-[var(--ui-text)]">Cómo configurarlo</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Crea una lista por cada satélite que compra al centro de producción. No uses App Review
              para operación real.
            </p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            Centro de Producción → Satélite
          </span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-amber-400 bg-white/95 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">1. Vendedor</div>
            <div className="mt-2 text-sm font-bold text-[var(--ui-text)]">
              Centro de Producción
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
              Es quien produce o despacha internamente.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-sky-500 bg-white/95 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">2. Comprador</div>
            <div className="mt-2 text-sm font-bold text-[var(--ui-text)]">
              Molka, Saudo o Vento Café
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
              Es el centro de costo que recibirá y pagará la remisión interna.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-emerald-500 bg-white/95 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">3. Sede compradora</div>
            <div className="mt-2 text-sm font-bold text-[var(--ui-text)]">
              Usa la misma sede del comprador
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
              Esto ayuda a que NEXO encuentre la lista correcta al valorizar remisiones.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/70 to-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Modelo</div>
          <div className="mt-2 text-sm font-bold text-[var(--ui-text)]">
            Precio por presentación
          </div>
          <div className="mt-1 text-xs text-[var(--ui-muted)]">
            Evita unidades libres y conserva equivalencia operativa.
          </div>
        </div>

        <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50/70 to-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">Valorización</div>
          <div className="mt-2 text-sm font-bold text-[var(--ui-text)]">
            Remisiones cerradas
          </div>
          <div className="mt-1 text-xs text-[var(--ui-muted)]">
            Congela el precio interno vigente al cerrar operación.
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 to-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Compatibilidad</div>
          <div className="mt-2 text-sm font-bold text-[var(--ui-text)]">
            Legacy controlado
          </div>
          <div className="mt-1 text-xs text-[var(--ui-muted)]">
            Ítems antiguos se muestran como unidad legacy hasta migrarlos.
          </div>
        </div>
      </div>

      {canManage ? (
        <div className="mt-6 rounded-[1.75rem] border border-amber-200/80 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.10),transparent_24%),linear-gradient(135deg,#ffffff_0%,#ffffff_68%,#fffaf0_100%)] p-5 shadow-sm">
          <div className="text-lg font-bold text-[var(--ui-text)]">Crear lista de precios internos</div>
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
        <div className="rounded-[1.75rem] border border-sky-200/70 bg-[linear-gradient(135deg,#ffffff_0%,#f8fcff_100%)] p-5 shadow-sm">
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
                        ? "rounded-2xl border border-amber-300 bg-[linear-gradient(135deg,#fffaf0_0%,#ffffff_100%)] p-4 shadow-sm"
                        : "rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm"
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

        <div className="rounded-[1.75rem] border border-amber-200/80 bg-white p-5 shadow-sm">
          {selectedPriceList ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="ui-h3">{selectedPriceList.name}</div>
                  <p className="mt-1 text-sm text-[var(--ui-muted)]">
                    Define el precio interno por presentación. Este valor se congelará al valorizar remisiones cerradas.
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
                <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-amber-400 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Vendedor</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
                    {costCenterLabel(
                      costCentersById.get(selectedPriceList.seller_cost_center_id),
                      sitesById
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-sky-500 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">Comprador</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
                    {selectedPriceList.buyer_cost_center_id
                      ? costCenterLabel(
                          costCentersById.get(selectedPriceList.buyer_cost_center_id),
                          sitesById
                        )
                      : selectedPriceList.buyer_site_id
                        ? sitesById.get(selectedPriceList.buyer_site_id)?.name ?? "Sede sin nombre"
                        : "General"}
                    {selectedBuyerSiteId ? (
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        Sede filtro: {sitesById.get(selectedBuyerSiteId)?.name ?? selectedBuyerSiteId}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Vigencia</div>
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

              {canManage ? (
                <form
                  action={addInternalPriceListItem}
                  className="mt-6 rounded-2xl border border-amber-200/80 bg-[linear-gradient(135deg,#fffaf0_0%,#ffffff_72%,#f8fcff_100%)] p-4 shadow-sm"
                >
                  <input type="hidden" name="price_list_id" value={selectedPriceList.id} />
                  <div className="ui-h3">Agregar producto</div>

                  {!selectedBuyerSiteId ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Para listar productos, esta lista necesita sede compradora o un centro comprador asociado a sede.
                    </div>
                  ) : null}

                  {selectedBuyerSiteId && productPriceOptions.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      No hay productos disponibles para agregar. Revisa que estén habilitados para remisión en la sede compradora y que tengan presentación física manual activa.
                    </div>
                  ) : null}

                  {productsMissingManualPresentation.length ? (
                    <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3 text-xs text-[var(--ui-muted)]">
                      {productsMissingManualPresentation.length} producto(s) remisionables no aparecen porque les falta presentación física manual.
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_170px_auto]">
                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Producto y presentación</span>
                      <select
                        name="product_option"
                        className="ui-input"
                        required
                        disabled={!selectedBuyerSiteId || productPriceOptions.length === 0}
                      >
                        <option value="">Seleccionar producto y presentación</option>
                        {productPriceOptions.map((option) => (
                          <option key={option.key} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-[var(--ui-muted)]">
                        Solo aparecen productos habilitados para remisión en la sede compradora y presentaciones físicas manuales activas.
                      </span>
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
                      <button
                        type="submit"
                        className="ui-btn ui-btn--brand"
                        disabled={!selectedBuyerSiteId || productPriceOptions.length === 0}
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}

              <div className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-[var(--ui-text)]">Productos de la lista</div>
                    <p className="mt-1 text-xs text-[var(--ui-muted)]">
                      Revisa presentación, equivalencia y precio interno por cada producto.
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
                    {priceItems.length} item(s)
                  </span>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--ui-border)] shadow-sm">
                  <table className="min-w-full divide-y divide-[var(--ui-border)] text-sm">
                    <thead className="bg-[linear-gradient(90deg,#fff7e6_0%,#f8fcff_100%)]">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                          Producto
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                          Presentación
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

                    <tbody className="divide-y divide-[var(--ui-border)] bg-white">
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
                                <div className="text-sm font-medium text-[var(--ui-text)]">
                                  {presentationShortLabel({
                                    label: item.pricing_label,
                                    inputUnitCode: item.pricing_input_unit_code ?? item.unit_code,
                                  })}
                                </div>
                                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                                  {item.pricing_qty_in_input_unit && item.pricing_qty_in_stock_unit
                                    ? `${formatQty(item.pricing_qty_in_input_unit)} ${item.pricing_input_unit_code ?? item.unit_code} = ${formatQty(item.pricing_qty_in_stock_unit)} ${product?.stock_unit_code ?? product?.unit ?? item.unit_code}`
                                    : `Unidad legacy: ${item.unit_code}`}
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
                                      type="hidden"
                                      name="unit_code"
                                      value={item.unit_code || item.pricing_input_unit_code || ""}
                                    />
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
