import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { safeDecodeURIComponent } from "@/lib/url";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const VIEW_PERMISSION = "internal_prices.view";
const MANAGE_PERMISSION = "internal_prices.manage";
const PAGE_PATH = "/inventory/settings/internal-prices";

type SearchParams = {
  ok?: string;
  error?: string;
  list_id?: string;
};

type CostCenterRow = {
  id: string;
  site_id: string | null;
  name: string | null;
  code: string | null;
  type: string | null;
  is_active: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_type: string | null;
  is_active: boolean | null;
};

type InternalPriceListRow = {
  id: string;
  name: string;
  seller_cost_center_id: string;
  buyer_cost_center_id: string | null;
  buyer_site_id: string | null;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type InternalPriceListItemRow = {
  id: string;
  price_list_id: string;
  product_id: string;
  unit_price: number;
  unit_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNonNegativeNumber(value: FormDataEntryValue | null) {
  const raw = asText(value).replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function buildReturnUrl(status: { ok?: string; error?: string; listId?: string }) {
  const params = new URLSearchParams();
  if (status.ok) params.set("ok", status.ok);
  if (status.error) params.set("error", status.error);
  if (status.listId) params.set("list_id", status.listId);
  const query = params.toString();
  return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
}

function parseDateAsBogotaStartOfDay(value: FormDataEntryValue | null) {
  const raw = asText(value);
  if (!raw) return null;
  return `${raw}T00:00:00-05:00`;
}


function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: "America/Bogota",
  }).format(parsed);
}

function formatMoney(value: number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function costCenterLabel(row: CostCenterRow | null | undefined, sitesById: Map<string, SiteRow>) {
  if (!row) return "Sin centro de costo";
  const siteName = row.site_id ? sitesById.get(row.site_id)?.name : "";
  const pieces = [
    row.code ? `[${row.code}]` : "",
    row.name ?? "Sin nombre",
    siteName ? `· ${siteName}` : "",
  ];
  return pieces.filter(Boolean).join(" ");
}

function productLabel(row: ProductRow | null | undefined) {
  if (!row) return "Producto no encontrado";
  const sku = row.sku ? ` · ${row.sku}` : "";
  const unit = row.stock_unit_code || row.unit ? ` · ${row.stock_unit_code ?? row.unit}` : "";
  return `${row.name ?? row.id}${sku}${unit}`;
}

async function requireInternalPricesManager() {
  const supabase = await createClient();

  return requireAppAccess({
    appId: APP_ID,
    returnTo: PAGE_PATH,
    supabase,
    permissionCode: MANAGE_PERMISSION,
  });
}

async function createInternalPriceList(formData: FormData) {
  "use server";

  const { supabase, user } = await requireInternalPricesManager();

  const name = asText(formData.get("name"));
  const sellerCostCenterId = asText(formData.get("seller_cost_center_id"));
  const buyerCostCenterId = asText(formData.get("buyer_cost_center_id"));
  const buyerSiteId = asText(formData.get("buyer_site_id"));
  const validFrom = parseDateAsBogotaStartOfDay(formData.get("valid_from"));
  const validTo = parseDateAsBogotaStartOfDay(formData.get("valid_to"));

  if (!name) {
    redirect(buildReturnUrl({ error: "Escribe un nombre para la lista." }));
  }

  if (!sellerCostCenterId) {
    redirect(buildReturnUrl({ error: "Selecciona el centro de costo vendedor." }));
  }

  if (!buyerCostCenterId && !buyerSiteId) {
    redirect(buildReturnUrl({ error: "Selecciona al menos un comprador: centro de costo o sede." }));
  }

  if (validFrom && validTo && new Date(validTo).getTime() <= new Date(validFrom).getTime()) {
    redirect(buildReturnUrl({ error: "La fecha final debe ser posterior a la fecha inicial." }));
  }

  const { data, error } = await supabase
    .from("internal_price_lists")
    .insert({
      name,
      seller_cost_center_id: sellerCostCenterId,
      buyer_cost_center_id: buyerCostCenterId || null,
      buyer_site_id: buyerSiteId || null,
      valid_from: validFrom ?? new Date().toISOString(),
      valid_to: validTo,
      is_active: true,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    redirect(buildReturnUrl({ error: error.message }));
  }

  revalidatePath(PAGE_PATH);
  redirect(buildReturnUrl({ ok: "list_created", listId: String(data.id) }));
}

async function updateInternalPriceListStatus(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalPricesManager();

  const listId = asText(formData.get("list_id"));
  const nextIsActive = asText(formData.get("next_is_active")) === "true";

  if (!listId) {
    redirect(buildReturnUrl({ error: "Lista inválida." }));
  }

  const { error } = await supabase
    .from("internal_price_lists")
    .update({
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listId);

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId }));
  }

  revalidatePath(PAGE_PATH);
  redirect(
    buildReturnUrl({
      ok: nextIsActive ? "list_enabled" : "list_disabled",
      listId,
    })
  );
}

