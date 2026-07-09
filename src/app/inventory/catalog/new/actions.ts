"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { checkPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import {
  categorySupportsKind,
  normalizeCategoryDomain,
  normalizeCategoryScope,
  type CategoryKind,
} from "@/lib/inventory/categories";
import {
  convertQuantity,
  createUnitMap,
  inferFamilyFromUnitCode,
  normalizeUnitCode,
} from "@/lib/inventory/uom";
import { computeAutoCostFromPrimarySupplier } from "@/lib/inventory/costing";
import { generateNextSku, isSkuConflictError } from "@/lib/inventory/sku";
import {
  asNullableDateText,
  asNullableNumber,
  asText,
  appendQueryParam,
  buildRemissionFromDefaultUnit,
  clampTolerancePercent,
  insertProductSiteSettingCompat,
  loadCategoryRows,
  measurementPolicyForMode,
  normalizeMeasurementMode,
  parseJsonArray,
  resolveCompatibleDefaultUnit,
  resolveNetPurchasePrice,
  sanitizeAuxCountUnitCode,
  type AssetMaintenanceLine,
  type AssetTransferLine,
  type CategoryRow,
  type MeasurementMode,
  type UnitRow,
} from "../[id]/detail-helpers";
function isMissingColumnError(error: { code?: string | null; message?: string | null } | null | undefined, column: string) {
  if (!error) return false;
  if (error.code !== "42703") return false;
  const message = `${error.message ?? ""}`.toLowerCase();
  return message.includes(column.toLowerCase());
}

function isCreateRequestKeyConflict(error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined) {
  if (!error || error.code !== "23505") return false;
  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    message.includes("create_request_key") ||
    message.includes("ux_products_create_request_key")
  );
}

function resolveTypeCategoryKind(typeKey: ProductTypeKey): CategoryKind {
  if (typeKey === "asset") return "equipo";
  if (typeKey === "venta" || typeKey === "reventa") return "venta";
  if (typeKey === "preparacion" || typeKey === "preparacion_vendible") return "preparacion";
  return "insumo";
}

const TYPE_CONFIG = {
  insumo: {
    title: "Nuevo insumo",
    subtitle: "Materia prima operativa para stock, entradas, remisiones y consumo manual.",
    productType: "insumo",
    inventoryKind: "ingredient",
    hasSuppliers: true,
    hasRecipe: false,
    hasPrice: false,
    hasStorage: true,
  },
  preparacion: {
    title: "Nueva preparación",
    subtitle: "Modelo producido / WIP: se fabrica desde receta en FOGO y puede usarse en otros productos, remisiones o producción interna.",
    productType: "preparacion",
    inventoryKind: "finished",
    hasSuppliers: false,
    hasRecipe: true,
    hasPrice: false,
    hasStorage: true,
  },
  preparacion_vendible: {
    title: "Nueva preparación vendible",
    subtitle: "Se produce internamente con receta, se puede vender directamente y tambien se puede usar dentro de otras recetas.",
    productType: "preparacion",
    inventoryKind: "finished",
    hasSuppliers: false,
    hasRecipe: true,
    hasPrice: false,
    hasStorage: true,
  },
  venta: {
    title: "Nuevo producto de venta",
    subtitle: "Producto final de venta. Completa su ficha operativa y continuidad de receta cuando aplique.",
    productType: "venta",
    inventoryKind: "finished",
    hasSuppliers: false,
    hasRecipe: true,
    hasPrice: true,
    hasStorage: true,
  },
  reventa: {
    title: "Nuevo producto de reventa",
    subtitle:
      "Producto que se compra ya terminado y se revende. No lleva receta, si lleva proveedor.",
    productType: "venta",
    inventoryKind: "resale",
    hasSuppliers: true,
    hasRecipe: false,
    hasPrice: true,
    hasStorage: true,
  },
  asset: {
    title: "Nuevo modelo patrimonial",
    subtitle: "Crea el modelo base de un equipo, mobiliario, herramienta o activo. Las unidades físicas reales se crean después en Activos físicos.",
    productType: "insumo",
    inventoryKind: "asset",
    hasSuppliers: false,
    hasRecipe: false,
    hasPrice: false,
    hasStorage: false,
  },
} as const;

