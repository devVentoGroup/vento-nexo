import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import ExcelJS from "exceljs";

import { selectRemissionRequestUomProfile } from "@/lib/inventory/uom";

export const runtime = "nodejs";

const QUERY_CHUNK_SIZE = 250;
const MAX_EXPORT_ROWS = 20000;

const BRAND = {
  black: "FF1B1A1F",
  magenta: "FFE2006A",
  rose: "FFB76E79",
  porcelain: "FFF7F5F8",
  soft: "FFF2EEF2",
  line: "FFE6E1EA",
  muted: "FF6B6574",
  white: "FFFFFFFF",
  goodText: "FF14532D",
  goodFill: "FFDCFCE7",
  warnText: "FF7C2D12",
  warnFill: "FFFEF3C7",
  badText: "FF7F1D1D",
  badFill: "FFFEE2E2",
  skyFill: "FFEFF6FF",
};

type ExportValue = string | number | boolean | Date | null | undefined;

type ExportCell = {
  value: ExportValue;
  tone?: "good" | "warn" | "bad" | "muted" | "brand" | "section";
  numFmt?: string;
};

type ExportRow = Array<ExportValue | ExportCell>;

type ExportSheet = {
  name: string;
  title: string;
  subtitle: string;
  columns: Array<{ header: string; width: number; key?: string; numFmt?: string }>;
  rows: ExportRow[];
  tabColor?: string;
  freezeRows?: number;
};

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

function asPlainCell(cell: ExportValue | ExportCell): ExportCell {
  if (typeof cell === "object" && cell !== null && "value" in cell) return cell;
  return { value: cell };
}

function normalizeExcelValue(value: ExportValue): ExcelJS.CellValue {
  if (value === undefined || value === null) return null;
  return value as ExcelJS.CellValue;
}

function yesNo(value: unknown): string {
  return value ? "Si" : "No";
}

function nowBogotaLabel(): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
}

function asNumberCell(value: unknown): ExportCell {
  const n = Number(value);
  return Number.isFinite(n)
    ? { value: n, numFmt: "#,##0.###" }
    : { value: null };
}

function asMoneyCell(value: unknown): ExportCell {
  const n = Number(value);
  return Number.isFinite(n)
    ? { value: n, numFmt: '"$" #,##0.00' }
    : { value: null };
}

function diagnosticStyle(value: string): ExportCell {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("deberia") || normalized.includes("ok")) {
    return { value, tone: "good" };
  }
  if (normalized.includes("revisar") || normalized.includes("advertencia")) {
    return { value, tone: "warn" };
  }
  if (normalized.includes("no aparece") || normalized.includes("error") || normalized.includes("falta")) {
    return { value, tone: "bad" };
  }
  return { value };
}

function applyBaseSheetSetup(worksheet: ExcelJS.Worksheet) {
  worksheet.properties.defaultRowHeight = 18;
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.45,
      bottom: 0.45,
      header: 0.2,
      footer: 0.2,
    },
  };
}

function styleCell(cell: ExcelJS.Cell, source: ExportCell) {
  cell.alignment = {
    vertical: "middle",
    horizontal: typeof source.value === "number" ? "right" : "left",
    wrapText: true,
  };

  cell.border = {
    top: { style: "thin", color: { argb: BRAND.line } },
    left: { style: "thin", color: { argb: BRAND.line } },
    bottom: { style: "thin", color: { argb: BRAND.line } },
    right: { style: "thin", color: { argb: BRAND.line } },
  };

  if (source.numFmt) cell.numFmt = source.numFmt;

  if (source.tone === "good") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.goodFill } };
    cell.font = { color: { argb: BRAND.goodText } };
  } else if (source.tone === "warn") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.warnFill } };
    cell.font = { color: { argb: BRAND.warnText } };
  } else if (source.tone === "bad") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.badFill } };
    cell.font = { color: { argb: BRAND.badText } };
  } else if (source.tone === "muted") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.porcelain } };
    cell.font = { color: { argb: BRAND.muted } };
  } else if (source.tone === "section") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.soft } };
    cell.font = { bold: true, color: { argb: BRAND.black } };
  }
}

function paintHeader(row: ExcelJS.Row) {
  row.height = 30;
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.soft } };
    cell.font = { bold: true, color: { argb: BRAND.black }, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: BRAND.line } },
      left: { style: "thin", color: { argb: BRAND.line } },
      bottom: { style: "medium", color: { argb: BRAND.rose } },
      right: { style: "thin", color: { argb: BRAND.line } },
    };
  });
}

