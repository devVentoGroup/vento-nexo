"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppSwitcher } from "./app-switcher";
import { ProfileMenu } from "./profile-menu";
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

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Inicio",
    items: [
      {
        href: "/",
        label: "Panel",
        description: "Resumen operativo",
        required: ["access"],
        icon: "dashboard",
      },
    ],
  },
  {
    label: "Operación",
    items: [
      {
        href: "/inventory/remissions",
        label: "Remisiones",
        description: "Solicitar, preparar y recibir",
        required: ["inventory.remissions"],
        icon: "package",
      },
      {
        href: "/scanner",
        label: "Scanner",
        description: "Escaneo rápido",
        anyOf: [
          "inventory.remissions",
          "inventory.locations",
          "inventory.lpns",
          "inventory.stock",
          "inventory.movements",
          "inventory.counts",
          "inventory.adjustments",
          "inventory.production_batches",
        ],
        icon: "scan",
      },
      {
        href: "/printing/jobs",
        label: "Impresión",
        description: "Etiquetas Zebra",
        anyOf: ["inventory.production_batches", "inventory.locations", "inventory.lpns"],
        icon: "printer",
      },
    ],
  },
  {
    label: "Control",
    items: [
      {
        href: "/inventory/stock",
        label: "Stock",
        description: "Saldo por sede",
        required: ["inventory.stock"],
        icon: "boxes",
      },
      {
        href: "/inventory/movements",
        label: "Movimientos",
        description: "Ledger operativo",
        required: ["inventory.movements"],
        icon: "arrows",
      },
      {
        href: "/inventory/count-initial",
        label: "Conteo inicial",
        description: "Ajustes base",
        required: ["inventory.counts"],
        icon: "clipboard",
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
    label: "Trazabilidad",
    items: [
      {
        href: "/inventory/locations",
        label: "LOC",
        description: "Ubicaciones",
        required: ["inventory.locations"],
        icon: "map",
      },
      {
        href: "/inventory/lpns",
        label: "LPN",
        description: "Contenedores",
        required: ["inventory.lpns"],
        icon: "layers",
      },
    ],
  },
  {
    label: "Producción",
    items: [
      {
        href: "/inventory/production-batches",
        label: "Lotes",
        description: "Producción manual",
        required: ["inventory.production_batches"],
        icon: "sparkles",
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
      <span className="flex items-center gap-2 text-base font-semibold">
        <Icon name={item.icon} />
        {item.label}
      </span>
      {item.description ? (
        <span className="text-sm leading-5 text-[var(--ui-muted)]">{item.description}</span>
      ) : null}
    </Link>
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
      "inventory.remissions.receive",
      "inventory.stock",
      "inventory.movements",
      "inventory.counts",
      "inventory.adjustments",
      "inventory.locations",
      "inventory.lpns",
      "inventory.production_batches",
    ],
    []
  );

  useEffect(() => {
    let isActiveRequest = true;
    const supabase = createClient();
    const siteId = currentSiteId || activeSiteId || null;

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
      .catch(() => {
        if (!isActiveRequest) return;
        setPermMap({});
        setPermissionsReady(true);
      });

    return () => {
      isActiveRequest = false;
    };
  }, [currentSiteId, activeSiteId, permissionCodes]);

  const can = (code?: string) => (code ? Boolean(permMap[code]) : false);

  const isItemVisible = (item: NavItem) => {
    if (!permissionsReady) return false;
    if (item.required?.length) return item.required.every((code) => can(code));
    if (item.anyOf?.length) return item.anyOf.some((code) => can(code));
    return true;
  };

  const visibleGroups = useMemo(() => {
    if (!permissionsReady) return [];
    return NAV_GROUPS.map((group) => ({
      label: group.label,
      items: group.items.filter((item) => isItemVisible(item)),
    })).filter((group) => group.items.length > 0);
  }, [permissionsReady, permMap]);

  return (
    <div className="min-h-screen bg-[var(--ui-bg)] text-[var(--ui-text)]">
      <div className="flex min-h-screen">
        <div
          className={`fixed inset-0 z-40 bg-black/30 transition lg:hidden ${
            menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />

        <aside
          className={`ui-sidebar fixed left-0 top-0 z-50 flex h-full w-72 flex-col gap-4 px-4 py-5 transition-transform lg:static lg:translate-x-0 lg:shadow-none ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-[var(--ui-text)]">Vento OS</span>
              <span className="text-xs text-[var(--ui-muted)]">NEXO · Inventario</span>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="h-10 rounded-lg px-3 text-sm font-semibold text-[var(--ui-muted)] hover:bg-[var(--ui-surface-2)] lg:hidden"
            >
              Cerrar
            </button>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
              Sede activa
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{currentSiteLabel}</div>
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
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="inline-flex items-center rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] h-12 px-4 text-base font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-surface-2)] lg:hidden"
                >
                  Menú
                </button>
                <div className="hidden sm:flex flex-col leading-tight">
                  <span className="text-sm font-semibold text-[var(--ui-text)]">NEXO</span>
                  <span className="text-xs text-[var(--ui-muted)]">Logística e inventario operativo</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <AppSwitcher sites={sites} activeSiteId={activeSiteId} />
                <ProfileMenu name={displayName} role={role ?? undefined} email={email} sites={sites} />
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-6 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
