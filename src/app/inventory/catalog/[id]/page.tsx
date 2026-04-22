import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProductCostStatusPanel } from "@/features/inventory/catalog/product-cost-status-panel";
import { ProductFormFooter } from "@/features/inventory/catalog/product-form-footer";
import { ProductIdentityFields } from "@/features/inventory/catalog/product-identity-fields";
import { ProductAssetTechnicalSection } from "@/features/inventory/catalog/product-asset-technical-section";
import { ProductPhotoSection } from "@/features/inventory/catalog/product-photo-section";
import { ProductPurchaseSection } from "@/features/inventory/catalog/product-purchase-section";
import { ProductRemissionUomFields } from "@/features/inventory/catalog/product-remission-uom-fields";
import { ProductSiteAvailabilitySection } from "@/features/inventory/catalog/product-site-availability-section";
import { ProductStorageFields } from "@/features/inventory/catalog/product-storage-fields";
import { RequiredFieldsGuardForm } from "@/components/inventory/forms/RequiredFieldsGuardForm";
import {
  CatalogCategoryContextForm,
  CatalogHintPanel,
  CatalogOptionalDetails,
  CatalogSection,
} from "@/features/inventory/catalog/catalog-ui";
import {
  convertQuantity,
  createUnitMap,
  inferFamilyFromUnitCode,
  normalizeUnitCode,
  type InventoryUnit,
} from "@/lib/inventory/uom";
import {
  computeAutoCostFromPrimarySupplier,
  getAutoCostReadinessReason,
  isAutoCostReady,
} from "@/lib/inventory/costing";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { getCategoryDomainOptions } from "@/lib/constants";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  categoryKindFromProduct,
  categorySupportsKind,
  filterCategoryRows,
  getCategoryDomainCodes,
  normalizeCategoryDomain,
  normalizeCategoryScope,
  shouldShowCategoryDomain,
  type CategoryKind,
  type InventoryCategoryRow,
} from "@/lib/inventory/categories";
import {
  generateNextSku,
  isSkuConflictError,
  isValidSkuFormat,
  sanitizeManualSku,
} from "@/lib/inventory/sku";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";
const STOCK_UNIT_FIELD_ID = "stock_unit_code";
const FOGO_BASE_URL =
  process.env.NEXT_PUBLIC_FOGO_URL?.replace(/\/$/, "") ||
  "https://fogo.ventogroup.co";

function buildFogoRecipeUrl(productId: string) {
  const url = new URL("/recipes/new", FOGO_BASE_URL);
  url.searchParams.set("product_id", productId);
  url.searchParams.set("source", "nexo");
  return url.toString();
}

function buildOperationUnitHintFromUnits(params: {
  units: UnitRow[];
  inputUnitCode: string;
  stockUnitCode: string;
}) {
  const inputUnitCode = normalizeUnitCode(params.inputUnitCode || "");
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "");
  if (!inputUnitCode || !stockUnitCode) return null;
  try {
    const unitMap = createUnitMap(params.units);
    const { quantity } = convertQuantity({
      quantity: 1,
      fromUnitCode: inputUnitCode,
      toUnitCode: stockUnitCode,
      unitMap,
    });
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    const inputUnit = params.units.find((unit) => normalizeUnitCode(unit.code) === inputUnitCode);
    return {
      label: inputUnit?.name?.trim() || inputUnitCode.toUpperCase(),
      inputUnitCode,
      qtyInInputUnit: 1,
      qtyInStockUnit: quantity,
    };
  } catch {
    return null;
  }
}

function buildRemissionFromDefaultUnit(params: {
  defaultUnitCode: string;
  stockUnitCode: string;
  unitMap: ReturnType<typeof createUnitMap>;
}):
  | {
      label: string;
      inputUnitCode: string;
      qtyInInputUnit: number;
      qtyInStockUnit: number;
      source: "manual";
    }
  | null {
  const inputUnitCode = normalizeUnitCode(params.defaultUnitCode || "");
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "");
  if (!inputUnitCode || !stockUnitCode) return null;
  try {
    const { quantity } = convertQuantity({
      quantity: 1,
      fromUnitCode: inputUnitCode,
      toUnitCode: stockUnitCode,
      unitMap: params.unitMap,
    });
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    return {
      label: "Unidad operativa",
      inputUnitCode,
      qtyInInputUnit: 1,
      qtyInStockUnit: quantity,
      source: "manual",
    };
  } catch {
    return null;
  }
}

function buildRemissionFromRecipePortion(params: {
  portionSize: number;
  portionUnitCode: string;
  stockUnitCode: string;
  unitMap: ReturnType<typeof createUnitMap>;
}):
  | {
      label: string;
      inputUnitCode: string;
      qtyInInputUnit: number;
      qtyInStockUnit: number;
      source: "recipe_portion";
    }
  | null {
  const portionSize = Number(params.portionSize ?? 0);
  const portionUnitCode = normalizeUnitCode(params.portionUnitCode || "");
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "");
  if (!Number.isFinite(portionSize) || portionSize <= 0) return null;
  if (!portionUnitCode || !stockUnitCode) return null;
  try {
    const { quantity } = convertQuantity({
      quantity: portionSize,
      fromUnitCode: portionUnitCode,
      toUnitCode: stockUnitCode,
      unitMap: params.unitMap,
    });
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    return {
      label: "Porción receta",
      inputUnitCode: "un",
      qtyInInputUnit: 1,
      qtyInStockUnit: quantity,
      source: "recipe_portion",
    };
  } catch {
    return null;
  }
}

type ProductRow = {
  id: string;
  name: string | null;
  description: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_type: string | null;
  category_id: string | null;
  price: number | null;
  cost: number | null;
  is_active: boolean | null;
  image_url: string | null;
  catalog_image_url: string | null;
};

type InventoryProfileRow = {
  product_id: string;
  track_inventory: boolean;
  inventory_kind: string;
  default_unit: string | null;
  unit_family: string | null;
  costing_mode: "auto_primary_supplier" | "manual" | null;
  lot_tracking: boolean;
  expiry_tracking: boolean;
};

type CategoryRow = InventoryCategoryRow;