async function addInternalPriceListItem(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalPricesManager();

  const priceListId = asText(formData.get("price_list_id"));
  const productId = asText(formData.get("product_id"));
  const unitCode = asText(formData.get("unit_code"));
  const unitPrice = parseNonNegativeNumber(formData.get("unit_price"));

  if (!priceListId) {
    redirect(buildReturnUrl({ error: "Selecciona una lista.", listId: priceListId }));
  }

  if (!productId) {
    redirect(buildReturnUrl({ error: "Selecciona un producto.", listId: priceListId }));
  }

  if (!unitCode) {
    redirect(buildReturnUrl({ error: "Escribe la unidad del precio interno.", listId: priceListId }));
  }

  if (unitPrice === null) {
    redirect(buildReturnUrl({ error: "El precio interno debe ser mayor o igual a 0.", listId: priceListId }));
  }

  const { error } = await supabase.from("internal_price_list_items").insert({
    price_list_id: priceListId,
    product_id: productId,
    unit_price: unitPrice,
    unit_code: unitCode,
    is_active: true,
  });

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId: priceListId }));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  redirect(buildReturnUrl({ ok: "item_added", listId: priceListId }));
}

async function updateInternalPriceListItem(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalPricesManager();

  const itemId = asText(formData.get("item_id"));
  const priceListId = asText(formData.get("price_list_id"));
  const unitCode = asText(formData.get("unit_code"));
  const unitPrice = parseNonNegativeNumber(formData.get("unit_price"));

  if (!itemId || !priceListId) {
    redirect(buildReturnUrl({ error: "Ítem inválido.", listId: priceListId }));
  }

  if (!unitCode) {
    redirect(buildReturnUrl({ error: "La unidad no puede estar vacía.", listId: priceListId }));
  }

  if (unitPrice === null) {
    redirect(buildReturnUrl({ error: "El precio interno debe ser mayor o igual a 0.", listId: priceListId }));
  }

  const { error } = await supabase
    .from("internal_price_list_items")
    .update({
      unit_code: unitCode,
      unit_price: unitPrice,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId: priceListId }));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  redirect(buildReturnUrl({ ok: "item_updated", listId: priceListId }));
}

async function updateInternalPriceListItemStatus(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalPricesManager();

  const itemId = asText(formData.get("item_id"));
  const priceListId = asText(formData.get("price_list_id"));
  const nextIsActive = asText(formData.get("next_is_active")) === "true";

  if (!itemId || !priceListId) {
    redirect(buildReturnUrl({ error: "Ítem inválido.", listId: priceListId }));
  }

  const { error } = await supabase
    .from("internal_price_list_items")
    .update({
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId: priceListId }));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  redirect(
    buildReturnUrl({
      ok: nextIsActive ? "item_enabled" : "item_disabled",
      listId: priceListId,
    })
  );
}

