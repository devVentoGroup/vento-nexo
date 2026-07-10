import Link from "next/link";
import {
  Table,
  TableHeaderCell,
  TableCell,
} from "@/components/vento/standard/table";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";
import { checkOperationalSessionPermission } from "@/lib/auth/operational-session";
import {
  PRIVILEGED_ROLE_OVERRIDES,
  ROLE_OVERRIDE_COOKIE,
} from "@/lib/auth/role-override-config";
import { getSiteCapabilitiesMap } from "@/lib/inventory/site-capabilities";
import { RemissionsCreateForm } from "@/components/vento/remissions-create-form";
import { safeDecodeURIComponent } from "@/lib/url";
import { normalizeUnitCode, type ProductUomProfile } from "@/lib/inventory/uom";
import { createRemission, runRemissionListAction } from "./actions";
import {
  buildRemissionTraceSummary,
  displayEmployeeName,
  formatDateTime,
  formatStatus,
  getEffectiveRemissionStatus,
  getListActionsForRemission,
  isProducedPackagedProduct,
  loadProductSiteRows,
  normalizeMeasurementMode,
  readBooleanAppSetting,
  supportsRemission,
  supportsRequestedArea,
  usesActualQuantityMode,
  usesFixedPresentationMode,
  type AreaKindPurposeRow,
  type AreaRow,
  type EmployeeNameRow,
  type EmployeeSiteRow,
  type ProductProfileWithProduct,
  type ProductRow,
  type ProductSiteAreaRemissionCategoryRow,
  type ProductionBatchPackageRow,
  type RemissionItemMetricsRow,
  type RemissionOperationalSummaryRow,
  type RemissionRow,
  type SiteAreaPurposeRuleRow,
  type SiteCapabilityRow,
  type SiteRow,
  type StockReferenceRow,
} from "./page-helpers";
import {
  formatOperationalRemissionAreaLabel,
  operationalRemissionAreaScopeAllowsKinds,
  resolveOperationalRemissionAreaScope,
  resolveSharedDeviceOperationalRemissionAreaScope,
  resolveRemissionAreaKindFromKinds,
} from "./operational-area-scope";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const SITE_OVERRIDE_COOKIE = "nexo_site_override_id";
const REMISSIONS_INVENTORY_POSTING_SETTING_KEY =
  "remissions.inventory_posting_enabled";

const PERMISSIONS = {
  remissionsRequest: "inventory.remissions.request",
  remissionsAllSites: "inventory.remissions.all_sites",
  remissionsCancel: "inventory.remissions.cancel",
  remissionsTransit: "inventory.remissions.transit",
  remissionsEditOwnPending: "inventory.remissions.edit_own_pending",
};


type SearchParams = {
  error?: string;
  ok?: string;
  warning?: string;
  site_id?: string;
  from_site_id?: string;
  new?: string;
};

