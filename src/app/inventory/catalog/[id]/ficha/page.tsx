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
const NEXO_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://nexo.ventogroup.co";

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
  source?: "manual" | "supplier_primary" | "recipe_portion" | null;
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

type AssetProfileRow = {
  product_id: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  physical_location: string | null;
  purchase_invoice_url: string | null;
  commercial_value: number | null;
  purchase_date: string | null;
  started_use_date: string | null;
  equipment_status: string | null;
  maintenance_service_provider: string | null;
  technical_description: string | null;
  maintenance_cycle_enabled: boolean | null;
  maintenance_cycle_months: number | null;
  maintenance_cycle_anchor_date: string | null;
};

type AssetMaintenanceRow = {
  id: string;
  scheduled_date: string | null;
  performed_date: string | null;
  responsible: string | null;
  maintenance_provider: string | null;
  work_done: string | null;
  parts_replaced: boolean | null;
  replaced_parts: string | null;
  planner_bucket: string | null;
};

type AssetTransferRow = {
  id: string;
  moved_at: string | null;
  from_location: string | null;
  to_location: string | null;
  responsible: string | null;
  notes: string | null;
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

function equipmentStatusLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "en_mantenimiento") return "En mantenimiento";
  if (raw === "fuera_servicio") return "Fuera de servicio";
  if (raw === "baja") return "De baja";
  return "Operativo";
}

