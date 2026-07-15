import { requireAppAccess } from "@/lib/auth/guard";
import {
  RequestPolicyManager,
  type ManagerProduct,
} from "./request-policy-manager";

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
  is_default: boolean;
};

type PresentationRow = {
  id: string;
  product_id: string;
  label: string;
  input_unit_code: string;
  qty_in_stock_unit: number;
  image_url: string | null;
  catalog_image_url: string | null;
  is_active: boolean;
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

export default async function RequestPoliciesPage() {
  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/settings/request-policies",
    permissionCode: PERMISSION,
  });

  const [
    { data: productsData, error: productsError },
    { data: policiesData, error: policiesError },
    { data: presentationsData, error: presentationsError },
    { data: policyPresentationsData, error: policyPresentationsError },
    { data: supplierOffersData, error: supplierOffersError },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,sku,product_type,stock_unit_code,unit,category:product_categories(name)")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("product_request_policies")
      .select("id,product_id,label,request_unit_code,base_unit_code,base_qty_per_request_unit,minimum_request_qty,request_step_qty,allow_fraction,is_default")
      .eq("is_active", true)
      .eq("is_default", true),
    supabase
      .from("product_uom_profiles")
      .select("id,product_id,label,input_unit_code,qty_in_stock_unit,image_url,catalog_image_url,is_active")
      .eq("is_active", true)
      .order("label", { ascending: true }),
    supabase
      .from("product_request_policy_presentations")
      .select("request_policy_id,uom_profile_id,is_preferred"),
    supabase
      .from("product_suppliers")
      .select("id,product_id,supplier_sku,supplier_product_alias,purchase_unit,is_primary,uom_profile_id,suppliers(name)")
      .order("is_primary", { ascending: false }),
  ]);

  const firstError =
    productsError || policiesError || presentationsError || policyPresentationsError || supplierOffersError;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const products = (productsData ?? []) as ProductRow[];
  const policies = (policiesData ?? []) as PolicyRow[];
  const presentations = (presentationsData ?? []) as PresentationRow[];
  const policyPresentations = (policyPresentationsData ?? []) as PolicyPresentationRow[];
  const supplierOffers = (supplierOffersData ?? []) as SupplierOfferRow[];

  const policyByProduct = new Map(policies.map((row) => [row.product_id, row]));
  const presentationsByProduct = new Map<string, PresentationRow[]>();
  for (const row of presentations) {
    const current = presentationsByProduct.get(row.product_id) ?? [];
    current.push(row);
    presentationsByProduct.set(row.product_id, current);
  }

  const linksByPolicy = new Map<string, PolicyPresentationRow[]>();
  for (const row of policyPresentations) {
    const current = linksByPolicy.get(row.request_policy_id) ?? [];
    current.push(row);
    linksByPolicy.set(row.request_policy_id, current);
  }

  const suppliersByProduct = new Map<string, SupplierOfferRow[]>();
  for (const row of supplierOffers) {
    const current = suppliersByProduct.get(row.product_id) ?? [];
    current.push(row);
    suppliersByProduct.set(row.product_id, current);
  }

  const rows: ManagerProduct[] = products.map((product) => {
    const policy = policyByProduct.get(product.id) ?? null;
    const links = policy ? linksByPolicy.get(policy.id) ?? [] : [];
    const fallbackPhysicalProfileId = policy
      ? presentations.find(
          (presentation) =>
            presentation.product_id === product.id &&
            Number(presentation.qty_in_stock_unit) === Number(policy.base_qty_per_request_unit),
        )?.id ?? null
      : null;
    const presentationIds = links.length
      ? links.map((link) => link.uom_profile_id)
      : fallbackPhysicalProfileId
        ? [fallbackPhysicalProfileId]
        : [];

    return {
      id: product.id,
      name: String(product.name ?? "Producto").trim(),
      sku: String(product.sku ?? "").trim(),
      categoryName: relatedName(product.category),
      productType: String(product.product_type ?? "").trim(),
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
        preferredPresentationId:
          links.find((link) => link.is_preferred)?.uom_profile_id ?? presentationIds[0] ?? null,
      },
      presentations: (presentationsByProduct.get(product.id) ?? []).map((presentation) => ({
        id: presentation.id,
        label: presentation.label,
        inputUnitCode: presentation.input_unit_code,
        qtyInStockUnit: Number(presentation.qty_in_stock_unit),
        imageUrl: String(presentation.image_url || presentation.catalog_image_url || ""),
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
        <p className="mt-2 max-w-4xl ui-body-muted">
          Configura lo que solicita el trabajador, qué presentaciones físicas pueden cumplir esa solicitud y qué presentación vende cada proveedor. Los cambios se guardan por producto sin recargar toda la lista.
        </p>
      </section>
      <RequestPolicyManager products={rows} />
    </div>
  );
}
