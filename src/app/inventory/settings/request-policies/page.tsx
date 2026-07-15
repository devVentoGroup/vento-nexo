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

type ProfileRow = {
  product_id: string;
  inventory_kind: string | null;
  measurement_mode: string | null;
  default_tolerance_percent: number | null;
  aux_count_unit_code: string | null;
  requires_actual_production_qty: boolean | null;
  requires_actual_dispatch_qty: boolean | null;
  requires_actual_receipt_qty: boolean | null;
  requires_count_alongside_weight: boolean | null;
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
  policy_kind: string;
  version_number: number | null;
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

type LinkRow = {
  request_policy_id: string;
  uom_profile_id: string;
  is_preferred: boolean;
};

type OfferRow = {
  id: string;
  product_id: string;
  supplier_sku: string | null;
  supplier_product_alias: string | null;
  purchase_unit: string | null;
  is_primary: boolean | null;
  uom_profile_id: string | null;
  suppliers?: { name?: string | null } | { name?: string | null }[] | null;
};

type AuditRow = {
  product_id: string;
  policy_id: string | null;
  usage_count: number | string | null;
  issues: string[] | null;
};

function relatedName(value: ProductRow["category"] | OfferRow["suppliers"]): string {
  const row = Array.isArray(value) ? value[0] : value;
  return String(row?.name ?? "").trim();
}

function effectiveType(type: string | null, kind: string | null): string {
  if (String(kind ?? "").toLowerCase() === "asset") return "Activo";
  const normalized = String(type ?? "").toLowerCase();
  if (normalized === "preparacion") return "Preparación";
  if (normalized === "venta") return "Venta";
  return "Insumo";
}

function measurementMode(
  value: string | null,
): "fixed_presentation" | "variable_weight" | "count_with_weight" | "bulk_volume" {
  const normalized = String(value ?? "");
  return normalized === "variable_weight" ||
    normalized === "count_with_weight" ||
    normalized === "bulk_volume"
    ? normalized
    : "fixed_presentation";
}

export default async function RequestPoliciesPage() {
  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/settings/request-policies",
    permissionCode: PERMISSION,
  });

  const [
    { data: productsData, error: productsError },
    { data: profilesData, error: profilesError },
    { data: policiesData, error: policiesError },
    { data: presentationsData, error: presentationsError },
    { data: linksData, error: linksError },
    { data: offersData, error: offersError },
    { data: auditData, error: auditError },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,sku,product_type,stock_unit_code,unit,category:product_categories(name)")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("product_inventory_profiles")
      .select(
        "product_id,inventory_kind,measurement_mode,default_tolerance_percent,aux_count_unit_code,requires_actual_production_qty,requires_actual_dispatch_qty,requires_actual_receipt_qty,requires_count_alongside_weight",
      ),
    supabase
      .from("product_request_policies")
      .select(
        "id,product_id,label,request_unit_code,base_unit_code,base_qty_per_request_unit,minimum_request_qty,request_step_qty,allow_fraction,policy_kind,version_number",
      )
      .eq("is_active", true)
      .eq("is_default", true),
    supabase
      .from("product_uom_profiles")
      .select("id,product_id,label,input_unit_code,qty_in_stock_unit,image_url,catalog_image_url")
      .eq("is_active", true)
      .order("label"),
    supabase
      .from("product_request_policy_presentations")
      .select("request_policy_id,uom_profile_id,is_preferred"),
    supabase
      .from("product_suppliers")
      .select(
        "id,product_id,supplier_sku,supplier_product_alias,purchase_unit,is_primary,uom_profile_id,suppliers(name)",
      )
      .order("is_primary", { ascending: false }),
    supabase
      .from("product_request_policy_audit")
      .select("product_id,policy_id,usage_count,issues"),
  ]);

  const error =
    productsError ||
    profilesError ||
    policiesError ||
    presentationsError ||
    linksError ||
    offersError ||
    auditError;
  if (error) throw new Error(error.message);

  const products = (productsData ?? []) as ProductRow[];
  const profiles = (profilesData ?? []) as ProfileRow[];
  const policies = (policiesData ?? []) as PolicyRow[];
  const presentations = (presentationsData ?? []) as PresentationRow[];
  const links = (linksData ?? []) as LinkRow[];
  const offers = (offersData ?? []) as OfferRow[];
  const auditRows = (auditData ?? []) as AuditRow[];

  const profileByProduct = new Map(profiles.map((row) => [row.product_id, row]));
  const policyByProduct = new Map(policies.map((row) => [row.product_id, row]));
  const auditByPolicy = new Map(
    auditRows.filter((row) => row.policy_id).map((row) => [String(row.policy_id), row]),
  );
  const missingPolicyIssues = new Map(
    auditRows
      .filter((row) => !row.policy_id)
      .map((row) => [row.product_id, row.issues ?? []]),
  );

  const presentationsByProduct = new Map<string, PresentationRow[]>();
  const linksByPolicy = new Map<string, LinkRow[]>();
  const offersByProduct = new Map<string, OfferRow[]>();

  for (const row of presentations) {
    presentationsByProduct.set(row.product_id, [
      ...(presentationsByProduct.get(row.product_id) ?? []),
      row,
    ]);
  }
  for (const row of links) {
    linksByPolicy.set(row.request_policy_id, [
      ...(linksByPolicy.get(row.request_policy_id) ?? []),
      row,
    ]);
  }
  for (const row of offers) {
    offersByProduct.set(row.product_id, [
      ...(offersByProduct.get(row.product_id) ?? []),
      row,
    ]);
  }

  const rows: ManagerProduct[] = products.map((product) => {
    const profile = profileByProduct.get(product.id) ?? null;
    const policy = policyByProduct.get(product.id) ?? null;
    const audit = policy ? auditByPolicy.get(policy.id) ?? null : null;
    const productPresentations = presentationsByProduct.get(product.id) ?? [];
    const policyLinks = policy ? linksByPolicy.get(policy.id) ?? [] : [];
    const fallbackPresentationId = policy
      ? productPresentations.find(
          (presentation) =>
            Number(presentation.qty_in_stock_unit) === Number(policy.base_qty_per_request_unit),
        )?.id ?? null
      : null;
    const presentationIds = policyLinks.length
      ? policyLinks.map((link) => link.uom_profile_id)
      : fallbackPresentationId
        ? [fallbackPresentationId]
        : [];

    return {
      id: product.id,
      name: String(product.name ?? "Producto").trim(),
      sku: String(product.sku ?? "").trim(),
      categoryName: relatedName(product.category),
      productType: effectiveType(product.product_type, profile?.inventory_kind ?? null),
      baseUnitCode: String(
        product.stock_unit_code || product.unit || policy?.base_unit_code || "un",
      ).trim(),
      policy: {
        id: policy?.id ?? null,
        label: String(policy?.label ?? "").trim(),
        requestUnitCode: String(policy?.request_unit_code ?? "").trim(),
        baseQtyPerRequestUnit: Number(policy?.base_qty_per_request_unit ?? 1),
        minimumRequestQty: Number(policy?.minimum_request_qty ?? 1),
        requestStepQty: Number(policy?.request_step_qty ?? 1),
        allowFraction: Boolean(policy?.allow_fraction),
        policyKind: String(policy?.policy_kind ?? "base_unit"),
        versionNumber: Number(policy?.version_number ?? 1),
        usageCount: Number(audit?.usage_count ?? 0),
        auditIssues: audit?.issues ?? missingPolicyIssues.get(product.id) ?? [],
        presentationIds,
        preferredPresentationId:
          policyLinks.find((link) => link.is_preferred)?.uom_profile_id ??
          presentationIds[0] ??
          null,
      },
      measurement: {
        measurementMode: measurementMode(profile?.measurement_mode ?? null),
        tolerancePercent: Number(profile?.default_tolerance_percent ?? 0),
        auxCountUnitCode: String(profile?.aux_count_unit_code ?? ""),
        requiresActualProductionQty: Boolean(profile?.requires_actual_production_qty),
        requiresActualDispatchQty: Boolean(profile?.requires_actual_dispatch_qty),
        requiresActualReceiptQty: Boolean(profile?.requires_actual_receipt_qty),
        requiresCountAlongsideWeight: Boolean(profile?.requires_count_alongside_weight),
      },
      presentations: productPresentations.map((presentation) => ({
        id: presentation.id,
        label: presentation.label,
        inputUnitCode: presentation.input_unit_code,
        qtyInStockUnit: Number(presentation.qty_in_stock_unit),
        imageUrl: String(presentation.image_url || presentation.catalog_image_url || ""),
      })),
      supplierOffers: (offersByProduct.get(product.id) ?? []).map((offer) => ({
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
        <div className="ui-caption">Catálogo · configuración operativa</div>
        <h1 className="mt-2 ui-h1">Solicitud, medición y presentaciones</h1>
        <p className="mt-2 max-w-4xl ui-body-muted">
          La solicitud expresa demanda; las presentaciones representan objetos físicos o comerciales;
          la medición define cómo se confirma la cantidad real. Estos conceptos permanecen separados.
        </p>
      </section>
      <RequestPolicyManager products={rows} />
    </div>
  );
}
