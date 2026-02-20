import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CategoryTreeFilter } from "@/components/inventory/CategoryTreeFilter";
import { SkuField } from "@/components/inventory/SkuField";
import { PageHeader } from "@/components/vento/standard/page-header";
import { ProductImageUpload } from "@/features/inventory/catalog/product-image-upload";
import { ProductSiteSettingsEditor } from "@/features/inventory/catalog/product-site-settings-editor";
import { ProductSuppliersEditor } from "@/features/inventory/catalog/product-suppliers-editor";
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
  audience: "SAUDO" | "VCF" | "BOTH" | "INTERNAL" | null;
  sites?: { id: string; name: string | null } | null;
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
  const costingMode: "auto_primary_supplier" | "manual" =
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
    if (!categorySupportsKind(category, categoryKind)) {
      redirectWithError("La categoria no aplica al tipo de item seleccionado.");
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
    try {
      const lines = JSON.parse(supplierLinesRaw) as Array<{
        id?: string;
        supplier_id?: string;
        supplier_sku?: string;
        purchase_unit?: string;
        purchase_unit_size?: number;
        purchase_pack_qty?: number;
        purchase_pack_unit_code?: string;
        purchase_price?: number;
        currency?: string;
        lead_time_days?: number;
        min_order_qty?: number;
        is_primary?: boolean;
        use_in_operations?: boolean;
        _delete?: boolean;
      }>;
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
        if (
          costingMode === "auto_primary_supplier" &&
          Boolean(line.is_primary) &&
          purchasePrice != null &&
          purchasePrice > 0 &&
          packQty > 0 &&
          packUnitCode
        ) {
          try {
            autoCostFromPrimary = computeAutoCostFromPrimarySupplier({
              packPrice: purchasePrice,
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
          currency: line.currency || "COP",
          lead_time_days: line.lead_time_days ?? null,
          min_order_qty: line.min_order_qty ?? null,
          is_primary: Boolean(line.is_primary),
        });
        if (supplierErr) redirectWithError(supplierErr.message);
      }
    } catch {
      // ignore invalid JSON
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
    try {
      const siteLines = JSON.parse(siteSettingsRaw) as Array<{
        id?: string;
        site_id?: string;
        is_active?: boolean;
        default_area_kind?: string;
        min_stock_qty?: number | string;
        audience?: string;
        _delete?: boolean;
      }>;
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
        const row = {
          product_id: productId,
          site_id: line.site_id,
          is_active: Boolean(line.is_active),
          default_area_kind: line.default_area_kind || null,
          min_stock_qty:
            line.min_stock_qty == null || String(line.min_stock_qty).trim() === ""
              ? null
              : Number(line.min_stock_qty),
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
          let { error: upErr } = await supabase.from("product_site_settings").update(row).eq("id", line.id);
          if (upErr && upErr.code === "42703") {
            const legacyRow = {
              product_id: productId,
              site_id: line.site_id,
              is_active: Boolean(line.is_active),
              default_area_kind: line.default_area_kind || null,
            };
            ({ error: upErr } = await supabase
              .from("product_site_settings")
              .update(legacyRow)
              .eq("id", line.id));
          }
          if (upErr) redirectWithError(upErr.message);
        } else {
          let { error: insErr } = await supabase.from("product_site_settings").insert(row);
          if (insErr && insErr.code === "42703") {
            const legacyRow = {
              product_id: productId,
              site_id: line.site_id,
              is_active: Boolean(line.is_active),
              default_area_kind: line.default_area_kind || null,
            };
            ({ error: insErr } = await supabase.from("product_site_settings").insert(legacyRow));
          }
          if (insErr) redirectWithError(insErr.message);
        }
      }
    } catch {
      // ignore
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
    .select("id,site_id,is_active,default_area_kind,min_stock_qty,audience,sites(id,name)")
    .eq("product_id", id);
  const siteSettings =
    !siteSettingsAudienceError
      ? siteSettingsWithAudience
      : (
          await supabase
            .from("product_site_settings")
            .select("id,site_id,is_active,default_area_kind,audience,sites(id,name)")
            .eq("product_id", id)
        ).data ??
        (
          await supabase
            .from("product_site_settings")
            .select("id,site_id,is_active,default_area_kind,sites(id,name)")
            .eq("product_id", id)
        ).data;
  const siteRows = ((siteSettings ?? []) as unknown as SiteSettingRow[]).map((row) => ({
    ...row,
    audience: row.audience ?? "BOTH",
  }));

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
    .select("id,supplier_id,supplier_sku,purchase_unit,purchase_unit_size,purchase_pack_qty,purchase_pack_unit_code,purchase_price,currency,lead_time_days,min_order_qty,is_primary")
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
  const suppliersStepNumber = "3";
  const photoStepNumber = hasSuppliers ? "4" : "3";
  const distributionStepNumber = hasSuppliers ? "5" : "4";
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
  const categoryScope = normalizeCategoryScope(sp.category_scope ?? defaultCategoryScope);
  const categoryDomain = shouldShowCategoryDomain(categoryKind)
    ? normalizeCategoryDomain(sp.category_domain)
    : "";
  const categoryRows = filterCategoryRows(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: categorySiteId,
  });
  const categoryDomainOptions = getCategoryDomainOptions(
    getCategoryDomainCodes(allCategoryRows, categoryKind)
  );

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
  const autoCostReadinessReason = getAutoCostReadinessReason({
    costingMode: profileRow?.costing_mode ?? "manual",
    stockUnitCode,
    primarySupplier,
    unitMap: inventoryUnitMap,
  });
  const autoCostReady = isAutoCostReady({
    costingMode: profileRow?.costing_mode ?? "manual",
    stockUnitCode,
    primarySupplier,
    unitMap: inventoryUnitMap,
  });
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
    <div className="w-full space-y-8">
      <PageHeader
        title={productRow.name ?? "Ficha maestra"}
        subtitle="Catalogo del insumo o producto: compra, almacenamiento y distribucion."
        actions={
          <Link href={from || "/inventory/catalog"} className="ui-btn ui-btn--ghost">
            Volver al catalogo
          </Link>
        }
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}
      {profileRow?.costing_mode === "auto_primary_supplier" && autoCostReadinessReason ? (
        <div className="ui-alert ui-alert--warn">
          Auto-costo incompleto: {autoCostReadinessReason}
        </div>
      ) : null}

      {canEdit ? (
        <>
        <form method="get" className="ui-panel grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {from ? <input type="hidden" name="from" value={from} /> : null}
          <label className="flex flex-col gap-1">
            <span className="ui-label">Alcance de categoria</span>
            <select name="category_scope" defaultValue={categoryScope} className="ui-input">
              <option value="all">Todas</option>
              <option value="global">Globales</option>
              <option value="site">Sede activa</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede para categorias</span>
            <select name="category_site_id" defaultValue={categorySiteId} className="ui-input">
              <option value="">Seleccionar sede</option>
              {sitesList.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
          </label>
          {shouldShowCategoryDomain(categoryKind) ? (
            <label className="flex flex-col gap-1">
              <span className="ui-label">Dominio de venta</span>
              <select name="category_domain" defaultValue={categoryDomain} className="ui-input">
                <option value="">Todos</option>
                {categoryDomainOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex items-end">
            <button className="ui-btn ui-btn--ghost">Actualizar categorias</button>
          </div>
        </form>

        <form action={updateProduct} className="space-y-8">
          <input type="hidden" name="product_id" value={productRow.id} />
          <input type="hidden" name="return_to" value={from} />

          {/* Paso 1: Datos basicos */}
          <section className="ui-panel space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">1</span>
              <div>
                <h2 className="ui-h3">Datos basicos</h2>
                <p className="text-sm text-[var(--ui-muted)]">
                  Identidad del item: nombre, SKU, tipo fijo, categoria y descripcion.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="ui-label">Nombre del producto / insumo</span>
                <input name="name" defaultValue={productRow.name ?? ""} className="ui-input" placeholder="Ej. Harina 000" required />
              </label>
              <SkuField
                mode="edit"
                currentSku={productRow.sku}
                initialProductType={productRow.product_type}
                initialInventoryKind={profileRow?.inventory_kind ?? ""}
                className="flex flex-col gap-1"
              />
              <label className="flex flex-col gap-1">
                <span className="ui-label">Tipo (bloqueado)</span>
                <input
                  className="ui-input"
                  value={
                    String(productRow.product_type ?? "").trim().toLowerCase() === "venta"
                      ? "Venta"
                      : String(productRow.product_type ?? "").trim().toLowerCase() === "preparacion"
                        ? "Preparacion"
                        : "Insumo"
                  }
                  readOnly
                />
                <input type="hidden" name="product_type" value={productRow.product_type ?? "insumo"} />
                <span className="text-xs text-[var(--ui-muted)]">
                  El tipo se define al crear y no se cambia en edicion.
                </span>
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="ui-label">Descripcion</span>
                <input name="description" defaultValue={productRow.description ?? ""} className="ui-input" placeholder="Opcional" />
              </label>
              <CategoryTreeFilter
                categories={categoryRows}
                selectedCategoryId={productRow.category_id ?? ""}
                siteNamesById={siteNamesById}
                className="sm:col-span-2"
                label="Categoria"
                emptyOptionLabel="Sin categoria"
                maxVisibleOptions={8}
                selectionMode="leaf_only"
                nonSelectableHint="Categoria padre"
              />
            </div>

          </section>

          {/* Receta y produccion ahora viven en FOGO */}
          {hasRecipe && (
            <section className="ui-panel space-y-6">
              <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">R</span>
                <div>
                  <h2 className="ui-h3">Receta y produccion</h2>
                  <p className="text-sm text-[var(--ui-muted)]">
                    Desde ahora, BOM, pasos y medios se gestionan solo en FOGO.
                  </p>
                </div>
              </div>
              <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)] space-y-2">
                <p>
                  NEXO mantiene inventario, sedes y logistica. La configuracion de receta se edita en FOGO.
                </p>
                <a
                  href={buildFogoRecipeUrl(productRow.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex ui-btn ui-btn--ghost"
                >
                  Gestionar receta en FOGO
                </a>
              </div>
            </section>
          )}

          {/* Paso 2: Unidades y almacenamiento */}
          <section className="ui-panel space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">2</span>
              <div>
                <h2 className="ui-h3">Unidades y almacenamiento</h2>
                <p className="text-sm text-[var(--ui-muted)]">
                  Define unidad base, unidad operativa y politica de costo para inventario.
                </p>
              </div>
            </div>

            <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
              <p className="font-medium text-[var(--ui-text)]">Regla clara de unidades</p>
              <p className="mt-1">Unidad base: donde viven stock, costo y recetas.</p>
              <p>Unidad de compra: se define en proveedor (empaque y precio).</p>
              <p>Unidad operativa: sugerida para formularios cuando no hay empaque activo.</p>
            </div>
            {purchaseUomProfile || remissionUomProfile ? (
              <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
                <p>
                  <strong className="text-[var(--ui-text)]">Unidad base (consumo y costo):</strong>{" "}
                  {stockUnitCode}
                </p>
                {purchaseUomProfile ? (
                  <p>
                    <strong className="text-[var(--ui-text)]">Presentacion compra:</strong>{" "}
                    {purchaseUomProfile.label} ({purchaseUomProfile.qty_in_input_unit}{" "}
                    {purchaseUomProfile.input_unit_code} ={" "}
                    {purchaseUomProfile.qty_in_stock_unit} {stockUnitCode})
                  </p>
                ) : null}
                {remissionUomProfile ? (
                  <p>
                    <strong className="text-[var(--ui-text)]">Presentacion remision:</strong>{" "}
                    {remissionUomProfile.label} ({remissionUomProfile.qty_in_input_unit}{" "}
                    {remissionUomProfile.input_unit_code} ={" "}
                    {remissionUomProfile.qty_in_stock_unit} {stockUnitCode})
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Unidad base de stock</span>
                <select
                  id={STOCK_UNIT_FIELD_ID}
                  name="stock_unit_code"
                  defaultValue={stockUnitCode}
                  className="ui-input"
                  required
                >
                  {unitsList.map((unit) => (
                    <option key={unit.code} value={unit.code}>
                      {unit.code} - {unit.name} ({unit.family})
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[var(--ui-muted)]">
                  Esta unidad es la referencia canonica para entradas, salidas y conteos.
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Unidad operativa (formularios)</span>
                <select name="default_unit" defaultValue={resolvedDefaultUnit} className="ui-input">
                  {defaultUnitOptions.map((unit) => (
                    <option key={unit.code} value={unit.code}>
                      {unit.code} - {unit.name} ({unit.family})
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[var(--ui-muted)]">
                  Si no coincide con la familia de la unidad base, se guardara automaticamente la unidad base.
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Tipo de inventario</span>
                <select name="inventory_kind" defaultValue={profileRow?.inventory_kind ?? "unclassified"} className="ui-input">
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
              <input type="hidden" name="cost" value="" />
              <label className="flex flex-col gap-1">
                <span className="ui-label">Politica de costo</span>
                <select
                  name="costing_mode"
                  defaultValue={profileRow?.costing_mode ?? "auto_primary_supplier"}
                  className="ui-input"
                >
                  <option value="auto_primary_supplier">Auto proveedor primario</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3 text-sm text-[var(--ui-muted)] md:col-span-2">
                <p className="font-medium text-[var(--ui-text)]">
                  Estado de costo:{" "}
                  {profileRow?.costing_mode === "manual"
                    ? "Manual"
                    : autoCostReady
                      ? "Listo"
                      : "Incompleto"}
                </p>
                <p className="mt-1">
                  Costo actual:{" "}
                  <strong className="text-[var(--ui-text)]">
                    {productRow.cost != null ? `$${Number(productRow.cost).toLocaleString("es-CO")}` : "Sin calcular"}
                  </strong>
                </p>
                {profileRow?.costing_mode === "auto_primary_supplier" ? (
                  <p className="mt-1">
                    {autoCostReadinessReason
                      ? `Falta completar: ${autoCostReadinessReason}`
                      : "Se actualiza automaticamente con proveedor primario y entradas."}
                  </p>
                ) : (
                  <p className="mt-1">
                    Modo manual activo. Puedes volver a automatico cuando quieras.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="track_inventory" defaultChecked={Boolean(profileRow?.track_inventory)} />
                <span className="ui-label">Controlar stock</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="lot_tracking" defaultChecked={Boolean(profileRow?.lot_tracking)} />
                <span className="ui-label">Lotes</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="expiry_tracking" defaultChecked={Boolean(profileRow?.expiry_tracking)} />
                <span className="ui-label">Vencimiento</span>
              </label>
            </div>
          </section>

          {hasSuppliers ? (
            <section className="ui-panel space-y-6">
              <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">
                  {suppliersStepNumber}
                </span>
                <div>
                  <h2 className="ui-h3">Compra principal (proveedor)</h2>
                  <p className="text-sm text-[var(--ui-muted)]">
                    Define empaque, unidad y precio de compra. El sistema convierte todo a unidad base.
                  </p>
                </div>
              </div>
              <ProductSuppliersEditor
                name="supplier_lines"
                initialRows={supplierInitialRows}
                suppliers={suppliersList.map((s) => ({ id: s.id, name: s.name }))}
                units={unitsList.map((unit) => ({
                  code: unit.code,
                  name: unit.name,
                  family: unit.family,
                  factor_to_base: unit.factor_to_base,
                }))}
                stockUnitCode={stockUnitCode}
                stockUnitCodeFieldId={STOCK_UNIT_FIELD_ID}
                mode="simple"
              />
            </section>
          ) : (
            <input type="hidden" name="supplier_lines" value="[]" />
          )}

          <section className="ui-panel space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">
                {photoStepNumber}
              </span>
              <div>
                <h2 className="ui-h3">Foto del producto</h2>
                <p className="text-sm text-[var(--ui-muted)]">
                  Imagen principal para identificar rapidamente el item en catalogo y listados.
                </p>
              </div>
            </div>
            <ProductImageUpload
              name="image_url"
              label="Foto del producto"
              currentUrl={productRow.image_url}
              productId={productRow.id}
              kind="product"
            />
          </section>

          {/* Paso final: Distribucion por sede */}
          <section className="ui-panel space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">
                {distributionStepNumber}
              </span>
              <div>
                <h2 className="ui-h3">Disponibilidad por sede</h2>
                <p className="text-sm text-[var(--ui-muted)]">
                  Define en que sede se usa este producto, area sugerida y uso (Saudo / Vento Cafe).
                </p>
              </div>
            </div>

            <ProductSiteSettingsEditor
              name="site_settings_lines"
              initialRows={siteRows.map((r) => ({
                id: r.id,
                site_id: r.site_id,
                is_active: Boolean(r.is_active),
                default_area_kind: r.default_area_kind ?? "",
                min_stock_qty: r.min_stock_qty ?? undefined,
                audience: r.audience ?? "BOTH",
              }))}
              sites={sitesList.map((s) => ({ id: s.id, name: s.name, site_type: s.site_type }))}
              areaKinds={areaKindsList.map((a) => ({ code: a.code, name: a.name ?? a.code }))}
              stockUnitCode={stockUnitCode}
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
          </section>

          <section className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)] space-y-2">
            <p className="font-semibold text-[var(--ui-text)]">Checklist rapido antes de guardar</p>
            <p>1) Unidad base definida (donde viven stock, costo y recetas).</p>
            <p>
              2){" "}
              {hasSuppliers
                ? "Proveedor principal completo (empaque, cantidad, unidad y precio)."
                : "Clasificacion y categoria revisadas para este tipo de item."}
            </p>
            <p>3) Sedes configuradas (disponible, area por defecto y uso en sede).</p>
            <p>4) Si aplica, receta completa con ingredientes y pasos.</p>
          </section>

          <section className="ui-panel border-t border-[var(--ui-border)] pt-6">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_active" defaultChecked={Boolean(productRow.is_active)} />
              <span className="ui-label">Producto activo</span>
            </label>
          </section>

          <div className="flex justify-end">
            <button type="submit" className="ui-btn ui-btn--brand">Guardar cambios</button>
          </div>
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
