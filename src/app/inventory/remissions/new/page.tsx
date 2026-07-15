import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";
import { checkOperationalSessionPermission } from "@/lib/auth/operational-session";
import { normalizeUnitCode } from "@/lib/inventory/uom";
import { safeDecodeURIComponent } from "@/lib/url";
import { createPolicyRemission } from "./actions";
import {
  PolicyRemissionForm,
  type RequestPolicyOption,
} from "./policy-remission-form";
import {
  loadProductSiteRows,
  readBooleanAppSetting,
  supportsRemission,
  supportsRequestedArea,
  type ProductProfileWithProduct,
  type ProductRow,
  type SiteCapabilityRow,
  type SiteRow,
  type StockReferenceRow,
} from "../page-helpers";
import {
  resolveOperationalRemissionAreaScope,
  resolveSharedDeviceOperationalRemissionAreaScope,
} from "../operational-area-scope";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const REQUEST_PERMISSION = "inventory.remissions.request";
const INVENTORY_POSTING_SETTING = "remissions.inventory_posting_enabled";

type SearchParams = {
  error?: string;
  site_id?: string;
  from_site_id?: string;
};

type CategoryRow = {
  id: string;
  name: string | null;
};

type PolicyDbRow = {
  id: string;
  product_id: string;
  label: string;
  request_unit_code: string;
  base_unit_code: string;
  base_qty_per_request_unit: number | string;
  constraint_mode: RequestPolicyOption["constraintMode"];
  minimum_request_qty: number | string | null;
  request_step_qty: number | string | null;
  allow_fraction: boolean;
  is_default: boolean;
  policy_kind: RequestPolicyOption["policyKind"];
};

function fail(message: string): never {
  redirect(`/inventory/remissions?error=${encodeURIComponent(message)}`);
}

