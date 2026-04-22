import { redirect } from "next/navigation";

import {
  canUseRoleOverride,
  checkPermissionWithRoleOverride,
  getRoleOverrideFromCookies,
  isPermissionAllowedForRole,
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
  /** Modo prueba: no mezclar permisos directos del empleado (ej. propietario) con la simulación. */
  const remissionSimulateRoleOverride = canOverrideRole && Boolean(overrideRole);

  async function remissionPermission(
    code: string,
    siteId: string | null | undefined
  ): Promise<boolean> {
    const sid = String(siteId ?? "").trim();
    if (!sid) return false;
    if (remissionSimulateRoleOverride) {
      return isPermissionAllowedForRole(supabase, effectiveRole, APP_ID, code, { siteId: sid });
    }
    return checkPermissionWithRoleOverride({
      supabase,
      appId: APP_ID,
      code,
      context: { siteId: sid },
      actualRole: role,
    });
  }
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

  const canPreparePermission = await remissionPermission(
    PERMISSIONS.remissionsPrepare,
    fromSiteId
  );
  const canReceivePermission = await remissionPermission(
    PERMISSIONS.remissionsReceive,
    toSiteId
  );
  const canTransitPermission = await remissionPermission(
    PERMISSIONS.remissionsTransit,
    fromSiteId
  );
  const canCancel = await remissionPermission(
    PERMISSIONS.remissionsCancel,
    fromSiteId || toSiteId || null
  );

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
      fromSiteType === "production_center" &&
      canPreparePermission &&
      actingOnFromSite,
    canTransit:
      fromSiteType === "production_center" && canTransitPermission,
    canReceive:
      toSiteType === "satellite" && canReceivePermission && actingOnToSite,
    canCancel,
  };
}
