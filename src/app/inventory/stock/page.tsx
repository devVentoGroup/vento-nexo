import Link from "next/link";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";

import { requireAppAccess } from "@/lib/auth/guard";
import { getCategoryDomainLabel } from "@/lib/constants";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type SearchParams = {
  site_id?: string;
  q?: string;
  product_type?: string;
  inventory_kind?: string;
  category_id?: string;
  category_domain?: string;
  location_id?: string;
  zone?: string;
  error?: string;
  count_initial?: string;
  adjust?: string;
};

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  domain: string | null;
};

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

export default async function InventoryStockPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";

  const returnTo = "/inventory/stock";
  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo,
    permissionCode: PERMISSION,
  });

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
  const categoryId = String(sp.category_id ?? "").trim();
  const categoryDomain = String(sp.category_domain ?? "").trim();
  const locationIdFilter = String(sp.location_id ?? "").trim();
  const zoneFilter = String(sp.zone ?? "").trim();

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

  const { data: categories } = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain")
    .order("name", { ascending: true });

  const allCategoryRows = (categories ?? []) as CategoryRow[];
  const categoryMap = new Map(allCategoryRows.map((row) => [row.id, row]));

  const categoryPath = (id: string | null) => {
    if (!id) return "Sin categoria";
    const parts: string[] = [];
    let current = categoryMap.get(id);
    let safety = 0;
    while (current && safety < 6) {
      parts.unshift(current.name);
      current = current.parent_id ? categoryMap.get(current.parent_id) : undefined;
      safety += 1;
    }
    return parts.join(" / ");
  };

  const categoryRows = (() => {
    if (!categoryDomain) return allCategoryRows;
    const withDomain = allCategoryRows.filter((row) => row.domain === categoryDomain);
    const ancestorIds = new Set<string>();
    for (const row of withDomain) {
      let current = row.parent_id ? categoryMap.get(row.parent_id) : null;
      let safety = 0;
      while (current && safety < 10) {
        ancestorIds.add(current.id);
        current = current.parent_id ? categoryMap.get(current.parent_id) : null;
        safety += 1;
      }
    }
    return allCategoryRows.filter((row) => row.domain === categoryDomain || ancestorIds.has(row.id));
  })();

  const displayPath = (row: CategoryRow) => {
    const path = categoryPath(row.id);
    const label = row.domain ? getCategoryDomainLabel(row.domain) : "";
    return label ? `${path} (${label})` : path;
  };

  const orderedCategories = categoryRows
    .map((row) => ({
      id: row.id,
      path: displayPath(row),
    }))
    .sort((a, b) => a.path.localeCompare(b.path, "es"));

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

  const categoryDomainOptions = [
    { value: "", label: "Todas las marcas" },
    { value: "SAU", label: "Saudo" },
    { value: "VCF", label: "Vento Café" },
  ];

  const filteredCategoryIds =
    categoryDomain ? allCategoryRows.filter((r) => r.domain === categoryDomain).map((r) => r.id) : [];

  const buildKindHref = (kind: string) => {
    const params = new URLSearchParams();
    if (siteId) params.set("site_id", siteId);
    if (searchQuery) params.set("q", searchQuery);
    if (productType) params.set("product_type", productType);
    if (categoryId) params.set("category_id", categoryId);
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
      "id,name,sku,unit,product_type,category_id,product_inventory_profiles(track_inventory,inventory_kind)"
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

  if (categoryId) {
    productsQuery = productsQuery.eq("category_id", categoryId);
  } else if (categoryDomain && filteredCategoryIds.length > 0) {
    productsQuery = productsQuery.in("category_id", filteredCategoryIds);
  }

  if (inventoryKind) {
    productsQuery = productsQuery.eq("product_inventory_profiles.inventory_kind", inventoryKind);
  }

  if (hasProductSiteFilter) {
    productsQuery = productsQuery.in("id", productSiteIds);
  }

  const { data: products, error: productError } = await productsQuery;
  let productRows = (products ?? []) as ProductRow[];

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
  const locById = new Map(locList.map((l) => [l.id, l]));

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

        <div className="flex gap-2">
          <Link
            href="/inventory/count-initial"
            className="ui-btn ui-btn--brand"
          >
            Conteo inicial
          </Link>
          <Link
            href="/inventory/movements"
            className="ui-btn ui-btn--ghost"
          >
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
            <select
              name="inventory_kind"
              defaultValue={inventoryKind}
              className="ui-input"
            >
              {inventoryKindOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Tipo de producto</span>
            <select
              name="product_type"
              defaultValue={productType}
              className="ui-input"
            >
              {productTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Marca / punto de venta</span>
            <select
              name="category_domain"
              defaultValue={categoryDomain}
              className="ui-input"
            >
              {categoryDomainOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Categoria</span>
            <select
              name="category_id"
              defaultValue={categoryId}
              className="ui-input"
            >
              <option value="">Todas</option>
              {orderedCategories.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.path}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
            <span className="ui-label">Sede</span>
            <select
              name="site_id"
              defaultValue={siteId}
              className="ui-input"
            >
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
                <span className="ui-label">Ubicación (LOC)</span>
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

          <div className="sm:col-span-2 lg:col-span-4">
            <button className="ui-btn ui-btn--brand">
              Aplicar filtros
            </button>
          </div>
        </form>
      </div>

      {hasError ? (
        <div className="mt-6 ui-alert ui-alert--error">
          Fallo el SELECT de inventario: {productError?.message ?? stockError?.message}
        </div>
      ) : null}

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
                const unit = product.unit ?? "-";
                const siteLabel = siteId ? siteNameMap.get(siteId) ?? siteId : "Todas";
                const categoryLabel = categoryPath(product.category_id);
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
    </div>
  );
}


