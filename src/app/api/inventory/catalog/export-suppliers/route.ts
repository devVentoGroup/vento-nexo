import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const QUERY_CHUNK_SIZE = 250;
const MAX_EXPORT_ROWS = 20000;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");

  const normalized = message.toLowerCase();
  const column = columnName.toLowerCase();

  return (
    normalized.includes(column) &&
    (normalized.includes("does not exist") ||
      normalized.includes("could not find") ||
      normalized.includes("schema cache"))
  );
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlAttr(value: unknown): string {
  return escapeXml(value).replace(/"/g, "&quot;");
}

type ExcelValue = string | number | boolean | null | undefined;

type ExcelCell = {
  value: ExcelValue;
  type?: "String" | "Number" | "Boolean";
  styleId?: string;
  mergeAcross?: number;
};

type SheetDefinition = {
  name: string;
  title?: string;
  subtitle?: string;
  columns?: number[];
  rows: Array<Array<ExcelValue | ExcelCell>>;
  freezeRows?: number;
};

function excelCell(value: ExcelValue | ExcelCell, fallbackStyleId?: string): string {
  const cell: ExcelCell =
    typeof value === "object" && value !== null && "value" in value
      ? value
      : { value, styleId: fallbackStyleId };

  const rawValue = cell.value;
  const styleAttr = cell.styleId
    ? ` ss:StyleID="${escapeXmlAttr(cell.styleId)}"`
    : fallbackStyleId
      ? ` ss:StyleID="${escapeXmlAttr(fallbackStyleId)}"`
      : "";
  const mergeAttr =
    Number(cell.mergeAcross ?? 0) > 0 ? ` ss:MergeAcross="${Number(cell.mergeAcross)}"` : "";

  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return `<Cell${styleAttr}${mergeAttr}><Data ss:Type="String"></Data></Cell>`;
  }

  const type =
    cell.type ??
    (typeof rawValue === "number"
      ? "Number"
      : typeof rawValue === "boolean"
        ? "Boolean"
        : "String");

  const valueText =
    type === "Boolean"
      ? rawValue
        ? "1"
        : "0"
      : type === "Number"
        ? Number(rawValue).toString()
        : escapeXml(rawValue);

  return `<Cell${styleAttr}${mergeAttr}><Data ss:Type="${type}">${valueText}</Data></Cell>`;
}

function excelRow(cells: Array<ExcelValue | ExcelCell>, styleId?: string, height?: number): string {
  const heightAttr = height ? ` ss:Height="${height}"` : "";
  return `<Row${heightAttr}>${cells.map((cell) => excelCell(cell, styleId)).join("")}</Row>`;
}

function buildSheetRows(params: {
  title?: string;
  subtitle?: string;
  rows: Array<Array<ExcelValue | ExcelCell>>;
  columnCount: number;
}) {
  const { title, subtitle, rows, columnCount } = params;
  const output: Array<{ cells: Array<ExcelValue | ExcelCell>; height?: number }> = [];

  if (title) {
    output.push({
      cells: [
        {
          value: title,
          styleId: "Brand",
          mergeAcross: Math.max(columnCount - 1, 0),
        },
      ],
      height: 28,
    });
  }

  if (subtitle) {
    output.push({
      cells: [
        {
          value: subtitle,
          styleId: "Subtitle",
          mergeAcross: Math.max(columnCount - 1, 0),
        },
      ],
      height: 22,
    });
  }

  if (title || subtitle) {
    output.push({
      cells: [
        {
          value: "",
          mergeAcross: Math.max(columnCount - 1, 0),
        },
      ],
      height: 8,
    });
  }

  rows.forEach((row, index) => {
    output.push({
      cells: row.map((cell) => {
        if (index === 0) {
          return typeof cell === "object" && cell !== null && "value" in cell
            ? { ...cell, styleId: cell.styleId ?? "Header" }
            : { value: cell, styleId: "Header" };
        }

        return cell;
      }),
    });
  });

  return output;
}

function excelWorksheet(sheet: SheetDefinition): string {
  const safeName = String(sheet.name || "Hoja").slice(0, 31);
  const columnCount = Math.max(
    sheet.columns?.length ?? 0,
    ...sheet.rows.map((row) => row.length),
    1
  );
  const rows = buildSheetRows({
    title: sheet.title,
    subtitle: sheet.subtitle,
    rows: sheet.rows,
    columnCount,
  });
  const freezeRows = sheet.freezeRows ?? (sheet.title || sheet.subtitle ? 4 : 1);

  return [
    `<Worksheet ss:Name="${escapeXmlAttr(safeName)}">`,
    "<Table>",
    ...(sheet.columns ?? []).map((width) => `<Column ss:Width="${Number(width)}"/>`),
    ...rows.map((row) => excelRow(row.cells, undefined, row.height)),
    "</Table>",
    '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">',
    "<PageSetup>",
    '<Layout x:Orientation="Landscape"/>',
    '<Header x:Margin="0.3"/>',
    '<Footer x:Margin="0.3"/>',
    '<PageMargins x:Bottom="0.5" x:Left="0.35" x:Right="0.35" x:Top="0.5"/>',
    "</PageSetup>",
    "<FreezePanes/>",
    "<FrozenNoSplit/>",
    `<SplitHorizontal>${freezeRows}</SplitHorizontal>`,
    `<TopRowBottomPane>${freezeRows}</TopRowBottomPane>`,
    "<ActivePane>2</ActivePane>",
    "</WorksheetOptions>",
    "</Worksheet>",
  ].join("");
}

function excelWorkbook(sheets: SheetDefinition[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:html="http://www.w3.org/TR/REC-html40">',
    "<DocumentProperties xmlns=\"urn:schemas-microsoft-com:office:office\">",
    "<Author>VENTO GROUP</Author>",
    "<Company>VENTO GROUP</Company>",
    "<Title>NEXO · Libro maestro operativo</Title>",
    "</DocumentProperties>",
    "<ExcelWorkbook xmlns=\"urn:schemas-microsoft-com:office:excel\">",
    "<WindowHeight>9000</WindowHeight>",
    "<WindowWidth>16000</WindowWidth>",
    "<ProtectStructure>False</ProtectStructure>",
    "<ProtectWindows>False</ProtectWindows>",
    "</ExcelWorkbook>",
    "<Styles>",
    '<Style ss:ID="Default" ss:Name="Normal">',
    '<Font ss:FontName="Aptos" ss:Size="10" ss:Color="#1B1A1F"/>',
    '<Alignment ss:Vertical="Center" ss:WrapText="1"/>',
    "</Style>",
    '<Style ss:ID="Brand">',
    '<Font ss:FontName="Aptos Display" ss:Size="17" ss:Bold="1" ss:Color="#FFFFFF"/>',
    '<Interior ss:Color="#1B1A1F" ss:Pattern="Solid"/>',
    '<Alignment ss:Vertical="Center"/>',
    "</Style>",
    '<Style ss:ID="Subtitle">',
    '<Font ss:FontName="Aptos" ss:Size="10" ss:Color="#5E5966"/>',
    '<Interior ss:Color="#F7F5F8" ss:Pattern="Solid"/>',
    '<Alignment ss:Vertical="Center" ss:WrapText="1"/>',
    "</Style>",
    '<Style ss:ID="Header">',
    '<Font ss:FontName="Aptos" ss:Size="9" ss:Bold="1" ss:Color="#FFFFFF"/>',
    '<Interior ss:Color="#E2006A" ss:Pattern="Solid"/>',
    '<Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>',
    '<Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B76E79"/></Borders>',
    "</Style>",
    '<Style ss:ID="Section">',
    '<Font ss:FontName="Aptos" ss:Size="11" ss:Bold="1" ss:Color="#1B1A1F"/>',
    '<Interior ss:Color="#F2EEF2" ss:Pattern="Solid"/>',
    "</Style>",
    '<Style ss:ID="Good">',
    '<Font ss:FontName="Aptos" ss:Size="10" ss:Color="#14532D"/>',
    '<Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>',
    "</Style>",
    '<Style ss:ID="Warn">',
    '<Font ss:FontName="Aptos" ss:Size="10" ss:Color="#7C2D12"/>',
    '<Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>',
    "</Style>",
    '<Style ss:ID="Bad">',
    '<Font ss:FontName="Aptos" ss:Size="10" ss:Color="#7F1D1D"/>',
    '<Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>',
    "</Style>",
    '<Style ss:ID="Muted">',
    '<Font ss:FontName="Aptos" ss:Size="10" ss:Color="#5E5966"/>',
    '<Interior ss:Color="#F7F5F8" ss:Pattern="Solid"/>',
    "</Style>",
    '<Style ss:ID="Number">',
    '<NumberFormat ss:Format="#,##0.###"/>',
    "</Style>",
    '<Style ss:ID="Money">',
    '<NumberFormat ss:Format="$ #,##0.00"/>',
    "</Style>",
    "</Styles>",
    ...sheets.map((sheet) => excelWorksheet(sheet)),
    "</Workbook>",
  ].join("");
}

