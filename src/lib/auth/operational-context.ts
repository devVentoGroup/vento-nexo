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
  on_shift_now: boolean | null;
  active_checkin_id: string | null;
  active_checkin_site_id: string | null;
  checked_in_now: boolean | null;
  policy_requires_shift: boolean | null;
  policy_requires_checkin: boolean | null;
  policy_requires_site_match: boolean | null;
  bypass_applied: boolean | null;
  can_operate: boolean | null;
  blocked_reasons: string[] | null;
};

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
  return first as OperationalContextRow;
}

function hasReason(row: OperationalContextRow | null, reason: string): boolean {
  if (!row?.blocked_reasons || !Array.isArray(row.blocked_reasons)) return false;
  return row.blocked_reasons.includes(reason);
}

export function buildOperationalBlockMessage(
  row: OperationalContextRow | null,
  fallback = "No puedes operar en este momento."
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
