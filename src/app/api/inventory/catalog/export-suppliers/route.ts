import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const CSV_SEPARATOR = ";";

function escapeCsv(value: string): string {
  const s = String(value ?? "").replace(/"/g, '""');
  return s.includes(CSV_SEPARATOR) || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
}

function formatCsvNumber(value: unknown, maxDecimals = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";

  const fixed = n.toFixed(maxDecimals);
  const normalized = fixed.replace(/\.?0+$/, "");

  return normalized.replace(".", ",");
}

function formatCsvMoney(value: unknown): string {
  return formatCsvNumber(value, 2);
}

function formatCsvQty(value: unknown): string {
  return formatCsvNumber(value, 3);
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
  product_inventory_profiles?: ProductInventoryProfileRow | null;
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
  currency: string | null;
};

type SupplierRow = {
  id: string;
  name: string | null;
};

type ProductManualPresentationRow = {
  product_id: string | null;
  is_active: boolean | null;
  source: string | null;
};

function resolveItemType(product: ProductRow): string {
  const productType = String(product.product_type ?? "").trim().toLowerCase();
  const inventoryKind = String(product.product_inventory_profiles?.inventory_kind ?? "")
    .trim()
    .toLowerCase();

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

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  const role = String((employee as { role?: string } | null)?.role ?? "");
  const canExport = ["gerente_general", "propietario"].includes(role);
  if (!canExport) {
    return NextResponse.json(
      { error: "Solo gerentes y propietarios pueden exportar." },
      { status: 403 }
    );
  }

  const { data: productsData, error: productsErr } = await supabase
    .from("products")
    .select(
      "id,name,sku,unit,stock_unit_code,cost,is_active,product_type,product_inventory_profiles(inventory_kind)"
    )
    .order("name", { ascending: true })
    .limit(5000);

  if (productsErr) {
    return NextResponse.json({ error: productsErr.message }, { status: 400 });
  }

  const products = (productsData ?? []) as unknown as ProductRow[];
  const productIds = products.map((row) => row.id);

  const productSuppliersBaseSelect =
    "product_id,supplier_id,is_primary,purchase_pack_qty,purchase_pack_unit_code,purchase_unit,purchase_price,purchase_price_includes_tax,purchase_tax_rate,currency";
  const productSuppliersWithNetSelect = `${productSuppliersBaseSelect},purchase_price_net`;

  const withNet =
    productIds.length > 0
      ? await supabase
          .from("product_suppliers")
          .select(productSuppliersWithNetSelect)
          .in("product_id", productIds)
      : { data: [] as ProductSupplierRow[], error: null };

  const missingPurchasePriceNet =
    withNet.error?.message?.toLowerCase().includes("purchase_price_net") &&
    withNet.error?.message?.toLowerCase().includes("does not exist");

  const fallback =
    productIds.length > 0 && missingPurchasePriceNet
      ? await supabase
          .from("product_suppliers")
          .select(productSuppliersBaseSelect)
          .in("product_id", productIds)
      : null;

  const productSuppliersData =
    (fallback?.data as ProductSupplierRow[] | null) ??
    (withNet.data as ProductSupplierRow[] | null);
  const productSuppliersErr = fallback?.error ?? withNet.error;

  if (productSuppliersErr) {
    return NextResponse.json({ error: productSuppliersErr.message }, { status: 400 });
  }

  const productSuppliers = (productSuppliersData ?? []) as ProductSupplierRow[];

  const { data: manualPresentationsData, error: manualPresentationsErr } =
    productIds.length > 0
      ? await supabase
          .from("product_uom_profiles")
          .select("product_id,is_active,source")
          .in("product_id", productIds)
          .eq("is_active", true)
          .eq("source", "manual")
      : { data: [] as ProductManualPresentationRow[], error: null };

  if (manualPresentationsErr) {
    return NextResponse.json({ error: manualPresentationsErr.message }, { status: 400 });
  }

  const productIdsWithManualPresentation = new Set(
    ((manualPresentationsData ?? []) as ProductManualPresentationRow[])
      .map((row) => String(row.product_id ?? "").trim())
      .filter(Boolean)
  );

  const supplierIds = Array.from(
    new Set(productSuppliers.map((row) => String(row.supplier_id ?? "")).filter(Boolean))
  );
  const { data: suppliersData } =
    supplierIds.length > 0
      ? await supabase.from("suppliers").select("id,name").in("id", supplierIds)
      : { data: [] as SupplierRow[] };

  const supplierNameById = new Map(
    ((suppliersData ?? []) as SupplierRow[]).map((row) => [row.id, row.name ?? row.id])
  );

  const supplierRowsByProduct = new Map<string, ProductSupplierRow[]>();
  for (const row of productSuppliers) {
    const current = supplierRowsByProduct.get(row.product_id) ?? [];
    current.push(row);
    supplierRowsByProduct.set(row.product_id, current);
  }

  const header = [
    "Item",
    "Tipo de item",
    "SKU",
    "Proveedor",
    "Proveedor primario",
    "Precio compra",
    "Precio neto (sin IVA)",
    "Precio incluye IVA",
    "% IVA",
    "Moneda",
    "Presentacion compra (cantidad)",
    "Presentacion compra (unidad)",
    "Unidad operativa compra",
    "Unidad stock",
    "Costo actual (stock)",
    "Falta presentacion manual",
    "Estado",
  ]
    .map(escapeCsv)
    .join(CSV_SEPARATOR);

  const rows: string[] = [header];

  const resolvePurchasePriceNet = (supplierRow: ProductSupplierRow): number | null => {
    const explicitNet = Number(supplierRow.purchase_price_net ?? NaN);
    if (Number.isFinite(explicitNet)) return explicitNet;

    const gross = Number(supplierRow.purchase_price ?? NaN);
    if (!Number.isFinite(gross)) return null;

    const includesTax = Boolean(supplierRow.purchase_price_includes_tax);
    const taxRate = Number(supplierRow.purchase_tax_rate ?? 0);
    if (!includesTax || !Number.isFinite(taxRate) || taxRate <= 0) return gross;

    return gross / (1 + taxRate / 100);
  };

  for (const product of products) {
    const supplierRows = supplierRowsByProduct.get(product.id) ?? [];
    const missingManualPresentation = !productIdsWithManualPresentation.has(product.id);
    const itemType = resolveItemType(product);

    if (!supplierRows.length) {
      rows.push(
        [
          escapeCsv(product.name ?? ""),
          escapeCsv(itemType),
          escapeCsv(product.sku ?? ""),
          escapeCsv("Sin proveedor"),
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          escapeCsv(product.stock_unit_code ?? product.unit ?? ""),
          formatCsvMoney(product.cost),
          escapeCsv(missingManualPresentation ? "Si" : "No"),
          escapeCsv(product.is_active === false ? "Inactivo" : "Activo"),
        ].join(CSV_SEPARATOR)
      );
      continue;
    }

    const orderedSuppliers = [...supplierRows].sort((a, b) => {
      const aPrimary = Boolean(a.is_primary) ? 1 : 0;
      const bPrimary = Boolean(b.is_primary) ? 1 : 0;
      if (aPrimary !== bPrimary) return bPrimary - aPrimary;

      const aName =
        supplierNameById.get(String(a.supplier_id ?? "")) ?? String(a.supplier_id ?? "");
      const bName =
        supplierNameById.get(String(b.supplier_id ?? "")) ?? String(b.supplier_id ?? "");

      return aName.localeCompare(bName, "es");
    });

    for (const supplierRow of orderedSuppliers) {
      const supplierName =
        supplierNameById.get(String(supplierRow.supplier_id ?? "")) ??
        String(supplierRow.supplier_id ?? "Sin proveedor");

      rows.push(
        [
          escapeCsv(product.name ?? ""),
          escapeCsv(itemType),
          escapeCsv(product.sku ?? ""),
          escapeCsv(supplierName),
          escapeCsv(supplierRow.is_primary ? "Si" : "No"),
          formatCsvMoney(supplierRow.purchase_price),
          formatCsvMoney(resolvePurchasePriceNet(supplierRow)),
          escapeCsv(supplierRow.purchase_price_includes_tax ? "Si" : "No"),
          formatCsvNumber(supplierRow.purchase_tax_rate, 2),
          escapeCsv(supplierRow.currency ?? ""),
          formatCsvQty(supplierRow.purchase_pack_qty),
          escapeCsv(supplierRow.purchase_pack_unit_code ?? ""),
          escapeCsv(supplierRow.purchase_unit ?? ""),
          escapeCsv(product.stock_unit_code ?? product.unit ?? ""),
          formatCsvMoney(product.cost),
          escapeCsv(missingManualPresentation ? "Si" : "No"),
          escapeCsv(product.is_active === false ? "Inactivo" : "Activo"),
        ].join(CSV_SEPARATOR)
      );
    }
  }

  const csv = rows.join("\n");
  const bom = "\uFEFF";

  return new NextResponse(bom + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="catalogo-productos-proveedores.csv"',
    },
  });
}