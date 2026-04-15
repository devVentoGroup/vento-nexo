import Link from "next/link";
import { CategoryTreeFilter } from "@/components/inventory/CategoryTreeFilter";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";

import { requireAppAccess } from "@/lib/auth/guard";
import { getCategoryDomainOptions } from "@/lib/constants";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  categoryKindFromProduct,
  collectDescendantIds,
  filterCategoryRows,
  filterCategoryRowsDirect,
  getCategoryDomainCodes,
  getCategoryPath,
  normalizeCategoryDomain,
  normalizeCategoryKind,
  normalizeCategoryScope,
  shouldShowCategoryDomain,
  type InventoryCategoryRow,
} from "@/lib/inventory/categories";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type SearchParams = {
  site_id?: string;
  q?: string;
  stock_class?: string;
  product_type?: string;
  inventory_kind?: string;
  category_kind?: string;
  category_id?: string;
  category_domain?: string;
  category_scope?: string;
  category_site_id?: string;
  location_id?: string;
  zone?: string;
  error?: string;
  count_initial?: string;
  adjust?: string;
  /** 1.4 Vista Stock por LOC: tabla producto × LOC */
  view?: string;
};

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

type CategoryRow = InventoryCategoryRow;

type StockRow = {
  site_id: string;
  product_id: string;
  current_qty: number | null;
  updated_at: string | null;
};

type StockByLocRow = {
  location_id: string;
  product_id: string;
  current_qty: number | null;
  location?: { code: string | null; zone: string | null; site_id: string } | null;
};

type LocRow = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_type: string;
  category_id: string | null;
  product_inventory_profiles?:
    | {
        track_inventory: boolean;
        inventory_kind: string;
      }
    | Array<{
        track_inventory: boolean;
        inventory_kind: string;
      }>
    | null;
};

type ProductInventoryProfile = {
  track_inventory: boolean;
  inventory_kind: string;
};

type StockClassChip = {
  value: string;
  label: string;
  count: number;
};

function getInventoryProfile(
  profile: ProductRow["product_inventory_profiles"]
): ProductInventoryProfile | null {
  if (!profile) return null;
  if (Array.isArray(profile)) return profile[0] ?? null;
  return profile;
}

function normalizeInventoryKind(value?: string | null): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || "unclassified";
}

function normalizeProductType(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase();
}

function inventoryKindLabel(kindRaw: string): string {
  const kind = normalizeInventoryKind(kindRaw);
  if (kind === "ingredient") return "Insumos";
  if (kind === "finished") return "Producto terminado";
  if (kind === "resale") return "Reventa";
  if (kind === "packaging") return "Empaques";
  if (kind === "asset") return "Activos";
  return "Sin clasificar";
}

function matchesStockClass(product: ProductRow, stockClass: string): boolean {
  const productType = normalizeProductType(product.product_type);
  const inventoryKind = normalizeInventoryKind(
    getInventoryProfile(product.product_inventory_profiles)?.inventory_kind
  );
  const normalizedClass = String(stockClass ?? "").trim().toLowerCase();

  if (!normalizedClass) return true;
  if (normalizedClass === "insumos") {
    return productType === "insumo" && ["ingredient", "packaging", "unclassified"].includes(inventoryKind);
  }
  if (normalizedClass === "preparaciones") return productType === "preparacion";
  if (normalizedClass === "venta") return productType === "venta";
  if (normalizedClass === "venta_reventa") return productType === "venta" && inventoryKind === "resale";
  if (normalizedClass === "venta_terminado") return productType === "venta" && inventoryKind === "finished";
  if (normalizedClass === "activos") return inventoryKind === "asset";
  return true;
}

