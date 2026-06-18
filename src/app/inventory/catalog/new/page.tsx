import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { RequiredFieldsGuardForm } from "@/components/inventory/forms/RequiredFieldsGuardForm";
import { CreateRequestKeyField } from "@/components/inventory/forms/create-request-key-field";
import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import {
  getSiteCapabilitiesMap,
  type SiteOperationalCapabilities,
} from "@/lib/inventory/site-capabilities";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";

import { ProductCostStatusPanel } from "@/features/inventory/catalog/product-cost-status-panel";
import { ProductIdentityFields } from "@/features/inventory/catalog/product-identity-fields";
import { ProductAssetTechnicalSection } from "@/features/inventory/catalog/product-asset-technical-section";
import { ProductPurchaseSection } from "@/features/inventory/catalog/product-purchase-section";
import { ProductSiteAvailabilitySection } from "@/features/inventory/catalog/product-site-availability-section";
import { ProductStorageFields } from "@/features/inventory/catalog/product-storage-fields";
import { NewProductHero } from "./_components/new-product-hero";
import {
  CatalogOptionalDetails,
  CatalogSection,
} from "@/features/inventory/catalog/catalog-ui";
import {
  categorySupportsKind,
  filterCategoryRows,
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

type MeasurementMode =
  | "fixed_presentation"
  | "variable_weight"
  | "count_with_weight"
  | "bulk_volume";

function normalizeMeasurementMode(value: string | null | undefined): MeasurementMode {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "variable_weight" ||
    raw === "count_with_weight" ||
    raw === "bulk_volume" ||
    raw === "fixed_presentation"
  ) {
    return raw;
  }
  return "fixed_presentation";
}

function defaultToleranceForMeasurementMode(mode: MeasurementMode): number {
  if (mode === "fixed_presentation") return 0;
  if (mode === "bulk_volume") return 2;
  return 5;
}