export default async function InternalPricesSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};

  const okMsg =
    sp.ok === "list_created"
      ? "Lista de precios internos creada."
      : sp.ok === "list_enabled"
        ? "Lista activada."
        : sp.ok === "list_disabled"
          ? "Lista desactivada."
          : sp.ok === "item_added"
            ? "Producto agregado a la lista."
            : sp.ok === "item_updated"
              ? "Precio interno actualizado."
              : sp.ok === "item_enabled"
                ? "Producto activado en la lista."
                : sp.ok === "item_disabled"
                  ? "Producto desactivado en la lista."
                  : "";

  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: PAGE_PATH,
    permissionCode: VIEW_PERMISSION,
  });

  const canManage = await checkPermission(supabase, APP_ID, MANAGE_PERMISSION);

  const [
    { data: costCentersData },
    { data: sitesData },
    { data: priceListsData },
    { data: productsData },
  ] = await Promise.all([
    supabase
      .from("cost_centers")
      .select("id,site_id,name,code,type,is_active")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("sites")
      .select("id,name,site_type")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("internal_price_lists")
      .select(
        "id,name,seller_cost_center_id,buyer_cost_center_id,buyer_site_id,valid_from,valid_to,is_active,created_by,created_at,updated_at"
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("products")
      .select("id,name,sku,unit,stock_unit_code,product_type,is_active")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(1500),
  ]);

  const costCenters = (costCentersData ?? []) as CostCenterRow[];
  const sites = (sitesData ?? []) as SiteRow[];
  const priceLists = (priceListsData ?? []) as InternalPriceListRow[];
  const products = (productsData ?? []) as ProductRow[];

  const costCentersById = new Map(costCenters.map((row) => [row.id, row]));
  const sitesById = new Map(sites.map((row) => [row.id, row]));
  const productsById = new Map(products.map((row) => [row.id, row]));

  const activePriceLists = priceLists.filter((row) => row.is_active);
  const selectedListId = String(sp.list_id ?? priceLists[0]?.id ?? "").trim();
  const selectedPriceList =
    priceLists.find((row) => row.id === selectedListId) ?? priceLists[0] ?? null;

  const { data: priceItemsData } = selectedPriceList
    ? await supabase
        .from("internal_price_list_items")
        .select("id,price_list_id,product_id,unit_price,unit_code,is_active,created_at,updated_at")
        .eq("price_list_id", selectedPriceList.id)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false })
    : { data: [] };

  const priceItems = (priceItemsData ?? []) as InternalPriceListItemRow[];
  const activeItems = priceItems.filter((row) => row.is_active);
  const inactiveItems = priceItems.filter((row) => !row.is_active);

  const productionCostCenters = costCenters.filter(
    (row) => row.type === "production_center"
  );
  const buyerCostCenters = costCenters.filter((row) =>
    ["satellite", "admin", "logistics", "other", null, ""].includes(String(row.type ?? ""))
  );

  const defaultSellerCostCenterId =
    productionCostCenters[0]?.id ?? costCenters[0]?.id ?? "";
  const defaultBuyerCostCenterId =
    buyerCostCenters.find((row) => row.id !== defaultSellerCostCenterId)?.id ??
    costCenters.find((row) => row.id !== defaultSellerCostCenterId)?.id ??
    "";

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Precios internos</h1>
          <p className="mt-2 ui-body-muted">
            Administra listas de precios para transferencias internas entre centros de costo.
            Estos valores no son costo real ni precio fiscal al cliente.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/settings/remissions" className="ui-btn ui-btn--ghost">
            Configuración de remisiones
          </Link>
          <Link href="/inventory/remissions" className="ui-btn ui-btn--ghost">
            Ir a remisiones
          </Link>
        </div>
      </div>

      {errorMsg ? <div className="mt-6 ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div> : null}

      {!canManage ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          Puedes ver precios internos, pero no tienes permiso para gestionarlos.
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
          <div className="ui-caption">Listas activas</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
            {activePriceLists.length}
          </div>
          <div className="mt-1 text-xs text-[var(--ui-muted)]">
            {priceLists.length} listas totales
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
          <div className="ui-caption">Lista seleccionada</div>
          <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
            {selectedPriceList?.name ?? "Sin lista seleccionada"}
          </div>
          <div className="mt-1 text-xs text-[var(--ui-muted)]">
            {selectedPriceList?.is_active ? "Activa" : selectedPriceList ? "Inactiva" : "Sin estado"}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
          <div className="ui-caption">Productos en lista</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--ui-text)]">
            {activeItems.length}
          </div>
          <div className="mt-1 text-xs text-[var(--ui-muted)]">
            {inactiveItems.length} desactivados
          </div>
        </div>
      </div>

      {canManage ? (
        <div className="mt-6 ui-panel">
          <div className="ui-h3">Crear lista de precios internos</div>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Crea una lista por relación interna, por ejemplo Centro de Producción → Molka.
          </p>

          <form action={createInternalPriceList} className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className="ui-label">Nombre de la lista</span>
              <input
                name="name"
                className="ui-input"
                placeholder="Centro de Producción → Molka"
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Centro de costo vendedor</span>
              <select
                name="seller_cost_center_id"
                className="ui-input"
                defaultValue={defaultSellerCostCenterId}
                required
              >
                <option value="">Seleccionar vendedor</option>
                {(productionCostCenters.length ? productionCostCenters : costCenters).map((row) => (
                  <option key={row.id} value={row.id}>
                    {costCenterLabel(row, sitesById)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Centro de costo comprador</span>
              <select
                name="buyer_cost_center_id"
                className="ui-input"
                defaultValue={defaultBuyerCostCenterId}
              >
                <option value="">Sin comprador específico</option>
                {buyerCostCenters.map((row) => (
                  <option key={row.id} value={row.id}>
                    {costCenterLabel(row, sitesById)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Sede compradora opcional</span>
              <select name="buyer_site_id" className="ui-input" defaultValue="">
                <option value="">Sin sede específica</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.id}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Vigente desde</span>
                <input name="valid_from" type="date" className="ui-input" />
              </label>

              <label className="flex flex-col gap-1">
                <span className="ui-label">Vigente hasta</span>
                <input name="valid_to" type="date" className="ui-input" />
              </label>
            </div>

            <div className="lg:col-span-2">
              <button type="submit" className="ui-btn ui-btn--brand">
                Crear lista
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="ui-panel">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="ui-h3">Listas creadas</div>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                Selecciona una lista para administrar sus productos.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {priceLists.length ? (
              priceLists.map((list) => {
                const isSelected = selectedPriceList?.id === list.id;
                const seller = costCentersById.get(list.seller_cost_center_id);
                const buyer = list.buyer_cost_center_id
                  ? costCentersById.get(list.buyer_cost_center_id)
                  : null;
                const buyerSite = list.buyer_site_id ? sitesById.get(list.buyer_site_id) : null;

                return (
                  <div
                    key={list.id}
                    className={
                      isSelected
                        ? "rounded-2xl border border-[var(--ui-brand)] bg-[var(--ui-surface-2)] p-4"
                        : "rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4"
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`${PAGE_PATH}?list_id=${encodeURIComponent(list.id)}`}
                          className="text-sm font-semibold text-[var(--ui-text)] hover:underline"
                        >
                          {list.name}
                        </Link>
                        <div className="mt-1 text-xs text-[var(--ui-muted)]">
                          {costCenterLabel(seller, sitesById)} →{" "}
                          {buyer ? costCenterLabel(buyer, sitesById) : buyerSite?.name ?? "Comprador general"}
                        </div>
                      </div>

                      <span
                        className={
                          list.is_active
                            ? "ui-chip ui-chip--success"
                            : "ui-chip ui-chip--warn"
                        }
                      >
                        {list.is_active ? "Activa" : "Inactiva"}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-[var(--ui-muted)] sm:grid-cols-2">
                      <div>Desde: {formatDate(list.valid_from)}</div>
                      <div>Hasta: {list.valid_to ? formatDate(list.valid_to) : "Sin cierre"}</div>
                    </div>

                    {canManage ? (
                      <form action={updateInternalPriceListStatus} className="mt-3">
                        <input type="hidden" name="list_id" value={list.id} />
                        <input
                          type="hidden"
                          name="next_is_active"
                          value={list.is_active ? "false" : "true"}
                        />
                        <button type="submit" className="ui-btn ui-btn--ghost">
                          {list.is_active ? "Desactivar lista" : "Activar lista"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm text-[var(--ui-muted)]">
                Aún no hay listas de precios internos.
              </div>
            )}
          </div>
        </div>

        <div className="ui-panel">
          {selectedPriceList ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="ui-h3">{selectedPriceList.name}</div>
                  <p className="mt-1 text-sm text-[var(--ui-muted)]">
                    Define el precio interno que se congelará al valorizar remisiones cerradas.
                  </p>
                </div>

                <span
                  className={
                    selectedPriceList.is_active
                      ? "ui-chip ui-chip--success"
                      : "ui-chip ui-chip--warn"
                  }
                >
                  {selectedPriceList.is_active ? "Lista activa" : "Lista inactiva"}
                </span>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                  <div className="ui-caption">Vendedor</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
                    {costCenterLabel(
                      costCentersById.get(selectedPriceList.seller_cost_center_id),
                      sitesById
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                  <div className="ui-caption">Comprador</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
                    {selectedPriceList.buyer_cost_center_id
                      ? costCenterLabel(
                          costCentersById.get(selectedPriceList.buyer_cost_center_id),
                          sitesById
                        )
                      : selectedPriceList.buyer_site_id
                        ? sitesById.get(selectedPriceList.buyer_site_id)?.name ?? "Sede sin nombre"
                        : "General"}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
                  <div className="ui-caption">Vigencia</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
                    {formatDate(selectedPriceList.valid_from)}
                  </div>
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                    {selectedPriceList.valid_to
                      ? `Hasta ${formatDate(selectedPriceList.valid_to)}`
                      : "Sin fecha final"}
                  </div>
                </div>
              </div>

              {canManage ? (
                <form
                  action={addInternalPriceListItem}
                  className="mt-6 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4"
                >
                  <input type="hidden" name="price_list_id" value={selectedPriceList.id} />
                  <div className="ui-h3">Agregar producto</div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_160px_160px_auto]">
                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Producto</span>
                      <select name="product_id" className="ui-input" required>
                        <option value="">Seleccionar producto</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {productLabel(product)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Unidad</span>
                      <input
                        name="unit_code"
                        className="ui-input"
                        placeholder="unidad"
                        defaultValue="unidad"
                        required
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Precio interno</span>
                      <input
                        name="unit_price"
                        type="number"
                        min="0"
                        step="0.01"
                        className="ui-input"
                        placeholder="0"
                        required
                      />
                    </label>

                    <div className="flex items-end">
                      <button type="submit" className="ui-btn ui-btn--brand">
                        Agregar
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}

              <div className="mt-6">
                <div className="ui-h3">Productos de la lista</div>

                <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--ui-border)]">
                  <table className="min-w-full divide-y divide-[var(--ui-border)] text-sm">
                    <thead className="bg-[var(--ui-surface-2)]">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                          Producto
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                          Unidad
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                          Precio
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                          Estado
                        </th>
                        {canManage ? (
                          <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                            Acciones
                          </th>
                        ) : null}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[var(--ui-border)] bg-[var(--ui-surface)]">
                      {priceItems.length ? (
                        priceItems.map((item) => {
                          const product = productsById.get(item.product_id);
                          return (
                            <tr key={item.id}>
                              <td className="px-4 py-3 align-top">
                                <div className="font-medium text-[var(--ui-text)]">
                                  {product?.name ?? item.product_id}
                                </div>
                                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                                  {product?.sku ? `SKU ${product.sku}` : "Sin SKU"}
                                </div>
                              </td>

                              <td className="px-4 py-3 align-top">
                                {canManage ? (
                                  <form action={updateInternalPriceListItem} className="flex gap-2">
                                    <input type="hidden" name="item_id" value={item.id} />
                                    <input
                                      type="hidden"
                                      name="price_list_id"
                                      value={selectedPriceList.id}
                                    />
                                    <input
                                      name="unit_code"
                                      className="ui-input w-28"
                                      defaultValue={item.unit_code}
                                      required
                                    />
                                    <input
                                      name="unit_price"
                                      type="hidden"
                                      value={String(item.unit_price)}
                                    />
                                    <button type="submit" className="ui-btn ui-btn--ghost">
                                      Guardar unidad
                                    </button>
                                  </form>
                                ) : (
                                  <span className="text-[var(--ui-text)]">{item.unit_code}</span>
                                )}
                              </td>

                              <td className="px-4 py-3 align-top">
                                {canManage ? (
                                  <form action={updateInternalPriceListItem} className="flex gap-2">
                                    <input type="hidden" name="item_id" value={item.id} />
                                    <input
                                      type="hidden"
                                      name="price_list_id"
                                      value={selectedPriceList.id}
                                    />
                                    <input type="hidden" name="unit_code" value={item.unit_code} />
                                    <input
                                      name="unit_price"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      className="ui-input w-36"
                                      defaultValue={String(item.unit_price)}
                                      required
                                    />
                                    <button type="submit" className="ui-btn ui-btn--ghost">
                                      Guardar precio
                                    </button>
                                  </form>
                                ) : (
                                  <span className="font-semibold text-[var(--ui-text)]">
                                    {formatMoney(item.unit_price)}
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-3 align-top">
                                <span
                                  className={
                                    item.is_active
                                      ? "ui-chip ui-chip--success"
                                      : "ui-chip ui-chip--warn"
                                  }
                                >
                                  {item.is_active ? "Activo" : "Inactivo"}
                                </span>
                              </td>

                              {canManage ? (
                                <td className="px-4 py-3 align-top">
                                  <form action={updateInternalPriceListItemStatus}>
                                    <input type="hidden" name="item_id" value={item.id} />
                                    <input
                                      type="hidden"
                                      name="price_list_id"
                                      value={selectedPriceList.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="next_is_active"
                                      value={item.is_active ? "false" : "true"}
                                    />
                                    <button type="submit" className="ui-btn ui-btn--ghost">
                                      {item.is_active ? "Desactivar" : "Activar"}
                                    </button>
                                  </form>
                                </td>
                              ) : null}
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={canManage ? 5 : 4}
                            className="px-4 py-8 text-center text-[var(--ui-muted)]"
                          >
                            Esta lista aún no tiene productos.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm text-[var(--ui-muted)]">
              Crea una lista para comenzar a cargar precios internos.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
