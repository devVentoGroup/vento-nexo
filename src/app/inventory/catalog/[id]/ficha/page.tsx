import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  getCategoryPath,
  type InventoryCategoryRow,
} from "@/lib/inventory/categories";
import {
  convertQuantity,
  createUnitMap,
  normalizeUnitCode,
  selectProductUomProfileForContext,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";
const FOGO_BASE_URL =
  process.env.NEXT_PUBLIC_FOGO_URL?.replace(/\/$/, "") ||
  "https://fogo.ventogroup.co";

type SearchParams = {
  from?: string;
};

type ProductRow = {
  id: string;
  name: string | null;
  description: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_type: string | null;
  category_id: string | null;
  price: number | null;
  cost: number | null;
  is_active: boolean | null;
  image_url: string | null;
  catalog_image_url: string | null;
};

type InventoryProfileRow = {
  track_inventory: boolean | null;
  inventory_kind: string | null;
  default_unit: string | null;
  lot_tracking: boolean | null;
  expiry_tracking: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  is_active: boolean | null;
};

type SiteSettingRow = {
  site_id: string | null;
  is_active: boolean | null;
  min_stock_qty: number | null;
};

type StockRow = {
  site_id: string | null;
  current_qty: number | null;
};

type SupplierRow = {
  supplier_id: string | null;
  purchase_unit: string | null;
  purchase_pack_qty: number | null;
  purchase_pack_unit_code: string | null;
  purchase_price_net: number | null;
  purchase_price: number | null;
  is_primary: boolean | null;
  suppliers?: { name: string | null } | { name: string | null }[] | null;
};

type UomProfileRow = {
  id: string;
  product_id: string;
  label: string | null;
  input_unit_code: string | null;
  qty_in_input_unit: number | null;
  qty_in_stock_unit: number | null;
  usage_context: string | null;
  is_default: boolean | null;
  is_active: boolean | null;
  updated_at: string | null;
  source?: "manual" | "supplier_primary" | null;
};

type UnitRow = {
  code: string;
  name: string;
  family: string;
  factor_to_base: number;
  symbol: string | null;
  display_decimals: number | null;
  is_active: boolean;
};

type UomDisplay = {
  label: string;
  inputUnitCode: string;
  qtyInInputUnit: number;
  qtyInStockUnit: number;
  adjustedFromCatalog: boolean;
};

type PurchaseOrderItemTraceRow = {
  qty: number | null;
  purchase_orders?:
    | {
        number: string | null;
        status: string | null;
        expected_date: string | null;
        created_at: string | null;
        suppliers?: { name: string | null } | { name: string | null }[] | null;
      }
    | Array<{
        number: string | null;
        status: string | null;
        expected_date: string | null;
        created_at: string | null;
        suppliers?: { name: string | null } | { name: string | null }[] | null;
      }>
    | null;
};

type InventoryReceiptItemTraceRow = {
  qty_base: number | null;
  inventory_entries?:
    | {
        entry_no: string | null;
        status: string | null;
        entry_date: string | null;
        created_at: string | null;
        sites?: { name: string | null } | { name: string | null }[] | null;
      }
    | Array<{
        entry_no: string | null;
        status: string | null;
        entry_date: string | null;
        created_at: string | null;
        sites?: { name: string | null } | { name: string | null }[] | null;
      }>
    | null;
};

function sanitizeCatalogReturnPath(value: string | undefined): string {
  const decoded = value ? safeDecodeURIComponent(value) : "";
  return decoded.startsWith("/inventory/catalog")
    ? decoded
    : "/inventory/catalog";
}

function formatQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 3,
  }).format(value);
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
  }).format(parsed);
}

function normalizeTypeLabel(
  productTypeRaw: string | null,
  inventoryKindRaw: string | null
): string {
  const productType = String(productTypeRaw ?? "").trim().toLowerCase();
  const inventoryKind = String(inventoryKindRaw ?? "").trim().toLowerCase();
  if (inventoryKind === "asset") return "Activo";
  if (productType === "preparacion") return "Preparación";
  if (productType === "venta" && inventoryKind === "resale") return "Reventa";
  if (productType === "venta") return "Producto de venta";
  return "Insumo";
}

