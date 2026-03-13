import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProductChecklistPanel } from "@/features/inventory/catalog/product-checklist-panel";
import { ProductCostStatusPanel } from "@/features/inventory/catalog/product-cost-status-panel";
import { ProductFormFooter } from "@/features/inventory/catalog/product-form-footer";
import { ProductIdentityFields } from "@/features/inventory/catalog/product-identity-fields";
import { ProductPhotoSection } from "@/features/inventory/catalog/product-photo-section";
import { ProductPurchaseSection } from "@/features/inventory/catalog/product-purchase-section";
import { ProductSiteAvailabilitySection } from "@/features/inventory/catalog/product-site-availability-section";
import { ProductStorageFields } from "@/features/inventory/catalog/product-storage-fields";
import { ProductUomProfilePanel } from "@/features/inventory/catalog/product-uom-profile-panel";
import {
  CatalogCategoryContextForm,
  CatalogHintPanel,
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

type AreaKindRow = { code: string; name: string | null };
type SiteOptionRow = { id: string; name: string | null; site_type: string | null };
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
  source: "manual" | "supplier_primary";
  usage_context: "general" | "purchase" | "remission" | null;
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

function resolveNetPurchasePrice(params: {
  purchasePrice: number | null;
  purchasePriceIncludesTax: boolean;
  purchaseTaxRate: number;
}): number | null {
  const gross = Number(params.purchasePrice ?? 0);
  if (!Number.isFinite(gross) || gross <= 0) return null;
  if (!params.purchasePriceIncludesTax) return gross;
  const safeTaxRate = Number.isFinite(params.purchaseTaxRate) && params.purchaseTaxRate >= 0
    ? params.purchaseTaxRate
    : 0;
  const divisor = 1 + safeTaxRate / 100;
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
      "min_stock_input_mode",
      "min_stock_purchase_qty",
      "min_stock_purchase_unit_code",
      "min_stock_purchase_to_base_factor",
    ],
    [
      "min_stock_input_mode",
      "min_stock_purchase_qty",
      "min_stock_purchase_unit_code",
      "min_stock_purchase_to_base_factor",
      "audience",
    ],
    [
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
  const inventoryKindValue = asText(formData.get("inventory_kind")) || null;

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
      redirectWithError("En v1 los productos de venta solo pueden usar categorias maestras globales.");
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
      }
    | null = null;
  const supplierLinesRaw = formData.get("supplier_lines");
  if (typeof supplierLinesRaw === "string" && supplierLinesRaw) {
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
      currency?: string;
      lead_time_days?: number;
      min_order_qty?: number;
      is_primary?: boolean;
      use_in_operations?: boolean;
      _delete?: boolean;
    }> = [];
    try {
      lines = JSON.parse(supplierLinesRaw) as typeof lines;
    } catch {
      redirectWithError("No se pudo leer el bloque de proveedores. Recarga la pagina e intenta de nuevo.");
    }
    await supabase.from("product_suppliers").delete().eq("product_id", productId);
    for (const line of lines) {
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
      const purchasePriceNet = resolveNetPurchasePrice({
        purchasePrice,
        purchasePriceIncludesTax,
        purchaseTaxRate,
      });
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
            if (Boolean(line.use_in_operations)) {
              remissionUomFromSupplier = {
                label: String(line.purchase_unit || "Empaque operativo"),
                inputUnitCode: packUnitCode,
                qtyInInputUnit: 1,
                qtyInStockUnit,
              };
            }
          }
        } catch {
          // Keep previous profile if conversion is invalid.
        }
      }
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
        currency: line.currency || "COP",
        lead_time_days: line.lead_time_days ?? null,
        min_order_qty: line.min_order_qty ?? null,
        is_primary: Boolean(line.is_primary),
      });
      if (supplierErr) redirectWithError(supplierErr.message);
    }
  }

  async function upsertContextProfile(params: {
    usageContext: "purchase" | "remission";
    label: string;
    inputUnitCode: string;
    qtyInInputUnit: number;
    qtyInStockUnit: number;
    source: "manual" | "supplier_primary";
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
      source: "supplier_primary",
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
      const row = {
        product_id: productId,
        site_id: line.site_id,
        is_active: Boolean(line.is_active),
        default_area_kind: line.default_area_kind || null,
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
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
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

  const allCategoryRows = await loadCategoryRows(supabase);

  const { data: siteSettingsWithAudience, error: siteSettingsAudienceError } = await supabase
    .from("product_site_settings")
    .select(
      "id,site_id,is_active,default_area_kind,min_stock_qty,min_stock_input_mode,min_stock_purchase_qty,min_stock_purchase_unit_code,min_stock_purchase_to_base_factor,audience,updated_at,created_at,sites(id,name)"
    )
    .eq("product_id", id);
  const siteSettings =
    !siteSettingsAudienceError
      ? siteSettingsWithAudience
      : (
          await supabase
            .from("product_site_settings")
            .select("id,site_id,is_active,default_area_kind,min_stock_qty,audience,updated_at,created_at,sites(id,name)")
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
    .order("name", { ascending: true });
  const sitesList = (sitesData ?? []) as SiteOptionRow[];

  const { data: areaKindsData } = await supabase.from("area_kinds").select("code,name").order("name", { ascending: true });
  const areaKindsList = (areaKindsData ?? []) as AreaKindRow[];

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
    .select("id,supplier_id,supplier_sku,purchase_unit,purchase_unit_size,purchase_pack_qty,purchase_pack_unit_code,purchase_price,purchase_price_net,purchase_price_includes_tax,purchase_tax_rate,currency,lead_time_days,min_order_qty,is_primary")
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
  const normalizedProductType = String(productRow.product_type ?? "").trim().toLowerCase();
  const normalizedInventoryKind = String(profileRow?.inventory_kind ?? "").trim().toLowerCase();
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
  const remissionInputUnitCode = remissionUomProfile
    ? normalizeUnitCode(remissionUomProfile.input_unit_code)
    : "";

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
    currency: r.currency ?? "COP",
    lead_time_days: r.lead_time_days ?? undefined,
    min_order_qty: r.min_order_qty ?? undefined,
    is_primary: Boolean(r.is_primary),
    use_in_operations:
      Boolean(r.is_primary) &&
      Boolean(remissionInputUnitCode) &&
      remissionInputUnitCode ===
        normalizeUnitCode(r.purchase_pack_unit_code ?? stockUnitCode),
  }));

  return (
    <div className="ui-scene w-full space-y-8">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link href={from || "/inventory/catalog"} className="ui-caption underline">Volver al catalogo</Link>
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
              <Link href="/inventory/ai-ingestions?flow=catalog_create" className="ui-btn ui-btn--brand">
                IA productos
              </Link>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
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

      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}
      <CatalogHintPanel title="Ficha maestra v1">
        <p>
          Esta ficha concentra la identidad operativa del producto: categoria operativa, unidades, costo base,
          proveedor y setup por sede.
        </p>
        <p>
          La logica comercial por negocio no se define aqui. La compatibilidad de v1 sigue guardandose por debajo,
          pero ya no es el centro del flujo.
        </p>
      </CatalogHintPanel>
      {hasSuppliers && profileRow?.costing_mode === "auto_primary_supplier" && autoCostReadinessReason ? (
        <div className="ui-alert ui-alert--warn">
          Auto-costo incompleto: {autoCostReadinessReason}
        </div>
      ) : null}

      {canEdit ? (
        <>
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

        <form action={updateProduct} className="space-y-8">
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
                value:
                  String(productRow.product_type ?? "").trim().toLowerCase() === "venta"
                    ? "Venta"
                    : String(productRow.product_type ?? "").trim().toLowerCase() === "preparacion"
                      ? "Preparacion"
                      : "Insumo",
                hiddenName: "product_type",
                hiddenValue: productRow.product_type ?? "insumo",
                hint: "El tipo se define al crear y no se cambia en edicion.",
              }}
            />
          </CatalogSection>

          {/* Receta y produccion ahora viven en FOGO */}
          {hasRecipe && (
            <CatalogSection
              title="Receta y produccion"
              description="Esta configuracion queda fuera del flujo operativo v1."
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
            </CatalogSection>
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
              defaultUnitHint="Si no coincide con la familia de la unidad base, se guardara automaticamente la unidad base."
              profilePanel={
                <ProductUomProfilePanel
                  stockUnitCode={stockUnitCode}
                  purchaseUomProfile={purchaseUomProfile}
                  remissionUomProfile={remissionUomProfile}
                />
              }
              preCostingFields={
                <>
                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Tipo de inventario</span>
                    <select
                      name="inventory_kind"
                      defaultValue={profileRow?.inventory_kind ?? "unclassified"}
                      className="ui-input"
                    >
                      <option value="unclassified">Sin clasificar</option>
                      <option value="ingredient">Insumo</option>
                      <option value="finished">Producto terminado</option>
                      <option value="resale">Reventa</option>
                      <option value="packaging">Empaque</option>
                      <option value="asset">Activo</option>
                    </select>
                  </label>
                  {String(productRow.product_type ?? "").trim().toLowerCase() === "venta" ? (
                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Precio de venta</span>
                      <input
                        name="price"
                        type="number"
                        step="0.01"
                        defaultValue={productRow.price ?? ""}
                        className="ui-input"
                        placeholder="0.00"
                      />
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
            description="Imagen principal para identificar rapidamente el item en catalogo y listados."
            currentUrl={productRow.image_url}
            productId={productRow.id}
          />

          <ProductSiteAvailabilitySection
            initialRows={siteRows.map((r) => ({
              id: r.id,
              site_id: r.site_id,
              is_active: Boolean(r.is_active),
              default_area_kind: r.default_area_kind ?? "",
              min_stock_qty: r.min_stock_qty ?? undefined,
              min_stock_input_mode: r.min_stock_input_mode === "purchase" ? "purchase" : "base",
              min_stock_purchase_qty: r.min_stock_purchase_qty ?? undefined,
              min_stock_purchase_unit_code: r.min_stock_purchase_unit_code ?? undefined,
              min_stock_purchase_to_base_factor: r.min_stock_purchase_to_base_factor ?? undefined,
              audience: r.audience ?? "BOTH",
            }))}
            sites={sitesList.map((s) => ({ id: s.id, name: s.name, site_type: s.site_type }))}
            areaKinds={areaKindsList.map((a) => ({ code: a.code, name: a.name ?? a.code }))}
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

          <ProductChecklistPanel
            items={[
              "Unidad base definida (donde viven stock, costo y recetas).",
              hasSuppliers
                ? "Proveedor principal completo (empaque, cantidad, unidad y precio)."
                : "Clasificacion y categoria revisadas para este tipo de item.",
              "Sedes configuradas (disponible, area por defecto y setup por sede).",
              "Si aplica, receta completa con ingredientes y pasos.",
            ]}
          />

          <ProductFormFooter
            submitLabel="Guardar cambios"
            showActiveToggle
            activeDefaultChecked={Boolean(productRow.is_active)}
          />
        </form>
        </>
      ) : (
        <div className="ui-alert ui-alert--warn">
          Solo propietarios y gerentes generales pueden editar la ficha maestra.
        </div>
      )}

      <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
        <strong className="text-[var(--ui-text)]">Ubicaciones (LOCs)</strong> - Crea las en{" "}
        <Link href="/inventory/locations" className="font-medium underline decoration-[var(--ui-border)] underline-offset-2">
          Inventario / Ubicaciones
        </Link>
        . En Entradas asignas cada item a un LOC al recibir.
      </div>
    </div>
  );
}
