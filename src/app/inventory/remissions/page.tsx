import Link from "next/link";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";
import { createClient } from "@/lib/supabase/server";
import { RemissionsCreateForm } from "@/components/vento/remissions-create-form";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { normalizeUnitCode, roundQuantity } from "@/lib/inventory/uom";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";

const PERMISSIONS = {
  remissionsRequest: "inventory.remissions.request",
  remissionsAllSites: "inventory.remissions.all_sites",
};

type SearchParams = {
  error?: string;
  ok?: string;
  site_id?: string;
  from_site_id?: string;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

type AreaRow = {
  id: string;
  name: string | null;
  kind: string | null;
  site_id: string | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
};

type ProductSiteRow = {
  product_id: string;
  is_active: boolean | null;
  default_area_kind: string | null;
};

/** Filas de product_inventory_profiles con el join a products(id,name,unit) */
type ProductProfileWithProduct = {
  product_id: string;
  products: ProductRow | null;
};

type RemissionRow = {
  id: string;
  created_at: string | null;
  status: string | null;
  from_site_id: string | null;
  to_site_id: string | null;
  notes: string | null;
};

function formatStatus(status?: string | null) {
  const value = String(status ?? "").trim();
  switch (value) {
    case "pending":
      return { label: "Pendiente", className: "ui-chip ui-chip--warn" };
    case "preparing":
      return { label: "Preparando", className: "ui-chip ui-chip--brand" };
    case "in_transit":
      return { label: "En tránsito", className: "ui-chip ui-chip--warn" };
    case "partial":
      return { label: "Parcial", className: "ui-chip ui-chip--warn" };
    case "received":
      return { label: "Recibida", className: "ui-chip ui-chip--success" };
    case "closed":
      return { label: "Cerrada", className: "ui-chip ui-chip--success" };
    case "cancelled":
      return { label: "Cancelada", className: "ui-chip" };
    default:
      return { label: value || "Sin estado", className: "ui-chip" };
  }
}

async function createRemission(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/remissions"));
  }
  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const actualRole = String(employee?.role ?? "");

  const fromSiteId = asText(formData.get("from_site_id"));
  const toSiteId = asText(formData.get("to_site_id"));
  const expectedDate = asText(formData.get("expected_date"));
  const notes = asText(formData.get("notes"));

  const productIds = formData.getAll("item_product_id").map((v) => String(v).trim());
  const quantities = formData.getAll("item_quantity").map((v) => String(v).trim());
  const inputUnits = formData
    .getAll("item_input_unit_code")
    .map((v) => normalizeUnitCode(String(v).trim()));
  const areaKinds = formData.getAll("item_area_kind").map((v) => String(v).trim());

  const productIdsForLookup = Array.from(new Set(productIds.filter(Boolean)));
  const { data: productsData } = productIdsForLookup.length
    ? await supabase
        .from("products")
        .select("id,unit,stock_unit_code")
        .in("id", productIdsForLookup)
    : { data: [] as ProductRow[] };
  const productMap = new Map(
    ((productsData ?? []) as ProductRow[]).map((product) => [product.id, product])
  );

  const items = productIds
    .map((productId, idx) => {
      const product = productMap.get(productId);
      const stockUnitCode = normalizeUnitCode(product?.stock_unit_code || product?.unit || "un");
      return {
        product_id: productId,
        quantity: roundQuantity(parseNumber(quantities[idx] ?? "0")),
        unit: stockUnitCode,
        input_unit_code: normalizeUnitCode(inputUnits[idx] || stockUnitCode),
        stock_unit_code: stockUnitCode,
        production_area_kind: areaKinds[idx] || null,
      };
    })
    .filter((item) => item.product_id && item.quantity > 0);

  if (!toSiteId || !fromSiteId) {
    redirect("/inventory/remissions?error=" + encodeURIComponent("Debes definir origen y destino."));
  }

  const canRequest = await checkPermissionWithRoleOverride({
    supabase,
    appId: APP_ID,
    code: PERMISSIONS.remissionsRequest,
    context: { siteId: toSiteId },
    actualRole,
  });
  if (!canRequest) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("No tienes permiso para solicitar remisiones.")
    );
  }

  const { data: toSite } = await supabase
    .from("sites")
    .select("site_type")
    .eq("id", toSiteId)
    .single();

  if (String(toSite?.site_type ?? "") !== "satellite") {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("Solo sedes satélite pueden solicitar remisiones.")
    );
  }

  if (items.length === 0) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("Agrega al menos un producto con cantidad mayor a 0.")
    );
  }

  const { data: request, error: requestErr } = await supabase
    .from("restock_requests")
    .insert({
      status: "pending",
      created_by: user.id,
      from_site_id: fromSiteId,
      to_site_id: toSiteId,
      requested_by_site_id: toSiteId,
      from_location: `site:${fromSiteId}`,
      to_location: `site:${toSiteId}`,
      expected_date: expectedDate || null,
      notes: notes || null,
      status_updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (requestErr || !request) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(requestErr?.message ?? "No se pudo crear la remisión.")
    );
  }

  const payload = items.map((item) => ({
    request_id: request.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit: item.unit,
    input_qty: item.quantity,
    input_unit_code: item.input_unit_code,
    conversion_factor_to_stock: 1,
    stock_unit_code: item.stock_unit_code,
    production_area_kind: item.production_area_kind,
  }));

  const { error: itemsErr } = await supabase.from("restock_request_items").insert(payload);
  if (itemsErr) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(itemsErr.message ?? "No se pudieron crear los items.")
    );
  }

  let hasLowStock = false;
  const { data: stockRows } = await supabase
    .from("inventory_stock_by_site")
    .select("product_id,current_qty")
    .eq("site_id", fromSiteId)
    .in("product_id", items.map((i) => i.product_id));
  const stockMap = new Map(
    (stockRows ?? []).map((r: { product_id: string; current_qty: number | null }) => [
      r.product_id,
      Number(r.current_qty ?? 0),
    ])
  );
  for (const item of items) {
    const available = stockMap.get(item.product_id) ?? 0;
    if (available < item.quantity) {
      hasLowStock = true;
      break;
    }
  }

  const params = new URLSearchParams({ ok: "created" });
  if (hasLowStock) params.set("warning", "low_stock");
  redirect(`/inventory/remissions/${request.id}?${params.toString()}`);
}