function buildFogoRecipeUrl(productId: string) {
  const url = new URL("/recipes/new", FOGO_BASE_URL);
  url.searchParams.set("source", "nexo");
  url.searchParams.set("product_id", productId);
  return url.toString();
}

function toPositiveNumber(value: number | null | undefined, fallback: number): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveProfileDisplay(params: {
  profile: ProductUomProfile | null;
  stockUnitCode: string;
  unitRows: UnitRow[];
}): UomDisplay | null {
  const profile = params.profile;
  if (!profile) return null;
  const inputUnitCode = normalizeUnitCode(profile.input_unit_code || "");
  if (!inputUnitCode) return null;

  const qtyInInputUnit = toPositiveNumber(profile.qty_in_input_unit, 1);
  const qtyInStockRaw = toPositiveNumber(profile.qty_in_stock_unit, 1);
  const label = String(profile.label ?? "").trim() || "Unidad";
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "");

  if (!stockUnitCode) {
    return {
      label,
      inputUnitCode,
      qtyInInputUnit,
      qtyInStockUnit: qtyInStockRaw,
      adjustedFromCatalog: false,
    };
  }

  try {
    const unitMap = createUnitMap(params.unitRows as Parameters<typeof createUnitMap>[0]);
    const { quantity: convertedQty } = convertQuantity({
      quantity: qtyInInputUnit,
      fromUnitCode: inputUnitCode,
      toUnitCode: stockUnitCode,
      unitMap,
    });
    const delta = Math.abs(convertedQty - qtyInStockRaw);
    const tolerance = Math.max(0.0001, Math.abs(convertedQty) * 0.0001);
    const shouldAdjust = delta > tolerance;
    return {
      label,
      inputUnitCode,
      qtyInInputUnit,
      qtyInStockUnit: shouldAdjust ? convertedQty : qtyInStockRaw,
      adjustedFromCatalog: shouldAdjust,
    };
  } catch {
    return {
      label,
      inputUnitCode,
      qtyInInputUnit,
      qtyInStockUnit: qtyInStockRaw,
      adjustedFromCatalog: false,
    };
  }
}

async function loadCategoryRows(
  supabase: Awaited<ReturnType<typeof requireAppAccess>>["supabase"]
): Promise<InventoryCategoryRow[]> {
  const query = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain,site_id,is_active,applies_to_kinds")
    .order("name", { ascending: true });

  if (!query.error) return (query.data ?? []) as InventoryCategoryRow[];

  const fallback = await supabase
    .from("product_categories")
    .select("id,name,parent_id,domain,site_id,is_active")
    .order("name", { ascending: true });

  return ((fallback.data ?? []) as Array<Omit<InventoryCategoryRow, "applies_to_kinds">>).map(
    (row) => ({ ...row, applies_to_kinds: [] })
  );
}

