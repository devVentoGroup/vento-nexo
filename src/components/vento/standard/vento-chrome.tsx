"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
const APP_TAGLINE =
  process.env.NEXT_PUBLIC_VENTO_APP_TAGLINE ?? "Logística e inventario operativo";

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
        href: "/inventory/remissions/prepare",
        label: "Preparar remisiones",
        description: "Vista bodega: marcar y enviar",
        required: ["inventory.remissions"],
        icon: "package",
      },
      {
        href: "/inventory/entries",
        label: "Entradas",
        description: "Recepción de insumos",
        required: ["inventory.entries"],
        icon: "layers",
      },
      {
        href: "/inventory/transfers",
        label: "Traslados internos",
        description: "Movimientos entre LOCs",
        required: ["inventory.transfers"],
        icon: "arrows",
      },
      {
        href: "/inventory/withdraw",
        label: "Retiros",
        description: "Consumo desde LOC (QR por zona)",
        required: ["inventory.withdraw"],
        icon: "boxes",
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
        href: "/inventory/locations",
        label: "Ubicaciones",
        description: "Locaciones (LOC)",
        required: ["inventory.locations"],
        allowedRoles: ["propietario", "gerente_general"],
        icon: "map",
      },
      {
        href: "/inventory/catalog",
        label: "Catálogo",
        description: "Maestro de productos",
        required: ["inventory.stock"],
        allowedRoles: ["propietario", "gerente_general"],
        icon: "sliders",
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
        label: "Conteos",
        description: "Ciclos y ajustes",
        required: ["inventory.counts"],
        icon: "clipboard",
      },
    ],
  },
  {
    label: "Impresión",
    items: [
      {
        href: "/printing/jobs",
        label: "Impresión",
        description: "Etiquetas Zebra",
        anyOf: ["inventory.production_batches", "inventory.locations"],
        icon: "printer",
      },
    ],
  },
  {
    label: "Configuración",
    items: [
      {
        href: "/inventory/settings/checklist",
        label: "Configuración inicial",
        description: "Checklist para inventario y remisiones",
        required: ["access"],
        icon: "clipboard",
      },
      {
        href: "/inventory/settings/supply-routes",
        label: "Rutas de abastecimiento",
        description: "Satélite → Centro (remisiones)",
        required: ["access"],
        icon: "sliders",
      },
      {
        href: "/inventory/settings/sites",
        label: "Sedes",
        description: "Listado de sedes",
        required: ["access"],
        icon: "map",
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
      "inventory.entries",
      "inventory.transfers",
      "inventory.withdraw",
      "inventory.locations",
      "inventory.production_batches",
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
        items: group.items.filter((item) => isItemVisible(item)),
      })).filter((group) => group.items.length > 0);

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
            <VentoLogo
              entity={APP_ENTITY}
              title="Vento OS"
              subtitle={`${APP_NAME} · Inventario`}
            />
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
                <div className="hidden sm:flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ui-surface-2)] ring-1 ring-inset ring-[var(--ui-border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/logos/${APP_ENTITY}.svg`} alt={APP_NAME} className="h-6 w-6" />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-semibold text-[var(--ui-text)]">{APP_NAME}</span>
                    <span className="text-xs text-[var(--ui-muted)]">{APP_TAGLINE}</span>
                  </div>
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
