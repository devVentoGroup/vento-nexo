import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { RequiredFieldsGuardForm } from "@/components/inventory/forms/RequiredFieldsGuardForm";
import { CreateRequestKeyField } from "@/components/inventory/forms/create-request-key-field";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { getCategoryDomainOptions } from "@/lib/constants";

import { ProductSuppliersEditor } from "@/features/inventory/catalog/product-suppliers-editor";
import { ProductFormFooter } from "@/features/inventory/catalog/product-form-footer";
import { ProductIdentityFields } from "@/features/inventory/catalog/product-identity-fields";
import { ProductAssetTechnicalSection } from "@/features/inventory/catalog/product-asset-technical-section";
import { ProductPhotoSection } from "@/features/inventory/catalog/product-photo-section";
import { ProductRemissionUomFields } from "@/features/inventory/catalog/product-remission-uom-fields";
import { ProductSiteAvailabilitySection } from "@/features/inventory/catalog/product-site-availability-section";
import { ProductStorageFields } from "@/features/inventory/catalog/product-storage-fields";
import {
  CatalogCategoryContextForm,
  CatalogHintPanel,
  CatalogOptionalDetails,
  CatalogSection,
} from "@/features/inventory/catalog/catalog-ui";
import {
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
  convertQuantity,
  createUnitMap,
  inferFamilyFromUnitCode,
  normalizeUnitCode,
  type InventoryUnit,
} from "@/lib/inventory/uom";
import { computeAutoCostFromPrimarySupplier } from "@/lib/inventory/costing";
import { generateNextSku, isSkuConflictError } from "@/lib/inventory/sku";

export const dynamic = "force-dynamic";

type CategoryRow = InventoryCategoryRow;
type UnitRow = InventoryUnit;
const STOCK_UNIT_FIELD_ID = "stock_unit_code";

