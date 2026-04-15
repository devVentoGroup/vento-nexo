"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppSwitcher } from "./app-switcher";
import { ProfileMenu } from "./profile-menu";
import { VentoLogo } from "./vento-logo";
import { createClient } from "@/lib/supabase/client";

type SiteOption = {
  id: string;
  name: string | null;
  site_type?: string | null;
};

type NavItem = {
  href: string;
  label: string;
  description?: string;
  required?: string[];
  anyOf?: string[];
  icon?: IconName;
  allowedRoles?: string[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

type VentoChromeProps = {
  children: React.ReactNode;
  displayName: string;
  role?: string | null;
  email?: string | null;
  sites: SiteOption[];
  activeSiteId: string;
};

const APP_ENTITY =
  (process.env.NEXT_PUBLIC_VENTO_ENTITY?.toLowerCase() as
    | "default"
    | "nexo"
    | "fogo"
    | "pulso"
    | "viso"
    | "origo"
    | "anima"
    | "aura") ?? "nexo";
const APP_NAME = process.env.NEXT_PUBLIC_VENTO_APP_NAME ?? "NEXO";
const APP_TAGLINE_RAW = process.env.NEXT_PUBLIC_VENTO_APP_TAGLINE;
const APP_TAGLINE =
  APP_TAGLINE_RAW && !/[\u00C3\u00C2\u00E2\uFFFD]/.test(APP_TAGLINE_RAW)
    ? APP_TAGLINE_RAW
    : "Logistica e inventario operativo";

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Inicio",
    items: [
      {
        href: "/",
        label: "Panel",
        description: "Cockpit operativo",
        required: ["access"],
        icon: "dashboard",
      },
    ],
  },
  {
    label: "Operar",
    items: [
      {
        href: "/inventory/warehouse",
        label: "Warehouse QR",
        description: "Scanner para operarios en piso",
        required: ["access"],
        icon: "scan",
      },
      {
        href: "/inventory/entries",
        label: "Entradas",
        description: "Recepcion manual y contingencias",
        required: ["inventory.entries_emergency"],
        icon: "layers",
      },
      {
        href: "/inventory/remissions",
        label: "Abastecimiento interno",
        description: "Solicitudes, despacho y recepcion entre sedes",
        required: ["inventory.remissions"],
        icon: "package",
      },
      {
        href: "/inventory/count-initial",
        label: "Conteos",
        description: "Conteo inicial y saneamiento",
        required: ["inventory.counts"],
        icon: "clipboard",
      },
      {
        href: "/inventory/transfers",
        label: "Traslados",
        description: "Movimientos entre ubicaciones",
        required: ["inventory.transfers"],
        icon: "arrows",
      },
      {
        href: "/inventory/withdraw",
        label: "Retiros",
        description: "Consumos y salidas controladas",
        required: ["inventory.withdraw"],
        icon: "boxes",
      },
      {
        href: "/inventory/adjust",
        label: "Ajustes",
        description: "Correcciones controladas",
        required: ["inventory.adjustments"],
        icon: "sliders",
      },
    ],
  },
  {
    label: "Verificar",
    items: [
      {
        href: "/inventory/stock",
        label: "Stock",
        description: "Saldo y quiebres por sede",
        required: ["inventory.stock"],
        icon: "boxes",
      },
      {
        href: "/inventory/movements",
        label: "Movimientos",
        description: "Ledger y trazabilidad operativa",
        required: ["inventory.movements"],
        icon: "arrows",
      },
    ],
  },
  {
    label: "Configurar",
    items: [
      {
        href: "/inventory/settings/checklist",
        label: "Checklist",
        description: "Puesta a punto de Centro y satelites",
        required: ["access"],
        icon: "clipboard",
      },
      {
        href: "/inventory/catalog",
        label: "Productos",
        description: "Catalogo maestro y activacion por sede",
        required: ["inventory.stock"],
        allowedRoles: ["propietario", "gerente_general"],
        icon: "layers",
      },
      {
        href: "/inventory/locations",
        label: "Ubicaciones",
        description: "LOC, zonas y capacidad operativa",
        required: ["inventory.locations"],
        allowedRoles: ["propietario", "gerente_general"],
        icon: "map",
      },
      {
        href: "/inventory/settings/supply-routes",
        label: "Rutas",
        description: "Abastecimiento entre sedes",
        required: ["access"],
        icon: "arrows",
      },
      {
        href: "/inventory/settings/remissions",
        label: "Áreas remisión",
        description: "Áreas por propósito y reglas por sede",
        required: ["inventory.remissions"],
        allowedRoles: ["propietario", "gerente_general"],
        icon: "package",
      },
      {
        href: "/inventory/settings/sites",
        label: "Sedes",
        description: "Sedes operativas del sistema",
        required: ["access"],
        icon: "map",
      },
      {
        href: "/inventory/settings/units",
        label: "Unidades",
        description: "UOM y alias operativos",
        required: ["inventory.stock"],
        allowedRoles: ["propietario", "gerente_general"],
        icon: "sliders",
      },
      {
        href: "/inventory/settings/categories",
        label: "Categorias",
        description: "Taxonomia operativa",
        required: ["inventory.stock"],
        allowedRoles: ["propietario", "gerente_general"],
        icon: "layers",
      },
    ],
  },
  {
    label: "Utilidades",
    items: [
      {
        href: "/scanner",
        label: "Scanner",
        description: "Escaneo rapido de codigos",
        required: ["access"],
        icon: "scan",
      },
    ],
  },
];