export default async function ProductTechnicalSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const returnTo = sanitizeCatalogReturnPath(sp.from);

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/catalog/${id}/ficha`,
    permissionCode: PERMISSION,
  });

  const [
    productRes,
    profileRes,
    sitesRes,
    siteSettingsRes,
    stockRes,
    suppliersRes,
    uomProfilesRes,
    unitsRes,
    purchaseOrderItemsRes,
    receiptItemsRes,
    allCategories,
    employeeRes,
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id,name,description,sku,unit,stock_unit_code,product_type,category_id,price,cost,is_active,image_url,catalog_image_url"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("product_inventory_profiles")
      .select("track_inventory,inventory_kind,default_unit,lot_tracking,expiry_tracking")
      .eq("product_id", id)
      .maybeSingle(),
    supabase
      .from("sites")
      .select("id,name,is_active")
      .eq("is_active", true)
      .neq("name", "App Review (Demo)")
      .order("name", { ascending: true }),
    supabase
      .from("product_site_settings")
      .select("site_id,is_active,min_stock_qty")
      .eq("product_id", id),
    supabase
      .from("inventory_stock_by_site")
      .select("site_id,current_qty")
      .eq("product_id", id),
    supabase
      .from("product_suppliers")
      .select(
        "supplier_id,purchase_unit,purchase_pack_qty,purchase_pack_unit_code,purchase_price_net,purchase_price,is_primary,suppliers(name)"
      )
      .eq("product_id", id)
      .order("is_primary", { ascending: false }),
    supabase
      .from("product_uom_profiles")
      .select(
        "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,usage_context,is_default,is_active,updated_at,source"
      )
      .eq("product_id", id)
      .eq("is_active", true),
    supabase
      .from("inventory_units")
      .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
      .eq("is_active", true),
    supabase
      .from("purchase_order_items")
      .select(
        "qty,purchase_orders(number,status,expected_date,created_at,suppliers(name))"
      )
      .eq("product_id", id)
      .order("created_at", { foreignTable: "purchase_orders", ascending: false })
      .limit(8),
    supabase
      .from("inventory_entry_items")
      .select("qty_base,inventory_entries(entry_no,status,entry_date,created_at,sites(name))")
      .eq("product_id", id)
      .order("created_at", { foreignTable: "inventory_entries", ascending: false })
      .limit(8),
    loadCategoryRows(supabase),
    supabase.from("employees").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const product = (productRes.data ?? null) as ProductRow | null;
  if (!product) notFound();

  const profile = (profileRes.data ?? null) as InventoryProfileRow | null;
  const sites = (sitesRes.data ?? []) as SiteRow[];
  const siteSettings = (siteSettingsRes.data ?? []) as SiteSettingRow[];
  const stockRows = (stockRes.data ?? []) as StockRow[];
  const supplierRows = (suppliersRes.data ?? []) as SupplierRow[];
  const uomProfiles = (uomProfilesRes.data ?? []) as UomProfileRow[];
  const unitRows = (unitsRes.data ?? []) as UnitRow[];
  const purchaseOrderRows = (purchaseOrderItemsRes.data ?? []) as PurchaseOrderItemTraceRow[];
  const receiptRows = (receiptItemsRes.data ?? []) as InventoryReceiptItemTraceRow[];

  const role = String(employeeRes.data?.role ?? "").toLowerCase();
  const canEdit = ["propietario", "gerente_general"].includes(role);

  const stockUnitCode = normalizeUnitCode(
    product.stock_unit_code || product.unit || "un"
  );
  const defaultUnitCode = normalizeUnitCode(profile?.default_unit || stockUnitCode);
  const normalizedType = normalizeTypeLabel(
    product.product_type,
    profile?.inventory_kind ?? null
  );
  const categoryMap = new Map(allCategories.map((row) => [row.id, row]));
  const categoryPath = getCategoryPath(product.category_id, categoryMap) || "Sin categoría";
  const imageUrl = product.catalog_image_url || product.image_url || null;
  const primarySupplier = supplierRows.find((row) => Boolean(row.is_primary)) ?? null;
  const secondarySuppliers = supplierRows.filter((row) => !Boolean(row.is_primary));

  const mappedProfiles: ProductUomProfile[] = uomProfiles.map((row) => ({
    id: row.id,
    product_id: row.product_id,
    label: row.label || "Unidad",
    input_unit_code: normalizeUnitCode(row.input_unit_code || ""),
    qty_in_input_unit: toPositiveNumber(row.qty_in_input_unit, 1),
    qty_in_stock_unit: toPositiveNumber(row.qty_in_stock_unit, 1),
    is_default: row.is_default !== false,
    is_active: row.is_active !== false,
    source: row.source === "supplier_primary" ? "supplier_primary" : ("manual" as const),
    usage_context:
      String(row.usage_context ?? "general").trim().toLowerCase() === "purchase"
        ? "purchase"
        : String(row.usage_context ?? "general").trim().toLowerCase() === "remission"
          ? "remission"
          : "general",
  }));
  const purchaseProfile =
    (selectProductUomProfileForContext({
      profiles: mappedProfiles,
      productId: id,
      context: "purchase",
    }) as ProductUomProfile | null) ?? null;
  const remissionProfile =
    (selectProductUomProfileForContext({
      profiles: mappedProfiles,
      productId: id,
      context: "remission",
    }) as ProductUomProfile | null) ?? null;
  const purchaseProfileDisplay = resolveProfileDisplay({
    profile: purchaseProfile,
    stockUnitCode,
    unitRows,
  });
  const remissionProfileDisplay = resolveProfileDisplay({
    profile: remissionProfile,
    stockUnitCode,
    unitRows,
  });
  const remissionSourceLabel = remissionProfile
    ? remissionProfile.source === "supplier_primary"
      ? "Proveedor (empaque en operación)"
      : "Unidad operativa"
    : "Unidad operativa";
  const purchasePackText = purchaseProfileDisplay
    ? `${purchaseProfileDisplay.label} (${formatQty(purchaseProfileDisplay.qtyInInputUnit)} ${purchaseProfileDisplay.inputUnitCode} = ${formatQty(purchaseProfileDisplay.qtyInStockUnit)} ${stockUnitCode})`
    : "Sin presentación de compra";
  const remissionPackText = remissionProfileDisplay
    ? `${remissionProfileDisplay.label} (${formatQty(remissionProfileDisplay.qtyInInputUnit)} ${remissionProfileDisplay.inputUnitCode} = ${formatQty(remissionProfileDisplay.qtyInStockUnit)} ${stockUnitCode})`
    : `Unidad operativa (${defaultUnitCode})`;
  const operationRuleText = remissionProfileDisplay
    ? "Usa presentación de remisión."
    : "Sin remisión explícita: usa unidad operativa.";

  const stockBySite = new Map<string, number>();
  stockRows.forEach((row) => {
    const siteId = String(row.site_id ?? "").trim();
    if (!siteId) return;
    stockBySite.set(siteId, Number(row.current_qty ?? 0) || 0);
  });
  const settingsBySite = new Map<string, SiteSettingRow>();
  siteSettings.forEach((row) => {
    const siteId = String(row.site_id ?? "").trim();
    if (!siteId) return;
    settingsBySite.set(siteId, row);
  });

  const sheetRows = sites.map((site) => {
    const qty = stockBySite.get(site.id) ?? 0;
    const cfg = settingsBySite.get(site.id) ?? null;
    const minStock = cfg && cfg.is_active !== false ? Number(cfg.min_stock_qty ?? 0) : null;
    const shortage =
      minStock != null && Number.isFinite(minStock) ? Math.max(minStock - qty, 0) : null;
    return {
      siteId: site.id,
      siteName: site.name ?? site.id,
      qty,
      minStock,
      shortage,
      enabled: cfg ? cfg.is_active !== false : false,
      configured: Boolean(cfg),
    };
  });

  const isAsset = String(profile?.inventory_kind ?? "").trim().toLowerCase() === "asset";
  const isPreparation = String(product.product_type ?? "").trim().toLowerCase() === "preparacion";
  const isSale = String(product.product_type ?? "").trim().toLowerCase() === "venta";
  const isResale = String(profile?.inventory_kind ?? "").trim().toLowerCase() === "resale";

  const purchaseTraceRows = purchaseOrderRows
    .map((row, idx) => {
      const order = Array.isArray(row.purchase_orders)
        ? row.purchase_orders[0] ?? null
        : row.purchase_orders ?? null;
      const supplier = Array.isArray(order?.suppliers)
        ? order?.suppliers[0]?.name ?? null
        : order?.suppliers?.name ?? null;
      return {
        key: `po-${idx}-${order?.number ?? "sin-numero"}`,
        orderNo: order?.number ?? "-",
        supplierName: supplier ?? "Sin proveedor",
        status: order?.status ?? "-",
        date: order?.expected_date ?? order?.created_at ?? null,
        qty: Number(row.qty ?? 0) || 0,
      };
    })
    .filter((row) => row.orderNo !== "-");

  const receiptTraceRows = receiptRows
    .map((row, idx) => {
      const receipt = Array.isArray(row.inventory_entries)
        ? row.inventory_entries[0] ?? null
        : row.inventory_entries ?? null;
      const siteName = Array.isArray(receipt?.sites)
        ? receipt?.sites[0]?.name ?? null
        : receipt?.sites?.name ?? null;
      return {
        key: `re-${idx}-${receipt?.entry_no ?? "sin-numero"}`,
        receiptNo: receipt?.entry_no ?? "-",
        siteName: siteName ?? "Sin sede",
        status: receipt?.status ?? "-",
        date: receipt?.entry_date ?? receipt?.created_at ?? null,
        qtyBase: Number(row.qty_base ?? 0) || 0,
      };
    })
    .filter((row) => row.receiptNo !== "-");

  const orderedTotal = purchaseTraceRows.reduce((acc, row) => acc + row.qty, 0);
  const receivedTotal = receiptTraceRows.reduce((acc, row) => acc + row.qtyBase, 0);

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.35fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link href={returnTo} className="ui-caption underline">
                Volver al catálogo
              </Link>
              <h1 className="ui-h1">Ficha técnica</h1>
              <p className="ui-body-muted">
                Vista de solo lectura para operación: identidad, unidades, inventario por sede y abastecimiento.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                {normalizedType}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {product.is_active === false ? "Inactivo" : "Activo"}
              </span>
              {product.sku ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                  SKU {product.sku}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canEdit ? (
                <Link
                  href={`/inventory/catalog/${product.id}?from=${encodeURIComponent(returnTo)}`}
                  className="ui-btn ui-btn--ghost"
                >
                  Editar ficha maestra
                </Link>
              ) : null}
              {(isPreparation || (isSale && !isResale)) ? (
                <Link
                  href={buildFogoRecipeUrl(product.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-btn ui-btn--brand"
                >
                  Ver continuidad en FOGO
                </Link>
              ) : null}
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Unidad operativa</div>
              <div className="ui-remission-kpi-value">{defaultUnitCode}</div>
              <div className="ui-remission-kpi-note">
                Captura por defecto cuando no hay empaque operativo.
              </div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Unidad base</div>
              <div className="ui-remission-kpi-value">{stockUnitCode}</div>
              <div className="ui-remission-kpi-note">Referencia para stock, costo y consumo.</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Sedes configuradas</div>
              <div className="ui-remission-kpi-value">
                {sheetRows.filter((row) => row.configured).length}
              </div>
              <div className="ui-remission-kpi-note">Con setup activo para este producto.</div>
            </article>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="ui-panel">
          <div className="text-sm font-semibold text-[var(--ui-text)]">Identidad del producto</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="ui-caption">Nombre</div>
              <div className="mt-1 text-base font-semibold">{product.name ?? "Sin nombre"}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="ui-caption">Categoría</div>
              <div className="mt-1 text-sm">{categoryPath}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="ui-caption">Tipo</div>
              <div className="mt-1 text-sm">{normalizedType}</div>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="ui-caption">Precio venta</div>
              <div className="mt-1 text-sm">{formatMoney(product.price)}</div>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
            <div className="ui-caption">Descripción</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              {product.description?.trim() || "Sin descripción registrada."}
            </p>
          </div>
        </article>

        <article className="ui-panel">
          <div className="text-sm font-semibold text-[var(--ui-text)]">Foto</div>
          <div className="mt-3 overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)]">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={product.name ?? "Producto"}
                className="h-[260px] w-full object-cover"
              />
            ) : (
              <div className="flex h-[260px] items-center justify-center text-sm text-[var(--ui-muted)]">
                Sin imagen
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="ui-panel">
          <div className="text-sm font-semibold text-[var(--ui-text)]">Unidades y control</div>
          <div className="mt-3 space-y-2 text-sm text-[var(--ui-muted)]">
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">Resumen operativo</p>
              <p className="mt-1">
                <strong className="text-[var(--ui-text)]">Base (stock/costo):</strong> {stockUnitCode}
              </p>
              <p>
                <strong className="text-[var(--ui-text)]">Compra:</strong> {purchasePackText}
              </p>
              <p>
                <strong className="text-[var(--ui-text)]">Remisión:</strong> {remissionPackText}
              </p>
              <p>
                <strong className="text-[var(--ui-text)]">Se usa en operación:</strong> {remissionPackText}
              </p>
              <p>
                <strong className="text-[var(--ui-text)]">Regla activa:</strong> {operationRuleText}
              </p>
              <p>
                <strong className="text-[var(--ui-text)]">Fuente elegida:</strong> {remissionSourceLabel}
              </p>
            </div>
            <p>
              <strong className="text-[var(--ui-text)]">Unidad base:</strong> {stockUnitCode}
            </p>
            <p>
              <strong className="text-[var(--ui-text)]">Unidad operativa:</strong> {defaultUnitCode}
            </p>
            <p>
              <strong className="text-[var(--ui-text)]">Controlar stock:</strong>{" "}
              {profile?.track_inventory ? "Sí" : "No"}
            </p>
            <p>
              <strong className="text-[var(--ui-text)]">Lotes:</strong>{" "}
              {profile?.lot_tracking ? "Sí" : "No"}
              {" · "}
              <strong className="text-[var(--ui-text)]">Vencimiento:</strong>{" "}
              {profile?.expiry_tracking ? "Sí" : "No"}
            </p>
            {purchaseProfileDisplay ? (
              <p>
                <strong className="text-[var(--ui-text)]">Presentación compra:</strong>{" "}
                {purchasePackText}
              </p>
            ) : null}
            {remissionProfileDisplay ? (
              <p>
                <strong className="text-[var(--ui-text)]">Presentación remisión:</strong>{" "}
                {remissionPackText}
              </p>
            ) : (
              <p>
                <strong className="text-[var(--ui-text)]">Presentación remisión:</strong>{" "}
                Unidad operativa ({defaultUnitCode})
              </p>
            )}
            {remissionProfileDisplay?.adjustedFromCatalog ? (
              <p className="text-xs text-[var(--ui-muted)]">
                Se muestra equivalencia normalizada por catálogo de unidades.
              </p>
            ) : null}
            <p>
              <strong className="text-[var(--ui-text)]">Fuente remisión:</strong> {remissionSourceLabel}
            </p>
          </div>
        </article>

        <article className="ui-panel">
          <div className="text-sm font-semibold text-[var(--ui-text)]">Abastecimiento y costo</div>
          <div className="mt-3 space-y-2 text-sm text-[var(--ui-muted)]">
            {!isAsset && primarySupplier ? (
              <>
                <p>
                  <strong className="text-[var(--ui-text)]">Proveedor primario:</strong>{" "}
                  {Array.isArray(primarySupplier.suppliers)
                    ? primarySupplier.suppliers[0]?.name ?? "Sin nombre"
                    : primarySupplier.suppliers?.name ?? "Sin nombre"}
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Compra:</strong>{" "}
                  {primarySupplier.purchase_unit || "Empaque"} (
                  {formatQty(primarySupplier.purchase_pack_qty)}{" "}
                  {normalizeUnitCode(primarySupplier.purchase_pack_unit_code || "") || stockUnitCode})
                </p>
                <p>
                  <strong className="text-[var(--ui-text)]">Precio empaque:</strong>{" "}
                  {formatMoney(primarySupplier.purchase_price_net ?? primarySupplier.purchase_price)}
                </p>
                {secondarySuppliers.length > 0 ? (
                  <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
                    <p className="text-xs uppercase tracking-wide text-[var(--ui-muted)]">
                      Proveedores secundarios
                    </p>
                    <div className="mt-2 space-y-2">
                      {secondarySuppliers.map((supplier, index) => {
                        const supplierName = Array.isArray(supplier.suppliers)
                          ? supplier.suppliers[0]?.name ?? "Sin nombre"
                          : supplier.suppliers?.name ?? "Sin nombre";
                        return (
                          <div
                            key={`${supplier.supplier_id ?? "sec"}-${index}`}
                            className="rounded-lg border border-[var(--ui-border)] bg-white px-2 py-1.5 text-xs"
                          >
                            <div className="font-semibold text-[var(--ui-text)]">{supplierName}</div>
                            <div>
                              {supplier.purchase_unit || "Empaque"} (
                              {formatQty(supplier.purchase_pack_qty)}{" "}
                              {normalizeUnitCode(supplier.purchase_pack_unit_code || "") || stockUnitCode})
                            </div>
                            <div>
                              Precio: {formatMoney(supplier.purchase_price_net ?? supplier.purchase_price)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p>No hay proveedor primario configurado.</p>
            )}
            <p>
              <strong className="text-[var(--ui-text)]">Costo actual:</strong> {formatMoney(product.cost)}
            </p>
            {isAsset ? (
              <p className="text-xs">
                Activo: no entra en flujo de compra operativa de insumos/remisiones.
              </p>
            ) : null}
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="ui-panel">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[var(--ui-text)]">
              Trazabilidad ORIGO · Órdenes de compra
            </div>
            <div className="ui-caption">
              {purchaseTraceRows.length} orden(es) · {formatQty(orderedTotal)} {stockUnitCode}
            </div>
          </div>
          {purchaseTraceRows.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ui-muted)]">
              Sin órdenes de compra recientes para este producto.
            </p>
          ) : (
            <div className="mt-3 overflow-auto rounded-xl border border-[var(--ui-border)]">
              <table className="ui-table min-w-[620px] text-sm">
                <thead>
                  <tr>
                    <th className="py-2 pr-4">Orden</th>
                    <th className="py-2 pr-4">Proveedor</th>
                    <th className="py-2 pr-4">Fecha</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseTraceRows.map((row) => (
                    <tr key={row.key} className="border-t border-zinc-200/60">
                      <td className="py-2.5 pr-4">{row.orderNo}</td>
                      <td className="py-2.5 pr-4">{row.supplierName}</td>
                      <td className="py-2.5 pr-4">{formatDate(row.date)}</td>
                      <td className="py-2.5 pr-4">{row.status}</td>
                      <td className="py-2.5 pr-4">
                        {formatQty(row.qty)} {stockUnitCode}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="ui-panel">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[var(--ui-text)]">
              Trazabilidad ORIGO · Recepciones
            </div>
            <div className="ui-caption">
              {receiptTraceRows.length} recepción(es) · {formatQty(receivedTotal)} {stockUnitCode}
            </div>
          </div>
          {receiptTraceRows.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ui-muted)]">
              Sin remisiones/recepciones recientes para este producto.
            </p>
          ) : (
            <div className="mt-3 overflow-auto rounded-xl border border-[var(--ui-border)]">
              <table className="ui-table min-w-[620px] text-sm">
                <thead>
                  <tr>
                    <th className="py-2 pr-4">Recepción</th>
                    <th className="py-2 pr-4">Sede</th>
                    <th className="py-2 pr-4">Fecha</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Cantidad base</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptTraceRows.map((row) => (
                    <tr key={row.key} className="border-t border-zinc-200/60">
                      <td className="py-2.5 pr-4">{row.receiptNo}</td>
                      <td className="py-2.5 pr-4">{row.siteName}</td>
                      <td className="py-2.5 pr-4">{formatDate(row.date)}</td>
                      <td className="py-2.5 pr-4">{row.status}</td>
                      <td className="py-2.5 pr-4">
                        {formatQty(row.qtyBase)} {stockUnitCode}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>

      <article className="ui-panel">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-[var(--ui-text)]">Stock por sede</div>
          <div className="ui-caption">{sheetRows.length} sede(s)</div>
        </div>
        <div className="mt-3 overflow-auto rounded-xl border border-[var(--ui-border)]">
          <table className="ui-table min-w-[760px] text-sm">
            <thead>
              <tr>
                <th className="py-2 pr-4">Sede</th>
                <th className="py-2 pr-4">Stock</th>
                <th className="py-2 pr-4">Mínimo</th>
                <th className="py-2 pr-4">Faltante</th>
                <th className="py-2 pr-4">Estado</th>
              </tr>
            </thead>
            <tbody>
              {sheetRows.map((row) => (
                <tr key={row.siteId} className="border-t border-zinc-200/60">
                  <td className="py-2.5 pr-4">{row.siteName}</td>
                  <td className="py-2.5 pr-4">
                    {formatQty(row.qty)} {stockUnitCode}
                  </td>
                  <td className="py-2.5 pr-4">
                    {row.minStock != null ? `${formatQty(row.minStock)} ${stockUnitCode}` : "-"}
                  </td>
                  <td className="py-2.5 pr-4">
                    {row.shortage != null ? `${formatQty(row.shortage)} ${stockUnitCode}` : "-"}
                  </td>
                  <td className="py-2.5 pr-4">
                    {!row.configured ? (
                      <span className="ui-chip">Sin config</span>
                    ) : !row.enabled ? (
                      <span className="ui-chip">Inactiva</span>
                    ) : row.shortage != null && row.shortage > 0 ? (
                      <span className="ui-chip ui-chip--warn">Bajo mínimo</span>
                    ) : (
                      <span className="ui-chip ui-chip--success">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