function addMonthsUTC(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const tentative = new Date(Date.UTC(year, month + months, 1));
  const endOfMonth = new Date(Date.UTC(tentative.getUTCFullYear(), tentative.getUTCMonth() + 1, 0)).getUTCDate();
  tentative.setUTCDate(Math.min(day, endOfMonth));
  return tentative;
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
  normalizeByCatalog?: boolean;
}): UomDisplay | null {
  const profile = params.profile;
  if (!profile) return null;
  const inputUnitCode = normalizeUnitCode(profile.input_unit_code || "");
  if (!inputUnitCode) return null;

  const qtyInInputUnit = toPositiveNumber(profile.qty_in_input_unit, 1);
  const qtyInStockRaw = toPositiveNumber(profile.qty_in_stock_unit, 1);
  const label = String(profile.label ?? "").trim() || "Unidad";
  const stockUnitCode = normalizeUnitCode(params.stockUnitCode || "");
  const normalizeByCatalog = params.normalizeByCatalog !== false;

  if (!stockUnitCode) {
    return {
      label,
      inputUnitCode,
      qtyInInputUnit,
      qtyInStockUnit: qtyInStockRaw,
      adjustedFromCatalog: false,
    };
  }

  if (!normalizeByCatalog) {
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
    assetProfileRes,
    assetMaintenanceRes,
    assetTransfersRes,
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
    supabase
      .from("product_asset_profiles")
      .select(
        "product_id,brand,model,serial_number,physical_location,purchase_invoice_url,commercial_value,purchase_date,started_use_date,equipment_status,maintenance_service_provider,technical_description,maintenance_cycle_enabled,maintenance_cycle_months,maintenance_cycle_anchor_date"
      )
      .eq("product_id", id)
      .maybeSingle(),
    supabase
      .from("product_asset_maintenance_events")
      .select(
        "id,scheduled_date,performed_date,responsible,maintenance_provider,work_done,parts_replaced,replaced_parts,planner_bucket"
      )
      .eq("product_id", id)
      .order("scheduled_date", { ascending: false })
      .order("performed_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("product_asset_transfer_events")
      .select("id,moved_at,from_location,to_location,responsible,notes")
      .eq("product_id", id)
      .order("moved_at", { ascending: false })
      .order("created_at", { ascending: false }),
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
  const assetProfile = (assetProfileRes.data ?? null) as AssetProfileRow | null;
  const assetMaintenanceRows = (assetMaintenanceRes.data ?? []) as AssetMaintenanceRow[];
  const assetTransferRows = (assetTransfersRes.data ?? []) as AssetTransferRow[];

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
  const normalizedCategoryPath = categoryPath.trim().toLowerCase();
  const isMachineryAndEquipmentCategory =
    normalizedCategoryPath.includes("maquinaria y equipos") ||
    (normalizedCategoryPath.includes("maquinaria") &&
      (normalizedCategoryPath.includes("equipo") || normalizedCategoryPath.includes("equipos")));
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
    source:
      row.source === "supplier_primary"
        ? "supplier_primary"
        : row.source === "recipe_portion"
          ? "recipe_portion"
          : ("manual" as const),
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
    normalizeByCatalog: true,
  });
  const remissionProfileDisplay = resolveProfileDisplay({
    profile: remissionProfile,
    stockUnitCode,
    unitRows,
    normalizeByCatalog: false,
  });
  const remissionSourceLabel = remissionProfile
    ? remissionProfile.source === "supplier_primary"
      ? "Proveedor (empaque en operación)"
      : remissionProfile.source === "recipe_portion"
        ? "Receta publicada (porción)"
        : "Unidad operativa"
    : "Unidad operativa";
  const purchasePackText = purchaseProfileDisplay
    ? `${purchaseProfileDisplay.label} (${formatQty(purchaseProfileDisplay.qtyInStockUnit)} ${stockUnitCode})`
    : "Sin presentación de compra";
  const remissionPackText = remissionProfileDisplay
    ? `${remissionProfileDisplay.label} (1 ${remissionProfileDisplay.label.toLowerCase()} = ${formatQty(remissionProfileDisplay.qtyInStockUnit)} ${stockUnitCode})`
    : "No marcado para remisión";
  const remissionUnitText = remissionProfileDisplay
    ? `${remissionProfileDisplay.inputUnitCode}`
    : defaultUnitCode;
  const operationRuleText = remissionProfileDisplay
    ? remissionProfile?.source === "recipe_portion"
      ? "Usa porción de receta publicada."
      : "Usa presentación de remisión."
    : "No usa remisión: opera con unidad operativa.";

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
  const technicalPath = `/inventory/catalog/${product.id}/ficha`;
  const technicalAbsoluteUrl = `${NEXO_BASE_URL}${technicalPath}`;
  const assetQrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
    technicalAbsoluteUrl
  )}`;

  const maintenanceCalendarMap = assetMaintenanceRows.reduce(
    (acc, row) => {
      const keySource = row.scheduled_date || row.performed_date || "";
      const keyDate = keySource ? new Date(keySource) : null;
      const monthKey =
        keyDate && Number.isFinite(keyDate.getTime())
          ? `${keyDate.getUTCFullYear()}-${String(keyDate.getUTCMonth() + 1).padStart(2, "0")}`
          : "Sin fecha";
      if (!acc[monthKey]) acc[monthKey] = [];
      acc[monthKey].push(row);
      return acc;
    },
    {} as Record<string, AssetMaintenanceRow[]>
  );
  const maintenanceCalendarBuckets = Object.entries(maintenanceCalendarMap).sort((a, b) =>
    a[0] === "Sin fecha" ? 1 : b[0] === "Sin fecha" ? -1 : b[0].localeCompare(a[0])
  );

  const maintenancePlannerMap = assetMaintenanceRows.reduce(
    (acc, row) => {
      const bucket = String(row.planner_bucket ?? "mensual").trim().toLowerCase() || "mensual";
      if (!acc[bucket]) acc[bucket] = [];
      acc[bucket].push(row);
      return acc;
    },
    {} as Record<string, AssetMaintenanceRow[]>
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);
  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);

  const scheduledPendingRows = assetMaintenanceRows
    .filter((row) => row.scheduled_date && !row.performed_date)
    .map((row) => {
      const scheduledAt = new Date(String(row.scheduled_date));
      return { row, scheduledAt };
    })
    .filter((entry) => Number.isFinite(entry.scheduledAt.getTime()))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  const overdueMaintenance = scheduledPendingRows.filter(
    (entry) => entry.scheduledAt.getTime() < today.getTime()
  );
  const next7DaysMaintenance = scheduledPendingRows.filter(
    (entry) =>
      entry.scheduledAt.getTime() >= today.getTime() &&
      entry.scheduledAt.getTime() <= in7Days.getTime()
  );
  const next30DaysMaintenance = scheduledPendingRows.filter(
    (entry) =>
      entry.scheduledAt.getTime() > in7Days.getTime() &&
      entry.scheduledAt.getTime() <= in30Days.getTime()
  );

  const recurrenceMonthsRaw = Number(assetProfile?.maintenance_cycle_months ?? 0);
  const recurrenceMonths =
    Number.isFinite(recurrenceMonthsRaw) && recurrenceMonthsRaw >= 1 ? Math.trunc(recurrenceMonthsRaw) : 0;
  const recurrenceAnchorDate = assetProfile?.maintenance_cycle_anchor_date
    ? new Date(assetProfile.maintenance_cycle_anchor_date)
    : null;
  const recurrenceEnabled =
    Boolean(assetProfile?.maintenance_cycle_enabled) &&
    recurrenceMonths > 0 &&
    recurrenceAnchorDate &&
    Number.isFinite(recurrenceAnchorDate.getTime());
  let recurrenceNextDueDate: Date | null = null;
  if (recurrenceEnabled && recurrenceAnchorDate) {
    let cursor = new Date(recurrenceAnchorDate);
    cursor.setHours(0, 0, 0, 0);
    let safety = 0;
    while (cursor.getTime() < today.getTime() && safety < 240) {
      cursor = addMonthsUTC(cursor, recurrenceMonths);
      safety += 1;
    }
    recurrenceNextDueDate = cursor;
  }
  const recurrenceIn7Days =
    recurrenceNextDueDate != null &&
    recurrenceNextDueDate.getTime() >= today.getTime() &&
    recurrenceNextDueDate.getTime() <= in7Days.getTime();
  const recurrenceIn30Days =
    recurrenceNextDueDate != null &&
    recurrenceNextDueDate.getTime() > in7Days.getTime() &&
    recurrenceNextDueDate.getTime() <= in30Days.getTime();

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
              <Link
                href={returnTo}
                className="ui-btn ui-btn--ghost inline-flex h-12 items-center px-5 text-base font-semibold"
              >
                ← Volver al catálogo
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
              <div className="ui-caption">Precio base referencial</div>
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
          <div className="text-sm font-semibold text-[var(--ui-text)]">
            {isAsset ? "Foto del equipo / activo" : "Foto"}
          </div>
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

      {isAsset ? (
        <section className="space-y-4">
          {isMachineryAndEquipmentCategory &&
          (overdueMaintenance.length > 0 ||
            next7DaysMaintenance.length > 0 ||
            next30DaysMaintenance.length > 0 ||
            recurrenceIn7Days ||
            recurrenceIn30Days) ? (
            <article className="ui-panel">
              <div className="text-sm font-semibold text-[var(--ui-text)]">
                Recordatorio de mantenimiento programado
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                  <div className="ui-caption text-red-700">Vencidos</div>
                  <div className="mt-1 text-xl font-semibold text-red-800">
                    {overdueMaintenance.length}
                  </div>
                  <div className="mt-1 text-xs text-red-700">
                    Programados antes de hoy y sin cierre.
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="ui-caption text-amber-700">Próximos 7 días</div>
                  <div className="mt-1 text-xl font-semibold text-amber-800">
                    {next7DaysMaintenance.length + (recurrenceIn7Days ? 1 : 0)}
                  </div>
                  <div className="mt-1 text-xs text-amber-700">
                    Prioridad alta para programación.
                  </div>
                </div>
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                  <div className="ui-caption text-cyan-700">Próximos 30 días</div>
                  <div className="mt-1 text-xl font-semibold text-cyan-800">
                    {next30DaysMaintenance.length + (recurrenceIn30Days ? 1 : 0)}
                  </div>
                  <div className="mt-1 text-xs text-cyan-700">
                    Planeación preventiva mensual.
                  </div>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {scheduledPendingRows.slice(0, 5).map(({ row }) => (
                  <div
                    key={`reminder-${row.id}`}
                    className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-[var(--ui-text)]">
                      {formatDate(row.scheduled_date)}
                    </span>
                    <span className="text-[var(--ui-muted)]">
                      {" · "}
                      {row.work_done || "Mantenimiento programado"}
                      {" · Responsable: "}
                      {row.responsible || "Sin asignar"}
                    </span>
                  </div>
                ))}
                {recurrenceNextDueDate ? (
                  <div className="rounded-xl border border-dashed border-cyan-300 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
                    Próximo mantenimiento recurrente: {formatDate(recurrenceNextDueDate.toISOString())}
                    {" · "}cada {recurrenceMonths} mes(es)
                  </div>
                ) : null}
              </div>
            </article>
          ) : null}

          <article className="ui-panel">
            <div className="text-sm font-semibold text-[var(--ui-text)]">
              Ficha del equipo (solo lectura)
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Marca</div>
                <div className="mt-1 text-sm font-semibold">{assetProfile?.brand || "Sin dato"}</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Modelo</div>
                <div className="mt-1 text-sm font-semibold">{assetProfile?.model || "Sin dato"}</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Serial</div>
                <div className="mt-1 text-sm font-semibold">{assetProfile?.serial_number || "Sin dato"}</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Ubicación física</div>
                <div className="mt-1 text-sm font-semibold">
                  {assetProfile?.physical_location || "Sin ubicación"}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Estado del equipo</div>
                <div className="mt-1 text-sm font-semibold">
                  {equipmentStatusLabel(assetProfile?.equipment_status)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Valor comercial</div>
                <div className="mt-1 text-sm font-semibold">
                  {formatMoney(assetProfile?.commercial_value)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Factura de compra</div>
                {assetProfile?.purchase_invoice_url ? (
                  <a
                    href={assetProfile.purchase_invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex text-sm font-semibold text-cyan-700 underline underline-offset-2"
                  >
                    Abrir factura
                  </a>
                ) : (
                  <div className="mt-1 text-sm">Sin factura adjunta</div>
                )}
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Fecha compra</div>
                <div className="mt-1 text-sm font-semibold">{formatDate(assetProfile?.purchase_date)}</div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                <div className="ui-caption">Inicio de uso</div>
                <div className="mt-1 text-sm font-semibold">{formatDate(assetProfile?.started_use_date)}</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
              <div className="ui-caption">Notas del equipo</div>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                {assetProfile?.technical_description || "Sin notas registradas."}
              </p>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-sm">
                <div className="ui-caption">Proveedor de mantenimiento (referencia)</div>
                <div className="mt-1 font-semibold text-[var(--ui-text)]">
                  {assetProfile?.maintenance_service_provider || "Sin proveedor definido"}
                </div>
                <div className="mt-2 ui-caption">Ciclo programado</div>
                <div className="mt-1 font-semibold text-[var(--ui-text)]">
                  {recurrenceEnabled
                    ? `Cada ${recurrenceMonths} mes(es), base ${formatDate(
                        assetProfile?.maintenance_cycle_anchor_date
                      )}`
                    : "Sin ciclo recurrente"}
                </div>
                {recurrenceNextDueDate ? (
                  <div className="mt-1 text-xs text-[var(--ui-muted)]">
                    Próxima fecha sugerida: {formatDate(recurrenceNextDueDate.toISOString())}
                  </div>
                ) : null}
                <div className="mt-2 text-[var(--ui-muted)]">
                  URL directa de la ficha técnica:
                  <a href={technicalPath} className="ml-1 font-semibold text-cyan-700 underline underline-offset-2">
                    {technicalPath}
                  </a>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--ui-border)] bg-white p-3">
                <div className="ui-caption">QR ficha técnica (auto)</div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  Este QR abre esta ficha del equipo en NEXO.
                </div>
                <img src={assetQrImageUrl} alt="QR ficha técnica" className="mt-2 h-[180px] w-[180px] rounded-md border border-[var(--ui-border)]" />
              </div>
            </div>
          </article>

          <section className="grid gap-4 xl:grid-cols-3">
            <article className="ui-panel xl:col-span-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[var(--ui-text)]">Mantenimiento · Lista</div>
                <div className="ui-caption">{assetMaintenanceRows.length} evento(s)</div>
              </div>
              {assetMaintenanceRows.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--ui-muted)]">Sin eventos registrados.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {assetMaintenanceRows.map((row) => (
                    <div key={row.id} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-sm">
                      <div className="font-semibold text-[var(--ui-text)]">
                        {formatDate(row.performed_date || row.scheduled_date)}
                      </div>
                      <div className="mt-1 text-[var(--ui-muted)]">
                        {row.work_done || "Mantenimiento sin detalle"}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ui-muted)]">
                        Responsable: {row.responsible || "Sin responsable"} · Proveedor:{" "}
                        {row.maintenance_provider || "Sin proveedor"}
                      </div>
                      {row.parts_replaced ? (
                        <div className="mt-1 text-xs font-semibold text-amber-700">
                          Reemplazo de piezas: {row.replaced_parts || "Sí (sin detalle)"}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="ui-panel xl:col-span-1">
              <div className="text-sm font-semibold text-[var(--ui-text)]">Mantenimiento · Calendario</div>
              {maintenanceCalendarBuckets.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--ui-muted)]">Sin eventos para calendario.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {maintenanceCalendarBuckets.map(([bucketKey, rows]) => (
                    <div key={bucketKey} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                        {bucketKey === "Sin fecha" ? "Sin fecha" : bucketKey}
                      </div>
                      <ul className="mt-2 space-y-1 text-sm">
                        {rows.map((row) => (
                          <li key={`${bucketKey}-${row.id}`} className="text-[var(--ui-text)]">
                            {formatDate(row.performed_date || row.scheduled_date)} ·{" "}
                            {row.work_done || "Mantenimiento"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="ui-panel xl:col-span-1">
              <div className="text-sm font-semibold text-[var(--ui-text)]">Mantenimiento · Planeador</div>
              {Object.keys(maintenancePlannerMap).length === 0 ? (
                <p className="mt-3 text-sm text-[var(--ui-muted)]">Sin tareas planificadas.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {Object.entries(maintenancePlannerMap).map(([bucket, rows]) => (
                    <div key={bucket} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                        {bucket}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
                        {rows.length} tarea(s)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>

          <article className="ui-panel">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-[var(--ui-text)]">Historial de traslados</div>
              <div className="ui-caption">{assetTransferRows.length} traslado(s)</div>
            </div>
            {assetTransferRows.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--ui-muted)]">Sin traslados registrados.</p>
            ) : (
              <div className="mt-3 overflow-auto rounded-xl border border-[var(--ui-border)]">
                <table className="ui-table min-w-[720px] text-sm">
                  <thead>
                    <tr>
                      <th className="py-2 pr-4">Fecha</th>
                      <th className="py-2 pr-4">Desde</th>
                      <th className="py-2 pr-4">Hacia</th>
                      <th className="py-2 pr-4">Responsable</th>
                      <th className="py-2 pr-4">Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assetTransferRows.map((row) => (
                      <tr key={row.id} className="border-t border-zinc-200/60">
                        <td className="py-2.5 pr-4">{formatDate(row.moved_at)}</td>
                        <td className="py-2.5 pr-4">{row.from_location || "-"}</td>
                        <td className="py-2.5 pr-4">{row.to_location || "-"}</td>
                        <td className="py-2.5 pr-4">{row.responsible || "-"}</td>
                        <td className="py-2.5 pr-4">{row.notes || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="ui-panel">
          <div className="text-sm font-semibold text-[var(--ui-text)]">Unidades y control</div>
          <div className="mt-3 space-y-2 text-sm text-[var(--ui-muted)]">
            <p>
              <strong className="text-[var(--ui-text)]">Unidad base:</strong> {stockUnitCode}
            </p>
            <p>
              <strong className="text-[var(--ui-text)]">Unidad operativa:</strong> {defaultUnitCode}
            </p>
            <p>
              <strong className="text-[var(--ui-text)]">Presentación compra:</strong> {purchasePackText}
            </p>
            <p>
              <strong className="text-[var(--ui-text)]">Presentación remisión:</strong> {remissionPackText}
            </p>
            <p>
              <strong className="text-[var(--ui-text)]">Unidad remisión:</strong> {remissionUnitText}
            </p>
            <p>
              <strong className="text-[var(--ui-text)]">Regla activa:</strong> {operationRuleText}
            </p>
            <p>
              <strong className="text-[var(--ui-text)]">Fuente remisión:</strong> {remissionSourceLabel}
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
