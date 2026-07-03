"use server";

import { redirect } from "next/navigation";

import {
  convertQuantity,
  createUnitMap,
  inferFamilyFromUnitCode,
  isTemporaryOperationUnitProfile,
  normalizeUnitCode,
} from "@/lib/inventory/uom";
import {
  computeAutoCostFromPrimarySupplier,
  getAutoCostReadinessReason,
  isAutoCostReady,
} from "@/lib/inventory/costing";
import { checkPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import {
  categorySupportsKind,
  normalizeCategoryDomain,
  normalizeCategoryScope,
} from "@/lib/inventory/categories";
import {
  generateNextSku,
  isSkuConflictError,
  isValidSkuFormat,
  sanitizeManualSku,
} from "@/lib/inventory/sku";
import {
  appendQueryParam,
  asNullableDateText,
  asNullableNumber,
  asText,
  buildRemissionFromDefaultUnit,
  buildRemissionFromRecipePortion,
  clampTolerancePercent,
  insertProductSiteSettingCompat,
  loadCategoryRows,
  measurementPolicyForMode,
  normalizeMeasurementMode,
  parseJsonArray,
  resolveCatalogTab,
  resolveCategoryKindForProduct,
  resolveCompatibleDefaultUnit,
  resolveLockedInventoryKind,
  resolveNetPurchasePrice,
  sanitizeAuxCountUnitCode,
  sanitizeCatalogReturnPath,
  siteSettingRowRank,
  siteSettingTs,
  updateProductSiteSettingCompat,
  type AssetMaintenanceLine,
  type AssetTransferLine,
  type CategoryRow,
  type MeasurementMode,
  type ProductUomProfileRow,
  type ProductionLocationRow,
  type ProductionRouteRow,
  type RecipePortionRow,
  type SiteAreaPurposeRuleRow,
  type SiteSettingRow,
  type SupplierRow,
  type UnitRow,
} from "./detail-helpers";

const APP_ID = "nexo";
export async function updateProduct(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) redirect(await buildShellLoginUrl("/inventory/catalog"));

  const { data: employee } = await supabase.from("employees").select("role").eq("id", user.id).maybeSingle();
  const role = String(employee?.role ?? "").toLowerCase();
  const canEditByRole = ["propietario", "gerente_general"].includes(role);
  const canEditByPermission = await checkPermission(supabase, APP_ID, "catalog.products");
  if (!canEditByRole && !canEditByPermission) {
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
  const normalizedProductType = String(productTypeValue || existingProductType || "")
    .trim()
    .toLowerCase();
  const inventoryKindInput = asText(formData.get("inventory_kind")) || null;
  const inventoryKindValue = resolveLockedInventoryKind(
    productTypeValue || existingProductType || "insumo",
    inventoryKindInput || ""
  );
  const requestedMeasurementMode = normalizeMeasurementMode(
    asText(formData.get("measurement_mode"))
  );
  const measurementMode =
    String(inventoryKindValue ?? "").trim().toLowerCase() === "asset"
      ? "fixed_presentation"
      : requestedMeasurementMode;
  const measurementPolicy = measurementPolicyForMode(measurementMode);
  const defaultTolerancePercent = clampTolerancePercent(
    asNullableNumber(formData.get("default_tolerance_percent")),
    measurementPolicy.default_tolerance_percent
  );
  const auxCountUnitCode =
    measurementMode === "count_with_weight"
      ? sanitizeAuxCountUnitCode(asText(formData.get("aux_count_unit_code")))
      : null;

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
      redirectWithError("La categoría seleccionada no existe.");
    }
    const category = categoryRow as CategoryRow;
    if (category.is_active === false) {
      redirectWithError("La categoría seleccionada está inactiva.");
    }
    if (!categorySupportsKind(category, categoryKind)) {
      redirectWithError("La categoría no aplica al tipo de item seleccionado.");
    }
    if (
      categoryKind === "venta" &&
      (normalizeCategoryDomain(category.domain) || String(category.site_id ?? "").trim())
    ) {
      redirectWithError("Los productos de venta solo pueden usar categorías maestras globales.");
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
      redirectWithError("Selecciona una categoría del último nivel (categoría hoja).");
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
        redirectWithError("SKU inválido. Usa letras, números y guiones.");
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
      redirectWithError("El SKU ya existe. Usa otro código.");
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
    measurement_mode: measurementMode,
    default_tolerance_percent: defaultTolerancePercent,
    aux_count_unit_code: auxCountUnitCode,
    requires_actual_receipt_qty: measurementPolicy.requires_actual_receipt_qty,
    requires_actual_dispatch_qty: measurementPolicy.requires_actual_dispatch_qty,
    requires_actual_production_qty: measurementPolicy.requires_actual_production_qty,
    requires_count_alongside_weight: measurementPolicy.requires_count_alongside_weight,
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
  const supplierLinesRaw = formData.get("supplier_lines");
  let hasAnySupplierLine = false;
  let hasCompletePrimarySupplier = false;
  if (supportsSupplierAutoCost && typeof supplierLinesRaw === "string" && supplierLinesRaw) {
    let lines: Array<{
      id?: string;
      supplier_id?: string;
      supplier_sku?: string;
      supplier_product_alias?: string;
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
            const purchaseUnitLabel = String(line.purchase_unit || "Empaque").trim();
            purchaseUomFromSupplier = {
              label: `${purchaseUnitLabel} ${packQty.toLocaleString("es-CO", {
                maximumFractionDigits: 3,
              })} ${packUnitCode}`,
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
        supplier_product_alias: line.supplier_product_alias || null,
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
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
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
          is_active: true,
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

  async function deactivateContextProfile(usageContext: "remission") {
    await supabase
      .from("product_uom_profiles")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("product_id", productId)
      .eq("usage_context", usageContext)
      .eq("is_default", true);
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

  if (formData.has("remission_source_mode")) {
    const remissionSourceModeRaw = asText(formData.get("remission_source_mode")).toLowerCase();
    const remissionSourceMode =
      remissionSourceModeRaw === "disabled" ||
        remissionSourceModeRaw === "purchase_primary" ||
        remissionSourceModeRaw === "remission_profile" ||
        remissionSourceModeRaw === "recipe_portion" ||
        remissionSourceModeRaw === "operation_unit"
        ? remissionSourceModeRaw
        : "disabled";

    const remissionInputUnitCode = normalizeUnitCode(asText(formData.get("remission_uom_code")));
    const remissionQtyInStockRaw = Number(asText(formData.get("remission_uom_qty_in_stock")) || 0);
    const remissionQtyInStock =
      Number.isFinite(remissionQtyInStockRaw) && remissionQtyInStockRaw > 0
        ? remissionQtyInStockRaw
        : 0;
    const remissionLabelText = asText(formData.get("remission_uom_label"));
    let remissionProfile:
      | {
        label: string;
        inputUnitCode: string;
        qtyInInputUnit: number;
        qtyInStockUnit: number;
        source: "manual" | "supplier_primary" | "recipe_portion";
      }
      | null = null;

    if (remissionSourceMode === "disabled") {
      remissionProfile = null;
    } else if (remissionSourceMode === "remission_profile") {
      if (!remissionInputUnitCode || remissionQtyInStock <= 0) {
        redirectWithError("Completa la presentación de remisión: unidad y equivalencia a unidad base.");
      }
      remissionProfile = {
        label: remissionLabelText || "Presentación remisión",
        inputUnitCode: remissionInputUnitCode,
        qtyInInputUnit: 1,
        qtyInStockUnit: remissionQtyInStock,
        source: "manual",
      };
    } else if (remissionSourceMode === "purchase_primary") {
      if (!purchaseUomFromSupplier) {
        redirectWithError("No se pudo usar la presentación de compra en operación. Completa el proveedor primario.");
        return;
      }

      const purchaseProfile = purchaseUomFromSupplier;
      remissionProfile = {
        label: purchaseProfile.label || "Presentación compra",
        inputUnitCode: purchaseProfile.inputUnitCode,
        qtyInInputUnit: purchaseProfile.qtyInInputUnit,
        qtyInStockUnit: purchaseProfile.qtyInStockUnit,
        source: "supplier_primary",
      };
    } else if (remissionSourceMode === "operation_unit") {
      if (normalizedProductType === "preparacion") {
        remissionProfile = {
          label: "Unidad operativa temporal",
          inputUnitCode: stockUnitCode,
          qtyInInputUnit: 1,
          qtyInStockUnit: 1,
          source: "manual",
        };
      } else {
        remissionProfile = buildRemissionFromDefaultUnit({
          defaultUnitCode: resolvedDefaultUnit,
          stockUnitCode,
          unitMap,
        });
        if (!remissionProfile) {
          redirectWithError("No se pudo definir la presentación de remisión desde unidad operativa. Revisa unidad base y unidad operativa.");
        }
      }
    } else if (remissionSourceMode === "recipe_portion") {
      const { data: existingRecipePortionProfile, error: recipePortionProfileError } = await supabase
        .from("product_uom_profiles")
        .select("label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,source")
        .eq("product_id", productId)
        .eq("usage_context", "remission")
        .eq("is_default", true)
        .eq("is_active", true)
        .eq("source", "recipe_portion")
        .maybeSingle();

      if (recipePortionProfileError) redirectWithError(recipePortionProfileError.message);

      if (existingRecipePortionProfile) {
        const recipePortionProfile = existingRecipePortionProfile;
        remissionProfile = {
          label: String(recipePortionProfile.label ?? "Porción de receta").trim(),
          inputUnitCode: normalizeUnitCode(recipePortionProfile.input_unit_code),
          qtyInInputUnit: Number(recipePortionProfile.qty_in_input_unit ?? 1) || 1,
          qtyInStockUnit: Number(recipePortionProfile.qty_in_stock_unit ?? 0) || 0,
          source: "recipe_portion",
        };
      } else {
        const { data: publishedRecipePortion, error: recipePortionError } = await supabase
          .from("recipe_cards")
          .select("id,product_id,yield_qty,yield_unit,portion_size,portion_unit,status,is_active,updated_at")
          .eq("product_id", productId)
          .eq("status", "published")
          .eq("is_active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recipePortionError) redirectWithError(recipePortionError.message);

        remissionProfile = buildRemissionFromRecipePortion({
          recipe: (publishedRecipePortion ?? null) as RecipePortionRow | null,
          stockUnitCode,
          unitMap,
        });

        if (!remissionProfile) {
          redirectWithError("FOGO todavía no ha publicado una porción de receta para remisión. Usa unidad operativa temporal o presentación manual.");
          return;
        }
      }

      if (!remissionProfile.inputUnitCode || remissionProfile.qtyInStockUnit <= 0) {
        redirectWithError("La porción de receta publicada por FOGO no tiene equivalencia válida.");
      }
    }

    if (remissionProfile) {
      await upsertContextProfile({
        usageContext: "remission",
        label: remissionProfile.label,
        inputUnitCode: remissionProfile.inputUnitCode,
        qtyInInputUnit: remissionProfile.qtyInInputUnit,
        qtyInStockUnit: remissionProfile.qtyInStockUnit,
        source: remissionProfile.source,
      });
    } else {
      await deactivateContextProfile("remission");
    }
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
      production_location_id?: string;
      local_production_enabled?: boolean | string | null;
      min_stock_qty?: number | string;
      min_stock_input_mode?: "base" | "purchase" | string;
      min_stock_purchase_qty?: number | string;
      min_stock_purchase_unit_code?: string;
      min_stock_purchase_to_base_factor?: number | string;
      audience?: string;
      remission_enabled?: boolean | string | null;
      sales_enabled?: boolean | string | null;
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
      const rawRemissionEnabled = line.remission_enabled;
      const rawLocalProductionEnabled = line.local_production_enabled;
      const rawSalesEnabled = line.sales_enabled;
      const parsedRemissionEnabled =
        typeof rawRemissionEnabled === "boolean"
          ? rawRemissionEnabled
          : rawRemissionEnabled === "true"
            ? true
            : rawRemissionEnabled === "false"
              ? false
              : null;
      const parsedLocalProductionEnabled =
        typeof rawLocalProductionEnabled === "boolean"
          ? rawLocalProductionEnabled
          : rawLocalProductionEnabled === "true";
      const parsedSalesEnabled =
        typeof rawSalesEnabled === "boolean"
          ? rawSalesEnabled
          : rawSalesEnabled === "true";

      const hasMeaningfulData =
        Boolean(String(line.site_id ?? "").trim()) ||
        Boolean(String(line.default_area_kind ?? "").trim()) ||
        (Array.isArray(line.area_kinds) && line.area_kinds.some((kind) => String(kind ?? "").trim())) ||
        Boolean(String(line.production_location_id ?? "").trim()) ||
        rawLocalProductionEnabled !== undefined ||
        Boolean(String(line.audience ?? "").trim()) ||
        rawRemissionEnabled !== undefined ||
        rawSalesEnabled !== undefined ||
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
        production_location_id: parsedLocalProductionEnabled
          ? String(line.production_location_id ?? "").trim() || null
          : null,
        local_production_enabled: parsedLocalProductionEnabled,
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
        remission_enabled: parsedRemissionEnabled,
        sales_enabled: parsedSalesEnabled,
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

    const hasRemissionEnabledSite = siteLines.some((line) => {
      if (line._delete) return false;
      return line.remission_enabled === true || line.remission_enabled === "true";
    });
    if (normalizedProductType === "preparacion" && !hasRemissionEnabledSite) {
      await deactivateContextProfile("remission");
    }
  }

  const productionRoutesRaw = formData.get("production_route_lines");
  if (typeof productionRoutesRaw === "string" && productionRoutesRaw) {
    let routeLines: Array<{
      id?: string;
      site_id?: string;
      area_kind?: string;
      input_location_id?: string;
      output_mode?: string;
      output_location_id?: string;
      is_active?: boolean;
    }> = [];
    try {
      routeLines = JSON.parse(productionRoutesRaw) as typeof routeLines;
    } catch {
      redirectWithError("No se pudo leer la ruta operativa. Recarga la pagina e intenta de nuevo.");
    }

    const routeSiteIds = Array.from(
      new Set(routeLines.map((line) => String(line.site_id ?? "").trim()).filter(Boolean))
    );
    const routeLocationIds = Array.from(
      new Set(
        routeLines
          .flatMap((line) => [
            String(line.input_location_id ?? "").trim(),
            String(line.output_location_id ?? "").trim(),
          ])
          .filter(Boolean)
      )
    );

    const { data: routeSiteLocationsData, error: routeSiteLocationsError } =
      routeSiteIds.length > 0
        ? await supabase
          .from("inventory_locations")
          .select("id,site_id,area:areas(kind)")
          .eq("is_active", true)
          .in("site_id", routeSiteIds)
        : { data: [] as Array<{ id: string; site_id: string | null; area?: { kind: string | null } | { kind: string | null }[] | null }>, error: null };

    if (routeSiteLocationsError) redirectWithError(routeSiteLocationsError.message);

    const activeLocationCountBySite = ((routeSiteLocationsData ?? []) as Array<{
      id: string;
      site_id: string | null;
      area?: { kind: string | null } | { kind: string | null }[] | null;
    }>).reduce(
      (acc, location) => {
        const siteId = String(location.site_id ?? "").trim();
        if (!siteId) return acc;
        acc[siteId] = (acc[siteId] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const routeLocationAreaById = new Map<string, string>();
    for (const location of (routeSiteLocationsData ?? []) as Array<{
      id: string;
      area?: { kind: string | null } | { kind: string | null }[] | null;
    }>) {
      const areaValue = Array.isArray(location.area) ? location.area[0] : location.area;
      const areaKind = String(areaValue?.kind ?? "").trim();
      if (location.id && areaKind) routeLocationAreaById.set(String(location.id), areaKind);
    }

    if (routeLocationIds.length > 0) {
      const missingRouteLocationIds = routeLocationIds.filter((locationId) => !routeLocationAreaById.has(locationId));
      if (missingRouteLocationIds.length > 0) {
        const { data: missingLocationsData, error: missingLocationsError } = await supabase
          .from("inventory_locations")
          .select("id,area:areas(kind)")
          .eq("is_active", true)
          .in("id", missingRouteLocationIds);

        if (missingLocationsError) redirectWithError(missingLocationsError.message);

        for (const location of (missingLocationsData ?? []) as Array<{
          id: string;
          area?: { kind: string | null } | { kind: string | null }[] | null;
        }>) {
          const areaValue = Array.isArray(location.area) ? location.area[0] : location.area;
          const areaKind = String(areaValue?.kind ?? "").trim();
          if (location.id && areaKind) routeLocationAreaById.set(String(location.id), areaKind);
        }
      }
    }

    const submittedSiteIds = new Set<string>();
    const keepRouteIds = new Set<string>();

    for (const line of routeLines) {
      const siteId = String(line.site_id ?? "").trim();
      const areaKind = String(line.area_kind ?? "").trim();
      const inputLocationId = String(line.input_location_id ?? "").trim();
      const outputModeRaw = String(line.output_mode ?? "inventory_stock").trim();
      const outputMode =
        outputModeRaw === "sellable_stock" || outputModeRaw === "order_fulfillment"
          ? outputModeRaw
          : "inventory_stock";
      const outputLocationId = String(line.output_location_id ?? "").trim();

      if (!siteId || !areaKind || !inputLocationId) continue;
      if (outputMode !== "order_fulfillment" && !outputLocationId) {
        redirectWithError("Completa el LOC de salida del terminado en la ruta operativa.");
      }

      const siteUsesSingleOperationalLoc = (activeLocationCountBySite[siteId] ?? 0) <= 1;
      const inputLocationAreaKind = routeLocationAreaById.get(inputLocationId) ?? "";
      const outputLocationAreaKind =
        outputMode === "order_fulfillment" ? "" : routeLocationAreaById.get(outputLocationId) ?? "";

      // Sedes de operación simple como Saudo usan un único LOC operativo: remisión entra,
      // venta descuenta y producción consume/recibe en el mismo LOC. En ese caso la ruta
      // debe guardarse con el área real del LOC para pasar las validaciones de integridad,
      // sin obligar a crear LOCs artificiales por cada área productiva.
      const routeAreaKind =
        siteUsesSingleOperationalLoc
          ? inputLocationAreaKind || outputLocationAreaKind || areaKind
          : areaKind;

      submittedSiteIds.add(siteId);
      const payload = {
        product_id: productId,
        site_id: siteId,
        area_kind: routeAreaKind,
        route_name: "Ruta principal",
        input_location_id: inputLocationId,
        output_mode: outputMode,
        output_location_id: outputMode === "order_fulfillment" ? null : outputLocationId,
        output_position_id: null,
        is_default: true,
        is_active: line.is_active !== false,
        updated_by: user.id,
      };

      if (line.id) {
        const { error: routeUpdateError } = await supabase
          .from("product_site_production_routes")
          .update(payload)
          .eq("id", line.id)
          .eq("product_id", productId)
          .select("id")
          .maybeSingle();
        if (routeUpdateError) redirectWithError(routeUpdateError.message);
        keepRouteIds.add(line.id);
      } else {
        const { data: insertedRoute, error: routeInsertError } = await supabase
          .from("product_site_production_routes")
          .insert({ ...payload, created_by: user.id })
          .select("id")
          .single();
        if (routeInsertError) redirectWithError(routeInsertError.message);
        if (insertedRoute?.id) keepRouteIds.add(String(insertedRoute.id));
      }
    }

    for (const siteId of submittedSiteIds) {
      let deactivateQuery = supabase
        .from("product_site_production_routes")
        .update({ is_active: false, is_default: false, updated_by: user.id })
        .eq("product_id", productId)
        .eq("site_id", siteId);
      if (keepRouteIds.size > 0) {
        deactivateQuery = deactivateQuery.not("id", "in", `(${Array.from(keepRouteIds).join(",")})`);
      }
      const { error: deactivateRoutesError } = await deactivateQuery;
      if (deactivateRoutesError) redirectWithError(deactivateRoutesError.message);
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
      brand: asText(formData.get("asset_brand")) || null,
      model: asText(formData.get("asset_model")) || null,
      serial_number: asText(formData.get("asset_serial_number")) || null,
      physical_location: asText(formData.get("asset_physical_location")) || null,
      purchase_invoice_url: asText(formData.get("asset_purchase_invoice_url")) || null,
      commercial_value: asNullableNumber(formData.get("asset_commercial_value")),
      purchase_date: asNullableDateText(asText(formData.get("asset_purchase_date"))),
      started_use_date: asNullableDateText(asText(formData.get("asset_started_use_date"))),
      equipment_status: equipmentStatus,
      maintenance_service_provider: asText(formData.get("asset_maintenance_service_provider")) || null,
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
          : asNullableNumber(formData.get("asset_maintenance_cycle_months")),
      maintenance_cycle_anchor_date:
        assetProfileTemplate === "industrial"
          ? asNullableDateText(asText(formData.get("asset_maintenance_cycle_anchor_date")))
          : asNullableDateText(asText(formData.get("asset_maintenance_cycle_anchor_date"))),
    };

    const { error: assetProfileErr } = await supabase
      .from("product_asset_profiles")
      .upsert(assetProfilePayload, { onConflict: "product_id" });
    if (assetProfileErr) redirectWithError(assetProfileErr.message);

    const maintenanceLines = parseJsonArray<AssetMaintenanceLine>(
      formData.get("asset_maintenance_lines")
    );
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