function yesNo(value: unknown): string {
  return value ? "Si" : "No";
}

function boolStatus(value: unknown, positive = "Si", negative = "No"): string {
  return value ? positive : negative;
}

function nowBogotaLabel(): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
}

function asNumberCell(value: unknown): ExcelCell {
  const n = Number(value);
  return Number.isFinite(n) ? { value: n, type: "Number", styleId: "Number" } : { value: "" };
}

function asMoneyCell(value: unknown): ExcelCell {
  const n = Number(value);
  return Number.isFinite(n) ? { value: n, type: "Number", styleId: "Money" } : { value: "" };
}

function diagnosticStyle(value: string): ExcelCell {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("deberia") || normalized.includes("ok")) {
    return { value, styleId: "Good" };
  }
  if (normalized.includes("revisar") || normalized.includes("advertencia")) {
    return { value, styleId: "Warn" };
  }
  if (normalized.includes("no aparece") || normalized.includes("error") || normalized.includes("falta")) {
    return { value, styleId: "Bad" };
  }
  return { value };
}

type ProductInventoryProfileRow = {
  inventory_kind: string | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  cost: number | null;
  is_active: boolean | null;
  product_type: string | null;
  product_inventory_profiles?: ProductInventoryProfileRow | ProductInventoryProfileRow[] | null;
};

type ProductSupplierRow = {
  product_id: string;
  supplier_id: string | null;
  is_primary: boolean | null;
  purchase_pack_qty: number | null;
  purchase_pack_unit_code: string | null;
  purchase_unit: string | null;
  purchase_price: number | null;
  purchase_price_net?: number | null;
  purchase_price_includes_tax: boolean | null;
  purchase_tax_rate: number | null;
  currency?: string | null;
};

type SupplierRow = {
  id: string;
  name: string | null;
};

type ProductUomProfileRow = {
  id: string;
  product_id: string | null;
  label: string | null;
  input_unit_code: string | null;
  qty_in_input_unit: number | null;
  qty_in_stock_unit: number | null;
  is_default: boolean | null;
  is_active: boolean | null;
  source: string | null;
  usage_context: string | null;
};

type ProductSiteSettingRow = {
  product_id: string;
  site_id: string | null;
  is_active: boolean | null;
  default_area_kind: string | null;
  area_kinds?: string[] | null;
  audience?: string | null;
  remission_enabled?: boolean | null;
  production_location_id?: string | null;
  local_production_enabled?: boolean | null;
  min_stock_qty?: number | null;
  updated_at?: string | null;
  created_at?: string | null;
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

type AreaKindRow = {
  code: string;
  name: string | null;
  use_for_remission?: boolean | null;
};

type SiteAreaPurposeRuleRow = {
  site_id: string | null;
  area_kind: string | null;
  purpose: string | null;
  is_enabled: boolean | null;
};

type LocationRow = {
  id: string;
  site_id: string | null;
  code: string | null;
  zone: string | null;
  aisle: string | null;
  level: string | null;
  description: string | null;
  location_type?: string | null;
  is_active?: boolean | null;
};

type LocationPositionRow = {
  id: string;
  location_id: string | null;
  parent_position_id: string | null;
  code: string | null;
  name: string | null;
  kind: string | null;
  sort_order: number | null;
  is_active?: boolean | null;
};

type StockBySiteRow = {
  site_id: string | null;
  product_id: string | null;
  current_qty: number | null;
  updated_at?: string | null;
};

type StockByLocationRow = {
  location_id: string | null;
  product_id: string | null;
  current_qty: number | null;
  updated_at?: string | null;
};

type StockByPositionRow = {
  position_id: string | null;
  product_id: string | null;
  current_qty: number | null;
  updated_at?: string | null;
};

type StockByUomProfileRow = {
  location_id: string | null;
  location_position_id: string | null;
  product_id: string | null;
  uom_profile_id: string | null;
  presentation_qty: number | null;
  base_qty: number | null;
  updated_at?: string | null;
};

type SupabaseClient = ReturnType<typeof createServerClient>;

function getInventoryKind(product: ProductRow): string {
  const profile = Array.isArray(product.product_inventory_profiles)
    ? product.product_inventory_profiles[0] ?? null
    : product.product_inventory_profiles ?? null;

  return String(profile?.inventory_kind ?? "").trim().toLowerCase();
}

function resolveItemType(product: ProductRow): string {
  const productType = String(product.product_type ?? "").trim().toLowerCase();
  const inventoryKind = getInventoryKind(product);

  if (productType === "insumo" && inventoryKind === "asset") return "Equipo / maquinaria";
  if (productType === "insumo") return "Insumo";
  if (productType === "preparacion") return "Preparacion";
  if (productType === "venta" && inventoryKind === "resale") return "Producto de reventa";
  if (productType === "venta") return "Producto terminado / venta";

  if (productType || inventoryKind) {
    return [productType, inventoryKind].filter(Boolean).join(" / ");
  }

  return "Sin clasificar";
}

function isOperationalRemissionType(product: ProductRow): boolean {
  const itemType = resolveItemType(product);
  return itemType !== "Equipo / maquinaria";
}

function buildLocationLabel(location?: LocationRow | null): string {
  if (!location) return "";
  const description = String(location.description ?? "").trim();
  if (description) return description;

  const parts = [
    String(location.zone ?? "").trim(),
    String(location.aisle ?? "").trim() ? `Pasillo ${String(location.aisle ?? "").trim()}` : "",
    String(location.level ?? "").trim() ? `Nivel ${String(location.level ?? "").trim()}` : "",
  ].filter(Boolean);

  const friendly = parts.join(" · ") || String(location.code ?? "").trim();
  const code = String(location.code ?? "").trim();

  if (friendly && code && friendly !== code) return `${friendly} · ${code}`;
  return friendly || code || location.id;
}

function buildPositionLabels(positions: LocationPositionRow[]): Map<string, string> {
  const byId = new Map(positions.map((row) => [row.id, row]));
  const labels = new Map<string, string>();

  function labelFor(row: LocationPositionRow): string {
    const cached = labels.get(row.id);
    if (cached) return cached;

    const own = String(row.name ?? row.code ?? row.id.slice(0, 8)).trim();
    const parent = row.parent_position_id ? byId.get(row.parent_position_id) : null;
    const label = parent ? `${labelFor(parent)} / ${own}` : own;

    labels.set(row.id, label);
    return label;
  }

  positions.forEach((row) => labelFor(row));
  return labels;
}

function resolvePurchasePriceNet(supplierRow: ProductSupplierRow): number | null {
  const explicitNet = Number(supplierRow.purchase_price_net ?? NaN);

  if (Number.isFinite(explicitNet)) {
    return explicitNet;
  }

  const gross = Number(supplierRow.purchase_price ?? NaN);

  if (!Number.isFinite(gross)) {
    return null;
  }

  const includesTax = Boolean(supplierRow.purchase_price_includes_tax);
  const taxRate = Number(supplierRow.purchase_tax_rate ?? 0);

  if (!includesTax || !Number.isFinite(taxRate) || taxRate <= 0) {
    return gross;
  }

  return gross / (1 + taxRate / 100);
}

function getDefaultRemissionProfile(
  profiles: ProductUomProfileRow[],
  productId: string
): ProductUomProfileRow | null {
  const candidates = profiles.filter(
    (profile) =>
      String(profile.product_id ?? "") === productId &&
      profile.is_active !== false &&
      profile.is_default === true
  );

  if (!candidates.length) return null;

  return [...candidates].sort((a, b) => {
    const aUsage = String(a.usage_context ?? "");
    const bUsage = String(b.usage_context ?? "");
    const aRank = aUsage === "remission" ? 0 : aUsage === "general" ? 1 : 2;
    const bRank = bUsage === "remission" ? 0 : bUsage === "general" ? 1 : 2;
    if (aRank !== bRank) return aRank - bRank;

    const aSource = String(a.source ?? "");
    const bSource = String(b.source ?? "");
    const aSourceRank = aSource === "manual" ? 0 : aSource === "recipe_portion" ? 1 : 2;
    const bSourceRank = bSource === "manual" ? 0 : bSource === "recipe_portion" ? 1 : 2;
    if (aSourceRank !== bSourceRank) return aSourceRank - bSourceRank;

    return String(a.label ?? "").localeCompare(String(b.label ?? ""), "es");
  })[0];
}

function resolveRemissionDiagnostic(params: {
  product: ProductRow;
  setting: ProductSiteSettingRow;
  remissionProfile: ProductUomProfileRow | null;
}): string {
  const { product, setting, remissionProfile } = params;

  if (product.is_active === false) return "No aparece: producto inactivo";
  if (setting.is_active === false) return "No aparece: configuracion por sede inactiva";
  if (setting.remission_enabled !== true) return "No aparece: remision deshabilitada para la sede";
  if (!isOperationalRemissionType(product)) return "No deberia aparecer: activo/equipo";
  if (!remissionProfile) return "Revisar: falta presentacion minima activa";
  if (
    !String(setting.default_area_kind ?? "").trim() &&
    (!Array.isArray(setting.area_kinds) || setting.area_kinds.length === 0)
  ) {
    return "Revisar: sin area destino configurada";
  }

  return "Deberia aparecer en solicitud";
}

async function loadOptionalRows<T>({
  supabase,
  table,
  select,
  warnings,
  limit = MAX_EXPORT_ROWS,
}: {
  supabase: SupabaseClient;
  table: string;
  select: string;
  warnings: string[];
  limit?: number;
}): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(select).limit(limit);

  if (error) {
    warnings.push(`${table}: ${error.message}`);
    return [];
  }

  return (data ?? []) as T[];
}

