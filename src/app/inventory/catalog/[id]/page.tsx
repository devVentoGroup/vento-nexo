import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CategoryTreeFilter } from "@/components/inventory/CategoryTreeFilter";
import { SkuField } from "@/components/inventory/SkuField";
import { PageHeader } from "@/components/vento/standard/page-header";
import { ProductImageUpload } from "@/features/inventory/catalog/product-image-upload";
import { ProductSiteSettingsEditor } from "@/features/inventory/catalog/product-site-settings-editor";
import { ProductSuppliersEditor } from "@/features/inventory/catalog/product-suppliers-editor";
import { RecipeIngredientsEditor } from "@/features/inventory/catalog/recipe-ingredients-editor";
import { RecipeMetadataFields } from "@/features/inventory/catalog/recipe-metadata-fields";
import { RecipeStepsEditor } from "@/features/inventory/catalog/recipe-steps-editor";
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
  sites?: { id: string; name: string | null } | null;
};

type AreaKindRow = { code: string; name: string | null };
type SiteOptionRow = { id: string; name: string | null };
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
    return sanitizeCatalogReturnPath(decodeURIComponent(value));
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
    catalog_image_url: asText(formData.get("catalog_image_url")) || null,
  };
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
  let operationalUomFromSupplier:
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
        if (
          Boolean(line.is_primary) &&
          Boolean(line.use_in_operations) &&
          packQty > 0 &&
          packUnitCode
        ) {
          try {
            const { quantity: qtyInStockUnit } = convertQuantity({
              quantity: packQty,
              fromUnitCode: packUnitCode,
              toUnitCode: stockUnitCode,
              unitMap,
            });
            if (qtyInStockUnit > 0) {
              operationalUomFromSupplier = {
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

  if (operationalUomFromSupplier) {
    const now = new Date().toISOString();
    await supabase
      .from("product_uom_profiles")
      .update({
        is_default: false,
        updated_at: now,
      })
      .eq("product_id", productId)
      .eq("is_default", true);

    await supabase.from("product_uom_profiles").insert({
      product_id: productId,
      label: operationalUomFromSupplier.label,
      input_unit_code: operationalUomFromSupplier.inputUnitCode,
      qty_in_input_unit: operationalUomFromSupplier.qtyInInputUnit,
      qty_in_stock_unit: operationalUomFromSupplier.qtyInStockUnit,
      is_default: true,
      is_active: true,
      source: "supplier_primary",
      updated_at: now,
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
        _delete?: boolean;
      }>;
      const toDelete = siteLines.filter((l) => l.id && l._delete).map((l) => l.id as string);
      for (const id of toDelete) await supabase.from("product_site_settings").delete().eq("id", id);
      for (const line of siteLines) {
        if (line._delete || !line.site_id) continue;
        const row = {
          product_id: productId,
          site_id: line.site_id,
          is_active: Boolean(line.is_active),
          default_area_kind: line.default_area_kind || null,
        };
        if (line.id) {
          const { error: upErr } = await supabase.from("product_site_settings").update(row).eq("id", line.id);
          if (upErr) redirectWithError(upErr.message);
        } else {
          const { error: insErr } = await supabase.from("product_site_settings").insert(row);
          if (insErr) redirectWithError(insErr.message);
        }
      }
    } catch {
      // ignore
    }
  }

  // Recipe card upsert
  const ingredientRaw = formData.get("ingredient_lines");
  const stepsRaw = formData.get("recipe_steps");
  const hasRecipeData = typeof ingredientRaw === "string" && ingredientRaw;

  if (hasRecipeData) {
    const yieldQty = formData.get("yield_qty") ? Number(formData.get("yield_qty")) : 1;
    const yieldUnit = asText(formData.get("yield_unit")) || "un";

    const { data: existingCard } = await supabase
      .from("recipe_cards")
      .select("id")
      .eq("product_id", productId)
      .maybeSingle();

    let recipeCardId: string;
    if (existingCard) {
      recipeCardId = existingCard.id;
      await supabase.from("recipe_cards").update({
        yield_qty: yieldQty,
        yield_unit: yieldUnit,
        portion_size: formData.get("portion_size") ? Number(formData.get("portion_size")) : null,
        portion_unit: asText(formData.get("portion_unit")) || null,
        prep_time_minutes: formData.get("prep_time_minutes") ? Number(formData.get("prep_time_minutes")) : null,
        shelf_life_days: formData.get("shelf_life_days") ? Number(formData.get("shelf_life_days")) : null,
        difficulty: asText(formData.get("difficulty")) || null,
        recipe_description: asText(formData.get("recipe_description")) || null,
      }).eq("id", recipeCardId);
    } else {
      const { data: newCard } = await supabase.from("recipe_cards").insert({
        product_id: productId,
        yield_qty: yieldQty,
        yield_unit: yieldUnit,
        portion_size: formData.get("portion_size") ? Number(formData.get("portion_size")) : null,
        portion_unit: asText(formData.get("portion_unit")) || null,
        prep_time_minutes: formData.get("prep_time_minutes") ? Number(formData.get("prep_time_minutes")) : null,
        shelf_life_days: formData.get("shelf_life_days") ? Number(formData.get("shelf_life_days")) : null,
        difficulty: asText(formData.get("difficulty")) || null,
        recipe_description: asText(formData.get("recipe_description")) || null,
        status: "draft",
      }).select("id").single();
      recipeCardId = newCard?.id ?? "";
    }

    // Replace BOM lines
    try {
      const ingredientLines = JSON.parse(ingredientRaw as string) as Array<Record<string, unknown>>;
      await supabase.from("recipes").delete().eq("product_id", productId);
      for (const line of ingredientLines) {
        if ((line._delete as boolean) || !line.ingredient_product_id) continue;
        await supabase.from("recipes").insert({
          product_id: productId,
          ingredient_product_id: line.ingredient_product_id as string,
          quantity: (line.quantity as number) ?? 0,
          is_active: true,
        });
      }
    } catch { /* skip */ }

    // Replace steps
    if (recipeCardId && typeof stepsRaw === "string" && stepsRaw) {
      try {
        const stepLines = JSON.parse(stepsRaw) as Array<Record<string, unknown>>;
        await supabase.from("recipe_steps").delete().eq("recipe_card_id", recipeCardId);
        for (const step of stepLines) {
          if ((step._delete as boolean) || !step.description) continue;
          await supabase.from("recipe_steps").insert({
            recipe_card_id: recipeCardId,
            step_number: (step.step_number as number) ?? 1,
            description: step.description as string,
            tip: (step.tip as string) || null,
            time_minutes: (step.time_minutes as number) ?? null,
          });
        }
      } catch { /* skip */ }
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
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";
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

  const { data: siteSettings } = await supabase
    .from("product_site_settings")
    .select("id,site_id,is_active,default_area_kind,sites(id,name)")
    .eq("product_id", id);
  const siteRows = (siteSettings ?? []) as unknown as SiteSettingRow[];

  const { data: sitesData } = await supabase.from("sites").select("id,name").eq("is_active", true).order("name", { ascending: true });
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
    .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source")
    .eq("product_id", id)
    .eq("is_active", true)
    .eq("is_default", true)
    .limit(1);
  const defaultOperationalUom = ((uomProfileData ?? []) as ProductUomProfileRow[])[0] ?? null;

  const { data: suppliersData } = await supabase.from("suppliers").select("id,name").eq("is_active", true).order("name");
  const suppliersList = (suppliersData ?? []) as { id: string; name: string | null }[];

  // Recipe data (for preparacion and venta)
  const productType = (product as ProductRow).product_type;
  const hasRecipe = productType === "preparacion" || productType === "venta";

  type RecipeCardRow = {
    id: string;
    yield_qty: number | null;
    yield_unit: string | null;
    portion_size: number | null;
    portion_unit: string | null;
    prep_time_minutes: number | null;
    shelf_life_days: number | null;
    difficulty: string | null;
    recipe_description: string | null;
  };
  type RecipeBomRow = { id: string; ingredient_product_id: string; quantity: number };
  type RecipeStepRow = { id: string; step_number: number; description: string; tip: string | null; time_minutes: number | null };
  type IngredientProductRow = { id: string; name: string | null; sku: string | null; unit: string | null; cost: number | null };

  let recipeCard: RecipeCardRow | null = null;
  let recipeBomRows: RecipeBomRow[] = [];
  let recipeStepRows: RecipeStepRow[] = [];
  let ingredientProducts: IngredientProductRow[] = [];

  if (hasRecipe) {
    const { data: rc } = await supabase
      .from("recipe_cards")
      .select("id,yield_qty,yield_unit,portion_size,portion_unit,prep_time_minutes,shelf_life_days,difficulty,recipe_description")
      .eq("product_id", id)
      .maybeSingle();
    recipeCard = rc as RecipeCardRow | null;

    const { data: bom } = await supabase
      .from("recipes")
      .select("id,ingredient_product_id,quantity")
      .eq("product_id", id)
      .eq("is_active", true);
    recipeBomRows = (bom ?? []) as RecipeBomRow[];

    if (recipeCard) {
      const { data: steps } = await supabase
        .from("recipe_steps")
        .select("id,step_number,description,tip,time_minutes")
        .eq("recipe_card_id", recipeCard.id)
        .order("step_number", { ascending: true });
      recipeStepRows = (steps ?? []) as RecipeStepRow[];
    }

    const { data: ingProds } = await supabase
      .from("products")
      .select("id,name,sku,unit,cost")
      .in("product_type", ["insumo", "preparacion"])
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(1000);
    ingredientProducts = (ingProds ?? []) as IngredientProductRow[];
  }

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
  const stockUnitMeta = inventoryUnitMap.get(stockUnitCode) ?? null;
  const requestedDefaultUnit = normalizeUnitCode(profileRow?.default_unit || stockUnitCode);
  const resolvedDefaultUnit = resolveCompatibleDefaultUnit({
    requestedDefaultUnit,
    stockUnitCode,
    unitMap: inventoryUnitMap,
  });

  const filteredDefaultUnitOptions = stockUnitMeta
    ? unitsList.filter((unit) => unit.family === stockUnitMeta.family)
    : unitsList;
  const hasResolvedDefaultInOptions = filteredDefaultUnitOptions.some(
    (unit) => normalizeUnitCode(unit.code) === resolvedDefaultUnit
  );
  const defaultUnitOptionFallback =
    hasResolvedDefaultInOptions
      ? []
      : unitsList.filter((unit) => normalizeUnitCode(unit.code) === resolvedDefaultUnit);
  const defaultUnitOptions = [...filteredDefaultUnitOptions, ...defaultUnitOptionFallback];
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
      Boolean(defaultOperationalUom) &&
      normalizeUnitCode(defaultOperationalUom.input_unit_code) ===
        normalizeUnitCode(r.purchase_pack_unit_code ?? stockUnitCode),
  }));

  return (
    <div className="w-full space-y-8">
      <PageHeader
        title={productRow.name ?? "Ficha maestra"}
        subtitle="Catálogo del insumo o producto: compra, almacenamiento y distribución."
        actions={
          <Link href={from || "/inventory/catalog"} className="ui-btn ui-btn--ghost">
            Volver al catálogo
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
            <span className="ui-label">Sede para categorías</span>
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
            <button className="ui-btn ui-btn--ghost">Actualizar categorías</button>
          </div>
        </form>

        <form action={updateProduct} className="space-y-8">
          <input type="hidden" name="product_id" value={productRow.id} />
          <input type="hidden" name="return_to" value={from} />

          {/* ——— Bloque 1: Compra y proveedor ——— */}
          <section className="ui-panel space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">1</span>
              <div>
                <h2 className="ui-h3">Compra y proveedor</h2>
                <p className="text-sm text-[var(--ui-muted)]">
                  De quién se compra, cómo se identifica y en qué unidad. Fotos para listados y catálogo.
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
                <span className="ui-label">Tipo</span>
                <select name="product_type" defaultValue={productRow.product_type ?? "insumo"} className="ui-input">
                  <option value="insumo">Insumo</option>
                  <option value="preparacion">Preparacion</option>
                  <option value="venta">Venta</option>
                </select>
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

            <div>
              <p className="mb-2 text-sm font-medium text-[var(--ui-text)]">Proveedores del insumo</p>
              <p className="mb-3 text-sm text-[var(--ui-muted)]">
                Captura el empaque de compra y usa la calculadora para ver la conversion a unidad base y costo por unidad de inventario.
              </p>
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
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <ProductImageUpload
                name="image_url"
                label="Foto del producto"
                currentUrl={productRow.image_url}
                productId={productRow.id}
                kind="product"
              />
              <ProductImageUpload
                name="catalog_image_url"
                label="Foto de catálogo"
                currentUrl={productRow.catalog_image_url}
                productId={productRow.id}
                kind="catalog"
              />
            </div>
          </section>

          {/* ——— Receta (solo preparacion y venta) ——— */}
          {hasRecipe && (
            <>
              <section className="ui-panel space-y-6">
                <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">R</span>
                  <div>
                    <h2 className="ui-h3">Receta: ingredientes</h2>
                    <p className="text-sm text-[var(--ui-muted)]">
                      Insumos y/o preparaciones que componen este producto, con cantidades.
                    </p>
                  </div>
                </div>
                <RecipeIngredientsEditor
                  name="ingredient_lines"
                  initialRows={recipeBomRows.map((r) => ({
                    id: r.id,
                    ingredient_product_id: r.ingredient_product_id,
                    quantity: r.quantity,
                  }))}
                  products={ingredientProducts}
                />
              </section>

              <section className="ui-panel space-y-6">
                <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">F</span>
                  <div>
                    <h2 className="ui-h3">Ficha de receta</h2>
                    <p className="text-sm text-[var(--ui-muted)]">Rendimiento, tiempos, dificultad.</p>
                  </div>
                </div>
                <RecipeMetadataFields
                  yieldQty={recipeCard?.yield_qty ?? undefined}
                  yieldUnit={recipeCard?.yield_unit ?? undefined}
                  portionSize={recipeCard?.portion_size ?? undefined}
                  portionUnit={recipeCard?.portion_unit ?? undefined}
                  prepTimeMinutes={recipeCard?.prep_time_minutes ?? undefined}
                  shelfLifeDays={recipeCard?.shelf_life_days ?? undefined}
                  difficulty={recipeCard?.difficulty ?? undefined}
                  recipeDescription={recipeCard?.recipe_description ?? undefined}
                />
              </section>

              <section className="ui-panel space-y-6">
                <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">P</span>
                  <div>
                    <h2 className="ui-h3">Pasos de preparacion</h2>
                    <p className="text-sm text-[var(--ui-muted)]">Instrucciones paso a paso.</p>
                  </div>
                </div>
                <RecipeStepsEditor
                  name="recipe_steps"
                  initialRows={recipeStepRows.map((s) => ({
                    id: s.id,
                    step_number: s.step_number,
                    description: s.description,
                    tip: s.tip ?? "",
                    time_minutes: s.time_minutes ?? undefined,
                  }))}
                />
              </section>
            </>
          )}

          {/* ——— Bloque 2: Almacenamiento ——— */}
          <section className="ui-panel space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">2</span>
              <div>
                <h2 className="ui-h3">Almacenamiento</h2>
                <p className="text-sm text-[var(--ui-muted)]">
                  Unidad en bodega, control de stock, lotes y vencimiento. Precio y costo para inventario.
                </p>
              </div>
            </div>

            <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
              <p className="font-medium text-[var(--ui-text)]">Regla simple de unidades</p>
              <p className="mt-1">Unidad base: donde se guarda TODO el stock y todos los movimientos.</p>
              <p>Unidad operativa: sugerencia para formularios; debe ser de la misma familia.</p>
            </div>
            {defaultOperationalUom ? (
              <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
                <p>
                  <strong className="text-[var(--ui-text)]">Unidad base (consumo y costo):</strong>{" "}
                  {stockUnitCode}
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Empaque operativo:</strong>{" "}
                  {defaultOperationalUom.label} ({defaultOperationalUom.qty_in_input_unit}{" "}
                  {defaultOperationalUom.input_unit_code} ={" "}
                  {defaultOperationalUom.qty_in_stock_unit} {stockUnitCode})
                </p>
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
              <label className="flex flex-col gap-1">
                <span className="ui-label">Precio de venta</span>
                <input name="price" type="number" step="0.01" defaultValue={productRow.price ?? ""} className="ui-input" placeholder="0.00" />
              </label>
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

          {/* ——— Bloque 3: Distribución y venta interna ——— */}
          <section className="ui-panel space-y-6">
            <div className="flex items-center gap-3 border-b border-[var(--ui-border)] pb-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ui-brand)] text-lg font-bold text-white">3</span>
              <div>
                <h2 className="ui-h3">Distribución y venta interna</h2>
                <p className="text-sm text-[var(--ui-muted)]">
                  En qué sedes está disponible y a qué área se envía (remisiones, envío a satélite).
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
              }))}
              sites={sitesList.map((s) => ({ id: s.id, name: s.name }))}
              areaKinds={areaKindsList.map((a) => ({ code: a.code, name: a.name ?? a.code }))}
            />
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
        <strong className="text-[var(--ui-text)]">Ubicaciones (LOCs)</strong> — Créalas en{" "}
        <Link href="/inventory/locations" className="font-medium underline decoration-[var(--ui-border)] underline-offset-2">
          Inventario → Ubicaciones
        </Link>
        . En Entradas asignas cada ítem a un LOC al recibir.
      </div>
    </div>
  );
}
