import {
  canUseRoleOverride,
  checkPermissionWithRoleOverride,
  getRoleOverrideFromCookies,
  isPermissionAllowedForRole,
} from "@/lib/auth/role-override";
import { getOperationalContext } from "@/lib/auth/operational-context";
import type { createClient } from "@/lib/supabase/server";

const APP_ID = "nexo";
const REMISSIONS_ALL_AREAS_PERMISSION = "inventory.remissions.all_sites";
const GLOBAL_AREA_KIND = "general";
const BLOCKED_AREA_KIND = "__blocked__";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type OperationalRemissionAreaScope = {
  filterAreaKind: string;
  defaultAreaKind: string;
  enabledAreaKinds: string[];
  activeAreaKind: string;
  canSeeAllAreas: boolean;
  isGlobal: boolean;
  blockedReason: string;
};

export function normalizeOperationalAreaKind(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function uniqueKinds(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map(normalizeOperationalAreaKind).filter(Boolean))
  );
}

export function formatOperationalRemissionAreaLabel(value: unknown): string {
  const normalized = normalizeOperationalAreaKind(value);
  if (!normalized) return "Sin área";
  if (normalized === GLOBAL_AREA_KIND) return "General";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

export function resolveRemissionAreaKindFromKinds(
  kinds: Array<string | null | undefined>
): string {
  const unique = uniqueKinds(kinds);
  if (unique.length === 1) return unique[0] ?? "";
  if (unique.length > 1) return GLOBAL_AREA_KIND;
  return "";
}

export function operationalRemissionAreaScopeAllowsKind(
  scope: OperationalRemissionAreaScope | null | undefined,
  kind: unknown
): boolean {
  if (!scope) return true;
  if (scope.blockedReason || scope.filterAreaKind === BLOCKED_AREA_KIND) return false;
  if (!scope.filterAreaKind || scope.canSeeAllAreas || scope.isGlobal) return true;
  return normalizeOperationalAreaKind(kind) === scope.filterAreaKind;
}

export function operationalRemissionAreaScopeAllowsKinds(
  scope: OperationalRemissionAreaScope | null | undefined,
  kinds: Array<string | null | undefined>
): boolean {
  if (!scope) return true;
  if (scope.blockedReason || scope.filterAreaKind === BLOCKED_AREA_KIND) return false;
  if (!scope.filterAreaKind || scope.canSeeAllAreas || scope.isGlobal) return true;

  const unique = uniqueKinds(kinds);
  if (unique.length === 0) return false;
  return unique.includes(scope.filterAreaKind);
}

export async function loadEnabledRemissionAreaKindsForSite(
  supabase: SupabaseClient,
  siteId: string
): Promise<string[]> {
  const safeSiteId = String(siteId ?? "").trim();
  if (!safeSiteId) return [];

  const { data: ruleRows, error: rulesError } = await supabase
    .from("site_area_purpose_rules")
    .select("area_kind,is_enabled")
    .eq("site_id", safeSiteId)
    .eq("purpose", "remission");

  if (!rulesError && Array.isArray(ruleRows) && ruleRows.length > 0) {
    return uniqueKinds(
      (ruleRows as Array<{ area_kind: string | null; is_enabled: boolean | null }>)
        .filter((row) => Boolean(row.is_enabled))
        .map((row) => row.area_kind)
    );
  }

  const [areasResult, areaKindsResult] = await Promise.all([
    supabase.from("areas").select("kind,is_active").eq("site_id", safeSiteId),
    supabase.from("area_kinds").select("code,use_for_remission"),
  ]);

  const enabledPurposeKinds = new Set(
    ((areaKindsResult.data ?? []) as Array<{ code: string | null; use_for_remission: boolean | null }>)
      .filter((row) => Boolean(row.use_for_remission))
      .map((row) => normalizeOperationalAreaKind(row.code))
      .filter(Boolean)
  );

  return uniqueKinds(
    ((areasResult.data ?? []) as Array<{ kind: string | null; is_active: boolean | null }>)
      .filter((row) => row.is_active !== false)
      .map((row) => row.kind)
      .filter((kind) => {
        const normalized = normalizeOperationalAreaKind(kind);
        return normalized && (enabledPurposeKinds.size === 0 || enabledPurposeKinds.has(normalized));
      })
  );
}

export async function resolveOperationalRemissionAreaScope(params: {
  supabase: SupabaseClient;
  userId: string;
  siteId: string;
  canSeeAllAreas?: boolean;
}): Promise<OperationalRemissionAreaScope> {
  const { supabase, userId, siteId, canSeeAllAreas = false } = params;
  const safeSiteId = String(siteId ?? "").trim();
  const enabledAreaKinds = await loadEnabledRemissionAreaKindsForSite(supabase, safeSiteId);

  if (!safeSiteId) {
    return {
      filterAreaKind: BLOCKED_AREA_KIND,
      defaultAreaKind: "",
      enabledAreaKinds,
      activeAreaKind: "",
      canSeeAllAreas,
      isGlobal: false,
      blockedReason: "No hay sede activa para resolver el área operativa de remisiones.",
    };
  }

  if (canSeeAllAreas) {
    return {
      filterAreaKind: "",
      defaultAreaKind: "",
      enabledAreaKinds,
      activeAreaKind: "",
      canSeeAllAreas: true,
      isGlobal: false,
      blockedReason: "",
    };
  }

  const opContext = await getOperationalContext({
    supabase,
    employeeId: userId,
    siteId: safeSiteId,
    appCode: APP_ID,
  });
  const activeAreaKind = normalizeOperationalAreaKind(opContext?.active_area_kind);

  if (!opContext?.can_operate) {
    return {
      filterAreaKind: BLOCKED_AREA_KIND,
      defaultAreaKind: "",
      enabledAreaKinds,
      activeAreaKind,
      canSeeAllAreas: false,
      isGlobal: false,
      blockedReason: "No hay contexto operativo activo para esta sede.",
    };
  }

  if (enabledAreaKinds.length === 0) {
    if (activeAreaKind) {
      return {
        filterAreaKind: activeAreaKind,
        defaultAreaKind: activeAreaKind,
        enabledAreaKinds,
        activeAreaKind,
        canSeeAllAreas: false,
        isGlobal: false,
        blockedReason: "",
      };
    }

    return {
      filterAreaKind: BLOCKED_AREA_KIND,
      defaultAreaKind: "",
      enabledAreaKinds,
      activeAreaKind,
      canSeeAllAreas: false,
      isGlobal: false,
      blockedReason: "La sede no tiene áreas habilitadas para remisiones ni área activa de turno/check-in.",
    };
  }

  if (enabledAreaKinds.length === 1) {
    const onlyKind = enabledAreaKinds[0] ?? "";
    const isGlobal = onlyKind === GLOBAL_AREA_KIND;
    return {
      filterAreaKind: isGlobal ? "" : onlyKind,
      defaultAreaKind: onlyKind,
      enabledAreaKinds,
      activeAreaKind,
      canSeeAllAreas: false,
      isGlobal,
      blockedReason: "",
    };
  }

  if (activeAreaKind && enabledAreaKinds.includes(activeAreaKind)) {
    return {
      filterAreaKind: activeAreaKind,
      defaultAreaKind: activeAreaKind,
      enabledAreaKinds,
      activeAreaKind,
      canSeeAllAreas: false,
      isGlobal: false,
      blockedReason: "",
    };
  }

  return {
    filterAreaKind: BLOCKED_AREA_KIND,
    defaultAreaKind: "",
    enabledAreaKinds,
    activeAreaKind,
    canSeeAllAreas: false,
    isGlobal: false,
    blockedReason: activeAreaKind
      ? `El área activa (${formatOperationalRemissionAreaLabel(activeAreaKind)}) no está habilitada para remisiones en esta sede.`
      : "Tu turno/check-in no tiene área activa para filtrar remisiones de esta sede.",
  };
}


export async function resolveSharedDeviceOperationalRemissionAreaScope(params: {
  supabase: SupabaseClient;
  siteId: string;
  areaId?: string | null;
  canSeeAllAreas?: boolean;
}): Promise<OperationalRemissionAreaScope> {
  const { supabase, siteId, areaId = null, canSeeAllAreas = false } = params;
  const safeSiteId = String(siteId ?? "").trim();
  const safeAreaId = String(areaId ?? "").trim();
  const enabledAreaKinds = await loadEnabledRemissionAreaKindsForSite(supabase, safeSiteId);

  if (!safeSiteId) {
    return {
      filterAreaKind: BLOCKED_AREA_KIND,
      defaultAreaKind: "",
      enabledAreaKinds,
      activeAreaKind: "",
      canSeeAllAreas,
      isGlobal: false,
      blockedReason: "No hay sede activa para resolver el area operativa de remisiones.",
    };
  }

  if (canSeeAllAreas) {
    return {
      filterAreaKind: "",
      defaultAreaKind: "",
      enabledAreaKinds,
      activeAreaKind: "",
      canSeeAllAreas: true,
      isGlobal: false,
      blockedReason: "",
    };
  }

  const { data: area } = safeAreaId
    ? await supabase
        .from("areas")
        .select("kind,site_id")
        .eq("id", safeAreaId)
        .maybeSingle()
    : { data: null };

  const activeAreaKind =
    String(area?.site_id ?? "") === safeSiteId
      ? normalizeOperationalAreaKind(area?.kind)
      : "";

  if (enabledAreaKinds.length === 0) {
    if (activeAreaKind) {
      return {
        filterAreaKind: activeAreaKind,
        defaultAreaKind: activeAreaKind,
        enabledAreaKinds,
        activeAreaKind,
        canSeeAllAreas: false,
        isGlobal: false,
        blockedReason: "",
      };
    }

    return {
      filterAreaKind: BLOCKED_AREA_KIND,
      defaultAreaKind: "",
      enabledAreaKinds,
      activeAreaKind,
      canSeeAllAreas: false,
      isGlobal: false,
      blockedReason: "El dispositivo compartido no tiene area operativa activa para filtrar remisiones.",
    };
  }

  if (enabledAreaKinds.length === 1) {
    const onlyKind = enabledAreaKinds[0] ?? "";
    const isGlobal = onlyKind === GLOBAL_AREA_KIND;
    return {
      filterAreaKind: isGlobal ? "" : onlyKind,
      defaultAreaKind: onlyKind,
      enabledAreaKinds,
      activeAreaKind,
      canSeeAllAreas: false,
      isGlobal,
      blockedReason: "",
    };
  }

  if (activeAreaKind && enabledAreaKinds.includes(activeAreaKind)) {
    return {
      filterAreaKind: activeAreaKind,
      defaultAreaKind: activeAreaKind,
      enabledAreaKinds,
      activeAreaKind,
      canSeeAllAreas: false,
      isGlobal: false,
      blockedReason: "",
    };
  }

  return {
    filterAreaKind: BLOCKED_AREA_KIND,
    defaultAreaKind: "",
    enabledAreaKinds,
    activeAreaKind,
    canSeeAllAreas: false,
    isGlobal: false,
    blockedReason: activeAreaKind
      ? `El area operativa del dispositivo (${formatOperationalRemissionAreaLabel(activeAreaKind)}) no esta habilitada para remisiones en esta sede.`
      : "El dispositivo compartido no tiene area operativa activa para filtrar remisiones.",
  };
}
export async function userCanSeeAllRemissionAreas(params: {
  supabase: SupabaseClient;
  userId: string;
  siteId?: string | null;
}): Promise<boolean> {
  const { supabase, userId, siteId = null } = params;
  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const actualRole = String(employee?.role ?? "");
  const overrideRole = await getRoleOverrideFromCookies();
  const useOverride = canUseRoleOverride(actualRole, overrideRole);
  const effectiveRole = useOverride ? String(overrideRole) : actualRole;
  const safeSiteId = String(siteId ?? "").trim();

  if (useOverride && overrideRole) {
    return isPermissionAllowedForRole(
      supabase,
      effectiveRole,
      APP_ID,
      REMISSIONS_ALL_AREAS_PERMISSION,
      safeSiteId ? { siteId: safeSiteId } : undefined
    );
  }

  return checkPermissionWithRoleOverride({
    supabase,
    appId: APP_ID,
    code: REMISSIONS_ALL_AREAS_PERMISSION,
    context: safeSiteId ? { siteId: safeSiteId } : undefined,
    actualRole,
  });
}

export async function resolveUserOperationalRemissionAreaScope(params: {
  supabase: SupabaseClient;
  userId: string;
  siteId: string;
}): Promise<OperationalRemissionAreaScope> {
  const { supabase, userId, siteId } = params;
  const canSeeAllAreas = await userCanSeeAllRemissionAreas({ supabase, userId, siteId });
  return resolveOperationalRemissionAreaScope({
    supabase,
    userId,
    siteId,
    canSeeAllAreas,
  });
}