type SiteSettingRow = {
  id?: string;
  site_id: string;
  is_active: boolean | null;
  default_area_kind: string | null;
  area_kinds?: string[] | null;
  min_stock_qty: number | null;
  min_stock_input_mode?: "base" | "purchase" | null;
  min_stock_purchase_qty?: number | null;
  min_stock_purchase_unit_code?: string | null;
  min_stock_purchase_to_base_factor?: number | null;
  audience: "SAUDO" | "VCF" | "BOTH" | "INTERNAL" | null;
  sites?: { id: string; name: string | null } | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type AreaKindRow = { code: string; name: string | null; use_for_remission?: boolean | null };
type SiteAreaKindRow = { site_id: string | null; kind: string | null; is_active?: boolean | null };
type SiteOptionRow = { id: string; name: string | null; site_type: string | null };
type SiteAreaPurposeRuleRow = {
  site_id: string | null;
  area_kind: string | null;
  purpose: string | null;
  is_enabled: boolean | null;
};
type UnitRow = InventoryUnit;

type SupplierRow = {
  id: string;
  supplier_id: string;
  supplier_sku: string | null;
  purchase_unit: string | null;
  purchase_unit_size: number | null;
  purchase_pack_qty: number | null;
  purchase_pack_unit_code: string | null;
  purchase_price: number | null;
  purchase_price_net: number | null;
  purchase_price_includes_tax: boolean | null;
  purchase_tax_rate: number | null;
  purchase_price_includes_icui: boolean | null;
  purchase_icui_rate: number | null;
  currency: string | null;
  lead_time_days: number | null;
  min_order_qty: number | null;
  is_primary: boolean;
};

type ProductUomProfileRow = {
  id: string;
  product_id: string;
  label: string;
  input_unit_code: string;
  qty_in_input_unit: number;
  qty_in_stock_unit: number;
  is_default: boolean;
  is_active: boolean;
  source: "manual" | "supplier_primary" | "recipe_portion";
  usage_context: "general" | "purchase" | "remission" | null;
};

type AssetProfileRow = {
  product_id: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  physical_location: string | null;
  purchase_invoice_url: string | null;
  commercial_value: number | null;
  purchase_date: string | null;
  started_use_date: string | null;
  equipment_status: string | null;
  maintenance_service_provider: string | null;
  technical_description: string | null;
  maintenance_cycle_enabled: boolean | null;
  maintenance_cycle_months: number | null;
  maintenance_cycle_anchor_date: string | null;
};

type AssetMaintenanceLine = {
  id?: string;
  scheduled_date?: string;
  performed_date?: string;
  responsible?: string;
  maintenance_provider?: string;
  work_done?: string;
  parts_replaced?: boolean;
  replaced_parts?: string;
  planner_bucket?: string;
  _delete?: boolean;
};

type AssetTransferLine = {
  id?: string;
  moved_at?: string;
  from_location?: string;
  to_location?: string;
  responsible?: string;
  notes?: string;
  _delete?: boolean;
};

type SearchParams = {
  ok?: string;
  error?: string;
  from?: string;
  category_scope?: string;
  category_site_id?: string;
  category_domain?: string;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableNumber(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  const raw = typeof value === "string" ? value.trim() : String(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function asNullableDateText(value: string | undefined): string | null {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function parseJsonArray<T>(rawValue: FormDataEntryValue | null): T[] {
  const raw = asText(rawValue);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function resolveNetPurchasePrice(params: {
  purchasePrice: number | null;
  purchasePriceIncludesTax: boolean;
  purchaseTaxRate: number;
  purchasePriceIncludesIcui?: boolean;
  purchaseIcuiRate?: number;
}): number | null {
  const gross = Number(params.purchasePrice ?? 0);
  if (!Number.isFinite(gross) || gross <= 0) return null;
  const includesTax = Boolean(params.purchasePriceIncludesTax);
  const includesIcui = Boolean(params.purchasePriceIncludesIcui);
  if (!includesTax && !includesIcui) return gross;
  const safeTaxRate = Number.isFinite(params.purchaseTaxRate) && params.purchaseTaxRate >= 0
    ? params.purchaseTaxRate
    : 0;
  const safeIcuiRate =
    Number.isFinite(Number(params.purchaseIcuiRate ?? 0)) && Number(params.purchaseIcuiRate ?? 0) >= 0
      ? Number(params.purchaseIcuiRate ?? 0)
      : 0;
  const totalRate = (includesTax ? safeTaxRate : 0) + (includesIcui ? safeIcuiRate : 0);
  const divisor = 1 + totalRate / 100;
  if (!Number.isFinite(divisor) || divisor <= 0) return gross;
  return gross / divisor;
}

type CatalogTab = "insumos" | "preparaciones" | "productos" | "equipos";

function sanitizeCatalogReturnPath(value: string): string {
  return value.startsWith("/inventory/catalog") ? value : "";
}

function decodeCatalogReturnParam(value: string | undefined): string {
  if (!value) return "";
  try {
    return sanitizeCatalogReturnPath(safeDecodeURIComponent(value));
  } catch {
    return "";
  }
}

function appendQueryParam(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function resolveCatalogTab(productTypeRaw: string, inventoryKindRaw: string): CatalogTab {
  const productType = productTypeRaw.trim().toLowerCase();
  const inventoryKind = inventoryKindRaw.trim().toLowerCase();
  if (inventoryKind === "asset") return "equipos";
  if (productType === "preparacion") return "preparaciones";
  if (productType === "venta") return "productos";
  return "insumos";
}

function resolveLockedInventoryKind(productTypeRaw: string, inventoryKindRaw: string): string {
  const productType = String(productTypeRaw ?? "").trim().toLowerCase();
  const inventoryKind = String(inventoryKindRaw ?? "").trim().toLowerCase();
  if (productType === "preparacion") return "finished";
  if (productType === "venta") return inventoryKind === "resale" ? "resale" : "finished";
  if (productType === "insumo") return inventoryKind === "asset" ? "asset" : "ingredient";
  return inventoryKind || "unclassified";
}

function inventoryKindLabel(kindRaw: string): string {
  const kind = String(kindRaw ?? "").trim().toLowerCase();
  if (kind === "ingredient") return "Insumo";
  if (kind === "finished") return "Producto terminado";
  if (kind === "resale") return "Reventa";
  if (kind === "packaging") return "Empaque";
  if (kind === "asset") return "Activo";
  return "Sin clasificar";
}

function siteSettingRowRank(row: SiteSettingRow): number {
  const activeScore = row.is_active === false ? 0 : 2;
  const minScore = row.min_stock_qty == null ? 0 : 1;
  return activeScore + minScore;
}

function siteSettingTs(row: SiteSettingRow): number {
  const updatedTs = new Date(String(row.updated_at ?? "")).getTime();
  if (Number.isFinite(updatedTs) && updatedTs > 0) return updatedTs;
  const createdTs = new Date(String(row.created_at ?? "")).getTime();
  if (Number.isFinite(createdTs) && createdTs > 0) return createdTs;
  return 0;
}

function resolveCompatibleDefaultUnit(params: {
  requestedDefaultUnit: string;
  stockUnitCode: string;
  unitMap: ReturnType<typeof createUnitMap>;
}) {
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "un");
  const requestedDefaultUnit = normalizeUnitCode(
    params.requestedDefaultUnit || stockUnitCode
  );
  const stockFamily = inferFamilyFromUnitCode(stockUnitCode, params.unitMap);
  const defaultFamily = inferFamilyFromUnitCode(requestedDefaultUnit, params.unitMap);
  if (stockFamily && defaultFamily && stockFamily !== defaultFamily) {
    return stockUnitCode;
  }
  return requestedDefaultUnit || stockUnitCode;
}

function omitKeys(
  payload: Record<string, unknown>,
  keysToOmit: string[]
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => !keysToOmit.includes(key) && value !== undefined)
  );
}

function buildProductSiteSettingPayloadVariants(
  payload: Record<string, unknown>
): Record<string, unknown>[] {
  const variantKeysToOmit: string[][] = [
    [],
    [
      "area_kinds",
      "min_stock_input_mode",
      "min_stock_purchase_qty",
      "min_stock_purchase_unit_code",
      "min_stock_purchase_to_base_factor",
    ],
    [
      "area_kinds",
      "min_stock_input_mode",
      "min_stock_purchase_qty",
      "min_stock_purchase_unit_code",
      "min_stock_purchase_to_base_factor",
      "audience",
    ],
    [
      "area_kinds",
      "min_stock_input_mode",
      "min_stock_purchase_qty",
      "min_stock_purchase_unit_code",
      "min_stock_purchase_to_base_factor",
      "audience",
      "min_stock_qty",
    ],
  ];

  const variants: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const keys of variantKeysToOmit) {
    const variant = omitKeys(payload, keys);
    const signature = JSON.stringify(variant);
    if (seen.has(signature)) continue;
    seen.add(signature);
    variants.push(variant);
  }
  return variants;
}

async function insertProductSiteSettingCompat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: Record<string, unknown>
) {
  const variants = buildProductSiteSettingPayloadVariants(payload);
  let lastError: { code?: string; message: string } | null = null;

  for (const variant of variants) {
    const { error } = await supabase.from("product_site_settings").insert(variant);
    if (!error) return null;
    lastError = { code: error.code, message: error.message };
    if (error.code !== "42703") return lastError;
  }

  return lastError;
}

async function updateProductSiteSettingCompat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  siteId: string,
  payload: Record<string, unknown>
) {
  const variants = buildProductSiteSettingPayloadVariants(payload);
  let lastError: { code?: string; message: string } | null = null;

  for (const variant of variants) {
    const { error } = await supabase
      .from("product_site_settings")
      .update(variant)
      .eq("product_id", productId)
      .eq("site_id", siteId);
    if (!error) return null;
    lastError = { code: error.code, message: error.message };
    if (error.code !== "42703") return lastError;
  }

  return lastError;
}

async function loadCategoryRows(
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"]
): Promise<CategoryRow[]> {
  const query = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain,site_id,is_active,applies_to_kinds")
    .order("name", { ascending: true });

  if (!query.error) {
    return (query.data ?? []) as CategoryRow[];
  }

  const fallback = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain,site_id,is_active")
    .order("name", { ascending: true });

  return ((fallback.data ?? []) as Array<Omit<CategoryRow, "applies_to_kinds">>).map(
    (row) => ({ ...row, applies_to_kinds: [] })
  );
}

function resolveCategoryKindForProduct(params: {
  productType: string | null | undefined;
  inventoryKind: string | null | undefined;
}): CategoryKind {
  return categoryKindFromProduct({
    productType: params.productType,
    inventoryKind: params.inventoryKind,
  });
}

async function updateProduct(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) redirect(await buildShellLoginUrl("/inventory/catalog"));

  const { data: employee } = await supabase.from("employees").select("role").eq("id", user.id).maybeSingle();
  const role = String(employee?.role ?? "").toLowerCase();
  if (!["propietario", "gerente_general"].includes(role)) {
    redirect(`/inventory/catalog?error=${encodeURIComponent("No tienes permisos para editar productos.")}`);
  }

  const productId = asText(formData.get("product_id"));
  if (!productId) redirect("/inventory/catalog?error=" + encodeURIComponent("Producto inválido."));

  const returnTo = sanitizeCatalogReturnPath(asText(formData.get("return_to")));
  const detailBase = returnTo
    ? `/inventory/catalog/${productId}?from=${encodeURIComponent(returnTo)}`
    : `/inventory/catalog/${productId}`;
  const redirectWithError = (message: string) => {
    redirect(appendQueryParam(detailBase, "error", message));
  };

  const { data: existingProduct, error: existingProductError } = await supabase
    .from("products")
    .select("id,sku,product_type")
    .eq("id", productId)
    .maybeSingle();
  if (existingProductError || !existingProduct) {
    redirectWithError("No se encontro el producto a editar.");
  }
  const existingSku = String(existingProduct?.sku ?? "").trim();
  const existingProductType = String(existingProduct?.product_type ?? "").trim();

  const { data: unitsData } = await supabase
    .from("inventory_units")
    .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
    .eq("is_active", true)
    .limit(500);
  const units = (unitsData ?? []) as UnitRow[];
  const unitMap = createUnitMap(units);

  const stockUnitCode = normalizeUnitCode(
    asText(formData.get("stock_unit_code")) || asText(formData.get("unit")) || "un"
  );
  const costingModeRaw = asText(formData.get("costing_mode"));
  const costingModeBase: "auto_primary_supplier" | "manual" =
    costingModeRaw === "manual" ? "manual" : "auto_primary_supplier";
  const unitFamily = inferFamilyFromUnitCode(stockUnitCode, unitMap) ?? null;
  const requestedDefaultUnit = normalizeUnitCode(
    asText(formData.get("default_unit")) || stockUnitCode
  );
  const resolvedDefaultUnit = resolveCompatibleDefaultUnit({
    requestedDefaultUnit,
    stockUnitCode,
    unitMap,
  });
  const manualCost = asNullableNumber(formData.get("cost"));
  const productTypeValue = asText(formData.get("product_type")) || null;
  const inventoryKindInput = asText(formData.get("inventory_kind")) || null;
  const inventoryKindValue = resolveLockedInventoryKind(
    productTypeValue || existingProductType || "insumo",
    inventoryKindInput || ""
  );

  const categoryId = asText(formData.get("category_id"));
  const categoryKind = resolveCategoryKindForProduct({
    productType: productTypeValue,
    inventoryKind: inventoryKindValue,
  });
  const normalizedProductTypeForCosting = String(productTypeValue ?? "").trim().toLowerCase();
  const normalizedInventoryKindForCosting = String(inventoryKindValue ?? "").trim().toLowerCase();
  const supportsSupplierAutoCost =
    (normalizedProductTypeForCosting === "insumo" && normalizedInventoryKindForCosting !== "asset") ||
    (normalizedProductTypeForCosting === "venta" && normalizedInventoryKindForCosting === "resale");
  const costingMode: "auto_primary_supplier" | "manual" = supportsSupplierAutoCost
    ? costingModeBase
    : "manual";
  if (categoryId) {
    const { data: categoryRow, error: categoryError } = await supabase
      .from("product_categories")
      .select("id,name,parent_id,domain,site_id,is_active,applies_to_kinds")
      .eq("id", categoryId)
      .maybeSingle();
    if (categoryError || !categoryRow) {
      redirectWithError("La categoria seleccionada no existe.");
    }
    const category = categoryRow as CategoryRow;
    if (category.is_active === false) {
      redirectWithError("La categoria seleccionada esta inactiva.");
    }
    if (!categorySupportsKind(category, categoryKind)) {
      redirectWithError("La categoria no aplica al tipo de item seleccionado.");
    }
    if (
      categoryKind === "venta" &&
      (normalizeCategoryDomain(category.domain) || String(category.site_id ?? "").trim())
    ) {
      redirectWithError("Los productos de venta solo pueden usar categorias maestras globales.");
    }
    if (categoryKind !== "venta" && normalizeCategoryDomain(category.domain)) {
      redirectWithError("Las categorías con dominio solo se permiten para productos de venta.");
    }
  }
  if (categoryId) {
    const { count: activeChildrenCount, error: activeChildrenError } = await supabase
      .from("product_categories")
      .select("id", { head: true, count: "exact" })
      .eq("parent_id", categoryId)
      .eq("is_active", true);
    if (activeChildrenError) {
      redirectWithError(activeChildrenError.message);
    }
    if ((activeChildrenCount ?? 0) > 0) {
      redirectWithError("Selecciona una categoria del ultimo nivel (categoria hoja).");
    }
  }

  const payload: Record<string, unknown> = {
    name: asText(formData.get("name")),
    description: asText(formData.get("description")) || null,
    unit: stockUnitCode,
    stock_unit_code: stockUnitCode,
    product_type: productTypeValue,
    price: asNullableNumber(formData.get("price")),
    is_active: Boolean(formData.get("is_active")),
    image_url: asText(formData.get("image_url")) || null,
  };
  if (formData.has("catalog_image_url")) {
    payload.catalog_image_url = asText(formData.get("catalog_image_url")) || null;
  }
  if (manualCost != null) {
    payload.cost = manualCost;
  }
  const allowSkuOverride = asText(formData.get("allow_sku_override")) === "true";
  const submittedSku = sanitizeManualSku(asText(formData.get("sku")));
  const hasCurrentSku = Boolean(existingSku);
  const assignAutoSku = asText(formData.get("assign_auto_sku")) === "true";

  if (allowSkuOverride) {
    let nextSku = "";
    if (submittedSku) {
      if (!isValidSkuFormat(submittedSku)) {
        redirectWithError("SKU invalido. Usa letras, numeros y guiones.");
      }
      nextSku = submittedSku;
    } else if (!hasCurrentSku && assignAutoSku) {
      nextSku = await generateNextSku({
        supabase,
        productType: productTypeValue || existingProductType,
        inventoryKind: inventoryKindValue,
        name: asText(formData.get("name")),
      });
    } else {
      redirectWithError("Ingresa SKU manual o desactiva override.");
    }
    payload.sku = nextSku;
  }
  if (categoryId) payload.category_id = categoryId;

  const { error: updateErr } = await supabase.from("products").update(payload).eq("id", productId);
  if (updateErr) {
    if (isSkuConflictError(updateErr)) {
      redirectWithError("El SKU ya existe. Usa otro codigo.");
    }
    redirectWithError(updateErr.message);
  }

  const profilePayload = {
    product_id: productId,
    track_inventory: Boolean(formData.get("track_inventory")),
    inventory_kind: inventoryKindValue || "unclassified",
    default_unit: resolvedDefaultUnit,
    unit_family: unitFamily,
    costing_mode: costingMode,
    lot_tracking: Boolean(formData.get("lot_tracking")),
    expiry_tracking: Boolean(formData.get("expiry_tracking")),
  };
  const { error: profileErr } = await supabase
    .from("product_inventory_profiles")
    .upsert(profilePayload, { onConflict: "product_id" });
  if (profileErr) redirectWithError(profileErr.message);

  let autoCostFromPrimary: number | null = null;
  let purchaseUomFromSupplier:
    | {
        label: string;
        inputUnitCode: string;
        qtyInInputUnit: number;
        qtyInStockUnit: number;
      }
    | null = null;
  let remissionUomFromSupplier:
    | {
        label: string;
        inputUnitCode: string;
        qtyInInputUnit: number;
        qtyInStockUnit: number;
        source: "manual" | "supplier_primary" | "recipe_portion";
      }
    | null = null;
  const supplierLinesRaw = formData.get("supplier_lines");
  let hasAnySupplierLine = false;
  let hasCompletePrimarySupplier = false;
  if (supportsSupplierAutoCost && typeof supplierLinesRaw === "string" && supplierLinesRaw) {
    let lines: Array<{
      id?: string;
      supplier_id?: string;
      supplier_sku?: string;
      purchase_unit?: string;
      purchase_unit_size?: number;
      purchase_pack_qty?: number;
      purchase_pack_unit_code?: string;
      purchase_price?: number;
      purchase_price_net?: number;
      purchase_price_includes_tax?: boolean;
      purchase_tax_rate?: number;
      purchase_price_includes_icui?: boolean;
      purchase_icui_rate?: number;
      currency?: string;
      lead_time_days?: number;
      min_order_qty?: number;
      is_primary?: boolean;
      _delete?: boolean;
    }> = [];
    try {
      lines = JSON.parse(supplierLinesRaw) as typeof lines;
    } catch {
      redirectWithError("No se pudo leer el bloque de proveedores. Recarga la pagina e intenta de nuevo.");
    }
    const nextSupplierLines = lines.filter((line) => !line._delete && Boolean(line.supplier_id));
    hasAnySupplierLine = nextSupplierLines.length > 0;
    for (const line of nextSupplierLines) {
      if (line._delete || !line.supplier_id) continue;
      const packQty = Number(line.purchase_pack_qty ?? line.purchase_unit_size ?? 0) || 0;
      const packUnitCode = normalizeUnitCode(
        (line.purchase_pack_unit_code as string) || stockUnitCode
      );
      let purchaseUnitSizeLegacy: number | null = null;
      if (packQty > 0 && packUnitCode) {
        try {
          const { quantity } = convertQuantity({
            quantity: packQty,
            fromUnitCode: packUnitCode,
            toUnitCode: stockUnitCode,
            unitMap,
          });
          purchaseUnitSizeLegacy = quantity;
        } catch {
          purchaseUnitSizeLegacy = null;
        }
      }
      const purchasePrice = Number(line.purchase_price ?? 0) || null;
      const purchasePriceIncludesTax = Boolean(line.purchase_price_includes_tax);
      const purchaseTaxRateRaw = Number(line.purchase_tax_rate ?? 0);
      const purchaseTaxRate =
        Number.isFinite(purchaseTaxRateRaw) && purchaseTaxRateRaw >= 0
          ? purchaseTaxRateRaw
          : 0;
      const purchasePriceIncludesIcui = Boolean(line.purchase_price_includes_icui);
      const purchaseIcuiRateRaw = Number(line.purchase_icui_rate ?? 0);
      const purchaseIcuiRate =
        Number.isFinite(purchaseIcuiRateRaw) && purchaseIcuiRateRaw >= 0
          ? purchaseIcuiRateRaw
          : 0;
      const purchasePriceNet = resolveNetPurchasePrice({
        purchasePrice,
        purchasePriceIncludesTax,
        purchaseTaxRate,
        purchasePriceIncludesIcui,
        purchaseIcuiRate,
      });
      const purchaseUnitLabel = String(line.purchase_unit ?? "").trim();
      if (
        Boolean(line.is_primary) &&
        purchaseUnitLabel &&
        packQty > 0 &&
        packUnitCode &&
        purchasePriceNet != null &&
        purchasePriceNet > 0
      ) {
        hasCompletePrimarySupplier = true;
      }
      if (
        costingMode === "auto_primary_supplier" &&
        Boolean(line.is_primary) &&
        purchasePriceNet != null &&
        purchasePriceNet > 0 &&
        packQty > 0 &&
        packUnitCode
      ) {
        try {
          autoCostFromPrimary = computeAutoCostFromPrimarySupplier({
            packPrice: purchasePriceNet,
            packQty,
            packUnitCode,
            stockUnitCode,
            unitMap,
          });
        } catch {
          // Keep previous/manual cost when conversion is not valid
        }
      }
      if (Boolean(line.is_primary) && packQty > 0 && packUnitCode) {
        try {
          const { quantity: qtyInStockUnit } = convertQuantity({
            quantity: packQty,
            fromUnitCode: packUnitCode,
            toUnitCode: stockUnitCode,
            unitMap,
          });
          if (qtyInStockUnit > 0) {
            purchaseUomFromSupplier = {
              label: String(line.purchase_unit || "Empaque"),
              inputUnitCode: packUnitCode,
              qtyInInputUnit: 1,
              qtyInStockUnit,
            };
          }
        } catch {
          // Keep previous profile if conversion is invalid.
        }
      }
    }
    if (!hasAnySupplierLine) {
      redirectWithError("Debes agregar al menos un proveedor para este producto.");
    }
    if (!hasCompletePrimarySupplier) {
      redirectWithError(
        "Completa proveedor principal con empaque, cantidad, unidad y precio de compra."
      );
    }
    if (!purchaseUomFromSupplier) {
      redirectWithError(
        "No se pudo convertir unidad de compra a unidad base. Revisa unidad base, unidad de compra y cantidad del proveedor principal."
      );
    }

    // Solo después de validar todo, aplicamos cambios para evitar perder vínculos si hay error de datos.
    await supabase.from("product_suppliers").delete().eq("product_id", productId);
    for (const line of nextSupplierLines) {
      const packQty = Number(line.purchase_pack_qty ?? line.purchase_unit_size ?? 0) || 0;
      const packUnitCode = normalizeUnitCode(
        (line.purchase_pack_unit_code as string) || stockUnitCode
      );
      let purchaseUnitSizeLegacy: number | null = null;
      if (packQty > 0 && packUnitCode) {
        try {
          const { quantity } = convertQuantity({
            quantity: packQty,
            fromUnitCode: packUnitCode,
            toUnitCode: stockUnitCode,
            unitMap,
          });
          purchaseUnitSizeLegacy = quantity;
        } catch {
          purchaseUnitSizeLegacy = null;
        }
      }
      const purchasePrice = Number(line.purchase_price ?? 0) || null;
      const purchasePriceIncludesTax = Boolean(line.purchase_price_includes_tax);
      const purchaseTaxRateRaw = Number(line.purchase_tax_rate ?? 0);
      const purchaseTaxRate =
        Number.isFinite(purchaseTaxRateRaw) && purchaseTaxRateRaw >= 0
          ? purchaseTaxRateRaw
          : 0;
      const purchasePriceIncludesIcui = Boolean(line.purchase_price_includes_icui);
      const purchaseIcuiRateRaw = Number(line.purchase_icui_rate ?? 0);
      const purchaseIcuiRate =
        Number.isFinite(purchaseIcuiRateRaw) && purchaseIcuiRateRaw >= 0
          ? purchaseIcuiRateRaw
          : 0;
      const purchasePriceNet = resolveNetPurchasePrice({
        purchasePrice,
        purchasePriceIncludesTax,
        purchaseTaxRate,
        purchasePriceIncludesIcui,
        purchaseIcuiRate,
      });
      const { error: supplierErr } = await supabase.from("product_suppliers").insert({
        product_id: productId,
        supplier_id: line.supplier_id,
        supplier_sku: line.supplier_sku || null,
        purchase_unit: line.purchase_unit || null,
        purchase_unit_size: purchaseUnitSizeLegacy,
        purchase_pack_qty: packQty > 0 ? packQty : null,
        purchase_pack_unit_code: packUnitCode || null,
        purchase_price: purchasePrice,
        purchase_price_net: purchasePriceNet,
        purchase_price_includes_tax: purchasePriceIncludesTax,
        purchase_tax_rate: purchaseTaxRate,
        purchase_price_includes_icui: purchasePriceIncludesIcui,
        purchase_icui_rate: purchaseIcuiRate,
        currency: line.currency || "COP",
        lead_time_days: line.lead_time_days ?? null,
        min_order_qty: line.min_order_qty ?? null,
        is_primary: Boolean(line.is_primary),
      });
      if (supplierErr) redirectWithError(supplierErr.message);
    }
  }

  const remissionInputUnitCodeRaw = asText(formData.get("remission_uom_code"));
  const remissionQtyInStockText = asText(formData.get("remission_uom_qty_in_stock"));
  const remissionLabelText = asText(formData.get("remission_uom_label"));
  const remissionSourceModeRaw = asText(formData.get("remission_source_mode")).toLowerCase();
  const remissionSourceMode =
    remissionSourceModeRaw === "disabled" ||
    remissionSourceModeRaw === "purchase_primary" ||
    remissionSourceModeRaw === "remission_profile" ||
    remissionSourceModeRaw === "recipe_portion" ||
    remissionSourceModeRaw === "operation_unit"
      ? remissionSourceModeRaw
      : "disabled";
  const remissionInputUnitCode = normalizeUnitCode(remissionInputUnitCodeRaw);
  const remissionQtyInStockRaw = Number(remissionQtyInStockText || 0);
  const remissionQtyInStock =
    Number.isFinite(remissionQtyInStockRaw) && remissionQtyInStockRaw > 0
      ? remissionQtyInStockRaw
      : 0;
  if (remissionSourceMode === "disabled") {
    remissionUomFromSupplier = null;
  } else if (remissionSourceMode === "remission_profile") {
    if (!remissionInputUnitCode || remissionQtyInStock <= 0) {
      redirectWithError(
        "Completa la presentación de remisión: unidad y equivalencia a unidad base."
      );
    }
    remissionUomFromSupplier = {
      label: remissionLabelText || "Presentación remisión",
      inputUnitCode: remissionInputUnitCode,
      qtyInInputUnit: 1,
      qtyInStockUnit: remissionQtyInStock,
      source: "manual",
    };
  } else if (remissionSourceMode === "purchase_primary") {
    const purchaseProfile = purchaseUomFromSupplier;
    if (!purchaseProfile) {
      redirectWithError(
        "No se pudo usar la presentación de compra en operación. Completa el proveedor primario."
      );
      return;
    }
    remissionUomFromSupplier = {
      label: purchaseProfile.label || "Presentación compra",
      inputUnitCode: purchaseProfile.inputUnitCode,
      qtyInInputUnit: purchaseProfile.qtyInInputUnit,
      qtyInStockUnit: purchaseProfile.qtyInStockUnit,
      source: "supplier_primary",
    };
  } else if (remissionSourceMode === "operation_unit") {
    remissionUomFromSupplier = buildRemissionFromDefaultUnit({
      defaultUnitCode: resolvedDefaultUnit,
      stockUnitCode,
      unitMap,
    });
    if (!remissionUomFromSupplier) {
      redirectWithError(
        "No se pudo definir la presentacion de remision desde unidad operativa. Revisa unidad base y unidad operativa."
      );
    }
  } else if (remissionSourceMode === "recipe_portion") {
    const normalizedProductType = String(existingProductType ?? "").trim().toLowerCase();
    if (!["preparacion", "venta"].includes(normalizedProductType)) {
      redirectWithError("La opción de receta solo aplica a preparaciones o productos con receta.");
    }
    const { data: publishedRecipes, error: recipeError } = await supabase
      .from("recipe_cards")
      .select("portion_size,portion_unit,status,is_active,updated_at")
      .eq("product_id", productId)
      .eq("is_active", true)
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (recipeError) {
      redirectWithError(recipeError.message);
    }
    const recipePortion = (publishedRecipes ?? [])[0] as
      | {
          portion_size?: number | null;
          portion_unit?: string | null;
        }
      | undefined;
    if (!recipePortion) {
      redirectWithError(
        "No hay receta publicada activa para este producto. Publica la receta para usar esta opción."
      );
    }
    remissionUomFromSupplier = buildRemissionFromRecipePortion({
      portionSize: Number(recipePortion?.portion_size ?? 0),
      portionUnitCode: String(recipePortion?.portion_unit ?? ""),
      stockUnitCode,
      unitMap,
    });
    if (!remissionUomFromSupplier) {
      redirectWithError(
        "La porción de la receta no es válida para remisión. Revisa porción, unidad y conversión contra unidad base."
      );
    }
  }

  async function upsertContextProfile(params: {
    usageContext: "purchase" | "remission";
    label: string;
    inputUnitCode: string;
    qtyInInputUnit: number;
    qtyInStockUnit: number;
    source: "manual" | "supplier_primary" | "recipe_portion";
  }) {
    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from("product_uom_profiles")
      .select("id")
      .eq("product_id", productId)
      .eq("usage_context", params.usageContext)
      .eq("is_default", true)
      .eq("is_active", true)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("product_uom_profiles")
        .update({
          label: params.label,
          input_unit_code: params.inputUnitCode,
          qty_in_input_unit: params.qtyInInputUnit,
          qty_in_stock_unit: params.qtyInStockUnit,
          source: params.source,
          updated_at: now,
        })
        .eq("id", existing.id);
      return;
    }

    await supabase.from("product_uom_profiles").insert({
      product_id: productId,
      label: params.label,
      input_unit_code: params.inputUnitCode,
      qty_in_input_unit: params.qtyInInputUnit,
      qty_in_stock_unit: params.qtyInStockUnit,
      usage_context: params.usageContext,
      is_default: true,
      is_active: true,
      source: params.source,
      updated_at: now,
    });
  }

  if (purchaseUomFromSupplier) {
    await upsertContextProfile({
      usageContext: "purchase",
      label: purchaseUomFromSupplier.label,
      inputUnitCode: purchaseUomFromSupplier.inputUnitCode,
      qtyInInputUnit: purchaseUomFromSupplier.qtyInInputUnit,
      qtyInStockUnit: purchaseUomFromSupplier.qtyInStockUnit,
      source: "supplier_primary",
    });
  }

  if (remissionUomFromSupplier) {
    await upsertContextProfile({
      usageContext: "remission",
      label: remissionUomFromSupplier.label,
      inputUnitCode: remissionUomFromSupplier.inputUnitCode,
      qtyInInputUnit: remissionUomFromSupplier.qtyInInputUnit,
      qtyInStockUnit: remissionUomFromSupplier.qtyInStockUnit,
      source: remissionUomFromSupplier.source,
    });
  }

  if (costingMode === "auto_primary_supplier" && manualCost == null && autoCostFromPrimary != null) {
    const { error: costErr } = await supabase
      .from("products")
      .update({ cost: autoCostFromPrimary, updated_at: new Date().toISOString() })
      .eq("id", productId);
    if (costErr) redirectWithError(costErr.message);
  }

  const siteSettingsRaw = formData.get("site_settings_lines");
  if (typeof siteSettingsRaw === "string" && siteSettingsRaw) {
    let siteLines: Array<{
      id?: string;
      site_id?: string;
      is_active?: boolean;
      default_area_kind?: string;
      area_kinds?: string[];
      min_stock_qty?: number | string;
      min_stock_input_mode?: "base" | "purchase" | string;
      min_stock_purchase_qty?: number | string;
      min_stock_purchase_unit_code?: string;
      min_stock_purchase_to_base_factor?: number | string;
      audience?: string;
      _delete?: boolean;
    }> = [];
    try {
      siteLines = JSON.parse(siteSettingsRaw) as typeof siteLines;
    } catch {
      redirectWithError("No se pudo leer disponibilidad por sede. Recarga la pagina e intenta de nuevo.");
    }
    const toDelete = siteLines.filter((l) => l.id && l._delete).map((l) => l.id as string);
    for (const id of toDelete) await supabase.from("product_site_settings").delete().eq("id", id);
    for (const line of siteLines) {
      if (line._delete) continue;
      const hasMeaningfulData =
        Boolean(String(line.site_id ?? "").trim()) ||
        Boolean(String(line.default_area_kind ?? "").trim()) ||
        (Array.isArray(line.area_kinds) && line.area_kinds.some((kind) => String(kind ?? "").trim())) ||
        Boolean(String(line.audience ?? "").trim()) ||
        String(line.min_stock_qty ?? "").trim() !== "";
      if (!line.site_id && hasMeaningfulData) {
        redirectWithError("En disponibilidad por sede debes seleccionar una sede.");
      }
      if (!line.site_id) continue;
      const normalizedAudience = String(line.audience ?? "BOTH").trim().toUpperCase();
      const minStockInputMode = String(line.min_stock_input_mode ?? "base").trim().toLowerCase() === "purchase"
        ? "purchase"
        : "base";
      const parsedMinStockQtyRaw =
        line.min_stock_qty == null || String(line.min_stock_qty).trim() === ""
          ? null
          : Number(line.min_stock_qty);
      const parsedMinStockQty =
        parsedMinStockQtyRaw != null && Number.isFinite(parsedMinStockQtyRaw)
          ? parsedMinStockQtyRaw
          : null;
      const parsedMinPurchaseQtyRaw =
        line.min_stock_purchase_qty == null || String(line.min_stock_purchase_qty).trim() === ""
          ? null
          : Number(line.min_stock_purchase_qty);
      const parsedMinPurchaseQty =
        parsedMinPurchaseQtyRaw != null && Number.isFinite(parsedMinPurchaseQtyRaw)
          ? parsedMinPurchaseQtyRaw
          : null;
      const parsedMinPurchaseFactorRaw =
        line.min_stock_purchase_to_base_factor == null ||
        String(line.min_stock_purchase_to_base_factor).trim() === ""
          ? null
          : Number(line.min_stock_purchase_to_base_factor);
      const parsedMinPurchaseFactor =
        parsedMinPurchaseFactorRaw != null &&
        Number.isFinite(parsedMinPurchaseFactorRaw) &&
        parsedMinPurchaseFactorRaw > 0
          ? parsedMinPurchaseFactorRaw
          : null;
      const normalizedAreaKinds = Array.from(
        new Set(
          (Array.isArray(line.area_kinds) ? line.area_kinds : [])
            .map((kind) => String(kind ?? "").trim())
            .filter(Boolean)
        )
      );
      const normalizedDefaultAreaKind =
        normalizedAreaKinds[0] ?? String(line.default_area_kind ?? "").trim() ?? "";
      const row = {
        product_id: productId,
        site_id: line.site_id,
        is_active: Boolean(line.is_active),
        default_area_kind: normalizedDefaultAreaKind || null,
        area_kinds: normalizedAreaKinds.length ? normalizedAreaKinds : null,
        min_stock_qty: parsedMinStockQty,
        min_stock_input_mode: minStockInputMode,
        min_stock_purchase_qty:
          minStockInputMode === "purchase" ? parsedMinPurchaseQty : null,
        min_stock_purchase_unit_code:
          minStockInputMode === "purchase"
            ? String(line.min_stock_purchase_unit_code ?? "").trim().toLowerCase() || null
            : null,
        min_stock_purchase_to_base_factor:
          minStockInputMode === "purchase" ? parsedMinPurchaseFactor : null,
        audience:
          normalizedAudience === "SAUDO"
            ? "SAUDO"
            : normalizedAudience === "VCF"
              ? "VCF"
              : normalizedAudience === "INTERNAL"
                ? "INTERNAL"
                : "BOTH",
      };
      if (line.id) {
        const upErr = await updateProductSiteSettingCompat(
          supabase,
          productId,
          String(line.site_id),
          row
        );
        if (upErr) redirectWithError(upErr.message);
      } else {
        const insErr = await insertProductSiteSettingCompat(supabase, row);
        if (insErr) redirectWithError(insErr.message);
      }
    }
  }

  const normalizedKind = String(inventoryKindValue ?? "").trim().toLowerCase();
  const shouldPersistAssetProfile =
    normalizedKind === "asset" && asText(formData.get("asset_profile_enabled")) === "1";

  if (shouldPersistAssetProfile) {
    const assetProfileTemplate =
      asText(formData.get("asset_profile_template")) === "industrial"
        ? "industrial"
        : "general";
    const rawStatus = String(asText(formData.get("asset_equipment_status")) || "operativo").toLowerCase();
    const equipmentStatus =
      rawStatus === "en_mantenimiento" ||
      rawStatus === "fuera_servicio" ||
      rawStatus === "baja"
        ? rawStatus
        : "operativo";

    const assetProfilePayload = {
      product_id: productId,
      brand: assetProfileTemplate === "industrial" ? asText(formData.get("asset_brand")) || null : null,
      model: assetProfileTemplate === "industrial" ? asText(formData.get("asset_model")) || null : null,
      serial_number:
        assetProfileTemplate === "industrial" ? asText(formData.get("asset_serial_number")) || null : null,
      physical_location: asText(formData.get("asset_physical_location")) || null,
      purchase_invoice_url: asText(formData.get("asset_purchase_invoice_url")) || null,
      commercial_value: asNullableNumber(formData.get("asset_commercial_value")),
      purchase_date: asNullableDateText(asText(formData.get("asset_purchase_date"))),
      started_use_date: asNullableDateText(asText(formData.get("asset_started_use_date"))),
      equipment_status: equipmentStatus,
      maintenance_service_provider:
        assetProfileTemplate === "industrial"
          ? asText(formData.get("asset_maintenance_service_provider")) || null
          : null,
      technical_description: asText(formData.get("asset_technical_description")) || null,
      maintenance_cycle_enabled:
        assetProfileTemplate === "industrial"
          ? Boolean(formData.get("asset_maintenance_cycle_enabled"))
          : false,
      maintenance_cycle_months:
        assetProfileTemplate === "industrial"
          ? (() => {
              const value = asNullableNumber(formData.get("asset_maintenance_cycle_months"));
              return value != null && Number.isFinite(value) && value >= 1 && value <= 60
                ? Math.trunc(value)
                : null;
            })()
          : null,
      maintenance_cycle_anchor_date:
        assetProfileTemplate === "industrial"
          ? asNullableDateText(asText(formData.get("asset_maintenance_cycle_anchor_date")))
          : null,
    };

    const { error: assetProfileErr } = await supabase
      .from("product_asset_profiles")
      .upsert(assetProfilePayload, { onConflict: "product_id" });
    if (assetProfileErr) redirectWithError(assetProfileErr.message);

    const maintenanceLines =
      assetProfileTemplate === "industrial"
        ? parseJsonArray<AssetMaintenanceLine>(formData.get("asset_maintenance_lines"))
        : [];
    const normalizedMaintenance = maintenanceLines
      .filter((line) => !line?._delete)
      .map((line) => ({
        id: asText((line?.id as string | undefined) ?? null) || null,
        product_id: productId,
        scheduled_date: asNullableDateText(line?.scheduled_date),
        performed_date: asNullableDateText(line?.performed_date),
        responsible: String(line?.responsible ?? "").trim() || null,
        maintenance_provider: String(line?.maintenance_provider ?? "").trim() || null,
        work_done: String(line?.work_done ?? "").trim() || null,
        parts_replaced: Boolean(line?.parts_replaced),
        replaced_parts: String(line?.replaced_parts ?? "").trim() || null,
        planner_bucket: (() => {
          const value = String(line?.planner_bucket ?? "mensual").trim().toLowerCase();
          if (
            value === "correctivo" ||
            value === "semanal" ||
            value === "mensual" ||
            value === "trimestral" ||
            value === "semestral" ||
            value === "anual"
          ) {
            return value;
          }
          return "mensual";
        })(),
      }))
      .filter(
        (line) =>
          line.scheduled_date ||
          line.performed_date ||
          line.responsible ||
          line.maintenance_provider ||
          line.work_done ||
          line.replaced_parts
      );

    const transferLines = parseJsonArray<AssetTransferLine>(
      formData.get("asset_transfer_lines")
    );
    const normalizedTransfers = transferLines
      .filter((line) => !line?._delete)
      .map((line) => ({
        id: asText((line?.id as string | undefined) ?? null) || null,
        product_id: productId,
        moved_at: asNullableDateText(line?.moved_at),
        from_location: String(line?.from_location ?? "").trim() || null,
        to_location: String(line?.to_location ?? "").trim() || null,
        responsible: String(line?.responsible ?? "").trim() || null,
        notes: String(line?.notes ?? "").trim() || null,
      }))
      .filter(
        (line) =>
          line.moved_at || line.from_location || line.to_location || line.responsible || line.notes
      );

    const [{ data: currentMaintenance }, { data: currentTransfers }] = await Promise.all([
      supabase
        .from("product_asset_maintenance_events")
        .select("id")
        .eq("product_id", productId),
      supabase.from("product_asset_transfer_events").select("id").eq("product_id", productId),
    ]);

    const existingMaintenanceIds = new Set(
      ((currentMaintenance ?? []) as Array<{ id: string }>).map((row) => String(row.id))
    );
    const incomingMaintenanceIds = new Set(
      normalizedMaintenance
        .map((row) => row.id)
        .filter((idValue): idValue is string => Boolean(idValue))
    );
    const maintenanceDeleteIds = Array.from(existingMaintenanceIds).filter(
      (idValue) => !incomingMaintenanceIds.has(idValue)
    );
    if (maintenanceDeleteIds.length) {
      const { error: maintenanceDeleteErr } = await supabase
        .from("product_asset_maintenance_events")
        .delete()
        .eq("product_id", productId)
        .in("id", maintenanceDeleteIds);
      if (maintenanceDeleteErr) redirectWithError(maintenanceDeleteErr.message);
    }

    const maintenanceInsertRows = normalizedMaintenance
      .filter((row) => !row.id)
      .map((row) => {
        const { id, ...rest } = row;
        void id;
        return rest;
      });
    const maintenanceUpsertRows = normalizedMaintenance
      .filter((row) => Boolean(row.id))
      .map((row) => ({ ...row, id: row.id as string }));
    if (maintenanceInsertRows.length) {
      const { error: maintenanceInsertErr } = await supabase
        .from("product_asset_maintenance_events")
        .insert(maintenanceInsertRows);
      if (maintenanceInsertErr) redirectWithError(maintenanceInsertErr.message);
    }
    if (maintenanceUpsertRows.length) {
      const { error: maintenanceUpsertErr } = await supabase
        .from("product_asset_maintenance_events")
        .upsert(maintenanceUpsertRows, { onConflict: "id" });
      if (maintenanceUpsertErr) redirectWithError(maintenanceUpsertErr.message);
    }

    const existingTransferIds = new Set(
      ((currentTransfers ?? []) as Array<{ id: string }>).map((row) => String(row.id))
    );
    const incomingTransferIds = new Set(
      normalizedTransfers
        .map((row) => row.id)
        .filter((idValue): idValue is string => Boolean(idValue))
    );
    const transferDeleteIds = Array.from(existingTransferIds).filter(
      (idValue) => !incomingTransferIds.has(idValue)
    );
    if (transferDeleteIds.length) {
      const { error: transferDeleteErr } = await supabase
        .from("product_asset_transfer_events")
        .delete()
        .eq("product_id", productId)
        .in("id", transferDeleteIds);
      if (transferDeleteErr) redirectWithError(transferDeleteErr.message);
    }

    const transferInsertRows = normalizedTransfers
      .filter((row) => !row.id)
      .map((row) => {
        const { id, ...rest } = row;
        void id;
        return rest;
      });
    const transferUpsertRows = normalizedTransfers
      .filter((row) => Boolean(row.id))
      .map((row) => ({ ...row, id: row.id as string }));
    if (transferInsertRows.length) {
      const { error: transferInsertErr } = await supabase
        .from("product_asset_transfer_events")
        .insert(transferInsertRows);
      if (transferInsertErr) redirectWithError(transferInsertErr.message);
    }
    if (transferUpsertRows.length) {
      const { error: transferUpsertErr } = await supabase
        .from("product_asset_transfer_events")
        .upsert(transferUpsertRows, { onConflict: "id" });
      if (transferUpsertErr) redirectWithError(transferUpsertErr.message);
    }
  } else {
    await Promise.all([
      supabase.from("product_asset_profiles").delete().eq("product_id", productId),
      supabase.from("product_asset_maintenance_events").delete().eq("product_id", productId),
      supabase.from("product_asset_transfer_events").delete().eq("product_id", productId),
    ]);
  }

  if (returnTo) {
    redirect(appendQueryParam(returnTo, "ok", "1"));
  }
  const fallbackTab = resolveCatalogTab(
    asText(formData.get("product_type")),
    asText(formData.get("inventory_kind"))
  );
  redirect(`/inventory/catalog?tab=${fallbackTab}&ok=1`);
}