function asText(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

function asNullableNumber(v: FormDataEntryValue | null): number | null {
  const raw = asText(v);
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

function resolveTypeCategoryKind(typeKey: ProductTypeKey): CategoryKind {
  if (typeKey === "asset") return "equipo";
  if (typeKey === "venta" || typeKey === "reventa") return "venta";
  if (typeKey === "preparacion") return "preparacion";
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
    title: "Nueva preparacion",
    subtitle: "Producto intermedio (WIP): se produce a partir de insumos y se usa en otros productos.",
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
    title: "Nuevo equipo / activo",
    subtitle: "Equipo, herramienta o activo fijo para control patrimonial.",
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

async function createProduct(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) redirect(await buildShellLoginUrl("/inventory/catalog"));

  const { data: employee } = await supabase.from("employees").select("role").eq("id", user.id).maybeSingle();
  const role = String((employee as { role?: string } | null)?.role ?? "").toLowerCase();
  if (!["propietario", "gerente_general"].includes(role)) {
    redirect("/inventory/catalog?error=" + encodeURIComponent("No tienes permisos para crear productos."));
  }

  const typeKey = asText(formData.get("_type_key")) as ProductTypeKey;
  const createRequestKeyRaw = asText(formData.get("_create_request_key"));
  const createRequestKey = createRequestKeyRaw || null;
  const modeQuery = "";
  const config = TYPE_CONFIG[typeKey] ?? TYPE_CONFIG.insumo;

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
        encodeURIComponent("Selecciona una categoria antes de crear el producto.")
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
          encodeURIComponent("La categoria seleccionada no existe.")
      );
    }
    const category = categoryRow as CategoryRow;
    if (category.is_active === false) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
          encodeURIComponent("La categoria seleccionada esta inactiva.")
      );
    }
    if (!categorySupportsKind(category, categoryKind)) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
          encodeURIComponent("La categoria no aplica al tipo de item seleccionado.")
      );
    }
    if (
      categoryKind === "venta" &&
      (normalizeCategoryDomain(category.domain) || String(category.site_id ?? "").trim())
    ) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
          encodeURIComponent("Los productos de venta solo pueden usar categorias maestras globales.")
      );
    }
    if (categoryKind !== "venta" && normalizeCategoryDomain(category.domain)) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
          encodeURIComponent("Las categorias con dominio solo se permiten para productos de venta.")
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
          encodeURIComponent("Selecciona una categoria del ultimo nivel (categoria hoja).")
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
    image_url: asText(formData.get("image_url")) || null,
    is_active: true,
  };
  if (formData.has("catalog_image_url")) {
    productPayload.catalog_image_url = asText(formData.get("catalog_image_url")) || null;
  }

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
          lastInsertErrorMessage || "No se pudo asignar un SKU automatico. Intenta de nuevo."
        )
    );
  }

  const productId = createdProductId;

  if (dedupedByRequestKey) {
    revalidatePath("/inventory/catalog");
    redirect(`/inventory/catalog/${productId}?ok=1`);
  }

  // Inventory profile
  const invKind = config.inventoryKind as string;
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
    if (assetProfileErr) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=` +
          encodeURIComponent(assetProfileErr.message)
      );
    }

    const maintenanceLines =
      assetProfileTemplate === "industrial"
        ? parseJsonArray<AssetMaintenanceLine>(formData.get("asset_maintenance_lines"))
        : [];
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
              purchaseUomFromSupplier = {
                label: String(line.purchase_unit || "Empaque"),
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
    remissionUomFromSupplier = buildRemissionFromDefaultUnit({
      defaultUnitCode: resolvedDefaultUnit,
      stockUnitCode,
      unitMap,
    });
    if (!remissionUomFromSupplier) {
      redirect(
        `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=${encodeURIComponent(
          "No se pudo definir la presentacion de remision desde unidad operativa. Revisa unidad base y unidad operativa."
        )}`
      );
    }
  } else if (remissionSourceMode === "recipe_portion") {
    redirect(
      `/inventory/catalog/new?type=${typeKey}${modeQuery}&error=${encodeURIComponent(
        "Primero crea y publica la receta. Luego en edición podrás usar remisión desde porción de receta."
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
      const hasMeaningfulData =
        Boolean(siteIdFromLine) ||
        Boolean(String(line.default_area_kind ?? "").trim()) ||
        Boolean(String(line.audience ?? "").trim()) ||
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
        default_area_kind: (line.default_area_kind as string) || null,
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

  revalidatePath("/inventory/catalog");
  redirect(`/inventory/catalog/${productId}?ok=1`);
}

export default async function NewProductPage({
  searchParams,
}: {
  searchParams?: Promise<{
    type?: string;
    mode?: string;
    error?: string;
    category_scope?: string;
    category_site_id?: string;
    category_domain?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const typeKey = (sp.type ?? "insumo") as ProductTypeKey;
  const createRequestKey = crypto.randomUUID();
  const config = TYPE_CONFIG[typeKey] ?? TYPE_CONFIG.insumo;

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: `/inventory/catalog/new?type=${typeKey}`,
  });

  const [{ data: emp }, { data: settings }, { data: sitesData }] = await Promise.all([
    supabase.from("employees").select("role,site_id").eq("id", user.id).maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", user.id)
      .maybeSingle(),
    supabase
      .from("sites")
      .select("id,name,site_type")
      .eq("is_active", true)
      .neq("name", "App Review (Demo)")
      .order("name"),
  ]);
  const role = String((emp as { role?: string } | null)?.role ?? "").toLowerCase();
  const canCreate = ["propietario", "gerente_general"].includes(role);

  const sitesList = (sitesData ?? []) as {
    id: string;
    name: string | null;
    site_type: string | null;
  }[];
  const siteNamesById = Object.fromEntries(
    sitesList.map((site) => [site.id, site.name ?? site.id])
  );

  const categoryKind = resolveTypeCategoryKind(typeKey);
  const categorySiteId = String(
    sp.category_site_id ??
      (settings as { selected_site_id?: string | null } | null)?.selected_site_id ??
      (emp as { site_id?: string | null } | null)?.site_id ??
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

  const allCategoryRows = await loadCategoryRows(supabase);
  const categoryRows = filterCategoryRows(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: effectiveCategorySiteId,
  });
  const categoryDomainOptions = getCategoryDomainOptions(
    getCategoryDomainCodes(allCategoryRows, categoryKind)
  );

  const { data: areaKindsWithPurpose, error: areaKindsWithPurposeError } = await supabase
    .from("area_kinds")
    .select("code,name,use_for_remission")
    .order("name", { ascending: true });
  const areaKindsList = !areaKindsWithPurposeError
    ? ((areaKindsWithPurpose ?? []) as Array<{
        code: string;
        name: string | null;
        use_for_remission?: boolean | null;
      }>)
    : (((await supabase.from("area_kinds").select("code,name").order("name", { ascending: true })).data ??
        []) as Array<{ code: string; name: string | null }>).map((row) => ({
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
      ((siteAreasData ?? []) as Array<{ site_id: string | null; kind: string | null }>)
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
      : { data: [] as Array<{ site_id: string | null; area_kind: string | null }> };
  const remissionAreaKindsBySite = (
    (remissionAreaRulesData ?? []) as Array<{ site_id: string | null; area_kind: string | null }>
  ).reduce(
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

  const { data: suppliersData } = config.hasSuppliers
    ? await supabase.from("suppliers").select("id,name").eq("is_active", true).order("name")
    : { data: [] };
  const suppliersList = (suppliersData ?? []) as { id: string; name: string | null }[];

  const { data: unitsData } = await supabase
    .from("inventory_units")
    .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
    .eq("is_active", true)
    .order("family", { ascending: true })
    .order("factor_to_base", { ascending: true })
    .limit(500);
  const unitsList = (unitsData ?? []) as UnitRow[];

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

  const defaultStockUnitCode = unitsList[0]?.code ?? "un";
  const defaultUnitOptions = unitsList;

  if (!canCreate) {
    return (
      <div className="ui-scene w-full max-w-6xl space-y-6">
        <section className="ui-remission-hero ui-fade-up">
          <div className="space-y-2">
            <h1 className="ui-h1">{config.title}</h1>
            <p className="ui-body-muted">{config.subtitle}</p>
          </div>
        </section>
        <div className="ui-alert ui-alert--warn">
          Solo propietarios y gerentes generales pueden crear productos.
        </div>
      </div>
    );
  }

  return (
    <div className="ui-scene w-full max-w-6xl space-y-8">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link
                href="/inventory/catalog"
                className="ui-btn ui-btn--ghost inline-flex h-12 items-center px-5 text-base font-semibold"
              >
                ← Volver al catálogo
              </Link>
              <h1 className="ui-h1">{config.title}</h1>
              <p className="ui-body-muted">{config.subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                Formulario completo
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {typeKey}
              </span>
            </div>
          </div>
          <div className="ui-remission-kpis ui-remission-kpis--stack sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Tipo</div>
              <div className="ui-remission-kpi-value">{typeKey}</div>
              <div className="ui-remission-kpi-note">Clase operativa del maestro que vas a crear</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Modo</div>
              <div className="ui-remission-kpi-value">Completo</div>
              <div className="ui-remission-kpi-note">Alta definitiva con unidades, proveedor y sedes</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Objetivo</div>
              <div className="ui-remission-kpi-value">Definitivo</div>
              <div className="ui-remission-kpi-note">Maestro completo conectado a compras ORIGO y remisiones</div>
            </article>
          </div>
        </div>
      </section>

      <CatalogOptionalDetails
        title="Criterio de esta ficha"
        summary="Abre este bloque solo si necesitas revisar el marco operativo o cambiar el arbol disponible."
      >
          <CatalogHintPanel title="Norte del catalogo">
            <p>
              Aqui creas el <strong className="text-[var(--ui-text)]">producto maestro</strong>. La categoria de esta
              pantalla es operativa: sirve para inventario, abastecimiento y setup por sede.
            </p>
            <p>
              Este flujo es el definitivo para alta de insumos, productos y activos con su configuracion operativa.
            </p>
          </CatalogHintPanel>

        {isSaleCategoryKind ? null : (
          <CatalogCategoryContextForm
            hiddenFields={[{ name: "type", value: typeKey }]}
            categoryScope={categoryScope}
            categorySiteId={effectiveCategorySiteId}
            categoryDomain={categoryDomain}
            showDomain={shouldShowCategoryDomain(categoryKind)}
            categoryDomainOptions={categoryDomainOptions}
            sites={sitesList.map((site) => ({ id: site.id, name: site.name }))}
          />
        )}
      </CatalogOptionalDetails>

      <RequiredFieldsGuardForm
        action={createProduct}
        className="space-y-8"
        persistKey={`catalog-new-${typeKey}`}
      >
        <input type="hidden" name="_type_key" value={typeKey} />
        <input type="hidden" name="_mode" value="" />
        <CreateRequestKeyField initialValue={createRequestKey} />

        <CatalogSection
          title="Datos basicos"
          description="Nombre, codigo y categoria operativa. Las unidades se definen en la seccion de almacenamiento."
        >
          <ProductIdentityFields
            namePlaceholder={typeKey === "asset" ? "Ej. Horno industrial" : "Ej. Harina 000"}
            categories={categoryRows}
            selectedCategoryId=""
            siteNamesById={siteNamesById}
            categoryRequired
            skuField={{
              mode: "create",
              initialProductType: config.productType,
              initialInventoryKind: config.inventoryKind,
            }}
            aside={
              <div className="ui-panel-soft p-3 text-sm text-[var(--ui-muted)]">
                Configura unidad base y unidad operativa en la seccion de almacenamiento.
              </div>
            }
            priceField={
              config.hasPrice
                ? {
                    label: "Precio base referencial",
                    placeholder: "Opcional",
                    hint: "El precio final se define por sede/canal en la capa comercial.",
                  }
                : undefined
            }
            trailingContent={
              <>
                {typeKey !== "asset" ? (
                  <>
                    <input type="hidden" name="cost" value="" />
                    <div className="ui-panel-soft p-3 text-sm text-[var(--ui-muted)] sm:col-span-2">
                      <p className="font-medium text-[var(--ui-text)]">Costo automatico</p>
                      <p className="mt-1">
                        El costo unitario se calcula automaticamente desde proveedor primario y entradas.
                      </p>
                      <p>
                        Si faltan datos de proveedor, el producto se guarda y quedara marcado como
                        incompleto para terminar configuracion.
                      </p>
                    </div>
                  </>
                ) : null}
                {config.hasStorage ? (
                  <div className="sm:col-span-2">
                    <ProductRemissionUomFields
                      units={unitsList.map((unit) => ({ code: unit.code, name: unit.name }))}
                      stockUnitCode={defaultStockUnitCode}
                      defaultLabel="Unidad operativa"
                      defaultInputUnitCode={defaultStockUnitCode}
                      defaultQtyInStockUnit={1}
                      defaultSourceMode="disabled"
                      allowPurchasePrimaryOption={config.hasSuppliers}
                    />
                  </div>
                ) : null}
              </>
            }
          />
        </CatalogSection>

        {/* --- Unidades y almacenamiento (definir antes de proveedores) --- */}
        {config.hasStorage && (
          <CatalogSection
            title="Unidades y almacenamiento"
            description="Define unidad base, unidad operativa y politica de costo para inventario."
          >
            <ProductStorageFields
              stockUnitFieldId={STOCK_UNIT_FIELD_ID}
              units={defaultUnitOptions}
              stockUnitCode={defaultStockUnitCode}
              defaultUnitCode={defaultStockUnitCode}
              defaultRemissionMode="disabled"
              stockUnitLabel="Unidad base de stock *"
              stockUnitHint="Ejemplo jugo: base = ml. Ejemplo queso: base = un/lonja."
              defaultUnitHint="Se usa para captura rapida en formularios cuando no hay empaque operativo."
              costingModeField={{
                hasSuppliers: config.hasSuppliers,
                defaultValue: "auto_primary_supplier",
              }}
              trackingOptions={{
                trackInventoryDefaultChecked: true,
                lotTrackingDefaultChecked: false,
                expiryTrackingDefaultChecked: false,
                collapsible: true,
              }}
            />
          </CatalogSection>
        )}

        {/* Guia: proveedores (solo insumo) */}
        {config.hasSuppliers ? (
          <CatalogOptionalDetails
            title="Guia rapida de unidades"
            summary="Casos reales para validar unidades base y de compra sin saturar la ficha."
          >
            <div className="text-sm text-[var(--ui-muted)] space-y-2">
              <p>
                <strong className="text-[var(--ui-text)]">Queso gouda:</strong> base = lonja/un, compra = 1 paquete de 10 un, receta = 2 un.
              </p>
              <p>
                <strong className="text-[var(--ui-text)]">Jugo de naranja:</strong> base = ml, compra = 1 botella de 1 l, receta = ml.
              </p>
              <p>
                <strong className="text-[var(--ui-text)]">Cloro:</strong> base = ml, compra = galon, remision = botella 1 l, uso final = taza (convertida a ml).
              </p>
              <p>Regla: el sistema guarda stock y costo en unidad base; compra/remision se convierten automaticamente.</p>
            </div>
          </CatalogOptionalDetails>
        ) : null}

        {config.hasSuppliers && (
          <CatalogSection
            title="Compra principal (proveedor)"
            description="Aqui defines como compra o factura el proveedor. El sistema convierte automaticamente a la unidad base."
          >
            <ProductSuppliersEditor
              name="supplier_lines"
              initialRows={[]}
              suppliers={suppliersList.map((s) => ({ id: s.id, name: s.name }))}
              units={unitsList.map((unit) => ({
                code: unit.code,
                name: unit.name,
                family: unit.family,
                factor_to_base: unit.factor_to_base,
              }))}
              stockUnitCode={defaultStockUnitCode}
              stockUnitCodeFieldId={STOCK_UNIT_FIELD_ID}
              mode="simple"
            />
          </CatalogSection>
        )}

        {/* Receta se gestiona fuera del flujo actual */}
        {config.hasRecipe && (
          <CatalogOptionalDetails
            title="Receta y produccion"
            summary="Esta configuracion queda fuera del flujo operativo actual."
          >
            <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
              <p>
                Crea primero este producto en NEXO para definir inventario y sedes.
                Si luego activas FOGO, completa BOM, pasos y medios desde alla.
              </p>
              <a
                href={buildFogoRecipeCreateUrl(typeKey)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex ui-btn ui-btn--ghost"
              >
                Abrir continuidad externa
              </a>
            </div>
          </CatalogOptionalDetails>
        )}

        <ProductPhotoSection
          description="Imagen visual para identificar rapido el producto o insumo en listados y ficha."
          currentUrl={null}
          existingImageUrls={existingImageUrls}
          productId={`draft-${typeKey}`}
          footerText="Si no subes fotos ahora, puedes cargarlas despues desde la ficha de edicion."
          collapsible
        />

        {typeKey === "asset" ? (
          <ProductAssetTechnicalSection
            defaultTemplate="general"
            initialProfile={null}
            initialMaintenance={[]}
            initialTransfers={[]}
          />
        ) : null}

        {typeKey !== "asset" ? (
          <ProductSiteAvailabilitySection
            initialRows={[]}
            sites={sitesList.map((s) => ({ id: s.id, name: s.name, site_type: s.site_type }))}
            areaKinds={areaKindsList.map((a) => ({
              code: a.code,
              name: a.name ?? a.code,
              use_for_remission: a.use_for_remission ?? null,
            }))}
            siteAreaKinds={siteAreaKindsList}
            remissionAreaKindsBySite={remissionAreaKindsBySite}
            stockUnitCode={defaultStockUnitCode}
            operationUnitHint={buildOperationUnitHintFromUnits({
              units: unitsList,
              inputUnitCode: defaultStockUnitCode,
              stockUnitCode: defaultStockUnitCode,
            })}
          />
        ) : null}

        <ProductFormFooter
          submitLabel={`Crear ${
            typeKey === "asset"
              ? "equipo"
              : typeKey === "venta"
                ? "producto"
                : typeKey === "reventa"
                  ? "producto de reventa"
                  : typeKey
          }`}
        />
      </RequiredFieldsGuardForm>
    </div>
  );
}
