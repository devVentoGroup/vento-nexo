import type { createClient } from "@/lib/supabase/server";
import { normalizePermissionCode } from "@/lib/auth/permissions";
import { isPermissionAllowedForRole } from "@/lib/auth/role-override";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type OperationalSessionMode = "employee" | "shared_device";

export type OperationalSession = {
  mode: OperationalSessionMode;
  userId: string;
  displayName: string;
  role: string | null;
  navigationRole: string | null;
  siteId: string | null;
  areaId: string | null;
  isSharedDevice: boolean;
  sharedDeviceId: string | null;
  sharedDeviceCode: string | null;
  sharedDeviceLabel: string | null;
  allowedAppCodes: string[];
};

type SharedDeviceRow = {
  id: string;
  code: string | null;
  label: string | null;
  site_id: string | null;
  area_id: string | null;
  navigation_role: string | null;
};

type EmployeeRow = {
  id: string;
  full_name?: string | null;
  alias?: string | null;
  role: string | null;
  site_id: string | null;
};

function compactUnique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
}

async function resolveEmployeeSiteId({
  supabase,
  userId,
  preferredSiteId,
  fallbackSiteId,
}: {
  supabase: SupabaseClient;
  userId: string;
  preferredSiteId?: string | null;
  fallbackSiteId?: string | null;
}) {
  if (preferredSiteId) return preferredSiteId;

  const { data: employeeSite } = await supabase
    .from("employee_sites")
    .select("site_id")
    .eq("employee_id", userId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  return employeeSite?.site_id ? String(employeeSite.site_id) : fallbackSiteId ?? null;
}

export async function resolveOperationalSession({
  supabase,
  userId,
  appId,
  preferredSiteId = null,
  preferredAreaId = null,
}: {
  supabase: SupabaseClient;
  userId: string;
  appId: string;
  preferredSiteId?: string | null;
  preferredAreaId?: string | null;
}): Promise<OperationalSession> {
  void appId;

  const { data: device, error: deviceError } = await supabase
    .from("shared_operational_devices")
    .select("id,code,label,site_id,area_id,navigation_role")
    .eq("auth_user_id", userId)
    .eq("is_active", true)
    .eq("activation_status", "active")
    .maybeSingle();

  if (!deviceError && device) {
    const sharedDevice = device as SharedDeviceRow;
    const { data: appRows } = await supabase
      .from("shared_operational_device_apps")
      .select("app_code")
      .eq("device_id", sharedDevice.id)
      .eq("is_active", true);

    const allowedAppCodes = compactUnique(
      (appRows ?? []).map((row) => row.app_code as string | null),
    );
    const navigationRole = String(sharedDevice.navigation_role ?? "").trim() || null;

    return {
      mode: "shared_device",
      userId,
      displayName:
        String(sharedDevice.label ?? "").trim() ||
        String(sharedDevice.code ?? "").trim() ||
        "Dispositivo compartido",
      role: navigationRole,
      navigationRole,
      siteId: preferredSiteId ?? sharedDevice.site_id ?? null,
      areaId: preferredAreaId ?? sharedDevice.area_id ?? null,
      isSharedDevice: true,
      sharedDeviceId: sharedDevice.id,
      sharedDeviceCode: sharedDevice.code,
      sharedDeviceLabel: sharedDevice.label,
      allowedAppCodes,
    };
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id,full_name,alias,role,site_id")
    .eq("id", userId)
    .maybeSingle();

  const employeeRow = employee as EmployeeRow | null;
  const role = String(employeeRow?.role ?? "").trim() || null;
  const siteId = await resolveEmployeeSiteId({
    supabase,
    userId,
    preferredSiteId,
    fallbackSiteId: employeeRow?.site_id ?? null,
  });

  return {
    mode: "employee",
    userId,
    displayName:
      String(employeeRow?.alias ?? "").trim() ||
      String(employeeRow?.full_name ?? "").trim() ||
      "Usuario",
    role,
    navigationRole: role,
    siteId,
    areaId: preferredAreaId ?? null,
    isSharedDevice: false,
    sharedDeviceId: null,
    sharedDeviceCode: null,
    sharedDeviceLabel: null,
    allowedAppCodes: [],
  };
}

export function isOperationalSessionAppAllowed(session: OperationalSession, appId: string) {
  if (!session.isSharedDevice) return true;
  return session.allowedAppCodes.includes(appId);
}

export function isAppAccessPermission(appId: string, code: string) {
  return normalizePermissionCode(appId, code) === `${appId}.access`;
}

export async function checkOperationalSessionPermission({
  supabase,
  session,
  appId,
  code,
}: {
  supabase: SupabaseClient;
  session: OperationalSession;
  appId: string;
  code: string;
}) {
  const normalizedCode = normalizePermissionCode(appId, code);

  if (session.isSharedDevice) {
    if (!isOperationalSessionAppAllowed(session, appId)) return false;
    if (isAppAccessPermission(appId, normalizedCode)) return true;
    if (!session.navigationRole) return false;

    return isPermissionAllowedForRole(supabase, session.navigationRole, appId, normalizedCode, {
      siteId: session.siteId,
      areaId: session.areaId,
    });
  }

  const { data, error } = await supabase.rpc("has_permission", {
    p_permission_code: normalizedCode,
    p_site_id: session.siteId,
    p_area_id: session.areaId,
  });

  if (error) return false;
  return Boolean(data);
}




