import Link from "next/link";
import { CategoryTreeFilter } from "@/components/inventory/CategoryTreeFilter";
import { Table, TableCell, TableHeaderCell } from "@/components/vento/standard/table";
import { StockTableClient, type StockTableRow } from "@/features/inventory/stock/stock-table-client";

import { requireAppAccess } from "@/lib/auth/guard";
import { getCategoryDomainOptions } from "@/lib/constants";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  categoryKindFromProduct,
  collectDescendantIds,
  filterCategoryRows,
  filterCategoryRowsDirect,
  getCategoryDomainCodes,
  normalizeCategoryDomain,
  normalizeCategoryKind,
  normalizeCategoryScope,
  shouldShowCategoryDomain,
  type InventoryCategoryRow,
} from "@/lib/inventory/categories";
import {
  selectProductUomProfileForContext,
  type ProductUomProfile,
} from "@/lib/inventory/uom";
import { assignStockWithoutLocation } from "./actions";
import {
  fetchActiveProductSiteRows,
  fetchProductRowsForStock,
  fetchProductUomProfiles,
  fetchStockRowsByLocation,
  fetchStockRowsBySite,
  formatDate,
  formatMetric,
  getInventoryProfile,
  loadCategoryRows,
  matchesStockClass,
  normalizeInventoryKind,
  normalizeProductType,
  siteTypeLabel,
  type CategoryRow,
  type EmployeeSiteRow,
  type LocRow,
  type ProductRow,
  type ProductSiteRow,
  type SearchParams,
  type SiteRow,
  type StockByLocRow,
  type StockClassChip,
  type StockRow,
} from "./helpers";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

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
    { value: "preparacion", label: "Preparación" },
    { value: "venta", label: "Venta" },
  ];

  const categoryKindOptions = [
    { value: "", label: "Todas" },
    { value: "insumo", label: "Insumo" },
    { value: "preparacion", label: "Preparación" },
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

  const { rows: productSiteRows } = siteId
    ? await fetchActiveProductSiteRows(supabase, siteId)
    : { rows: [] as ProductSiteRow[] };
  const productSiteIds = productSiteRows.map((row) => row.product_id);

  const { rows: fetchedProductRows, error: productError } = await fetchProductRowsForStock(supabase, {
    searchQuery,
    filteredCategoryIds,
    productSiteIds,
  });
  let productRows = fetchedProductRows;
  const productIdsForProfiles = productRows.map((product) => product.id);
  const uomProfiles = productIdsForProfiles.length
    ? await fetchProductUomProfiles(supabase, productIdsForProfiles)
    : [];

  const { rows: stockRows, error: stockError } = siteId
    ? await fetchStockRowsBySite(supabase, siteId)
    : { rows: [] as StockRow[], error: null };
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
  const stockByLocRows =
    siteId && locIdsForSite.size > 0
      ? await fetchStockRowsByLocation(supabase, Array.from(locIdsForSite))
      : [];

  const locSummaryByProduct = new Map<
    string,
    { lines: string[]; locationIds: Set<string>; hasAny: boolean; totalQty: number }
  >();
  for (const row of stockByLocRows) {
    const code = row.location?.code ?? row.location_id.slice(0, 8);
    const qty = Number(row.current_qty ?? 0);
    if (!qty) continue;
    const key = row.product_id;
    if (!locSummaryByProduct.has(key)) {
      locSummaryByProduct.set(key, { lines: [], locationIds: new Set(), hasAny: true, totalQty: 0 });
    }
    const rec = locSummaryByProduct.get(key)!;
    rec.lines.push(`${code}: ${qty}`);
    rec.locationIds.add(row.location_id);
    rec.totalQty += qty;
  }

  const productIdsInSelectedLoc =
    locationIdFilter && locIdsForSite.has(locationIdFilter)
      ? new Set(
          stockByLocRows
            .filter((r) => r.location_id === locationIdFilter && Math.abs(Number(r.current_qty ?? 0)) > 0.000001)
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
            .filter((r) => locIdsInZone.has(r.location_id) && Math.abs(Number(r.current_qty ?? 0)) > 0.000001)
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
            const assignedQty = locSummaryByProduct.get(row.product_id)?.totalQty ?? 0;
            return qty - assignedQty > 0.000001;
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
  const visibleStockRowsWithQty = productRows.filter((product) => {
    const qty = Number(stockMap.get(product.id)?.current_qty ?? 0);
    return Math.abs(qty) > 0.000001;
  }).length;
  const positiveStockRows = productRows.filter((product) => {
    const qty = Number(stockMap.get(product.id)?.current_qty ?? 0);
    return qty > 0.000001;
  }).length;
  const zeroStockRows = Math.max(productRows.length - positiveStockRows - negativeCount, 0);
  const productsWithLocStock = Array.from(locSummaryByProduct.values()).filter((row) => row.totalQty > 0.000001).length;
  const locCoveragePct =
    positiveStockRows > 0 ? Math.round((productsWithLocStock / positiveStockRows) * 100) : 100;
  const zoneCount = new Set(locList.map((loc) => String(loc.zone ?? "").trim()).filter(Boolean)).size;
  const stockWithoutLocCount = productIdsWithStockNoLoc.length;
  const alertCount = negativeCount + stockWithoutLocCount;
  const siteLabel = siteId ? siteNameMap.get(siteId) ?? siteId : "Todas las sedes";
  const locCount = siteId ? locList.length : 0;
  const selectedLoc = locationIdFilter && locList.length > 0
    ? locList.find((loc) => loc.id === locationIdFilter)
    : null;
  const selectedLocLabel =
    selectedLoc?.description || selectedLoc?.code || selectedLoc?.zone || locationIdFilter;
  const activeViewLabel = viewByLoc ? "Stock por área / LOC" : "Stock por sede";
  const heroTitle = isOperatorFocusMode
    ? isSatellite
      ? "Verifica stock para pedir o recibir"
      : "Verifica stock para preparar y despachar"
    : "Stock por sede";
  const heroSubtitle = isOperatorFocusMode
    ? isSatellite
      ? "Consulta rápido si tu sede tiene saldo, qué áreas están activas y desde aquí vuelve a pedir o recibir."
      : "Usa esta vista para confirmar saldo, ubicar producto por área y seguir con preparación o conteo."
    : "Lee el inventario actual y entra a conteos, movimientos o vista por área sin cambiar de flujo.";
  const heroModeLabel = isSatellite
    ? "Modo satélite"
    : isProductionCenter
      ? "Modo Centro"
      : "Modo verificación";
  const activeFilterCount = [
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

  const stockTableRows: StockTableRow[] = productRows
    .map((product) => {
      const stockRow = stockMap.get(product.id);
      const qtyValue = Number(stockRow?.current_qty ?? 0);
      const unit = product.stock_unit_code ?? product.unit ?? "-";
      const purchaseProfile = selectProductUomProfileForContext({
        profiles: uomProfiles,
        productId: product.id,
        context: "purchase",
      });
      const stockQtyPerPurchaseUnit =
        purchaseProfile &&
        Number(purchaseProfile.qty_in_input_unit) > 0 &&
        Number(purchaseProfile.qty_in_stock_unit) > 0
          ? Number(purchaseProfile.qty_in_stock_unit) / Number(purchaseProfile.qty_in_input_unit)
          : null;
      const purchaseUnitLabel =
        purchaseProfile && stockQtyPerPurchaseUnit
          ? String(purchaseProfile.label || purchaseProfile.input_unit_code || "").trim()
          : null;
      const locSummary = locSummaryByProduct.get(product.id);
      const unassignedQty = Math.max(0, qtyValue - Number(locSummary?.totalQty ?? 0));
      const areaLines = [...(locSummary?.lines ?? [])];
      if (unassignedQty > 0.000001) {
        areaLines.push(`Sin área: ${unassignedQty}`);
      }
      const areaSummary =
        siteId && locList.length > 0
          ? areaLines.length
            ? areaLines.join(" / ")
            : qtyValue > 0
              ? "Sin área"
              : ""
          : "";
      const byLocation = Object.fromEntries(
        locList.map((loc) => [loc.id, matrixByProductLoc.get(`${product.id}|${loc.id}`) ?? 0])
      );
      return {
        id: product.id,
        product: product.name,
        unit,
        totalQty: Number.isFinite(qtyValue) ? qtyValue : 0,
        purchaseUnitLabel,
        stockQtyPerPurchaseUnit,
        updatedAt: formatDate(stockRow?.updated_at),
        areaSummary,
        hasStockWithoutArea: Boolean(siteId && unassignedQty > 0.000001),
        byLocation,
        searchText: [
          product.name,
          product.sku ?? "",
          unit,
          purchaseUnitLabel ?? "",
          areaSummary,
          ...locList.map((loc) => `${loc.code ?? ""} ${loc.zone ?? ""} ${loc.description ?? ""}`),
        ].join(" "),
      };
    })
    .filter((row) =>
      viewByLoc
        ? Math.abs(row.totalQty) > 0.000001 ||
          Object.values(row.byLocation ?? {}).some((qty) => Math.abs(qty) > 0.000001)
        : true
    );

  const stockTableLocations = locList.map((loc) => ({
    id: loc.id,
    label: loc.description || loc.code || loc.zone || loc.id.slice(0, 8),
  }));

  const unassignedStockRows = productRows
    .map((product) => {
      const total = Number(stockMap.get(product.id)?.current_qty ?? 0);
      const assigned = Number(locSummaryByProduct.get(product.id)?.totalQty ?? 0);
      const unassigned = Math.max(0, total - assigned);
      return {
        product,
        unassigned,
        unit: product.stock_unit_code ?? product.unit ?? "un",
      };
    })
    .filter((row) => row.unassigned > 0.000001)
    .slice(0, 100);

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up overflow-hidden">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.25fr_0.95fr] lg:items-start">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <span className="ui-chip ui-chip--brand">{heroModeLabel}</span>
              <span className="ui-chip">{siteLabel}</span>
              <span className={viewByLoc ? "ui-chip ui-chip--success" : "ui-chip ui-chip--warn"}>
                {activeViewLabel}
              </span>
              {selectedSiteType ? <span className="ui-chip">{siteTypeLabel(selectedSiteType)}</span> : null}
            </div>

            <div>
              <h1 className="text-4xl font-black tracking-[-0.04em] text-[var(--ui-text)] sm:text-5xl">
                {heroTitle}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--ui-muted)]">
                {heroSubtitle}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Link
                href="/inventory/count-initial"
                className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950 transition hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-sm"
              >
                <div className="text-2xl font-black tracking-normal">01</div>
                <div className="mt-2">Conteo inicial</div>
                <div className="mt-1 text-xs font-medium text-emerald-800">
                  Cargar o corregir saldo base.
                </div>
              </Link>

              <Link
                href={`/inventory/stock/assign-location${siteId ? `?site_id=${encodeURIComponent(siteId)}` : ""}`}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950 transition hover:-translate-y-0.5 hover:bg-amber-100 hover:shadow-sm"
              >
                <div className="text-2xl font-black tracking-normal">LOC</div>
                <div className="mt-2">Asignar sin área</div>
                <div className="mt-1 text-xs font-medium text-amber-800">
                  {stockWithoutLocCount} producto(s) pendientes.
                </div>
              </Link>

              <Link
                href="/inventory/movements"
                className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-semibold text-indigo-950 transition hover:-translate-y-0.5 hover:bg-indigo-100 hover:shadow-sm"
              >
                <div className="text-2xl font-black tracking-normal">MOV</div>
                <div className="mt-2">Movimientos</div>
                <div className="mt-1 text-xs font-medium text-indigo-800">
                  Entradas, salidas y ajustes.
                </div>
              </Link>

              {siteId && locList.length > 0 ? (
                <Link
                  href={
                    viewByLoc
                      ? `/inventory/stock?site_id=${encodeURIComponent(siteId)}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}${stockClass ? `&stock_class=${encodeURIComponent(stockClass)}` : ""}${productType ? `&product_type=${encodeURIComponent(productType)}` : ""}${inventoryKind ? `&inventory_kind=${encodeURIComponent(inventoryKind)}` : ""}`
                      : `/inventory/stock?site_id=${encodeURIComponent(siteId)}&view=by_loc${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}${stockClass ? `&stock_class=${encodeURIComponent(stockClass)}` : ""}${productType ? `&product_type=${encodeURIComponent(productType)}` : ""}${inventoryKind ? `&inventory_kind=${encodeURIComponent(inventoryKind)}` : ""}`
                  }
                  className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm font-semibold text-cyan-950 transition hover:-translate-y-0.5 hover:bg-cyan-100 hover:shadow-sm"
                >
                  <div className="text-2xl font-black tracking-normal">MAP</div>
                  <div className="mt-2">{viewByLoc ? "Ver por sede" : "Ver por área"}</div>
                  <div className="mt-1 text-xs font-medium text-cyan-800">
                    {locCount} área(s) / {zoneCount} zona(s).
                  </div>
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3">
            <div className="ui-remission-kpis sm:grid-cols-2">
              <article className="ui-remission-kpi" data-tone="warm">
                <div className="ui-remission-kpi-label">Productos visibles</div>
                <div className="ui-remission-kpi-value">{formatMetric(productRows.length, 0)}</div>
                <div className="ui-remission-kpi-note">Según sede, filtros y vista actual</div>
              </article>
              <article className="ui-remission-kpi" data-tone="cool">
                <div className="ui-remission-kpi-label">Stock total visible</div>
                <div className="ui-remission-kpi-value">{formatMetric(totalQty, 2)}</div>
                <div className="ui-remission-kpi-note">{visibleStockRowsWithQty} producto(s) con saldo</div>
              </article>
              <article className="ui-remission-kpi" data-tone={alertCount > 0 ? "danger" : "success"}>
                <div className="ui-remission-kpi-label">Alertas</div>
                <div className="ui-remission-kpi-value">{formatMetric(alertCount, 0)}</div>
                <div className="ui-remission-kpi-note">{negativeCount} negativos · {stockWithoutLocCount} sin área</div>
              </article>
              <article className="ui-remission-kpi" data-tone={locCoveragePct >= 95 ? "success" : "warn"}>
                <div className="ui-remission-kpi-label">Cobertura LOC</div>
                <div className="ui-remission-kpi-value">{locCoveragePct}%</div>
                <div className="ui-remission-kpi-note">{productsWithLocStock}/{positiveStockRows || 0} con ubicación</div>
              </article>
            </div>

            <div className="rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-[var(--ui-text)]">Lectura rápida</div>
                  <div className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
                    {viewByLoc
                      ? "Estás viendo la distribución por área/LOC. Ideal para validar dónde está físicamente cada saldo."
                      : "Estás viendo el total consolidado por sede. Cambia a área/LOC para validar distribución física."}
                  </div>
                </div>
                <div className="text-3xl font-black tracking-normal">BOX</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 ui-fade-up ui-delay-1 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="ui-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="ui-h2">Centro de control de stock</h2>
              <p className="mt-2 ui-body-muted">
                Revisa primero alertas, ubicación y cobertura antes de hacer conteos, asignaciones o movimientos.
              </p>
            </div>
            <span className="ui-chip">
              {activeFilterCount > 0 ? `${activeFilterCount} filtro(s)` : "Sin filtros"}
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Sede</div>
              <div className="mt-1 text-base font-black text-[var(--ui-text)]">{siteLabel}</div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">{siteTypeLabel(selectedSiteType)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Áreas / zonas</div>
              <div className="mt-1 text-base font-black text-[var(--ui-text)]">{locCount} / {zoneCount}</div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">
                {selectedLocLabel ? `Filtrado por ${selectedLocLabel}` : "Sin filtro de área puntual"}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Ceros / sin saldo</div>
              <div className="mt-1 text-base font-black text-[var(--ui-text)]">{zeroStockRows}</div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">Productos visibles sin existencia positiva</div>
            </div>
          </div>
        </div>

        <div className="ui-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="ui-h2">Acciones operativas</h2>
              <p className="mt-2 ui-body-muted">Atajos según el tipo de sede y la operación del día.</p>
            </div>
            <div className="text-3xl font-black tracking-normal">GO</div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
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
            <Link href="/inventory/count-initial" className="ui-btn ui-btn--ghost">
              Conteo inicial
            </Link>
            <Link
              href={`/inventory/stock/assign-location${siteId ? `?site_id=${encodeURIComponent(siteId)}` : ""}`}
              className="ui-btn ui-btn--ghost"
            >
              Asignar sin área
            </Link>
            <Link href="/inventory/movements" className="ui-btn ui-btn--ghost">
              Movimientos
            </Link>
          </div>
        </div>
      </section>

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

      {sp.assigned === "1" ? (
        <div className="ui-alert ui-alert--success ui-fade-up ui-delay-1">
          Stock asignado al área. El total de la sede no cambió.
        </div>
      ) : null}

      {productIdsWithStockNoLoc.length > 0 ? (
        <div className="ui-alert ui-alert--warn ui-fade-up ui-delay-1">
          <strong>Sin ubicación:</strong> {productIdsWithStockNoLoc.length} producto(s) tienen stock en esta sede pero
          no está completamente asignado a un área.
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
            <div className="ui-h3">Filtros y alcance</div>
            <div className="mt-1 ui-caption">
              Elige sede, área, zona y categoría para leer el stock desde la operación correcta.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">{siteLabel}</span>
            <span className={negativeCount > 0 ? "ui-chip ui-chip--danger" : "ui-chip ui-chip--success"}>
              {negativeCount} negativos
            </span>
            <span className={stockWithoutLocCount > 0 ? "ui-chip ui-chip--warn" : "ui-chip ui-chip--success"}>
              {stockWithoutLocCount} sin área
            </span>
          </div>
        </div>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                <span className="ui-label">Área / LOC</span>
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
                  <span className="ui-label">Categoría aplica a</span>
                  <select name="category_kind" defaultValue={categoryKind ?? ""} className="ui-input">
                    {categoryKindOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="ui-label">Alcance de categoría</span>
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
                    <span className="ui-label">Sede para categorías</span>
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
                  label="Categoría"
                  emptyOptionLabel="Todas"
                  maxVisibleOptions={10}
                />
              </div>
            </details>

          <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
            <button className="ui-btn ui-btn--brand">Aplicar filtros</button>
            <Link href={`/inventory/stock?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
              Limpiar
            </Link>
          </div>
        </form>
      </div>

      {siteId && locList.length > 0 && unassignedStockRows.length > 0 ? (
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="ui-h3">Asignar stock sin área</div>
              <div className="mt-1 ui-body-muted">
                Productos con saldo en la sede que todavía no tienen distribución completa por LOC.
              </div>
            </div>
            <span className="ui-chip ui-chip--warn">{unassignedStockRows.length} visibles</span>
          </div>

          <div className="ui-scrollbar-subtle mt-4 max-h-[360px] overflow-x-auto overflow-y-auto">
            <Table className="min-w-[820px] table-auto [&_th]:pr-4 [&_td]:pr-4">
              <thead>
                <tr>
                  <TableHeaderCell>Producto</TableHeaderCell>
                  <TableHeaderCell className="text-right">Sin área</TableHeaderCell>
                  <TableHeaderCell>Asignacion</TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {unassignedStockRows.map((row) => (
                  <tr key={row.product.id} className="ui-body">
                    <TableCell className="font-medium text-[var(--ui-text)]">{row.product.name}</TableCell>
                    <TableCell className="font-mono text-right whitespace-nowrap">
                      {row.unassigned.toLocaleString("es-CO", { maximumFractionDigits: 3 })} {row.unit}
                    </TableCell>
                    <TableCell>
                      <form action={assignStockWithoutLocation} className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_130px_auto]">
                        <input type="hidden" name="site_id" value={siteId} />
                        <input type="hidden" name="product_id" value={row.product.id} />
                        <select name="location_id" className="ui-input" required defaultValue="">
                          <option value="" disabled>
                            Selecciona área
                          </option>
                          {locList.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.description || loc.code || loc.zone || loc.id.slice(0, 8)}
                            </option>
                          ))}
                        </select>
                        <input
                          name="quantity"
                          type="number"
                          min="0"
                          step="0.001"
                          max={row.unassigned}
                          defaultValue={row.unassigned}
                          className="ui-input text-right"
                          required
                        />
                        <button className="ui-btn ui-btn--brand" type="submit">
                          Asignar
                        </button>
                      </form>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      ) : null}

      {viewByLoc && siteId && locList.length > 0 ? (
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="ui-h3">Matriz de stock por área / LOC</div>
              <div className="mt-1 ui-body-muted">
                Lee la distribución física por producto y ubicación interna. Sede: {siteNameMap.get(siteId) ?? siteId}.
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
          <div className="mt-4">
            <StockTableClient
              rows={stockTableRows}
              locations={stockTableLocations}
              mode="by-location"
              emptyMessage="No hay stock por área para mostrar con estos filtros."
            />
          </div>
        </div>
      ) : null}

      {hasError ? (
        <div className="ui-alert ui-alert--error ui-fade-up ui-delay-2">
          Falló el SELECT de inventario: {productError?.message ?? stockError?.message}
        </div>
      ) : null}

      {!viewByLoc ? (
      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="ui-h3">Stock consolidado por sede</div>
            <div className="mt-1 ui-caption">Totales visibles según sede, categoría, tipo y filtros actuales.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">{productRows.length} items</span>
            <span className="ui-chip ui-chip--success">{positiveStockRows} con saldo</span>
            <span className={negativeCount > 0 ? "ui-chip ui-chip--danger" : "ui-chip ui-chip--success"}>
              {negativeCount} negativos
            </span>
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

        <div className="mt-4">
          <StockTableClient
            rows={stockTableRows}
            mode="site"
            emptyMessage="No hay productos para mostrar con estos filtros."
          />
        </div>
      </div>
      ) : null}
    </div>
  );
}




  
