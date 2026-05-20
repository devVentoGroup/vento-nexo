import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  ProductPresentationsEditor,
  type ProductPresentationEditorRow,
  type ProductPresentationSuggestion,
} from "@/features/inventory/catalog/product-presentations-editor";
import { RequiredFieldsGuardForm } from "@/components/inventory/forms/RequiredFieldsGuardForm";
import { requireAppAccess } from "@/lib/auth/guard";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { createClient } from "@/lib/supabase/server";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  convertQuantity,
  createUnitMap,
  normalizeUnitCode,
  type InventoryUnit,
} from "@/lib/inventory/uom";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type SearchParams = {
  ok?: string;
  error?: string;
  from?: string;
};

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  image_url: string | null;
  catalog_image_url: string | null;
};

type InventoryProfileRow = {
  product_id: string;
  default_unit: string | null;
};

type UomProfileRow = ProductPresentationEditorRow;

type SupplierPresentationRow = {
  id: string;
  purchase_unit: string | null;
  purchase_unit_size: number | null;
  purchase_pack_qty: number | null;
  purchase_pack_unit_code: string | null;
  is_primary: boolean | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asPositiveNumber(value: FormDataEntryValue | null): number {
  const raw = typeof value === "string" ? value.trim() : String(value ?? "");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseJsonArray(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((value) => String(value ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function sanitizeCatalogReturnPath(value: string): string {
  return value.startsWith("/inventory/catalog") ? value : "";
}

function decodeCatalogReturnParam(value: string | undefined): string {
  if (!value) return "";
  try {
    return sanitizeCatalogReturnPath(safeDecodeURIComponent(value));
  } catch {
    return "";
  }
}

function appendQueryParam(path: string, key: string, value: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function formatSuggestionNumber(value: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(value);
}

function normalizeSuggestionText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildSupplierPresentationSuggestions(params: {
  supplierRows: SupplierPresentationRow[];
  stockUnitCode: string;
  unitMap: ReturnType<typeof createUnitMap>;
}): ProductPresentationSuggestion[] {
  const suggestions: ProductPresentationSuggestion[] = [];
  const seen = new Set<string>();

  for (const row of params.supplierRows) {
    const packQty = Number(row.purchase_pack_qty ?? row.purchase_unit_size ?? 0);
    const packUnitCode = normalizeUnitCode(row.purchase_pack_unit_code || params.stockUnitCode);

    if (!Number.isFinite(packQty) || packQty <= 0 || !packUnitCode) continue;

    let qtyInStockUnit = 0;

    try {
      qtyInStockUnit = convertQuantity({
        quantity: packQty,
        fromUnitCode: packUnitCode,
        toUnitCode: params.stockUnitCode,
        unitMap: params.unitMap,
      }).quantity;
    } catch {
      if (packUnitCode === params.stockUnitCode) {
        qtyInStockUnit = packQty;
      }
    }

    if (!Number.isFinite(qtyInStockUnit) || qtyInStockUnit <= 0) continue;

    const purchaseUnitLabel = String(row.purchase_unit ?? "").trim();
    const formattedPackQty = formatSuggestionNumber(packQty);
    const normalizedLabel = normalizeSuggestionText(purchaseUnitLabel);
    const label = purchaseUnitLabel
      ? normalizedLabel.includes(normalizeSuggestionText(formattedPackQty))
        ? purchaseUnitLabel
        : `${purchaseUnitLabel} ${formattedPackQty} ${packUnitCode}`
      : `Presentación ${formattedPackQty} ${packUnitCode}`;

    const signature = [
      normalizeSuggestionText(label),
      normalizeSuggestionText(params.stockUnitCode),
      Number(qtyInStockUnit).toFixed(3),
    ].join("::");

    if (seen.has(signature)) continue;
    seen.add(signature);

    suggestions.push({
      key: `supplier-${row.id}`,
      label,
      input_unit_code: params.stockUnitCode,
      qty_in_stock_unit: qtyInStockUnit,
      sourceLabel: row.is_primary ? "Proveedor principal" : "Proveedor secundario",
    });
  }

  return suggestions;
}

async function saveProductPresentations(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) redirect(await buildShellLoginUrl("/inventory/catalog"));

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = String(employee?.role ?? "").toLowerCase();
  if (!["propietario", "gerente_general"].includes(role)) {
    redirect(`/inventory/catalog?error=${encodeURIComponent("No tienes permisos para editar presentaciones.")}`);
  }

  const productId = asText(formData.get("product_id"));
  if (!productId) {
    redirect(`/inventory/catalog?error=${encodeURIComponent("Producto inválido.")}`);
  }

  const returnTo =
    sanitizeCatalogReturnPath(asText(formData.get("return_to"))) ||
    `/inventory/catalog/${encodeURIComponent(productId)}/presentations`;

  const redirectWithError = (message: string) => {
    redirect(appendQueryParam(returnTo, "error", message));
  };

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();

  if (!product) {
    redirectWithError("No se encontró el producto.");
  }

  const keys = parseJsonArray(asText(formData.get("presentation_keys")));
  const deletedIds = parseJsonArray(asText(formData.get("deleted_presentation_ids")));

  for (const id of deletedIds) {
    const { error } = await supabase
      .from("product_uom_profiles")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("product_id", productId);

    if (error) redirectWithError(error.message);
  }

  const rows = keys.map((key) => {
    const prefix = `presentation_${key}`;
    const id = asText(formData.get(`${prefix}_id`));
    const label = asText(formData.get(`${prefix}_label`));
    const inputUnitCode = normalizeUnitCode(asText(formData.get(`${prefix}_input_unit_code`)));
    const qtyInStockUnit = asPositiveNumber(formData.get(`${prefix}_qty_in_stock_unit`));
    const imageUrl = asText(formData.get(`${prefix}_image_url`));
    const isDefault = formData.has(`${prefix}_is_default`);
    const isActive = formData.has(`${prefix}_is_active`);

    return {
      id,
      label,
      inputUnitCode,
      qtyInInputUnit: 1,
      qtyInStockUnit,
      usageContext: "general" as const,
      imageUrl,
      isDefault,
      isActive,
    };
  });

  for (const row of rows) {
    if (!row.label) {
      redirectWithError("Todas las presentaciones deben tener nombre.");
    }
    if (!row.inputUnitCode) {
      redirectWithError(`La presentación "${row.label}" no tiene unidad de entrada.`);
    }
    if (row.qtyInStockUnit <= 0) {
      redirectWithError(`La presentación "${row.label}" debe tener contenido mayor a cero.`);
    }
  }

  const defaultPhysicalPresentations = rows.filter((row) => row.isDefault && row.isActive);

  if (defaultPhysicalPresentations.length === 0) {
    redirectWithError("Selecciona una unidad mínima activa para solicitud/remisión.");
  }

  if (defaultPhysicalPresentations.length > 1) {
    redirectWithError("Solo puede haber una unidad mínima activa para solicitud/remisión.");
  }

  for (const row of rows) {
    if (row.isDefault && !row.isActive) {
      redirectWithError(`La presentación "${row.label}" no puede ser unidad mínima si está inactiva.`);
    }
  }

  if (defaultPhysicalPresentations.length === 1) {
    const { error } = await supabase
      .from("product_uom_profiles")
      .update({
        is_default: false,
        updated_at: new Date().toISOString(),
      })
      .eq("product_id", productId)
      .eq("usage_context", "general")
      .eq("is_default", true);

    if (error) redirectWithError(error.message);
  }

  for (const row of rows) {
    const payload = {
      product_id: productId,
      label: row.label,
      input_unit_code: row.inputUnitCode,
      qty_in_input_unit: 1,
      qty_in_stock_unit: row.qtyInStockUnit,
      usage_context: "general",
      is_default: row.isDefault,
      is_active: row.isActive,
      source: "manual",
      image_url: row.imageUrl || null,
      updated_at: new Date().toISOString(),
    };

    if (row.id) {
      const { error } = await supabase
        .from("product_uom_profiles")
        .update(payload)
        .eq("id", row.id)
        .eq("product_id", productId);

      if (error) redirectWithError(error.message);
      continue;
    }

    const { error } = await supabase.from("product_uom_profiles").insert(payload);
    if (error) redirectWithError(error.message);
  }

  redirect(appendQueryParam(returnTo, "ok", "1"));
}

export default async function ProductPresentationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const from = decodeCatalogReturnParam(sp.from);
  const returnHref = from || `/inventory/catalog/${encodeURIComponent(id)}`;

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/catalog/${id}/presentations`,
    permissionCode: PERMISSION,
  });

  const { data: productData } = await supabase
    .from("products")
    .select("id,name,unit,stock_unit_code,image_url,catalog_image_url")
    .eq("id", id)
    .maybeSingle();

  if (!productData) notFound();

  const product = productData as ProductRow;

  const [
    { data: profileData },
    { data: unitsData },
    { data: uomProfileData },
    { data: supplierLinksData },
    { data: galleryProductsData },
    { data: galleryProfileData },
  ] = await Promise.all([
    supabase
      .from("product_inventory_profiles")
      .select("product_id,default_unit")
      .eq("product_id", id)
      .maybeSingle(),
    supabase
      .from("inventory_units")
      .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
      .eq("is_active", true)
      .order("family", { ascending: true })
      .order("factor_to_base", { ascending: true })
      .limit(500),
    supabase
      .from("product_uom_profiles")
      .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context,image_url,catalog_image_url")
      .eq("product_id", id)
      .eq("source", "manual")
      .eq("usage_context", "general")
      .order("is_default", { ascending: false })
      .order("label", { ascending: true }),
    supabase
      .from("product_suppliers")
      .select("id,purchase_unit,purchase_unit_size,purchase_pack_qty,purchase_pack_unit_code,is_primary")
      .eq("product_id", id)
      .order("is_primary", { ascending: false }),
    supabase
      .from("products")
      .select("image_url,catalog_image_url")
      .or("image_url.not.is.null,catalog_image_url.not.is.null")
      .limit(300),
    supabase
      .from("product_uom_profiles")
      .select("image_url,catalog_image_url")
      .or("image_url.not.is.null,catalog_image_url.not.is.null")
      .limit(300),
  ]);

  const profile = (profileData ?? null) as InventoryProfileRow | null;
  const units = (unitsData ?? []) as InventoryUnit[];
  const stockUnitCode = normalizeUnitCode(
    product.stock_unit_code || product.unit || profile?.default_unit || "un"
  );
  const unitMap = createUnitMap(units);
  const supplierPresentationSuggestions = buildSupplierPresentationSuggestions({
    supplierRows: (supplierLinksData ?? []) as SupplierPresentationRow[],
    stockUnitCode,
    unitMap,
  });

  const presentationRows = ((uomProfileData ?? []) as UomProfileRow[]).map((row) => ({
    ...row,
    qty_in_input_unit: 1,
    usage_context: "general" as const,
    source: "manual" as const,
    image_url: row.image_url ?? "",
    catalog_image_url: row.catalog_image_url ?? "",
  }));

  const existingImageUrls = Array.from(
    new Set(
      [
        product.image_url,
        product.catalog_image_url,
        ...((galleryProductsData ?? []) as Array<{ image_url: string | null; catalog_image_url: string | null }>)
          .flatMap((row) => [row.image_url, row.catalog_image_url]),
        ...((galleryProfileData ?? []) as Array<{ image_url: string | null; catalog_image_url: string | null }>)
          .flatMap((row) => [row.image_url, row.catalog_image_url]),
      ]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );

  return (
    <div className="ui-scene w-full space-y-6">
      {sp.ok ? <div className="ui-alert ui-alert--success">Presentaciones guardadas.</div> : null}
      {sp.error ? <div className="ui-alert ui-alert--error">{sp.error}</div> : null}

      <RequiredFieldsGuardForm
        action={saveProductPresentations}
        className="space-y-6"
        persistKey={`catalog-presentations-${id}`}
      >
        <input type="hidden" name="product_id" value={id} />
        <input type="hidden" name="return_to" value={`/inventory/catalog/${encodeURIComponent(id)}/presentations${from ? `?from=${encodeURIComponent(from)}` : ""}`} />

        <ProductPresentationsEditor
          productId={id}
          productName={product.name ?? "Producto"}
          stockUnitCode={stockUnitCode}
          units={units.map((unit) => ({ code: unit.code, name: unit.name }))}
          initialRows={presentationRows}
          suggestedRows={supplierPresentationSuggestions}
          existingImageUrls={existingImageUrls}
          returnHref={returnHref}
        />
      </RequiredFieldsGuardForm>

      <div className="flex justify-start">
        <Link href={returnHref} className="ui-btn ui-btn--ghost">
          Volver sin guardar
        </Link>
      </div>
    </div>
  );
}