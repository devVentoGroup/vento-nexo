import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const PAGE_PATH = "/inventory/settings/internal-prices";
export type SearchParams = {
  ok?: string;
  error?: string;
  list_id?: string;
};

export type CostCenterRow = {
  id: string;
  site_id: string | null;
  name: string | null;
  code: string | null;
  type: string | null;
  is_active: boolean | null;
};

export type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

export type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_type: string | null;
  is_active: boolean | null;
};

export type ProductUomProfileRow = {
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

export type ProductSiteSettingRow = {
  product_id: string | null;
  site_id: string | null;
  is_active: boolean | null;
  remission_enabled: boolean | null;
};

export type InternalPriceListRow = {
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

export type InternalPriceListItemRow = {
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
  pricing_method: string | null;
  margin_pct: number | null;
  base_unit_cost: number | null;
  base_cost_source: string | null;
  suggested_unit_price: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseNonNegativeNumber(value: FormDataEntryValue | null) {
  const raw = asText(value).replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function buildReturnUrl(status: { ok?: string; error?: string; listId?: string }) {
  const params = new URLSearchParams();
  if (status.ok) params.set("ok", status.ok);
  if (status.error) params.set("error", status.error);
  if (status.listId) params.set("list_id", status.listId);
  const query = params.toString();
  return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
}


export type PriceComputation = {
  unitPrice: number;
  pricingMethod: "manual" | "cost_plus_margin";
  marginPct: number | null;
  baseUnitCost: number | null;
  baseCostSource: string | null;
  suggestedUnitPrice: number | null;
  formulaSnapshot: Record<string, unknown>;
};

export function parsePricingMethod(value: FormDataEntryValue | null): "manual" | "cost_plus_margin" {
  return asText(value) === "cost_plus_margin" ? "cost_plus_margin" : "manual";
}

export async function computeInternalPrice(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  priceListId: string;
  productId: string;
  uomProfileId: string | null;
  pricingMethod: "manual" | "cost_plus_margin";
  manualUnitPrice: number | null;
  marginPct: number | null;
}): Promise<PriceComputation> {
  if (params.pricingMethod === "manual") {
    if (params.manualUnitPrice === null) {
      redirect(buildReturnUrl({ error: "El precio interno debe ser mayor o igual a 0.", listId: params.priceListId }));
    }

    return {
      unitPrice: params.manualUnitPrice,
      pricingMethod: "manual",
      marginPct: null,
      baseUnitCost: null,
      baseCostSource: null,
      suggestedUnitPrice: null,
      formulaSnapshot: { method: "manual" },
    };
  }

  const marginPct = params.marginPct ?? 0;

  const { data: list, error: listError } = await params.supabase
    .from("internal_price_lists")
    .select("seller_cost_center_id")
    .eq("id", params.priceListId)
    .maybeSingle();

  if (listError || !list) {
    redirect(buildReturnUrl({ error: listError?.message ?? "Lista de precios invalida.", listId: params.priceListId }));
  }

  const estimateInternalPrice = params.supabase.rpc as unknown as (
    fn: "estimate_internal_price_unit",
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await estimateInternalPrice("estimate_internal_price_unit", {
    p_product_id: params.productId,
    p_seller_cost_center_id: list.seller_cost_center_id,
    p_uom_profile_id: params.uomProfileId || null,
    p_margin_pct: marginPct,
  });

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId: params.priceListId }));
  }

  const estimate = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : null;
  const suggestedUnitPrice = Number(estimate?.suggested_unit_price ?? 0);
  const baseUnitCost = Number(estimate?.base_unit_cost ?? 0);
  const baseCostSource = String(estimate?.base_cost_source ?? "none");

  if (!Number.isFinite(suggestedUnitPrice) || suggestedUnitPrice <= 0 || baseCostSource === "none") {
    redirect(buildReturnUrl({ error: "No hay costo base para calcular este precio. Usa precio manual o carga costos primero.", listId: params.priceListId }));
  }

  return {
    unitPrice: suggestedUnitPrice,
    pricingMethod: "cost_plus_margin",
    marginPct,
    baseUnitCost: Number.isFinite(baseUnitCost) ? baseUnitCost : null,
    baseCostSource,
    suggestedUnitPrice,
    formulaSnapshot: {
      method: "cost_plus_margin",
      marginPct,
      baseUnitCost,
      baseCostSource,
      suggestedUnitPrice,
      pricingFactorToStock: estimate?.pricing_factor_to_stock ?? null,
      stockUnitCost: estimate?.stock_unit_cost ?? null,
    },
  };
}
export function parseDateAsBogotaStartOfDay(value: FormDataEntryValue | null) {
  const raw = asText(value);
  if (!raw) return null;
  return `${raw}T00:00:00-05:00`;
}


