import { redirect } from "next/navigation";

import {
  canUseRoleOverride,
  checkPermissionWithRoleOverride,
  getRoleOverrideFromCookies,
} from "@/lib/auth/role-override";
import {
  buildOperationalBlockMessage,
  getOperationalContext,
} from "@/lib/auth/operational-context";

import {
  type AccessContext,
  type SiteRow,
  type SupabaseClient,
  buildRemissionDetailHref,
} from "./detail-utils";

const APP_ID = "nexo";

const PERMISSIONS = {
  remissionsPrepare: "inventory.remissions.prepare",
  remissionsTransit: "inventory.remissions.transit",
  remissionsReceive: "inventory.remissions.receive",
  remissionsCancel: "inventory.remissions.cancel",
};

export async function enforceOperationalGateOrRedirect(params: {
  supabase: SupabaseClient;
  userId: string;
  siteId: string | null | undefined;
  requestId: string;
  returnOrigin: "" | "prepare";
  fallbackMessage: string;
}) {
  const { supabase, userId, siteId, requestId, returnOrigin, fallbackMessage } = params;
  const normalizedSiteId = String(siteId ?? "").trim();
  if (!normalizedSiteId) return;

  const opContext = await getOperationalContext({
    supabase,
    employeeId: userId,
    siteId: normalizedSiteId,
    appCode: APP_ID,
  });

  if (!opContext?.can_operate) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: buildOperationalBlockMessage(opContext, fallbackMessage),
      })
    );
  }
}

export async function loadAccessContext(
  supabase: SupabaseClient,
  userId: string,
  request: { from_site_id?: string | null; to_site_id?: string | null } | null,
  activeSiteId?: string | null
): Promise<AccessContext> {
  const { data: employee } = await supabase
    .from("employees")
    .select("role,site_id")
    .eq("id", userId)
    .single();

  const role = String(employee?.role ?? "");
  const overrideRole = await getRoleOverrideFromCookies();
  const canOverrideRole = canUseRoleOverride(role, overrideRole);
  const effectiveRole = canOverrideRole ? String(overrideRole) : role;
  const { data: settings } = await supabase
    .from("employee_settings")
    .select("selected_site_id")
    .eq("employee_id", userId)
    .maybeSingle();
  const selectedSiteId = String(
    activeSiteId && String(activeSiteId).trim()
      ? activeSiteId
      : settings?.selected_site_id ?? employee?.site_id ?? ""
  ).trim();

  const fromSiteId = request?.from_site_id ?? "";
  const toSiteId = request?.to_site_id ?? "";
  const siteIds = [fromSiteId, toSiteId].filter((id) => id);

  const { data: requestSites } = siteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", siteIds)
    : { data: [] as SiteRow[] };

  const siteMap = new Map<string, SiteRow>(
    (requestSites ?? []).map((site: SiteRow) => [site.id, site])
  );
  const fromSiteType = String(siteMap.get(fromSiteId)?.site_type ?? "");
  const toSiteType = String(siteMap.get(toSiteId)?.site_type ?? "");
  const fromSiteName = String(siteMap.get(fromSiteId)?.name ?? fromSiteId ?? "");
  const toSiteName = String(siteMap.get(toSiteId)?.name ?? toSiteId ?? "");

  const canPreparePermission = fromSiteId
    ? await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsPrepare,
        context: { siteId: fromSiteId },
        actualRole: role,
      })
    : false;
  const canReceivePermission = toSiteId
    ? await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsReceive,
        context: { siteId: toSiteId },
        actualRole: role,
      })
    : false;
  const canTransitPermission = fromSiteId
    ? await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsTransit,
        context: { siteId: fromSiteId },
        actualRole: role,
      })
    : false;
  const canCancel = await checkPermissionWithRoleOverride({
    supabase,
    appId: APP_ID,
    code: PERMISSIONS.remissionsCancel,
    context: { siteId: fromSiteId || toSiteId || null },
    actualRole: role,
  });

  const actingOnFromSite = Boolean(selectedSiteId) && selectedSiteId === fromSiteId;
  const actingOnToSite = Boolean(selectedSiteId) && selectedSiteId === toSiteId;

  return {
    role,
    selectedSiteId,
    fromSiteType,
    toSiteType,
    fromSiteName,
    toSiteName,
    canPrepare:
      fromSiteType === "production_center" && canPreparePermission && actingOnFromSite,
    canTransit:
      fromSiteType === "production_center" && canTransitPermission && actingOnFromSite,
    canReceive:
      toSiteType === "satellite" && canReceivePermission && actingOnToSite,
    canCancel,
  };
}
