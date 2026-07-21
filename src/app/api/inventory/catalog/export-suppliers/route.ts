import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

const COLORS = {
  black: "FF1B1A1F",
  magenta: "FFE2006A",
  white: "FFFFFFFF",
  soft: "FFF6F1F5",
  line: "FFE7DEE5",
  muted: "FF6B6574",
  input: "FFFFF2CC",
  formula: "FFEAF3F8",
  total: "FFE2F0D9",
};

type InventoryProfile = { inventory_kind: string | null };

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  category_id: string | null;
  product_type: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  cost: number | null;
  is_active: boolean | null;
  product_inventory_profiles?: InventoryProfile | InventoryProfile[] | null;
};

type CategoryRow = {
  id: string;
  name: string | null;
  parent_id: string | null;
};

type PresentationRow = {
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

type CountRow = {
  product: ProductRow;
  type: string;
  category: string;
  presentationId: string;
  presentation: string;
  equivalence: number;
  baseUnit: string;
};

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function inventoryKind(product: ProductRow): string {
  const profile = Array.isArray(product.product_inventory_profiles)
    ? product.product_inventory_profiles[0] ?? null
    : product.product_inventory_profiles ?? null;
  return normalize(profile?.inventory_kind);
}

function itemType(product: ProductRow): string {
  const type = normalize(product.product_type);
  if (type === "insumo") return "Insumo";
  if (type === "preparacion") return "Preparación";
  if (type === "venta" && inventoryKind(product) === "resale") return "Producto de reventa";
  return "Otro";
}

function isIncluded(product: ProductRow): boolean {
  if (product.is_active === false) return false;
  const type = normalize(product.product_type);
  if (type === "insumo") return inventoryKind(product) !== "asset";
  if (type === "preparacion") return true;
  return type === "venta" && inventoryKind(product) === "resale";
}

function categoryPath(categoryId: string | null, categories: Map<string, CategoryRow>): string {
  if (!categoryId) return "Sin categoría";
  const names: string[] = [];
  const visited = new Set<string>();
  let current = categories.get(categoryId) ?? null;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(String(current.name ?? "Sin categoría"));
    current = current.parent_id ? categories.get(current.parent_id) ?? null : null;
  }

  return names.join(" / ") || "Sin categoría";
}

function presentationEquivalence(presentation: PresentationRow): number | null {
  const inputQty = safeNumber(presentation.qty_in_input_unit);
  const stockQty = safeNumber(presentation.qty_in_stock_unit);
  if (inputQty <= 0 || stockQty <= 0) return null;
  return stockQty / inputQty;
}

function presentationPriority(presentation: PresentationRow): number {
  // 1. Política/default del producto.
  if (presentation.is_default === true) return 0;

  // 2. Presentación creada manualmente.
  if (normalize(presentation.source) === "manual") return 10;

  // 3. Presentaciones operativas derivadas.
  const context = normalize(presentation.usage_context);
  if (context === "general" || !context) return 20;
  if (context === "purchase") return 30;
  if (context === "remission") return 40;
  return 50;
}

function selectUniquePresentations(rows: PresentationRow[]): PresentationRow[] {
  const sorted = [...rows].sort((a, b) => {
    const priorityDifference = presentationPriority(a) - presentationPriority(b);
    if (priorityDifference !== 0) return priorityDifference;
    return String(a.label ?? "").localeCompare(String(b.label ?? ""), "es", {
      sensitivity: "base",
    });
  });

  const selectedByEquivalence = new Map<string, PresentationRow>();
  for (const row of sorted) {
    const equivalence = presentationEquivalence(row);
    if (equivalence == null) continue;

    // Evita duplicados por pequeñas diferencias de punto flotante.
    const key = equivalence.toFixed(6);
    if (!selectedByEquivalence.has(key)) selectedByEquivalence.set(key, row);
  }

  return [...selectedByEquivalence.values()].sort((a, b) => {
    const aValue = presentationEquivalence(a) ?? 0;
    const bValue = presentationEquivalence(b) ?? 0;
    if (aValue !== bValue) return aValue - bValue;
    return String(a.label ?? "").localeCompare(String(b.label ?? ""), "es", {
      sensitivity: "base",
    });
  });
}

