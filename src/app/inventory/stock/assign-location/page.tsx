import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Table, TableCell, TableHeaderCell } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { safeDecodeURIComponent } from "@/lib/url";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type SearchParams = {
  site_id?: string;
  assigned?: string;
  error?: string;
};

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
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
  unit: string | null;
  stock_unit_code: string | null;
};

type StockRow = {
  product_id: string;
  current_qty: number | null;
};

type StockByLocRow = {
  product_id: string;
  current_qty: number | null;
};

function parseQuantity(value: FormDataEntryValue | null): number {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQty(value: number) {
  return value.toLocaleString("es-CO", { maximumFractionDigits: 3 });
}

async function assignStockToLocationAction(formData: FormData) {
  "use server";

  const siteId = String(formData.get("site_id") ?? "").trim();
  const productId = String(formData.get("product_id") ?? "").trim();
  const locationId = String(formData.get("location_id") ?? "").trim();
  const quantity = parseQuantity(formData.get("quantity"));
  const returnTo = `/inventory/stock/assign-location${siteId ? `?site_id=${encodeURIComponent(siteId)}` : ""}`;

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo,
    permissionCode: PERMISSION,
  });

  if (!siteId || !productId || !locationId || quantity <= 0) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("Completa producto, LOC y cantidad mayor a cero.")}`);
  }

  const { error } = await supabase.rpc("assign_inventory_stock_to_location", {
    p_site_id: siteId,
    p_product_id: productId,
    p_location_id: locationId,
    p_quantity: quantity,
    p_created_by: user.id,
    p_note: null,
  });

  if (error) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/stock/assign-location");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}assigned=1`);
}

export default async function AssignStockLocationPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const returnTo = "/inventory/stock/assign-location";

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
  const siteIds = employeeSiteRows.map((row) => row.site_id).filter((id): id is string => Boolean(id));
  const defaultSiteId = siteIds[0] ?? "";
  const siteId = String(sp.site_id ?? defaultSiteId).trim();

  const { data: sitesData } = siteIds.length
    ? await supabase.from("sites").select("id,name").in("id", siteIds).order("name", { ascending: true })
    : { data: [] as SiteRow[] };
  const sites = (sitesData ?? []) as SiteRow[];
  const siteName = sites.find((site) => site.id === siteId)?.name ?? "Sede";

  const { data: locsData } =
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
  const locs = (locsData ?? []) as LocRow[];
  const locIds = locs.map((loc) => loc.id);

  const { data: siteStockData } =
    siteId && siteIds.includes(siteId)
      ? await supabase
          .from("inventory_stock_by_site")
          .select("product_id,current_qty")
          .eq("site_id", siteId)
          .gt("current_qty", 0)
      : { data: [] as StockRow[] };
  const siteStockRows = (siteStockData ?? []) as StockRow[];
  const productIds = siteStockRows.map((row) => row.product_id);

  const { data: locStockData } =
    locIds.length > 0 && productIds.length > 0
      ? await supabase
          .from("inventory_stock_by_location")
          .select("product_id,current_qty")
          .in("location_id", locIds)
          .in("product_id", productIds)
      : { data: [] as StockByLocRow[] };
  const assignedByProduct = new Map<string, number>();
  for (const row of (locStockData ?? []) as StockByLocRow[]) {
    assignedByProduct.set(row.product_id, (assignedByProduct.get(row.product_id) ?? 0) + Number(row.current_qty ?? 0));
  }

  const unassignedProductIds = siteStockRows
    .filter((row) => Number(row.current_qty ?? 0) - Number(assignedByProduct.get(row.product_id) ?? 0) > 0.000001)
    .map((row) => row.product_id);

  const { data: productsData } = unassignedProductIds.length
    ? await supabase
        .from("products")
        .select("id,name,unit,stock_unit_code")
        .in("id", unassignedProductIds)
        .order("name", { ascending: true })
    : { data: [] as ProductRow[] };
  const products = (productsData ?? []) as ProductRow[];
  const productById = new Map(products.map((product) => [product.id, product]));

  const rows = siteStockRows
    .map((stock) => {
      const product = productById.get(stock.product_id);
      const total = Number(stock.current_qty ?? 0);
      const assigned = Number(assignedByProduct.get(stock.product_id) ?? 0);
      const unassigned = Math.max(0, total - assigned);
      return {
        product,
        productId: stock.product_id,
        unassigned,
        unit: product?.stock_unit_code ?? product?.unit ?? "un",
      };
    })
    .filter((row) => row.product && row.unassigned > 0.000001);

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid">
          <div>
            <Link href="/inventory/stock" className="ui-caption underline">
              Volver a stock
            </Link>
            <h1 className="mt-4 text-3xl font-semibold text-[var(--ui-text)]">
              Asignar stock sin area
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-muted)] sm:text-base">
              Toma stock que ya existe en la sede y lo ubica dentro de un LOC sin duplicar el total.
            </p>
          </div>
          <div className="ui-remission-kpis">
            <div className="ui-remission-kpi">
              <div className="ui-remission-kpi-label">Sede</div>
              <div className="ui-remission-kpi-value text-2xl">{siteName}</div>
              <div className="ui-remission-kpi-note">Origen del stock global</div>
            </div>
            <div className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Pendientes</div>
              <div className="ui-remission-kpi-value">{rows.length}</div>
              <div className="ui-remission-kpi-note">Productos con saldo sin LOC</div>
            </div>
          </div>
        </div>
      </section>

      {sp.assigned === "1" ? (
        <div className="ui-alert ui-alert--success">Stock asignado al LOC. El total de la sede no cambio.</div>
      ) : null}
      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}

      <div className="ui-panel ui-remission-section">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[260px] flex-col gap-1">
            <span className="ui-label">Sede</span>
            <select name="site_id" defaultValue={siteId} className="ui-input">
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
          </label>
          <button className="ui-btn ui-btn--brand" type="submit">
            Cambiar sede
          </button>
        </form>
      </div>

      <div className="ui-panel ui-remission-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Stock pendiente de ubicar</div>
            <div className="mt-1 ui-body-muted">Selecciona el LOC destino y la cantidad que realmente quieres ubicar.</div>
          </div>
          <span className="ui-chip ui-chip--warn">{locs.length} LOCs activos</span>
        </div>

        <div className="ui-scrollbar-subtle mt-4 max-h-[70vh] overflow-x-auto overflow-y-auto">
          <Table className="min-w-[860px] table-auto [&_th]:pr-4 [&_td]:pr-4">
            <thead>
              <tr>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell className="text-right">Sin area</TableHeaderCell>
                <TableHeaderCell>Destino</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.productId} className="ui-body">
                  <TableCell className="font-medium text-[var(--ui-text)]">{row.product?.name}</TableCell>
                  <TableCell className="font-mono text-right whitespace-nowrap">
                    {formatQty(row.unassigned)} {row.unit}
                  </TableCell>
                  <TableCell>
                    <form action={assignStockToLocationAction} className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_130px_auto]">
                      <input type="hidden" name="site_id" value={siteId} />
                      <input type="hidden" name="product_id" value={row.productId} />
                      <select name="location_id" className="ui-input" required defaultValue="">
                        <option value="" disabled>
                          Selecciona LOC
                        </option>
                        {locs.map((loc) => (
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

              {rows.length === 0 ? (
                <tr>
                  <TableCell className="ui-empty" colSpan={3}>
                    No hay stock sin LOC para esta sede.
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
