import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { CategoryTreeFilter } from "@/components/inventory/CategoryTreeFilter";
import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { getCategoryDomainOptions } from "@/lib/constants";
import { getAutoCostReadinessReason } from "@/lib/inventory/costing";
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
  site_id?: string;
  stock_alert?: string;
  view_mode?: string;
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

const TABLE_ACTION_BUTTON_CLASS =
  "ui-btn ui-btn--ghost ui-btn--sm min-w-[104px] justify-center shrink-0";
const TABLE_DELETE_BUTTON_CLASS =
  "ui-btn ui-btn--ghost ui-btn--sm min-w-[104px] justify-center shrink-0 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700";

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
  const stockAlert = String(sp.stock_alert ?? "all").trim().toLowerCase() === "low" ? "low" : "all";
  const viewMode = String(sp.view_mode ?? "catalogo").trim().toLowerCase() === "compras" ? "compras" : "catalogo";

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

  const [{ data: employee }, { data: settings }, { data: sites }] = await Promise.all([
    supabase.from("employees").select("site_id,role").eq("id", user.id).maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", user.id)
      .maybeSingle(),
    supabase.from("sites").select("id,name").eq("is_active", true).order("name", { ascending: true }),
  ]);

  const siteRows = (sites ?? []) as SiteRow[];
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

  let productRows: ProductRow[] = [];
  if (effectiveCategoryIds !== null && effectiveCategoryIds.length === 0) {
    productRows = [];
  } else {
    let productsQuery = supabase
      .from("products")
      .select(
        "id,name,sku,unit,stock_unit_code,product_type,category_id,is_active,product_inventory_profiles(track_inventory,inventory_kind,costing_mode)"
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

    if (activeTab === "equipos") {
      productsQuery = productsQuery
        .eq("product_type", "insumo")
        .eq("product_inventory_profiles.inventory_kind", "asset");
    } else {
      productsQuery = productsQuery.eq("product_type", tabTypeValue(activeTab));
    }

    const { data: products } = await productsQuery;
    productRows = (products ?? []) as unknown as ProductRow[];

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
            "product_id,supplier_id,is_primary,purchase_pack_qty,purchase_pack_unit_code,purchase_unit,purchase_price"
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
    const reason = getAutoCostReadinessReason({
      costingMode: profile?.costing_mode ?? "manual",
      stockUnitCode: normalizeUnitCode(product.stock_unit_code || product.unit || ""),
      primarySupplier: primarySupplierByProduct.get(product.id) ?? null,
      unitMap,
    });
    autoCostReasonByProduct.set(product.id, reason);
  }

  const siteSettingsByProduct = new Map<string, ProductSiteSettingRow>();
  for (const row of (siteSettingsData ?? []) as ProductSiteSettingRow[]) {
    if (!row.product_id || siteSettingsByProduct.has(row.product_id)) continue;
    siteSettingsByProduct.set(row.product_id, row);
  }

  const stockByProduct = new Map<string, StockBySiteRow>();
  for (const row of (stockBySiteData ?? []) as StockBySiteRow[]) {
    if (!row.product_id || stockByProduct.has(row.product_id)) continue;
    stockByProduct.set(row.product_id, row);
  }

  const stockMetricsByProduct = new Map<
    string,
    { currentQty: number; minStock: number | null; missingQty: number | null; isLow: boolean }
  >();
  for (const product of productRows) {
    const stockRow = stockByProduct.get(product.id);
    const siteSetting = siteSettingsByProduct.get(product.id);
    const currentQty = asFiniteNumber(stockRow?.current_qty) ?? 0;
    const siteActive = siteSetting?.is_active !== false;
    const minStock = siteActive ? asFiniteNumber(siteSetting?.min_stock_qty) : null;
    const missingQty = minStock == null ? null : Math.max(minStock - currentQty, 0);
    stockMetricsByProduct.set(product.id, {
      currentQty,
      minStock,
      missingQty,
      isLow: minStock != null && currentQty < minStock,
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
    const unitCost = asFiniteNumber(supplier.purchase_price) ?? 0;

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

  const buildUrl = (newTab?: TabValue) => {
    const tab = newTab ?? activeTab;
    const tabKind = categoryKindFromCatalogTab(tab);
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    params.set("tab", tab);
    if (siteId) params.set("site_id", siteId);
    if (stockAlert === "low") params.set("stock_alert", "low");
    if (viewMode === "compras") params.set("view_mode", "compras");
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

  return (
    <div className="w-full">
      <PageHeader
        title="Catalogo"
        subtitle="Abre cualquier item para ver su ficha."
        actions={
          <Link href="/inventory/stock" className="ui-btn ui-btn--ghost">
            Ver stock
          </Link>
        }
      />

      {okMsg ? <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div> : null}
      {errorMsg ? <div className="mt-6 ui-alert ui-alert--error">Error: {errorMsg}</div> : null}

      <div className="mt-6 flex gap-1 overflow-x-auto ui-panel-soft p-1">
        {TAB_OPTIONS.map((tab) => (
          <Link
            key={tab.value}
            href={buildUrl(tab.value)}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? "bg-[var(--ui-surface)] text-[var(--ui-text)] shadow-sm"
                : "text-[var(--ui-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        {activeTab === "productos" ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/inventory/catalog/new?type=venta" className="ui-btn ui-btn--brand ui-btn--sm">
              + Producto con receta
            </Link>
            <Link href="/inventory/catalog/new?type=reventa" className="ui-btn ui-btn--ghost ui-btn--sm">
              + Producto de reventa
            </Link>
          </div>
        ) : (
          <Link
            href={`/inventory/catalog/new?type=${
              activeTab === "insumos"
                ? "insumo"
                : activeTab === "preparaciones"
                  ? "preparacion"
                  : "asset"
            }`}
            className="ui-btn ui-btn--brand ui-btn--sm"
          >
            + Crear{" "}
            {activeTab === "insumos"
              ? "insumo"
              : activeTab === "preparaciones"
                ? "preparacion"
                : "equipo"}
          </Link>
        )}
      </div>

      <div className="mt-4 ui-panel">
        <div className="ui-h3">Filtros</div>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="tab" value={activeTab} />
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="category_kind" value={categoryKind} />

          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
            <span className="ui-label">Buscar SKU o nombre</span>
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="SKU o nombre de producto"
              className="ui-input"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Alcance de categoria</span>
            <select name="category_scope" defaultValue={categoryScope} className="ui-input">
              <option value="all">Todas</option>
              <option value="global">Globales</option>
              <option value="site">Sede activa</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Alerta de stock (sede activa)</span>
            <select name="stock_alert" defaultValue={stockAlert} className="ui-input">
              <option value="all">Todos</option>
              <option value="low">Solo bajo minimo</option>
            </select>
            <span className="ui-caption">
              Usa el stock de la sede activa para compras del centro de produccion.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Vista</span>
            <select name="view_mode" defaultValue={viewMode} className="ui-input">
              <option value="catalogo">Catalogo</option>
              <option value="compras">Compras (ejecutiva)</option>
            </select>
          </label>

          {categoryScope === "site" ? (
            <label className="flex flex-col gap-1">
              <span className="ui-label">Sede para categorias</span>
              <select name="category_site_id" defaultValue={activeSiteId} className="ui-input">
                <option value="">Seleccionar sede</option>
                {siteRows.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.id}
                  </option>
                ))}
              </select>
              <span className="ui-caption">Solo aplica cuando el alcance es Sede activa.</span>
            </label>
          ) : (
            <input type="hidden" name="category_site_id" value="" />
          )}

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
          ) : (
            <input type="hidden" name="category_domain" value="" />
          )}

          <CategoryTreeFilter
            categories={categoryRows}
            selectedCategoryId={effectiveCategoryId}
            siteNamesById={siteNamesById}
            className="sm:col-span-2 lg:col-span-4"
            label="Categoria"
            emptyOptionLabel="Todas"
            maxVisibleOptions={10}
          />

          <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
            <button className="ui-btn ui-btn--brand">Aplicar filtros</button>
            <Link
              href={`/inventory/catalog?tab=${activeTab}${siteId ? `&site_id=${encodeURIComponent(siteId)}` : ""}&category_kind=${categoryKind}`}
              className="ui-btn ui-btn--ghost"
            >
              Limpiar
            </Link>
          </div>
        </form>
      </div>

      <div className="mt-6 ui-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="ui-h3">{TAB_OPTIONS.find((t) => t.value === activeTab)?.label ?? "Productos"}</div>
            <div className="mt-1 ui-body-muted">Mostrando hasta 1200 items.</div>
            {siteId ? (
              <div className="mt-1 text-xs text-[var(--ui-muted)]">
                Sede activa: {siteNamesById[siteId] ?? siteId}. Bajo minimo: {lowStockCount}.
              </div>
            ) : null}
          </div>
          <div className="ui-caption">Items: {visibleProducts.length}</div>
        </div>

        {siteId && lowStockPurchaseGroupRows.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
            <div className="text-sm font-semibold text-[var(--ui-text)]">
              Ordenes sugeridas por proveedor (bajo minimo)
            </div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">
              Se arma una OC por proveedor primario usando faltante de la sede activa.
            </div>
            <div className="mt-3 grid gap-2">
              {lowStockPurchaseGroupRows.map((group) => (
                <div
                  key={group.supplierId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--ui-text)]">{group.supplierName}</div>
                    <div className="text-xs text-[var(--ui-muted)]">
                      {group.items.length} producto(s) bajo minimo
                    </div>
                  </div>
                  <Link href={group.href} className="ui-btn ui-btn--brand ui-btn--sm">
                    Crear OC en Origo
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-[var(--ui-border)]">
          <table className="ui-table min-w-[1280px] text-sm">
            <thead className="text-left text-[var(--ui-muted)]">
              <tr>
                <th className="py-2 pr-4 whitespace-nowrap">Producto</th>
                {viewMode === "catalogo" ? (
                  <>
                    <th className="py-2 pr-4 whitespace-nowrap">SKU</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Categoria</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Inventario</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Unidad</th>
                  </>
                ) : null}
                <th className="py-2 pr-4 whitespace-nowrap">Stock sede</th>
                <th className="py-2 pr-4 whitespace-nowrap">Minimo</th>
                <th className="py-2 pr-4 whitespace-nowrap">Faltante</th>
                {viewMode === "catalogo" ? (
                  <>
                    <th className="py-2 pr-4 whitespace-nowrap">Auto-costo</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Estado</th>
                  </>
                ) : (
                  <th className="py-2 pr-4 whitespace-nowrap">Proveedor primario</th>
                )}
                <th className="py-2 pr-4 w-[340px] whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product) => {
                const inventoryProfile = product.product_inventory_profiles;
                const inventoryLabel = inventoryProfile?.inventory_kind ?? "unclassified";
                const autoCostMode = inventoryProfile?.costing_mode ?? "auto_primary_supplier";
                const autoCostReason = autoCostReasonByProduct.get(product.id) ?? null;
                const primarySupplier = primarySupplierByProduct.get(product.id);
                const primarySupplierName = primarySupplier?.supplier_id
                  ? supplierNameById.get(primarySupplier.supplier_id) ?? primarySupplier.supplier_id
                  : "Sin proveedor";
                const stockMetrics = stockMetricsByProduct.get(product.id) ?? {
                  currentQty: 0,
                  minStock: null,
                  missingQty: null,
                  isLow: false,
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
                return (
                  <tr key={product.id} className="border-t border-zinc-200/60">
                    <td className="py-2.5 pr-4">
                      <div className="max-w-[220px] truncate" title={product.name ?? "-"}>
                        {product.name}
                      </div>
                    </td>
                    {viewMode === "catalogo" ? (
                      <>
                        <td className="py-2.5 pr-4 font-mono whitespace-nowrap">{product.sku ?? "-"}</td>
                        <td className="py-2.5 pr-4">
                          <div className="max-w-[320px] truncate" title={categoryPath}>
                            {categoryLabel}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">{inventoryLabel}</td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">{product.unit ?? "-"}</td>
                      </>
                    ) : null}
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      <span className={stockMetrics.isLow ? "font-semibold text-amber-700" : ""}>
                        {formatQty(stockMetrics.currentQty)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">{formatQty(stockMetrics.minStock)}</td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      {stockMetrics.missingQty != null && stockMetrics.missingQty > 0 ? (
                        <span className="ui-chip ui-chip--warn">{formatQty(stockMetrics.missingQty)}</span>
                      ) : stockMetrics.minStock == null ? (
                        <span className="text-xs text-[var(--ui-muted)]">Sin minimo</span>
                      ) : (
                        <span className="ui-chip ui-chip--success">OK</span>
                      )}
                    </td>
                    {viewMode === "catalogo" ? (
                      <>
                        <td className="py-2.5 pr-4">
                          {autoCostMode === "manual" ? (
                            <span className="ui-chip">Manual</span>
                          ) : autoCostReason ? (
                            <div className="space-y-1">
                              <span className="ui-chip ui-chip--warn">Incompleto</span>
                              <div className="text-xs text-[var(--ui-muted)]">{autoCostReason}</div>
                            </div>
                          ) : (
                            <span className="ui-chip ui-chip--success">Listo</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          {product.is_active === false ? "Inactivo" : "Activo"}
                        </td>
                      </>
                    ) : (
                      <td className="py-2.5 pr-4 whitespace-nowrap">{primarySupplierName}</td>
                    )}
                    <td className="py-2.5 pr-4 align-top">
                      <div className="flex flex-nowrap items-center gap-2">
                        <Link
                          href={`/inventory/catalog/${product.id}?from=${encodeURIComponent(catalogReturnUrl)}`}
                          className={TABLE_ACTION_BUTTON_CLASS}
                        >
                          Ficha
                        </Link>
                        {canManageProducts ? (
                          <form action={toggleProductActiveFromListAction}>
                            <input type="hidden" name="product_id" value={product.id} />
                            <input type="hidden" name="return_to" value={catalogReturnUrl} />
                            <input
                              type="hidden"
                              name="next_is_active"
                              value={product.is_active === false ? "1" : "0"}
                            />
                            <button type="submit" className={TABLE_ACTION_BUTTON_CLASS}>
                              {product.is_active === false ? "Habilitar" : "Deshabilitar"}
                            </button>
                          </form>
                        ) : null}
                        {canManageProducts ? (
                          <form action={deleteProductFromListAction}>
                            <input type="hidden" name="product_id" value={product.id} />
                            <input type="hidden" name="return_to" value={catalogReturnUrl} />
                            <button type="submit" className={TABLE_DELETE_BUTTON_CLASS}>
                              Eliminar
                            </button>
                          </form>
                        ) : null}
                        {viewMode === "compras" && rowOrigoHref ? (
                          <Link href={rowOrigoHref} className="ui-btn ui-btn--brand ui-btn--sm min-w-[120px] justify-center">
                            OC proveedor
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!visibleProducts.length ? (
                <tr>
                  <td
                    className="py-4 text-[var(--ui-muted)]"
                    colSpan={viewMode === "catalogo" ? 11 : 8}
                  >
                    No hay productos para mostrar con estos filtros.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