async function loadProductSuppliersForChunk({
  supabase,
  productIds,
}: {
  supabase: SupabaseClient;
  productIds: string[];
}): Promise<{ data: ProductSupplierRow[]; error: string | null }> {
  if (!productIds.length) {
    return { data: [], error: null };
  }

  const baseSelect =
    "product_id,supplier_id,is_primary,purchase_pack_qty,purchase_pack_unit_code,purchase_unit,purchase_price,purchase_price_includes_tax,purchase_tax_rate,currency";

  const withNetSelect = `${baseSelect},purchase_price_net`;

  const withNet = await supabase
    .from("product_suppliers")
    .select(withNetSelect)
    .in("product_id", productIds);

  if (!withNet.error) {
    return {
      data: (withNet.data ?? []) as ProductSupplierRow[],
      error: null,
    };
  }

  const missingPurchasePriceNet = isMissingColumnError(withNet.error, "purchase_price_net");
  const missingCurrency = isMissingColumnError(withNet.error, "currency");

  if (!missingPurchasePriceNet && !missingCurrency) {
    return {
      data: [],
      error: withNet.error.message,
    };
  }

  const fallbackSelect = [
    "product_id",
    "supplier_id",
    "is_primary",
    "purchase_pack_qty",
    "purchase_pack_unit_code",
    "purchase_unit",
    "purchase_price",
    missingPurchasePriceNet ? null : "purchase_price_net",
    "purchase_price_includes_tax",
    "purchase_tax_rate",
    missingCurrency ? null : "currency",
  ]
    .filter(Boolean)
    .join(",");

  const fallback = await supabase
    .from("product_suppliers")
    .select(fallbackSelect)
    .in("product_id", productIds);

  if (fallback.error) {
    return {
      data: [],
      error: fallback.error.message,
    };
  }

  return {
    data: (fallback.data ?? []) as ProductSupplierRow[],
    error: null,
  };
}

async function loadProductSuppliers({
  supabase,
  productIds,
}: {
  supabase: SupabaseClient;
  productIds: string[];
}): Promise<{ data: ProductSupplierRow[]; error: string | null }> {
  const rows: ProductSupplierRow[] = [];

  for (const chunk of chunkArray(productIds, QUERY_CHUNK_SIZE)) {
    const result = await loadProductSuppliersForChunk({
      supabase,
      productIds: chunk,
    });

    if (result.error) {
      return { data: [], error: result.error };
    }

    rows.push(...result.data);
  }

  return { data: rows, error: null };
}

