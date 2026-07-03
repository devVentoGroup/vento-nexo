import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  addInternalPriceListItem,
  createInternalPriceList,
  updateInternalPriceListItem,
  updateInternalPriceListItemStatus,
  updateInternalPriceListStatus,
} from "./actions";
import {
  buildPresentationEquivalenceLabel,
  buildProductPriceOptionValue,
  costCenterLabel,
  formatDate,
  formatMoney,
  formatQty,
  isDemoCostCenter,
  isDemoSite,
  isManualPhysicalPresentation,
  isProductionCostCenter,
  isSatelliteCostCenter,
  normalizeUnitCodeLocal,
  presentationShortLabel,
  rankUomProfile,
  resolveBuyerSiteId,
  type CostCenterRow,
  type InternalPriceListItemRow,
  type InternalPriceListRow,
  type ProductRow,
  type ProductSiteSettingRow,
  type ProductUomProfileRow,
  type SearchParams,
  type SiteRow,
} from "./helpers";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const VIEW_PERMISSION = "internal_prices.view";
const MANAGE_PERMISSION = "internal_prices.manage";
const PAGE_PATH = "/inventory/settings/internal-prices";

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
    { data: productUomProfilesData },
    { data: productSiteSettingsData },
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
    supabase
      .from("product_uom_profiles")
      .select(
        "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
      )
      .eq("is_active", true)
      .eq("source", "manual")
      .order("label", { ascending: true })
      .limit(5000),
    supabase
      .from("product_site_settings")
      .select("product_id,site_id,is_active,remission_enabled")
      .eq("is_active", true)
      .eq("remission_enabled", true)
      .limit(10000),
  ]);

  const costCenters = (costCentersData ?? []) as CostCenterRow[];
  const sites = (sitesData ?? []) as SiteRow[];
  const priceLists = (priceListsData ?? []) as InternalPriceListRow[];
  const products = (productsData ?? []) as ProductRow[];
  const productUomProfiles = (productUomProfilesData ?? []) as ProductUomProfileRow[];
  const productSiteSettings = (productSiteSettingsData ?? []) as ProductSiteSettingRow[];

  const costCentersById = new Map(costCenters.map((row) => [row.id, row]));
  const sitesById = new Map(sites.map((row) => [row.id, row]));
  const productsById = new Map(products.map((row) => [row.id, row]));

  const profilesByProductId = new Map<string, ProductUomProfileRow[]>();

  for (const profile of productUomProfiles) {
    const productId = String(profile.product_id ?? "").trim();
    if (!productId || !productsById.has(productId)) continue;
    if (!isManualPhysicalPresentation(profile)) continue;

    const current = profilesByProductId.get(productId) ?? [];
    current.push(profile);
    profilesByProductId.set(productId, current);
  }

  for (const [productId, profiles] of profilesByProductId) {
    profilesByProductId.set(
      productId,
      [...profiles].sort((a, b) => {
        const rankDiff = rankUomProfile(b) - rankUomProfile(a);
        if (rankDiff !== 0) return rankDiff;
        return String(a.label ?? "").localeCompare(String(b.label ?? ""), "es");
      })
    );
  }

  const operationalSites = sites.filter((site) => !isDemoSite(site));
  const operationalCostCenters = costCenters.filter(
    (row) => !isDemoCostCenter(row, sitesById)
  );

  const activePriceLists = priceLists.filter((row) => row.is_active);
  const selectedListId = String(sp.list_id ?? priceLists[0]?.id ?? "").trim();
  const selectedPriceList =
    priceLists.find((row) => row.id === selectedListId) ?? priceLists[0] ?? null;

  const { data: priceItemsData } = selectedPriceList
    ? await supabase
        .from("internal_price_list_items")
        .select("id,price_list_id,product_id,unit_price,unit_code,uom_profile_id,pricing_label,pricing_input_unit_code,pricing_qty_in_input_unit,pricing_qty_in_stock_unit,pricing_method,margin_pct,base_unit_cost,base_cost_source,suggested_unit_price,is_active,created_at,updated_at")
        .eq("price_list_id", selectedPriceList.id)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false })
    : { data: [] };

  const priceItems = (priceItemsData ?? []) as InternalPriceListItemRow[];
  const activeItems = priceItems.filter((row) => row.is_active);
  const inactiveItems = priceItems.filter((row) => !row.is_active);

  const selectedBuyerSiteId = resolveBuyerSiteId({
    priceList: selectedPriceList,
    costCentersById,
  });
  const remissionProductIdsForBuyerSite = new Set(
    productSiteSettings
      .filter((row) => String(row.site_id ?? "").trim() === selectedBuyerSiteId)
      .map((row) => String(row.product_id ?? "").trim())
      .filter(Boolean)
  );
  const existingActiveProductProfileKeys = new Set(
    activeItems.map((item) => `${item.product_id}|${item.uom_profile_id ?? ""}`)
  );
  const productsMissingManualPresentation = selectedBuyerSiteId
    ? products
        .filter((product) => remissionProductIdsForBuyerSite.has(product.id))
        .filter((product) => (profilesByProductId.get(product.id) ?? []).length === 0)
    : [];
  const productPriceOptions = selectedBuyerSiteId
    ? products
        .filter((product) => remissionProductIdsForBuyerSite.has(product.id))
        .flatMap((product) => {
          const profiles = profilesByProductId.get(product.id) ?? [];

          return profiles
            .map((profile) => ({
              key: `${product.id}:${profile.id}`,
              value: buildProductPriceOptionValue(product.id, profile.id),
              label: `${product.name ?? product.id} - ${buildPresentationEquivalenceLabel({
                label: profile.label,
                inputUnitCode: profile.input_unit_code,
                qtyInInputUnit: profile.qty_in_input_unit,
                qtyInStockUnit: profile.qty_in_stock_unit,
                stockUnitCode: product.stock_unit_code ?? product.unit,
              })}`,
            }))
            .filter((option) => !existingActiveProductProfileKeys.has(option.value));
        })
    : [];

  const productionCostCenters = operationalCostCenters.filter((row) =>
    isProductionCostCenter(row, sitesById)
  );
  const satelliteBuyerCostCenters = operationalCostCenters.filter((row) =>
    isSatelliteCostCenter(row, sitesById)
  );
  const buyerCostCenters = satelliteBuyerCostCenters.length
    ? satelliteBuyerCostCenters
    : operationalCostCenters.filter((row) => !isProductionCostCenter(row, sitesById));

  const defaultSellerCostCenterId =
    productionCostCenters[0]?.id ?? operationalCostCenters[0]?.id ?? "";
  const defaultBuyerCostCenterId =
    buyerCostCenters.find((row) => row.id !== defaultSellerCostCenterId)?.id ??
    operationalCostCenters.find((row) => row.id !== defaultSellerCostCenterId)?.id ??
    "";

  return (
    <div className="w-full">
      <section className="relative overflow-hidden rounded-[2rem] border border-[var(--ui-border)] bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.10),transparent_28%),linear-gradient(135deg,#ffffff_0%,#fbfdff_60%,#fffaf0_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="pointer-events-none absolute left-1/3 -bottom-24 h-48 w-48 rounded-full bg-sky-200/25 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                Centro de costos
              </span>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                Precios por presentación
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                Remisiones valorizadas
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-[var(--ui-text)]">
              Precios internos
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ui-muted)]">
              Administra listas de precios para transferencias internas entre centros de costo.
              Cada precio se amarra a una presentación real del producto para que NEXO pueda valorizar remisiones cerradas sin unidades libres ni ambigüedades.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/inventory/cost-center" className="ui-btn ui-btn--ghost bg-white/80 shadow-sm">
              Centros de costo
            </Link>
            <Link href="/inventory/settings/remissions" className="ui-btn ui-btn--ghost bg-white/80 shadow-sm">
              Configuración de remisiones
            </Link>
            <Link href="/inventory/remissions" className="ui-btn ui-btn--ghost bg-white/80 shadow-sm">
              Ir a remisiones
            </Link>
          </div>
        </div>

        <div className="relative mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-amber-400 bg-white/90 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Listas activas</div>
            <div className="mt-2 text-3xl font-bold text-[var(--ui-text)]">{activePriceLists.length}</div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">{priceLists.length} listas totales</div>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-sky-500 bg-white/90 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">Lista seleccionada</div>
            <div className="mt-2 line-clamp-2 text-sm font-bold text-[var(--ui-text)]">
              {selectedPriceList?.name ?? "Sin lista seleccionada"}
            </div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">
              {selectedPriceList?.is_active ? "Activa" : selectedPriceList ? "Inactiva" : "Sin estado"}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-emerald-500 bg-white/90 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Productos activos</div>
            <div className="mt-2 text-3xl font-bold text-[var(--ui-text)]">{activeItems.length}</div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">{inactiveItems.length} desactivados</div>
          </div>
        </div>
      </section>

      {errorMsg ? <div className="mt-6 ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div> : null}

      {!canManage ? (
        <div className="mt-6 ui-alert ui-alert--warn">
          Puedes ver precios internos, pero no tienes permiso para gestionarlos.
        </div>
      ) : null}

      <div className="mt-6 rounded-[1.75rem] border border-[var(--ui-border)] bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.09),transparent_28%),linear-gradient(135deg,#ffffff_0%,#fbfdff_72%,#fffaf0_100%)] p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-[var(--ui-text)]">Cómo configurarlo</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Crea una lista por cada satélite que compra al centro de producción. No uses App Review
              para operación real.
            </p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            Centro de Producción - Satélite
          </span>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-amber-400 bg-white/95 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">1. Vendedor</div>
            <div className="mt-2 text-sm font-bold text-[var(--ui-text)]">
              Centro de Producción
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
              Es quien produce o despacha internamente.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-sky-500 bg-white/95 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">2. Comprador</div>
            <div className="mt-2 text-sm font-bold text-[var(--ui-text)]">
              Molka, Saudo o Vento Café
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
              Es el centro de costo que recibirá y pagará la remisión interna.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-emerald-500 bg-white/95 p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">3. Sede compradora</div>
            <div className="mt-2 text-sm font-bold text-[var(--ui-text)]">
              Usa la misma sede del comprador
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--ui-muted)]">
              Esto ayuda a que NEXO encuentre la lista correcta al valorizar remisiones.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/70 to-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Modelo</div>
          <div className="mt-2 text-sm font-bold text-[var(--ui-text)]">
            Precio por presentación
          </div>
          <div className="mt-1 text-xs text-[var(--ui-muted)]">
            Evita unidades libres y conserva equivalencia operativa.
          </div>
        </div>

        <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50/70 to-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">Valorización</div>
          <div className="mt-2 text-sm font-bold text-[var(--ui-text)]">
            Remisiones cerradas
          </div>
          <div className="mt-1 text-xs text-[var(--ui-muted)]">
            Congela el precio interno vigente al cerrar operación.
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 to-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Compatibilidad</div>
          <div className="mt-2 text-sm font-bold text-[var(--ui-text)]">
            Legacy controlado
          </div>
          <div className="mt-1 text-xs text-[var(--ui-muted)]">
            Ítems antiguos se muestran como unidad legacy hasta migrarlos.
          </div>
        </div>
      </div>

      {canManage ? (
        <div className="mt-6 rounded-[1.75rem] border border-amber-200/80 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.10),transparent_24%),linear-gradient(135deg,#ffffff_0%,#ffffff_68%,#fffaf0_100%)] p-5 shadow-sm">
          <div className="text-lg font-bold text-[var(--ui-text)]">Crear lista de precios internos</div>
          <p className="mt-1 text-sm text-[var(--ui-muted)]">
            Crea una lista por relación interna, por ejemplo Centro de Producción - Molka.
          </p>

          <form action={createInternalPriceList} className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-1 lg:col-span-2">
              <span className="ui-label">Nombre de la lista</span>
              <input
                name="name"
                className="ui-input"
                placeholder="Ej. Centro de Producción - Molka"
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
                {(productionCostCenters.length ? productionCostCenters : operationalCostCenters).map((row) => (
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
                {operationalSites.map((site) => (
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
        <div className="rounded-[1.75rem] border border-sky-200/70 bg-[linear-gradient(135deg,#ffffff_0%,#f8fcff_100%)] p-5 shadow-sm">
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
                        ? "rounded-2xl border border-amber-300 bg-[linear-gradient(135deg,#fffaf0_0%,#ffffff_100%)] p-4 shadow-sm"
                        : "rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm"
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
                          {costCenterLabel(seller, sitesById)} -{" "}
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

        <div className="rounded-[1.75rem] border border-amber-200/80 bg-white p-5 shadow-sm">
          {selectedPriceList ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="ui-h3">{selectedPriceList.name}</div>
                  <p className="mt-1 text-sm text-[var(--ui-muted)]">
                    Define el precio interno por presentación. Este valor se congelará al valorizar remisiones cerradas.
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
                <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-amber-400 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Vendedor</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
                    {costCenterLabel(
                      costCentersById.get(selectedPriceList.seller_cost_center_id),
                      sitesById
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-sky-500 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">Comprador</div>
                  <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
                    {selectedPriceList.buyer_cost_center_id
                      ? costCenterLabel(
                          costCentersById.get(selectedPriceList.buyer_cost_center_id),
                          sitesById
                        )
                      : selectedPriceList.buyer_site_id
                        ? sitesById.get(selectedPriceList.buyer_site_id)?.name ?? "Sede sin nombre"
                        : "General"}
                    {selectedBuyerSiteId ? (
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        Sede filtro: {sitesById.get(selectedBuyerSiteId)?.name ?? selectedBuyerSiteId}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--ui-border)] border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Vigencia</div>
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
                  className="mt-6 rounded-2xl border border-amber-200/80 bg-[linear-gradient(135deg,#fffaf0_0%,#ffffff_72%,#f8fcff_100%)] p-4 shadow-sm"
                >
                  <input type="hidden" name="price_list_id" value={selectedPriceList.id} />
                  <div className="ui-h3">Agregar producto</div>

                  {!selectedBuyerSiteId ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Para listar productos, esta lista necesita sede compradora o un centro comprador asociado a sede.
                    </div>
                  ) : null}

                  {selectedBuyerSiteId && productPriceOptions.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      No hay productos disponibles para agregar. Revisa que estén habilitados para remisión en la sede compradora y que tengan presentación física manual activa.
                    </div>
                  ) : null}

                  {productsMissingManualPresentation.length ? (
                    <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3 text-xs text-[var(--ui-muted)]">
                      {productsMissingManualPresentation.length} producto(s) remisionables no aparecen porque les falta presentación física manual.
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_150px_170px_auto]">
                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Producto y presentación</span>
                      <select
                        name="product_option"
                        className="ui-input"
                        required
                        disabled={!selectedBuyerSiteId || productPriceOptions.length === 0}
                      >
                        <option value="">Seleccionar producto y presentación</option>
                        {productPriceOptions.map((option) => (
                          <option key={option.key} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-[var(--ui-muted)]">
                        El precio queda congelado para las remisiones. Usa costo + margen cuando ya exista costo base del producto.
                      </span>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Método</span>
                      <select name="pricing_method" className="ui-input" defaultValue="cost_plus_margin">
                        <option value="cost_plus_margin">Costo + margen</option>
                        <option value="manual">Manual</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Margen %</span>
                      <input
                        name="margin_pct"
                        type="number"
                        min="0"
                        max="500"
                        step="0.01"
                        className="ui-input"
                        defaultValue="25"
                        placeholder="25"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="ui-label">Precio manual</span>
                      <input
                        name="unit_price"
                        type="number"
                        min="0"
                        step="0.01"
                        className="ui-input"
                        placeholder="Solo manual"
                      />
                    </label>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        className="ui-btn ui-btn--brand"
                        disabled={!selectedBuyerSiteId || productPriceOptions.length === 0}
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}

              <div className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-[var(--ui-text)]">Productos de la lista</div>
                    <p className="mt-1 text-xs text-[var(--ui-muted)]">
                      Revisa presentación, equivalencia y precio interno por cada producto.
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
                    {priceItems.length} item(s)
                  </span>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--ui-border)] shadow-sm">
                  <table className="min-w-full divide-y divide-[var(--ui-border)] text-sm">
                    <thead className="bg-[linear-gradient(90deg,#fff7e6_0%,#f8fcff_100%)]">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                          Producto
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-[var(--ui-text)]">
                          Presentación
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

                    <tbody className="divide-y divide-[var(--ui-border)] bg-white">
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
                                <div className="text-sm font-medium text-[var(--ui-text)]">
                                  {presentationShortLabel({
                                    label: item.pricing_label,
                                    inputUnitCode: item.pricing_input_unit_code ?? item.unit_code,
                                  })}
                                </div>
                                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                                  {item.pricing_qty_in_input_unit && item.pricing_qty_in_stock_unit
                                    ? `${formatQty(item.pricing_qty_in_input_unit)} ${item.pricing_input_unit_code ?? item.unit_code} = ${formatQty(item.pricing_qty_in_stock_unit)} ${product?.stock_unit_code ?? product?.unit ?? item.unit_code}`
                                    : `Unidad legacy: ${item.unit_code}`}
                                </div>
                              </td>

                              <td className="px-4 py-3 align-top">
                                <div className="font-semibold text-[var(--ui-text)]">
                                  {formatMoney(item.unit_price)}
                                </div>
                                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                                  {item.pricing_method === "cost_plus_margin"
                                    ? `Costo ${formatMoney(item.base_unit_cost)} + ${formatQty(item.margin_pct)}% = ${formatMoney(item.suggested_unit_price)}`
                                    : "Precio manual"}
                                  {item.base_cost_source ? ` - ${item.base_cost_source}` : ""}
                                </div>
                                {canManage ? (
                                  <form
                                    action={updateInternalPriceListItem}
                                    className="mt-3 grid gap-2 lg:grid-cols-[150px_120px_140px_auto]"
                                  >
                                    <input type="hidden" name="item_id" value={item.id} />
                                    <input
                                      type="hidden"
                                      name="price_list_id"
                                      value={selectedPriceList.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="unit_code"
                                      value={item.unit_code || item.pricing_input_unit_code || ""}
                                    />
                                    <select
                                      name="pricing_method"
                                      className="ui-input"
                                      defaultValue={item.pricing_method ?? "manual"}
                                    >
                                      <option value="cost_plus_margin">Costo + margen</option>
                                      <option value="manual">Manual</option>
                                    </select>
                                    <input
                                      name="margin_pct"
                                      type="number"
                                      min="0"
                                      max="500"
                                      step="0.01"
                                      className="ui-input"
                                      defaultValue={item.margin_pct ?? ""}
                                      placeholder="Margen %"
                                    />
                                    <input
                                      name="unit_price"
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      className="ui-input"
                                      defaultValue={String(item.unit_price)}
                                      placeholder="Manual"
                                    />
                                    <button type="submit" className="ui-btn ui-btn--ghost">
                                      Guardar
                                    </button>
                                  </form>
                                ) : null}
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