type ProductTypeKey = keyof typeof TYPE_CONFIG;
const FOGO_BASE_URL =
  process.env.NEXT_PUBLIC_FOGO_URL?.replace(/\/$/, "") ||
  "https://fogo.ventogroup.co";

function buildFogoRecipeCreateUrl(typeKey: ProductTypeKey) {
  const url = new URL("/recipes/new", FOGO_BASE_URL);
  url.searchParams.set("source", "nexo");
  url.searchParams.set("product_type", typeKey);
  return url.toString();
}

function typeBadgeLabel(typeKey: ProductTypeKey) {
  if (typeKey === "asset") return "Modelo patrimonial";
  if (typeKey === "preparacion" || typeKey === "preparacion_vendible") return "Producción interna";
  return "Formulario completo";
}

function typeDisplayLabel(typeKey: ProductTypeKey) {
  if (typeKey === "asset") return "activo";
  if (typeKey === "preparacion_vendible") return "preparación vendible";
  if (typeKey === "preparacion") return "preparación";
  return typeKey;
}

function catalogTabForTypeKey(typeKey: ProductTypeKey) {
  if (typeKey === "asset") return "equipos";
  if (typeKey === "preparacion" || typeKey === "preparacion_vendible") return "preparaciones";
  if (typeKey === "venta" || typeKey === "reventa") return "productos";
  return "insumos";
}

function catalogLabelForTypeKey(typeKey: ProductTypeKey) {
  if (typeKey === "asset") return "Equipos";
  if (typeKey === "preparacion" || typeKey === "preparacion_vendible") return "Preparaciones";
  if (typeKey === "venta" || typeKey === "reventa") return "Productos";
  return "Insumos";
}

function catalogHrefForTypeKey(typeKey: ProductTypeKey) {
  return `/inventory/catalog?tab=${catalogTabForTypeKey(typeKey)}`;
}

function newProductHrefForTypeKey(typeKey: ProductTypeKey) {
  return `/inventory/catalog/new?type=${encodeURIComponent(typeKey)}`;
}

type AfterCreateAction = "view" | "catalog" | "create_another";

function normalizeAfterCreateAction(value: string): AfterCreateAction {
  if (value === "view" || value === "catalog" || value === "create_another") {
    return value;
  }
  return "create_another";
}

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

type OrigoReviewContext = {
  requestId: string;
  returnTo: string;
  sourceEntryId: string;
};