function clampTolerancePercent(value: number | null, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function sanitizeAuxCountUnitCode(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || "piezas";
}

function measurementPolicyForMode(mode: MeasurementMode) {
  return {
    requires_actual_receipt_qty: mode !== "fixed_presentation",
    requires_actual_dispatch_qty: mode !== "fixed_presentation",
    requires_actual_production_qty: mode !== "fixed_presentation",
    requires_count_alongside_weight: mode === "count_with_weight",
    default_tolerance_percent: defaultToleranceForMeasurementMode(mode),
  };
}

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
      "production_location_id",
      "local_production_enabled",
      "area_kinds",
      "remission_enabled",
      "sales_enabled",
      "min_stock_input_mode",
      "min_stock_purchase_qty",
      "min_stock_purchase_unit_code",
      "min_stock_purchase_to_base_factor",
    ],
    [
      "production_location_id",
      "local_production_enabled",
      "area_kinds",
      "remission_enabled",
      "sales_enabled",
      "min_stock_input_mode",
      "min_stock_purchase_qty",
      "min_stock_purchase_unit_code",
      "min_stock_purchase_to_base_factor",
      "audience",
    ],
    [
      "production_location_id",
      "local_production_enabled",
      "area_kinds",
      "remission_enabled",
      "sales_enabled",
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

function appendQueryParam(path: string, key: string, value: string): string {
  const [pathname, qs] = path.split("?", 2);
  const params = new URLSearchParams(qs ?? "");
  params.set(key, value);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
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

function safeDecode(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
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
  const canCreateByRole = ["propietario", "gerente_general", "bodeguero"].includes(role);
  const canCreateByPermission = await checkPermission(supabase, "nexo", "catalog.products");
  if (!canCreateByRole && !canCreateByPermission) {
    redirect("/inventory/catalog?error=" + encodeURIComponent("No tienes permisos para crear productos."));
  }

  const typeKey = asText(formData.get("_type_key")) as ProductTypeKey;
  const createRequestKeyRaw = asText(formData.get("_create_request_key"));
  const createRequestKey = createRequestKeyRaw || null;
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
      remissionUomFromSupplier = null;
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

  revalidatePath("/inventory/catalog");
  if (afterCreate === "create_another") {
    redirect(appendQueryParam(createAnotherHref, "ok", "created"));
  }
  if (afterCreate === "catalog") {
    redirect(appendQueryParam(catalogHref, "ok", "1"));
  }
  redirect(`/inventory/catalog/${productId}?ok=1`);
}

async function createProductAndView(formData: FormData) {
  "use server";

  formData.set("_after_create", "view");
  return createProduct(formData);
}

async function createProductAndReturnToCatalog(formData: FormData) {
  "use server";

  formData.set("_after_create", "catalog");
  return createProduct(formData);
}

async function createProductAndCreateAnother(formData: FormData) {
  "use server";

  formData.set("_after_create", "create_another");
  return createProduct(formData);
}


export default async function NewProductPage({
  searchParams,
}: {
  searchParams?: Promise<{
    type?: string;
    mode?: string;
    error?: string;
    ok?: string;
    category_scope?: string;
    category_site_id?: string;
    category_domain?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const typeKey = (sp.type ?? "insumo") as ProductTypeKey;
  const createRequestKey = crypto.randomUUID();
  const config = TYPE_CONFIG[typeKey] ?? TYPE_CONFIG.insumo;
  const kpis = heroKpis(typeKey);
  const errorMsg = safeDecode(sp.error);
  const createdMsg = sp.ok === "created" ? "Producto creado. Puedes registrar el siguiente sin volver al catálogo." : "";
  const catalogHref = catalogHrefForTypeKey(typeKey);
  const catalogLabel = catalogLabelForTypeKey(typeKey);
  const createSubmitLabel = typeKey === "asset"
    ? "Crear modelo patrimonial"
    : typeKey === "venta"
      ? "Crear producto"
      : typeKey === "reventa"
        ? "Crear producto de reventa"
        : typeKey === "preparacion_vendible"
          ? "Crear preparación vendible"
          : `Crear ${typeKey}`;
  const normalizedProductType = String(config.productType ?? "").trim().toLowerCase();
  const normalizedInventoryKind = String(config.inventoryKind ?? "").trim().toLowerCase();
  const isAssetItem = normalizedInventoryKind === "asset";
  const hasRecipe = Boolean(config.hasRecipe);
  const hasSuppliers = Boolean(config.hasSuppliers);
  const lockedInventoryKind = config.inventoryKind;
  const lockedInventoryKindText = inventoryKindLabel(lockedInventoryKind);
  const createTypeLabel =
    isAssetItem
      ? "Activo"
      : normalizedProductType === "venta"
        ? "Venta"
        : normalizedProductType === "preparacion"
          ? "Preparación"
          : "Insumo";

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
      .select("id,name,site_type,operational_visibility")
      .eq("is_active", true)
      .eq("operational_visibility", "operational")
      .order("name"),
  ]);
  const role = String((emp as { role?: string } | null)?.role ?? "").toLowerCase();
  const canCreate =
    ["propietario", "gerente_general", "bodeguero"].includes(role) ||
    (await checkPermission(supabase, "nexo", "catalog.products"));

  const sitesList = (sitesData ?? []) as {
    id: string;
    name: string | null;
    site_type: string | null;
  }[];
  const siteIds = sitesList.map((site) => site.id);
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

  const capabilityRowsPromise = siteIds.length
    ? supabase
      .from("site_operational_capabilities")
      .select(
        "site_id,can_request_remissions,can_fulfill_remissions,can_receive_remissions,can_sell,can_produce,can_hold_inventory,is_commercial_business,show_in_product_setup"
      )
      .in("site_id", siteIds)
    : Promise.resolve({ data: [] as SiteOperationalCapabilities[] });
  const allCategoryRowsPromise = loadCategoryRows(supabase);
  const areaKindsWithPurposePromise = supabase
    .from("area_kinds")
    .select("code,name,use_for_remission")
    .order("name", { ascending: true });
  const siteAreasPromise = supabase
    .from("areas")
    .select("site_id,kind,is_active")
    .eq("is_active", true);
  const productionLocationsPromise = supabase
    .from("inventory_locations")
    .select("id,site_id,code,zone,location_type,is_active,area:areas(kind)")
    .eq("is_active", true)
    .order("code", { ascending: true });
  const productionAreaRulesPromise = supabase
    .from("site_area_purpose_rules")
    .select("site_id,area_kind,purpose,is_enabled")
    .eq("purpose", "production_recipe")
    .eq("is_enabled", true);
  const suppliersPromise = config.hasSuppliers
    ? supabase.from("suppliers").select("id,name").eq("is_active", true).order("name")
    : Promise.resolve({ data: [] as { id: string; name: string | null }[] });
  const unitsPromise = supabase
    .from("inventory_units")
    .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
    .eq("is_active", true)
    .order("family", { ascending: true })
    .order("factor_to_base", { ascending: true })
    .limit(500);

  const [
    { data: capabilityRows },
    allCategoryRows,
    { data: areaKindsWithPurpose, error: areaKindsWithPurposeError },
    { data: siteAreasData },
    { data: productionLocationsData },
    { data: productionAreaRulesData },
    { data: suppliersData },
    { data: unitsData },
  ] = await Promise.all([
    capabilityRowsPromise,
    allCategoryRowsPromise,
    areaKindsWithPurposePromise,
    siteAreasPromise,
    productionLocationsPromise,
    productionAreaRulesPromise,
    suppliersPromise,
    unitsPromise,
  ]);
  const capabilitiesBySite = getSiteCapabilitiesMap(
    siteIds,
    (capabilityRows ?? []) as SiteOperationalCapabilities[]
  );
  const capabilitySiteIds = new Set(
    ((capabilityRows ?? []) as SiteOperationalCapabilities[]).map((row) =>
      String(row.site_id ?? "")
    )
  );
  const categoryRows = filterCategoryRows(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: effectiveCategorySiteId,
  });
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
  const productionAreaKindsBySite = ((productionAreaRulesData ?? []) as Array<{ site_id: string | null; area_kind: string | null }>).reduce(
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
  const productionLocationsList = ((productionLocationsData ?? []) as Array<{
    id: string;
    site_id: string;
    code: string;
    zone: string | null;
    location_type: string | null;
    area?: { kind: string | null } | { kind: string | null }[] | null;
  }>).filter((location) => {
    const locationType = String(location.location_type ?? "").trim();
    const siteId = String(location.site_id ?? "").trim();
    const areaValue = Array.isArray(location.area) ? location.area[0] : location.area;
    const areaKind = String(areaValue?.kind ?? "").trim();
    return locationType === "production" || Boolean(siteId && areaKind && productionAreaKindsBySite[siteId]?.includes(areaKind));
  });
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
    .filter((site) => {
      const capabilities = capabilitiesBySite.get(site.id);
      return capabilitySiteIds.has(site.id)
        ? Boolean(capabilities?.can_request_remissions)
        : String(site.site_type ?? "").trim().toLowerCase() === "satellite";
    })
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

  const suppliersList = (suppliersData ?? []) as { id: string; name: string | null }[];
  const unitsList = (unitsData ?? []) as UnitRow[];

  const defaultStockUnitCode = unitsList[0]?.code ?? "un";
  const defaultUnitOptions = unitsList;

  if (!canCreate) {
    return (
      <div className="ui-scene w-full max-w-none space-y-6">
        <section className="ui-remission-hero ui-fade-up">
          <div className="space-y-2">
            <h1 className="ui-h1">{config.title}</h1>
            <p className="ui-body-muted">{config.subtitle}</p>
          </div>
        </section>
        <div className="ui-alert ui-alert--warn">
          No tienes permiso para crear productos.
        </div>
      </div>
    );
  }

  return (
    <div className="ui-scene w-full space-y-8">
      <NewProductHero
        catalogHref={catalogHref}
        catalogLabel={catalogLabel}
        configTitle={config.title}
        hasRecipe={hasRecipe}
        isAssetItem={isAssetItem}
        normalizedProductType={normalizedProductType}
        typeLabel={typeDisplayLabel(typeKey)}
      />

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}
      {createdMsg ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm">
          {createdMsg}
        </div>
      ) : null}

      <RequiredFieldsGuardForm
        action={createProduct}
        className="space-y-8 pb-48 md:pb-36"
        persistKey={`catalog-new-${typeKey}`}
      >
        <input type="hidden" name="_type_key" value={typeKey} />
        <input type="hidden" name="_mode" value="" />
        <CreateRequestKeyField initialValue={createRequestKey} />
        <input type="hidden" name="_after_create" value="create_another" />

        <CatalogSection
          title={isAssetItem ? "Identidad del modelo patrimonial" : "Datos básicos"}
          description={
            isAssetItem
              ? "Define cómo se identifica este modelo en el catálogo. Las unidades reales, QR, ubicación y conteo se gestionan en Activos físicos."
              : "Identidad inicial del item: nombre, SKU automático, tipo fijo, categoría operativa y descripción."
          }
        >
          <ProductIdentityFields
            nameLabel={isAssetItem ? "Nombre del modelo / activo" : "Nombre del producto / insumo"}
            namePlaceholder={
              isAssetItem
                ? "Ej. Aire acondicionado, silla terraza, licuadora industrial"
                : typeKey === "preparacion"
                  ? "Ej. Zumo de limón, jarabe base, salsa de la casa"
                  : typeKey === "venta"
                    ? "Ej. Espresso, croissant, cappuccino"
                    : "Ej. Harina 000"
            }
            categories={categoryRows}
            selectedCategoryId=""
            siteNamesById={siteNamesById}
            categoryLabel={isAssetItem ? "Categoría patrimonial" : "Categoría operativa"}
            categoryEmptyOptionLabel={isAssetItem ? "Selecciona categoría patrimonial" : "Selecciona categoría"}
            categoryRequired
            descriptionLabel={isAssetItem ? "Descripción base del modelo" : "Descripción"}
            descriptionPlaceholder={
              isAssetItem
                ? "Ej. Equipo de aire acondicionado tipo cassette para zona de atención, referencia general del modelo."
                : "Opcional"
            }
            descriptionHint={
              isAssetItem
                ? "Describe el modelo en términos generales. No escribas aquí serial, ubicación, responsable ni mantenimiento real."
                : undefined
            }
            skuField={{
              mode: "create",
              initialProductType: config.productType,
              initialInventoryKind: config.inventoryKind,
            }}
            lockedTypeField={{
              label: isAssetItem ? "Tipo de maestro" : "Tipo",
              value: createTypeLabel,
              hiddenName: "product_type",
              hiddenValue: config.productType,
              hint: isAssetItem
                ? "Este maestro sirve para crear activos físicos reales desde el catálogo."
                : "Se define por el flujo de creación y se mantiene bloqueado en edición.",
            }}
          />
        </CatalogSection>

        {/* Receta y producción ahora viven en FOGO */}
        {hasRecipe ? (
          <CatalogOptionalDetails
            title={normalizedProductType === "preparacion" ? "Continuidad en FOGO" : "Receta y producción"}
            summary={
              normalizedProductType === "preparacion"
                ? "FOGO completa receta, rendimiento, mermas, porciones y costo técnico de esta preparación."
                : "NEXO crea el maestro; FOGO completa la receta cuando el producto ya exista."
            }
          >
            <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)] space-y-2">
              {normalizedProductType === "preparacion" ? (
                <>
                  <p>
                    NEXO crea el maestro de inventario, sedes y unidad base. FOGO debe publicar la fórmula,
                    el rendimiento y la porción remisionable cuando la preparación esté lista para operar.
                  </p>
                  <p>
                    Mientras no exista porción publicada, NEXO no crea presentaciones operativas temporales.
                  </p>
                </>
              ) : (
                <p>
                  Este producto de venta nace como producto terminado con receta. Crea primero el maestro en NEXO y luego completa BOM, pasos y medios en FOGO.
                </p>
              )}
              <a
                href={buildFogoRecipeCreateUrl(typeKey)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex ui-btn ui-btn--ghost"
              >
                Abrir FOGO
              </a>
            </div>
          </CatalogOptionalDetails>
        ) : null}

        {isAssetItem ? (
          <CatalogSection
            title="Configuración mínima del modelo patrimonial"
            description="Los activos no usan compra/remisión/stock como insumos. Se guardan campos mínimos para mantener compatibilidad del catálogo."
          >
            <input type="hidden" name="stock_unit_code" value="un" />
            <input type="hidden" name="default_unit" value="un" />
            <input type="hidden" name="unit" value="un" />
            <input type="hidden" name="inventory_kind" value={lockedInventoryKind} />
            <input type="hidden" name="measurement_mode" value="fixed_presentation" />
            <input type="hidden" name="default_tolerance_percent" value="0" />
            <input type="hidden" name="aux_count_unit_code" value="" />
            <input type="hidden" name="track_inventory" value="" />
            <input type="hidden" name="lot_tracking" value="" />
            <input type="hidden" name="expiry_tracking" value="" />
            <input type="hidden" name="costing_mode" value="manual" />
            <input type="hidden" name="cost" value="" />
            <input type="hidden" name="price" value="" />

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Tipo de inventario</div>
                <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">Activo</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Unidad técnica</div>
                <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">un</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Stock operativo</div>
                <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">No aplica aquí</div>
              </div>
            </div>

            <div className="ui-alert ui-alert--warn mt-4">
              La existencia real, ubicación, QR, responsable, mantenimientos y conteos se manejan en Activos físicos.
            </div>
          </CatalogSection>
        ) : (
          <CatalogSection
            title="Unidad base e inventario"
            description="Configura la unidad técnica de stock, trazabilidad y costo. Las presentaciones físicas se administran aparte después de crear el maestro."
          >
            <ProductStorageFields
              stockUnitFieldId={STOCK_UNIT_FIELD_ID}
              units={defaultUnitOptions}
              stockUnitCode={defaultStockUnitCode}
              defaultUnitCode={defaultStockUnitCode}
              defaultUnitHint="Si no coincide con la familia de la unidad base, se guardará automáticamente la unidad base."
              measurementModeField={{
                defaultValue: "fixed_presentation",
                defaultTolerancePercent: null,
                disabled: false,
              }}
              preCostingFields={
                <>
                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Tipo de inventario</span>
                    <input type="hidden" name="inventory_kind" value={lockedInventoryKind} />
                    <div className="ui-input flex items-center">{lockedInventoryKindText}</div>
                    <span className="text-xs text-[var(--ui-muted)]">
                      Se define por el flujo de creación y se mantiene bloqueado en edición.
                    </span>
                  </label>

                  <input type="hidden" name="aux_count_unit_code" value="" />

                  {normalizedProductType === "venta" ? (
                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Precio base referencial</span>
                      <input
                        name="price"
                        type="number"
                        step="0.01"
                        className="ui-input"
                        placeholder="Opcional"
                      />
                      <span className="text-xs text-[var(--ui-muted)]">
                        El precio final se configura por sede/canal en la capa comercial.
                      </span>
                    </label>
                  ) : (
                    <input type="hidden" name="price" value="" />
                  )}
                </>
              }
              postCostingFields={
                <>
                  <input type="hidden" name="cost" value="" />
                  <ProductCostStatusPanel
                    hasSuppliers={hasSuppliers}
                    hasRecipe={hasRecipe}
                    hasComputedCost={false}
                    costingMode={hasSuppliers ? "auto_primary_supplier" : "manual"}
                    autoCostReady={!hasSuppliers}
                    autoCostReadinessReason={
                      hasSuppliers ? "proveedor primario, empaque, unidad y precio" : null
                    }
                    currentCost={null}
                  />
                </>
              }
              costingModeField={{
                hasSuppliers,
                defaultValue: hasSuppliers ? "auto_primary_supplier" : "manual",
                autoOptionLabel: "Auto proveedor primario",
              }}
              trackingOptions={{
                trackInventoryDefaultChecked: true,
                lotTrackingDefaultChecked: false,
                expiryTrackingDefaultChecked: false,
              }}
            />
            <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
              Las presentaciones físicas, equivalencias operativas y fotos por presentación se administran en la pantalla dedicada después de crear el producto.
            </div>
          </CatalogSection>
        )}


        {!isAssetItem ? (
          <ProductPurchaseSection
            enabled={hasSuppliers}
            initialRows={[]}
            suppliers={suppliersList.map((s) => ({ id: s.id, name: s.name }))}
            units={unitsList}
            stockUnitCode={defaultStockUnitCode}
            stockUnitFieldId={STOCK_UNIT_FIELD_ID}
          />
        ) : null}

        {isAssetItem ? (
          <ProductAssetTechnicalSection
            defaultTemplate="general"
            initialProfile={null}
            initialMaintenance={[]}
            initialTransfers={[]}
            siteOptions={sitesList.map((site) => ({ id: site.id, name: site.name ?? "Sede" }))}
          />
        ) : null}

        {!isAssetItem ? (
          <ProductSiteAvailabilitySection
            initialRows={[]}
            sites={sitesList.map((s) => ({ id: s.id, name: s.name, site_type: s.site_type }))}
            siteCapabilities={Array.from(capabilitiesBySite.values())}
            areaKinds={areaKindsList.map((a) => ({
              code: a.code,
              name: a.name ?? a.code,
              use_for_remission: Boolean(a.use_for_remission),
            }))}
            siteAreaKinds={siteAreaKindsList}
            productionLocations={productionLocationsList.map((location) => ({
              id: location.id,
              site_id: location.site_id,
              code: location.code,
              zone: location.zone,
            }))}
            remissionAreaKindsBySite={remissionAreaKindsBySite}
            stockUnitCode={defaultStockUnitCode}
            operationUnitHint={buildOperationUnitHintFromUnits({
              units: unitsList,
              inputUnitCode: defaultStockUnitCode,
              stockUnitCode: defaultStockUnitCode,
            })}
            productType={config.productType}
            inventoryKind={config.inventoryKind}
            hasRecipe={hasRecipe}
            defaultSalesEnabled={typeKey === "preparacion_vendible"}
          />
        ) : null}

        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 px-4 sm:bottom-6 sm:px-6">
          <div className="pointer-events-auto mx-auto flex max-w-6xl flex-col gap-3 rounded-2xl border border-[var(--ui-border)] bg-white/95 p-3 shadow-xl shadow-black/10 backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--ui-text)]">Carga en bloque</p>
              <p className="mt-1 text-xs text-[var(--ui-muted)]">
                La acción principal guarda este registro y deja listo el formulario para crear el siguiente.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:items-center lg:justify-end">
              <Link href={catalogHref} className="ui-btn ui-btn--ghost justify-center">
                Volver a {catalogLabel}
              </Link>
              <button
                type="submit"
                formAction={createProductAndView}
                className="ui-btn ui-btn--ghost justify-center"
              >
                Crear y ver ficha
              </button>
              <button
                type="submit"
                formAction={createProductAndReturnToCatalog}
                className="ui-btn ui-btn--ghost justify-center"
              >
                Crear y volver
              </button>
              <button
                type="submit"
                formAction={createProductAndCreateAnother}
                className="ui-btn ui-btn--brand justify-center"
              >
                {createSubmitLabel} y seguir
              </button>
            </div>
          </div>
        </div>
      </RequiredFieldsGuardForm>
    </div>
  );
}