function addDataWorksheet(workbook: ExcelJS.Workbook, sheet: ExportSheet) {
  const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31), {
    properties: {
      tabColor: { argb: sheet.tabColor ?? BRAND.magenta },
    },
    views: [
      {
        state: "frozen",
        ySplit: sheet.freezeRows ?? 4,
        showGridLines: false,
      },
    ],
  });

  applyBaseSheetSetup(worksheet);

  worksheet.columns = sheet.columns.map((column, index) => ({
    key: column.key ?? `c${index + 1}`,
    width: column.width,
  }));

  const lastColumn = Math.max(sheet.columns.length, 1);
  const lastColumnLetter = worksheet.getColumn(lastColumn).letter;

  worksheet.mergeCells(`A1:${lastColumnLetter}1`);
  const titleCell = worksheet.getCell("A1");
  titleCell.value = sheet.title;
  titleCell.font = { name: "Aptos Display", bold: true, size: 18, color: { argb: BRAND.magenta } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.white } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(1).height = 32;

  worksheet.mergeCells(`A2:${lastColumnLetter}2`);
  const subtitleCell = worksheet.getCell("A2");
  subtitleCell.value = sheet.subtitle;
  subtitleCell.font = { name: "Aptos", size: 10, color: { argb: BRAND.muted } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.porcelain } };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  worksheet.getRow(2).height = 24;

  worksheet.getRow(3).height = 8;

  const headerRow = worksheet.getRow(4);
  sheet.columns.forEach((column, index) => {
    headerRow.getCell(index + 1).value = column.header;
  });
  paintHeader(headerRow);

  sheet.rows.forEach((sourceRow, rowIndex) => {
    const row = worksheet.getRow(rowIndex + 5);
    sourceRow.forEach((sourceCell, columnIndex) => {
      const parsed = asPlainCell(sourceCell);
      const cell = row.getCell(columnIndex + 1);
      const column = sheet.columns[columnIndex];

      cell.value = normalizeExcelValue(parsed.value);
      styleCell(cell, {
        ...parsed,
        numFmt: parsed.numFmt ?? column?.numFmt,
      });
    });

    row.height = 22;
  });

  const finalRow = Math.max(4 + sheet.rows.length, 4);
  worksheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: finalRow, column: lastColumn },
  };

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 4) return;
    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        if (!cell.fill) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCFBFD" } };
        }
      });
    }
  });

  return worksheet;
}

function addSummaryWorksheet(params: {
  workbook: ExcelJS.Workbook;
  generatedBy: string;
  metrics: Array<{ label: string; value: string | number; detail: string; tone?: ExportCell["tone"] }>;
  indexRows: Array<[string, string]>;
  alertCount: number;
}) {
  const { workbook, generatedBy, metrics, indexRows, alertCount } = params;
  const worksheet = workbook.addWorksheet("Resumen", {
    properties: { tabColor: { argb: BRAND.rose } },
    views: [{ state: "frozen", ySplit: 8, showGridLines: false }],
  });

  applyBaseSheetSetup(worksheet);

  worksheet.columns = [
    { width: 4 },
    { width: 26 },
    { width: 18 },
    { width: 42 },
    { width: 4 },
    { width: 26 },
    { width: 18 },
    { width: 42 },
  ];

  worksheet.mergeCells("B2:H2");
  const title = worksheet.getCell("B2");
  title.value = "VENTO GROUP · NEXO";
  title.font = { name: "Aptos Display", bold: true, size: 24, color: { argb: BRAND.magenta } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.white } };
  title.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(2).height = 38;

  worksheet.mergeCells("B3:H3");
  const subtitle = worksheet.getCell("B3");
  subtitle.value = "Libro maestro operativo · Catálogo, remisiones, sedes, áreas, LOCs, posiciones internas y stock";
  subtitle.font = { name: "Aptos", size: 11, color: { argb: BRAND.muted } };
  subtitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.porcelain } };
  subtitle.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  worksheet.getRow(3).height = 25;

  worksheet.mergeCells("B5:D5");
  worksheet.getCell("B5").value = `Generado por ${generatedBy}`;
  worksheet.getCell("B5").font = { bold: true, color: { argb: BRAND.black } };
  worksheet.getCell("B5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.soft } };

  worksheet.mergeCells("F5:H5");
  worksheet.getCell("F5").value = `Fecha ${nowBogotaLabel()}`;
  worksheet.getCell("F5").font = { bold: true, color: { argb: BRAND.black } };
  worksheet.getCell("F5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.soft } };

  const metricStartRow = 7;
  metrics.forEach((metric, index) => {
    const block = index % 2 === 0 ? 2 : 6;
    const rowNumber = metricStartRow + Math.floor(index / 2) * 4;

    worksheet.mergeCells(rowNumber, block, rowNumber, block + 2);
    const label = worksheet.getCell(rowNumber, block);
    label.value = metric.label;
    label.font = { bold: true, color: { argb: BRAND.muted }, size: 9 };
    label.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.porcelain } };

    worksheet.mergeCells(rowNumber + 1, block, rowNumber + 1, block + 2);
    const value = worksheet.getCell(rowNumber + 1, block);
    value.value = metric.value;
    value.font = {
      bold: true,
      size: 18,
      color: { argb: metric.tone === "bad" ? BRAND.badText : metric.tone === "warn" ? BRAND.warnText : BRAND.black },
    };
    value.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb: metric.tone === "bad" ? BRAND.badFill : metric.tone === "warn" ? BRAND.warnFill : BRAND.white,
      },
    };

    worksheet.mergeCells(rowNumber + 2, block, rowNumber + 2, block + 2);
    const detail = worksheet.getCell(rowNumber + 2, block);
    detail.value = metric.detail;
    detail.font = { size: 9, color: { argb: BRAND.muted } };
    detail.alignment = { wrapText: true, vertical: "top" };
  });

  const indexStart = metricStartRow + Math.ceil(metrics.length / 2) * 4 + 2;
  worksheet.mergeCells(indexStart, 2, indexStart, 8);
  const section = worksheet.getCell(indexStart, 2);
  section.value = "Índice de hojas";
  section.font = { bold: true, size: 14, color: { argb: BRAND.black } };
  section.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.soft } };

  worksheet.getRow(indexStart + 1).values = [
    undefined,
    "Hoja",
    "Descripción",
    "",
    "",
    "",
    "",
    "",
  ];
  paintHeader(worksheet.getRow(indexStart + 1));

  indexRows.forEach(([sheetName, description], index) => {
    const row = worksheet.getRow(indexStart + 2 + index);
    row.getCell(2).value = sheetName;
    row.getCell(2).font = { bold: true, color: { argb: BRAND.magenta } };
    row.getCell(3).value = description;
    worksheet.mergeCells(row.number, 3, row.number, 8);
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: BRAND.line } },
        bottom: { style: "thin", color: { argb: BRAND.line } },
      };
      cell.alignment = { wrapText: true, vertical: "middle" };
    });
  });

  if (alertCount > 0) {
    worksheet.mergeCells("F6:H6");
    const alert = worksheet.getCell("F6");
    alert.value = `${alertCount} alerta(s) por revisar`;
    alert.font = { bold: true, color: { argb: BRAND.warnText } };
    alert.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND.warnFill } };
  }

  return worksheet;
}

