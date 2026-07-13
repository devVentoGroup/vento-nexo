import {
  canUseRoleOverride,
  getRoleOverrideFromCookies,
} from "@/lib/auth/role-override";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type OperationalContextRow = {
  employee_id: string | null;
  app_code: string | null;
  active_site_id: string | null;
  selected_site_id: string | null;
  employee_default_site_id: string | null;
  active_shift_id: string | null;
  active_shift_site_id: string | null;
  active_shift_area_id: string | null;
  active_operational_role: string | null;
  on_shift_now: boolean | null;
  active_checkin_id: string | null;
  active_checkin_site_id: string | null;
  active_checkin_area_id: string | null;
  active_area_id: string | null;
  active_area_kind: string | null;
  checked_in_now: boolean | null;
  policy_requires_shift: boolean | null;
  policy_requires_checkin: boolean | null;
  policy_requires_site_match: boolean | null;
  bypass_applied: boolean | null;
  can_operate: boolean | null;
  blocked_reasons: string[] | null;
};

function normalizeRole(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getSimulatedAreaKind(role: unknown): string {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "cocinero") return "cocina";
  if (normalizedRole === "barista") return "bar";
  if (normalizedRole === "cajero") return "mostrador";
  return "";
}

async function applyNexoRoleOverrideArea(params: {
  supabase: SupabaseClient;
  employeeId: string;
  siteId: string | null;
  appCode: string;
  context: OperationalContextRow;
}): Promise<OperationalContextRow> {
  const { supabase, employeeId, siteId, appCode, context } = params;
  if (normalizeRole(appCode) !== "nexo") return context;

  const overrideRole = await getRoleOverrideFromCookies();
  if (!overrideRole) return context;

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", employeeId)
    .maybeSingle();

  const actualRole = String(employee?.role ?? "");
  if (!canUseRoleOverride(actualRole, overrideRole)) return context;

  const simulatedAreaKind = getSimulatedAreaKind(overrideRole);
  if (!simulatedAreaKind) return context;

  const resolvedSiteId = String(
    siteId ?? context.active_site_id ?? context.selected_site_id ?? "",
  ).trim();
  if (!resolvedSiteId) return context;

  const { data: area } = await supabase
    .from("areas")
    .select("id,kind")
    .eq("site_id", resolvedSiteId)
    .eq("kind", simulatedAreaKind)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!area?.id) return context;

  return {
    ...context,
    active_area_id: String(area.id),
    active_area_kind: String(area.kind ?? simulatedAreaKind),
    active_operational_role: String(overrideRole),
  };
}

export async function getOperationalContext(params: {
  supabase: SupabaseClient;
  employeeId: string;
  siteId?: string | null;
  appCode?: string;
}): Promise<OperationalContextRow | null> {
  const { supabase, employeeId, siteId = null, appCode = "nexo" } = params;
  const { data, error } = await supabase.rpc("get_operational_context", {
    p_employee_id: employeeId,
    p_site_id: siteId,
    p_app_code: appCode,
  });
  if (error || !data) return null;
  const first = Array.isArray(data) ? data[0] : data;
  if (!first) return null;

  return applyNexoRoleOverrideArea({
    supabase,
    employeeId,
    siteId,
    appCode,
    context: first as OperationalContextRow,
  });
}

export async function checkOperationalPermission(params: {
  supabase: SupabaseClient;
  permissionCode: string;
  siteId?: string | null;
  areaId?: string | null;
  appCode?: string | null;
}): Promise<boolean> {
  const {
    supabase,
    permissionCode,
    siteId = null,
    areaId = null,
    appCode = null,
  } = params;

  const { data, error } = await supabase.rpc("has_operational_permission", {
    p_permission_code: permissionCode,
    p_site_id: siteId,
    p_area_id: areaId,
    p_app_code: appCode,
  });

  if (error) return false;
  return Boolean(data);
}

export async function requireOperationalPermission(params: {
  supabase: SupabaseClient;
  employeeId: string;
  permissionCode: string;
  siteId?: string | null;
  areaId?: string | null;
  appCode?: string | null;
  fallback?: string;
}): Promise<{
  allowed: boolean;
  context: OperationalContextRow | null;
  message: string;
}> {
  const {
    supabase,
    employeeId,
    permissionCode,
    siteId = null,
    areaId = null,
    appCode = null,
    fallback = "Tu turno activo no tiene permiso para esta acción.",
  } = params;

  const context = await getOperationalContext({
    supabase,
    employeeId,
    siteId,
    appCode: appCode ?? permissionCode.split(".")[0] ?? "nexo",
  });

  if (!context?.can_operate) {
    return {
      allowed: false,
      context,
      message: buildOperationalBlockMessage(context, fallback),
    };
  }

  const allowed = await checkOperationalPermission({
    supabase,
    permissionCode,
    siteId,
    areaId: areaId ?? context.active_area_id,
    appCode,
  });

  return {
    allowed,
    context,
    message: allowed ? "" : fallback,
  };
}

function hasReason(row: OperationalContextRow | null, reason: string): boolean {
  if (!row?.blocked_reasons || !Array.isArray(row.blocked_reasons)) return false;
  return row.blocked_reasons.includes(reason);
}

export function buildOperationalBlockMessage(
  row: OperationalContextRow | null,
  fallback = "No puedes operar en este momento.",
): string {
  if (!row) {
    return "No se pudo validar tu contexto operativo. Intenta de nuevo en unos segundos.";
  }
  if (Boolean(row.can_operate)) return "";
  if (hasReason(row, "out_of_shift")) {
    return "No puedes operar porque estás fuera de turno.";
  }
  if (hasReason(row, "checkin_required")) {
    return "No puedes operar porque no tienes check-in activo.";
  }
  if (hasReason(row, "shift_site_mismatch")) {
    return "No puedes operar porque tu turno activo es de otra sede.";
  }
  if (hasReason(row, "checkin_site_mismatch")) {
    return "No puedes operar porque tu check-in activo es de otra sede.";
  }
  if (hasReason(row, "unauthenticated")) {
    return "Tu sesión no está activa. Inicia sesión para continuar.";
  }
  return fallback;
}
