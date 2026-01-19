import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";

export const dynamic = "force-dynamic";

type SearchParams = {
  error?: string;
  ok?: string;
  site_id?: string;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const ADMIN_ROLES = new Set(["propietario", "gerente_general", "gerente"]);
const REQUEST_ROLES = new Set(["cajero", "barista", "cocinero"]);

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
    .single();

  const role = String(employee?.role ?? "");
  const isAdminRole = ADMIN_ROLES.has(role);
  const canRequestRole = REQUEST_ROLES.has(role);

  if (!isAdminRole && !canRequestRole) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("No tienes permiso para solicitar remisiones.")
    );
  }

  const fromSiteId = asText(formData.get("from_site_id"));
  const toSiteId = asText(formData.get("to_site_id"));
  const expectedDate = asText(formData.get("expected_date"));
  const notes = asText(formData.get("notes"));

  const productIds = formData.getAll("item_product_id").map((v) => String(v).trim());
  const quantities = formData.getAll("item_quantity").map((v) => String(v).trim());
  const units = formData.getAll("item_unit").map((v) => String(v).trim());
  const areaKinds = formData.getAll("item_area_kind").map((v) => String(v).trim());

  const items = productIds
    .map((productId, idx) => ({
      product_id: productId,
      quantity: parseNumber(quantities[idx] ?? "0"),
      unit: units[idx] || null,
      production_area_kind: areaKinds[idx] || null,
    }))
    .filter((item) => item.product_id && item.quantity > 0);

  if (!toSiteId || !fromSiteId) {
    redirect("/inventory/remissions?error=" + encodeURIComponent("Debes definir origen y destino."));
  }

  const { data: toSite } = await supabase
    .from("sites")
    .select("site_type")
    .eq("id", toSiteId)
    .single();

  if (String(toSite?.site_type ?? "") !== "satellite") {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("Solo sedes satelite pueden solicitar remisiones.")
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
        encodeURIComponent(requestErr?.message ?? "No se pudo crear la remision.")
    );
  }

  const payload = items.map((item) => ({
    request_id: request.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit: item.unit,
    production_area_kind: item.production_area_kind,
  }));

  const { error: itemsErr } = await supabase.from("restock_request_items").insert(payload);
  if (itemsErr) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(itemsErr.message ?? "No se pudieron crear los items.")
    );
  }

  redirect(`/inventory/remissions/${request.id}?ok=created`);
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
    appId: "nexo",
    returnTo: "/inventory/remissions",
    permissionCode: "inventory.remissions",
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("role,site_id")
    .eq("id", user.id)
    .single();

  const role = String(employee?.role ?? "");
  const isAdminRole = ADMIN_ROLES.has(role);
  const canRequestRole = REQUEST_ROLES.has(role);
  const isBodegaRole = role === "bodeguero";

  const { data: sitesRows } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(50);

  const defaultSiteId = sitesRows?.[0]?.site_id ?? employee?.site_id ?? "";
  let activeSiteId =
    sp.site_id !== undefined ? String(sp.site_id).trim() : isAdminRole ? "" : defaultSiteId;
  if (!activeSiteId && !isAdminRole) {
    activeSiteId = defaultSiteId;
  }

  const siteIds = (sitesRows ?? [])
    .map((row) => row.site_id)
    .filter((id): id is string => Boolean(id));

  const { data: sites } = siteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", siteIds)
        .order("name", { ascending: true })
    : { data: [] as Array<{ id: string; name: string | null; site_type: string | null }> };

  const siteMap = new Map((sites ?? []).map((site) => [site.id, site]));
  const activeSite = activeSiteId ? siteMap.get(activeSiteId) : undefined;
  const isAllSites = !activeSiteId && isAdminRole;
  const activeSiteName = isAllSites ? "Todas las sedes" : activeSite?.name ?? activeSiteId;
  const activeSiteType = String(activeSite?.site_type ?? "");
  const isProductionCenter = activeSiteType === "production_center";

  const viewMode = isAllSites ? "all" : isProductionCenter ? "bodega" : "satelite";
  const canCreate = viewMode === "satelite" && (canRequestRole || isAdminRole);
  const canPrepare = viewMode === "bodega" && (isBodegaRole || isAdminRole);

  const { data: routes } = await supabase
    .from("site_supply_routes")
    .select("fulfillment_site_id")
    .eq("requesting_site_id", activeSiteId)
    .eq("is_active", true)
    .limit(1);

  const defaultFromSiteId = routes?.[0]?.fulfillment_site_id ?? "";
  const hasDefaultFromSite = Boolean(defaultFromSiteId);

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

  const { data: areaKinds } = await supabase
    .from("area_kinds")
    .select("code, name")
    .order("code", { ascending: true });

  const { data: products } = await supabase
    .from("products")
    .select("id,name,unit")
    .order("name", { ascending: true })
    .limit(200);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Remisiones</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Flujo interno entre sedes. Satelites solicitan, bodega prepara y se recibe en destino.
          </p>
        </div>

        <Link
          href="/inventory/production-batches"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
        >
          Produccion manual
        </Link>
      </div>

      {errorMsg ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error: {errorMsg}
        </div>
      ) : null}

      {okMsg ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {okMsg}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Sede activa</div>
            <div className="mt-1 text-xs text-zinc-500">
              Vista:{" "}
              {viewMode === "all"
                ? "Todas las sedes"
                : viewMode === "bodega"
                  ? "Bodega (Centro)"
                  : "Sede satelite"}
            </div>
          </div>
          <form method="get" className="flex items-center gap-3">
            <select
              name="site_id"
              defaultValue={activeSiteId}
              className="h-10 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            >
              {isAdminRole ? <option value="">Todas las sedes</option> : null}
              {(sitesRows ?? []).map((row) => {
                const site = siteMap.get(row.site_id);
                const label = site?.name ? `${site.name}` : row.site_id;
                const suffix = row.is_primary ? " (principal)" : "";
                return (
                  <option key={row.site_id} value={row.site_id}>
                    {label}
                    {suffix}
                  </option>
                );
              })}
            </select>
            <button className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-3 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50">
              Cambiar
            </button>
          </form>
        </div>

        {!activeSiteId ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {isAdminRole
              ? "Vista global activa. Selecciona una sede para operar remisiones."
              : "No hay sede activa. Asigna una sede al empleado para operar remisiones."}
          </div>
        ) : null}

        {!canCreate && viewMode === "satelite" ? (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            Esta vista es para sedes satelite. Tu rol actual no puede crear remisiones.
          </div>
        ) : null}

        {canCreate ? (
          <form action={createRemission} className="mt-4 space-y-4">
            {hasDefaultFromSite ? (
              <input type="hidden" name="from_site_id" value={defaultFromSiteId} />
            ) : null}
            <input type="hidden" name="to_site_id" value={activeSiteId} />
          <div className="grid gap-3 md:grid-cols-2">
            {hasDefaultFromSite ? (
              <div className="flex flex-col gap-1 text-sm text-zinc-600">
                <span className="text-xs font-semibold">Sede origen (bodega)</span>
                <div className="h-11 rounded-xl bg-zinc-50 px-3 text-sm text-zinc-800 ring-1 ring-inset ring-zinc-200">
                  {siteMap.get(defaultFromSiteId)?.name ?? defaultFromSiteId}
                </div>
              </div>
            ) : (
              <label className="flex flex-col gap-1 text-sm text-zinc-600">
                <span className="text-xs font-semibold">Sede origen (bodega)</span>
                <input
                  name="from_site_id"
                  placeholder="UUID sede origen"
                  className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                />
              </label>
            )}

            <div className="flex flex-col gap-1 text-sm text-zinc-600">
              <span className="text-xs font-semibold">Sede destino (satelite)</span>
              <div className="h-11 rounded-xl bg-zinc-50 px-3 text-sm text-zinc-800 ring-1 ring-inset ring-zinc-200">
                {activeSiteName}
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-600">Fecha esperada</span>
              <input
                type="date"
                name="expected_date"
                className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-zinc-600">Notas</span>
              <input
                name="notes"
                placeholder="Notas para bodega"
                className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Items solicitados
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div
                key={`item-${idx}`}
                className="grid gap-3 rounded-xl border border-zinc-200 p-3 md:grid-cols-4"
              >
                <input
                  name="item_product_id"
                  placeholder="product_id"
                  list="product-options"
                  className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-200 focus:outline-none"
                />
                <input
                  name="item_quantity"
                  placeholder="Cantidad"
                  className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-200 focus:outline-none"
                />
                <input
                  name="item_unit"
                  placeholder="Unidad (ej: kg, un)"
                  className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-200 focus:outline-none"
                />
                <select
                  name="item_area_kind"
                  className="h-11 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-200 focus:outline-none"
                >
                  <option value="">Area (opcional)</option>
                  {(areaKinds ?? []).map((row) => (
                    <option key={row.code} value={row.code}>
                      {row.name ?? row.code}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <datalist id="product-options">
            {(products ?? []).map((product) => (
              <option
                key={product.id}
                value={product.id}
                label={`${product.name ?? "Producto"}${product.unit ? ` (${product.unit})` : ""}`}
              />
            ))}
          </datalist>

          <button className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800">
            Crear remision
          </button>
        </form>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">
          {viewMode === "bodega" ? "Solicitudes para preparar" : "Solicitudes enviadas"}
        </div>
        <div className="mt-1 text-sm text-zinc-600">
          Mostrando hasta 50 solicitudes recientes.
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                <th className="border-b border-zinc-200 pb-2">Fecha</th>
                <th className="border-b border-zinc-200 pb-2">Estado</th>
                <th className="border-b border-zinc-200 pb-2">Origen</th>
                <th className="border-b border-zinc-200 pb-2">Destino</th>
                <th className="border-b border-zinc-200 pb-2">Notas</th>
                <th className="border-b border-zinc-200 pb-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(remissions ?? []).map((row) => (
                <tr key={row.id} className="text-sm text-zinc-800">
                  <td className="border-b border-zinc-100 py-3 font-mono">{row.created_at}</td>
                  <td className="border-b border-zinc-100 py-3">{row.status}</td>
                  <td className="border-b border-zinc-100 py-3">
                    {siteMap.get(row.from_site_id ?? "")?.name ?? row.from_site_id}
                  </td>
                  <td className="border-b border-zinc-100 py-3">
                    {siteMap.get(row.to_site_id ?? "")?.name ?? row.to_site_id}
                  </td>
                  <td className="border-b border-zinc-100 py-3">{row.notes ?? ""}</td>
                  <td className="border-b border-zinc-100 py-3">
                    <Link
                      href={`/inventory/remissions/${row.id}`}
                      className="text-sm font-semibold text-zinc-900 underline decoration-zinc-200 underline-offset-4"
                    >
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}

              {!remissions?.length ? (
                <tr>
                  <td colSpan={6} className="py-6 text-sm text-zinc-500">
                    No hay remisiones todavia.
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