export default async function RemissionsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";
  const okMsg = sp.ok ? decodeURIComponent(sp.ok) : "";

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/remissions",
    permissionCode: "inventory.remissions",
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("site_id,role")
    .eq("id", user.id)
    .single();

  const actualRole = String(employee?.role ?? "");
  const canViewAll = await checkPermissionWithRoleOverride({
    supabase,
    appId: APP_ID,
    code: PERMISSIONS.remissionsAllSites,
    actualRole,
  });

  const { data: sitesRows } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(50);

  const employeeSiteRows = (sitesRows ?? []) as EmployeeSiteRow[];
  const defaultSiteId = employeeSiteRows[0]?.site_id ?? employee?.site_id ?? "";
  let activeSiteId =
    sp.site_id !== undefined ? String(sp.site_id).trim() : canViewAll ? "" : defaultSiteId;
  if (!activeSiteId && !canViewAll) {
    activeSiteId = defaultSiteId;
  }

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
  const siteMap = new Map(siteRows.map((site) => [site.id, site]));
  const activeSite = activeSiteId ? siteMap.get(activeSiteId) : undefined;
  const isAllSites = !activeSiteId && canViewAll;
  const activeSiteName = isAllSites ? "Todas las sedes" : activeSite?.name ?? activeSiteId;
  const activeSiteType = String(activeSite?.site_type ?? "");
  const isProductionCenter = activeSiteType === "production_center";

  const canRequestPermission = activeSiteId
    ? await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsRequest,
        context: { siteId: activeSiteId },
        actualRole,
      })
    : false;

  const viewMode = isAllSites ? "all" : isProductionCenter ? "bodega" : "satélite";
  const canCreate = viewMode === "satélite" && canRequestPermission;

  const { data: routes } = await supabase
    .from("site_supply_routes")
    .select("fulfillment_site_id")
    .eq("requesting_site_id", activeSiteId)
    .eq("is_active", true)
    .limit(1);

  const fulfillmentSiteIds = (routes ?? [])
    .map((route: { fulfillment_site_id: string | null }) => route.fulfillment_site_id)
    .filter((id: string | null): id is string => Boolean(id));

  const { data: fulfillmentSites } = fulfillmentSiteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", fulfillmentSiteIds)
        .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  let fulfillmentSiteRows = (fulfillmentSites ?? []) as SiteRow[];
  if (activeSiteId && fulfillmentSiteRows.length === 0) {
    const { data: fallbackSites } = await supabase
      .from("sites")
      .select("id,name,site_type")
      .eq("site_type", "production_center")
      .order("name", { ascending: true })
      .limit(50);
    fulfillmentSiteRows = (fallbackSites ?? []) as SiteRow[];
  }
  const requestedFromSiteId = sp.from_site_id ? String(sp.from_site_id).trim() : "";
  const selectedFromSiteId =
    requestedFromSiteId && fulfillmentSiteRows.some((site) => site.id === requestedFromSiteId)
      ? requestedFromSiteId
      : fulfillmentSiteRows[0]?.id ?? "";
  let remissionsQuery = supabase
    .from("restock_requests")
    .select("id, created_at, status, from_site_id, to_site_id, notes")
    .order("created_at", { ascending: false })
    .limit(50);

  if (activeSiteId) {
    remissionsQuery =
      viewMode === "bodega"
        ? remissionsQuery.eq("from_site_id", activeSiteId)
        : remissionsQuery.eq("to_site_id", activeSiteId);
  }

  const { data: remissions } = await remissionsQuery;
  const remissionRows = (remissions ?? []) as RemissionRow[];

  const areaFilterSiteId = canCreate ? activeSiteId : selectedFromSiteId;
  const { data: areas } = areaFilterSiteId
    ? await supabase
        .from("areas")
        .select("id,name,kind,site_id")
        .eq("site_id", areaFilterSiteId)
        .order("name", { ascending: true })
    : { data: [] as AreaRow[] };

  const areaRows = (areas ?? []) as AreaRow[];
  const areaOptions = Array.from(
    areaRows.reduce((map, row) => {
      const key = String(row.kind ?? "").trim();
      if (!key) return map;
      if (!map.has(key)) {
        map.set(key, {
          value: key,
          label: row.name ?? key,
        });
      }
      return map;
    }, new Map<string, { value: string; label: string }>())
  ).map(([, value]) => value);

  // Insumos por satélite: filtrar por sede DESTINO (Saudo), no por sede origen (Centro).
  // Cuando el satélite solicita, solo debe ver productos configurados para su sede.
  const productFilterSiteId = canCreate ? activeSiteId : selectedFromSiteId;
  const { data: productSites } = productFilterSiteId
    ? await supabase
        .from("product_site_settings")
        .select("product_id,is_active,default_area_kind")
        .eq("site_id", productFilterSiteId)
        .eq("is_active", true)
    : { data: [] as ProductSiteRow[] };

  const productSiteRows = (productSites ?? []) as ProductSiteRow[];
  const productSiteIds = productSiteRows.map((row) => row.product_id);
  const hasProductSiteFilter = productSiteIds.length > 0;

  let productsQuery = supabase
    .from("product_inventory_profiles")
    .select("product_id, products(id,name,unit,stock_unit_code)")
    .eq("track_inventory", true)
    .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
    .order("name", { foreignTable: "products", ascending: true })
    .limit(400);

  if (hasProductSiteFilter) {
    productsQuery = productsQuery.in("product_id", productSiteIds);
  }

  const { data: products } = await productsQuery;
  let productRows = ((products ?? []) as unknown as ProductProfileWithProduct[])
    .map((row) => row.products)
    .filter((r): r is ProductRow => Boolean(r));

  if (productRows.length === 0) {
    let fallbackQuery = supabase
      .from("products")
      .select("id,name,unit,stock_unit_code")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(400);
    if (hasProductSiteFilter) {
      fallbackQuery = fallbackQuery.in("id", productSiteIds);
    }
    const { data: fallbackProducts } = await fallbackQuery;
    productRows = (fallbackProducts ?? []) as unknown as ProductRow[];
  }

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Remisiones</h1>
          <p className="mt-2 ui-body-muted">
            Flujo interno entre sedes. Satélites solicitan, bodega prepara y se recibe en destino.
          </p>
        </div>
        {isProductionCenter ? (
          <Link
            href="/inventory/remissions/prepare"
            className="ui-btn ui-btn--brand"
          >
            Preparar remisiones
          </Link>
        ) : null}
      </div>

      {errorMsg ? (
        <div className="mt-6 ui-alert ui-alert--error">
          Error: {errorMsg}
        </div>
      ) : null}

      {okMsg ? (
        <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div>
      ) : null}

      <div className="mt-6 ui-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Sede activa</div>
            <div className="mt-1 ui-caption">
              Vista:{" "}
              {viewMode === "all"
                ? "Todas las sedes"
                : viewMode === "bodega"
                  ? "Bodega (Centro)"
                  : "Sede satélite"}
            </div>
          </div>
          <form method="get" className="flex items-center gap-3">
            <select
              name="site_id"
              defaultValue={activeSiteId}
              className="ui-input"
            >
              {canViewAll ? <option value="">Todas las sedes</option> : null}
              {employeeSiteRows.map((row) => {
                const siteId = row.site_id ?? "";
                if (!siteId) return null;
                const site = siteMap.get(siteId);
                const label = site?.name ? `${site.name}` : siteId;
                const suffix = row.is_primary ? " (principal)" : "";
                return (
                  <option key={siteId} value={siteId}>
                    {label}
                    {suffix}
                  </option>
                );
              })}
            </select>
            <button className="ui-btn ui-btn--ghost">
              Cambiar
            </button>
          </form>
        </div>

        {!activeSiteId ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            {canViewAll
              ? "Vista global activa. Selecciona una sede para operar remisiones."
              : "No hay sede activa. Asigna una sede al empleado para operar remisiones."}
          </div>
        ) : null}

        {!canCreate && viewMode === "satélite" ? (
          <div className="mt-4 ui-alert ui-alert--neutral">
            Esta vista es para sedes satélite. Tu rol actual no puede crear remisiones.
          </div>
        ) : null}

        {canCreate && activeSiteId && fulfillmentSiteIds.length === 0 ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            No hay rutas de abastecimiento para {activeSiteName}. Configúralas en{" "}
            <Link href="/inventory/settings/supply-routes" className="font-semibold underline">
              Configuración → Rutas de abastecimiento
            </Link>
            .
          </div>
        ) : null}

        {canCreate && productRows.length === 0 ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            No hay insumos configurados para {activeSiteName}. Añade la sede en{" "}
            <Link href="/inventory/catalog" className="font-semibold underline">
              Catálogo
            </Link>
            → ficha del producto → Sedes.
          </div>
        ) : null}

        {canCreate ? (
          <div className="mt-4">
            <RemissionsCreateForm
              action={createRemission}
              toSiteId={activeSiteId}
              toSiteName={activeSiteName}
              fromSiteOptions={fulfillmentSiteRows.map((site) => ({
                id: site.id,
                name: site.name ?? site.id,
              }))}
              defaultFromSiteId={selectedFromSiteId}
              products={productRows}
              areaOptions={areaOptions}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-6 ui-panel">
        <div className="ui-h3">
          {viewMode === "bodega" ? "Solicitudes para preparar" : "Solicitudes enviadas"}
        </div>
        <div className="mt-1 ui-body-muted">
          Mostrando hasta 50 solicitudes recientes.
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Origen</TableHeaderCell>
                <TableHeaderCell>Destino</TableHeaderCell>
                <TableHeaderCell>Notas</TableHeaderCell>
                <TableHeaderCell>Acciones</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {remissionRows.map((row) => {
                const fromSiteId = row.from_site_id ?? "";
                const toSiteId = row.to_site_id ?? "";
                return (
                  <tr key={row.id} className="ui-body">
                    <TableCell className="font-mono">
                      {row.created_at ?? ""}
                    </TableCell>
                    <TableCell>
                      <span className={formatStatus(row.status).className}>
                        {formatStatus(row.status).label}
                      </span>
                    </TableCell>
                    <TableCell>
                      {siteMap.get(fromSiteId)?.name ?? fromSiteId}
                    </TableCell>
                    <TableCell>
                      {siteMap.get(toSiteId)?.name ?? toSiteId}
                    </TableCell>
                    <TableCell>{row.notes ?? ""}</TableCell>
                    <TableCell>
                      <Link
                        href={`/inventory/remissions/${row.id}`}
                        className="ui-body font-semibold underline decoration-zinc-200 underline-offset-4"
                      >
                        Ver detalle
                      </Link>
                    </TableCell>
                  </tr>
                );
              })}

              {!remissions?.length ? (
                <tr>
                  <TableCell colSpan={6} className="ui-empty">
                    No hay remisiones todavía.
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