export default async function NewPolicyRemissionPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const { supabase, user, operationalSession } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/remissions/new",
  });

  const isSharedDevice = operationalSession.isSharedDevice;
  const [{ data: employee }, { data: settings }, { data: employeeSites }] = await Promise.all([
    isSharedDevice
      ? Promise.resolve({ data: null })
      : supabase.from("employees").select("site_id,role").eq("id", user.id).maybeSingle(),
    isSharedDevice
      ? Promise.resolve({ data: null })
      : supabase
          .from("employee_settings")
          .select("selected_site_id")
          .eq("employee_id", user.id)
          .maybeSingle(),
    isSharedDevice
      ? Promise.resolve({ data: [] })
      : supabase
          .from("employee_sites")
          .select("site_id,is_primary")
          .eq("employee_id", user.id)
          .eq("is_active", true)
          .order("is_primary", { ascending: false })
          .limit(50),
  ]);

  const activeSiteId = isSharedDevice
    ? String(operationalSession.siteId ?? "").trim()
    : String(
        sp.site_id ??
          settings?.selected_site_id ??
          employeeSites?.[0]?.site_id ??
          employee?.site_id ??
          "",
      ).trim();
  if (!activeSiteId) fail("No hay una sede activa para crear la remisión.");

  const actualRole = String(operationalSession.role ?? employee?.role ?? "");
  const canRequest = isSharedDevice
    ? await checkOperationalSessionPermission({
        supabase,
        session: operationalSession,
        appId: APP_ID,
        code: REQUEST_PERMISSION,
      })
    : await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: REQUEST_PERMISSION,
        context: { siteId: activeSiteId },
        actualRole,
      });
  if (!canRequest) fail("No tienes permiso para solicitar remisiones en esta sede.");

  const [{ data: activeSite }, { data: activeCapability }] = await Promise.all([
    supabase.from("sites").select("id,name,site_type").eq("id", activeSiteId).maybeSingle(),
    supabase
      .from("site_operational_capabilities")
      .select("site_id,can_request_remissions")
      .eq("site_id", activeSiteId)
      .maybeSingle(),
  ]);
  if (!activeSite) fail("La sede activa no existe.");
  const siteCanRequest =
    typeof activeCapability?.can_request_remissions === "boolean"
      ? activeCapability.can_request_remissions
      : String(activeSite.site_type ?? "") === "satellite";
  if (!siteCanRequest) fail("Esta sede no solicita remisiones.");

  const { data: routes } = await supabase
    .from("site_supply_routes")
    .select("fulfillment_site_id")
    .eq("requesting_site_id", activeSiteId)
    .eq("is_active", true);
  const fulfillmentIds = Array.from(
    new Set(
      (routes ?? [])
        .map((row: { fulfillment_site_id: string | null }) => row.fulfillment_site_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (!fulfillmentIds.length) fail("Esta sede no tiene una ruta de abastecimiento activa.");

  const [{ data: fulfillmentSites }, { data: fulfillmentCapabilities }] = await Promise.all([
    supabase
      .from("sites")
      .select("id,name,site_type")
      .in("id", fulfillmentIds)
      .order("name", { ascending: true }),
    supabase
      .from("site_operational_capabilities")
      .select("site_id,can_fulfill_remissions")
      .in("site_id", fulfillmentIds),
  ]);
  const capabilityBySite = new Map(
    ((fulfillmentCapabilities ?? []) as SiteCapabilityRow[]).map((row) => [row.site_id, row]),
  );
  const fromSiteOptions = ((fulfillmentSites ?? []) as SiteRow[])
    .filter((site) => {
      const capability = capabilityBySite.get(site.id);
      return typeof capability?.can_fulfill_remissions === "boolean"
        ? capability.can_fulfill_remissions
        : site.site_type === "production_center";
    })
    .map((site) => ({ id: site.id, name: site.name ?? site.id }));
  if (!fromSiteOptions.length) fail("No hay una sede habilitada para abastecer esta solicitud.");

  const requestedFromSiteId = String(sp.from_site_id ?? "").trim();
  const defaultFromSiteId = fromSiteOptions.some((site) => site.id === requestedFromSiteId)
    ? requestedFromSiteId
    : fromSiteOptions[0]?.id ?? "";

  const areaScope = isSharedDevice
    ? await resolveSharedDeviceOperationalRemissionAreaScope({
        supabase,
        siteId: activeSiteId,
        areaId: operationalSession.areaId,
        canSeeAllAreas: false,
      })
    : await resolveOperationalRemissionAreaScope({
        supabase,
        userId: user.id,
        siteId: activeSiteId,
        canSeeAllAreas: false,
      });
  if (areaScope.blockedReason) fail(areaScope.blockedReason);

  const { data: areasData } = await supabase
    .from("areas")
    .select("name,kind")
    .eq("site_id", activeSiteId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  const areaMap = new Map<string, string>();
  for (const area of areasData ?? []) {
    const kind = String(area.kind ?? "").trim();
    if (kind && !areaMap.has(kind)) areaMap.set(kind, String(area.name ?? kind));
  }
  if (!areaMap.has("general")) areaMap.set("general", "Todos");
  const areaOptions = Array.from(areaMap.entries()).map(([value, label]) => ({ value, label }));
  const requestedAreaKind = areaScope.defaultAreaKind || "general";

  const productSiteRows = await loadProductSiteRows(supabase, activeSiteId);
  const allowedProductSiteRows = productSiteRows.filter(
    (row) => supportsRemission(row) && supportsRequestedArea(row, requestedAreaKind),
  );
  const allowedProductIds = allowedProductSiteRows.map((row) => row.product_id);
  if (!allowedProductIds.length) fail("Esta sede no tiene productos habilitados para solicitud.");

  const { data: profileProducts } = await supabase
    .from("product_inventory_profiles")
    .select("product_id,inventory_kind,measurement_mode,products(id,name,unit,stock_unit_code,product_type,category_id)")
    .eq("track_inventory", true)
    .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
    .in("product_id", allowedProductIds)
    .limit(500);
  let productRows = ((profileProducts ?? []) as unknown as ProductProfileWithProduct[])
    .map((row) => row.products)
    .filter((product): product is ProductRow => Boolean(product));
  if (!productRows.length) {
    const { data: fallbackProducts } = await supabase
      .from("products")
      .select("id,name,unit,stock_unit_code,product_type,category_id")
      .eq("is_active", true)
      .in("id", allowedProductIds)
      .limit(500);
    productRows = (fallbackProducts ?? []) as ProductRow[];
  }

  const productIds = productRows.map((product) => product.id);
  const { data: policyData, error: policyError } = await supabase
    .from("product_request_policies")
    .select("id,product_id,label,request_unit_code,base_unit_code,base_qty_per_request_unit,constraint_mode,minimum_request_qty,request_step_qty,allow_fraction,is_default,policy_kind")
    .in("product_id", productIds)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("label", { ascending: true });
  if (policyError) fail(policyError.message);

  const policies = ((policyData ?? []) as PolicyDbRow[]).map<RequestPolicyOption>((policy) => ({
    id: policy.id,
    productId: policy.product_id,
    label: policy.label,
    requestUnitCode: policy.request_unit_code,
    baseUnitCode: policy.base_unit_code,
    baseQtyPerRequestUnit: Number(policy.base_qty_per_request_unit),
    constraintMode: policy.constraint_mode,
    minimumRequestQty:
      policy.minimum_request_qty == null ? null : Number(policy.minimum_request_qty),
    requestStepQty: policy.request_step_qty == null ? null : Number(policy.request_step_qty),
    allowFraction: Boolean(policy.allow_fraction),
    isDefault: Boolean(policy.is_default),
    policyKind: policy.policy_kind,
  }));
  const productsWithPolicies = new Set(policies.map((policy) => policy.productId));
  productRows = productRows.filter((product) => productsWithPolicies.has(product.id));
  if (!productRows.length) fail("Los productos habilitados todavía no tienen políticas de solicitud.");

  const categoryIds = Array.from(
    new Set(productRows.map((product) => String(product.category_id ?? "")).filter(Boolean)),
  );
  const { data: categoriesData } = categoryIds.length
    ? await supabase.from("product_categories").select("id,name").in("id", categoryIds)
    : { data: [] as CategoryRow[] };
  const categoryById = new Map(
    ((categoriesData ?? []) as CategoryRow[]).map((category) => [
      category.id,
      String(category.name ?? "Sin categoría"),
    ]),
  );

  const inventoryPostingEnabled = await readBooleanAppSetting(
    supabase,
    INVENTORY_POSTING_SETTING,
    false,
  );
  const { data: stockData } = inventoryPostingEnabled
    ? await supabase
        .from("inventory_stock_by_site")
        .select("site_id,product_id,current_qty,updated_at")
        .in("site_id", fromSiteOptions.map((site) => site.id))
        .in("product_id", productRows.map((product) => product.id))
    : { data: [] as StockReferenceRow[] };

  return (
    <div className="ui-scene w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="ui-chip ui-chip--brand">Políticas activas</div>
          <h1 className="mt-3 ui-h1">Nueva remisión</h1>
          <p className="mt-2 ui-body-muted">
            Solicitud para {activeSite.name ?? activeSiteId}. Las equivalencias se validan y congelan en Supabase.
          </p>
        </div>
        <Link
          href={`/inventory/remissions?site_id=${encodeURIComponent(activeSiteId)}`}
          className="ui-btn ui-btn--ghost"
        >
          Volver a remisiones
        </Link>
      </div>

      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}

      <PolicyRemissionForm
        action={createPolicyRemission}
        toSiteId={activeSiteId}
        toSiteName={activeSite.name ?? activeSiteId}
        fromSiteOptions={fromSiteOptions}
        defaultFromSiteId={defaultFromSiteId}
        products={productRows.map((product) => ({
          id: product.id,
          name: product.name ?? product.id,
          stockUnitCode: normalizeUnitCode(product.stock_unit_code || product.unit || "un"),
          categoryLabel: categoryById.get(String(product.category_id ?? "")) ?? "Sin categoría",
        }))}
        policies={policies}
        areaOptions={areaOptions}
        defaultAreaKind={requestedAreaKind}
        stockRows={((stockData ?? []) as StockReferenceRow[]).map((row) => ({
          siteId: row.site_id,
          productId: row.product_id,
          currentQty: Number(row.current_qty ?? 0),
          updatedAt: row.updated_at,
        }))}
        inventoryPostingEnabled={inventoryPostingEnabled}
        requiresSharedDeviceActorSignature={isSharedDevice}
      />
    </div>
  );
}