function styleTitle(sheet: ExcelJS.Worksheet, lastColumn: number, subtitle: string) {
  const lastLetter = sheet.getColumn(lastColumn).letter;
  sheet.mergeCells(`A1:${lastLetter}1`);
  sheet.getCell("A1").value = "VENTO GROUP · NEXO";
  sheet.getCell("A1").font = { bold: true, size: 20, color: { argb: COLORS.magenta } };
  sheet.getCell("A1").alignment = { vertical: "middle" };
  sheet.getRow(1).height = 32;

  sheet.mergeCells(`A2:${lastLetter}2`);
  sheet.getCell("A2").value = subtitle;
  sheet.getCell("A2").font = { size: 10, color: { argb: COLORS.muted } };
  sheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.soft } };
  sheet.getCell("A2").alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(2).height = 24;
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 30;
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.black } };
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.line } },
      left: { style: "thin", color: { argb: COLORS.line } },
      bottom: { style: "thin", color: { argb: COLORS.line } },
      right: { style: "thin", color: { argb: COLORS.line } },
    };
  });
}

function styleBody(sheet: ExcelJS.Worksheet, firstRow: number, lastRow: number, lastColumn: number) {
  for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber += 1) {
    sheet.getRow(rowNumber).eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      if (columnNumber > lastColumn) return;
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: COLORS.line } },
        left: { style: "thin", color: { argb: COLORS.line } },
        bottom: { style: "thin", color: { argb: COLORS.line } },
        right: { style: "thin", color: { argb: COLORS.line } },
      };
    });
  }
}