export default async function ProductCatalogDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? "Cambios guardados." : "";
  const from = decodeCatalogReturnParam(sp.from);

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/catalog/${id}`,
    permissionCode: PERMISSION,
  });

  const { data: product } = await supabase
    .from("products")
    .select("id,name,description,sku,unit,stock_unit_code,product_type,category_id,price,cost,is_active,image_url,catalog_image_url")
    .eq("id", id)
    .maybeSingle();

  if (!product) notFound();

  const { data: profile } = await supabase
    .from("product_inventory_profiles")
    .select("product_id,track_inventory,inventory_kind,default_unit,unit_family,costing_mode,lot_tracking,expiry_tracking")
    .eq("product_id", id)
    .maybeSingle();

  const [{ data: assetProfileData }, { data: assetMaintenanceData }, { data: assetTransfersData }] =
    await Promise.all([
      supabase
        .from("product_asset_profiles")
        .select(
          "product_id,brand,model,serial_number,physical_location,purchase_invoice_url,commercial_value,purchase_date,started_use_date,equipment_status,maintenance_service_provider,technical_description,maintenance_cycle_enabled,maintenance_cycle_months,maintenance_cycle_anchor_date"
        )
        .eq("product_id", id)
        .maybeSingle(),
      supabase
        .from("product_asset_maintenance_events")
        .select(
          "id,scheduled_date,performed_date,responsible,maintenance_provider,work_done,parts_replaced,replaced_parts,planner_bucket"
        )
        .eq("product_id", id)
        .order("scheduled_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("product_asset_transfer_events")
        .select("id,moved_at,from_location,to_location,responsible,notes")
        .eq("product_id", id)
        .order("moved_at", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

  const allCategoryRows = await loadCategoryRows(supabase);

  const { data: siteSettingsWithAudience, error: siteSettingsAudienceError } = await supabase
    .from("product_site_settings")
    .select(
      "id,site_id,is_active,default_area_kind,area_kinds,min_stock_qty,min_stock_input_mode,min_stock_purchase_qty,min_stock_purchase_unit_code,min_stock_purchase_to_base_factor,audience,updated_at,created_at,sites(id,name)"
    )
    .eq("product_id", id);
  const siteSettings =
    !siteSettingsAudienceError
      ? siteSettingsWithAudience
      : (
          await supabase
            .from("product_site_settings")
            .select("id,site_id,is_active,default_area_kind,area_kinds,min_stock_qty,audience,updated_at,created_at,sites(id,name)")
            .eq("product_id", id)
        ).data ??
        (
          await supabase
            .from("product_site_settings")
            .select("id,site_id,is_active,default_area_kind,updated_at,created_at,sites(id,name)")
            .eq("product_id", id)
        ).data;
  const siteRowsRaw = ((siteSettings ?? []) as unknown as SiteSettingRow[]).map((row) => ({
    ...row,
    audience: row.audience ?? "BOTH",
  }));
  const siteRowsBySite = new Map<string, SiteSettingRow>();
  for (const row of siteRowsRaw) {
    const siteId = String(row.site_id ?? "").trim();
    if (!siteId) continue;
    const current = siteRowsBySite.get(siteId);
    if (!current) {
      siteRowsBySite.set(siteId, row);
      continue;
    }
    const currentRank = siteSettingRowRank(current);
    const nextRank = siteSettingRowRank(row);
    if (nextRank > currentRank || (nextRank === currentRank && siteSettingTs(row) > siteSettingTs(current))) {
      siteRowsBySite.set(siteId, row);
    }
  }
  const siteRows = Array.from(siteRowsBySite.values());

  const { data: sitesData } = await supabase
    .from("sites")
    .select("id,name,site_type")
    .eq("is_active", true)
    .neq("name", "App Review (Demo)")
    .order("name", { ascending: true });
  const sitesList = (sitesData ?? []) as SiteOptionRow[];

  const { data: areaKindsWithPurpose, error: areaKindsWithPurposeError } = await supabase
    .from("area_kinds")
    .select("code,name,use_for_remission")
    .order("name", { ascending: true });
  const areaKindsList = !areaKindsWithPurposeError
    ? ((areaKindsWithPurpose ?? []) as AreaKindRow[])
    : (((await supabase.from("area_kinds").select("code,name").order("name", { ascending: true })).data ??
        []) as AreaKindRow[]).map((row) => ({
        ...row,
        use_for_remission: ["mostrador", "bar", "cocina", "general"].includes(
          String(row.code ?? "").trim().toLowerCase()
        ),
      }));
  const { data: siteAreasData } = await supabase
    .from("areas")
    .select("site_id,kind,is_active")
    .eq("is_active", true);
  const siteAreaKindsList = Array.from(
    new Set(
      ((siteAreasData ?? []) as SiteAreaKindRow[])
        .map((row) => {
          const siteId = String(row.site_id ?? "").trim();
          const kind = String(row.kind ?? "").trim();
          return siteId && kind ? `${siteId}::${kind}` : "";
        })
        .filter(Boolean)
    )
  ).map((token) => {
    const [site_id, kind] = token.split("::");
    return { site_id, kind };
  });
  const satelliteSiteIds = sitesList
    .filter((site) => String(site.site_type ?? "").trim().toLowerCase() === "satellite")
    .map((site) => site.id);
  const { data: remissionAreaRulesData } =
    satelliteSiteIds.length > 0
      ? await supabase
          .from("site_area_purpose_rules")
          .select("site_id,area_kind,purpose,is_enabled")
          .eq("purpose", "remission")
          .eq("is_enabled", true)
          .in("site_id", satelliteSiteIds)
      : { data: [] as SiteAreaPurposeRuleRow[] };
  const remissionAreaKindsBySite = ((remissionAreaRulesData ?? []) as SiteAreaPurposeRuleRow[]).reduce(
    (acc, row) => {
      const siteId = String(row.site_id ?? "").trim();
      const areaKind = String(row.area_kind ?? "").trim();
      if (!siteId || !areaKind) return acc;
      const current = acc[siteId] ?? [];
      if (!current.includes(areaKind)) current.push(areaKind);
      acc[siteId] = current;
      return acc;
    },
    {} as Record<string, string[]>
  );

  const { data: unitsData } = await supabase
    .from("inventory_units")
    .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
    .eq("is_active", true)
    .order("family", { ascending: true })
    .order("factor_to_base", { ascending: true })
    .limit(500);
  const unitsList = (unitsData ?? []) as UnitRow[];

  const { data: supplierLinks } = await supabase
    .from("product_suppliers")
    .select("id,supplier_id,supplier_sku,purchase_unit,purchase_unit_size,purchase_pack_qty,purchase_pack_unit_code,purchase_price,purchase_price_net,purchase_price_includes_tax,purchase_tax_rate,purchase_price_includes_icui,purchase_icui_rate,currency,lead_time_days,min_order_qty,is_primary")
    .eq("product_id", id)
    .order("is_primary", { ascending: false });
  const supplierRows = (supplierLinks ?? []) as SupplierRow[];
  const { data: uomProfileData } = await supabase
    .from("product_uom_profiles")
    .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context")
    .eq("product_id", id)
    .eq("is_active", true)
    .eq("is_default", true);
  const defaultUomProfiles = (uomProfileData ?? []) as ProductUomProfileRow[];
  const profileByContext = new Map(
    defaultUomProfiles.map((profile) => [
      String(profile.usage_context ?? "general").trim().toLowerCase() || "general",
      profile,
    ])
  );
  const purchaseUomProfile =
    profileByContext.get("purchase") ?? profileByContext.get("general") ?? null;
  const remissionUomProfile =
    profileByContext.get("remission") ?? profileByContext.get("general") ?? null;

  const { data: suppliersData } = await supabase.from("suppliers").select("id,name").eq("is_active", true).order("name");
  const suppliersList = (suppliersData ?? []) as { id: string; name: string | null }[];

  const { data: galleryProductsData } = await supabase
    .from("products")
    .select("image_url,catalog_image_url")
    .or("image_url.not.is.null,catalog_image_url.not.is.null")
    .limit(300);
  const existingImageUrls = Array.from(
    new Set(
      ((galleryProductsData ?? []) as Array<{ image_url: string | null; catalog_image_url: string | null }>)
        .flatMap((row) => [row.image_url, row.catalog_image_url])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );

  // Recipe data (for preparacion and venta)
  const productType = (product as ProductRow).product_type;
  const hasRecipe =
    productType === "preparacion" ||
    (productType === "venta" &&
      String((profile as InventoryProfileRow | null)?.inventory_kind ?? "")
        .trim()
        .toLowerCase() !== "resale");
  const hasComputedCost = (product as ProductRow).cost != null && Number.isFinite(Number((product as ProductRow).cost));

  const [{ data: employee }, { data: settings }] = await Promise.all([
    supabase.from("employees").select("role,site_id").eq("id", user.id).maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", user.id)
      .maybeSingle(),
  ]);
  const role = String(employee?.role ?? "").toLowerCase();
  const canEdit = ["propietario", "gerente_general"].includes(role);

  const productRow = product as ProductRow;
  const profileRow = (profile ?? null) as InventoryProfileRow | null;
  const assetProfileRow = (assetProfileData ?? null) as AssetProfileRow | null;
  const assetMaintenanceRows = (assetMaintenanceData ?? []) as AssetMaintenanceLine[];
  const assetTransferRows = (assetTransfersData ?? []) as AssetTransferLine[];
  const normalizedProductType = String(productRow.product_type ?? "").trim().toLowerCase();
  const normalizedInventoryKind = String(profileRow?.inventory_kind ?? "").trim().toLowerCase();
  const isAssetItem = normalizedInventoryKind === "asset";
  const lockedInventoryKind = resolveLockedInventoryKind(
    productRow.product_type ?? "insumo",
    profileRow?.inventory_kind ?? ""
  );
  const lockedInventoryKindText = inventoryKindLabel(lockedInventoryKind);
  const hasSuppliers =
    (normalizedProductType === "insumo" && normalizedInventoryKind !== "asset") ||
    (normalizedProductType === "venta" && normalizedInventoryKind === "resale");
  const siteNamesById = Object.fromEntries(
    sitesList.map((site) => [site.id, site.name ?? site.id])
  );
  const categoryKind = resolveCategoryKindForProduct({
    productType: productRow.product_type,
    inventoryKind: profileRow?.inventory_kind ?? null,
  });
  const categorySiteId = String(
    sp.category_site_id ??
      (settings as { selected_site_id?: string | null } | null)?.selected_site_id ??
      (employee as { site_id?: string | null } | null)?.site_id ??
      ""
  ).trim();
  const defaultCategoryScope = categorySiteId ? "site" : "all";
  const requestedCategoryScope = normalizeCategoryScope(sp.category_scope ?? defaultCategoryScope);
  const requestedCategoryDomain = shouldShowCategoryDomain(categoryKind)
    ? normalizeCategoryDomain(sp.category_domain)
    : "";
  const isSaleCategoryKind = categoryKind === "venta";
  const categoryScope = isSaleCategoryKind ? "global" : requestedCategoryScope;
  const effectiveCategorySiteId = isSaleCategoryKind ? "" : categorySiteId;
  const categoryDomain = isSaleCategoryKind ? "" : requestedCategoryDomain;
  const categoryRows = filterCategoryRows(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: effectiveCategorySiteId,
  });
  const categoryDomainOptions = getCategoryDomainOptions(
    getCategoryDomainCodes(allCategoryRows, categoryKind)
  );
  const resolvedCategoryPath =
    allCategoryRows.find((row) => row.id === productRow.category_id)?.name?.trim() || "";
  const normalizedCategoryPath = resolvedCategoryPath.toLowerCase();
  const isMachineryAssetCategory =
    normalizedCategoryPath.includes("maquinaria y equipos") ||
    (normalizedCategoryPath.includes("maquinaria") &&
      (normalizedCategoryPath.includes("equipo") || normalizedCategoryPath.includes("equipos")));

  const stockUnitCode = normalizeUnitCode(productRow.stock_unit_code || productRow.unit || "un");
  const inventoryUnitMap = createUnitMap(unitsList);
  const requestedDefaultUnit = normalizeUnitCode(profileRow?.default_unit || stockUnitCode);
  const resolvedDefaultUnit = resolveCompatibleDefaultUnit({
    requestedDefaultUnit,
    stockUnitCode,
    unitMap: inventoryUnitMap,
  });

  const defaultUnitOptions = unitsList;
  const primarySupplier = supplierRows.find((row) => Boolean(row.is_primary)) ?? null;
  const autoCostReadinessReason = hasSuppliers
    ? getAutoCostReadinessReason({
        costingMode: profileRow?.costing_mode ?? "manual",
        stockUnitCode,
        primarySupplier,
        unitMap: inventoryUnitMap,
      })
    : null;
  const autoCostReady = hasSuppliers
    ? isAutoCostReady({
        costingMode: profileRow?.costing_mode ?? "manual",
        stockUnitCode,
        primarySupplier,
        unitMap: inventoryUnitMap,
      })
    : true;
  const operationUnitFromDefault = buildOperationUnitHintFromUnits({
    units: unitsList,
    inputUnitCode: resolvedDefaultUnit || stockUnitCode,
    stockUnitCode,
  });
  const { data: publishedRecipeRows } = await supabase
    .from("recipe_cards")
    .select("id")
    .eq("product_id", id)
    .eq("is_active", true)
    .eq("status", "published")
    .limit(1);
  const hasPublishedRecipePortion = (publishedRecipeRows ?? []).length > 0;

  const remissionSourceModeDefault:
    | "operation_unit"
    | "purchase_primary"
    | "remission_profile"
    | "recipe_portion" =
    remissionUomProfile?.source === "recipe_portion"
      ? "recipe_portion"
      : remissionUomProfile?.source === "supplier_primary"
      ? "purchase_primary"
      : remissionUomProfile &&
          operationUnitFromDefault &&
          normalizeUnitCode(remissionUomProfile.input_unit_code) ===
            normalizeUnitCode(operationUnitFromDefault.inputUnitCode) &&
          Math.abs(
            Number(remissionUomProfile.qty_in_stock_unit ?? 0) -
              Number(operationUnitFromDefault.qtyInStockUnit ?? 0)
          ) <= 0.0001
        ? "operation_unit"
        : remissionUomProfile
          ? "remission_profile"
          : "operation_unit";
  const siteTypeById = new Map(
    sitesList.map((site) => [String(site.id), String(site.site_type ?? "").trim().toLowerCase()])
  );
  const remissionEnabledDefault = siteRows.some((row) => {
    if (!row || !row.is_active) return false;
    const siteType = siteTypeById.get(String(row.site_id ?? "")) ?? "";
    return siteType === "satellite";
  });

  const supplierInitialRows = supplierRows.map((r) => ({
    id: r.id,
    supplier_id: r.supplier_id,
    supplier_sku: r.supplier_sku ?? "",
    purchase_unit: r.purchase_unit ?? "",
    purchase_unit_size: r.purchase_unit_size ?? undefined,
    purchase_pack_qty: r.purchase_pack_qty ?? r.purchase_unit_size ?? undefined,
    purchase_pack_unit_code: r.purchase_pack_unit_code ?? stockUnitCode,
    purchase_price: r.purchase_price ?? undefined,
    purchase_price_net: r.purchase_price_net ?? undefined,
    purchase_price_includes_tax: Boolean(r.purchase_price_includes_tax),
    purchase_tax_rate: r.purchase_tax_rate ?? undefined,
    purchase_price_includes_icui: Boolean(r.purchase_price_includes_icui),
    purchase_icui_rate: r.purchase_icui_rate ?? undefined,
    currency: r.currency ?? "COP",
    lead_time_days: r.lead_time_days ?? undefined,
    min_order_qty: r.min_order_qty ?? undefined,
    is_primary: Boolean(r.is_primary),
  }));

  return (
    <div className="ui-scene w-full space-y-8">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link
                href={from || "/inventory/catalog"}
                className="ui-btn ui-btn--ghost inline-flex h-12 items-center px-5 text-base font-semibold"
              >
                ← Volver al catálogo
              </Link>
              <h1 className="ui-h1">{productRow.name ?? "Ficha maestra"}</h1>
              <p className="ui-body-muted">
                Ficha maestra del producto: identidad operativa, compra, almacenamiento y setup por sede.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                {productRow.is_active === false ? "Inactivo" : "Activo"}
              </span>
              {productRow.sku ? (
                <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                  SKU {productRow.sku}
                </span>
              ) : null}
              {resolvedCategoryPath ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                  {resolvedCategoryPath}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/inventory/catalog/${productRow.id}/ficha?from=${encodeURIComponent(from || "/inventory/catalog")}`}
                className="ui-btn ui-btn--ghost"
              >
                Ver ficha técnica
              </Link>
            </div>
          </div>
          <div className="ui-remission-kpis ui-remission-kpis--stack sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Estado</div>
              <div className="ui-remission-kpi-value">{productRow.is_active === false ? "Off" : "On"}</div>
              <div className="ui-remission-kpi-note">Disponibilidad actual del maestro</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Tipo</div>
              <div className="ui-remission-kpi-value">
                {String(productRow.product_type ?? "insumo").trim().toLowerCase() === "venta"
                  ? "Venta"
                  : String(productRow.product_type ?? "insumo").trim().toLowerCase() === "preparacion"
                    ? "Prep"
                    : "Insumo"}
              </div>
              <div className="ui-remission-kpi-note">Clasificacion operativa del producto</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Sedes</div>
              <div className="ui-remission-kpi-value">{siteRows.length}</div>
              <div className="ui-remission-kpi-note">Configuraciones por sede en esta ficha</div>
            </article>
          </div>
        </div>
      </section>

      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}
      <CatalogOptionalDetails
        title="Criterio de esta ficha"
        summary="Abre este bloque solo si necesitas revisar el marco operativo o cambiar el arbol visible."
      >
        <CatalogHintPanel title="Ficha maestra">
          <p>
            Esta ficha concentra la identidad operativa del producto: categoria operativa, unidades, costo base,
            proveedor y setup por sede.
          </p>
          <p>
            Esta edicion es el flujo definitivo para mantener compras, costo automatico y abastecimiento entre sedes.
          </p>
        </CatalogHintPanel>
        {isSaleCategoryKind ? null : (
          <CatalogCategoryContextForm
            hiddenFields={from ? [{ name: "from", value: from }] : []}
            categoryScope={categoryScope}
            categorySiteId={effectiveCategorySiteId}
            categoryDomain={categoryDomain}
            showDomain={shouldShowCategoryDomain(categoryKind)}
            categoryDomainOptions={categoryDomainOptions}
            sites={sitesList.map((site) => ({ id: site.id, name: site.name }))}
          />
        )}
      </CatalogOptionalDetails>
      {hasSuppliers && profileRow?.costing_mode === "auto_primary_supplier" && autoCostReadinessReason ? (
        <div className="ui-alert ui-alert--warn">
          Auto-costo incompleto: {autoCostReadinessReason}
        </div>
      ) : null}

      {canEdit ? (
        <>
        <RequiredFieldsGuardForm
          action={updateProduct}
          className="space-y-8"
          persistKey={`catalog-edit-${productRow.id}`}
        >
          <input type="hidden" name="product_id" value={productRow.id} />
          <input type="hidden" name="return_to" value={from} />

          <CatalogSection
            title="Datos basicos"
            description="Identidad del item: nombre, SKU, tipo fijo, categoria operativa y descripcion."
          >
            <ProductIdentityFields
              nameLabel="Nombre del producto / insumo"
              namePlaceholder="Ej. Harina 000"
              nameDefaultValue={productRow.name ?? ""}
              categories={categoryRows}
              selectedCategoryId={productRow.category_id ?? ""}
              siteNamesById={siteNamesById}
              categoryEmptyOptionLabel="Sin categoria"
              descriptionDefaultValue={productRow.description ?? ""}
              skuField={{
                mode: "edit",
                currentSku: productRow.sku,
                initialProductType: productRow.product_type,
                initialInventoryKind: profileRow?.inventory_kind ?? "",
              }}
              lockedTypeField={{
                label: "Tipo",
                value:
                  String(productRow.product_type ?? "").trim().toLowerCase() === "venta"
                    ? "Venta"
                    : String(productRow.product_type ?? "").trim().toLowerCase() === "preparacion"
                      ? "Preparacion"
                      : "Insumo",
                hiddenName: "product_type",
                hiddenValue: productRow.product_type ?? "insumo",
              }}
              trailingContent={
                <div className="sm:col-span-2">
                  <ProductRemissionUomFields
                    units={unitsList.map((unit) => ({ code: unit.code, name: unit.name }))}
                    stockUnitCode={stockUnitCode}
                    defaultLabel={remissionUomProfile?.label ?? "Unidad operativa"}
                    defaultInputUnitCode={remissionUomProfile?.input_unit_code ?? resolvedDefaultUnit}
                    defaultQtyInStockUnit={remissionUomProfile?.qty_in_stock_unit ?? 1}
                    defaultSourceMode={remissionEnabledDefault ? remissionSourceModeDefault : "disabled"}
                    allowPurchasePrimaryOption={hasSuppliers}
                    allowRecipePortionOption={hasPublishedRecipePortion}
                  />
                </div>
              }
            />
          </CatalogSection>

          {/* Receta y produccion ahora viven en FOGO */}
          {hasRecipe && (
          <CatalogOptionalDetails
            title="Receta y produccion"
            summary="Esta configuracion queda fuera del flujo operativo actual."
          >
              <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)] space-y-2">
                <p>
                  NEXO mantiene inventario, sedes y logistica. Si luego activas produccion externa, la configuracion de receta se completa fuera de NEXO.
                </p>
                <a
                  href={buildFogoRecipeUrl(productRow.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex ui-btn ui-btn--ghost"
                >
                  Abrir continuidad externa
                </a>
              </div>
            </CatalogOptionalDetails>
          )}

          <CatalogSection
            title="Unidades y almacenamiento"
            description="Define unidad base, unidad operativa y politica de costo para inventario."
          >
            <ProductStorageFields
              stockUnitFieldId={STOCK_UNIT_FIELD_ID}
              units={defaultUnitOptions}
              stockUnitCode={stockUnitCode}
              defaultUnitCode={resolvedDefaultUnit}
              defaultRemissionMode={remissionEnabledDefault ? remissionSourceModeDefault : "disabled"}
              defaultUnitHint="Si no coincide con la familia de la unidad base, se guardara automaticamente la unidad base."
              preCostingFields={
                <>
                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Tipo de inventario</span>
                    <input type="hidden" name="inventory_kind" value={lockedInventoryKind} />
                    <div className="ui-input flex items-center">{lockedInventoryKindText}</div>
                    <span className="text-xs text-[var(--ui-muted)]">
                      Se define por el flujo de creacion y se mantiene bloqueado en edicion.
                    </span>
                  </label>
                  {String(productRow.product_type ?? "").trim().toLowerCase() === "venta" ? (
                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Precio base referencial</span>
                      <input
                        name="price"
                        type="number"
                        step="0.01"
                        defaultValue={productRow.price ?? ""}
                        className="ui-input"
                        placeholder="Opcional"
                      />
                      <span className="text-xs text-[var(--ui-muted)]">
                        El precio final se configura por sede/canal en la capa comercial.
                      </span>
                    </label>
                  ) : (
                    <input type="hidden" name="price" value={productRow.price ?? ""} />
                  )}
                </>
              }
              postCostingFields={
                <>
                  <input type="hidden" name="cost" value="" />
                  <ProductCostStatusPanel
                    hasSuppliers={hasSuppliers}
                    hasRecipe={hasRecipe}
                    hasComputedCost={hasComputedCost}
                    costingMode={profileRow?.costing_mode}
                    autoCostReady={autoCostReady}
                    autoCostReadinessReason={autoCostReadinessReason}
                    currentCost={productRow.cost}
                  />
                </>
              }
              costingModeField={{
                hasSuppliers,
                defaultValue: profileRow?.costing_mode ?? "auto_primary_supplier",
                autoOptionLabel: "Auto proveedor primario",
              }}
              trackingOptions={{
                trackInventoryDefaultChecked: Boolean(profileRow?.track_inventory),
                lotTrackingDefaultChecked: Boolean(profileRow?.lot_tracking),
                expiryTrackingDefaultChecked: Boolean(profileRow?.expiry_tracking),
              }}
            />
          </CatalogSection>

          <ProductPurchaseSection
            enabled={hasSuppliers}
            initialRows={supplierInitialRows}
            suppliers={suppliersList.map((s) => ({ id: s.id, name: s.name }))}
            units={unitsList}
            stockUnitCode={stockUnitCode}
            stockUnitFieldId={STOCK_UNIT_FIELD_ID}
          />

          <ProductPhotoSection
            description={
              isAssetItem
                ? "Imagen principal para identificar rapidamente el equipo o activo en catálogo y ficha técnica."
                : "Imagen principal para identificar rapidamente el item en catalogo y listados."
            }
            currentUrl={productRow.image_url}
            existingImageUrls={existingImageUrls}
            productId={productRow.id}
            sectionTitle={isAssetItem ? "Foto del equipo / activo" : "Foto del producto"}
            uploadLabel={isAssetItem ? "Foto del equipo" : "Foto del producto"}
            collapsible
          />

          {isAssetItem ? (
            <ProductAssetTechnicalSection
              defaultTemplate={isMachineryAssetCategory ? "industrial" : "general"}
              initialProfile={{
                brand: assetProfileRow?.brand ?? "",
                model: assetProfileRow?.model ?? "",
                serial_number: assetProfileRow?.serial_number ?? "",
                physical_location: assetProfileRow?.physical_location ?? "",
                purchase_invoice_url: assetProfileRow?.purchase_invoice_url ?? "",
                commercial_value: assetProfileRow?.commercial_value ?? null,
                purchase_date: assetProfileRow?.purchase_date ?? "",
                started_use_date: assetProfileRow?.started_use_date ?? "",
                equipment_status: assetProfileRow?.equipment_status ?? "operativo",
                maintenance_service_provider:
                  assetProfileRow?.maintenance_service_provider ?? "",
                technical_description: assetProfileRow?.technical_description ?? "",
                maintenance_cycle_enabled: assetProfileRow?.maintenance_cycle_enabled ?? false,
                maintenance_cycle_months: assetProfileRow?.maintenance_cycle_months ?? null,
                maintenance_cycle_anchor_date:
                  assetProfileRow?.maintenance_cycle_anchor_date ?? "",
              }}
              initialMaintenance={assetMaintenanceRows}
              initialTransfers={assetTransferRows}
              siteOptions={siteRows.map((site) => ({
                id: site.site_id,
                name: siteNamesById[site.site_id] || "Sede",
              }))}
            />
          ) : null}

          {!isAssetItem ? (
            <ProductSiteAvailabilitySection
              initialRows={siteRows.map((r) => ({
                id: r.id,
                site_id: r.site_id,
                is_active: Boolean(r.is_active),
                default_area_kind: r.default_area_kind ?? "",
                area_kinds:
                  Array.isArray(r.area_kinds) && r.area_kinds.length
                    ? r.area_kinds
                    : r.default_area_kind
                      ? [r.default_area_kind]
                      : [],
                min_stock_qty: r.min_stock_qty ?? undefined,
                min_stock_input_mode: r.min_stock_input_mode === "purchase" ? "purchase" : "base",
                min_stock_purchase_qty: r.min_stock_purchase_qty ?? undefined,
                min_stock_purchase_unit_code: r.min_stock_purchase_unit_code ?? undefined,
                min_stock_purchase_to_base_factor: r.min_stock_purchase_to_base_factor ?? undefined,
                audience: r.audience ?? "BOTH",
              }))}
              sites={sitesList.map((s) => ({ id: s.id, name: s.name, site_type: s.site_type }))}
              areaKinds={areaKindsList.map((a) => ({
                code: a.code,
                name: a.name ?? a.code,
                use_for_remission: Boolean(a.use_for_remission),
              }))}
              siteAreaKinds={siteAreaKindsList}
              remissionAreaKindsBySite={remissionAreaKindsBySite}
              stockUnitCode={stockUnitCode}
              purchaseUnitHint={
                purchaseUomProfile
                  ? {
                      label: purchaseUomProfile.label,
                      inputUnitCode: purchaseUomProfile.input_unit_code,
                      qtyInInputUnit: purchaseUomProfile.qty_in_input_unit,
                      qtyInStockUnit: purchaseUomProfile.qty_in_stock_unit,
                    }
                  : null
              }
              operationUnitHint={
                remissionUomProfile
                  ? {
                      label: remissionUomProfile.label,
                      inputUnitCode: remissionUomProfile.input_unit_code,
                      qtyInInputUnit: remissionUomProfile.qty_in_input_unit,
                      qtyInStockUnit: remissionUomProfile.qty_in_stock_unit,
                    }
                  : buildOperationUnitHintFromUnits({
                      units: unitsList,
                      inputUnitCode: resolvedDefaultUnit || stockUnitCode,
                      stockUnitCode,
                    })
              }
            />
          ) : null}

          <ProductFormFooter
            submitLabel="Guardar cambios"
            showActiveToggle
            activeDefaultChecked={Boolean(productRow.is_active)}
          />
        </RequiredFieldsGuardForm>
        </>
      ) : (
        <div className="ui-alert ui-alert--warn">
          Solo propietarios y gerentes generales pueden editar la ficha maestra.
        </div>
      )}
    </div>
  );
}