function normalizeOrigoReturnTo(value: string): string {
  const fallback = "/product-master-review";
  const decoded = safeDecode(value).trim();
  if (!decoded) return fallback;
  if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;

  try {
    const url = new URL(decoded);
    const isAllowedHost =
      url.hostname === "localhost" ||
      url.hostname.endsWith(".ventogroup.co") ||
      url.hostname === "ventogroup.co";
    if ((url.protocol === "https:" || url.protocol === "http:") && isAllowedHost) {
      return url.toString();
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function readOrigoReviewContext(formData: FormData): OrigoReviewContext | null {
  const source = asText(formData.get("_origo_review_source"));
  const requestId = asText(formData.get("_origo_review_request_id"));
  if (source !== "origo_receipt_review" || !requestId) return null;

  return {
    requestId,
    returnTo: normalizeOrigoReturnTo(asText(formData.get("_origo_review_return_to"))),
    sourceEntryId: asText(formData.get("_origo_review_source_entry_id")),
  };
}

function buildOrigoReviewRedirectUrl(params: {
  context: OrigoReviewContext;
  ok?: string;
  error?: string;
  productId?: string;
}): string {
  const isAbsolute = /^https?:\/\//i.test(params.context.returnTo);
  const url = new URL(params.context.returnTo, "https://origo.local");

  if (params.ok) url.searchParams.set("ok", params.ok);
  if (params.error) url.searchParams.set("error", params.error);
  url.searchParams.set("review_request_id", params.context.requestId);
  if (params.productId) url.searchParams.set("product_id", params.productId);
  if (params.context.sourceEntryId) url.searchParams.set("finalize_entry_id", params.context.sourceEntryId);

  return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
}

async function approveOrigoReviewProductRequest(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  context: OrigoReviewContext;
  productId: string;
  productName: string;
}) {
  const { data: request, error: requestError } = await params.supabase
    .from("product_master_review_requests")
    .select("id,request_kind,status,source_app,source_flow")
    .eq("id", params.context.requestId)
    .maybeSingle();

  if (requestError) {
    redirect(buildOrigoReviewRedirectUrl({ context: params.context, error: requestError.message }));
  }

  const requestRow = request as {
    id?: string;
    request_kind?: string | null;
    source_app?: string | null;
    source_flow?: string | null;
  } | null;

  if (!requestRow?.id || requestRow.request_kind !== "new_product") {
    redirect(
      buildOrigoReviewRedirectUrl({
        context: params.context,
        error: "La solicitud de ORIGO no existe o no corresponde a un nuevo insumo.",
      })
    );
  }

  const { error: updateError } = await params.supabase
    .from("product_master_review_requests")
    .update({
      status: "approved",
      approved_product_id: params.productId,
      reviewed_by: params.userId,
      reviewed_at: new Date().toISOString(),
      review_notes: `Producto creado y vinculado desde NEXO: ${params.productName}`,
    })
    .eq("id", params.context.requestId);

  if (updateError) {
    redirect(buildOrigoReviewRedirectUrl({ context: params.context, error: updateError.message }));
  }
}

function heroKpis(typeKey: ProductTypeKey) {
  if (typeKey === "asset") {
    return {
      typeValue: "Activo",
      typeNote: "Modelo base del catálogo patrimonial",
      modeValue: "Simple",
      modeNote: "Solo identidad y datos técnicos base",
      objectiveValue: "Modelo",
      objectiveNote: "Luego creas unidades reales en Activos físicos",
    };
  }

  if (typeKey === "preparacion" || typeKey === "preparacion_vendible") {
    return {
      typeValue: typeKey === "preparacion_vendible" ? "Preparación vendible" : "Preparación",
      typeNote:
        typeKey === "preparacion_vendible"
          ? "Producto producido que VISO puede vender por sede"
          : "Producto intermedio producido desde receta",
      modeValue: "Producción",
      modeNote: "Unidad base, WIP y continuidad en FOGO",
      objectiveValue: "Receta / WIP",
      objectiveNote: "Después conectas fórmula, rendimiento y porciones",
    };
  }

  return {
    typeValue: typeKey,
    typeNote: "Clase operativa del maestro que vas a crear",
    modeValue: "Completo",
    modeNote: "Alta definitiva con unidades, proveedor y sedes",
    objectiveValue: "Definitivo",
    objectiveNote: "Maestro completo conectado a compras ORIGO y remisiones",
  };
}

async function createProduct(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) redirect(await buildShellLoginUrl("/inventory/catalog"));

  const { data: employee } = await supabase.from("employees").select("role").eq("id", user.id).maybeSingle();
  const role = String((employee as { role?: string } | null)?.role ?? "").toLowerCase();
  const canCreateByRole = ["propietario", "gerente_general", "bodeguero"].includes(role);
  const canCreateByPermission = await checkPermission(supabase, "nexo", "catalog.products");
  if (!canCreateByRole && !canCreateByPermission) {
    redirect("/inventory/catalog?error=" + encodeURIComponent("No tienes permisos para crear productos."));
  }

  const typeKey = asText(formData.get("_type_key")) as ProductTypeKey;
  const origoReviewContext = readOrigoReviewContext(formData);
  const createRequestKeyRaw = asText(formData.get("_create_request_key"));
  const createRequestKey = createRequestKeyRaw || (origoReviewContext ? `origo_receipt_review:${origoReviewContext.requestId}` : null);
  const modeQuery = "";
  const config = TYPE_CONFIG[typeKey] ?? TYPE_CONFIG.insumo;
  const afterCreate = normalizeAfterCreateAction(asText(formData.get("_after_create")));
  const catalogHref = catalogHrefForTypeKey(typeKey);
  const createAnotherHref = newProductHrefForTypeKey(typeKey);

  const name = asText(formData.get("name"));
  if (!name) {
    redirect(
      `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
      encodeURIComponent("El nombre es obligatorio.")
    );
  }

  const { data: existingNameRows } = await supabase
    .from("products")
    .select("id,name,sku")
    .eq("product_type", config.productType)
    .ilike("name", name)
    .limit(1);
  const existingByName = (existingNameRows ?? [])[0] as
    | { id?: string; name?: string | null; sku?: string | null }
    | undefined;
  if (existingByName?.id) {
    const skuText = String(existingByName.sku ?? "").trim();
    redirect(
      `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
      encodeURIComponent(
        skuText
          ? `Ya existe un producto con ese nombre (SKU ${skuText}). Revisa si debes editar el existente.`
          : "Ya existe un producto con ese nombre. Revisa si debes editar el existente."
      )
    );
  }

  const { data: unitsData } = await supabase
    .from("inventory_units")
    .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
    .eq("is_active", true)
    .limit(500);
  const units = (unitsData ?? []) as UnitRow[];
  const unitMap = createUnitMap(units);

  const categoryId = asText(formData.get("category_id"));
  if (!categoryId) {
    redirect(
      `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
      encodeURIComponent("Selecciona una categoría antes de crear el producto.")
    );
  }
  const categoryKind = resolveTypeCategoryKind(typeKey);
  if (categoryId) {
    const { data: categoryRow, error: categoryError } = await supabase
      .from("product_categories")
      .select("id,name,parent_id,domain,site_id,is_active,applies_to_kinds")
      .eq("id", categoryId)
      .maybeSingle();
    if (categoryError || !categoryRow) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
        encodeURIComponent("La categoría seleccionada no existe.")
      );
    }
    const category = categoryRow as CategoryRow;
    if (category.is_active === false) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
        encodeURIComponent("La categoría seleccionada está inactiva.")
      );
    }
    if (!categorySupportsKind(category, categoryKind)) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
        encodeURIComponent("La categoría no aplica al tipo de item seleccionado.")
      );
    }
    if (
      categoryKind === "venta" &&
      (normalizeCategoryDomain(category.domain) || String(category.site_id ?? "").trim())
    ) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
        encodeURIComponent("Los productos de venta solo pueden usar categorías maestras globales.")
      );
    }
    if (categoryKind !== "venta" && normalizeCategoryDomain(category.domain)) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
        encodeURIComponent("Las categorías con dominio solo se permiten para productos de venta.")
      );
    }
  }

  if (categoryId) {
    const { count: activeChildrenCount, error: activeChildrenError } = await supabase
      .from("product_categories")
      .select("id", { head: true, count: "exact" })
      .eq("parent_id", categoryId)
      .eq("is_active", true);
    if (activeChildrenError) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
        encodeURIComponent(activeChildrenError.message)
      );
    }
    if ((activeChildrenCount ?? 0) > 0) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
        encodeURIComponent("Selecciona una categoría del último nivel (categoría hoja).")
      );
    }
  }

  const stockUnitCode = normalizeUnitCode(
    asText(formData.get("stock_unit_code")) || asText(formData.get("unit")) || "un"
  );
  const explicitCostRaw = asText(formData.get("cost"));
  const explicitCost =
    explicitCostRaw !== "" && Number.isFinite(Number(explicitCostRaw))
      ? Number(explicitCostRaw)
      : null;
  const costingModeRaw = asText(formData.get("costing_mode")) || "auto_primary_supplier";
  const costingModeBase =
    costingModeRaw === "manual" ? "manual" : "auto_primary_supplier";
  const costingMode: "auto_primary_supplier" | "manual" =
    config.hasSuppliers ? costingModeBase : "manual";
  const unitFamily = inferFamilyFromUnitCode(stockUnitCode, unitMap) ?? null;
  const requestedDefaultUnit = normalizeUnitCode(
    asText(formData.get("default_unit")) || stockUnitCode
  );
  const resolvedDefaultUnit = resolveCompatibleDefaultUnit({
    requestedDefaultUnit,
    stockUnitCode,
    unitMap,
  });

  const productPayload: Record<string, unknown> = {
    name,
    description: asText(formData.get("description")) || null,
    unit: stockUnitCode,
    stock_unit_code: stockUnitCode,
    product_type: config.productType,
    category_id: categoryId || null,
    price: formData.get("price") ? Number(formData.get("price")) : null,
    cost: explicitCost,
    is_active: true,
  };

  let createdProductId = "";
  let dedupedByRequestKey = false;
  let attempts = 0;
  let lastInsertErrorMessage = "";
  let supportsCreateRequestKeyColumn = true;
  while (!createdProductId && attempts < 2) {
    attempts += 1;
    const autoSku = await generateNextSku({
      supabase,
      productType: config.productType,
      inventoryKind: config.inventoryKind,
      name,
    });

    const insertPayload: Record<string, unknown> = {
      ...productPayload,
      sku: autoSku,
    };
    if (createRequestKey && supportsCreateRequestKeyColumn) {
      insertPayload.create_request_key = createRequestKey;
    }

    const { data: newProduct, error: insertErr } = await supabase.from("products").insert(insertPayload).select("id").single();

    if (isMissingColumnError(insertErr, "create_request_key")) {
      supportsCreateRequestKeyColumn = false;
      attempts -= 1;
      continue;
    }

    if (!insertErr && newProduct?.id) {
      createdProductId = newProduct.id;
      break;
    }

    if (createRequestKey && supportsCreateRequestKeyColumn && isCreateRequestKeyConflict(insertErr)) {
      const { data: existingByRequestKey } = await supabase
        .from("products")
        .select("id")
        .eq("create_request_key", createRequestKey)
        .maybeSingle();
      if (existingByRequestKey?.id) {
        createdProductId = existingByRequestKey.id;
        dedupedByRequestKey = true;
        break;
      }
    }

    lastInsertErrorMessage = insertErr?.message ?? "Error al crear.";
    if (!isSkuConflictError(insertErr)) {
      break;
    }
  }

  if (!createdProductId) {
    redirect(
      `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
      encodeURIComponent(
        lastInsertErrorMessage || "No se pudo asignar un SKU automático. Intenta de nuevo."
      )
    );
  }

  const productId = createdProductId;

  if (dedupedByRequestKey) {
    if (origoReviewContext) {
      await approveOrigoReviewProductRequest({
        supabase,
        userId: user.id,
        context: origoReviewContext,
        productId,
        productName: name,
      });
      revalidatePath("/inventory/catalog");
      redirect(
        buildOrigoReviewRedirectUrl({
          context: origoReviewContext,
          ok: "product_created_from_nexo",
          productId,
        })
      );
    }

    revalidatePath("/inventory/catalog");
    if (afterCreate === "create_another") {
      redirect(appendQueryParam(createAnotherHref, "ok", "created"));
    }
    if (afterCreate === "catalog") {
      redirect(appendQueryParam(catalogHref, "ok", "1"));
    }
    redirect(`/inventory/catalog/${productId}?ok=1`);
  }

  // Inventory profile
  const invKind = config.inventoryKind as string;
  const requestedMeasurementMode = normalizeMeasurementMode(asText(formData.get("measurement_mode")));
  const measurementMode = invKind === "asset" ? "fixed_presentation" : requestedMeasurementMode;
  const measurementPolicy = measurementPolicyForMode(measurementMode);
  const defaultTolerancePercent = clampTolerancePercent(
    asNullableNumber(formData.get("default_tolerance_percent")),
    measurementPolicy.default_tolerance_percent
  );
  const auxCountUnitCode =
    measurementMode === "count_with_weight"
      ? sanitizeAuxCountUnitCode(asText(formData.get("aux_count_unit_code")))
      : null;

  if (config.hasStorage || invKind === "asset") {
    const profilePayload = {
      product_id: productId,
      track_inventory: Boolean(formData.get("track_inventory")),
      inventory_kind: invKind,
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
    await supabase.from("product_inventory_profiles").upsert(profilePayload, { onConflict: "product_id" });
  } else {
    await supabase.from("product_inventory_profiles").upsert(
      {
        product_id: productId,
        track_inventory: false,
        inventory_kind: invKind,
        default_unit: resolvedDefaultUnit,
        unit_family: unitFamily,
        costing_mode: costingMode,
        measurement_mode: measurementMode,
        default_tolerance_percent: defaultTolerancePercent,
        aux_count_unit_code: auxCountUnitCode,
        requires_actual_receipt_qty: measurementPolicy.requires_actual_receipt_qty,
        requires_actual_dispatch_qty: measurementPolicy.requires_actual_dispatch_qty,
        requires_actual_production_qty: measurementPolicy.requires_actual_production_qty,
        requires_count_alongside_weight: measurementPolicy.requires_count_alongside_weight,
      },
      { onConflict: "product_id" }
    );
  }

  if (invKind === "asset") {
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
    if (assetProfileErr) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
        encodeURIComponent(assetProfileErr.message)
      );
    }

    const maintenanceLines = parseJsonArray<AssetMaintenanceLine>(
      formData.get("asset_maintenance_lines")
    );
    const maintenanceRows = maintenanceLines
      .filter((line) => !line?._delete)
      .map((line) => ({
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
    if (maintenanceRows.length) {
      const { error: maintenanceErr } = await supabase
        .from("product_asset_maintenance_events")
        .insert(maintenanceRows);
      if (maintenanceErr) {
        redirect(
          `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
          encodeURIComponent(maintenanceErr.message)
        );
      }
    }

    const transferLines = parseJsonArray<AssetTransferLine>(
      formData.get("asset_transfer_lines")
    );
    const transferRows = transferLines
      .filter((line) => !line?._delete)
      .map((line) => ({
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
    if (transferRows.length) {
      const { error: transferErr } = await supabase
        .from("product_asset_transfer_events")
        .insert(transferRows);
      if (transferErr) {
        redirect(
          `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
          encodeURIComponent(transferErr.message)
        );
      }
    }
  }

  // Suppliers
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
  if (config.hasSuppliers) {
    const supplierRaw = formData.get("supplier_lines");
    let hasAnySupplierLine = false;
    let hasCompletePrimarySupplier = false;
    if (typeof supplierRaw === "string" && supplierRaw) {
      let lines: Array<Record<string, unknown>> = [];
      try {
        lines = JSON.parse(supplierRaw) as typeof lines;
      } catch {
        redirect(
          `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=${encodeURIComponent(
            "No se pudo leer el bloque de proveedores. Recarga la pagina e intenta de nuevo."
          )}`
        );
      }
      for (const line of lines) {
        if ((line._delete as boolean) || !line.supplier_id) continue;
        hasAnySupplierLine = true;
        const packQty =
          Number(line.purchase_pack_qty ?? line.purchase_unit_size ?? 0) || 0;
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
            // ignore invalid conversion in auto-cost fallback
          }
        }

        if (
          Boolean(line.is_primary) &&
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
            // keep without operational profile when conversion is invalid
          }
        }

        await supabase.from("product_suppliers").insert({
          product_id: productId,
          supplier_id: line.supplier_id as string,
          supplier_sku: (line.supplier_sku as string) || null,
          supplier_product_alias: (line.supplier_product_alias as string) || null,
          purchase_unit: (line.purchase_unit as string) || null,
          purchase_unit_size: purchaseUnitSizeLegacy,
          purchase_pack_qty: packQty > 0 ? packQty : null,
          purchase_pack_unit_code: packUnitCode || null,
          purchase_price: purchasePrice,
          purchase_price_net: purchasePriceNet,
          purchase_price_includes_tax: purchasePriceIncludesTax,
          purchase_tax_rate: purchaseTaxRate,
          purchase_price_includes_icui: purchasePriceIncludesIcui,
          purchase_icui_rate: purchaseIcuiRate,
          currency: (line.currency as string) || "COP",
          lead_time_days: (line.lead_time_days as number) ?? null,
          min_order_qty: (line.min_order_qty as number) ?? null,
          is_primary: Boolean(line.is_primary),
        });
      }
    }
    if (!hasAnySupplierLine) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}&error=${encodeURIComponent(
          "Debes agregar al menos un proveedor para este producto."
        )}`
      );
    }
    if (!hasCompletePrimarySupplier) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}&error=${encodeURIComponent(
          "Completa proveedor principal con empaque, cantidad, unidad y precio de compra."
        )}`
      );
    }
    if (!purchaseUomFromSupplier) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}&error=${encodeURIComponent(
          "No se pudo convertir unidad de compra a unidad base. Revisa unidad base, unidad de compra y cantidad del proveedor principal."
        )}`
      );
    }
  }

  const remissionInputUnitCodeRaw = asText(formData.get("remission_uom_code"));
  const remissionQtyInStockText = asText(formData.get("remission_uom_qty_in_stock"));
  const remissionLabelText = asText(formData.get("remission_uom_label"));
  const internalBreakdownEnabled = asText(formData.get("internal_breakdown_enabled")) === "on";
  const internalBreakdownLabel = asText(formData.get("internal_breakdown_label"));
  const internalBreakdownUnitCode = normalizeUnitCode(asText(formData.get("internal_breakdown_unit_code")));
  const internalBreakdownQtyRaw = Number(asText(formData.get("internal_breakdown_qty_in_stock")) || 0);
  let internalBreakdownQtyInStock = 0;
  if (Number.isFinite(internalBreakdownQtyRaw) && internalBreakdownQtyRaw > 0 && internalBreakdownUnitCode) {
    try {
      internalBreakdownQtyInStock = convertQuantity({
        quantity: internalBreakdownQtyRaw,
        fromUnitCode: internalBreakdownUnitCode,
        toUnitCode: stockUnitCode,
        unitMap,
      }).quantity;
    } catch {
      internalBreakdownQtyInStock = 0;
    }
  }
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
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=${encodeURIComponent(
          "Completa la presentación de remisión: unidad y equivalencia a unidad base."
        )}`
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
    if (!purchaseUomFromSupplier) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=${encodeURIComponent(
          "No se pudo usar la presentación de compra en operación. Completa el proveedor primario."
        )}`
      );
    }
    remissionUomFromSupplier = {
      label: purchaseUomFromSupplier.label || "Presentación compra",
      inputUnitCode: purchaseUomFromSupplier.inputUnitCode,
      qtyInInputUnit: purchaseUomFromSupplier.qtyInInputUnit,
      qtyInStockUnit: purchaseUomFromSupplier.qtyInStockUnit,
      source: "supplier_primary",
    };
  } else if (remissionSourceMode === "operation_unit") {
    if (config.productType === "preparacion") {
      remissionUomFromSupplier = {
        label: "Unidad operativa temporal",
        inputUnitCode: stockUnitCode,
        qtyInInputUnit: 1,
        qtyInStockUnit: 1,
        source: "manual",
      };
    } else {
      remissionUomFromSupplier = buildRemissionFromDefaultUnit({
        defaultUnitCode: resolvedDefaultUnit,
        stockUnitCode,
        unitMap,
      });
      if (!remissionUomFromSupplier) {
        redirect(
          `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=${encodeURIComponent(
            "No se pudo definir la presentación de remisión desde unidad operativa. Revisa unidad base y unidad operativa."
          )}`
        );
      }
    }
  } else if (remissionSourceMode === "recipe_portion") {
    redirect(
      `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=${encodeURIComponent(
        "Primero crea y publica la receta. Luego en edición podrás usar remisión desde porción de receta."
      )}`
    );
  }

  if (internalBreakdownEnabled && (!internalBreakdownLabel || !internalBreakdownUnitCode || internalBreakdownQtyInStock <= 0)) {
    redirect(
      `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=${encodeURIComponent(
        "Completa el desglose visual interno: nombre, unidad y equivalencia a base."
      )}`
    );
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

  if (internalBreakdownEnabled) {
    await supabase.from("product_uom_profiles").insert({
      product_id: productId,
      label: internalBreakdownLabel,
      input_unit_code: internalBreakdownUnitCode,
      qty_in_input_unit: 1,
      qty_in_stock_unit: internalBreakdownQtyInStock,
      usage_context: "general",
      is_default: false,
      is_active: true,
      source: "manual",
      updated_at: new Date().toISOString(),
    });
  }

  if (costingMode === "auto_primary_supplier" && explicitCost == null && autoCostFromPrimary != null) {
    await supabase
      .from("products")
      .update({ cost: autoCostFromPrimary, updated_at: new Date().toISOString() })
      .eq("id", productId);
  }

  // Site settings
  const siteRaw = formData.get("site_settings_lines");
  if (typeof siteRaw === "string" && siteRaw) {
    let siteLines: Array<Record<string, unknown>> = [];
    try {
      siteLines = JSON.parse(siteRaw) as typeof siteLines;
    } catch {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=${encodeURIComponent(
          "No se pudo leer disponibilidad por sede. Recarga la pagina e intenta de nuevo."
        )}`
      );
    }
    for (const line of siteLines) {
      if (line._delete as boolean) continue;
      const siteIdFromLine = String(line.site_id ?? "").trim();

      const normalizedAreaKinds = Array.from(
        new Set(
          (Array.isArray(line.area_kinds) ? line.area_kinds : [])
            .map((kind) => String(kind ?? "").trim())
            .filter(Boolean)
        )
      );

      const normalizedDefaultAreaKind =
        normalizedAreaKinds[0] ?? String(line.default_area_kind ?? "").trim() ?? "";

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
        Boolean(siteIdFromLine) ||
        Boolean(normalizedDefaultAreaKind) ||
        normalizedAreaKinds.length > 0 ||
        Boolean(String(line.production_location_id ?? "").trim()) ||
        rawLocalProductionEnabled !== undefined ||
        Boolean(String(line.audience ?? "").trim()) ||
        rawRemissionEnabled !== undefined ||
        rawSalesEnabled !== undefined ||
        String(line.min_stock_qty ?? "").trim() !== "";

      if (!siteIdFromLine && hasMeaningfulData) {
        redirect(
          `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=${encodeURIComponent(
            "En disponibilidad por sede debes seleccionar una sede."
          )}`
        );
      }

      if (!siteIdFromLine) continue;

      const normalizedAudience = String(line.audience ?? "BOTH").trim().toUpperCase();
      const minStockInputMode = String(line.min_stock_input_mode ?? "base").trim().toLowerCase() === "purchase"
        ? "purchase"
        : "base";

      const parsedMinStockQtyRaw =
        line.min_stock_qty == null || line.min_stock_qty === ""
          ? null
          : Number(line.min_stock_qty);

      const parsedMinStockQty =
        parsedMinStockQtyRaw != null && Number.isFinite(parsedMinStockQtyRaw)
          ? parsedMinStockQtyRaw
          : null;

      const parsedMinPurchaseQty =
        line.min_stock_purchase_qty == null || String(line.min_stock_purchase_qty).trim() === ""
          ? null
          : Number(line.min_stock_purchase_qty);

      const parsedMinPurchaseFactor =
        line.min_stock_purchase_to_base_factor == null ||
          String(line.min_stock_purchase_to_base_factor).trim() === ""
          ? null
          : Number(line.min_stock_purchase_to_base_factor);

      const siteRowPayload = {
        product_id: productId,
        site_id: siteIdFromLine,
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
          minStockInputMode === "purchase" && parsedMinPurchaseQty != null && Number.isFinite(parsedMinPurchaseQty)
            ? parsedMinPurchaseQty
            : null,
        min_stock_purchase_unit_code:
          minStockInputMode === "purchase"
            ? String(line.min_stock_purchase_unit_code ?? "").trim().toLowerCase() || null
            : null,
        min_stock_purchase_to_base_factor:
          minStockInputMode === "purchase" &&
            parsedMinPurchaseFactor != null &&
            Number.isFinite(parsedMinPurchaseFactor) &&
            parsedMinPurchaseFactor > 0
            ? parsedMinPurchaseFactor
            : null,
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
      const siteInsertError = await insertProductSiteSettingCompat(supabase, siteRowPayload);
      if (siteInsertError) {
        redirect(
          `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=${encodeURIComponent(
            siteInsertError.message
          )}`
        );
      }
    }
  }

  if (origoReviewContext) {
    await approveOrigoReviewProductRequest({
      supabase,
      userId: user.id,
      context: origoReviewContext,
      productId,
      productName: name,
    });
    revalidatePath("/inventory/catalog");
    redirect(
      buildOrigoReviewRedirectUrl({
        context: origoReviewContext,
        ok: "product_created_from_nexo",
        productId,
      })
    );
  }

  revalidatePath("/inventory/catalog");
  if (afterCreate === "create_another") {
    redirect(appendQueryParam(createAnotherHref, "ok", "created"));
  }
  if (afterCreate === "catalog") {
    redirect(appendQueryParam(catalogHref, "ok", "1"));
  }
  redirect(`/inventory/catalog/${productId}?ok=1`);
}

export async function createProductAndView(formData: FormData) {
  "use server";

  formData.set("_after_create", "view");
  return createProduct(formData);
}

export async function createProductAndReturnToCatalog(formData: FormData) {
  "use server";

  formData.set("_after_create", "catalog");
  return createProduct(formData);
}

export async function createProductAndCreateAnother(formData: FormData) {
  "use server";

  formData.set("_after_create", "create_another");
  return createProduct(formData);
}