type IconName =
  | "dashboard"
  | "package"
  | "scan"
  | "printer"
  | "boxes"
  | "arrows"
  | "clipboard"
  | "sliders"
  | "map"
  | "layers"
  | "sparkles";

function Icon({ name }: { name?: IconName }) {
  const common = "none";
  switch (name) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M4 4h7v7H4z" />
          <path d="M13 4h7v5h-7z" />
          <path d="M13 11h7v9h-7z" />
          <path d="M4 13h7v7H4z" />
        </svg>
      );
    case "package":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M21 8.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5" />
          <path d="M12 3 2 8l10 5 10-5-10-5z" />
          <path d="M12 13v8" />
        </svg>
      );
    case "scan":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <path d="M7 12h10" />
        </svg>
      );
    case "printer":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M7 8V4h10v4" />
          <path d="M6 17h12v3H6z" />
          <path d="M5 8h14a2 2 0 0 1 2 2v5H3v-5a2 2 0 0 1 2-2z" />
        </svg>
      );
    case "boxes":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M3 7h7v7H3z" />
          <path d="M14 7h7v7h-7z" />
          <path d="M7 14v7" />
          <path d="M17 14v7" />
        </svg>
      );
    case "arrows":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M7 7h11l-3-3" />
          <path d="M17 17H6l3 3" />
        </svg>
      );
    case "clipboard":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M9 3h6a2 2 0 0 1 2 2v2H7V5a2 2 0 0 1 2-2z" />
          <path d="M7 7h10v14H7z" />
          <path d="M10 11h4" />
          <path d="M10 15h4" />
        </svg>
      );
    case "sliders":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
          <circle cx="9" cy="6" r="2" />
          <circle cx="15" cy="12" r="2" />
          <circle cx="7" cy="18" r="2" />
        </svg>
      );
    case "map":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
          <path d="M9 3v15" />
          <path d="M15 6v15" />
        </svg>
      );
    case "layers":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M12 3 2 8l10 5 10-5-10-5z" />
          <path d="M2 12l10 5 10-5" />
          <path d="M2 16l10 5 10-5" />
        </svg>
      );
    case "sparkles":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6">
          <path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z" />
          <path d="M5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
          <path d="M18 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
        </svg>
      );
    default:
      return null;
  }
}

function SidebarLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`ui-sidebar-item ${active ? "active" : ""}`}
    >
      <span className="ui-sidebar-item-icon">
        <Icon name={item.icon} />
      </span>
      <span className="ui-sidebar-item-content">
        <span className="ui-sidebar-item-title">{item.label}</span>
        {item.description ? (
          <span className="ui-sidebar-item-desc">{item.description}</span>
        ) : null}
      </span>
    </Link>
  );
}