export default async function RemissionsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const okMsg = sp.ok ? safeDecodeURIComponent(sp.ok) : "";

  const { supabase, user, operationalSession } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/remissions",
  });

  const inventoryPostingEnabled = await readBooleanAppSetting(
    supabase,
    REMISSIONS_INVENTORY_POSTING_SETTING_KEY,
    false,
  );

  const isSharedDevice = operationalSession.isSharedDevice;
  const cookieStore = await cookies();
  const { data: employee } = isSharedDevice
    ? { data: null }
    : await supabase
        .from("employees")
        .select("site_id,role")
        .eq("id", user.id)
        .single();
  const { data: settings } = isSharedDevice
    ? { data: null }
    : await supabase
        .from("employee_settings")
        .select("selected_site_id")
        .eq("employee_id", user.id)
        .maybeSingle();

  const actualRole = String(operationalSession.role ?? employee?.role ?? "");
  const roleOverride = isSharedDevice
    ? ""
    : String(cookieStore.get(ROLE_OVERRIDE_COOKIE)?.value ?? "")
        .trim()
        .toLowerCase();
  const canUseRoleOverride =
    Boolean(roleOverride) &&
    PRIVILEGED_ROLE_OVERRIDES.has(actualRole.toLowerCase());
  const effectiveRole = (
    canUseRoleOverride ? roleOverride : actualRole
  ).toLowerCase();
  const canViewAll = isSharedDevice
    ? await checkOperationalSessionPermission({
        supabase,
        session: operationalSession,
        appId: APP_ID,
        code: PERMISSIONS.remissionsAllSites,
      })
    : await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsAllSites,
        actualRole,
      });

  const { data: sitesRows } = isSharedDevice
    ? { data: [] as EmployeeSiteRow[] }
    : await supabase
        .from("employee_sites")
        .select("site_id,is_primary")
        .eq("employee_id", user.id)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .limit(50);

  const sharedDeviceSiteId = String(operationalSession.siteId ?? "").trim();
  const employeeSiteRows = isSharedDevice
    ? sharedDeviceSiteId
      ? ([{ site_id: sharedDeviceSiteId, is_primary: true }] as EmployeeSiteRow[])
      : []
    : ((sitesRows ?? []) as EmployeeSiteRow[]);
  const defaultSiteId = employeeSiteRows[0]?.site_id ?? employee?.site_id ?? "";
  const siteOverrideId = isSharedDevice
    ? ""
    : String(cookieStore.get(SITE_OVERRIDE_COOKIE)?.value ?? "").trim();
  const selectedSiteId = String(settings?.selected_site_id ?? "").trim();
  let activeSiteId = isSharedDevice
    ? sharedDeviceSiteId
    : sp.site_id !== undefined
      ? String(sp.site_id).trim()
      : siteOverrideId || selectedSiteId || (canViewAll ? "" : defaultSiteId);
  if (!activeSiteId && !canViewAll) {
    activeSiteId = defaultSiteId;
  }

  const siteIds = employeeSiteRows
    .map((row) => row.site_id)
    .filter((id): id is string => Boolean(id));

  const { data: sites } = siteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", siteIds)
        .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  const siteRows = (sites ?? []) as SiteRow[];
  const capabilitySiteIds = Array.from(
    new Set([...siteIds, activeSiteId].filter(Boolean)),
  );
  const { data: capabilityRows } = capabilitySiteIds.length
    ? await supabase
        .from("site_operational_capabilities")
        .select(
          "site_id,can_request_remissions,can_fulfill_remissions,can_receive_remissions,can_sell,can_produce,can_hold_inventory,is_commercial_business,show_in_product_setup",
        )
        .in("site_id", capabilitySiteIds)
    : { data: [] as SiteCapabilityRow[] };
  const capabilitiesBySite = getSiteCapabilitiesMap(
    capabilitySiteIds,
    (capabilityRows ?? []) as SiteCapabilityRow[],
  );
  const siteMap = new Map(siteRows.map((site) => [site.id, site]));
  if (activeSiteId && !siteMap.has(activeSiteId)) {
    activeSiteId = defaultSiteId;
  }
  const activeSite = activeSiteId ? siteMap.get(activeSiteId) : undefined;
  const isAllSites = !activeSiteId && canViewAll;
  const activeSiteName = isAllSites
    ? "Todas las sedes"
    : (activeSite?.name ?? activeSiteId);
  const activeSiteType = String(activeSite?.site_type ?? "");
  const activeCapabilities = activeSiteId
    ? capabilitiesBySite.get(activeSiteId)
    : undefined;
  const isProductionCenter =
    activeCapabilities?.can_fulfill_remissions ??
    activeSiteType === "production_center";

  const canRequestPermission = activeSiteId
    ? isSharedDevice
      ? await checkOperationalSessionPermission({
          supabase,
          session: operationalSession,
          appId: APP_ID,
          code: PERMISSIONS.remissionsRequest,
        })
      : await checkPermissionWithRoleOverride({
          supabase,
          appId: APP_ID,
          code: PERMISSIONS.remissionsRequest,
          context: { siteId: activeSiteId },
          actualRole,
        })
    : false;
  const canTransitPermission = activeSiteId
    ? isSharedDevice
      ? await checkOperationalSessionPermission({
          supabase,
          session: operationalSession,
          appId: APP_ID,
          code: PERMISSIONS.remissionsTransit,
        })
      : await checkPermissionWithRoleOverride({
          supabase,
          appId: APP_ID,
          code: PERMISSIONS.remissionsTransit,
          context: { siteId: activeSiteId },
          actualRole,
        })
    : false;

  const viewMode = isAllSites
    ? "all"
    : isProductionCenter
      ? "bodega"
      : "satélite";
  const canCreate =
    Boolean(
      activeCapabilities?.can_request_remissions ??
      activeSiteType === "satellite",
    ) && canRequestPermission;
  const canCancelPermission = isSharedDevice
    ? await checkOperationalSessionPermission({
        supabase,
        session: operationalSession,
        appId: APP_ID,
        code: PERMISSIONS.remissionsCancel,
      })
    : await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsCancel,
        actualRole,
      });
  const canManageRemissionActions = canCancelPermission;
  const canEditOwnPendingPermission = activeSiteId
    ? isSharedDevice
      ? await checkOperationalSessionPermission({
          supabase,
          session: operationalSession,
          appId: APP_ID,
          code: PERMISSIONS.remissionsEditOwnPending,
        })
      : await checkPermissionWithRoleOverride({
          supabase,
          appId: APP_ID,
          code: PERMISSIONS.remissionsEditOwnPending,
          context: { siteId: activeSiteId },
          actualRole,
        })
    : false;
  const receiveAreaScope = activeSiteId && viewMode === "satélite"
    ? isSharedDevice
      ? await resolveSharedDeviceOperationalRemissionAreaScope({
          supabase,
          siteId: activeSiteId,
          areaId: operationalSession.areaId,
          canSeeAllAreas: canViewAll,
        })
      : await resolveOperationalRemissionAreaScope({
          supabase,
          userId: user.id,
          siteId: activeSiteId,
          canSeeAllAreas: canViewAll,
        })
    : null;

  if (effectiveRole === "conductor" && canTransitPermission) {
    const params = new URLSearchParams();
    if (activeSiteId) params.set("site_id", activeSiteId);
    const qs = params.toString();
    redirect(`/inventory/remissions/transit${qs ? `?${qs}` : ""}`);
  }
  const employeeAccessibleSiteIds = new Set(
    employeeSiteRows
      .map((row) => String(row.site_id ?? "").trim())
      .filter(Boolean),
  );

  const { data: routes } = await supabase
    .from("site_supply_routes")
    .select("fulfillment_site_id")
    .eq("requesting_site_id", activeSiteId)
    .eq("is_active", true)
    .limit(1);

  const fulfillmentSiteIds = (routes ?? [])
    .map(
      (route: { fulfillment_site_id: string | null }) =>
        route.fulfillment_site_id,
    )
    .filter((id: string | null): id is string => Boolean(id));

  const { data: fulfillmentSites } = fulfillmentSiteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", fulfillmentSiteIds)
        .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  let fulfillmentSiteRows = (fulfillmentSites ?? []) as SiteRow[];
  if (fulfillmentSiteRows.length > 0) {
    const fulfillmentCapabilityRows = await supabase
      .from("site_operational_capabilities")
      .select("site_id,can_fulfill_remissions")
      .in(
        "site_id",
        fulfillmentSiteRows.map((site) => site.id),
      );
    const fulfillmentCapabilities = new Map(
      (
        (fulfillmentCapabilityRows.data ?? []) as Array<{
          site_id: string;
          can_fulfill_remissions: boolean;
        }>
      ).map((row) => [row.site_id, row.can_fulfill_remissions]),
    );
    fulfillmentSiteRows = fulfillmentSiteRows.filter((site) =>
      fulfillmentCapabilities.has(site.id)
        ? fulfillmentCapabilities.get(site.id) === true
        : site.site_type === "production_center",
    );
  }
  const requestedFromSiteId = sp.from_site_id
    ? String(sp.from_site_id).trim()
    : "";
  const selectedFromSiteId =
    requestedFromSiteId &&
    fulfillmentSiteRows.some((site) => site.id === requestedFromSiteId)
      ? requestedFromSiteId
      : (fulfillmentSiteRows[0]?.id ?? "");
  const requestedCreateParam = String(sp.new ?? "")
    .trim()
    .toLowerCase();
  const showCreatePanel =
    requestedCreateParam === "1" ||
    requestedCreateParam === "true" ||
    requestedCreateParam === "new";
  const buildHubHref = (opts?: { showCreate?: boolean; hash?: string }) => {
    const params = new URLSearchParams();
    if (activeSiteId) params.set("site_id", activeSiteId);
    if (selectedFromSiteId) params.set("from_site_id", selectedFromSiteId);
    if (opts?.showCreate) params.set("new", "1");
    const qs = params.toString();
    const hash = opts?.hash ? `#${opts.hash}` : "";
    return `/inventory/remissions${qs ? `?${qs}` : ""}${hash}`;
  };
  let remissionsQuery = supabase
    .from("restock_requests")
    .select(
      "id, created_at, status, from_site_id, to_site_id, notes, created_by, prepared_by, prepared_at, in_transit_by, in_transit_at, received_by, received_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (activeSiteId) {
    remissionsQuery =
      viewMode === "bodega"
        ? remissionsQuery.eq("from_site_id", activeSiteId)
        : remissionsQuery.eq("to_site_id", activeSiteId);
  }
  const { data: remissions } = await remissionsQuery;
  let remissionRows = (remissions ?? []) as RemissionRow[];
  let remissionIds = remissionRows.map((row) => row.id).filter(Boolean);
  const { data: remissionAreaItemsData } = remissionIds.length
    ? await supabase
        .from("restock_request_items")
        .select("request_id,production_area_kind")
        .in("request_id", remissionIds)
    : { data: [] as Array<{ request_id: string | null; production_area_kind: string | null }> };
  const remissionAreaKindsByRequestId = new Map<string, string[]>();
  for (const row of (remissionAreaItemsData ?? []) as Array<{ request_id: string | null; production_area_kind: string | null }>) {
    const requestId = String(row.request_id ?? "").trim();
    if (!requestId) continue;
    const list = remissionAreaKindsByRequestId.get(requestId) ?? [];
    list.push(String(row.production_area_kind ?? "").trim());
    remissionAreaKindsByRequestId.set(requestId, list);
  }
  const remissionAreaKindByRequestId = new Map<string, string>();
  for (const row of remissionRows) {
    remissionAreaKindByRequestId.set(
      row.id,
      resolveRemissionAreaKindFromKinds(remissionAreaKindsByRequestId.get(row.id) ?? [])
    );
  }
  if (viewMode === "satélite" && receiveAreaScope) {
    remissionRows = remissionRows.filter((row) =>
      operationalRemissionAreaScopeAllowsKinds(
        receiveAreaScope,
        remissionAreaKindsByRequestId.get(row.id) ?? []
      )
    );
    remissionIds = remissionRows.map((row) => row.id).filter(Boolean);
  }
  const { data: operationalSummaryData } = remissionIds.length
    ? await supabase
        .from("restock_operational_summary")
        .select("request_id,can_transit")
        .in("request_id", remissionIds)
    : { data: [] as RemissionOperationalSummaryRow[] };
  const canTransitByRequestId = new Map<string, boolean>();
  for (const row of (operationalSummaryData ??
    []) as RemissionOperationalSummaryRow[]) {
    const requestId = String(row.request_id ?? "").trim();
    if (!requestId) continue;
    canTransitByRequestId.set(requestId, Boolean(row.can_transit));
  }
  // Fallback: calcular "lista para despacho" desde ítems cuando la vista
  // operacional no devuelve filas (RLS/contexto), para mantener consistencia
  // con el detalle de la remisión.
  const missingOperationalIds = remissionIds.filter(
    (id) => !canTransitByRequestId.has(id),
  );
  if (missingOperationalIds.length) {
    const { data: itemMetricsData } = await supabase
      .from("restock_request_items")
      .select("request_id,quantity,prepared_quantity")
      .in("request_id", missingOperationalIds);
    const itemsByRequestId = new Map<string, RemissionItemMetricsRow[]>();
    for (const row of (itemMetricsData ?? []) as RemissionItemMetricsRow[]) {
      const requestId = String(row.request_id ?? "").trim();
      if (!requestId) continue;
      const list = itemsByRequestId.get(requestId) ?? [];
      list.push(row);
      itemsByRequestId.set(requestId, list);
    }
    for (const requestId of missingOperationalIds) {
      const rows = itemsByRequestId.get(requestId) ?? [];
      if (!rows.length) {
        canTransitByRequestId.set(requestId, false);
        continue;
      }
      let hasDispatchReady = false;
      let hasDispatchBlocked = false;
      for (const row of rows) {
        const requestedQty = Number(row.quantity ?? 0);
        if (requestedQty <= 0) continue;
        const preparedQty = Number(row.prepared_quantity ?? 0);
        if (preparedQty > 0) hasDispatchReady = true;
        else hasDispatchBlocked = true;
      }
      canTransitByRequestId.set(
        requestId,
        hasDispatchReady && !hasDispatchBlocked,
      );
    }
  }
  const remissionActorIds = Array.from(
    new Set(
      remissionRows
        .flatMap((row) => [
          String(row.created_by ?? ""),
          String(row.prepared_by ?? ""),
          String(row.in_transit_by ?? ""),
          String(row.received_by ?? ""),
        ])
        .filter(Boolean),
    ),
  );
  const { data: remissionEmployeesData } = remissionActorIds.length
    ? await supabase
        .from("employees")
        .select("id,full_name,alias")
        .in("id", remissionActorIds)
    : { data: [] as EmployeeNameRow[] };
  const remissionEmployeeMap = new Map(
    ((remissionEmployeesData ?? []) as EmployeeNameRow[]).map((employee) => [
      employee.id,
      displayEmployeeName(employee),
    ]),
  );

  const areaFilterSiteId = canCreate ? activeSiteId : selectedFromSiteId;
  const { data: areas } = areaFilterSiteId
    ? await supabase
        .from("areas")
        .select("id,name,kind,site_id")
        .eq("site_id", areaFilterSiteId)
        .order("name", { ascending: true })
    : { data: [] as AreaRow[] };

  const areaRows = (areas ?? []) as AreaRow[];
  const { data: areaKindsPurposeData, error: areaKindsPurposeError } =
    await supabase.from("area_kinds").select("code,use_for_remission");
  const { data: siteAreaPurposeRulesData } = areaFilterSiteId
    ? await supabase
        .from("site_area_purpose_rules")
        .select("site_id,area_kind,purpose,is_enabled")
        .eq("site_id", areaFilterSiteId)
        .eq("purpose", "remission")
    : { data: [] as SiteAreaPurposeRuleRow[] };
  const siteOverrideKinds = new Set(
    ((siteAreaPurposeRulesData ?? []) as SiteAreaPurposeRuleRow[])
      .filter((row) => Boolean(row.is_enabled))
      .map((row) => String(row.area_kind ?? "").trim())
      .filter(Boolean),
  );
  const hasSiteOverride = siteOverrideKinds.size > 0;
  const remissionAreaKindCodes = !areaKindsPurposeError
    ? new Set(
        ((areaKindsPurposeData ?? []) as AreaKindPurposeRow[])
          .filter((row) => Boolean(row.use_for_remission))
          .map((row) => String(row.code ?? "").trim())
          .filter(Boolean),
      )
    : new Set(["mostrador", "bar", "cocina", "general"]);
  remissionAreaKindCodes.add("general");
  const areaOptionsMap = Array.from(
    areaRows.reduce((map, row) => {
      const key = String(row.kind ?? "").trim();
      if (!key) return map;
      if (hasSiteOverride && !siteOverrideKinds.has(key)) return map;
      if (!remissionAreaKindCodes.has(key)) return map;
      if (!map.has(key)) {
        map.set(key, {
          value: key,
          label: key === "general" ? "Todos" : (row.name ?? key),
        });
      }
      return map;
    }, new Map<string, { value: string; label: string }>()),
  ).map(([, value]) => value);

  const areaOptions = (() => {
    const base = [...areaOptionsMap];
    if (!base.some((option) => option.value === "general")) {
      base.unshift({ value: "general", label: "Todos" });
    } else {
      const general = base.find((option) => option.value === "general");
      if (general) general.label = "Todos";
    }
    return base.sort((a, b) => {
      if (a.value === "general") return -1;
      if (b.value === "general") return 1;
      return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
    });
  })();
  // Insumos por satélite: filtrar por sede DESTINO (Saudo), no por sede origen (Centro).
  // Cuando el satélite solicita, solo debe ver productos configurados para su sede.
  const productFilterSiteId = canCreate ? activeSiteId : selectedFromSiteId;
  const requestAreaScope = canCreate && productFilterSiteId
    ? isSharedDevice
      ? await resolveSharedDeviceOperationalRemissionAreaScope({
          supabase,
          siteId: productFilterSiteId,
          areaId: operationalSession.areaId,
          canSeeAllAreas: canViewAll,
        })
      : await resolveOperationalRemissionAreaScope({
          supabase,
          userId: user.id,
          siteId: productFilterSiteId,
          canSeeAllAreas: canViewAll,
        })
    : null;
  const requestedAreaKind = requestAreaScope?.defaultAreaKind ?? "";
  const productSiteRows = productFilterSiteId
    ? await loadProductSiteRows(supabase, productFilterSiteId)
    : [];
  const hasActiveSiteProductConfig = productSiteRows.length > 0;
  const productSiteIds = productSiteRows
    .filter(
      (row) =>
        supportsRemission(row) && supportsRequestedArea(row, requestedAreaKind),
    )
    .map((row) => row.product_id);
  const hasAudienceProducts = productSiteIds.length > 0;

  let productRows: ProductRow[] = [];
  if (hasAudienceProducts) {
    const productsQuery = await supabase
      .from("product_inventory_profiles")
      .select(
        "product_id,inventory_kind,measurement_mode,default_tolerance_percent,requires_actual_dispatch_qty,requires_count_alongside_weight,products(id,name,unit,stock_unit_code,product_type,category_id)",
      )
      .eq("track_inventory", true)
      .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
      .in("product_id", productSiteIds)
      .order("name", { foreignTable: "products", ascending: true })
      .limit(400);

    productRows = (
      (productsQuery.data ?? []) as unknown as ProductProfileWithProduct[]
    )
      .map<ProductRow | null>((row) => {
        if (!row.products) return null;

        return {
          ...row.products,
          inventory_kind: row.inventory_kind ?? null,
          measurement_mode: normalizeMeasurementMode(row.measurement_mode),
          default_tolerance_percent: row.default_tolerance_percent ?? null,
          requires_actual_dispatch_qty:
            typeof row.requires_actual_dispatch_qty === "boolean"
              ? row.requires_actual_dispatch_qty
              : usesActualQuantityMode(row.measurement_mode),
          requires_count_alongside_weight:
            typeof row.requires_count_alongside_weight === "boolean"
              ? row.requires_count_alongside_weight
              : normalizeMeasurementMode(row.measurement_mode) ===
                "count_with_weight",
        };
      })
      .filter((row): row is ProductRow => row !== null);

    if (productRows.length === 0) {
      const { data: fallbackProducts } = await supabase
        .from("products")
        .select("id,name,unit,stock_unit_code,product_type,category_id")
        .eq("is_active", true)
        .in("id", productSiteIds)
        .order("name", { ascending: true })
        .limit(400);
      productRows = ((fallbackProducts ?? []) as unknown as ProductRow[]).map(
        (row) => ({
          ...row,
          inventory_kind: null,
          measurement_mode: "fixed_presentation",
          default_tolerance_percent: null,
          requires_actual_dispatch_qty: false,
          requires_count_alongside_weight: false,
        }),
      );
    }
  }
  const productIds = productRows.map((row) => row.id);
  const categoryAreaOptions = areaOptions.filter(
    (option) => option.value !== "general",
  );
  const selectedRemissionCategoryAreaKind =
    requestedAreaKind ||
    (categoryAreaOptions.length === 1
      ? (categoryAreaOptions[0]?.value ?? "")
      : "");

  const { data: areaRemissionCategoryRows } =
    productFilterSiteId &&
    selectedRemissionCategoryAreaKind &&
    productIds.length > 0
      ? await supabase
          .from("product_site_area_remission_categories")
          .select("product_id,site_id,area_kind,remission_category_id")
          .eq("site_id", productFilterSiteId)
          .eq("area_kind", selectedRemissionCategoryAreaKind)
          .in("product_id", productIds)
      : { data: [] as ProductSiteAreaRemissionCategoryRow[] };

  const areaRemissionCategoryIdByProductId = new Map(
    ((areaRemissionCategoryRows ?? []) as ProductSiteAreaRemissionCategoryRow[])
      .map(
        (row) =>
          [
            String(row.product_id ?? "").trim(),
            String(row.remission_category_id ?? "").trim(),
          ] as const,
      )
      .filter(([productId, categoryId]) => Boolean(productId && categoryId)),
  );
  const legacyRemissionCategoryIdByProductId = new Map(
    productSiteRows
      .map(
        (row) =>
          [
            String(row.product_id ?? "").trim(),
            String(row.remission_category_id ?? "").trim(),
          ] as const,
      )
      .filter(([productId, categoryId]) => Boolean(productId && categoryId)),
  );
  const remissionCategoryIdByProductId = new Map(
    productIds
      .map(
        (productId) =>
          [
            productId,
            areaRemissionCategoryIdByProductId.get(productId) ||
              legacyRemissionCategoryIdByProductId.get(productId) ||
              "",
          ] as const,
      )
      .filter(([, categoryId]) => Boolean(categoryId)),
  );
  const remissionCategoryIds = Array.from(
    new Set(remissionCategoryIdByProductId.values()),
  );
  const { data: remissionCategoryData } = remissionCategoryIds.length
    ? await supabase
        .from("remission_product_categories")
        .select("id,name")
        .in("id", remissionCategoryIds)
        .eq("is_active", true)
    : { data: [] as Array<{ id: string; name: string | null }> };
  const remissionCategoryNameById = new Map(
    (
      (remissionCategoryData ?? []) as Array<{
        id: string;
        name: string | null;
      }>
    ).map((row) => [
      row.id,
      String(row.name ?? "").trim() || "Sin categoría de remisión",
    ]),
  );
  productRows = productRows
    .map<ProductRow | null>((row) => {
      const remissionCategoryId = remissionCategoryIdByProductId.get(row.id);
      if (
        !remissionCategoryId ||
        !remissionCategoryNameById.has(remissionCategoryId)
      )
        return null;
      return {
        ...row,
        category_id: `remission:${remissionCategoryId}`,
      };
    })
    .filter((row): row is ProductRow => row !== null);
  const categoryNameById = new Map<string, string>();
  for (const [
    categoryId,
    categoryName,
  ] of remissionCategoryNameById.entries()) {
    categoryNameById.set(`remission:${categoryId}`, categoryName);
  }
  const fixedPresentationProductIds = productRows
    .filter((row) => usesFixedPresentationMode(row.measurement_mode))
    .map((row) => row.id);
  const { data: uomProfilesData } = fixedPresentationProductIds.length
    ? await supabase
        .from("product_uom_profiles")
        .select(
          "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context",
        )
        .in("product_id", fixedPresentationProductIds)
        .eq("is_active", true)
    : { data: [] as ProductUomProfile[] };
  const defaultUomProfiles = (uomProfilesData ?? []) as ProductUomProfile[];
  const canCreateWithConfiguredCatalog =
    canCreate && hasActiveSiteProductConfig && hasAudienceProducts;
  const pendingCount = remissionRows.filter((row) =>
    ["pending", "preparing"].includes(String(row.status ?? "")),
  ).length;
  const transitCount = remissionRows.filter((row) =>
    ["in_transit", "partial"].includes(String(row.status ?? "")),
  ).length;
  const receivedCount = remissionRows.filter((row) =>
    ["received", "closed"].includes(String(row.status ?? "")),
  ).length;
  const openRemissionRows = remissionRows.filter((row) =>
    ["pending", "preparing", "in_transit", "partial"].includes(
      String(row.status ?? ""),
    ),
  );
  const nextReceiveRow = remissionRows.find((row) =>
    ["in_transit", "partial"].includes(String(row.status ?? "")),
  );
  const nextPrepareRow = remissionRows.find((row) =>
    ["pending", "preparing"].includes(String(row.status ?? "")),
  );
  const heroViewLabel =
    viewMode === "all"
      ? "Todas las sedes"
      : viewMode === "bodega"
        ? "Centro operando"
        : activeSiteName;
  const heroContextTone =
    viewMode === "bodega"
      ? "center"
      : viewMode === "satélite"
        ? "satellite"
        : "all";
  const heroTitle =
    viewMode === "bodega"
      ? "Preparar solicitudes"
      : canCreate
        ? "Pedir a Centro"
        : "Recibir desde Centro";
  const heroSubtitle =
    viewMode === "bodega"
      ? "Centro solo ve lo necesario para preparar y despachar."
      : canCreate
        ? "Elige productos y envía la solicitud. Luego solo sigues el estado."
        : "Aquí solo aparecen las remisiones que todavía te toca recibir.";
  const heroPrimaryHref =
    viewMode === "bodega"
      ? canTransitPermission
        ? "/inventory/remissions/transit"
        : nextPrepareRow
          ? `/inventory/remissions/${nextPrepareRow.id}?from=prepare`
          : "/inventory/remissions/prepare"
      : nextReceiveRow
        ? `/inventory/remissions/${nextReceiveRow.id}`
        : canCreate
          ? buildHubHref({ showCreate: true })
          : "/inventory/remissions";
  const heroPrimaryLabel =
    viewMode === "bodega"
      ? canTransitPermission
        ? "Cola tránsito"
        : nextPrepareRow
          ? "Abrir siguiente"
          : "Abrir cola"
      : nextReceiveRow
        ? "Recibir ahora"
        : canCreate
          ? "Nueva solicitud"
          : "Ver remisiones";
  const compactOperatorView = viewMode !== "all";
  const detailHrefForRow = (rowId: string) =>
    activeSiteId
      ? `/inventory/remissions/${rowId}?site_id=${encodeURIComponent(activeSiteId)}`
      : `/inventory/remissions/${rowId}`;
  const actionRows = openRemissionRows;
  const historyRows = remissionRows.filter((row) =>
    ["received", "closed", "cancelled"].includes(String(row.status ?? "")),
  );
  const fulfillmentSiteIdsForStock = fulfillmentSiteRows
    .map((site) => site.id)
    .filter((id): id is string => Boolean(id));
  const { data: stockReferenceData } =
    inventoryPostingEnabled &&
    canCreateWithConfiguredCatalog &&
    fulfillmentSiteIdsForStock.length > 0 &&
    productIds.length > 0
      ? await supabase
          .from("inventory_stock_by_site")
          .select("site_id,product_id,current_qty,updated_at")
          .in("site_id", fulfillmentSiteIdsForStock)
          .in("product_id", productIds)
      : { data: [] as StockReferenceRow[] };
  const originStockRows = (
    (stockReferenceData ?? []) as StockReferenceRow[]
  ).map((row) => ({
    siteId: row.site_id,
    productId: row.product_id,
    currentQty: Number(row.current_qty ?? 0),
    updatedAt: row.updated_at,
  }));

  const producedProductIds = productRows
    .filter((product) => isProducedPackagedProduct(product))
    .map((product) => product.id);

  const { data: productionPackageData } =
    canCreateWithConfiguredCatalog &&
    fulfillmentSiteIdsForStock.length > 0 &&
    producedProductIds.length > 0
      ? await supabase
          .from("production_batch_packages")
          .select(
            "id,batch_id,site_id,location_id,product_id,package_index,package_label,original_qty,remaining_qty,reserved_qty,unit_code,status,created_at",
          )
          .in("site_id", fulfillmentSiteIdsForStock)
          .in("product_id", producedProductIds)
          .gt("remaining_qty", 0)
          .order("created_at", { ascending: false })
          .limit(400)
      : { data: [] as ProductionBatchPackageRow[] };

  const productionPackageRows = (
    (productionPackageData ?? []) as ProductionBatchPackageRow[]
  )
    .filter((row) => {
      const status = String(row.status ?? "available")
        .trim()
        .toLowerCase();
      const remainingQty = Number(row.remaining_qty ?? 0);
      return (
        ["available", "opened", "reserved"].includes(status) &&
        Number.isFinite(remainingQty) &&
        remainingQty > 0
      );
    })
    .map((row) => ({
      id: row.id,
      batchId: row.batch_id ?? null,
      siteId: row.site_id ?? "",
      locationId: row.location_id ?? null,
      productId: row.product_id ?? "",
      packageIndex: row.package_index ?? null,
      packageLabel: row.package_label ?? null,
      originalQty: Number(row.original_qty ?? row.remaining_qty ?? 0),
      remainingQty: Number(row.remaining_qty ?? 0),
      reservedQty: Number(row.reserved_qty ?? 0),
      unitCode: normalizeUnitCode(row.unit_code ?? ""),
      status: row.status ?? "available",
    }));

  return (
    <div className="ui-scene w-full space-y-6">
      <section
        className="ui-remission-hero ui-fade-up"
        data-context={heroContextTone}
      >
        <div className="ui-remission-hero-grid">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="ui-chip ui-chip--brand">{heroViewLabel}</span>
                {viewMode === "bodega" ? (
                  <span className="ui-chip ui-chip--ops-center">Centro</span>
                ) : null}
                {viewMode === "satélite" ? (
                  <span className="ui-chip ui-chip--ops-satellite">
                    Satelite
                  </span>
                ) : null}
              </div>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
                {heroTitle}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-muted)] sm:text-base">
                {heroSubtitle}
              </p>
            </div>
            {activeSiteId ? (
              <Link
                href={heroPrimaryHref}
                className="ui-btn ui-btn--brand h-12 px-5 text-base font-semibold"
              >
                {heroPrimaryLabel}
              </Link>
            ) : null}
          </div>
          <div className="ui-remission-kpis">
            <div className="ui-remission-kpi">
              <div className="ui-remission-kpi-label">Por preparar</div>
              <div className="ui-remission-kpi-value">{pendingCount}</div>
              <div className="ui-remission-kpi-note">
                Pendientes o preparando
              </div>
            </div>
            <div className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">En movimiento</div>
              <div className="ui-remission-kpi-value">{transitCount}</div>
              <div className="ui-remission-kpi-note">En viaje o parciales</div>
            </div>
            <div className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Recibidas</div>
              <div className="ui-remission-kpi-value">{receivedCount}</div>
              <div className="ui-remission-kpi-note">Cierre operativo</div>
            </div>
          </div>
        </div>
      </section>

      {errorMsg ? (
        <div className="ui-alert ui-alert--error ui-fade-up ui-delay-1">
          Error: {errorMsg}
        </div>
      ) : null}

      {okMsg ? (
        <div className="ui-alert ui-alert--success ui-fade-up ui-delay-1">
          {okMsg}
        </div>
      ) : null}

      {inventoryPostingEnabled && sp.warning === "low_stock" ? (
        <div className="ui-alert ui-alert--warn ui-fade-up ui-delay-1">
          Algunos items podrian no tener stock suficiente en Centro.
        </div>
      ) : null}

      <div className="ui-panel ui-panel--halo ui-remission-section ui-fade-up ui-delay-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Sede activa</div>
            <div className="mt-1 ui-caption">
              Vista:{" "}
              {viewMode === "all"
                ? "Todas las sedes"
                : viewMode === "bodega"
                  ? "Bodega (Centro)"
                  : "Sede satélite"}
            </div>
          </div>
          {compactOperatorView ? (
            <details className="rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                Cambiar sede
              </summary>
              <form
                method="get"
                className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center"
              >
                <select
                  name="site_id"
                  defaultValue={activeSiteId}
                  className="ui-input"
                >
                  {canViewAll ? (
                    <option value="">Todas las sedes</option>
                  ) : null}
                  {employeeSiteRows.map((row) => {
                    const siteId = row.site_id ?? "";
                    if (!siteId) return null;
                    const site = siteMap.get(siteId);
                    const label = site?.name ? `${site.name}` : siteId;
                    const suffix = row.is_primary ? " (principal)" : "";
                    return (
                      <option key={siteId} value={siteId}>
                        {label}
                        {suffix}
                      </option>
                    );
                  })}
                </select>
                <button className="ui-btn ui-btn--ghost">Usar sede</button>
              </form>
            </details>
          ) : (
            <form method="get" className="flex items-center gap-3">
              <select
                name="site_id"
                defaultValue={activeSiteId}
                className="ui-input"
              >
                {canViewAll ? <option value="">Todas las sedes</option> : null}
                {employeeSiteRows.map((row) => {
                  const siteId = row.site_id ?? "";
                  if (!siteId) return null;
                  const site = siteMap.get(siteId);
                  const label = site?.name ? `${site.name}` : siteId;
                  const suffix = row.is_primary ? " (principal)" : "";
                  return (
                    <option key={siteId} value={siteId}>
                      {label}
                      {suffix}
                    </option>
                  );
                })}
              </select>
              <button className="ui-btn ui-btn--ghost">Cambiar</button>
            </form>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[var(--ui-text)]">
                Remisiones e inventario real
              </div>
              <div className="mt-1 text-sm text-[var(--ui-muted)]">
                {inventoryPostingEnabled
                  ? "Inventario conectado desde configuración. Las remisiones pueden validar stock, mostrar faltantes y usar reversas."
                  : "Inventario desconectado desde configuración. Las remisiones operan como solicitudes/alistamientos sin afectar inventario real."}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  inventoryPostingEnabled
                    ? "ui-chip ui-chip--success"
                    : "ui-chip"
                }
              >
                {inventoryPostingEnabled
                  ? "Inventario conectado"
                  : "Inventario desconectado"}
              </span>

              {canManageRemissionActions ? (
                <Link
                  href="/inventory/settings/remissions"
                  className="ui-btn ui-btn--ghost h-11 px-4 text-sm font-semibold"
                >
                  Cambiar en configuración
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {!activeSiteId ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            {canViewAll
              ? "Vista global activa. Selecciona una sede para operar remisiones."
              : isSharedDevice
                ? "Este dispositivo compartido no tiene sede operativa configurada."
                : "No hay sede activa. Asigna una sede al empleado para operar remisiones."}
          </div>
        ) : null}

        {!canCreate && viewMode === "satélite" ? (
          <div className="mt-4 ui-alert ui-alert--neutral">
            {activeSiteId &&
            !canRequestPermission &&
            effectiveRole === "conductor" ? (
              <>
                El rol <strong>conductor</strong> no puede solicitar remisiones
                en sede satélite. Este rol opera remisiones en
                tránsito/recepción. Cambia a <code>cajero</code>,{" "}
                <code>barista</code>, <code>cocinero</code> o{" "}
                <code>propietario</code> para crear solicitudes.
              </>
            ) : activeSiteId && !canRequestPermission ? (
              <>
                No puedes crear remisiones en esta sede porque falta el permiso{" "}
                <code>nexo.inventory.remissions.request</code> para tu rol
                actual. Verifica rol/sede activa y permisos en BD.
              </>
            ) : (
              <>
                Esta vista queda en modo recepción. Cuando una remisión salga
                desde Centro, aquí podrás abrirla y recibirla.
              </>
            )}
          </div>
        ) : null}

        {canCreate && activeSiteId && fulfillmentSiteIds.length === 0 ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            No hay rutas de abastecimiento para {activeSiteName}. Configúralas
            en{" "}
            <Link
              href="/inventory/settings/supply-routes"
              className="font-semibold underline"
            >
              Configuración → Rutas de abastecimiento
            </Link>
            .
          </div>
        ) : null}

        {canCreate && !hasActiveSiteProductConfig ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            Esta sede no tiene productos habilitados. Configura disponibilidad
            por sede en{" "}
            <Link href="/inventory/catalog" className="font-semibold underline">
              Catalogo
            </Link>
            .
          </div>
        ) : null}

        {canCreate && hasActiveSiteProductConfig && !hasAudienceProducts ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            Esta sede no tiene productos habilitados para su uso operativo.
            Ajusta Uso en sede en{" "}
            <Link href="/inventory/catalog" className="font-semibold underline">
              Catalogo
            </Link>
            .
          </div>
        ) : null}

        {canCreate &&
        hasActiveSiteProductConfig &&
        hasAudienceProducts &&
        productRows.length === 0 ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            No hay insumos configurados para {activeSiteName}. Añade la sede en{" "}
            <Link href="/inventory/catalog" className="font-semibold underline">
              Catálogo
            </Link>
            → ficha del producto → Sedes.
          </div>
        ) : null}
      </div>

      <div
        className="ui-panel ui-remission-section ui-fade-up ui-delay-2"
        id="solicitudes-abiertas"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ui-h3">
              {viewMode === "bodega"
                ? "Requieren acción ahora"
                : nextReceiveRow
                  ? "Requieren acción ahora"
                  : canCreate
                    ? "Solicitudes abiertas"
                    : "Remisiones abiertas"}
            </div>
            <div className="mt-1 ui-caption">
              {actionRows.length} remision(es) pendientes, preparando, en
              transito o parciales
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">{pendingCount} activas</span>
            <span className="ui-chip ui-chip--warn">
              {transitCount} en curso
            </span>
            <span className="ui-chip ui-chip--success">
              {receivedCount} recibidas
            </span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Área</TableHeaderCell>
                {viewMode !== "bodega" ? (
                  <TableHeaderCell>Origen</TableHeaderCell>
                ) : null}
                {viewMode !== "satélite" ? (
                  <TableHeaderCell>Destino</TableHeaderCell>
                ) : null}
                {!compactOperatorView ? (
                  <TableHeaderCell>Trazabilidad</TableHeaderCell>
                ) : null}
                <TableHeaderCell>Acciones</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {actionRows.map((row) => {
                const effectiveStatus = getEffectiveRemissionStatus(
                  row,
                  canTransitByRequestId,
                );
                const fromSiteId = row.from_site_id ?? "";
                const toSiteId = row.to_site_id ?? "";
                const rowCanFrom =
                  canCancelPermission &&
                  employeeAccessibleSiteIds.has(fromSiteId);
                const rowCanTo =
                  canCancelPermission &&
                  employeeAccessibleSiteIds.has(toSiteId);
                const rowCanManageBasic =
                  canManageRemissionActions &&
                  (canViewAll || rowCanFrom || rowCanTo);
                const rowCanReverse =
                  inventoryPostingEnabled &&
                  canManageRemissionActions &&
                  (canViewAll || (rowCanFrom && rowCanTo));
                const rowCanEditOwnPending =
                  canEditOwnPendingPermission &&
                  String(row.created_by ?? "") === user.id &&
                  String(row.status ?? "") === "pending" &&
                  String(row.to_site_id ?? "") === activeSiteId;

                const rowActions = getListActionsForRemission(
                  row.status,
                  row.notes,
                  rowCanManageBasic,
                  rowCanReverse,
                  rowCanEditOwnPending,
                );
                return (
                  <tr key={row.id} className="ui-body">
                    <TableCell>{formatDateTime(row.created_at)}</TableCell>
                    <TableCell>
                      <span
                        className={`${formatStatus(effectiveStatus).className} ui-chip--status-${String(effectiveStatus ?? "unknown")}`}
                      >
                        {formatStatus(effectiveStatus).label}
                      </span>
                    </TableCell>
                    <TableCell>{formatOperationalRemissionAreaLabel(remissionAreaKindByRequestId.get(row.id))}</TableCell>
                    {viewMode !== "bodega" ? (
                      <TableCell>
                        {siteMap.get(fromSiteId)?.name ?? fromSiteId}
                      </TableCell>
                    ) : null}
                    {viewMode !== "satélite" ? (
                      <TableCell>
                        {siteMap.get(toSiteId)?.name ?? toSiteId}
                      </TableCell>
                    ) : null}
                    {!compactOperatorView ? (
                      <TableCell>
                        <div className="font-medium text-[var(--ui-text)]">
                          {buildRemissionTraceSummary(
                            row,
                            remissionEmployeeMap,
                          )}
                        </div>
                        {row.notes ? (
                          <div className="ui-caption mt-1">
                            Nota: {row.notes}
                          </div>
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={detailHrefForRow(row.id)}
                          className="ui-btn ui-btn--ghost h-11 px-4 text-sm font-semibold"
                        >
                          {viewMode === "bodega"
                            ? canTransitPermission &&
                              String(row.status ?? "") === "preparing"
                              ? "Checklist tránsito"
                              : "Preparar"
                            : ["in_transit", "partial"].includes(
                                  String(row.status ?? ""),
                                )
                              ? "Recibir"
                              : "Ver"}
                        </Link>
                        {rowActions.includes("edit") ? (
                          <Link
                            href={
                              activeSiteId
                                ? `/inventory/remissions/${row.id}/edit?site_id=${encodeURIComponent(activeSiteId)}`
                                : `/inventory/remissions/${row.id}/edit`
                            }
                            className="ui-btn ui-btn--ghost ui-btn--compact px-3 text-sm font-semibold"
                          >
                            Editar
                          </Link>
                        ) : null}
                        {rowActions.includes("cancel") ? (
                          <form action={runRemissionListAction}>
                            <input
                              type="hidden"
                              name="request_id"
                              value={row.id}
                            />
                            <input type="hidden" name="action" value="cancel" />
                            <button className="ui-btn ui-btn--ghost ui-btn--compact px-3 text-sm font-semibold">
                              Cancelar
                            </button>
                          </form>
                        ) : null}
                        {rowActions.includes("reverse_cancel") ? (
                          <form action={runRemissionListAction}>
                            <input
                              type="hidden"
                              name="request_id"
                              value={row.id}
                            />
                            <input
                              type="hidden"
                              name="action"
                              value="reverse_cancel"
                            />
                            <button className="ui-btn ui-btn--action ui-btn--compact px-3 text-sm font-semibold">
                              Anular + reversa
                            </button>
                          </form>
                        ) : null}
                        {rowActions.includes("delete") ? (
                          <form action={runRemissionListAction}>
                            <input
                              type="hidden"
                              name="request_id"
                              value={row.id}
                            />
                            <input type="hidden" name="action" value="delete" />
                            <button className="ui-btn ui-btn--danger ui-btn--compact px-3 text-sm font-semibold">
                              Eliminar
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </TableCell>
                  </tr>
                );
              })}

              {!actionRows.length ? (
                <tr>
                  <TableCell
                    colSpan={compactOperatorView ? 4 : 6}
                    className="ui-empty"
                  >
                    No hay remisiones que requieran accion en este momento.
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </div>

      {canCreateWithConfiguredCatalog ? (
        <div
          className="ui-panel ui-remission-section ui-fade-up ui-delay-2"
          id="nueva-remision"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="ui-h3">Nueva remisión</div>
              <div className="mt-1 ui-caption">
                Crea una solicitud sin bajar por todo el historial. El
                formulario se abre encima de esta pantalla.
              </div>
            </div>
            <Link
              href={buildHubHref({ showCreate: true })}
              className="ui-btn ui-btn--brand h-11 px-4 text-sm font-semibold"
            >
              Crear solicitud
            </Link>
          </div>
        </div>
      ) : null}

      {canCreateWithConfiguredCatalog && showCreatePanel ? (
        <div
          className="fixed inset-0 z-[80] flex items-stretch justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nueva-remision-title"
        >
          <Link
            href={buildHubHref({ hash: "solicitudes-abiertas" })}
            className="absolute inset-0 hidden sm:block"
            aria-label="Cerrar formulario de nueva remisión"
          />
          <section className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--ui-bg)] shadow-2xl overscroll-contain sm:h-[90dvh] sm:max-w-6xl sm:rounded-[2rem] sm:border sm:border-[var(--ui-border)]">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--ui-border)] bg-[var(--ui-bg)] px-4 py-4 sm:px-6">
              <div>
                <div
                  id="nueva-remision-title"
                  className="text-lg font-semibold tracking-[-0.02em] text-[var(--ui-text)] sm:text-xl"
                >
                  Nueva remisión
                </div>
                <div className="mt-1 text-sm leading-5 text-[var(--ui-muted)]">
                  Solicitud desde {activeSiteName}. El formulario se abre
                  encima del historial; cierra para volver a la lista.
                </div>
              </div>
              <Link
                href={buildHubHref({ hash: "solicitudes-abiertas" })}
                className="ui-btn ui-btn--ghost h-10 shrink-0 px-3 text-sm font-semibold sm:h-11 sm:px-4"
              >
                Cerrar
              </Link>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
              <RemissionsCreateForm
                action={createRemission}
                toSiteId={activeSiteId}
                toSiteName={activeSiteName}
                fromSiteOptions={fulfillmentSiteRows.map((site) => ({
                  id: site.id,
                  name: site.name ?? site.id,
                }))}
                defaultFromSiteId={selectedFromSiteId}
                products={productRows}
                categoryNameById={Object.fromEntries(categoryNameById)}
                defaultUomProfiles={defaultUomProfiles}
                areaOptions={areaOptions}
                defaultAreaKind={selectedRemissionCategoryAreaKind}
                originStockRows={inventoryPostingEnabled ? originStockRows : []}
                productionPackageRows={productionPackageRows}
                inventoryPostingEnabled={inventoryPostingEnabled}
                requiresSharedDeviceActorSignature={isSharedDevice}
              />
            </div>
          </section>
        </div>
      ) : null}

      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ui-h3">Historial reciente</div>
            <div className="mt-1 ui-caption">
              {historyRows.length} remision(es) ya recibidas o canceladas
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip ui-chip--success">
              {receivedCount} recibidas
            </span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Área</TableHeaderCell>
                {viewMode !== "bodega" ? (
                  <TableHeaderCell>Origen</TableHeaderCell>
                ) : null}
                {viewMode !== "satélite" ? (
                  <TableHeaderCell>Destino</TableHeaderCell>
                ) : null}
                {!compactOperatorView ? (
                  <TableHeaderCell>Trazabilidad</TableHeaderCell>
                ) : null}
                <TableHeaderCell>Acciones</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {historyRows.slice(0, 20).map((row) => {
                const effectiveStatus = getEffectiveRemissionStatus(
                  row,
                  canTransitByRequestId,
                );
                const fromSiteId = row.from_site_id ?? "";
                const toSiteId = row.to_site_id ?? "";
                const rowCanFrom =
                  canCancelPermission &&
                  employeeAccessibleSiteIds.has(fromSiteId);
                const rowCanTo =
                  canCancelPermission &&
                  employeeAccessibleSiteIds.has(toSiteId);
                const rowCanManageBasic =
                  canManageRemissionActions &&
                  (canViewAll || rowCanFrom || rowCanTo);
                const rowCanReverse =
                  inventoryPostingEnabled &&
                  canManageRemissionActions &&
                  (canViewAll || (rowCanFrom && rowCanTo));
                const rowCanEditOwnPending =
                  canEditOwnPendingPermission &&
                  String(row.created_by ?? "") === user.id &&
                  String(row.status ?? "") === "pending" &&
                  String(row.to_site_id ?? "") === activeSiteId;

                const rowActions = getListActionsForRemission(
                  row.status,
                  row.notes,
                  rowCanManageBasic,
                  rowCanReverse,
                  rowCanEditOwnPending,
                );
                return (
                  <tr key={row.id} className="ui-body">
                    <TableCell>{formatDateTime(row.created_at)}</TableCell>
                    <TableCell>
                      <span
                        className={`${formatStatus(effectiveStatus).className} ui-chip--status-${String(effectiveStatus ?? "unknown")}`}
                      >
                        {formatStatus(effectiveStatus).label}
                      </span>
                    </TableCell>
                    <TableCell>{formatOperationalRemissionAreaLabel(remissionAreaKindByRequestId.get(row.id))}</TableCell>
                    {viewMode !== "bodega" ? (
                      <TableCell>
                        {siteMap.get(fromSiteId)?.name ?? fromSiteId}
                      </TableCell>
                    ) : null}
                    {viewMode !== "satélite" ? (
                      <TableCell>
                        {siteMap.get(toSiteId)?.name ?? toSiteId}
                      </TableCell>
                    ) : null}
                    {!compactOperatorView ? (
                      <TableCell>
                        <div className="font-medium text-[var(--ui-text)]">
                          {buildRemissionTraceSummary(
                            row,
                            remissionEmployeeMap,
                          )}
                        </div>
                        {row.notes ? (
                          <div className="ui-caption mt-1">
                            Nota: {row.notes}
                          </div>
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={detailHrefForRow(row.id)}
                          className="ui-btn ui-btn--ghost h-11 px-4 text-sm font-semibold"
                        >
                          Ver
                        </Link>
                        {rowActions.includes("edit") ? (
                          <Link
                            href={
                              activeSiteId
                                ? `/inventory/remissions/${row.id}/edit?site_id=${encodeURIComponent(activeSiteId)}`
                                : `/inventory/remissions/${row.id}/edit`
                            }
                            className="ui-btn ui-btn--ghost ui-btn--compact px-3 text-sm font-semibold"
                          >
                            Editar
                          </Link>
                        ) : null}
                        {rowActions.includes("cancel") ? (
                          <form action={runRemissionListAction}>
                            <input
                              type="hidden"
                              name="request_id"
                              value={row.id}
                            />
                            <input type="hidden" name="action" value="cancel" />
                            <button className="ui-btn ui-btn--ghost ui-btn--compact px-3 text-sm font-semibold">
                              Cancelar
                            </button>
                          </form>
                        ) : null}
                        {rowActions.includes("reverse_cancel") ? (
                          <form action={runRemissionListAction}>
                            <input
                              type="hidden"
                              name="request_id"
                              value={row.id}
                            />
                            <input
                              type="hidden"
                              name="action"
                              value="reverse_cancel"
                            />
                            <button className="ui-btn ui-btn--action ui-btn--compact px-3 text-sm font-semibold">
                              Anular + reversa
                            </button>
                          </form>
                        ) : null}
                        {rowActions.includes("delete") ? (
                          <form action={runRemissionListAction}>
                            <input
                              type="hidden"
                              name="request_id"
                              value={row.id}
                            />
                            <input type="hidden" name="action" value="delete" />
                            <button className="ui-btn ui-btn--danger ui-btn--compact px-3 text-sm font-semibold">
                              Eliminar
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </TableCell>
                  </tr>
                );
              })}

              {!historyRows.length ? (
                <tr>
                  <TableCell
                    colSpan={compactOperatorView ? 4 : 6}
                    className="ui-empty"
                  >
                    Todavia no hay historial reciente.
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}
