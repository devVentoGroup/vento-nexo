import { requireAppAccess } from "@/lib/auth/guard";
import { RequestPolicyManager, type ManagerProduct } from "./request-policy-manager";

export const dynamic = "force-dynamic";
const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  product_type: string | null;
  stock_unit_code: string | null;
  unit: string | null;
  category?: { name?: string | null } | { name?: string | null }[] | null;
};
type InventoryProfileRow = { product_id: string; inventory_kind: string | null };
type PolicyRow = {
  id: string;
  product_id: string;
  label: string;
  request_unit_code: string;
  base_unit_code: string;
  base_qty_per_request_unit: number;
  minimum_request_qty: number | null;
  request_step_qty: number | null;
  allow_fraction: boolean;
};
type PresentationRow = {
  id: string;
  product_id: string;
  label: string;
  input_unit_code: string;
  qty_in_stock_unit: number;
  image_url: string | null;
  catalog_image_url: string | null;
};
type PolicyPresentationRow = {
  request_policy_id: string;
  uom_profile_id: string;
  is_preferred: boolean;
};
type SupplierOfferRow = {
  id: string;
  product_id: string;
  supplier_sku: string | null;
  supplier_product_alias: string | null;
  purchase_unit: string | null;
  is_primary: boolean | null;
  uom_profile_id: string | null;
  suppliers?: { name?: string | null } | { name?: string | null }[] | null;
};

function relatedName(value: ProductRow["category"] | SupplierOfferRow["suppliers"]): string {
  const row = Array.isArray(value) ? value[0] : value;
  return String(row?.name ?? "").trim();
}

function effectiveProductType(productType: string | null, inventoryKind: string | null): string {
  const kind = String(inventoryKind ?? "").trim().toLowerCase();
  if (kind === "asset") return "Activo";
  const type = String(productType ?? "").trim().toLowerCase();
  if (type === "preparacion") return "Preparación";
  if (type === "venta") return "Venta";
  return "Insumo";
}