function isRefreshSessionError(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  return (
    normalized.includes("invalid refresh token") ||
    normalized.includes("refresh token") ||
    normalized.includes("already used") ||
    normalized.includes("authapierror") ||
    normalized.includes("status of 429")
  );
}

export function VentoChrome({
  children,
  displayName,
  role,
  email,
  sites,
  activeSiteId,
}: VentoChromeProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [permMap, setPermMap] = useState<Record<string, boolean>>({});
  const [permissionsReady, setPermissionsReady] = useState(false);
  const authRecoveryRef = useRef(false);

  const currentSiteId = searchParams.get("site_id") ?? activeSiteId ?? "";
  const currentSite = useMemo(
    () => sites.find((site) => site.id === currentSiteId),
    [sites, currentSiteId]
  );
  const currentSiteLabel = currentSite?.name ?? currentSiteId ?? "Sin sede";

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const permissionCodes = useMemo(
    () => [
      "access",
      "inventory.remissions",
      "inventory.remissions.request",
      "inventory.remissions.prepare",
      "inventory.remissions.receive",
      "inventory.entries_emergency",
      "inventory.transfers",
      "inventory.withdraw",
      "inventory.stock",
      "inventory.movements",
      "inventory.counts",
      "inventory.adjustments",
      "inventory.locations",
    ],
    []
  );

  useEffect(() => {
    let isActiveRequest = true;
    const supabase = createClient();
    const siteId = currentSiteId || activeSiteId || null;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPermissionsReady(false);

    Promise.all(
      permissionCodes.map((code) =>
        supabase.rpc("has_permission", {
          p_permission_code: `nexo.${code}`,
          p_site_id: siteId,
          p_area_id: null,
        })
      )
    )
      .then((results) => {
        if (!isActiveRequest) return;
        const nextMap: Record<string, boolean> = {};
        results.forEach((res, idx) => {
          nextMap[permissionCodes[idx]] = !res.error && Boolean(res.data);
        });
        setPermMap(nextMap);
        setPermissionsReady(true);
      })
      .catch((error) => {
        if (!isActiveRequest) return;
        if (!authRecoveryRef.current && isRefreshSessionError(error)) {
          authRecoveryRef.current = true;
          Promise.resolve()
            .then(async () => {
              try {
                await supabase.auth.signOut({ scope: "local" });
              } catch {
                // Ignore sign-out errors and force a clean login.
              }
            })
            .finally(() => {
              const shellLoginUrl =
                process.env.NEXT_PUBLIC_SHELL_LOGIN_URL ||
                "https://os.ventogroup.co/login";
              const returnTo = encodeURIComponent(window.location.href);
              window.location.assign(`${shellLoginUrl}?returnTo=${returnTo}`);
            });
          return;
        }
        setPermMap({});
        setPermissionsReady(true);
      });

    return () => {
      isActiveRequest = false;
    };
  }, [currentSiteId, activeSiteId, permissionCodes]);

  const can = (code?: string) => (code ? Boolean(permMap[code]) : false);
  const normalizedRole = String(role ?? "").toLowerCase();
  const isManagementRole = ["propietario", "gerente_general", "admin", "manager", "gerente"].includes(
    normalizedRole
  );
  const currentSiteType = String(currentSite?.site_type ?? "").toLowerCase();
  const isSatelliteFocusMode = currentSiteType === "satellite" && !isManagementRole;
  const isProductionFocusMode = currentSiteType === "production_center" && !isManagementRole;
  const focusAllowedHrefs = isSatelliteFocusMode
    ? new Set(["/", "/inventory/remissions", "/scanner"])
    : isProductionFocusMode
      ? new Set(["/", "/inventory/remissions", "/inventory/entries", "/scanner"])
      : null;

  const adaptNavItem = (item: NavItem): NavItem => {
    if (item.href === "/inventory/remissions" && isSatelliteFocusMode) {
      return {
        ...item,
        label: "Pedir y recibir",
        description: "Tu sede solo solicita y confirma.",
      };
    }
    if (item.href === "/inventory/remissions" && isProductionFocusMode) {
      return {
        ...item,
        label: "Preparar remisiones",
        description: "Centro prepara y despacha solicitudes.",
      };
    }
    if (item.href === "/inventory/entries" && isProductionFocusMode) {
      return {
        ...item,
        label: "Entradas de Centro",
        description: "Recibe y registra entradas de contingencia.",
      };
    }
    return item;
  };

  const isItemVisible = (item: NavItem) => {
    if (!permissionsReady) return false;
    if (item.allowedRoles?.length) {
      const currentRole = String(role ?? "").toLowerCase();
      if (!item.allowedRoles.some((r) => r.toLowerCase() === currentRole)) {
        return false;
      }
    }
    if (item.required?.length) return item.required.every((code) => can(code));
    if (item.anyOf?.length) return item.anyOf.some((code) => can(code));
    return true;
  };

  const visibleGroups = !permissionsReady
    ? []
    : NAV_GROUPS.map((group) => ({
        label: group.label,
        items: group.items
          .map((item) => adaptNavItem(item))
          .filter((item) => isItemVisible(item))
          .filter((item) => (focusAllowedHrefs ? focusAllowedHrefs.has(item.href) : true)),
      })).filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen bg-[var(--ui-bg)] text-[var(--ui-text)]">
      <div className="flex min-h-screen">
        <div
          className={`fixed inset-0 z-40 bg-black/30 transition xl:hidden ${
            menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />

        <aside
          className={`ui-sidebar fixed left-0 top-0 z-50 flex h-full w-72 flex-col gap-4 px-4 py-5 transition-transform xl:static xl:translate-x-0 xl:shadow-none ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <VentoLogo
              entity={APP_ENTITY}
              title="Vento OS"
              subtitle={`${APP_NAME} - Inventario`}
            />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="h-10 rounded-lg px-3 text-sm font-semibold text-[var(--ui-muted)] hover:bg-[var(--ui-surface-2)] xl:hidden"
            >
              Cerrar
            </button>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
              Sede activa
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{currentSiteLabel}</div>
            {isSatelliteFocusMode || isProductionFocusMode ? (
              <div className="mt-2 text-xs text-[var(--ui-muted)]">
                {isSatelliteFocusMode
                  ? "Modo satélite: pedir, recibir y seguir."
                  : "Modo Centro: preparar, despachar y seguir."}
              </div>
            ) : null}
          </div>

          <nav className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {!permissionsReady ? (
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs text-[var(--ui-muted)]">
                Cargando permisos...
              </div>
            ) : visibleGroups.length === 0 ? (
              <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2 text-xs text-[var(--ui-muted)]">
                No tienes permisos visibles en esta sede.
              </div>
            ) : (
              visibleGroups.map((group) => (
                <div key={group.label} className="space-y-2">
                  <div className="px-2 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <SidebarLink
                        key={item.href}
                        item={item}
                        active={isActive(item.href)}
                        onNavigate={() => setMenuOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="ui-header sticky top-0 z-30">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4 lg:px-6 xl:px-8">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] h-10 px-3 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] sm:h-11 sm:px-4 xl:hidden"
                  aria-label="Abrir menu lateral"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 7h16" />
                    <path d="M4 12h16" />
                    <path d="M4 17h16" />
                  </svg>
                  Menu
                </button>
                <div className="hidden min-w-0 sm:flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ui-surface-2)] ring-1 ring-inset ring-[var(--ui-border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={
                      "/logos/" + APP_ENTITY + ".svg"
                    } alt={APP_NAME} className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex flex-col leading-tight">
                    <span className="truncate text-sm font-semibold text-[var(--ui-text)]">{APP_NAME}</span>
                    <span className="text-xs text-[var(--ui-muted)]">{APP_TAGLINE}</span>
                  </div>
                </div>
              </div>

              <div className="flex max-w-full items-center gap-1.5 sm:gap-2">
                <AppSwitcher sites={sites} activeSiteId={activeSiteId} />
                <ProfileMenu
                  name={displayName}
                  role={role ?? undefined}
                  email={email}
                  sites={sites}
                  activeSiteId={currentSiteId}
                />
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-5 sm:px-5 sm:py-6 lg:px-6 lg:py-8 xl:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
