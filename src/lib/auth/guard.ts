import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { normalizePermissionCode } from "@/lib/auth/permissions";
import {
  canUseRoleOverride,
  getRoleOverrideFromCookies,
  isPermissionAllowedForRole,
} from "@/lib/auth/role-override";

type GuardOptions = {
  appId: string;
  returnTo: string;
  supabase?: Awaited<ReturnType<typeof createClient>>;
  permissionCode?: string | string[];
};

type SharedDeviceRow = {
  id: string;
  site_id: string | null;
  area_id: string | null;
  default_app_code: string | null;
  navigation_role: string | null;
};

type SharedDeviceAccess = SharedDeviceRow & {
  appAllowed: boolean;
};

async function resolveSharedDeviceAccess(
  client: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  appId: string,
): Promise<SharedDeviceAccess | null> {
  const { data: device, error: deviceError } = await client
    .from("shared_operational_devices")
    .select("id,site_id,area_id,default_app_code,navigation_role")
    .eq("auth_user_id", userId)
    .eq("is_active", true)
    .eq("activation_status", "active")
    .maybeSingle();

  if (deviceError || !device) return null;

  const { data: appRow } = await client
    .from("shared_operational_device_apps")
    .select("app_code")
    .eq("device_id", device.id)
    .eq("app_code", appId)
    .eq("is_active", true)
    .maybeSingle();

  return {
    ...(device as SharedDeviceRow),
    appAllowed: Boolean(appRow),
  };
}

function isAppAccessCode(appId: string, code: string) {
  return normalizePermissionCode(appId, code) === `${appId}.access`;
}

async function isSharedDevicePermissionAllowed({
  client,
  sharedDevice,
  appId,
  code,
}: {
  client: Awaited<ReturnType<typeof createClient>>;
  sharedDevice: SharedDeviceAccess;
  appId: string;
  code: string;
}) {
  if (!sharedDevice.appAllowed) return false;

  if (isAppAccessCode(appId, code)) {
    return true;
  }

  const navigationRole = String(sharedDevice.navigation_role ?? "").trim();
  if (!navigationRole) return false;

  return isPermissionAllowedForRole(client, navigationRole, appId, code, {
    siteId: sharedDevice.site_id ?? null,
    areaId: sharedDevice.area_id ?? null,
  });
}

export async function requireAppAccess({
  appId,
  returnTo,
  supabase,
  permissionCode,
}: GuardOptions) {
  const client = supabase ?? (await createClient());

  const { data: userRes } = await client.auth.getUser();
  const user = userRes.user ?? null;

  if (!user) {
    const qs = new URLSearchParams();
    qs.set("returnTo", returnTo);
    redirect(`/login?${qs.toString()}`);
  }

  const sharedDevice = await resolveSharedDeviceAccess(client, user.id, appId);

  if (sharedDevice) {
    if (!sharedDevice.appAllowed) {
      const qs = new URLSearchParams();
      qs.set("returnTo", returnTo);
      qs.set("reason", "shared_device_app_not_allowed");
      qs.set("permission", `${appId}.access`);
      redirect(`/no-access?${qs.toString()}`);
    }

    const permissionCodes = Array.isArray(permissionCode)
      ? permissionCode.filter(Boolean)
      : permissionCode
        ? [permissionCode]
        : [];

    if (permissionCodes.length) {
      const normalizedCodes = permissionCodes.map((code) =>
        normalizePermissionCode(appId, code)
      );

      const checks = await Promise.all(
        normalizedCodes.map((code) =>
          isSharedDevicePermissionAllowed({
            client,
            sharedDevice,
            appId,
            code,
          })
        )
      );

      const deniedIndex = checks.findIndex((allowed) => !allowed);
      if (deniedIndex !== -1) {
        const qs = new URLSearchParams();
        qs.set("returnTo", returnTo);
        qs.set("reason", "shared_device_no_permission");
        qs.set("permission", String(normalizedCodes[deniedIndex] ?? ""));
        redirect(`/no-access?${qs.toString()}`);
      }
    }

    return { supabase: client, user, sharedDevice };
  }

  const { data: canAccess, error: accessErr } = await client.rpc("has_permission", {
    p_permission_code: `${appId}.access`,
  });

  if (accessErr || !canAccess) {
    const qs = new URLSearchParams();
    qs.set("returnTo", returnTo);
    if (accessErr) qs.set("reason", "no_access");
    redirect(`/no-access?${qs.toString()}`);
  }

  const permissionCodes = Array.isArray(permissionCode)
    ? permissionCode.filter(Boolean)
    : permissionCode
      ? [permissionCode]
      : [];

  if (permissionCodes.length) {
    const normalizedCodes = permissionCodes.map((code) =>
      normalizePermissionCode(appId, code)
    );

    const directChecks = await Promise.all(
      normalizedCodes.map((code) =>
        client.rpc("has_permission", { p_permission_code: code })
      )
    );
    const allDirectAllowed = directChecks.every((res) => !res.error && Boolean(res.data));
    if (allDirectAllowed) {
      return { supabase: client, user };
    }

    const overrideRole = await getRoleOverrideFromCookies();
    let canOverride = false;
    let actualRole = "";
    let defaultSiteId: string | null = null;

    if (overrideRole) {
      const { data: employee } = await client
        .from("employees")
        .select("role,site_id")
        .eq("id", user.id)
        .maybeSingle();
      actualRole = String(employee?.role ?? "");
      defaultSiteId = employee?.site_id ?? null;
      canOverride = canUseRoleOverride(actualRole, overrideRole);
    }

    if (canOverride) {
      const checks = await Promise.all(
        normalizedCodes.map((code) =>
          isPermissionAllowedForRole(client, overrideRole!, appId, code, {
            siteId: defaultSiteId,
          })
        )
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
          client.rpc("has_permission", { p_permission_code: code })
        )
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

  return { supabase: client, user };
}
