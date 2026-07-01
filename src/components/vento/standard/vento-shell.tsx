import { cookies } from "next/headers";

import { checkOperationalPermission } from "@/lib/auth/operational-context";
import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";
import { createClient } from "@/lib/supabase/server";
import { VentoChrome } from "./vento-chrome";

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
  operational_visibility?: string | null;
};

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type EmployeeSettingsRow = {
  selected_site_id: string | null;
};

type AttendanceLogRow = {
  action: string | null;
  site_id: string | null;
  shift_id: string | null;
  device_info: Record<string, unknown> | null;
};

type ShiftContextRow = {
  id: string;
  site_id: string | null;
  operational_role: string | null;
};

type ActiveWorkContext = {
  siteId: string;
  areaId: string;
  shiftId: string;
  operationalRole: string;
};

type AppStatus = "active" | "soon";
type AppAccess = "enabled" | "disabled" | "soon";

type AppSwitcherItem = {
  id: string;
  name: string;
  description: string;
  href: string;
  logoSrc: string;
  brandColor: string;
  status: AppStatus;
  access: AppAccess;
  group: "Workspace" | "Operacion" | "Proximamente";
};

type IconName =
  | "dashboard"
  | "accounting"
  | "users"
  | "calendar"
  | "store"
  | "sparkles"
  | "package"
  | "menu"
  | "fileText"
  | "briefcase"
  | "phone"
  | "book"
  | "flask"
  | "truck"
  | "warehouse"
  | "clipboard"
  | "boxes"
  | "shoppingCart"
  | "map"
  | "settings"
  | "alertTriangle"
  | "scan"
  | "printer"
  | "arrows"
  | "sliders"
  | "layers";

type NavigationRow = {
  group_label: string | null;
  group_order: number | null;
  label: string | null;
  description: string | null;
  href: string | null;
  icon: string | null;
  required_permission_code: string | null;
  sort_order: number | null;
};

type NavItem = {
  href: string;
  label: string;
  description?: string;
  icon?: IconName;
  permissionCode: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const APP_ENTITY =
  (process.env.NEXT_PUBLIC_VENTO_ENTITY?.toLowerCase() as
    | "default"
    | "nexo"
    | "fogo"
    | "pulso"
    | "viso"
    | "origo"
    | "numera"
    | "anima"
    | "aura") ?? "nexo";

const APP_CODE = APP_ENTITY === "default" ? "nexo" : APP_ENTITY;
const SITE_OVERRIDE_COOKIE = "nexo_site_override_id";

const ICON_NAMES = new Set<IconName>([
  "dashboard",
  "accounting",
  "users",
  "calendar",
  "store",
  "sparkles",
  "package",
  "menu",
  "fileText",
  "briefcase",
  "phone",
  "book",
  "flask",
  "truck",
  "warehouse",
  "clipboard",
  "boxes",
  "shoppingCart",
  "map",
  "settings",
  "alertTriangle",
  "scan",
  "printer",
  "arrows",
  "sliders",
  "layers",
]);

const APP_SWITCHER_ITEMS: Omit<AppSwitcherItem, "access">[] = [
  {
    id: "hub",
    name: "Hub",
    description: "Launcher del ecosistema.",
    logoSrc: "/apps/hub.svg",
    brandColor: "#111827",
    href: "https://os.ventogroup.co",
    status: "active",
    group: "Workspace",
  },
  {
    id: "nexo",
    name: "NEXO",
    description: "Inventario y logística.",
    logoSrc: "/apps/nexo.svg",
    brandColor: "#F59E0B",
    href: "https://nexo.ventogroup.co",
    status: "active",
    group: "Operacion",
  },
  {
    id: "origo",
    name: "ORIGO",
    description: "Compras y proveedores.",
    logoSrc: "/apps/origo.svg",
    brandColor: "#0EA5E9",
    href: "https://origo.ventogroup.co",
    status: "active",
    group: "Operacion",
  },
  {
    id: "pulso",
    name: "PULSO",
    description: "POS y ventas.",
    logoSrc: "/apps/pulso.svg",
    brandColor: "#EF4444",
    href: "https://pulso.ventogroup.co",
    status: "active",
    group: "Operacion",
  },
  {
    id: "numera",
    name: "NUMERA",
    description: "Economia y rentabilidad.",
    logoSrc: "/apps/numera.svg",
    brandColor: "#2563EB",
    href: "https://numera.ventogroup.co",
    status: "active",
    group: "Operacion",
  },
  {
    id: "viso",
    name: "VISO",
    description: "Gerencia y auditoria.",
    logoSrc: "/apps/viso.svg",
    brandColor: "#A855F7",
    href: "https://viso.ventogroup.co",
    status: "active",
    group: "Operacion",
  },
  {
    id: "fogo",
    name: "FOGO",
    description: "Recetas y producción.",
    logoSrc: "/apps/fogo.svg",
    brandColor: "#FB7185",
    href: "https://fogo.ventogroup.co",
    status: "active",
    group: "Operacion",
  },
  {
    id: "aura",
    name: "AURA",
    description: "Marketing y contenido.",
    logoSrc: "/apps/aura.svg",
    brandColor: "#A855F7",
    href: "https://aura.ventogroup.co",
    status: "soon",
    group: "Proximamente",
  },
];

function asId(value: unknown) {
  return String(value ?? "").trim();
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(asId).filter(Boolean)));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readOperationalContextFromDeviceInfo(
  deviceInfo: Record<string, unknown> | null | undefined
): Partial<ActiveWorkContext> | null {
  const root = asRecord(deviceInfo);
  const context = asRecord(root?.operationalContext);
  if (!context) return null;

  const siteId = asId(context.siteId);
  const areaId = asId(context.areaId);
  const shiftId = asId(context.shiftId);
  const operationalRole = asId(context.operationalRole);

  if (!siteId && !areaId && !shiftId && !operationalRole) return null;

  return {
    siteId,
    areaId,
    shiftId,
    operationalRole,
  };
}

