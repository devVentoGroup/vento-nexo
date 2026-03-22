import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { CatalogFiltersPanel } from "@/features/inventory/catalog/catalog-filters-panel";
import {
  CatalogResultsPanel,
  type CatalogResultRow,
  type PurchaseSuggestionRow,
} from "@/features/inventory/catalog/catalog-results-panel";
import { CatalogToolbar } from "@/features/inventory/catalog/catalog-toolbar";
import {
  CatalogHintPanel,
  CatalogOptionalDetails,
} from "@/features/inventory/catalog/catalog-ui";
import { requireAppAccess } from "@/lib/auth/guard";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { getCategoryDomainOptions } from "@/lib/constants";
import { getAutoCostReadinessReason, resolveNetSupplierPackPrice } from "@/lib/inventory/costing";
import { createClient } from "@/lib/supabase/server";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  categoryKindFromCatalogTab,
  collectDescendantIds,
  filterCategoryRows,
  filterCategoryRowsDirect,
  getCategoryDomainCodes,
  getCategoryPath,
  normalizeCategoryDomain,
  normalizeCategoryScope,
  shouldShowCategoryDomain,
  type InventoryCategoryRow,
} from "@/lib/inventory/categories";
import { convertQuantity, createUnitMap, normalizeUnitCode, type InventoryUnit } from "@/lib/inventory/uom";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

const TAB_OPTIONS = [
  { value: "insumos", label: "Insumos" },
  { value: "preparaciones", label: "Preparaciones" },
  { value: "productos", label: "Productos" },
  { value: "equipos", label: "Equipos y activos" },
] as const;

type TabValue = (typeof TAB_OPTIONS)[number]["value"];

type SearchParams = {
  q?: string;
  tab?: string;
  show_disabled?: string;
  site_id?: string;
  stock_alert?: string;
  view_mode?: string;
  supplier_id?: string;
  category_kind?: string;
  category_domain?: string;
  category_scope?: string;
  category_site_id?: string;
  category_id?: string;
  ok?: string;
  error?: string;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  cost: number | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_type: string;
  category_id: string | null;
  is_active: boolean | null;
  product_inventory_profiles?: {
    track_inventory: boolean;
    inventory_kind: string;
    costing_mode: "auto_primary_supplier" | "manual" | null;
  } | null;
};

type SiteRow = {
  id: string;
  name: string | null;
};

type ProductSupplierCostRow = {
  product_id: string;
  supplier_id: string | null;
  is_primary: boolean | null;
  purchase_pack_qty: number | null;
  purchase_pack_unit_code: string | null;
  purchase_unit: string | null;
  purchase_price: number | null;
  purchase_price_net: number | null;
  purchase_price_includes_tax: boolean | null;
  purchase_tax_rate: number | null;
};

type ProductSiteSettingRow = {
  product_id: string;
  is_active: boolean | null;
  min_stock_qty: number | null;
};

type StockBySiteRow = {
  product_id: string;
  current_qty: number | null;
};

type SupplierRow = {
  id: string;
  name: string | null;
};

type UnitRow = InventoryUnit;

async function loadCategoryRows(
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"]
): Promise<InventoryCategoryRow[]> {
  const query = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain,site_id,is_active,applies_to_kinds")
    .order("name", { ascending: true });

  if (!query.error) {
    return (query.data ?? []) as InventoryCategoryRow[];
  }

  const fallback = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain,site_id,is_active")
    .order("name", { ascending: true });

  return ((fallback.data ?? []) as Array<Omit<InventoryCategoryRow, "applies_to_kinds">>).map(
    (row) => ({ ...row, applies_to_kinds: [] })
  );
}

function tabTypeValue(tab: TabValue): string {
  if (tab === "preparaciones") return "preparacion";
  if (tab === "productos") return "venta";
  return "insumo";
}

function asFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(value);
}

function siteSettingRank(row: ProductSiteSettingRow): number {
  const activeScore = row.is_active === false ? 0 : 2;
  const minScore = row.min_stock_qty == null ? 0 : 1;
  return activeScore + minScore;
}

function getLastCategorySegment(path: string): string {
  const normalized = String(path ?? "").trim();
  if (!normalized) return "-";
  const segments = normalized.split("/").map((segment) => segment.trim()).filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function toBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64url");
}

function sanitizeCatalogListReturnPath(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("/inventory/catalog") ? trimmed : "/inventory/catalog";
}

