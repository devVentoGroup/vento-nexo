import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { normalizePermissionCode } from "@/lib/auth/permissions";
import {
  canUseRoleOverride,
  getRoleOverrideFromCookies,
  isPermissionAllowedForRole,
} from "@/lib/auth/role-override";
import {
  checkOperationalSessionPermission,
  isOperationalSessionAppAllowed,
  resolveOperationalSession,
} from "@/lib/auth/operational-session";

type GuardOptions = {
  appId: string;
  returnTo: string;
  supabase?: Awaited<ReturnType<typeof createClient>>;
  permissionCode?: string | string[];
  siteId?: string | null;
  areaId?: string | null;
};

export async function requireAppAccess({
  appId,
  returnTo,
  supabase,
  permissionCode,
  siteId,
  areaId,
}: GuardOptions) {
  const client = supabase ?? (await createClient());

  const { data: userRes } = await client.auth.getUser();
  const user = userRes.user ?? null;

  if (!user) {
    const qs = new URLSearchParams();
    qs.set("returnTo", returnTo);
    redirect(`/login?${qs.toString()}`);
  }

  const operationalSession = await resolveOperationalSession({
    supabase: client,
    userId: user.id,
    appId,
    preferredSiteId: siteId ?? null,
    preferredAreaId: areaId ?? null,
  });

  if (operationalSession.isSharedDevice) {
    if (!isOperationalSessionAppAllowed(operationalSession, appId)) {
      const qs = new URLSearchParams();
      qs.set("returnTo", returnTo);
      qs.set("reason", "shared_device_app_not_allowed");
      qs.set("permission", `${appId}.access`);
      redirect(`/no-access?${qs.toString()}`);
    }
  } else {
    const { data: canAccess, error: accessErr } = await client.rpc("has_permission", {
      p_permission_code: `${appId}.access`,
      p_site_id: operationalSession.siteId,
      p_area_id: operationalSession.areaId,
    });

    if (accessErr || !canAccess) {
      const qs = new URLSearchParams();
      qs.set("returnTo", returnTo);
      if (accessErr) qs.set("reason", "no_access");
      redirect(`/no-access?${qs.toString()}`);
    }
  }

  const permissionCodes = Array.isArray(permissionCode)
    ? permissionCode.filter(Boolean)
    : permissionCode
      ? [permissionCode]
      : [];

  if (permissionCodes.length) {
    const normalizedCodes = permissionCodes.map((code) =>
      normalizePermissionCode(appId, code),
    );

    if (operationalSession.isSharedDevice) {
      const checks = await Promise.all(
        normalizedCodes.map((code) =>
          checkOperationalSessionPermission({
            supabase: client,
            session: operationalSession,
            appId,
            code,
          }),
        ),
      );
      const deniedIndex = checks.findIndex((allowed) => !allowed);
      if (deniedIndex !== -1) {
        const qs = new URLSearchParams();
        qs.set("returnTo", returnTo);
        qs.set("reason", "shared_device_no_permission");
        qs.set("permission", String(normalizedCodes[deniedIndex] ?? ""));
        redirect(`/no-access?${qs.toString()}`);
      }
    } else {
      const overrideRole = await getRoleOverrideFromCookies();
      const canOverride = Boolean(
        overrideRole &&
          operationalSession.role &&
          canUseRoleOverride(operationalSession.role, overrideRole),
      );

      if (canOverride) {
        const checks = await Promise.all(
          normalizedCodes.map((code) =>
            isPermissionAllowedForRole(client, overrideRole!, appId, code, {
              siteId: operationalSession.siteId,
              areaId: operationalSession.areaId,
            }),
          ),
        );
        const deniedIndex = checks.findIndex((allowed) => !allowed);
        const deniedCode = deniedIndex >= 0 ? normalizedCodes[deniedIndex] : null;
        if (deniedCode) {
          const qs = new URLSearchParams();
          qs.set("returnTo", returnTo);
          qs.set("reason", "role_override");
          qs.set("permission", String(deniedCode ?? ""));
          redirect(`/no-access?${qs.toString()}`);
        }
      } else {
        const checks = await Promise.all(
          normalizedCodes.map((code) =>
            client.rpc("has_permission", {
              p_permission_code: code,
              p_site_id: operationalSession.siteId,
              p_area_id: operationalSession.areaId,
            }),
          ),
        );

        const deniedIndex = checks.findIndex((res) => res.error || !res.data);
        if (deniedIndex !== -1) {
          const qs = new URLSearchParams();
          qs.set("returnTo", returnTo);
          qs.set("reason", "no_permission");
          qs.set("permission", String(normalizedCodes[deniedIndex] ?? ""));
          redirect(`/no-access?${qs.toString()}`);
        }
      }
    }
  }

  return {
    supabase: client,
    user,
    siteId: operationalSession.siteId,
    operationalSession,
    sharedDevice: operationalSession.isSharedDevice
      ? {
          id: operationalSession.sharedDeviceId,
          code: operationalSession.sharedDeviceCode,
          label: operationalSession.sharedDeviceLabel,
          site_id: operationalSession.siteId,
          area_id: operationalSession.areaId,
          navigation_role: operationalSession.navigationRole,
          appAllowed: isOperationalSessionAppAllowed(operationalSession, appId),
        }
      : null,
  };
}