function isOperationalSite(site: SiteRow): boolean {
  return String(site.operational_visibility ?? "operational") === "operational";
}

function normalizeIconName(value: string | null | undefined): IconName | undefined {
  const icon = String(value ?? "").trim();
  return ICON_NAMES.has(icon as IconName) ? (icon as IconName) : undefined;
}

function splitPermissionCode(permissionCode: string, fallbackAppId: string) {
  const normalized = permissionCode.trim();

  if (!normalized) {
    return {
      appId: fallbackAppId,
      code: "",
    };
  }

  const firstDotIndex = normalized.indexOf(".");

  if (firstDotIndex === -1) {
    return {
      appId: fallbackAppId,
      code: normalized,
    };
  }

  return {
    appId: normalized.slice(0, firstDotIndex),
    code: normalized.slice(firstDotIndex + 1),
  };
}

function shouldUseOperationalPermission(permissionCode: string) {
  return new Set([
    "nexo.inventory.remissions.request",
    "nexo.inventory.remissions.prepare",
    "nexo.inventory.remissions.receive",
    "nexo.inventory.remissions.transit",
  ]).has(permissionCode.trim());
}

function buildNavGroups(rows: NavigationRow[]): NavGroup[] {
  const groups = new Map<string, NavItem[]>();

  for (const row of rows) {
    const groupLabel = String(row.group_label ?? "").trim();
    const href = String(row.href ?? "").trim();
    const label = String(row.label ?? "").trim();
    const permissionCode = String(row.required_permission_code ?? "").trim();

    if (!groupLabel || !href || !label || !permissionCode) continue;

    const current = groups.get(groupLabel) ?? [];

    current.push({
      href,
      label,
      description: row.description ?? undefined,
      icon: normalizeIconName(row.icon),
      permissionCode,
    });

    groups.set(groupLabel, current);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({
    label,
    items,
  }));
}