function buildCatalogListReturnUrl(
  basePath: string,
  status: { ok?: string; error?: string }
): string {
  const [pathname, qs] = basePath.split("?");
  const params = new URLSearchParams(qs ?? "");
  if (status.ok) params.set("ok", status.ok);
  if (status.error) params.set("error", status.error);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

async function requireCatalogManager() {
  const supabase = await createClient();
  const { data: authRes } = await supabase.auth.getUser();
  const user = authRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/catalog"));
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = String(employee?.role ?? "").toLowerCase();
  if (!["propietario", "gerente_general"].includes(role)) {
    redirect(
      buildCatalogListReturnUrl("/inventory/catalog", {
        error: "No tienes permisos para editar productos.",
      })
    );
  }

  return { supabase };
}

async function toggleProductActiveFromListAction(formData: FormData) {
  "use server";

  const { supabase } = await requireCatalogManager();
  const productId = String(formData.get("product_id") ?? "").trim();
  const nextIsActive = String(formData.get("next_is_active") ?? "") === "1";
  const returnTo = sanitizeCatalogListReturnPath(String(formData.get("return_to") ?? ""));

  if (!productId) {
    redirect(buildCatalogListReturnUrl(returnTo, { error: "Producto invalido." }));
  }

  const { error } = await supabase
    .from("products")
    .update({
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (error) {
    redirect(buildCatalogListReturnUrl(returnTo, { error: error.message }));
  }

  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/stock");
  redirect(buildCatalogListReturnUrl(returnTo, { ok: "product_status_updated" }));
}

async function deleteProductFromListAction(formData: FormData) {
  "use server";

  const { supabase } = await requireCatalogManager();
  const productId = String(formData.get("product_id") ?? "").trim();
  const returnTo = sanitizeCatalogListReturnPath(String(formData.get("return_to") ?? ""));

  if (!productId) {
    redirect(buildCatalogListReturnUrl(returnTo, { error: "Producto invalido." }));
  }

  const { count: ingredientUsageCount } = await supabase
    .from("recipes")
    .select("id", { head: true, count: "exact" })
    .eq("ingredient_product_id", productId);
  if ((ingredientUsageCount ?? 0) > 0) {
    redirect(
      buildCatalogListReturnUrl(returnTo, {
        error: "No se puede eliminar: este producto se usa como ingrediente en recetas.",
      })
    );
  }

  const { count: movementCount } = await supabase
    .from("inventory_movements")
    .select("id", { head: true, count: "exact" })
    .eq("product_id", productId);
  if ((movementCount ?? 0) > 0) {
    redirect(
      buildCatalogListReturnUrl(returnTo, {
        error: "No se puede eliminar: el producto tiene historial de movimientos. Deshabilitalo.",
      })
    );
  }

  const { count: stockCount } = await supabase
    .from("inventory_stock_by_site")
    .select("product_id", { head: true, count: "exact" })
    .eq("product_id", productId)
    .gt("current_qty", 0);
  if ((stockCount ?? 0) > 0) {
    redirect(
      buildCatalogListReturnUrl(returnTo, {
        error: "No se puede eliminar: el producto tiene stock disponible. Dejalo en 0 o deshabilitalo.",
      })
    );
  }

  const { data: recipeCards } = await supabase
    .from("recipe_cards")
    .select("id")
    .eq("product_id", productId);
  const recipeCardIds = (recipeCards ?? []).map((row) => row.id as string);
  if (recipeCardIds.length > 0) {
    const { error: stepsDeleteError } = await supabase
      .from("recipe_steps")
      .delete()
      .in("recipe_card_id", recipeCardIds);
    if (stepsDeleteError) {
      redirect(buildCatalogListReturnUrl(returnTo, { error: stepsDeleteError.message }));
    }
  }

  const cleanupStatements = [
    supabase.from("recipe_cards").delete().eq("product_id", productId),
    supabase.from("recipes").delete().eq("product_id", productId),
    supabase.from("product_suppliers").delete().eq("product_id", productId),
    supabase.from("product_site_settings").delete().eq("product_id", productId),
    supabase.from("product_inventory_profiles").delete().eq("product_id", productId),
  ];
  for (const statement of cleanupStatements) {
    const { error } = await statement;
    if (error) {
      redirect(buildCatalogListReturnUrl(returnTo, { error: error.message }));
    }
  }

  const { error: deleteError } = await supabase.from("products").delete().eq("id", productId);
  if (deleteError) {
    redirect(buildCatalogListReturnUrl(returnTo, { error: deleteError.message }));
  }

  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/stock");
  redirect(buildCatalogListReturnUrl(returnTo, { ok: "product_deleted" }));
}

export default async function InventoryCatalogPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok
    ? sp.ok === "product_deleted"
      ? "Producto eliminado."
      : sp.ok === "product_status_updated"
        ? "Estado del producto actualizado."
        : "Cambios guardados."
    : "";
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const searchQuery = String(sp.q ?? "").trim();
  const showDisabled = String(sp.show_disabled ?? "").trim() === "1";
  const stockAlert = String(sp.stock_alert ?? "all").trim().toLowerCase() === "low" ? "low" : "all";
  const viewMode = String(sp.view_mode ?? "catalogo").trim().toLowerCase() === "compras" ? "compras" : "catalogo";
  const selectedSupplierId = String(sp.supplier_id ?? "").trim();

  const tabRaw = String(sp.tab ?? "insumos").trim().toLowerCase();
  const activeTab: TabValue = TAB_OPTIONS.some((t) => t.value === tabRaw)
    ? (tabRaw as TabValue)
    : "insumos";

  const categoryKind = categoryKindFromCatalogTab(activeTab);
  const requestedCategoryId = String(sp.category_id ?? "").trim();

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/catalog",
    permissionCode: PERMISSION,
  });

  const [{ data: employee }, { data: settings }, { data: sites }, { data: suppliersFilterData }] = await Promise.all([
    supabase.from("employees").select("site_id,role").eq("id", user.id).maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", user.id)
      .maybeSingle(),
    supabase.from("sites").select("id,name").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("suppliers").select("id,name").eq("is_active", true).order("name", { ascending: true }),
  ]);

  const siteRows = (sites ?? []) as SiteRow[];
  const suppliersFilterRows = (suppliersFilterData ?? []) as SupplierRow[];
  const effectiveSupplierId = suppliersFilterRows.some((row) => row.id === selectedSupplierId)
    ? selectedSupplierId
    : "";
  const siteNamesById = Object.fromEntries(siteRows.map((row) => [row.id, row.name ?? row.id]));
  const canManageProducts = ["propietario", "gerente_general"].includes(
    String((employee as { role?: string | null } | null)?.role ?? "").toLowerCase()
  );

  const siteId = String(
    sp.site_id ??
      (settings as { selected_site_id?: string | null } | null)?.selected_site_id ??
      (employee as { site_id?: string | null } | null)?.site_id ??
      ""
  ).trim();
  const requestedCategorySiteId = String(sp.category_site_id ?? siteId).trim();
  const defaultScope = requestedCategorySiteId ? "site" : "all";
  const categoryScope = normalizeCategoryScope(sp.category_scope ?? defaultScope);
  const activeSiteId = categoryScope === "site" ? requestedCategorySiteId : "";

  const categoryDomain = shouldShowCategoryDomain(categoryKind)
    ? normalizeCategoryDomain(sp.category_domain)
    : "";

  const allCategoryRows = await loadCategoryRows(supabase);

  const categoryRows = filterCategoryRows(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: activeSiteId,
  });

  const directCategoryRows = filterCategoryRowsDirect(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: activeSiteId,
  });

  const directCategoryIds = new Set(directCategoryRows.map((row) => row.id));
  const categoryMap = new Map(allCategoryRows.map((row) => [row.id, row]));
  const effectiveCategoryId =
    requestedCategoryId && categoryRows.some((row) => row.id === requestedCategoryId)
      ? requestedCategoryId
      : "";

  let effectiveCategoryIds: string[] | null = null;
  if (effectiveCategoryId) {
    const descendantIds = Array.from(collectDescendantIds(categoryMap, effectiveCategoryId));
    effectiveCategoryIds = descendantIds.filter((id) => directCategoryIds.has(id));
  } else if (directCategoryRows.length > 0) {
    effectiveCategoryIds = directCategoryRows.map((row) => row.id);
  }

  const categoryDomainOptions = getCategoryDomainOptions(
    getCategoryDomainCodes(allCategoryRows, categoryKind)
  );
  const hasAdvancedFilters =
    showDisabled ||
    categoryScope !== "all" ||
    stockAlert !== "all" ||
    viewMode !== "catalogo" ||
    Boolean(effectiveSupplierId) ||
    Boolean(activeSiteId) ||
    Boolean(effectiveCategoryId) ||
    (shouldShowCategoryDomain(categoryKind) && Boolean(categoryDomain));

  let supplierProductIds: string[] | null = null;
  if (effectiveSupplierId) {
    const { data: supplierProductLinks } = await supabase
      .from("product_suppliers")
      .select("product_id")
      .eq("supplier_id", effectiveSupplierId);
    supplierProductIds = Array.from(
      new Set(
        ((supplierProductLinks ?? []) as Array<{ product_id: string | null }>)
          .map((row) => row.product_id)
          .filter((value): value is string => Boolean(value))
      )
    );
  }

  let productRows: ProductRow[] = [];
  if (
    (effectiveCategoryIds !== null && effectiveCategoryIds.length === 0) ||
    (supplierProductIds !== null && supplierProductIds.length === 0)
  ) {
    productRows = [];
  } else {
    let productsQuery = supabase
      .from("products")
      .select(
        "id,name,sku,cost,unit,stock_unit_code,product_type,category_id,is_active,product_inventory_profiles(track_inventory,inventory_kind,costing_mode)"
      )
      .order("name", { ascending: true })
      .limit(1200);

    if (searchQuery) {
      const pattern = `%${searchQuery}%`;
      productsQuery = productsQuery.or(`name.ilike.${pattern},sku.ilike.${pattern}`);
    }

    if (effectiveCategoryIds && effectiveCategoryIds.length > 0) {
      productsQuery = productsQuery.in("category_id", effectiveCategoryIds);
    }

    if (supplierProductIds && supplierProductIds.length > 0) {
      productsQuery = productsQuery.in("id", supplierProductIds);
    }

    if (activeTab === "equipos") {
      productsQuery = productsQuery
        .eq("product_type", "insumo")
        .eq("product_inventory_profiles.inventory_kind", "asset");
    } else {
      productsQuery = productsQuery.eq("product_type", tabTypeValue(activeTab));
    }

    const { data: products } = await productsQuery;
    productRows = (products ?? []) as unknown as ProductRow[];

    if (!showDisabled) {
      productRows = productRows.filter((product) => product.is_active !== false);
    }

    if (activeTab === "insumos") {
      productRows = productRows.filter(
        (product) => product.product_inventory_profiles?.inventory_kind !== "asset"
      );
    }
  }

  const productIds = productRows.map((product) => product.id);
  const [{ data: unitsData }, { data: supplierCostData }, siteSettingsRes, { data: stockBySiteData }] = await Promise.all([
    supabase
      .from("inventory_units")
      .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
      .eq("is_active", true)
      .limit(500),
    productIds.length
      ? supabase
          .from("product_suppliers")
          .select(
            "product_id,supplier_id,is_primary,purchase_pack_qty,purchase_pack_unit_code,purchase_unit,purchase_price,purchase_price_net,purchase_price_includes_tax,purchase_tax_rate"
          )
          .in("product_id", productIds)
      : Promise.resolve({ data: [] as ProductSupplierCostRow[] }),
    siteId && productIds.length
      ? supabase
          .from("product_site_settings")
          .select("product_id,is_active,min_stock_qty")
          .eq("site_id", siteId)
          .in("product_id", productIds)
      : Promise.resolve({ data: [] as ProductSiteSettingRow[], error: null }),
    siteId && productIds.length
      ? supabase
          .from("inventory_stock_by_site")
          .select("product_id,current_qty")
          .eq("site_id", siteId)
          .in("product_id", productIds)
      : Promise.resolve({ data: [] as StockBySiteRow[] }),
  ]);
  const unitMap = createUnitMap((unitsData ?? []) as UnitRow[]);
  let siteSettingsData = (siteSettingsRes.data ?? []) as ProductSiteSettingRow[];
  if (siteSettingsRes.error && siteId && productIds.length) {
    const fallbackSiteSettingsRes = await supabase
      .from("product_site_settings")
      .select("product_id,is_active")
      .eq("site_id", siteId)
      .in("product_id", productIds);
    siteSettingsData = ((fallbackSiteSettingsRes.data ?? []) as Array<{
      product_id: string;
      is_active: boolean | null;
    }>).map((row) => ({
      product_id: row.product_id,
      is_active: row.is_active,
      min_stock_qty: null,
    }));
  }
  const primarySupplierByProduct = new Map<string, ProductSupplierCostRow>();
  for (const row of (supplierCostData ?? []) as ProductSupplierCostRow[]) {
    if (!row.product_id || !row.is_primary || primarySupplierByProduct.has(row.product_id)) continue;
    primarySupplierByProduct.set(row.product_id, row);
  }
  const autoCostReasonByProduct = new Map<string, string | null>();
  for (const product of productRows) {
    const profile = product.product_inventory_profiles;
    const normalizedType = String(product.product_type ?? "").trim().toLowerCase();
    const normalizedInventoryKind = String(profile?.inventory_kind ?? "").trim().toLowerCase();
    const hasSuppliers =
      (normalizedType === "insumo" && normalizedInventoryKind !== "asset") ||
      (normalizedType === "venta" && normalizedInventoryKind === "resale");
    const reason = hasSuppliers
      ? getAutoCostReadinessReason({
          costingMode: profile?.costing_mode ?? "manual",
          stockUnitCode: normalizeUnitCode(product.stock_unit_code || product.unit || ""),
          primarySupplier: primarySupplierByProduct.get(product.id) ?? null,
          unitMap,
        })
      : null;
    autoCostReasonByProduct.set(product.id, reason);
  }

  const siteSettingsByProduct = new Map<string, ProductSiteSettingRow>();
  for (const row of (siteSettingsData ?? []) as ProductSiteSettingRow[]) {
    if (!row.product_id) continue;
    const current = siteSettingsByProduct.get(row.product_id);
    if (!current || siteSettingRank(row) >= siteSettingRank(current)) {
      siteSettingsByProduct.set(row.product_id, row);
    }
  }

  const stockByProduct = new Map<string, StockBySiteRow>();
  for (const row of (stockBySiteData ?? []) as StockBySiteRow[]) {
    if (!row.product_id || stockByProduct.has(row.product_id)) continue;
    stockByProduct.set(row.product_id, row);
  }

  const stockMetricsByProduct = new Map<
    string,
    {
      currentQty: number;
      minStock: number | null;
      missingQty: number | null;
      isLow: boolean;
      hasSiteConfig: boolean;
      siteActive: boolean;
    }
  >();
  for (const product of productRows) {
    const stockRow = stockByProduct.get(product.id);
    const siteSetting = siteSettingsByProduct.get(product.id);
    const currentQty = asFiniteNumber(stockRow?.current_qty) ?? 0;
    const hasSiteConfig = Boolean(siteSetting);
    const siteActive = siteSetting?.is_active !== false;
    const minStock = siteActive ? asFiniteNumber(siteSetting?.min_stock_qty) : null;
    const missingQty = minStock == null ? null : Math.max(minStock - currentQty, 0);
    stockMetricsByProduct.set(product.id, {
      currentQty,
      minStock,
      missingQty,
      isLow: minStock != null && currentQty < minStock,
      hasSiteConfig,
      siteActive,
    });
  }

  const visibleProducts =
    stockAlert === "low"
      ? productRows.filter((product) => stockMetricsByProduct.get(product.id)?.isLow)
      : productRows;
  const lowStockCount = productRows.filter(
    (product) => stockMetricsByProduct.get(product.id)?.isLow
  ).length;

  const primarySupplierIds = Array.from(
    new Set(
      productRows
        .map((product) => primarySupplierByProduct.get(product.id)?.supplier_id ?? "")
        .filter(Boolean)
    )
  );
  const { data: suppliersData } = primarySupplierIds.length
    ? await supabase.from("suppliers").select("id,name").in("id", primarySupplierIds)
    : { data: [] as SupplierRow[] };
  const supplierNameById = new Map(
    ((suppliersData ?? []) as SupplierRow[]).map((row) => [row.id, row.name ?? row.id])
  );

  const lowStockPurchaseGroups = new Map<
    string,
    {
      supplierId: string;
      supplierName: string;
      items: Array<{ productName: string; missingQtyBase: number; suggestedPurchaseQty: number; purchaseUnit: string }>;
      prefillLines: Array<{ product_id: string; quantity: number; unit_cost: number; unit: string | null }>;
    }
  >();

  for (const product of productRows) {
    const stockMetrics = stockMetricsByProduct.get(product.id);
    const supplier = primarySupplierByProduct.get(product.id);
    if (!stockMetrics?.isLow || !supplier?.supplier_id || !stockMetrics.missingQty || stockMetrics.missingQty <= 0) {
      continue;
    }

    const stockUnitCode = normalizeUnitCode(product.stock_unit_code || product.unit || "");
    const purchasePackUnitCode = normalizeUnitCode(supplier.purchase_pack_unit_code || stockUnitCode);
    const purchasePackQty = asFiniteNumber(supplier.purchase_pack_qty);
    let qtyInStockPerPurchaseUnit = 1;
    if (
      purchasePackQty != null &&
      purchasePackQty > 0 &&
      purchasePackUnitCode &&
      stockUnitCode &&
      purchasePackUnitCode !== stockUnitCode
    ) {
      try {
        const converted = convertQuantity({
          quantity: purchasePackQty,
          fromUnitCode: purchasePackUnitCode,
          toUnitCode: stockUnitCode,
          unitMap,
        });
        if (converted.quantity > 0) qtyInStockPerPurchaseUnit = converted.quantity;
      } catch {
        qtyInStockPerPurchaseUnit = purchasePackQty;
      }
    } else if (purchasePackQty != null && purchasePackQty > 0) {
      qtyInStockPerPurchaseUnit = purchasePackQty;
    }

    const suggestedPurchaseQtyRaw = stockMetrics.missingQty / qtyInStockPerPurchaseUnit;
    const suggestedPurchaseQty = Math.max(0.001, Math.round(suggestedPurchaseQtyRaw * 1000) / 1000);
    const unitCost =
      resolveNetSupplierPackPrice({
        purchasePrice: supplier.purchase_price,
        purchasePriceNet: supplier.purchase_price_net,
        purchasePriceIncludesTax: supplier.purchase_price_includes_tax,
        purchaseTaxRate: supplier.purchase_tax_rate,
      }) ?? 0;

    const currentGroup = lowStockPurchaseGroups.get(supplier.supplier_id) ?? {
      supplierId: supplier.supplier_id,
      supplierName: supplierNameById.get(supplier.supplier_id) ?? supplier.supplier_id,
      items: [],
      prefillLines: [],
    };
    currentGroup.items.push({
      productName: product.name,
      missingQtyBase: stockMetrics.missingQty,
      suggestedPurchaseQty,
      purchaseUnit: purchasePackUnitCode || supplier.purchase_unit || "un",
    });
    currentGroup.prefillLines.push({
      product_id: product.id,
      quantity: suggestedPurchaseQty,
      unit_cost: unitCost,
      unit: purchasePackUnitCode || null,
    });
    lowStockPurchaseGroups.set(supplier.supplier_id, currentGroup);
  }

  const lowStockPurchaseGroupRows = Array.from(lowStockPurchaseGroups.values())
    .map((group) => {
      const prefill = toBase64UrlJson({
        supplier_id: group.supplierId,
        site_id: siteId || "",
        notes: "Borrador generado desde Nexo por productos bajo stock minimo.",
        lines: group.prefillLines.slice(0, 30),
      });
      return {
        ...group,
        href: `https://origo.ventogroup.co/purchase-orders/new?prefill=${encodeURIComponent(prefill)}`,
      };
    })
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName, "es"));

  const purchaseSuggestionRows: PurchaseSuggestionRow[] = lowStockPurchaseGroupRows.map((group) => ({
    supplierId: group.supplierId,
    supplierName: group.supplierName,
    itemsCount: group.items.length,
    href: group.href,
  }));

  const buildUrl = (newTab?: TabValue) => {
    const tab = newTab ?? activeTab;
    const tabKind = categoryKindFromCatalogTab(tab);
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    params.set("tab", tab);
    if (showDisabled) params.set("show_disabled", "1");
    if (siteId) params.set("site_id", siteId);
    if (stockAlert === "low") params.set("stock_alert", "low");
    if (viewMode === "compras") params.set("view_mode", "compras");
    if (effectiveSupplierId) params.set("supplier_id", effectiveSupplierId);
    params.set("category_kind", tabKind);
    params.set("category_scope", categoryScope);
    if (categoryScope === "site" && activeSiteId) params.set("category_site_id", activeSiteId);
    if (effectiveCategoryId) params.set("category_id", effectiveCategoryId);
    if (shouldShowCategoryDomain(tabKind) && categoryDomain) {
      params.set("category_domain", categoryDomain);
    }
    return `/inventory/catalog?${params.toString()}`;
  };

  const catalogReturnUrl = buildUrl();
  const clearHref = `/inventory/catalog?tab=${activeTab}${siteId ? `&site_id=${encodeURIComponent(siteId)}` : ""}&category_kind=${categoryKind}`;
  const activeTabLabel = TAB_OPTIONS.find((tab) => tab.value === activeTab)?.label ?? "Productos";
  const activeSiteLabel = siteNamesById[siteId] ?? siteId;
  const tabLinks = TAB_OPTIONS.map((tab) => ({
    value: tab.value,
    label: tab.label,
    href: buildUrl(tab.value),
    active: activeTab === tab.value,
  }));
  const toolbarActions = activeTab === "productos"
    ? [
        { href: "/inventory/catalog/new?type=venta", label: "+ Producto de venta", tone: "brand" as const },
        { href: "/inventory/catalog/new?type=reventa", label: "+ Producto de reventa", tone: "ghost" as const },
      ]
    : [
        {
          href: `/inventory/catalog/new?type=${
            activeTab === "insumos"
              ? "insumo"
              : activeTab === "preparaciones"
                ? "preparacion"
                : "asset"
          }`,
          label: `+ Crear ${
            activeTab === "insumos"
              ? "insumo"
              : activeTab === "preparaciones"
                ? "preparacion"
                : "equipo"
          }`,
          tone: "brand" as const,
        },
        ...(activeTab === "insumos"
          ? [{ href: "/api/inventory/catalog/export-suppliers", label: "Descargar Excel de insumos", tone: "ghost" as const }]
          : []),
        ...(activeTab === "insumos"
          ? [{ href: "/inventory/ai-ingestions?flow=catalog_create", label: "Alta asistida IA", tone: "ghost" as const }]
          : []),
      ];

  const catalogResultRows: CatalogResultRow[] = visibleProducts.map((product) => {
    const inventoryProfile = product.product_inventory_profiles;
    const inventoryLabel = inventoryProfile?.inventory_kind ?? "unclassified";
    const autoCostMode = inventoryProfile?.costing_mode ?? "auto_primary_supplier";
    const autoCostReason = autoCostReasonByProduct.get(product.id) ?? "";
    const normalizedType = String(product.product_type ?? "").trim().toLowerCase();
    const normalizedInventoryKind = String(inventoryProfile?.inventory_kind ?? "").trim().toLowerCase();
    const usesRecipeAutoCost =
      normalizedType === "preparacion" ||
      (normalizedType === "venta" && normalizedInventoryKind !== "resale");
    const hasComputedCost = product.cost != null && Number.isFinite(Number(product.cost));
    const primarySupplier = primarySupplierByProduct.get(product.id);
    const primarySupplierName = primarySupplier?.supplier_id
      ? supplierNameById.get(primarySupplier.supplier_id) ?? primarySupplier.supplier_id
      : "Sin proveedor";
    const stockMetrics = stockMetricsByProduct.get(product.id) ?? {
      currentQty: 0,
      minStock: null,
      missingQty: null,
      isLow: false,
      hasSiteConfig: false,
      siteActive: true,
    };
    const categoryPath = getCategoryPath(product.category_id, categoryMap);
    const categoryLabel = getLastCategorySegment(categoryPath);
    const rowPrefill =
      siteId && primarySupplier?.supplier_id && stockMetrics.missingQty && stockMetrics.missingQty > 0
        ? toBase64UrlJson({
            supplier_id: primarySupplier.supplier_id,
            site_id: siteId,
            notes: "Borrador generado desde Nexo por bajo stock minimo.",
            lines: [
              {
                product_id: product.id,
                quantity: Math.max(0.001, Math.round(stockMetrics.missingQty * 1000) / 1000),
                unit_cost: asFiniteNumber(primarySupplier.purchase_price) ?? 0,
                unit: normalizeUnitCode(
                  primarySupplier.purchase_pack_unit_code || product.stock_unit_code || product.unit || "un"
                ) || null,
              },
            ],
          })
        : "";
    const rowOrigoHref = rowPrefill
      ? `https://origo.ventogroup.co/purchase-orders/new?prefill=${encodeURIComponent(rowPrefill)}`
      : "";

    let autoCostLabel = "Listo";
    let autoCostTone: CatalogResultRow["autoCostTone"] = "success";
    let autoCostDetail = "";

    if (usesRecipeAutoCost) {
      if (hasComputedCost) {
        autoCostLabel = "Listo (externo)";
        autoCostTone = "success";
      } else {
        autoCostLabel = "Pendiente (externo)";
        autoCostTone = "warn";
      }
    } else if (autoCostMode === "manual") {
      autoCostLabel = "Manual";
      autoCostTone = "default";
    } else if (autoCostReason) {
      autoCostLabel = "Incompleto";
      autoCostTone = "warn";
      autoCostDetail = autoCostReason;
    }

    let shortageLabel = "OK";
    let shortageTone: CatalogResultRow["shortageTone"] = "success";
    if (stockMetrics.missingQty != null && stockMetrics.missingQty > 0) {
      shortageLabel = formatQty(stockMetrics.missingQty);
      shortageTone = "warn";
    } else if (!stockMetrics.hasSiteConfig) {
      shortageLabel = "Sin config sede";
      shortageTone = "muted";
    } else if (!stockMetrics.siteActive) {
      shortageLabel = "Sede inactiva";
      shortageTone = "muted";
    } else if (stockMetrics.minStock == null) {
      shortageLabel = "Sin minimo";
      shortageTone = "muted";
    }

    return {
      id: product.id,
      name: product.name ?? "-",
      sku: product.sku ?? "-",
      categoryPath,
      categoryLabel,
      inventoryLabel,
      unitLabel: product.unit ?? "-",
      currentQtyLabel: formatQty(stockMetrics.currentQty),
      currentQtyIsLow: stockMetrics.isLow,
      minStockLabel: formatQty(stockMetrics.minStock),
      shortageLabel,
      shortageTone,
      autoCostLabel,
      autoCostTone,
      autoCostDetail,
      statusLabel: product.is_active === false ? "Inactivo" : "Activo",
      primarySupplierName,
      fichaHref: `/inventory/catalog/${product.id}/ficha?from=${encodeURIComponent(catalogReturnUrl)}`,
      nextIsActive: product.is_active === false,
      toggleLabel: product.is_active === false ? "Habilitar" : "Deshabilitar",
      origoHref: rowOrigoHref,
    };
  });

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link href="/inventory/stock" className="ui-caption underline">Volver a stock</Link>
              <h1 className="ui-h1">Catalogo maestro</h1>
              <p className="ui-body-muted">
                Productos maestros, salud operativa por sede y continuidad de compra sin mezclar logica comercial.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                {activeTabLabel}
              </span>
              {activeSiteLabel ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                  {activeSiteLabel}
                </span>
              ) : null}
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {visibleProducts.length} items
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/inventory/stock" className="ui-btn ui-btn--ghost">
                Ver stock
              </Link>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Items visibles</div>
              <div className="ui-remission-kpi-value">{visibleProducts.length}</div>
              <div className="ui-remission-kpi-note">Aplicando filtros y tab actual</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Stock bajo</div>
              <div className="ui-remission-kpi-value">{lowStockCount}</div>
              <div className="ui-remission-kpi-note">Alertas dentro de la vista actual</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Modo</div>
              <div className="ui-remission-kpi-value">Maestro</div>
              <div className="ui-remission-kpi-note">Base operativa para stock, sedes y abastecimiento</div>
            </article>
          </div>
        </div>
      </section>

      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}
      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      <CatalogOptionalDetails
        title="Criterio de esta vista"
        summary="Abre este bloque solo si necesitas revisar el marco operativo o refinar la vista."
      >
        <CatalogHintPanel title="Norte de esta vista">
          <p>
            Esta pantalla gobierna el <strong className="text-[var(--ui-text)]">producto maestro</strong> y su salud
            operativa. La categoria aqui es operativa, no comercial.
          </p>
          <p>
            La vista de compras se integra con ORIGO para emitir ordenes sugeridas por proveedor.
          </p>
        </CatalogHintPanel>
      </CatalogOptionalDetails>

      <CatalogToolbar tabs={tabLinks} actions={toolbarActions} />

      <CatalogOptionalDetails
        title="Refinar vista"
        summary="Busqueda y tab ya cubren lo principal. Abre esto solo si necesitas filtros adicionales."
        badge={hasAdvancedFilters ? "Activos" : "Opcional"}
        defaultOpen={hasAdvancedFilters}
      >
        <CatalogFiltersPanel
          activeTab={activeTab}
          siteId={siteId}
          categoryKind={categoryKind}
          searchQuery={searchQuery}
          showDisabled={showDisabled}
          clearHref={clearHref}
          hasAdvancedFilters={hasAdvancedFilters}
          categoryScope={categoryScope}
          stockAlert={stockAlert}
          viewMode={viewMode}
          effectiveSupplierId={effectiveSupplierId}
          suppliers={suppliersFilterRows}
          categorySiteId={activeSiteId}
          sites={siteRows}
          showCategoryDomain={shouldShowCategoryDomain(categoryKind)}
          categoryDomain={categoryDomain}
          categoryDomainOptions={categoryDomainOptions}
          categoryRows={categoryRows}
          effectiveCategoryId={effectiveCategoryId}
          siteNamesById={siteNamesById}
        />
      </CatalogOptionalDetails>

      <CatalogResultsPanel
        activeTab={activeTab}
        activeTabLabel={activeTabLabel}
        siteLabel={activeSiteLabel}
        lowStockCount={lowStockCount}
        itemCount={visibleProducts.length}
        siteId={siteId}
        viewMode={viewMode}
        purchaseSuggestions={purchaseSuggestionRows}
        rows={catalogResultRows}
        canManageProducts={canManageProducts}
        catalogReturnUrl={catalogReturnUrl}
        searchQuery={searchQuery}
        categoryKind={categoryKind}
        stockAlert={stockAlert}
        categoryScope={categoryScope}
        categorySiteId={requestedCategorySiteId}
        categoryDomain={categoryDomain}
        effectiveCategoryId={effectiveCategoryId}
        effectiveSupplierId={effectiveSupplierId}
        showDisabled={showDisabled}
        onToggleProductActive={toggleProductActiveFromListAction}
        onDeleteProduct={deleteProductFromListAction}
      />
    </div>
  );
}