async function tryAddLogo(workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet) {
  void workbook;
  void worksheet;
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

type SupplierPaymentType = "cash" | "credit";

type SupplierRow = {
  id: string;
  name: string | null;
  payment_type?: SupplierPaymentType | string | null;
  credit_days?: number | null;
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

function resolveRemissionDiagnostic(params: {
  product: ProductRow;
  setting: ProductSiteSettingRow;
  remissionProfile: ProductUomProfileRow | null;
}): string {
  const { product, setting, remissionProfile } = params;

  if (product.is_active === false) return "No aparece: producto inactivo";
  if (setting.is_active === false) return "No aparece: configuración por sede inactiva";
  if (setting.remission_enabled !== true) return "No aparece: remisión deshabilitada para la sede";
  if (!isOperationalRemissionType(product)) return "No deberia aparecer: activo/equipo";
  if (!remissionProfile) return "Revisar: falta presentación de remisión";
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

function resolveSupplierPaymentType(supplier?: SupplierRow | null): SupplierPaymentType | null {
  const raw = String(supplier?.payment_type ?? "").trim().toLowerCase();

  if (raw === "credit") return "credit";
  if (raw === "cash") return "cash";

  return null;
}

function supplierPaymentTermsLabel(supplier?: SupplierRow | null): string {
  const paymentType = resolveSupplierPaymentType(supplier);

  if (!paymentType) return "Sin dato";

  if (paymentType === "credit") {
    const creditDays = Number(supplier?.credit_days ?? NaN);
    return Number.isFinite(creditDays) && creditDays > 0 ? `Crédito · ${creditDays} días` : "Crédito";
  }

  return "Contado";
}

async function loadSuppliers({
  supabase,
  warnings,
}: {
  supabase: SupabaseClient;
  warnings: string[];
}): Promise<SupplierRow[]> {
  const withPaymentTerms = await supabase
    .from("suppliers")
    .select("id,name,payment_type,credit_days")
    .limit(5000);

  if (!withPaymentTerms.error) {
    return (withPaymentTerms.data ?? []) as SupplierRow[];
  }

  const missingPaymentType = isMissingColumnError(withPaymentTerms.error, "payment_type");
  const missingCreditDays = isMissingColumnError(withPaymentTerms.error, "credit_days");

  if (!missingPaymentType && !missingCreditDays) {
    warnings.push(`suppliers: ${withPaymentTerms.error.message}`);
    return [];
  }

  warnings.push(
    "suppliers: no se pudieron leer payment_type/credit_days; la condicion de pago se exportara como Sin dato."
  );

  const fallbackSelect = [
    "id",
    "name",
    missingPaymentType ? null : "payment_type",
    missingCreditDays ? null : "credit_days",
  ]
    .filter(Boolean)
    .join(",");

  const fallback = await supabase.from("suppliers").select(fallbackSelect).limit(5000);

  if (fallback.error) {
    warnings.push(`suppliers: ${fallback.error.message}`);
    return [];
  }

  return (fallback.data ?? []) as SupplierRow[];
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
        error: "No se pudo cargar la configuración de productos por sede.",
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

  const suppliers = await loadSuppliers({ supabase, warnings });
  const supplierById = new Map(suppliers.map((row) => [row.id, row]));
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

  const catalogRows: ExportRow[] = [];
  for (const product of products) {
    const supplierRows = supplierRowsByProduct.get(product.id) ?? [];
    const primarySupplier = [...supplierRows].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))[0];
    const primarySupplierId = String(primarySupplier?.supplier_id ?? "");
    const supplier = primarySupplierId ? supplierById.get(primarySupplierId) : null;
    const supplierName = supplier?.name ?? supplierNameById.get(primarySupplierId) ?? primarySupplierId;
    const supplierPaymentTerms = primarySupplier ? supplierPaymentTermsLabel(supplier) : "";
    const remissionProfile = selectRemissionRequestUomProfile({
      profiles: uomProfiles,
      productId: product.id,
    });

    catalogRows.push([
      product.name ?? "",
      resolveItemType(product),
      getInventoryKind(product),
      product.sku ?? "",
      product.unit ?? "",
      product.stock_unit_code ?? product.unit ?? "",
      asMoneyCell(product.cost),
      supplierName,
      supplierPaymentTerms,
      asMoneyCell(primarySupplier?.purchase_price),
      asMoneyCell(primarySupplier ? resolvePurchasePriceNet(primarySupplier) : null),
      productIdsWithManualPresentation.has(product.id) ? { value: "Si", tone: "good" } : { value: "No", tone: "warn" },
      remissionProfile?.label ?? "",
      product.is_active === false ? { value: "Inactivo", tone: "bad" } : { value: "Activo", tone: "good" },
      product.id,
    ]);
  }

  const suppliersRows: ExportRow[] = [];
  for (const product of products) {
    const supplierRows = supplierRowsByProduct.get(product.id) ?? [];
    if (!supplierRows.length) {
      suppliersRows.push([
        product.name ?? "",
        resolveItemType(product),
        product.sku ?? "",
        { value: "Sin proveedor", tone: "warn" },
        "",
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
      const supplierId = String(supplierRow.supplier_id ?? "");
      const supplier = supplierId ? supplierById.get(supplierId) : null;
      const supplierName =
        supplier?.name ?? supplierNameById.get(supplierId) ?? String(supplierRow.supplier_id ?? "Sin proveedor");
      const supplierPaymentTerms = supplierPaymentTermsLabel(supplier);

      suppliersRows.push([
        product.name ?? "",
        resolveItemType(product),
        product.sku ?? "",
        supplierName,
        supplierPaymentTerms,
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

  const presentationRows: ExportRow[] = [];
  for (const product of products) {
    const profiles = uomProfilesByProduct.get(product.id) ?? [];
    if (!profiles.length) {
      presentationRows.push([
        product.name ?? "",
        resolveItemType(product),
        { value: "Sin presentaciones activas", tone: "warn" },
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
        profile.is_active === false ? { value: "No", tone: "bad" } : { value: "Si", tone: "good" },
        asNumberCell(profile.qty_in_input_unit),
        profile.input_unit_code ?? "",
        asNumberCell(profile.qty_in_stock_unit),
        product.stock_unit_code ?? product.unit ?? "",
        profile.id,
        product.id,
      ]);
    }
  }

  const remissionRows: ExportRow[] = [];
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
    const remissionProfile = selectRemissionRequestUomProfile({
      profiles: uomProfiles,
      productId: product.id,
    });
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
      setting.remission_enabled === true ? { value: "Si", tone: "good" } : { value: "No", tone: "muted" },
      setting.is_active === false ? { value: "No", tone: "bad" } : { value: "Si", tone: "good" },
      product.is_active === false ? { value: "No", tone: "bad" } : { value: "Si", tone: "good" },
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

  const stockSiteRows: ExportRow[] = [];
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

  const stockLocationRows: ExportRow[] = [];
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
      row.updated_at ?? "",
      row.location_id ?? "",
      row.product_id ?? "",
    ]);
  }

  const stockPositionRows: ExportRow[] = [];
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
      row.updated_at ?? "",
      row.position_id ?? "",
      position?.location_id ?? "",
      row.product_id ?? "",
    ]);
  }

  const stockPresentationRows: ExportRow[] = [];
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
      row.updated_at ?? "",
      row.uom_profile_id ?? "",
      row.location_id ?? "",
      row.location_position_id ?? "",
      row.product_id ?? "",
    ]);
  }

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

  const locRows: ExportRow[] = [];
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
      location.is_active === false ? { value: "No", tone: "bad" } : { value: "Si", tone: "good" },
      asNumberCell((positionsByLocation.get(location.id) ?? []).length),
      asNumberCell(stockProductCountByLocation.get(location.id) ?? 0),
      location.id,
    ]);
  }

  const stockProductCountByPosition = new Map<string, number>();
  for (const row of stockByPosition) {
    if (!row.position_id || !row.product_id || Number(row.current_qty ?? 0) <= 0) continue;
    stockProductCountByPosition.set(
      row.position_id,
      (stockProductCountByPosition.get(row.position_id) ?? 0) + 1
    );
  }

  const positionsRows: ExportRow[] = [];
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
      position.is_active === false ? { value: "No", tone: "bad" } : { value: "Si", tone: "good" },
      asNumberCell(stockProductCountByPosition.get(position.id) ?? 0),
      position.id,
      position.location_id ?? "",
    ]);
  }

  const siteRows: ExportRow[] = [];
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

  const areaKindByCode = new Map(areaKinds.map((kind) => [kind.code, kind]));
  const purposeRulesBySiteKind = new Map<string, SiteAreaPurposeRuleRow[]>();
  for (const rule of siteAreaPurposeRules) {
    const key = `${rule.site_id ?? ""}|${rule.area_kind ?? ""}`;
    const current = purposeRulesBySiteKind.get(key) ?? [];
    current.push(rule);
    purposeRulesBySiteKind.set(key, current);
  }

  const areaRows: ExportRow[] = [];
  for (const area of [...areas].sort((a, b) => siteName(siteById, a.site_id).localeCompare(siteName(siteById, b.site_id), "es"))) {
    const kind = area.kind ? areaKindByCode.get(area.kind) : null;
    const rules = purposeRulesBySiteKind.get(`${area.site_id ?? ""}|${area.kind ?? ""}`) ?? [];
    areaRows.push([
      siteName(siteById, area.site_id),
      area.name ?? "",
      area.kind ?? "",
      kind?.use_for_remission ? { value: "Si", tone: "good" } : { value: "No", tone: "muted" },
      rules.map((rule) => `${rule.purpose ?? ""}: ${rule.is_enabled ? "Si" : "No"}`).join(" · "),
      area.id,
      area.site_id ?? "",
    ]);
  }

  const alertRows: ExportRow[] = [];

  for (const product of products) {
    if (product.is_active === false) continue;

    if (!productIdsWithManualPresentation.has(product.id)) {
      alertRows.push([
        { value: "Media", tone: "warn" },
        "Catálogo",
        "Producto activo sin presentación manual activa.",
        product.name ?? product.id,
        "",
        product.id,
      ]);
    }
  }

  for (const setting of productSiteSettings) {
    const product = productById.get(setting.product_id);
    if (!product) continue;
    const profile = selectRemissionRequestUomProfile({
      profiles: uomProfiles,
      productId: product.id,
    });
    const diagnostic = resolveRemissionDiagnostic({ product, setting, remissionProfile: profile });

    if (diagnostic !== "Deberia aparecer en solicitud") {
      alertRows.push([
        diagnostic.includes("No aparece") ? { value: "Alta", tone: "bad" } : { value: "Media", tone: "warn" },
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
        { value: "Alta", tone: "bad" },
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
        { value: "Alta", tone: "bad" },
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
      { value: "Media", tone: "warn" },
      "Exportacion",
      warning,
      "",
      "",
      "",
    ]);
  }

  if (!alertRows.length) {
    alertRows.push([{ value: "OK", tone: "good" }, "Sistema", "No se detectaron alertas principales en la exportacion.", "", "", ""]);
  }

  const remissionEnabledSettings = productSiteSettings.filter((row) => row.remission_enabled === true);
  const operationalProducts = products.filter(isOperationalRemissionType);
  const stockValue = stockBySite.reduce((acc, row) => {
    const product = row.product_id ? productById.get(row.product_id) : null;
    const cost = Number(product?.cost ?? NaN);
    if (!Number.isFinite(cost)) return acc;
    return acc + Number(row.current_qty ?? 0) * cost;
  }, 0);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VENTO GROUP";
  workbook.company = "VENTO GROUP";
  workbook.subject = "NEXO · Libro maestro operativo";
  workbook.title = "NEXO · Libro maestro operativo";
  workbook.created = new Date();
  workbook.modified = new Date();

  const summary = addSummaryWorksheet({
    workbook,
    generatedBy,
    alertCount: alertRows.length,
    metrics: [
      { label: "Productos en catálogo", value: products.length, detail: "Incluye activos e inactivos." },
      { label: "Productos operativos", value: operationalProducts.length, detail: "Excluye equipos/activos para remisión." },
      { label: "Sedes", value: sites.length, detail: "Base para remisiones, stock y operación." },
      { label: "Áreas", value: areas.length, detail: "Áreas operativas por sede." },
      { label: "LOCs", value: locations.length, detail: "Ubicaciones físicas de inventario." },
      { label: "Posiciones internas", value: locationPositions.length, detail: "Niveles, estanterías, bins o ubicaciones internas." },
      { label: "Remisiones activas por sede", value: remissionEnabledSettings.length, detail: "Filas de product_site_settings con remission_enabled." },
      { label: "Stock por sede", value: stockBySite.length, detail: "Registros en inventory_stock_by_site." },
      { label: "Stock por LOC", value: stockByLocation.length, detail: "Registros en inventory_stock_by_location." },
      { label: "Stock por posición", value: stockByPosition.length, detail: "Registros en inventory_stock_by_position." },
      { label: "Stock por presentación", value: stockByUomProfile.length, detail: "Registros en inventory_stock_by_uom_profile." },
      { label: "Valor estimado stock", value: stockValue, detail: "Cantidad por sede x costo actual.", tone: "good" },
      { label: "Alertas", value: alertRows.length, detail: "Revisar hoja Alertas.", tone: alertRows.length > 0 ? "warn" : "good" },
    ],
    indexRows: [
      ["Catálogo maestro", "Productos, clasificación, unidades, costos, proveedor principal, condición de pago y presentación de remisión."],
      ["Proveedores compra", "Detalle proveedor-producto, condición de pago, precios, impuestos y presentaciones de compra."],
      ["Presentaciones", "Perfiles UOM/presentaciones físicas y contextos de uso."],
      ["Remisiones por sede", "Configuración de cada producto por sede y diagnóstico de aparición en solicitud."],
      ["Stock por sede", "Existencia agregada por sede."],
      ["Stock por LOC", "Existencia por ubicación física."],
      ["Stock posiciones", "Existencia por ubicación interna, nivel o estantería."],
      ["Stock presentaciones", "Existencia por presentación física en LOC o posición."],
      ["Sedes", "Resumen operativo por sede."],
      ["Áreas", "Áreas operativas, kinds y reglas de propósito."],
      ["LOCs", "Inventario de ubicaciones físicas."],
      ["Posiciones", "Inventario de ubicaciones internas."],
      ["Alertas", "Problemas de configuración o referencias incompletas."],
    ],
  });
  await tryAddLogo(workbook, summary);

  const sheetDefinitions: ExportSheet[] = [
    {
      name: "Catálogo maestro",
      title: "VENTO GROUP · Catálogo maestro",
      subtitle: "Productos, clasificación, unidades, costos, proveedor principal y condición de pago",
      tabColor: BRAND.magenta,
      columns: [
        { header: "Producto", width: 34 },
        { header: "Tipo item", width: 20 },
        { header: "Inventario", width: 16 },
        { header: "SKU", width: 14 },
        { header: "Unidad base", width: 13 },
        { header: "Unidad stock", width: 13 },
        { header: "Costo stock", width: 14, numFmt: '"$" #,##0.00' },
        { header: "Proveedor principal", width: 28 },
        { header: "Condición proveedor", width: 18 },
        { header: "Precio compra", width: 14, numFmt: '"$" #,##0.00' },
        { header: "Precio neto", width: 14, numFmt: '"$" #,##0.00' },
        { header: "Tiene presentación manual", width: 18 },
        { header: "Presentación remisión", width: 24 },
        { header: "Estado", width: 13 },
        { header: "ID producto", width: 36 },
      ],
      rows: catalogRows,
    },
    {
      name: "Proveedores compra",
      title: "VENTO GROUP · Proveedores y compra",
      subtitle: "Detalle proveedor-producto, condición de pago, precios, impuestos y presentaciones de compra",
      tabColor: BRAND.rose,
      columns: [
        { header: "Producto", width: 34 },
        { header: "Tipo item", width: 20 },
        { header: "SKU", width: 14 },
        { header: "Proveedor", width: 30 },
        { header: "Condición pago", width: 18 },
        { header: "Proveedor primario", width: 14 },
        { header: "Precio compra", width: 14, numFmt: '"$" #,##0.00' },
        { header: "Precio neto sin IVA", width: 16, numFmt: '"$" #,##0.00' },
        { header: "Incluye IVA", width: 12 },
        { header: "% IVA", width: 10, numFmt: "0.00" },
        { header: "Moneda", width: 10 },
        { header: "Presentación compra qty", width: 17, numFmt: "#,##0.###" },
        { header: "Presentación compra unidad", width: 18 },
        { header: "Unidad operativa compra", width: 18 },
        { header: "Unidad stock", width: 13 },
        { header: "Estado producto", width: 14 },
      ],
      rows: suppliersRows,
    },
    {
      name: "Presentaciones",
      title: "VENTO GROUP · Presentaciones físicas",
      subtitle: "Perfiles UOM usados para compras, remisiones, unidades operativas y stock",
      tabColor: "FF9E9AA6",
      columns: [
        { header: "Producto", width: 34 },
        { header: "Tipo item", width: 20 },
        { header: "Perfil / presentación", width: 28 },
        { header: "Contexto uso", width: 16 },
        { header: "Fuente", width: 16 },
        { header: "Default", width: 10 },
        { header: "Activa", width: 10 },
        { header: "Cantidad input", width: 14, numFmt: "#,##0.###" },
        { header: "Unidad input", width: 13 },
        { header: "Cantidad base stock", width: 16, numFmt: "#,##0.###" },
        { header: "Unidad stock", width: 13 },
        { header: "ID perfil", width: 36 },
        { header: "ID producto", width: 36 },
      ],
      rows: presentationRows,
    },
    {
      name: "Remisiones por sede",
      title: "VENTO GROUP · Remisiones por sede",
      subtitle: "Auditoría para validar que cada producto aparezca correctamente en solicitud de remisión",
      tabColor: BRAND.magenta,
      columns: [
        { header: "Sede", width: 22 },
        { header: "Tipo sede", width: 13 },
        { header: "Producto", width: 34 },
        { header: "Tipo item", width: 20 },
        { header: "SKU", width: 14 },
        { header: "Remisión activa", width: 14 },
        { header: "Config sede activa", width: 16 },
        { header: "Producto activo", width: 15 },
        { header: "Presentación remisión", width: 26 },
        { header: "Cantidad presentación", width: 17, numFmt: "#,##0.###" },
        { header: "Unidad presentación", width: 16 },
        { header: "Cantidad base", width: 14, numFmt: "#,##0.###" },
        { header: "Unidad stock", width: 13 },
        { header: "Áreas destino", width: 24 },
        { header: "Área por defecto", width: 18 },
        { header: "Audiencia", width: 13 },
        { header: "Producción local", width: 15 },
        { header: "LOC producción/origen", width: 28 },
        { header: "Mínimo stock", width: 14, numFmt: "#,##0.###" },
        { header: "Stock sede", width: 14, numFmt: "#,##0.###" },
        { header: "Diagnóstico solicitud", width: 36 },
        { header: "Actualizado", width: 22 },
        { header: "ID producto", width: 36 },
        { header: "ID sede", width: 36 },
      ],
      rows: remissionRows,
    },
    {
      name: "Stock por sede",
      title: "VENTO GROUP · Stock por sede",
      subtitle: "Existencia agregada por sede y valor estimado con costo actual",
      tabColor: "FF14532D",
      columns: [
        { header: "Sede", width: 22 },
        { header: "Tipo sede", width: 13 },
        { header: "Producto", width: 34 },
        { header: "Tipo item", width: 20 },
        { header: "SKU", width: 14 },
        { header: "Cantidad actual", width: 16, numFmt: "#,##0.###" },
        { header: "Unidad stock", width: 13 },
        { header: "Costo unitario", width: 14, numFmt: '"$" #,##0.00' },
        { header: "Valor estimado", width: 16, numFmt: '"$" #,##0.00' },
        { header: "Actualizado", width: 22 },
        { header: "ID producto", width: 36 },
        { header: "ID sede", width: 36 },
      ],
      rows: stockSiteRows,
    },
    {
      name: "Stock por LOC",
      title: "VENTO GROUP · Stock por LOC",
      subtitle: "Existencia por ubicación física de inventario",
      tabColor: "FF0F766E",
      columns: [
        { header: "Sede", width: 22 },
        { header: "LOC", width: 32 },
        { header: "Código LOC", width: 14 },
        { header: "Tipo LOC", width: 14 },
        { header: "LOC activo", width: 12 },
        { header: "Producto", width: 34 },
        { header: "Tipo item", width: 20 },
        { header: "Cantidad actual", width: 16, numFmt: "#,##0.###" },
        { header: "Unidad stock", width: 13 },
        { header: "Valor estimado", width: 16, numFmt: '"$" #,##0.00' },
        { header: "Actualizado", width: 22 },
        { header: "ID LOC", width: 36 },
        { header: "ID producto", width: 36 },
      ],
      rows: stockLocationRows,
    },
    {
      name: "Stock posiciones",
      title: "VENTO GROUP · Stock por posiciones internas",
      subtitle: "Existencia por estantería, nivel, bin o ubicación interna",
      tabColor: "FF0369A1",
      columns: [
        { header: "Sede", width: 22 },
        { header: "LOC", width: 32 },
        { header: "Posición interna", width: 36 },
        { header: "Tipo posición", width: 16 },
        { header: "Posición activa", width: 14 },
        { header: "Producto", width: 34 },
        { header: "Tipo item", width: 20 },
        { header: "Cantidad actual", width: 16, numFmt: "#,##0.###" },
        { header: "Unidad stock", width: 13 },
        { header: "Valor estimado", width: 16, numFmt: '"$" #,##0.00' },
        { header: "Actualizado", width: 22 },
        { header: "ID posición", width: 36 },
        { header: "ID LOC", width: 36 },
        { header: "ID producto", width: 36 },
      ],
      rows: stockPositionRows,
    },
    {
      name: "Stock presentaciones",
      title: "VENTO GROUP · Stock por presentación",
      subtitle: "Presentaciones físicas disponibles por LOC y posición interna",
      tabColor: "FF7C3AED",
      columns: [
        { header: "Sede", width: 22 },
        { header: "LOC", width: 32 },
        { header: "Posición interna", width: 36 },
        { header: "Producto", width: 34 },
        { header: "Presentación", width: 28 },
        { header: "Cantidad presentación", width: 18, numFmt: "#,##0.###" },
        { header: "Unidad presentación", width: 18 },
        { header: "Cantidad base", width: 16, numFmt: "#,##0.###" },
        { header: "Unidad stock", width: 13 },
        { header: "Contexto", width: 14 },
        { header: "Fuente perfil", width: 16 },
        { header: "Actualizado", width: 22 },
        { header: "ID perfil", width: 36 },
        { header: "ID LOC", width: 36 },
        { header: "ID posición", width: 36 },
        { header: "ID producto", width: 36 },
      ],
      rows: stockPresentationRows,
    },
    {
      name: "Sedes",
      title: "VENTO GROUP · Sedes",
      subtitle: "Resumen de estructura operativa por sede",
      tabColor: BRAND.black,
      columns: [
        { header: "Sede", width: 28 },
        { header: "Tipo sede", width: 15 },
        { header: "Áreas", width: 12, numFmt: "#,##0" },
        { header: "LOCs", width: 12, numFmt: "#,##0" },
        { header: "Posiciones internas", width: 18, numFmt: "#,##0" },
        { header: "Productos con stock", width: 18, numFmt: "#,##0" },
        { header: "Configuraciones remisión", width: 22, numFmt: "#,##0" },
        { header: "Productos remisión activa", width: 22, numFmt: "#,##0" },
        { header: "ID sede", width: 36 },
      ],
      rows: siteRows,
    },
    {
      name: "Áreas",
      title: "VENTO GROUP · Áreas operativas",
      subtitle: "Áreas, kinds y reglas de uso para remisiones/operación",
      tabColor: BRAND.rose,
      columns: [
        { header: "Sede", width: 22 },
        { header: "Área", width: 30 },
        { header: "Kind", width: 16 },
        { header: "Uso remisión según kind", width: 22 },
        { header: "Reglas de propósito", width: 48 },
        { header: "ID área", width: 36 },
        { header: "ID sede", width: 36 },
      ],
      rows: areaRows,
    },
    {
      name: "LOCs",
      title: "VENTO GROUP · LOCs",
      subtitle: "Ubicaciones físicas de inventario por sede",
      tabColor: "FF0F766E",
      columns: [
        { header: "Sede", width: 22 },
        { header: "LOC", width: 32 },
        { header: "Código", width: 14 },
        { header: "Tipo", width: 14 },
        { header: "Zona", width: 16 },
        { header: "Pasillo", width: 12 },
        { header: "Nivel", width: 12 },
        { header: "Descripción", width: 34 },
        { header: "Activo", width: 10 },
        { header: "Posiciones internas", width: 18, numFmt: "#,##0" },
        { header: "Productos con stock", width: 18, numFmt: "#,##0" },
        { header: "ID LOC", width: 36 },
      ],
      rows: locRows,
    },
    {
      name: "Posiciones",
      title: "VENTO GROUP · Posiciones internas",
      subtitle: "Niveles, estanterías, bins o posiciones internas dentro de LOCs",
      tabColor: "FF0369A1",
      columns: [
        { header: "Sede", width: 22 },
        { header: "LOC", width: 32 },
        { header: "Posición interna", width: 36 },
        { header: "Código", width: 14 },
        { header: "Nombre", width: 22 },
        { header: "Tipo", width: 16 },
        { header: "Padre", width: 32 },
        { header: "Orden", width: 10, numFmt: "#,##0" },
        { header: "Activo", width: 10 },
        { header: "Productos con stock", width: 18, numFmt: "#,##0" },
        { header: "ID posición", width: 36 },
        { header: "ID LOC", width: 36 },
      ],
      rows: positionsRows,
    },
    {
      name: "Alertas",
      title: "VENTO GROUP · Alertas de configuración",
      subtitle: "Puntos a revisar para catálogo, remisiones, stock y referencias operativas",
      tabColor: "FFDC2626",
      columns: [
        { header: "Severidad", width: 12 },
        { header: "Categoría", width: 22 },
        { header: "Mensaje", width: 60 },
        { header: "Producto", width: 34 },
        { header: "Sede", width: 22 },
        { header: "Referencia", width: 36 },
      ],
      rows: alertRows,
    },
  ];

  for (const sheet of sheetDefinitions) {
    const worksheet = addDataWorksheet(workbook, sheet);
    await tryAddLogo(workbook, worksheet);
  }

  workbook.eachSheet((worksheet) => {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.font = {
          name: "Aptos",
          size: cell.font?.size ?? 10,
          bold: cell.font?.bold ?? false,
          color: cell.font?.color,
        };
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="nexo-libro-maestro-operativo.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