async function resolveActiveWorkContext({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<ActiveWorkContext | null> {
  const { data: lastAttendanceLog } = await supabase
    .from("attendance_logs")
    .select("action,site_id,shift_id,device_info")
    .eq("employee_id", userId)
    .in("action", ["check_in", "check_out"])
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const log = lastAttendanceLog as AttendanceLogRow | null;

  if (!log || log.action !== "check_in") return null;

  const deviceContext = readOperationalContextFromDeviceInfo(log.device_info);
  const shiftId = asId(deviceContext?.shiftId || log.shift_id);
  let siteId = asId(deviceContext?.siteId || log.site_id);
  let operationalRole = asId(deviceContext?.operationalRole);

  if (shiftId && (!siteId || !operationalRole)) {
    const { data: shiftRow } = await supabase
      .from("employee_shifts")
      .select("id,site_id,operational_role")
      .eq("id", shiftId)
      .eq("employee_id", userId)
      .maybeSingle();

    const shift = shiftRow as ShiftContextRow | null;

    siteId = siteId || asId(shift?.site_id);
    operationalRole = operationalRole || asId(shift?.operational_role);
  }

  if (!siteId && !operationalRole && !shiftId) return null;

  return {
    siteId,
    areaId: asId(deviceContext?.areaId),
    shiftId,
    operationalRole,
  };
}

async function resolveAllowedApps({
  supabase,
  activeSiteId,
  activeAreaId,
  actualRole,
}: {
  supabase: SupabaseClient;
  activeSiteId: string;
  activeAreaId: string;
  actualRole: string;
}): Promise<AppSwitcherItem[]> {
  const resolved = await Promise.all(
    APP_SWITCHER_ITEMS.map(async (app): Promise<AppSwitcherItem> => {
      if (app.id === "hub") {
        return {
          ...app,
          access: "enabled",
        };
      }

      if (app.status === "soon") {
        return {
          ...app,
          access: "soon",
        };
      }

      const allowed = await checkPermissionWithRoleOverride({
        supabase,
        appId: app.id,
        code: "access",
        context: {
          siteId: activeSiteId || null,
          areaId: activeAreaId || null,
        },
        actualRole,
      });

      return {
        ...app,
        access: allowed ? "enabled" : "disabled",
      };
    })
  );

  return resolved;
}

async function resolveNavigationItems({
  supabase,
  appCode,
  activeSiteId,
  activeAreaId,
  actualRole,
}: {
  supabase: SupabaseClient;
  appCode: string;
  activeSiteId: string;
  activeAreaId: string;
  actualRole: string;
}): Promise<NavGroup[]> {
  const { data, error } = await supabase
    .from("app_navigation_items")
    .select(
      "group_label,group_order,label,description,href,icon,required_permission_code,sort_order"
    )
    .eq("app_code", appCode)
    .eq("is_active", true)
    .order("group_order", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error || !data) return [];

  const rows = data as NavigationRow[];

  const permissionResults = await Promise.all(
    rows.map(async (row) => {
      const permissionCode = String(row.required_permission_code ?? "").trim();

      if (!permissionCode) return false;

      const { appId, code } = splitPermissionCode(permissionCode, appCode);

      if (!code) return false;

      if (shouldUseOperationalPermission(permissionCode)) {
        return checkOperationalPermission({
          supabase,
          permissionCode,
          siteId: activeSiteId || null,
          areaId: activeAreaId || null,
          appCode: appId,
        });
      }

      return checkPermissionWithRoleOverride({
        supabase,
        appId,
        code,
        context: {
          siteId: activeSiteId || null,
          areaId: activeAreaId || null,
        },
        actualRole,
      });
    })
  );

  const allowedRows = rows.filter((_, index) => permissionResults[index]);

  return buildNavGroups(allowedRows);
}

export async function VentoShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;

  let displayName = "Usuario";
  let role: string | null = null;
  let sites: SiteRow[] = [];
  let activeSiteId = "";
  let activeAreaId = "";
  let effectiveRole: string | null = null;
  let activeWorkContextLabel: string | null = null;
  let activeWorkContextDescription: string | null = null;
  let appSwitcherItems: AppSwitcherItem[] = [];
  let navGroups: NavGroup[] = [];

  if (user) {
    const { data: employeeRow } = await supabase
      .from("employees")
      .select("role,full_name,alias,site_id")
      .eq("id", user.id)
      .single();

    role = employeeRow?.role ?? null;
    displayName =
      employeeRow?.alias ?? employeeRow?.full_name ?? user.email ?? "Usuario";

    const [
      { data: employeeSites },
      { data: employeeSettings },
      activeWorkContext,
    ] = await Promise.all([
      supabase
        .from("employee_sites")
        .select("site_id,is_primary")
        .eq("employee_id", user.id)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .limit(50),
      supabase
        .from("employee_settings")
        .select("selected_site_id")
        .eq("employee_id", user.id)
        .maybeSingle(),
      resolveActiveWorkContext({ supabase, userId: user.id }),
    ]);

    const employeeSiteRows = (employeeSites ?? []) as EmployeeSiteRow[];
    const settingsRow = employeeSettings as EmployeeSettingsRow | null;

    const assignedSiteIds = uniqueIds([
      activeWorkContext?.siteId ?? null,
      ...employeeSiteRows.map((row) => row.site_id),
      employeeRow?.site_id ?? null,
    ]);

    const cookieStore = await cookies();
    const siteOverrideId = asId(cookieStore.get(SITE_OVERRIDE_COOKIE)?.value);

    const preferredSiteId = asId(
      activeWorkContext?.siteId ||
        siteOverrideId ||
        settingsRow?.selected_site_id ||
        employeeSiteRows[0]?.site_id ||
        employeeRow?.site_id ||
        ""
    );

    activeSiteId =
      preferredSiteId && assignedSiteIds.includes(preferredSiteId)
        ? preferredSiteId
        : assignedSiteIds[0] ?? "";

    activeAreaId = asId(activeWorkContext?.areaId);
    effectiveRole = asId(activeWorkContext?.operationalRole) || role;

    if (activeWorkContext) {
      activeWorkContextLabel = "Turno activo";
      activeWorkContextDescription = "Contexto operativo aplicado desde ANIMA";
    }

    if (assignedSiteIds.length) {
      const { data: siteRows } = await supabase
        .from("sites")
        .select("id,name,site_type,operational_visibility")
        .in("id", assignedSiteIds)
        .order("name", { ascending: true });

      sites = ((siteRows ?? []) as SiteRow[]).filter(isOperationalSite);

      if (activeSiteId && !sites.some((site) => site.id === activeSiteId)) {
        activeSiteId = sites[0]?.id ?? "";
      }
    }

    if (activeAreaId) {
      const { data: activeArea } = await supabase
        .from("areas")
        .select("site_id")
        .eq("id", activeAreaId)
        .maybeSingle();

      if (String(activeArea?.site_id ?? "") !== activeSiteId) {
        activeAreaId = "";
      }
    }

    if (effectiveRole) {
      const [resolvedApps, resolvedNavGroups] = await Promise.all([
        resolveAllowedApps({
          supabase,
          activeSiteId,
          activeAreaId,
          actualRole: effectiveRole,
        }),
        resolveNavigationItems({
          supabase,
          appCode: APP_CODE,
          activeSiteId,
          activeAreaId,
          actualRole: effectiveRole,
        }),
      ]);

      appSwitcherItems = resolvedApps;
      navGroups = resolvedNavGroups;
    }
  }

  return (
    <VentoChrome
      displayName={displayName}
      role={role ?? undefined}
      email={user?.email ?? null}
      sites={sites}
      activeSiteId={activeSiteId}
      activeWorkContextLabel={activeWorkContextLabel}
      activeWorkContextDescription={activeWorkContextDescription}
      appSwitcherItems={appSwitcherItems}
      navGroups={navGroups}
    >
      {children}
    </VentoChrome>
  );
}