async function loadProductUomProfiles({
  supabase,
  productIds,
}: {
  supabase: SupabaseClient;
  productIds: string[];
}): Promise<{ data: ProductUomProfileRow[]; error: string | null }> {
  const rows: ProductUomProfileRow[] = [];

  for (const chunk of chunkArray(productIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("product_uom_profiles")
      .select(
        "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
      )
      .in("product_id", chunk)
      .eq("is_active", true);

    if (error) {
      return { data: [], error: error.message };
    }

    rows.push(...((data ?? []) as ProductUomProfileRow[]));
  }

  return { data: rows, error: null };
}

async function loadProductSiteSettings({
  supabase,
  productIds,
}: {
  supabase: SupabaseClient;
  productIds: string[];
}): Promise<{ data: ProductSiteSettingRow[]; error: string | null }> {
  const rows: ProductSiteSettingRow[] = [];

  for (const chunk of chunkArray(productIds, QUERY_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("product_site_settings")
      .select(
        "product_id,site_id,is_active,default_area_kind,area_kinds,audience,remission_enabled,production_location_id,local_production_enabled,min_stock_qty,updated_at,created_at"
      )
      .in("product_id", chunk);

    if (error) {
      return { data: [], error: error.message };
    }

    rows.push(...((data ?? []) as ProductSiteSettingRow[]));
  }

  return { data: rows, error: null };
}

function productName(productById: Map<string, ProductRow>, productId?: string | null) {
  const product = productId ? productById.get(productId) : null;
  return product?.name ?? productId ?? "";
}

function siteName(siteById: Map<string, SiteRow>, siteId?: string | null) {
  const site = siteId ? siteById.get(siteId) : null;
  return site?.name ?? siteId ?? "";
}

export async function GET() {
  const warnings: string[] = [];
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: employee, error: employeeErr } = await supabase
    .from("employees")
    .select("role,full_name,alias")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (employeeErr) {
    return NextResponse.json(
      { error: "No se pudo validar el rol del usuario.", detail: employeeErr.message },
      { status: 400 }
    );
  }

  const role = String((employee as { role?: string } | null)?.role ?? "");
  const canExport = ["gerente_general", "propietario"].includes(role);

  if (!canExport) {
    return NextResponse.json(
      { error: "Solo gerentes y propietarios pueden exportar." },
      { status: 403 }
    );
  }

  const generatedBy =
    String((employee as { alias?: string | null; full_name?: string | null } | null)?.alias ?? "").trim() ||
    String((employee as { full_name?: string | null } | null)?.full_name ?? "").trim() ||
    userData.user.email ||
    userData.user.id;

  const { data: productsData, error: productsErr } = await supabase
    .from("products")
    .select(
      "id,name,sku,unit,stock_unit_code,cost,is_active,product_type,product_inventory_profiles(inventory_kind)"
    )
    .order("name", { ascending: true })
    .limit(5000);

  if (productsErr) {
    return NextResponse.json(
      { error: "No se pudieron cargar los productos.", detail: productsErr.message },
      { status: 400 }
    );
  }

  const products = (productsData ?? []) as unknown as ProductRow[];
  const productIds = products.map((row) => row.id).filter(Boolean);
  const productById = new Map(products.map((row) => [row.id, row]));

  const [
    productSuppliersResult,
    uomProfilesResult,
    productSiteSettingsResult,
    sites,
    areas,
    areaKinds,
    siteAreaPurposeRules,
    locations,
    locationPositions,
    stockBySite,
    stockByLocation,
    stockByPosition,
    stockByUomProfile,
  ] = await Promise.all([
    loadProductSuppliers({ supabase, productIds }),
    loadProductUomProfiles({ supabase, productIds }),
    loadProductSiteSettings({ supabase, productIds }),
    loadOptionalRows<SiteRow>({
      supabase,
      table: "sites",
      select: "id,name,site_type",
      warnings,
    }),
    loadOptionalRows<AreaRow>({
      supabase,
      table: "areas",
      select: "id,name,kind,site_id",
      warnings,
    }),
    loadOptionalRows<AreaKindRow>({
      supabase,
      table: "area_kinds",
      select: "code,name,use_for_remission",
      warnings,
    }),
    loadOptionalRows<SiteAreaPurposeRuleRow>({
      supabase,
      table: "site_area_purpose_rules",
      select: "site_id,area_kind,purpose,is_enabled",
      warnings,
    }),
    loadOptionalRows<LocationRow>({
      supabase,
      table: "inventory_locations",
      select: "id,site_id,code,zone,aisle,level,description,location_type,is_active",
      warnings,
    }),
    loadOptionalRows<LocationPositionRow>({
      supabase,
      table: "inventory_location_positions",
      select: "id,location_id,parent_position_id,code,name,kind,sort_order,is_active",
      warnings,
    }),
    loadOptionalRows<StockBySiteRow>({
      supabase,
      table: "inventory_stock_by_site",
      select: "site_id,product_id,current_qty,updated_at",
      warnings,
    }),
    loadOptionalRows<StockByLocationRow>({
      supabase,
      table: "inventory_stock_by_location",
      select: "location_id,product_id,current_qty,updated_at",
      warnings,
    }),
    loadOptionalRows<StockByPositionRow>({
      supabase,
      table: "inventory_stock_by_position",
      select: "position_id,product_id,current_qty,updated_at",
      warnings,
    }),
    loadOptionalRows<StockByUomProfileRow>({
      supabase,
      table: "inventory_stock_by_uom_profile",
      select: "location_id,location_position_id,product_id,uom_profile_id,presentation_qty,base_qty,updated_at",
      warnings,
    }),
  ]);

  if (productSuppliersResult.error) {
    return NextResponse.json(
      {
        error: "No se pudieron cargar los proveedores por producto.",
        detail: productSuppliersResult.error,
      },
      { status: 400 }
    );
  }

  if (uomProfilesResult.error) {
    return NextResponse.json(
      {
        error: "No se pudieron cargar las presentaciones.",
        detail: uomProfilesResult.error,
      },
      { status: 400 }
    );
  }

  if (productSiteSettingsResult.error) {
    return NextResponse.json(
      {
        error: "No se pudo cargar la configuracion de productos por sede.",
        detail: productSiteSettingsResult.error,
      },
      { status: 400 }
    );
  }

  const productSuppliers = productSuppliersResult.data;
  const uomProfiles = uomProfilesResult.data;
  const productSiteSettings = productSiteSettingsResult.data;
  const siteById = new Map(sites.map((row) => [row.id, row]));
  const locationById = new Map(locations.map((row) => [row.id, row]));
  const positionById = new Map(locationPositions.map((row) => [row.id, row]));
  const positionLabels = buildPositionLabels(locationPositions);

  const supplierIds = Array.from(
    new Set(productSuppliers.map((row) => String(row.supplier_id ?? "").trim()).filter(Boolean))
  );

  const suppliers = await loadOptionalRows<SupplierRow>({
    supabase,
    table: "suppliers",
    select: "id,name",
    warnings,
    limit: Math.max(supplierIds.length + 100, 1000),
  });

  const supplierNameById = new Map(suppliers.map((row) => [row.id, row.name ?? row.id]));

  const supplierRowsByProduct = new Map<string, ProductSupplierRow[]>();
  for (const row of productSuppliers) {
    const current = supplierRowsByProduct.get(row.product_id) ?? [];
    current.push(row);
    supplierRowsByProduct.set(row.product_id, current);
  }

  const uomProfilesByProduct = new Map<string, ProductUomProfileRow[]>();
  for (const profile of uomProfiles) {
    const productId = String(profile.product_id ?? "").trim();
    if (!productId) continue;
    const current = uomProfilesByProduct.get(productId) ?? [];
    current.push(profile);
    uomProfilesByProduct.set(productId, current);
  }

  const productIdsWithManualPresentation = new Set(
    uomProfiles
      .filter((row) => row.is_active !== false && String(row.source ?? "") === "manual")
      .map((row) => String(row.product_id ?? "").trim())
      .filter(Boolean)
  );

  const stockBySiteKey = new Map(
    stockBySite.map((row) => [`${row.site_id ?? ""}|${row.product_id ?? ""}`, row])
  );

  const stockByLocationKey = new Map(
    stockByLocation.map((row) => [`${row.location_id ?? ""}|${row.product_id ?? ""}`, row])
  );

  const stockByPositionKey = new Map(
    stockByPosition.map((row) => [`${row.position_id ?? ""}|${row.product_id ?? ""}`, row])
  );

  const catalogRows: Array<Array<ExcelValue | ExcelCell>> = [
    [
      "Producto",
      "Tipo item",
      "Inventario",
      "SKU",
      "Unidad base",
      "Unidad stock",
      "Costo stock",
      "Proveedor principal",
      "Precio compra",
      "Precio neto",
      "Tiene presentacion manual",
      "Presentacion remision",
      "Estado",
      "ID producto",
    ],
  ];

  for (const product of products) {
    const supplierRows = supplierRowsByProduct.get(product.id) ?? [];
    const primarySupplier = [...supplierRows].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))[0];
    const supplierName =
      supplierNameById.get(String(primarySupplier?.supplier_id ?? "")) ??
      String(primarySupplier?.supplier_id ?? "");
    const remissionProfile = getDefaultRemissionProfile(uomProfiles, product.id);

    catalogRows.push([
      product.name ?? "",
      resolveItemType(product),
      getInventoryKind(product),
      product.sku ?? "",
      product.unit ?? "",
      product.stock_unit_code ?? product.unit ?? "",
      asMoneyCell(product.cost),
      supplierName,
      asMoneyCell(primarySupplier?.purchase_price),
      asMoneyCell(primarySupplier ? resolvePurchasePriceNet(primarySupplier) : null),
      productIdsWithManualPresentation.has(product.id) ? "Si" : "No",
      remissionProfile?.label ?? "",
      product.is_active === false ? { value: "Inactivo", styleId: "Bad" } : { value: "Activo", styleId: "Good" },
      product.id,
    ]);
  }

  const suppliersRows: Array<Array<ExcelValue | ExcelCell>> = [
    [
      "Producto",
      "Tipo item",
      "SKU",
      "Proveedor",
      "Proveedor primario",
      "Precio compra",
      "Precio neto sin IVA",
      "Incluye IVA",
      "% IVA",
      "Moneda",
      "Presentacion compra qty",
      "Presentacion compra unidad",
      "Unidad operativa compra",
      "Unidad stock",
      "Estado producto",
    ],
  ];

  for (const product of products) {
    const supplierRows = supplierRowsByProduct.get(product.id) ?? [];
    if (!supplierRows.length) {
      suppliersRows.push([
        product.name ?? "",
        resolveItemType(product),
        product.sku ?? "",
        { value: "Sin proveedor", styleId: "Warn" },
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        product.stock_unit_code ?? product.unit ?? "",
        product.is_active === false ? "Inactivo" : "Activo",
      ]);
      continue;
    }

    const orderedSuppliers = [...supplierRows].sort((a, b) => {
      const aPrimary = Boolean(a.is_primary) ? 1 : 0;
      const bPrimary = Boolean(b.is_primary) ? 1 : 0;
      if (aPrimary !== bPrimary) return bPrimary - aPrimary;
      const aName = supplierNameById.get(String(a.supplier_id ?? "")) ?? String(a.supplier_id ?? "");
      const bName = supplierNameById.get(String(b.supplier_id ?? "")) ?? String(b.supplier_id ?? "");
      return aName.localeCompare(bName, "es");
    });

    for (const supplierRow of orderedSuppliers) {
      const supplierName =
        supplierNameById.get(String(supplierRow.supplier_id ?? "")) ??
        String(supplierRow.supplier_id ?? "Sin proveedor");

      suppliersRows.push([
        product.name ?? "",
        resolveItemType(product),
        product.sku ?? "",
        supplierName,
        supplierRow.is_primary ? "Si" : "No",
        asMoneyCell(supplierRow.purchase_price),
        asMoneyCell(resolvePurchasePriceNet(supplierRow)),
        supplierRow.purchase_price_includes_tax ? "Si" : "No",
        asNumberCell(supplierRow.purchase_tax_rate),
        supplierRow.currency ?? "",
        asNumberCell(supplierRow.purchase_pack_qty),
        supplierRow.purchase_pack_unit_code ?? "",
        supplierRow.purchase_unit ?? "",
        product.stock_unit_code ?? product.unit ?? "",
        product.is_active === false ? "Inactivo" : "Activo",
      ]);
    }
  }

  const presentationRows: Array<Array<ExcelValue | ExcelCell>> = [
    [
      "Producto",
      "Tipo item",
      "Perfil / presentacion",
      "Contexto uso",
      "Fuente",
      "Default",
      "Activa",
      "Cantidad input",
      "Unidad input",
      "Cantidad base stock",
      "Unidad stock",
      "ID perfil",
      "ID producto",
    ],
  ];

  for (const product of products) {
    const profiles = uomProfilesByProduct.get(product.id) ?? [];
    if (!profiles.length) {
      presentationRows.push([
        product.name ?? "",
        resolveItemType(product),
        { value: "Sin presentaciones activas", styleId: "Warn" },
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        product.stock_unit_code ?? product.unit ?? "",
        "",
        product.id,
      ]);
      continue;
    }

    const orderedProfiles = [...profiles].sort((a, b) => {
      const aDefault = Boolean(a.is_default) ? 1 : 0;
      const bDefault = Boolean(b.is_default) ? 1 : 0;
      if (aDefault !== bDefault) return bDefault - aDefault;
      return String(a.label ?? "").localeCompare(String(b.label ?? ""), "es");
    });

    for (const profile of orderedProfiles) {
      presentationRows.push([
        product.name ?? "",
        resolveItemType(product),
        profile.label ?? "",
        profile.usage_context ?? "",
        profile.source ?? "",
        profile.is_default ? "Si" : "No",
        profile.is_active === false ? "No" : "Si",
        asNumberCell(profile.qty_in_input_unit),
        profile.input_unit_code ?? "",
        asNumberCell(profile.qty_in_stock_unit),
        product.stock_unit_code ?? product.unit ?? "",
        profile.id,
        product.id,
      ]);
    }
  }

  const remissionRows: Array<Array<ExcelValue | ExcelCell>> = [
    [
      "Sede",
      "Tipo sede",
      "Producto",
      "Tipo item",
      "SKU",
      "Remision activa",
      "Config sede activa",
      "Producto activo",
      "Presentacion minima",
      "Cantidad presentacion",
      "Unidad presentacion",
      "Cantidad base",
      "Unidad stock",
      "Areas destino",
      "Area por defecto",
      "Audiencia",
      "Produccion local",
      "LOC produccion/origen",
      "Minimo stock",
      "Stock sede",
      "Diagnostico solicitud",
      "Actualizado",
      "ID producto",
      "ID sede",
    ],
  ];

  const orderedSiteSettings = [...productSiteSettings].sort((a, b) => {
    const siteA = siteName(siteById, a.site_id);
    const siteB = siteName(siteById, b.site_id);
    const siteCmp = siteA.localeCompare(siteB, "es");
    if (siteCmp !== 0) return siteCmp;

    const productA = productById.get(a.product_id)?.name ?? a.product_id;
    const productB = productById.get(b.product_id)?.name ?? b.product_id;
    return productA.localeCompare(productB, "es");
  });

  for (const setting of orderedSiteSettings) {
    const product = productById.get(setting.product_id);
    if (!product) continue;

    const site = siteById.get(String(setting.site_id ?? ""));
    const remissionProfile = getDefaultRemissionProfile(uomProfiles, product.id);
    const location = setting.production_location_id
      ? locationById.get(setting.production_location_id)
      : null;
    const areasForSetting = Array.from(
      new Set(
        [
          ...(Array.isArray(setting.area_kinds) ? setting.area_kinds : []),
          setting.default_area_kind,
        ]
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      )
    );
    const stockSiteRow = stockBySiteKey.get(`${setting.site_id ?? ""}|${setting.product_id}`);
    const diagnostic = resolveRemissionDiagnostic({
      product,
      setting,
      remissionProfile,
    });

    remissionRows.push([
      site?.name ?? setting.site_id ?? "",
      site?.site_type ?? "",
      product.name ?? product.id,
      resolveItemType(product),
      product.sku ?? "",
      setting.remission_enabled === true ? { value: "Si", styleId: "Good" } : { value: "No", styleId: "Muted" },
      setting.is_active === false ? { value: "No", styleId: "Bad" } : { value: "Si", styleId: "Good" },
      product.is_active === false ? { value: "No", styleId: "Bad" } : { value: "Si", styleId: "Good" },
      remissionProfile?.label ?? "",
      asNumberCell(remissionProfile?.qty_in_input_unit),
      remissionProfile?.input_unit_code ?? "",
      asNumberCell(remissionProfile?.qty_in_stock_unit),
      product.stock_unit_code ?? product.unit ?? "",
      areasForSetting.join(", "),
      setting.default_area_kind ?? "",
      setting.audience ?? "",
      yesNo(setting.local_production_enabled),
      buildLocationLabel(location),
      asNumberCell(setting.min_stock_qty),
      asNumberCell(stockSiteRow?.current_qty),
      diagnosticStyle(diagnostic),
      setting.updated_at ?? setting.created_at ?? "",
      product.id,
      setting.site_id ?? "",
    ]);
  }

  const stockSiteRows: Array<Array<ExcelValue | ExcelCell>> = [
    [
      "Sede",
      "Tipo sede",
      "Producto",
      "Tipo item",
      "SKU",
      "Cantidad actual",
      "Unidad stock",
      "Costo unitario",
      "Valor estimado",
      "Actualizado",
      "ID producto",
      "ID sede",
    ],
  ];

  for (const row of [...stockBySite].sort((a, b) => siteName(siteById, a.site_id).localeCompare(siteName(siteById, b.site_id), "es"))) {
    const product = row.product_id ? productById.get(row.product_id) : null;
    const site = row.site_id ? siteById.get(row.site_id) : null;
    const qty = Number(row.current_qty ?? 0);
    const cost = Number(product?.cost ?? NaN);
    const value = Number.isFinite(cost) ? qty * cost : NaN;

    stockSiteRows.push([
      site?.name ?? row.site_id ?? "",
      site?.site_type ?? "",
      product?.name ?? row.product_id ?? "",
      product ? resolveItemType(product) : "",
      product?.sku ?? "",
      asNumberCell(qty),
      product?.stock_unit_code ?? product?.unit ?? "",
      asMoneyCell(product?.cost),
      asMoneyCell(value),
      row.updated_at ?? "",
      row.product_id ?? "",
      row.site_id ?? "",
    ]);
  }

  const stockLocationRows: Array<Array<ExcelValue | ExcelCell>> = [
    [
      "Sede",
      "LOC",
      "Codigo LOC",
      "Tipo LOC",
      "LOC activo",
      "Producto",
      "Tipo item",
      "Cantidad actual",
      "Unidad stock",
      "Valor estimado",
      "ID LOC",
      "ID producto",
    ],
  ];

  for (const row of [...stockByLocation].sort((a, b) => {
    const locA = a.location_id ? locationById.get(a.location_id) : null;
    const locB = b.location_id ? locationById.get(b.location_id) : null;
    return buildLocationLabel(locA).localeCompare(buildLocationLabel(locB), "es");
  })) {
    const product = row.product_id ? productById.get(row.product_id) : null;
    const location = row.location_id ? locationById.get(row.location_id) : null;
    const site = location?.site_id ? siteById.get(location.site_id) : null;
    const qty = Number(row.current_qty ?? 0);
    const cost = Number(product?.cost ?? NaN);
    const value = Number.isFinite(cost) ? qty * cost : NaN;

    stockLocationRows.push([
      site?.name ?? location?.site_id ?? "",
      buildLocationLabel(location),
      location?.code ?? "",
      location?.location_type ?? "",
      location?.is_active === false ? "No" : "Si",
      product?.name ?? row.product_id ?? "",
      product ? resolveItemType(product) : "",
      asNumberCell(qty),
      product?.stock_unit_code ?? product?.unit ?? "",
      asMoneyCell(value),
      row.location_id ?? "",
      row.product_id ?? "",
    ]);
  }

  const stockPositionRows: Array<Array<ExcelValue | ExcelCell>> = [
    [
      "Sede",
      "LOC",
      "Posicion interna",
      "Tipo posicion",
      "Posicion activa",
      "Producto",
      "Tipo item",
      "Cantidad actual",
      "Unidad stock",
      "Valor estimado",
      "ID posicion",
      "ID LOC",
      "ID producto",
    ],
  ];

  for (const row of [...stockByPosition].sort((a, b) => {
    const labelA = a.position_id ? positionLabels.get(a.position_id) ?? a.position_id : "";
    const labelB = b.position_id ? positionLabels.get(b.position_id) ?? b.position_id : "";
    return labelA.localeCompare(labelB, "es");
  })) {
    const product = row.product_id ? productById.get(row.product_id) : null;
    const position = row.position_id ? positionById.get(row.position_id) : null;
    const location = position?.location_id ? locationById.get(position.location_id) : null;
    const site = location?.site_id ? siteById.get(location.site_id) : null;
    const qty = Number(row.current_qty ?? 0);
    const cost = Number(product?.cost ?? NaN);
    const value = Number.isFinite(cost) ? qty * cost : NaN;

    stockPositionRows.push([
      site?.name ?? location?.site_id ?? "",
      buildLocationLabel(location),
      row.position_id ? positionLabels.get(row.position_id) ?? row.position_id : "",
      position?.kind ?? "",
      position?.is_active === false ? "No" : "Si",
      product?.name ?? row.product_id ?? "",
      product ? resolveItemType(product) : "",
      asNumberCell(qty),
      product?.stock_unit_code ?? product?.unit ?? "",
      asMoneyCell(value),
      row.position_id ?? "",
      position?.location_id ?? "",
      row.product_id ?? "",
    ]);
  }

  const stockPresentationRows: Array<Array<ExcelValue | ExcelCell>> = [
    [
      "Sede",
      "LOC",
      "Posicion interna",
      "Producto",
      "Presentacion",
      "Cantidad presentacion",
      "Unidad presentacion",
      "Cantidad base",
      "Unidad stock",
      "Contexto",
      "Fuente perfil",
      "ID perfil",
      "ID LOC",
      "ID posicion",
      "ID producto",
    ],
  ];

  for (const row of [...stockByUomProfile].sort((a, b) => {
    const productA = productName(productById, a.product_id);
    const productB = productName(productById, b.product_id);
    return productA.localeCompare(productB, "es");
  })) {
    const product = row.product_id ? productById.get(row.product_id) : null;
    const location = row.location_id ? locationById.get(row.location_id) : null;
    const site = location?.site_id ? siteById.get(location.site_id) : null;
    const profile = uomProfiles.find((entry) => entry.id === row.uom_profile_id);

    stockPresentationRows.push([
      site?.name ?? location?.site_id ?? "",
      buildLocationLabel(location),
      row.location_position_id ? positionLabels.get(row.location_position_id) ?? row.location_position_id : "",
      product?.name ?? row.product_id ?? "",
      profile?.label ?? row.uom_profile_id ?? "",
      asNumberCell(row.presentation_qty),
      profile?.input_unit_code ?? "",
      asNumberCell(row.base_qty),
      product?.stock_unit_code ?? product?.unit ?? "",
      profile?.usage_context ?? "",
      profile?.source ?? "",
      row.uom_profile_id ?? "",
      row.location_id ?? "",
      row.location_position_id ?? "",
      row.product_id ?? "",
    ]);
  }

  const locRows: Array<Array<ExcelValue | ExcelCell>> = [
    [
      "Sede",
      "LOC",
      "Codigo",
      "Tipo",
      "Zona",
      "Pasillo",
      "Nivel",
      "Descripcion",
      "Activo",
      "Posiciones internas",
      "Productos con stock",
      "ID LOC",
    ],
  ];

  const positionsByLocation = new Map<string, LocationPositionRow[]>();
  for (const position of locationPositions) {
    const locationId = String(position.location_id ?? "").trim();
    if (!locationId) continue;
    const current = positionsByLocation.get(locationId) ?? [];
    current.push(position);
    positionsByLocation.set(locationId, current);
  }

  const stockProductCountByLocation = new Map<string, number>();
  for (const row of stockByLocation) {
    if (!row.location_id || !row.product_id || Number(row.current_qty ?? 0) <= 0) continue;
    stockProductCountByLocation.set(
      row.location_id,
      (stockProductCountByLocation.get(row.location_id) ?? 0) + 1
    );
  }

  for (const location of [...locations].sort((a, b) => {
    const siteCmp = siteName(siteById, a.site_id).localeCompare(siteName(siteById, b.site_id), "es");
    if (siteCmp !== 0) return siteCmp;
    return buildLocationLabel(a).localeCompare(buildLocationLabel(b), "es");
  })) {
    const site = location.site_id ? siteById.get(location.site_id) : null;
    locRows.push([
      site?.name ?? location.site_id ?? "",
      buildLocationLabel(location),
      location.code ?? "",
      location.location_type ?? "",
      location.zone ?? "",
      location.aisle ?? "",
      location.level ?? "",
      location.description ?? "",
      location.is_active === false ? "No" : "Si",
      asNumberCell((positionsByLocation.get(location.id) ?? []).length),
      asNumberCell(stockProductCountByLocation.get(location.id) ?? 0),
      location.id,
    ]);
  }

  const positionsRows: Array<Array<ExcelValue | ExcelCell>> = [
    [
      "Sede",
      "LOC",
      "Posicion interna",
      "Codigo",
      "Nombre",
      "Tipo",
      "Padre",
      "Orden",
      "Activo",
      "Productos con stock",
      "ID posicion",
      "ID LOC",
    ],
  ];

  const stockProductCountByPosition = new Map<string, number>();
  for (const row of stockByPosition) {
    if (!row.position_id || !row.product_id || Number(row.current_qty ?? 0) <= 0) continue;
    stockProductCountByPosition.set(
      row.position_id,
      (stockProductCountByPosition.get(row.position_id) ?? 0) + 1
    );
  }

  for (const position of [...locationPositions].sort((a, b) => {
    const locA = a.location_id ? locationById.get(a.location_id) : null;
    const locB = b.location_id ? locationById.get(b.location_id) : null;
    const locCmp = buildLocationLabel(locA).localeCompare(buildLocationLabel(locB), "es");
    if (locCmp !== 0) return locCmp;
    return (positionLabels.get(a.id) ?? a.id).localeCompare(positionLabels.get(b.id) ?? b.id, "es");
  })) {
    const location = position.location_id ? locationById.get(position.location_id) : null;
    const site = location?.site_id ? siteById.get(location.site_id) : null;
    positionsRows.push([
      site?.name ?? location?.site_id ?? "",
      buildLocationLabel(location),
      positionLabels.get(position.id) ?? "",
      position.code ?? "",
      position.name ?? "",
      position.kind ?? "",
      position.parent_position_id ? positionLabels.get(position.parent_position_id) ?? position.parent_position_id : "",
      asNumberCell(position.sort_order),
      position.is_active === false ? "No" : "Si",
      asNumberCell(stockProductCountByPosition.get(position.id) ?? 0),
      position.id,
      position.location_id ?? "",
    ]);
  }

  const siteRows: Array<Array<ExcelValue | ExcelCell>> = [
    [
      "Sede",
      "Tipo sede",
      "Areas",
      "LOCs",
      "Posiciones internas",
      "Productos con stock",
      "Configuraciones remision",
      "Productos remision activa",
      "ID sede",
    ],
  ];

  for (const site of [...sites].sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), "es"))) {
    const siteAreas = areas.filter((area) => area.site_id === site.id);
    const siteLocations = locations.filter((location) => location.site_id === site.id);
    const sitePositionsCount = siteLocations.reduce(
      (acc, location) => acc + (positionsByLocation.get(location.id) ?? []).length,
      0
    );
    const productsWithStock = new Set(
      stockBySite
        .filter((row) => row.site_id === site.id && Number(row.current_qty ?? 0) > 0)
        .map((row) => row.product_id)
        .filter(Boolean)
    );
    const settingsForSite = productSiteSettings.filter((row) => row.site_id === site.id);

    siteRows.push([
      site.name ?? site.id,
      site.site_type ?? "",
      asNumberCell(siteAreas.length),
      asNumberCell(siteLocations.length),
      asNumberCell(sitePositionsCount),
      asNumberCell(productsWithStock.size),
      asNumberCell(settingsForSite.length),
      asNumberCell(settingsForSite.filter((row) => row.remission_enabled === true).length),
      site.id,
    ]);
  }

  const areaRows: Array<Array<ExcelValue | ExcelCell>> = [
    [
      "Sede",
      "Area",
      "Kind",
      "Uso remision segun kind",
      "Reglas de proposito",
      "ID area",
      "ID sede",
    ],
  ];

  const areaKindByCode = new Map(areaKinds.map((kind) => [kind.code, kind]));
  const purposeRulesBySiteKind = new Map<string, SiteAreaPurposeRuleRow[]>();
  for (const rule of siteAreaPurposeRules) {
    const key = `${rule.site_id ?? ""}|${rule.area_kind ?? ""}`;
    const current = purposeRulesBySiteKind.get(key) ?? [];
    current.push(rule);
    purposeRulesBySiteKind.set(key, current);
  }

  for (const area of [...areas].sort((a, b) => siteName(siteById, a.site_id).localeCompare(siteName(siteById, b.site_id), "es"))) {
    const kind = area.kind ? areaKindByCode.get(area.kind) : null;
    const rules = purposeRulesBySiteKind.get(`${area.site_id ?? ""}|${area.kind ?? ""}`) ?? [];
    areaRows.push([
      siteName(siteById, area.site_id),
      area.name ?? "",
      area.kind ?? "",
      kind?.use_for_remission ? "Si" : "No",
      rules.map((rule) => `${rule.purpose ?? ""}: ${rule.is_enabled ? "Si" : "No"}`).join(" · "),
      area.id,
      area.site_id ?? "",
    ]);
  }

  const alertRows: Array<Array<ExcelValue | ExcelCell>> = [
    ["Severidad", "Categoria", "Mensaje", "Producto", "Sede", "Referencia"],
  ];

  for (const product of products) {
    if (product.is_active === false) continue;

    if (!productIdsWithManualPresentation.has(product.id)) {
      alertRows.push([
        { value: "Media", styleId: "Warn" },
        "Catalogo",
        "Producto activo sin presentacion manual activa.",
        product.name ?? product.id,
        "",
        product.id,
      ]);
    }
  }

  for (const setting of productSiteSettings) {
    const product = productById.get(setting.product_id);
    if (!product) continue;
    const profile = getDefaultRemissionProfile(uomProfiles, product.id);
    const diagnostic = resolveRemissionDiagnostic({ product, setting, remissionProfile: profile });

    if (diagnostic !== "Deberia aparecer en solicitud") {
      alertRows.push([
        diagnostic.includes("No aparece") ? { value: "Alta", styleId: "Bad" } : { value: "Media", styleId: "Warn" },
        "Remisiones por sede",
        diagnostic,
        product.name ?? product.id,
        siteName(siteById, setting.site_id),
        `${setting.site_id ?? ""}|${product.id}`,
      ]);
    }
  }

  for (const row of stockByLocation) {
    const location = row.location_id ? locationById.get(row.location_id) : null;
    if (!location && Number(row.current_qty ?? 0) !== 0) {
      alertRows.push([
        { value: "Alta", styleId: "Bad" },
        "Stock LOC",
        "Hay stock asociado a un LOC que no se encontro en inventory_locations.",
        productName(productById, row.product_id),
        "",
        row.location_id ?? "",
      ]);
    }
  }

  for (const row of stockByPosition) {
    const position = row.position_id ? positionById.get(row.position_id) : null;
    if (!position && Number(row.current_qty ?? 0) !== 0) {
      alertRows.push([
        { value: "Alta", styleId: "Bad" },
        "Stock posiciones",
        "Hay stock asociado a una posicion interna que no se encontro.",
        productName(productById, row.product_id),
        "",
        row.position_id ?? "",
      ]);
    }
  }

  for (const warning of warnings) {
    alertRows.push([
      { value: "Media", styleId: "Warn" },
      "Exportacion",
      warning,
      "",
      "",
      "",
    ]);
  }

  if (alertRows.length === 1) {
    alertRows.push([{ value: "OK", styleId: "Good" }, "Sistema", "No se detectaron alertas principales en la exportacion.", "", "", ""]);
  }

  const remissionEnabledSettings = productSiteSettings.filter((row) => row.remission_enabled === true);
  const operationalProducts = products.filter(isOperationalRemissionType);
  const stockValue = stockBySite.reduce((acc, row) => {
    const product = row.product_id ? productById.get(row.product_id) : null;
    const cost = Number(product?.cost ?? NaN);
    if (!Number.isFinite(cost)) return acc;
    return acc + Number(row.current_qty ?? 0) * cost;
  }, 0);

  const summaryRows: Array<Array<ExcelValue | ExcelCell>> = [
    ["Indicador", "Valor", "Lectura"],
    ["Generado por", generatedBy, `Fecha: ${nowBogotaLabel()}`],
    ["Productos en catalogo", asNumberCell(products.length), "Incluye activos e inactivos."],
    ["Productos operativos", asNumberCell(operationalProducts.length), "Excluye equipos/activos para remision."],
    ["Sedes", asNumberCell(sites.length), "Base para remisiones, stock y operacion."],
    ["Areas", asNumberCell(areas.length), "Areas operativas por sede."],
    ["LOCs", asNumberCell(locations.length), "Ubicaciones fisicas de inventario."],
    ["Posiciones internas", asNumberCell(locationPositions.length), "Niveles, estanterias, bins o ubicaciones internas."],
    ["Productos con remision activa por sede", asNumberCell(remissionEnabledSettings.length), "Filas de product_site_settings con remission_enabled."],
    ["Registros stock por sede", asNumberCell(stockBySite.length), "inventory_stock_by_site."],
    ["Registros stock por LOC", asNumberCell(stockByLocation.length), "inventory_stock_by_location."],
    ["Registros stock por posicion", asNumberCell(stockByPosition.length), "inventory_stock_by_position."],
    ["Registros stock por presentacion", asNumberCell(stockByUomProfile.length), "inventory_stock_by_uom_profile."],
    ["Valor estimado de stock", asMoneyCell(stockValue), "Cantidad por sede x costo actual del producto."],
    ["Alertas", asNumberCell(alertRows.length - 1), "Revisar la hoja Alertas."],
    ["", "", ""],
    [{ value: "Indice de hojas", styleId: "Section" }, "", ""],
    ["Catalogo maestro", "Productos, tipo, unidades, costo, proveedor principal y presentacion de remision.", ""],
    ["Proveedores compra", "Detalle proveedor-producto, precios y presentaciones de compra.", ""],
    ["Presentaciones", "Perfiles UOM/presentaciones fisicas y contextos de uso.", ""],
    ["Remisiones por sede", "Configuracion de cada producto por sede y diagnostico de aparicion en solicitud.", ""],
    ["Stock por sede", "Existencia agregada por sede.", ""],
    ["Stock por LOC", "Existencia por ubicacion fisica.", ""],
    ["Stock posiciones", "Existencia por ubicacion interna/nivel/estanteria.", ""],
    ["Stock presentaciones", "Existencia por presentacion fisica en LOC/posicion.", ""],
    ["Sedes", "Resumen operativo por sede.", ""],
    ["Areas", "Areas operativas, kinds y reglas de proposito.", ""],
    ["LOCs", "Inventario de ubicaciones fisicas.", ""],
    ["Posiciones", "Inventario de ubicaciones internas.", ""],
    ["Alertas", "Problemas de configuracion o referencias incompletas.", ""],
  ];

  const workbook = excelWorkbook([
    {
      name: "Resumen",
      title: "VENTO GROUP · NEXO",
      subtitle: "Libro maestro operativo · Catalogo, remisiones, sedes, areas, LOCs, posiciones internas y stock",
      columns: [190, 140, 420],
      rows: summaryRows,
    },
    {
      name: "Catalogo maestro",
      title: "VENTO GROUP · Catalogo maestro",
      subtitle: "Productos, clasificacion, unidades, costos y proveedor principal",
      columns: [260, 150, 120, 110, 95, 95, 95, 220, 90, 90, 120, 170, 90, 230],
      rows: catalogRows,
    },
    {
      name: "Proveedores compra",
      title: "VENTO GROUP · Proveedores y compra",
      subtitle: "Detalle proveedor-producto, precios, impuestos y presentaciones de compra",
      columns: [260, 150, 100, 220, 90, 90, 90, 80, 65, 80, 110, 120, 130, 90, 90],
      rows: suppliersRows,
    },
    {
      name: "Presentaciones",
      title: "VENTO GROUP · Presentaciones fisicas",
      subtitle: "Perfiles UOM usados para compras, remisiones, unidades operativas y stock",
      columns: [260, 150, 210, 105, 110, 70, 70, 95, 95, 105, 90, 230, 230],
      rows: presentationRows,
    },
    {
      name: "Remisiones por sede",
      title: "VENTO GROUP · Remisiones por sede",
      subtitle: "Auditoria para validar que cada producto aparezca correctamente en solicitud de remision",
      columns: [170, 95, 260, 145, 95, 85, 90, 85, 190, 105, 105, 95, 90, 180, 120, 90, 95, 190, 90, 95, 240, 140, 230, 230],
      rows: remissionRows,
    },
    {
      name: "Stock por sede",
      title: "VENTO GROUP · Stock por sede",
      subtitle: "Existencia agregada por sede y valor estimado con costo actual",
      columns: [170, 95, 260, 145, 95, 95, 90, 90, 100, 140, 230, 230],
      rows: stockSiteRows,
    },
    {
      name: "Stock por LOC",
      title: "VENTO GROUP · Stock por LOC",
      subtitle: "Existencia por ubicacion fisica de inventario",
      columns: [170, 230, 95, 100, 80, 260, 145, 95, 90, 100, 230, 230],
      rows: stockLocationRows,
    },
    {
      name: "Stock posiciones",
      title: "VENTO GROUP · Stock por posiciones internas",
      subtitle: "Existencia por estanteria, nivel, bin o ubicacion interna",
      columns: [170, 220, 260, 100, 80, 260, 145, 95, 90, 100, 230, 230, 230],
      rows: stockPositionRows,
    },
    {
      name: "Stock presentaciones",
      title: "VENTO GROUP · Stock por presentacion",
      subtitle: "Presentaciones fisicas disponibles por LOC y posicion interna",
      columns: [170, 220, 260, 260, 210, 110, 105, 105, 90, 100, 110, 230, 230, 230, 230],
      rows: stockPresentationRows,
    },
    {
      name: "Sedes",
      title: "VENTO GROUP · Sedes",
      subtitle: "Resumen de estructura operativa por sede",
      columns: [190, 110, 90, 90, 115, 125, 135, 140, 230],
      rows: siteRows,
    },
    {
      name: "Areas",
      title: "VENTO GROUP · Areas operativas",
      subtitle: "Areas, kinds y reglas de uso para remisiones/operacion",
      columns: [170, 220, 110, 120, 360, 230, 230],
      rows: areaRows,
    },
    {
      name: "LOCs",
      title: "VENTO GROUP · LOCs",
      subtitle: "Ubicaciones fisicas de inventario por sede",
      columns: [170, 240, 95, 100, 110, 80, 80, 260, 75, 115, 115, 230],
      rows: locRows,
    },
    {
      name: "Posiciones",
      title: "VENTO GROUP · Posiciones internas",
      subtitle: "Niveles, estanterias, bins o posiciones internas dentro de LOCs",
      columns: [170, 230, 260, 100, 150, 105, 220, 80, 75, 115, 230, 230],
      rows: positionsRows,
    },
    {
      name: "Alertas",
      title: "VENTO GROUP · Alertas de configuracion",
      subtitle: "Puntos a revisar para catalogo, remisiones, stock y referencias operativas",
      columns: [90, 150, 420, 260, 170, 260],
      rows: alertRows,
    },
  ]);

  return new NextResponse(workbook, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": 'attachment; filename="nexo-libro-maestro-operativo.xls"',
      "Cache-Control": "no-store",
    },
  });
}
