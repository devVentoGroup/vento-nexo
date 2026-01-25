import { cookies } from "next/headers";

import { checkPermission, normalizePermissionCode } from "@/lib/auth/permissions";
import {
  PRIVILEGED_ROLE_OVERRIDES,
  ROLE_OVERRIDE_COOKIE,
} from "@/lib/auth/role-override-config";

export function getRoleOverrideFromCookies(): string | null {
  const cookieStore = cookies();
  const raw = cookieStore.get(ROLE_OVERRIDE_COOKIE)?.value ?? "";
  const value = raw.trim();
  return value ? value : null;
}

export function canUseRoleOverride(
  actualRole: string,
  overrideRole: string | null
) {
  if (!overrideRole) return false;
  if (!actualRole) return false;
  return PRIVILEGED_ROLE_OVERRIDES.has(actualRole);
}

type RolePermissionRow = {
  permission?: { code?: string | null } | null;
};

async function loadRolePermissionCodes(supabase: any, role: string) {
  if (!role) return [];
  const { data: roleRow } = await supabase
    .from("roles")
    .select("id")
    .eq("code", role)
    .maybeSingle();
  const roleId = roleRow?.id ?? null;
  if (!roleId) return [];

  const { data: permissions, error } = await supabase
    .from("role_permissions")
    .select("permission:app_permissions(code)")
    .eq("role_id", roleId);

  if (error || !permissions) return [];

  return (permissions as RolePermissionRow[])
    .map((row) => row.permission?.code ?? "")
    .filter(Boolean);
}

export async function isPermissionAllowedForRole(
  supabase: any,
  role: string,
  appId: string,
  code: string
) {
  const normalized = normalizePermissionCode(appId, code);
  const permissions = await loadRolePermissionCodes(supabase, role);
  return permissions.includes(normalized);
}

export async function checkPermissionWithRoleOverride({
  supabase,
  appId,
  code,
  context,
  actualRole,
}: {
  supabase: any;
  appId: string;
  code: string;
  context?: { siteId?: string | null; areaId?: string | null };
  actualRole: string;
}) {
  const overrideRole = getRoleOverrideFromCookies();
  if (canUseRoleOverride(actualRole, overrideRole)) {
    return isPermissionAllowedForRole(supabase, overrideRole!, appId, code);
  }
  return checkPermission(supabase, appId, code, context);
}