export async function GET() {
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

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("role,full_name,alias")
    .eq("id", userData.user.id)
    .maybeSingle();

  const role = normalize((employee as { role?: string | null } | null)?.role);
  if (!["propietario", "gerente_general", "bodeguero"].includes(role)) {
    return NextResponse.json({ error: "No tienes permiso para exportar el catálogo." }, { status: 403 });
  }

  const [productsResult, categoriesResult, presentationsResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id,name,sku,category_id,product_type,unit,stock_unit_code,cost,is_active,product_inventory_profiles(inventory_kind)"
      )
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(5000),
    supabase
      .from("product_categories")
      .select("id,name,parent_id")
      .order("name", { ascending: true })
      .limit(5000),
    supabase
      .from("product_uom_profiles")
      .select(
        "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
      )
      .eq("is_active", true)
      .limit(20000),
  ]);

  if (productsResult.error) {
    return NextResponse.json(
      { error: "No se pudo cargar el catálogo.", detail: productsResult.error.message },
      { status: 400 }
    );
  }

  if (presentationsResult.error) {
    return NextResponse.json(
      { error: "No se pudieron cargar las presentaciones.", detail: presentationsResult.error.message },
      { status: 400 }
    );
  }

  const products = ((productsResult.data ?? []) as unknown as ProductRow[]).filter(isIncluded);
  const categories = new Map(
    ((categoriesResult.data ?? []) as CategoryRow[]).map((category) => [category.id, category])
  );
  const presentationsByProduct = new Map<string, PresentationRow[]>();

  for (const presentation of (presentationsResult.data ?? []) as PresentationRow[]) {
    if (!presentation.product_id || presentation.is_active === false) continue;
    const rows = presentationsByProduct.get(presentation.product_id) ?? [];
    rows.push(presentation);
    presentationsByProduct.set(presentation.product_id, rows);
  }

  const countRows: CountRow[] = [];
  for (const product of products) {
    const baseUnit = String(product.stock_unit_code || product.unit || "un");
    const category = categoryPath(product.category_id, categories);
    const type = itemType(product);
    const uniquePresentations = selectUniquePresentations(
      presentationsByProduct.get(product.id) ?? []
    );

    if (uniquePresentations.length === 0) {
      countRows.push({
        product,
        type,
        category,
        presentationId: "base",
        presentation: `Unidad base (${baseUnit})`,
        equivalence: 1,
        baseUnit,
      });
      continue;
    }

    for (const presentation of uniquePresentations) {
      const equivalence = presentationEquivalence(presentation);
      if (equivalence == null) continue;
      countRows.push({
        product,
        type,
        category,
        presentationId: presentation.id,
        presentation: String(presentation.label || presentation.input_unit_code || "Presentación"),
        equivalence,
        baseUnit,
      });
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Vento Group · NEXO";
  workbook.created = new Date();
  workbook.modified = new Date();

  const catalogSheet = workbook.addWorksheet("Catálogo", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  });
  catalogSheet.columns = [
    { width: 21 }, { width: 30 }, { width: 34 }, { width: 17 }, { width: 27 },
    { width: 18 }, { width: 18 }, { width: 18 }, { width: 16 },
  ];
  styleTitle(catalogSheet, 9, "Catálogo operativo de insumos, preparaciones y productos de reventa");
  catalogSheet.getRow(4).values = [
    "Tipo", "Categoría", "Producto", "SKU", "Presentación", "Equivalencia",
    "Unidad base", "Costo unitario base", "Estado",
  ];
  styleHeader(catalogSheet.getRow(4));

  for (const row of countRows) {
    catalogSheet.addRow([
      row.type,
      row.category,
      row.product.name ?? "Sin nombre",
      row.product.sku ?? "",
      row.presentation,
      `${row.equivalence.toLocaleString("es-CO", { maximumFractionDigits: 4 })} ${row.baseUnit}`,
      row.baseUnit,
      safeNumber(row.product.cost),
      "Activo",
    ]);
  }
  const catalogLastRow = Math.max(4, catalogSheet.rowCount);
  styleBody(catalogSheet, 5, catalogLastRow, 9);
  catalogSheet.getColumn(8).numFmt = '"$" #,##0.00';
  catalogSheet.autoFilter = { from: "A4", to: `I${catalogLastRow}` };

  const countSheet = workbook.addWorksheet("Conteo", {
    views: [{ state: "frozen", ySplit: 5, xSplit: 3, showGridLines: false }],
  });
  countSheet.columns = [
    { width: 21 }, { width: 30 }, { width: 34 }, { width: 17 }, { width: 27 },
    { width: 14 }, { width: 14 }, { width: 18 }, { width: 16 }, { width: 16 },
    { width: 18 }, { width: 30 },
  ];
  styleTitle(countSheet, 12, "Formato simple de conteo físico · Escriba únicamente en las columnas amarillas");
  countSheet.mergeCells("A3:L3");
  countSheet.getCell("A3").value = "Fecha del conteo: ____________________    Responsable: ____________________";
  countSheet.getCell("A3").font = { bold: true, color: { argb: COLORS.black } };
  countSheet.getRow(5).values = [
    "Tipo", "Categoría", "Producto", "SKU", "Presentación", "Equivalencia base",
    "Cantidad de presentaciones", "Cantidad suelta base", "Total contado base",
    "Costo unitario base", "Valor contado", "Observación",
  ];
  styleHeader(countSheet.getRow(5));

  countRows.forEach((row, index) => {
    const excelRow = 6 + index;
    countSheet.addRow([
      row.type,
      row.category,
      row.product.name ?? "Sin nombre",
      row.product.sku ?? "",
      row.presentation,
      row.equivalence,
      null,
      null,
      { formula: `IF(COUNTA(G${excelRow}:H${excelRow})=0,"",N(G${excelRow})*F${excelRow}+N(H${excelRow}))` },
      safeNumber(row.product.cost),
      { formula: `IF(I${excelRow}="","",I${excelRow}*J${excelRow})` },
      null,
    ]);
  });

  const countLastRow = Math.max(5, countSheet.rowCount);
  styleBody(countSheet, 6, countLastRow, 12);
  [7, 8, 12].forEach((columnNumber) => {
    countSheet.getColumn(columnNumber).eachCell({ includeEmpty: true }, (cell, rowNumber) => {
      if (rowNumber >= 6) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.input } };
      }
    });
  });
  [9, 11].forEach((columnNumber) => {
    countSheet.getColumn(columnNumber).eachCell({ includeEmpty: true }, (cell, rowNumber) => {
      if (rowNumber >= 6) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.formula } };
      }
    });
  });
  [6, 7, 8, 9].forEach((columnNumber) => {
    countSheet.getColumn(columnNumber).numFmt = "#,##0.####";
  });
  countSheet.getColumn(10).numFmt = '"$" #,##0.00';
  countSheet.getColumn(11).numFmt = '"$" #,##0.00';
  countSheet.autoFilter = { from: "A5", to: `L${countLastRow}` };
  if (countLastRow >= 6) {
    countSheet.dataValidations.add(`G6:H${countLastRow}`, {
      type: "decimal",
      operator: "greaterThanOrEqual",
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "Cantidad no válida",
      error: "Ingrese una cantidad numérica mayor o igual a cero.",
      formulae: [0],
    });
  }

  const summarySheet = workbook.addWorksheet("Resumen", {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
  });
  summarySheet.columns = [
    { width: 21 }, { width: 30 }, { width: 34 }, { width: 17 },
    { width: 18 }, { width: 18 }, { width: 20 },
  ];
  styleTitle(summarySheet, 7, "Resumen automático por producto");
  summarySheet.getRow(4).values = [
    "Tipo", "Categoría", "Producto", "SKU", "Unidad base", "Total contado", "Valor total",
  ];
  styleHeader(summarySheet.getRow(4));

  products.forEach((product, index) => {
    const excelRow = 5 + index;
    const baseUnit = String(product.stock_unit_code || product.unit || "un");
    summarySheet.addRow([
      itemType(product),
      categoryPath(product.category_id, categories),
      product.name ?? "Sin nombre",
      product.sku ?? "",
      baseUnit,
      { formula: `SUMIF(Conteo!$C$6:$C$${countLastRow},C${excelRow},Conteo!$I$6:$I$${countLastRow})` },
      { formula: `SUMIF(Conteo!$C$6:$C$${countLastRow},C${excelRow},Conteo!$K$6:$K$${countLastRow})` },
    ]);
  });
  const summaryLastRow = Math.max(4, summarySheet.rowCount);
  styleBody(summarySheet, 5, summaryLastRow, 7);
  summarySheet.getColumn(6).numFmt = "#,##0.####";
  summarySheet.getColumn(7).numFmt = '"$" #,##0.00';
  summarySheet.autoFilter = { from: "A4", to: `G${summaryLastRow}` };
  for (let rowNumber = 5; rowNumber <= summaryLastRow; rowNumber += 1) {
    summarySheet.getCell(rowNumber, 6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.total } };
    summarySheet.getCell(rowNumber, 7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.total } };
  }

  const dataSheet = workbook.addWorksheet("Datos");
  dataSheet.state = "veryHidden";
  dataSheet.columns = [
    { header: "product_id", width: 38 },
    { header: "presentation_id", width: 38 },
    { header: "product_name", width: 36 },
    { header: "presentation", width: 28 },
    { header: "equivalence", width: 18 },
    { header: "base_unit", width: 18 },
  ];
  countRows.forEach((row) => {
    dataSheet.addRow([
      row.product.id,
      row.presentationId,
      row.product.name ?? "",
      row.presentation,
      row.equivalence,
      row.baseUnit,
    ]);
  });

  [catalogSheet, countSheet, summarySheet].forEach((sheet) => {
    sheet.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
    };
    sheet.properties.defaultRowHeight = 18;
  });

  const generatedBy =
    String((employee as { alias?: string | null } | null)?.alias ?? "").trim() ||
    String((employee as { full_name?: string | null } | null)?.full_name ?? "").trim() ||
    userData.user.email ||
    "NEXO";
  catalogSheet.getCell("A3").value = `Generado por ${generatedBy} · ${new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date())}`;
  catalogSheet.mergeCells("A3:I3");
  catalogSheet.getCell("A3").font = { italic: true, color: { argb: COLORS.muted } };

  const output = await workbook.xlsx.writeBuffer();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return new NextResponse(Buffer.from(output), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="NEXO_Catalogo_Conteo_${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