export default async function RequestPoliciesPage() {
  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/settings/request-policies",
    permissionCode: PERMISSION,
  });

  const [
    { data: productsData, error: productsError },
    { data: inventoryProfilesData, error: inventoryProfilesError },
    { data: policiesData, error: policiesError },
    { data: presentationsData, error: presentationsError },
    { data: policyPresentationsData, error: policyPresentationsError },
    { data: supplierOffersData, error: supplierOffersError },
  ] = await Promise.all([
    supabase.from("products").select("id,name,sku,product_type,stock_unit_code,unit,category:product_categories(name)").eq("is_active", true).order("name"),
    supabase.from("product_inventory_profiles").select("product_id,inventory_kind"),
    supabase.from("product_request_policies").select("id,product_id,label,request_unit_code,base_unit_code,base_qty_per_request_unit,minimum_request_qty,request_step_qty,allow_fraction").eq("is_active", true).eq("is_default", true),
    supabase.from("product_uom_profiles").select("id,product_id,label,input_unit_code,qty_in_stock_unit,image_url,catalog_image_url").eq("is_active", true).order("label"),
    supabase.from("product_request_policy_presentations").select("request_policy_id,uom_profile_id,is_preferred"),
    supabase.from("product_suppliers").select("id,product_id,supplier_sku,supplier_product_alias,purchase_unit,is_primary,uom_profile_id,suppliers(name)").order("is_primary", { ascending: false }),
  ]);

  const firstError = productsError || inventoryProfilesError || policiesError || presentationsError || policyPresentationsError || supplierOffersError;
  if (firstError) throw new Error(firstError.message);

  const products = (productsData ?? []) as ProductRow[];
  const profiles = (inventoryProfilesData ?? []) as InventoryProfileRow[];
  const policies = (policiesData ?? []) as PolicyRow[];
  const presentations = (presentationsData ?? []) as PresentationRow[];
  const policyPresentations = (policyPresentationsData ?? []) as PolicyPresentationRow[];
  const supplierOffers = (supplierOffersData ?? []) as SupplierOfferRow[];

  const inventoryKindByProduct = new Map(profiles.map((row) => [row.product_id, row.inventory_kind]));
  const policyByProduct = new Map(policies.map((row) => [row.product_id, row]));
  const presentationsByProduct = new Map<string, PresentationRow[]>();
  for (const row of presentations) presentationsByProduct.set(row.product_id, [...(presentationsByProduct.get(row.product_id) ?? []), row]);
  const linksByPolicy = new Map<string, PolicyPresentationRow[]>();
  for (const row of policyPresentations) linksByPolicy.set(row.request_policy_id, [...(linksByPolicy.get(row.request_policy_id) ?? []), row]);
  const suppliersByProduct = new Map<string, SupplierOfferRow[]>();
  for (const row of supplierOffers) suppliersByProduct.set(row.product_id, [...(suppliersByProduct.get(row.product_id) ?? []), row]);

  const rows: ManagerProduct[] = products.map((product) => {
    const policy = policyByProduct.get(product.id) ?? null;
    const productPresentations = presentationsByProduct.get(product.id) ?? [];
    const links = policy ? linksByPolicy.get(policy.id) ?? [] : [];
    const fallbackPresentationId = policy
      ? productPresentations.find((p) => Number(p.qty_in_stock_unit) === Number(policy.base_qty_per_request_unit))?.id ?? null
      : null;
    const presentationIds = links.length ? links.map((link) => link.uom_profile_id) : fallbackPresentationId ? [fallbackPresentationId] : [];

    return {
      id: product.id,
      name: String(product.name ?? "Producto").trim(),
      sku: String(product.sku ?? "").trim(),
      categoryName: relatedName(product.category),
      productType: effectiveProductType(product.product_type, inventoryKindByProduct.get(product.id) ?? null),
      baseUnitCode: String(product.stock_unit_code || product.unit || policy?.base_unit_code || "un").trim(),
      policy: {
        id: policy?.id ?? null,
        label: String(policy?.label ?? "").trim(),
        requestUnitCode: String(policy?.request_unit_code ?? "").trim(),
        baseQtyPerRequestUnit: Number(policy?.base_qty_per_request_unit ?? 1),
        minimumRequestQty: Number(policy?.minimum_request_qty ?? 1),
        requestStepQty: Number(policy?.request_step_qty ?? 1),
        allowFraction: Boolean(policy?.allow_fraction),
        presentationIds,
        preferredPresentationId: links.find((link) => link.is_preferred)?.uom_profile_id ?? presentationIds[0] ?? null,
      },
      presentations: productPresentations.map((p) => ({
        id: p.id,
        label: p.label,
        inputUnitCode: p.input_unit_code,
        qtyInStockUnit: Number(p.qty_in_stock_unit),
        imageUrl: String(p.image_url || p.catalog_image_url || ""),
      })),
      supplierOffers: (suppliersByProduct.get(product.id) ?? []).map((offer) => ({
        id: offer.id,
        supplierName: relatedName(offer.suppliers) || "Proveedor",
        supplierAlias: String(offer.supplier_product_alias ?? "").trim(),
        supplierSku: String(offer.supplier_sku ?? "").trim(),
        purchaseUnit: String(offer.purchase_unit ?? "").trim(),
        isPrimary: Boolean(offer.is_primary),
        uomProfileId: offer.uom_profile_id,
      })),
    };
  });

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-panel ui-panel--halo">
        <div className="ui-caption">Catálogo · configuración masiva</div>
        <h1 className="mt-2 ui-h1">Unidades, presentaciones y proveedores</h1>
        <p className="mt-2 max-w-4xl ui-body-muted">Configura lo que solicita el trabajador, las presentaciones físicas válidas y la presentación que vende cada proveedor.</p>
      </section>
      <RequestPolicyManager products={rows} />
    </div>
  );
}