export function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: "America/Bogota",
  }).format(parsed);
}

export function formatMoney(value: number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

export function formatQty(value: number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 3,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

export function normalizeUnitCodeLocal(value: string | null | undefined) {
  return String(value ?? "").trim() || "un";
}

export function rankUomProfile(profile: ProductUomProfileRow) {
  let score = 0;
  const usageContext = String(profile.usage_context ?? "").trim().toLowerCase();
  const source = String(profile.source ?? "").trim().toLowerCase();

  if (usageContext === "remission") score += 100;
  if (profile.is_default) score += 50;
  if (source === "manual") score += 20;
  if (source === "recipe_portion") score += 10;

  return score;
}

export function buildProductPriceOptionValue(productId: string, uomProfileId?: string | null) {
  return `${productId}|${uomProfileId ?? ""}`;
}

export function parseProductPriceOption(value: string) {
  const [productId = "", uomProfileId = ""] = value.split("|");

  return {
    productId: productId.trim(),
    uomProfileId: uomProfileId.trim(),
  };
}

export function buildPresentationEquivalenceLabel(params: {
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
    return `${presentation} - ${formatQty(qtyInInputUnit)} ${inputUnitCode || "un"} = ${formatQty(qtyInStockUnit)} ${stockUnitCode}`;
  }

  return presentation;
}

export function presentationShortLabel(params: {
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

export function isPresentationUnitCode(value: string | null | undefined) {
  const normalized = normalizeUnitCodeLocal(value).toLowerCase();

  return ["un", "und", "unidad", "unid", "u"].includes(normalized);
}

export function isManualPhysicalPresentation(profile: ProductUomProfileRow) {
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

export function resolveBuyerSiteId(params: {
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

export function normalizeLabel(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isSameLabel(a: string | null | undefined, b: string | null | undefined) {
  const normalizedA = normalizeLabel(a);
  const normalizedB = normalizeLabel(b);
  return Boolean(normalizedA && normalizedB && normalizedA === normalizedB);
}

export function isDemoLabel(value: string | null | undefined) {
  const normalized = normalizeLabel(value);
  return normalized.includes("app review") || normalized.includes("demo");
}

export function isDemoSite(row: SiteRow | null | undefined) {
  return isDemoLabel(row?.name);
}

export function isDemoCostCenter(row: CostCenterRow, sitesById: Map<string, SiteRow>) {
  const site = row.site_id ? sitesById.get(row.site_id) : null;
  return isDemoLabel(row.name) || isDemoLabel(row.code) || isDemoSite(site);
}

export function isProductionCostCenter(row: CostCenterRow, sitesById: Map<string, SiteRow>) {
  const site = row.site_id ? sitesById.get(row.site_id) : null;
  return row.type === "production_center" || site?.site_type === "production_center";
}

export function isSatelliteCostCenter(row: CostCenterRow, sitesById: Map<string, SiteRow>) {
  const site = row.site_id ? sitesById.get(row.site_id) : null;
  return row.type === "satellite" || site?.site_type === "satellite";
}

export function costCenterLabel(row: CostCenterRow | null | undefined, sitesById: Map<string, SiteRow>) {
  if (!row) return "Sin centro de costo";
  const siteName = row.site_id ? sitesById.get(row.site_id)?.name : "";
  const centerName = String(row.name ?? "").trim();
  const fallbackName = String(siteName ?? "").trim();
  const mainName = centerName || fallbackName || "Centro de costo sin nombre";

  if (siteName && !isSameLabel(mainName, siteName)) {
    return `${mainName} - ${siteName}`;
  }

  return mainName;
}