type ProductSiteRow = {
  product_id: string;
  is_active: boolean | null;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  if (value.length >= 10) return value.slice(0, 10);
  return value;
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

export default async function InventoryStockPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

  const returnTo = "/inventory/stock";
  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo,
    permissionCode: PERMISSION,
  });

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const userRole = String((employeeRow as { role?: string } | null)?.role ?? "");
  const canExportByLoc = ["gerente_general", "propietario"].includes(userRole);
  const normalizedRole = userRole.toLowerCase();
  const isManagementRole = ["gerente_general", "propietario", "admin", "manager", "gerente"].includes(
    normalizedRole
  );

  const { data: employeeSites } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(50);

  const employeeSiteRows = (employeeSites ?? []) as EmployeeSiteRow[];
  const defaultSiteId = employeeSiteRows[0]?.site_id ?? "";
  const siteId = String(sp.site_id ?? defaultSiteId).trim();
  const searchQuery = String(sp.q ?? "").trim();
  const stockClass = String(sp.stock_class ?? "").trim().toLowerCase();
  const productType = String(sp.product_type ?? "").trim();
  const inventoryKind = String(sp.inventory_kind ?? "").trim();
  const categoryKindFromQuery = normalizeCategoryKind(sp.category_kind ?? "");
  const inferredCategoryKind =
    productType || inventoryKind
      ? categoryKindFromProduct({ productType, inventoryKind })
      : null;
  const categoryKind = categoryKindFromQuery ?? inferredCategoryKind;
  const requestedCategoryId = String(sp.category_id ?? "").trim();
  const categoryDomain = shouldShowCategoryDomain(categoryKind)
    ? normalizeCategoryDomain(sp.category_domain)
    : "";
  const requestedCategorySiteId = String(sp.category_site_id ?? siteId).trim();
  const defaultCategoryScope = requestedCategorySiteId ? "site" : "all";
  const categoryScope = normalizeCategoryScope(sp.category_scope ?? defaultCategoryScope);
  const categorySiteId = categoryScope === "site" ? requestedCategorySiteId : "";
  const locationIdFilter = String(sp.location_id ?? "").trim();
  const zoneFilter = String(sp.zone ?? "").trim();
  const viewByLoc = String(sp.view ?? "").trim() === "by_loc";

  const siteIds = employeeSiteRows
    .map((row) => row.site_id)
    .filter((id): id is string => Boolean(id));

  const { data: sites } = siteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", siteIds)
        .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  const siteRows = (sites ?? []) as SiteRow[];
  const siteNameMap = new Map(siteRows.map((row) => [row.id, row.name ?? row.id]));
  const siteNamesById = Object.fromEntries(
    siteRows.map((row) => [row.id, row.name ?? row.id])
  );
  const selectedSite = siteId ? siteRows.find((row) => row.id === siteId) ?? null : null;
  const selectedSiteType = String(selectedSite?.site_type ?? "").toLowerCase();
  const isProductionCenter = selectedSiteType === "production_center";
  const isSatellite = selectedSiteType === "satellite";
  const isOperatorFocusMode = !isManagementRole && (isProductionCenter || isSatellite);
  const useCompactFilters = true;

  const allCategoryRows = await loadCategoryRows(supabase);
  const categoryMap = new Map(allCategoryRows.map((row) => [row.id, row]));
  const categoryRows = filterCategoryRows(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: categorySiteId,
  });
  const directCategoryRows = filterCategoryRowsDirect(allCategoryRows, {
    kind: categoryKind,
    domain: categoryDomain,
    scope: categoryScope,
    siteId: categorySiteId,
  });
  const directCategoryIds = new Set(directCategoryRows.map((row) => row.id));
  const effectiveCategoryId =
    requestedCategoryId && categoryRows.some((row) => row.id === requestedCategoryId)
      ? requestedCategoryId
      : "";

  let filteredCategoryIds: string[] | null = null;
  const hasCategoryFilterInputs =
    Boolean(effectiveCategoryId) ||
    Boolean(categoryKind) ||
    Boolean(categoryDomain) ||
    categoryScope !== "all" ||
    Boolean(categorySiteId);

  if (hasCategoryFilterInputs) {
    if (effectiveCategoryId) {
      const descendants = Array.from(collectDescendantIds(categoryMap, effectiveCategoryId));
      filteredCategoryIds = descendants.filter((id) => directCategoryIds.has(id));
    } else {
      filteredCategoryIds = directCategoryRows.map((row) => row.id);
    }
  }

  const productTypeOptions = [
    { value: "", label: "Todos los tipos" },
    { value: "insumo", label: "Insumo" },
    { value: "preparacion", label: "Preparacion" },
    { value: "venta", label: "Venta" },
  ];

  const inventoryKindOptions = [
    { value: "", label: "Todos los tipos de inventario" },
    { value: "ingredient", label: "Insumo" },
    { value: "finished", label: "Producto terminado" },
    { value: "resale", label: "Reventa" },
    { value: "packaging", label: "Empaque" },
    { value: "asset", label: "Activo (maquinaria/utensilios)" },
  ];

  const categoryKindOptions = [
    { value: "", label: "Todas" },
    { value: "insumo", label: "Insumo" },
    { value: "preparacion", label: "Preparacion" },
    { value: "venta", label: "Venta" },
    { value: "equipo", label: "Equipo/activo" },
  ];

  const categoryScopeOptions = [
    { value: "all", label: "Todas" },
    { value: "global", label: "Globales" },
    { value: "site", label: "Sede activa" },
  ];

  const categoryDomainOptions = getCategoryDomainOptions(
    getCategoryDomainCodes(allCategoryRows, categoryKind)
  );

  const buildStockClassHref = (nextStockClass: string) => {
    const params = new URLSearchParams();
    if (siteId) params.set("site_id", siteId);
    if (searchQuery) params.set("q", searchQuery);
    if (categoryKind) params.set("category_kind", categoryKind);
    if (categoryScope) params.set("category_scope", categoryScope);
    if (categoryScope === "site" && categorySiteId) params.set("category_site_id", categorySiteId);
    if (effectiveCategoryId) params.set("category_id", effectiveCategoryId);
    if (categoryDomain) params.set("category_domain", categoryDomain);
    if (locationIdFilter) params.set("location_id", locationIdFilter);
    if (zoneFilter) params.set("zone", zoneFilter);
    if (nextStockClass) params.set("stock_class", nextStockClass);
    const qs = params.toString();
    return `/inventory/stock${qs ? `?${qs}` : ""}`;
  };

  const { data: productSites } = siteId
    ? await supabase
        .from("product_site_settings")
        .select("product_id,is_active")
        .eq("site_id", siteId)
        .eq("is_active", true)
    : { data: [] as ProductSiteRow[] };

  const productSiteRows = (productSites ?? []) as ProductSiteRow[];
  const productSiteIds = productSiteRows.map((row) => row.product_id);
  const hasProductSiteFilter = productSiteIds.length > 0;

  let productsQuery = supabase
    .from("products")
    .select(
      "id,name,sku,unit,stock_unit_code,product_type,category_id,product_inventory_profiles(track_inventory,inventory_kind)"
    )
    .order("name", { ascending: true })
    .limit(1000);

  if (searchQuery) {
    const pattern = `%${searchQuery}%`;
    productsQuery = productsQuery.or(`name.ilike.${pattern},sku.ilike.${pattern}`);
  }

  if (filteredCategoryIds !== null) {
    if (filteredCategoryIds.length === 0) {
      productsQuery = productsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      productsQuery = productsQuery.in("category_id", filteredCategoryIds);
    }
  }

  if (hasProductSiteFilter) {
    productsQuery = productsQuery.in("id", productSiteIds);
  }

  const { data: products, error: productError } = await productsQuery;
  let productRows = (products ?? []) as unknown as ProductRow[];

  const { data: stockData, error: stockError } = siteId
    ? await supabase
        .from("inventory_stock_by_site")
        .select("site_id,product_id,current_qty,updated_at")
        .eq("site_id", siteId)
    : { data: [] as StockRow[] };

  const stockRows = (stockData ?? []) as StockRow[];
  const stockMap = new Map(stockRows.map((row) => [row.product_id, row]));

  const { data: locationRows } =
    siteId && siteIds.includes(siteId)
      ? await supabase
          .from("inventory_locations")
          .select("id,code,zone,description")
          .eq("site_id", siteId)
          .eq("is_active", true)
          .order("zone", { ascending: true })
          .order("code", { ascending: true })
          .limit(500)
      : { data: [] as LocRow[] };

  const locList = (locationRows ?? []) as LocRow[];
  const locIdsForSite = new Set(locList.map((l) => l.id));
  const { data: stockByLocData } =
    siteId && locIdsForSite.size > 0
      ? await supabase
          .from("inventory_stock_by_location")
          .select("location_id,product_id,current_qty,location:inventory_locations(code,zone,site_id)")
          .in("location_id", Array.from(locIdsForSite))
          .gt("current_qty", 0)
      : { data: [] as StockByLocRow[] };

  const stockByLocRows = (stockByLocData ?? []) as StockByLocRow[];

  const locSummaryByProduct = new Map<
    string,
    { lines: string[]; locationIds: Set<string>; hasAny: boolean }
  >();
  for (const row of stockByLocRows) {
    const code = row.location?.code ?? row.location_id.slice(0, 8);
    const qty = Number(row.current_qty ?? 0);
    if (!qty) continue;
    const key = row.product_id;
    if (!locSummaryByProduct.has(key)) {
      locSummaryByProduct.set(key, { lines: [], locationIds: new Set(), hasAny: true });
    }
    const rec = locSummaryByProduct.get(key)!;
    rec.lines.push(`${code}: ${qty}`);
    rec.locationIds.add(row.location_id);
  }

  const productIdsInSelectedLoc =
    locationIdFilter && locIdsForSite.has(locationIdFilter)
      ? new Set(
          stockByLocRows
            .filter((r) => r.location_id === locationIdFilter && Number(r.current_qty ?? 0) > 0)
            .map((r) => r.product_id)
        )
      : null;

  const matrixByProductLoc = new Map<string, number>();
  for (const row of stockByLocRows) {
    const key = `${row.product_id}|${row.location_id}`;
    matrixByProductLoc.set(key, Number(row.current_qty ?? 0));
  }

  const locIdsInZone =
    zoneFilter && locList.length > 0
      ? new Set(locList.filter((l) => (l.zone ?? "").toLowerCase() === zoneFilter.toLowerCase()).map((l) => l.id))
      : null;
  const productIdsInSelectedZone =
    locIdsInZone && locIdsInZone.size > 0
      ? new Set(
          stockByLocRows
            .filter((r) => locIdsInZone.has(r.location_id) && Number(r.current_qty ?? 0) > 0)
            .map((r) => r.product_id)
        )
      : null;

  const negativeCount = stockRows.filter((row) => Number(row.current_qty ?? 0) < 0).length;
  const hasError = Boolean(productError || stockError);

  const productIdsWithStockNoLoc =
    siteId && siteIds.includes(siteId)
      ? stockRows
          .filter((row) => {
            const qty = Number(row.current_qty ?? 0);
            const hasLoc = locSummaryByProduct.get(row.product_id)?.hasAny ?? false;
            return qty > 0 && !hasLoc;
          })
          .map((row) => row.product_id)
      : [];
  if (siteId && (productIdsInSelectedLoc ?? productIdsInSelectedZone)) {
    const byLoc = productIdsInSelectedLoc
      ? (p: ProductRow) => productIdsInSelectedLoc!.has(p.id)
      : () => true;
    const byZone = productIdsInSelectedZone
      ? (p: ProductRow) => productIdsInSelectedZone!.has(p.id)
      : () => true;
    productRows = productRows.filter((p) => byLoc(p) && byZone(p));
  }

  const quickStockClassesBase: Array<{ value: string; label: string }> = [
    { value: "", label: "Todos" },
    { value: "insumos", label: "Insumos" },
    { value: "preparaciones", label: "Preparaciones" },
    { value: "venta", label: "Venta" },
    { value: "venta_reventa", label: "Reventa" },
    { value: "venta_terminado", label: "Venta terminados" },
    { value: "activos", label: "Activos" },
  ];

  const quickStockClasses: StockClassChip[] = quickStockClassesBase.map((chip) => ({
    ...chip,
    count: chip.value ? productRows.filter((product) => matchesStockClass(product, chip.value)).length : productRows.length,
  }));

  const normalizedInventoryKindFilter = normalizeInventoryKind(inventoryKind);
  if (stockClass) {
    productRows = productRows.filter((product) => matchesStockClass(product, stockClass));
  }
  if (productType) {
    const normalizedProductTypeFilter = normalizeProductType(productType);
    productRows = productRows.filter(
      (product) => normalizeProductType(product.product_type) === normalizedProductTypeFilter
    );
  }
  if (inventoryKind) {
    productRows = productRows.filter((product) => {
      const kind = normalizeInventoryKind(getInventoryProfile(product.product_inventory_profiles)?.inventory_kind);
      return kind === normalizedInventoryKindFilter;
    });
  }

  const totalQty = productRows.reduce((sum, product) => {
    const qty = Number(stockMap.get(product.id)?.current_qty ?? 0);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);
  const siteLabel = siteId ? siteNameMap.get(siteId) ?? siteId : "Todas las sedes";
  const locCount = siteId ? locList.length : 0;
  const heroTitle = isOperatorFocusMode
    ? isSatellite
      ? "Verifica stock para pedir o recibir"
      : "Verifica stock para preparar y despachar"
    : "Stock por sede";
  const heroSubtitle = isOperatorFocusMode
    ? isSatellite
      ? "Consulta rápido si tu sede tiene saldo, qué LOCs están activos y desde aquí vuelve a pedir o recibir."
      : "Usa esta vista para confirmar saldo, ubicar producto por LOC y seguir con preparación o conteo."
    : "Lee el inventario actual y entra a conteos, movimientos o vista por LOC sin cambiar de flujo.";
  const heroModeLabel = isSatellite
    ? "Modo satelite"
    : isProductionCenter
      ? "Modo Centro"
      : "Modo verificacion";
  const activeFilterCount = [
    searchQuery,
    stockClass,
    productType,
    inventoryKind,
    categoryKind ?? "",
    effectiveCategoryId,
    categoryDomain,
    categoryScope !== "all" ? categoryScope : "",
    categorySiteId,
    locationIdFilter,
    zoneFilter,
  ].filter(Boolean).length;

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid">
          <div>
            <span className="ui-chip ui-chip--brand">{heroModeLabel} · {siteLabel}</span>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
              {heroTitle}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-muted)] sm:text-base">
              {heroSubtitle}
            </p>
          </div>

          <div className="ui-remission-kpis">
            <div className="ui-remission-kpi">
              <div className="ui-remission-kpi-label">Productos</div>
              <div className="ui-remission-kpi-value">{productRows.length}</div>
              <div className="ui-remission-kpi-note">Visibles con los filtros actuales</div>
            </div>
            <div className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Qty total</div>
              <div className="ui-remission-kpi-value">{totalQty}</div>
              <div className="ui-remission-kpi-note">Suma de stock visible</div>
            </div>
            <div className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Señales</div>
              <div className="ui-remission-kpi-value">{negativeCount + productIdsWithStockNoLoc.length}</div>
              <div className="ui-remission-kpi-note">Negativos o sin LOC</div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-start justify-between gap-4 ui-fade-up ui-delay-1">
        <div>
          <div className="ui-caption">
            {activeFilterCount > 0 ? `${activeFilterCount} filtro(s) activos` : "Sin filtros adicionales"}
            {locCount > 0 ? ` · ${locCount} LOCs visibles` : ""}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {isSatellite ? (
            <Link href="/inventory/remissions" className="ui-btn ui-btn--brand">
              Pedir / recibir
            </Link>
          ) : null}
          {isProductionCenter ? (
            <Link href="/inventory/remissions/prepare" className="ui-btn ui-btn--brand">
              Preparar remisiones
            </Link>
          ) : null}
          {isOperatorFocusMode ? (
            <Link href="/scanner" className="ui-btn ui-btn--ghost">
              Scanner
            </Link>
          ) : null}
          {siteId && locList.length > 0 ? (
            viewByLoc ? (
              <Link
                href={`/inventory/stock?site_id=${encodeURIComponent(siteId)}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}${stockClass ? `&stock_class=${encodeURIComponent(stockClass)}` : ""}${productType ? `&product_type=${encodeURIComponent(productType)}` : ""}${inventoryKind ? `&inventory_kind=${encodeURIComponent(inventoryKind)}` : ""}`}
                className="ui-btn ui-btn--ghost"
              >
                Ver stock por sede
              </Link>
            ) : (
              <Link
                href={`/inventory/stock?site_id=${encodeURIComponent(siteId)}&view=by_loc${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}${stockClass ? `&stock_class=${encodeURIComponent(stockClass)}` : ""}${productType ? `&product_type=${encodeURIComponent(productType)}` : ""}${inventoryKind ? `&inventory_kind=${encodeURIComponent(inventoryKind)}` : ""}`}
                className="ui-btn ui-btn--brand"
              >
                Stock por LOC (tabla)
              </Link>
            )
          ) : null}
          <Link href="/inventory/count-initial" className="ui-btn ui-btn--brand">
            Conteo inicial
          </Link>
          <Link href="/inventory/movements" className="ui-btn ui-btn--ghost">
            Ver movimientos
          </Link>
        </div>
      </div>

      {sp.count_initial === "1" ? (
        <div className="ui-alert ui-alert--success ui-fade-up ui-delay-1">
          Conteo inicial registrado. Los movimientos y el stock se actualizaron.
        </div>
      ) : null}

      {sp.adjust === "1" ? (
        <div className="ui-alert ui-alert--success ui-fade-up ui-delay-1">
          Ajuste registrado. El movimiento y el stock se actualizaron.
        </div>
      ) : null}

      {productIdsWithStockNoLoc.length > 0 ? (
        <div className="ui-alert ui-alert--warn ui-fade-up ui-delay-1">
          <strong>Sin ubicación:</strong> {productIdsWithStockNoLoc.length} producto(s) tienen stock en esta sede pero
          no tienen LOC asignada. Asigna ubicación en Entradas al recibir o en Traslados.
        </div>
      ) : null}

      {errorMsg ? (
        <div className="ui-alert ui-alert--error ui-fade-up ui-delay-1">
          Error: {errorMsg}
        </div>
      ) : null}

      <div className="ui-panel ui-panel--halo ui-remission-section ui-fade-up ui-delay-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ui-h3">{useCompactFilters ? "Buscar rapido" : "Filtros"}</div>
            <div className="mt-1 ui-caption">
              {useCompactFilters
                ? "Primero busca el producto o el LOC. Los filtros avanzados quedan abajo si de verdad los necesitas."
                : "Afina vista, categoria y ubicaciones sin salir de stock."}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">{siteLabel}</span>
            <span className="ui-chip ui-chip--warn">{negativeCount} negativos</span>
            <span className="ui-chip ui-chip--brand">{productIdsWithStockNoLoc.length} sin LOC</span>
          </div>
        </div>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <span className="ui-label">Tipo inventario</span>
            <select name="inventory_kind" defaultValue={inventoryKind} className="ui-input">
              {inventoryKindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
            <span className="ui-label">Sede</span>
            <select name="site_id" defaultValue={siteId} className="ui-input">
              <option value="">Todas</option>
              {siteIds.map((id) => (
                <option key={id} value={id}>
                  {siteNameMap.get(id) ?? id}
                </option>
              ))}
            </select>
          </label>

          {siteId && locList.length > 0 ? (
            <>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Ubicacion (LOC)</span>
                <select name="location_id" defaultValue={locationIdFilter} className="ui-input">
                  <option value="">Todas</option>
                  {locList.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.code ?? loc.id} {loc.zone ? `(${loc.zone})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Zona</span>
                <select name="zone" defaultValue={zoneFilter} className="ui-input">
                  <option value="">Todas</option>
                  {Array.from(new Set(locList.map((l) => l.zone).filter(Boolean))).map((z) => (
                    <option key={z!} value={z!}>
                      {z}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          {useCompactFilters ? (
            <details className="sm:col-span-2 lg:col-span-4 rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                Filtros avanzados
              </summary>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1">
                  <span className="ui-label">Tipo de producto</span>
                  <select name="product_type" defaultValue={productType} className="ui-input">
                    {productTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="ui-label">Categoria aplica a</span>
                  <select name="category_kind" defaultValue={categoryKind ?? ""} className="ui-input">
                    {categoryKindOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="ui-label">Alcance de categoria</span>
                  <select name="category_scope" defaultValue={categoryScope} className="ui-input">
                    {categoryScopeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {shouldShowCategoryDomain(categoryKind) ? (
                  <label className="flex flex-col gap-1">
                    <span className="ui-label">Dominio de venta</span>
                    <select name="category_domain" defaultValue={categoryDomain} className="ui-input">
                      <option value="">Todos</option>
                      {categoryDomainOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <input type="hidden" name="category_domain" value="" />
                )}

                {categoryScope === "site" ? (
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="ui-label">Sede para categorias</span>
                    <select name="category_site_id" defaultValue={categorySiteId} className="ui-input">
                      <option value="">Seleccionar sede</option>
                      {siteIds.map((id) => (
                        <option key={id} value={id}>
                          {siteNameMap.get(id) ?? id}
                        </option>
                      ))}
                    </select>
                    <span className="ui-caption">Solo aplica cuando el alcance es Sede activa.</span>
                  </label>
                ) : (
                  <input type="hidden" name="category_site_id" value="" />
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
              </div>
            </details>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Tipo de producto</span>
                <select name="product_type" defaultValue={productType} className="ui-input">
                  {productTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="ui-label">Categoria aplica a</span>
                <select name="category_kind" defaultValue={categoryKind ?? ""} className="ui-input">
                  {categoryKindOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="ui-label">Alcance de categoria</span>
                <select name="category_scope" defaultValue={categoryScope} className="ui-input">
                  {categoryScopeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {categoryScope === "site" ? (
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="ui-label">Sede para categorias</span>
                  <select name="category_site_id" defaultValue={categorySiteId} className="ui-input">
                    <option value="">Seleccionar sede</option>
                    {siteIds.map((id) => (
                      <option key={id} value={id}>
                        {siteNameMap.get(id) ?? id}
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
                    {categoryDomainOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
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
            </>
          )}

          <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
            <button className="ui-btn ui-btn--brand">Aplicar filtros</button>
            <Link href={`/inventory/stock?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
              Limpiar
            </Link>
          </div>
        </form>
      </div>

      {viewByLoc && siteId && locList.length > 0 ? (
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="ui-h3">Stock por LOC (producto × ubicación)</div>
              <div className="mt-1 ui-body-muted">
                Cantidades por producto y por LOC. Sede: {siteNameMap.get(siteId) ?? siteId}.
              </div>
            </div>
            {canExportByLoc ? (
              <a
                href={`/api/inventory/stock/export-by-loc?site_id=${encodeURIComponent(siteId)}`}
                className="ui-btn ui-btn--ghost"
                download="stock-por-loc.csv"
              >
                Exportar CSV
              </a>
            ) : null}
          </div>
          <div className="ui-scrollbar-subtle mt-4 max-h-[70vh] overflow-x-auto overflow-y-auto">
            <Table className="min-w-[1200px] table-auto [&_th]:pr-4 [&_td]:pr-4 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--ui-surface)] [&_thead_th]:backdrop-blur [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-20 [&_th:first-child]:bg-[var(--ui-surface)] [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-[var(--ui-surface)]">
              <thead>
                <tr>
                  <TableHeaderCell className="min-w-[220px]">Producto</TableHeaderCell>
                  <TableHeaderCell className="min-w-[180px]">SKU</TableHeaderCell>
                  <TableHeaderCell className="min-w-[100px]">Unidad</TableHeaderCell>
                  {locList.map((loc) => (
                    <TableHeaderCell key={loc.id} className="min-w-[120px] font-mono text-right whitespace-nowrap">
                      {loc.code ?? loc.id}
                    </TableHeaderCell>
                  ))}
                  <TableHeaderCell className="min-w-[120px] text-right whitespace-nowrap">Total sede</TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {productRows.map((product) => {
                  const stockRow = stockMap.get(product.id);
                  const totalSede = Number(stockRow?.current_qty ?? 0);
                  const hasAnyInLocs = locSummaryByProduct.get(product.id)?.hasAny ?? false;
                  if (!hasAnyInLocs && totalSede <= 0) return null;
                  return (
                    <tr key={product.id} className="ui-body">
                      <TableCell className="align-top">{product.name}</TableCell>
                      <TableCell className="font-mono align-top break-all">{product.sku ?? "-"}</TableCell>
                      <TableCell className="align-top whitespace-nowrap">{product.stock_unit_code ?? product.unit ?? "-"}</TableCell>
                      {locList.map((loc) => {
                        const qty = matrixByProductLoc.get(`${product.id}|${loc.id}`) ?? 0;
                        return (
                          <TableCell key={loc.id} className="font-mono text-right align-top whitespace-nowrap">
                            {qty > 0 ? qty : "-"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="font-mono text-right font-medium align-top whitespace-nowrap">
                        {totalSede}
                      </TableCell>
                    </tr>
                  );
                })}
                {productRows.filter((p) => (locSummaryByProduct.get(p.id)?.hasAny ?? false) || Number(stockMap.get(p.id)?.current_qty ?? 0) > 0).length === 0 ? (
                  <tr>
                    <TableCell colSpan={4 + locList.length} className="ui-empty">
                      No hay stock por LOC para mostrar en esta sede con los filtros actuales.
                    </TableCell>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </div>
        </div>
      ) : null}

      {hasError ? (
        <div className="ui-alert ui-alert--error ui-fade-up ui-delay-2">
          Fallo el SELECT de inventario: {productError?.message ?? stockError?.message}
        </div>
      ) : null}

      {!viewByLoc ? (
      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="ui-h3">Stock</div>
            <div className="mt-1 ui-caption">Mostrando hasta 1000 productos.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">{productRows.length} items</span>
            <span className="ui-chip ui-chip--warn">{negativeCount} negativos</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {quickStockClasses.map((kind) => {
            const isActiveKind = kind.value ? stockClass === kind.value : !stockClass;
            return (
              <Link
                key={kind.value || "all"}
                href={buildStockClassHref(kind.value)}
                className={isActiveKind ? "ui-chip ui-chip--brand" : "ui-chip"}
              >
                {kind.label} ({kind.count})
              </Link>
            );
          })}
        </div>

        <div className="ui-scrollbar-subtle mt-4 max-h-[70vh] overflow-x-auto overflow-y-auto">
          <Table className="min-w-[1460px] table-auto [&_th]:pr-4 [&_td]:pr-4 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--ui-surface)] [&_thead_th]:backdrop-blur [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-20 [&_th:first-child]:bg-[var(--ui-surface)] [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-[var(--ui-surface)]">
            <thead>
              <tr>
                <TableHeaderCell className="min-w-[220px]">Producto</TableHeaderCell>
                <TableHeaderCell className="min-w-[180px]">SKU</TableHeaderCell>
                <TableHeaderCell className="min-w-[420px]">Categoria</TableHeaderCell>
                <TableHeaderCell className="min-w-[120px]">Tipo</TableHeaderCell>
                <TableHeaderCell className="min-w-[140px]">Inventario</TableHeaderCell>
                <TableHeaderCell className="min-w-[90px]">Track</TableHeaderCell>
                <TableHeaderCell className="min-w-[220px]">Sede</TableHeaderCell>
                <TableHeaderCell className="min-w-[90px] text-right">Qty</TableHeaderCell>
                <TableHeaderCell className="min-w-[90px]">Unidad</TableHeaderCell>
                {siteId && locList.length > 0 ? (
                  <TableHeaderCell className="min-w-[320px]">Ubicaciones (LOC)</TableHeaderCell>
                ) : null}
                <TableHeaderCell className="min-w-[130px] whitespace-nowrap">Actualizado</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {productRows.map((product) => {
                const stockRow = stockMap.get(product.id);
                const qtyValue = Number(stockRow?.current_qty ?? 0);
                const inventoryProfile = getInventoryProfile(product.product_inventory_profiles);
                const qtyClass =
                  inventoryProfile?.track_inventory && qtyValue < 0
                    ? "text-red-600 font-semibold"
                    : "text-zinc-800";
                const sku = product.sku ?? "-";
                const unit = product.stock_unit_code ?? product.unit ?? "-";
                const siteLabel = siteId ? siteNameMap.get(siteId) ?? siteId : "Todas";
                const categoryLabel = getCategoryPath(product.category_id, categoryMap);
                const inventoryLabel = inventoryKindLabel(
                  inventoryProfile?.inventory_kind ?? "unclassified"
                );
                const trackLabel = inventoryProfile?.track_inventory ? "si" : "no";
                const locSummary = locSummaryByProduct.get(product.id);
                const ubicacionesLabel =
                  siteId && locList.length > 0
                    ? locSummary?.lines?.length
                      ? locSummary.lines.join(" · ")
                      : qtyValue > 0
                        ? "Sin ubicación"
                        : "-"
                    : null;
                const sinUbicacion = Boolean(
                  siteId && qtyValue > 0 && !locSummary?.hasAny
                );

                return (
                  <tr key={product.id} className="ui-body">
                    <TableCell className="align-top">{product.name}</TableCell>
                    <TableCell className="font-mono align-top break-all">{sku}</TableCell>
                    <TableCell className="align-top">{categoryLabel}</TableCell>
                    <TableCell className="align-top whitespace-nowrap">{product.product_type}</TableCell>
                    <TableCell className="align-top whitespace-nowrap">{inventoryLabel}</TableCell>
                    <TableCell className="align-top whitespace-nowrap">{trackLabel}</TableCell>
                    <TableCell className="font-mono align-top">{siteLabel}</TableCell>
                    <TableCell className={`font-mono text-right align-top whitespace-nowrap ${qtyClass}`}>
                      {Number.isFinite(qtyValue) ? qtyValue : "-"}
                    </TableCell>
                    <TableCell className="align-top whitespace-nowrap">{unit}</TableCell>
                    {siteId && locList.length > 0 ? (
                      <TableCell
                        className={`align-top ${sinUbicacion ? "text-amber-600 font-medium" : ""}`}
                        title={sinUbicacion ? "Producto con stock sin LOC asignada" : undefined}
                      >
                        {ubicacionesLabel ?? "-"}
                      </TableCell>
                    ) : null}
                    <TableCell className="font-mono align-top whitespace-nowrap">
                      {formatDate(stockRow?.updated_at)}
                    </TableCell>
                  </tr>
                );
              })}

              {!hasError && productRows.length === 0 ? (
                <tr>
                  <TableCell
                    colSpan={siteId && locList.length > 0 ? 11 : 10}
                    className="ui-empty"
                  >
                    No hay productos para mostrar (o RLS no te permite verlo).
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </div>
      ) : null}
    </div>
  );
}




