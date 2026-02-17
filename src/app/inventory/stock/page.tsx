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
  product_inventory_profiles?: {
    track_inventory: boolean;
    inventory_kind: string;
  } | null;
};

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
        .select("id,name")
        .in("id", siteIds)
        .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  const siteRows = (sites ?? []) as SiteRow[];
  const siteNameMap = new Map(siteRows.map((row) => [row.id, row.name ?? row.id]));
  const siteNamesById = Object.fromEntries(
    siteRows.map((row) => [row.id, row.name ?? row.id])
  );

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

  const quickInventoryKinds = [
    { value: "", label: "Todos" },
    { value: "ingredient", label: "Insumos" },
    { value: "finished", label: "Terminado" },
    { value: "resale", label: "Reventa" },
    { value: "packaging", label: "Empaques" },
    { value: "asset", label: "Activos" },
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

  const buildKindHref = (kind: string) => {
    const params = new URLSearchParams();
    if (siteId) params.set("site_id", siteId);
    if (searchQuery) params.set("q", searchQuery);
    if (productType) params.set("product_type", productType);
    if (categoryKind) params.set("category_kind", categoryKind);
    if (categoryScope) params.set("category_scope", categoryScope);
    if (categoryScope === "site" && categorySiteId) params.set("category_site_id", categorySiteId);
    if (effectiveCategoryId) params.set("category_id", effectiveCategoryId);
    if (categoryDomain) params.set("category_domain", categoryDomain);
    if (locationIdFilter) params.set("location_id", locationIdFilter);
    if (zoneFilter) params.set("zone", zoneFilter);
    if (kind) params.set("inventory_kind", kind);
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

  if (productType) {
    productsQuery = productsQuery.eq("product_type", productType);
  }

  if (filteredCategoryIds !== null) {
    if (filteredCategoryIds.length === 0) {
      productsQuery = productsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      productsQuery = productsQuery.in("category_id", filteredCategoryIds);
    }
  }

  if (inventoryKind) {
    productsQuery = productsQuery.eq("product_inventory_profiles.inventory_kind", inventoryKind);
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

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Stock por sede</h1>
          <p className="mt-2 ui-body-muted">
            Consulta el inventario actual por SKU y sede. Esta vista respeta los permisos por sitio.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {siteId && locList.length > 0 ? (
            viewByLoc ? (
              <Link
                href={`/inventory/stock?site_id=${encodeURIComponent(siteId)}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}${inventoryKind ? `&inventory_kind=${encodeURIComponent(inventoryKind)}` : ""}`}
                className="ui-btn ui-btn--ghost"
              >
                Ver stock por sede
              </Link>
            ) : (
              <Link
                href={`/inventory/stock?site_id=${encodeURIComponent(siteId)}&view=by_loc${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}${inventoryKind ? `&inventory_kind=${encodeURIComponent(inventoryKind)}` : ""}`}
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
        <div className="mt-6 ui-alert ui-alert--success">
          Conteo inicial registrado. Los movimientos y el stock se actualizaron.
        </div>
      ) : null}

      {sp.adjust === "1" ? (
        <div className="mt-6 ui-alert ui-alert--success">
          Ajuste registrado. El movimiento y el stock se actualizaron.
        </div>
      ) : null}

      {productIdsWithStockNoLoc.length > 0 ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          <strong>Sin ubicación:</strong> {productIdsWithStockNoLoc.length} producto(s) tienen stock en esta sede pero
          no tienen LOC asignada. Asigna ubicación en Entradas al recibir o en Traslados.
        </div>
      ) : null}

      {errorMsg ? (
        <div className="mt-6 ui-alert ui-alert--error">
          Error: {errorMsg}
        </div>
      ) : null}

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Filtros</div>
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

          <div className="sm:col-span-2 lg:col-span-4 flex gap-2">
            <button className="ui-btn ui-btn--brand">Aplicar filtros</button>
            <Link href={`/inventory/stock?site_id=${encodeURIComponent(siteId)}`} className="ui-btn ui-btn--ghost">
              Limpiar
            </Link>
          </div>
        </form>
      </div>

      {viewByLoc && siteId && locList.length > 0 ? (
        <div className="mt-6 ui-panel">
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
          <div className="mt-4 max-h-[70vh] overflow-x-auto overflow-y-auto">
            <Table>
              <thead>
                <tr>
                  <TableHeaderCell>Producto</TableHeaderCell>
                  <TableHeaderCell>SKU</TableHeaderCell>
                  <TableHeaderCell>Unidad</TableHeaderCell>
                  {locList.map((loc) => (
                    <TableHeaderCell key={loc.id} className="font-mono text-right">
                      {loc.code ?? loc.id}
                    </TableHeaderCell>
                  ))}
                  <TableHeaderCell className="text-right">Total sede</TableHeaderCell>
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
                      <TableCell>{product.name}</TableCell>
                      <TableCell className="font-mono">{product.sku ?? "-"}</TableCell>
                      <TableCell>{product.stock_unit_code ?? product.unit ?? "-"}</TableCell>
                      {locList.map((loc) => {
                        const qty = matrixByProductLoc.get(`${product.id}|${loc.id}`) ?? 0;
                        return (
                          <TableCell key={loc.id} className="font-mono text-right">
                            {qty > 0 ? qty : "-"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="font-mono text-right font-medium">
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
        <div className="mt-6 ui-alert ui-alert--error">
          Fallo el SELECT de inventario: {productError?.message ?? stockError?.message}
        </div>
      ) : null}

      {!viewByLoc ? (
      <div className="mt-6 ui-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="ui-h3">Stock</div>
            <div className="mt-1 ui-body-muted">
              Mostrando hasta 1000 productos.
            </div>
          </div>
          <div className="ui-caption">
            Items: {productRows.length} | Negativos: {negativeCount}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {quickInventoryKinds.map((kind) => (
            <Link
              key={kind.value || "all"}
              href={buildKindHref(kind.value)}
              className={
                inventoryKind === kind.value ? "ui-chip ui-chip--brand" : "ui-chip"
              }
            >
              {kind.label}
            </Link>
          ))}
        </div>

        <div className="mt-4 max-h-[70vh] overflow-x-auto overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>SKU</TableHeaderCell>
                <TableHeaderCell>Categoria</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Inventario</TableHeaderCell>
                <TableHeaderCell>Track</TableHeaderCell>
                <TableHeaderCell>Sede</TableHeaderCell>
                <TableHeaderCell>Qty</TableHeaderCell>
                <TableHeaderCell>Unidad</TableHeaderCell>
                {siteId && locList.length > 0 ? (
                  <TableHeaderCell>Ubicaciones (LOC)</TableHeaderCell>
                ) : null}
                <TableHeaderCell>Actualizado</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {productRows.map((product) => {
                const stockRow = stockMap.get(product.id);
                const qtyValue = Number(stockRow?.current_qty ?? 0);
                const qtyClass =
                  product.product_inventory_profiles?.track_inventory && qtyValue < 0
                    ? "text-red-600 font-semibold"
                    : "text-zinc-800";
                const sku = product.sku ?? "-";
                const unit = product.stock_unit_code ?? product.unit ?? "-";
                const siteLabel = siteId ? siteNameMap.get(siteId) ?? siteId : "Todas";
                const categoryLabel = getCategoryPath(product.category_id, categoryMap);
                const inventoryProfile = product.product_inventory_profiles;
                const inventoryLabel = inventoryProfile?.inventory_kind ?? "unclassified";
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
                    <TableCell>{product.name}</TableCell>
                    <TableCell className="font-mono">{sku}</TableCell>
                    <TableCell>{categoryLabel}</TableCell>
                    <TableCell>{product.product_type}</TableCell>
                    <TableCell>{inventoryLabel}</TableCell>
                    <TableCell>{trackLabel}</TableCell>
                    <TableCell className="font-mono">{siteLabel}</TableCell>
                    <TableCell className={`font-mono ${qtyClass}`}>
                      {Number.isFinite(qtyValue) ? qtyValue : "-"}
                    </TableCell>
                    <TableCell>{unit}</TableCell>
                    {siteId && locList.length > 0 ? (
                      <TableCell
                        className={sinUbicacion ? "text-amber-600 font-medium" : ""}
                        title={sinUbicacion ? "Producto con stock sin LOC asignada" : undefined}
                      >
                        {ubicacionesLabel ?? "-"}
                      </TableCell>
                    ) : null}
                    <TableCell className="font-mono">
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




