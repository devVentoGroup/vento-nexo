import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { PageHeader } from "@/components/vento/standard/page-header";

import { AdjustForm } from "@/features/inventory/adjust/adjust-form";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.adjustments";


type SearchParams = { site_id?: string };

type EmployeeSiteRow = { site_id: string | null; is_primary: boolean | null };
type SiteRow = { id: string; name: string | null };
type ProductRow = { id: string; name: string; sku: string | null; unit: string | null };
type ProductSiteRow = { product_id: string; is_active: boolean | null };
type StockRow = { product_id: string; current_qty: number | null };

export default async function InventoryAdjustPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const returnTo = "/inventory/adjust";
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
  const siteIds = employeeSiteRows
    .map((r) => r.site_id)
    .filter((id): id is string => Boolean(id));

  const { data: sites } =
    siteIds.length > 0
      ? await supabase
          .from("sites")
          .select("id,name")
          .in("id", siteIds)
          .order("name", { ascending: true })
      : { data: [] as SiteRow[] };

  const siteRows = (sites ?? []) as SiteRow[];
  const siteNameMap = new Map(siteRows.map((r) => [r.id, r.name ?? r.id]));

  const siteId = String(sp.site_id ?? "").trim();

  if (!siteId) {
    return (
      <div className="w-full">
        <PageHeader
          title="Ajustes"
          subtitle="Ajustes manuales con motivo, permisos y evidencia opcional."
        />

        <div className="mt-6 ui-panel">
          <div className="ui-h3">Paso 1: elegir sede</div>
          <form method="get" action="/inventory/adjust" className="mt-4">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Sede</span>
              <select
                name="site_id"
                className="ui-input max-w-xs"
                required
              >
                <option value="">Selecciona una sede</option>
                {siteRows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {siteNameMap.get(s.id) ?? s.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                className="ui-btn ui-btn--brand"
              >
                Continuar
              </button>
              <Link
                href="/inventory/stock"
                className="ui-btn ui-btn--ghost"
              >
                Ver stock
              </Link>
            </div>
          </form>
        </div>

        {siteRows.length === 0 ? (
          <p className="mt-4 ui-body-muted">No tienes sedes asignadas. Contacta al administrador.</p>
        ) : null}
      </div>
    );
  }

  // Paso 2: productos y formulario
  const { data: productSites } = await supabase
    .from("product_site_settings")
    .select("product_id,is_active")
    .eq("site_id", siteId)
    .eq("is_active", true);

  const productSiteRows = (productSites ?? []) as ProductSiteRow[];
  const productSiteIds = productSiteRows.map((r) => r.product_id);
  const hasProductSiteFilter = productSiteIds.length > 0;

  let productsQuery = supabase
    .from("products")
    .select("id,name,sku,unit,product_inventory_profiles(track_inventory)")
    .eq("product_inventory_profiles.track_inventory", true)
    .order("name", { ascending: true })
    .limit(500);

  if (hasProductSiteFilter) {
    productsQuery = productsQuery.in("id", productSiteIds);
  }

  const { data: products, error: productError } = await productsQuery;
  const productRows = (products ?? []) as unknown as ProductRow[];

  // Obtener stock actual para los productos
  const { data: stockData } =
    productRows.length > 0
      ? await supabase
          .from("inventory_stock_by_site")
          .select("product_id,current_qty")
          .eq("site_id", siteId)
          .in("product_id", productRows.map((p) => p.id))
      : { data: [] as StockRow[] };

  const stockRows = (stockData ?? []) as StockRow[];
  const currentStock = Object.fromEntries(
    stockRows.map((r) => [r.product_id, r.current_qty ?? 0])
  );

  const siteName = siteNameMap.get(siteId) ?? siteId;

  return (
    <div className="w-full">
      <PageHeader
        title="Ajustes"
        subtitle={`Sede: ${siteName}. Registra ajustes manuales con motivo y trazabilidad.`}
        actions={
          <Link href="/inventory/stock" className="ui-btn ui-btn--ghost">
            Ver stock
          </Link>
        }
      />

      {productError ? (
        <div className="mt-6 ui-alert ui-alert--error">
          Error al cargar productos: {productError.message}
        </div>
      ) : productRows.length === 0 ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          No hay productos con inventario trackeado para esta sede. Revisa el catálogo y
          product_site_settings, o &quot;Inventario &gt; Stock&quot; para ver el filtro por sede.
        </div>
      ) : (
        <AdjustForm
          products={productRows.map((p) => ({ id: p.id, name: p.name, sku: p.sku, unit: p.unit }))}
          siteId={siteId}
          siteName={siteName}
          currentStock={currentStock}
        />
      )}
    </div>
  );
}

