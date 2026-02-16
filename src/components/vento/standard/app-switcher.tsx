"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

type AppStatus = "active" | "soon";

type AppLink = {
  id: string;
  name: string;
  description: string;
  href: string;
  logoSrc: string;
  brandColor: string;
  status: AppStatus;
  group: "Workspace" | "Operacion" | "Proximamente";
};

type SiteOption = {
  id: string;
  name: string | null;
  site_type?: string | null;
};

type AppSwitcherProps = {
  sites?: SiteOption[];
  activeSiteId?: string;
};

function DotsIcon() {
  return (
    <span className="grid grid-cols-3 gap-0.5">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-sm bg-[var(--ui-muted)]" />
      ))}
    </span>
  );
}

function StatusPill({ status }: { status: AppStatus }) {
  const label = status === "active" ? "Activo" : "Proximamente";
  const cls = status === "active" ? "ui-app-status ui-app-status--active" : "ui-app-status ui-app-status--soon";

  return <span className={cls}>{label}</span>;
}

function AppTile({ app, onNavigate }: { app: AppLink; onNavigate: () => void }) {
  const isActive = app.status === "active";
  const [logoError, setLogoError] = useState(false);
  const tileStyle = { ["--app-color" as string]: app.brandColor };
  const fallback = app.name.slice(0, 1);

  const logoNode = logoError ? (
    <div className="ui-app-logo-fallback">{fallback}</div>
  ) : (
    <Image
      src={app.logoSrc}
      alt={`Logo ${app.name}`}
      className="ui-app-logo"
      width={28}
      height={28}
      onError={() => setLogoError(true)}
    />
  );

  if (!isActive) {
    return (
      <div className="ui-app-tile ui-app-tile--soon" style={tileStyle}>
        <div className="flex items-start justify-between gap-2">
          {logoNode}
          <StatusPill status={app.status} />
        </div>
        <div className="mt-3 text-sm font-semibold text-[var(--ui-text)]">{app.name}</div>
        <div className="mt-1 line-clamp-1 text-xs text-[var(--ui-muted)]">{app.description}</div>
      </div>
    );
  }

  return (
    <a href={app.href} onClick={onNavigate} className="ui-app-tile ui-app-tile--active" style={tileStyle}>
      <div className="flex items-start justify-between gap-2">
        {logoNode}
        <StatusPill status={app.status} />
      </div>
      <div className="mt-3 text-sm font-semibold text-[var(--ui-text)]">{app.name}</div>
      <div className="mt-1 line-clamp-1 text-xs text-[var(--ui-muted)]">{app.description}</div>
    </a>
  );
}

export function AppSwitcher({ sites = [], activeSiteId = "" }: AppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const apps = useMemo<AppLink[]>(
    () => [
      {
        id: "hub",
        name: "Hub",
        description: "Launcher del ecosistema.",
        logoSrc: "/apps/hub.png",
        brandColor: "#111827",
        href: "https://os.ventogroup.co",
        status: "active",
        group: "Workspace",
      },
      {
        id: "nexo",
        name: "NEXO",
        description: "Inventario y logistica.",
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
        id: "viso",
        name: "VISO",
        description: "Gerencia y auditoria.",
        logoSrc: "/apps/viso.svg",
        brandColor: "#6366F1",
        href: "https://viso.ventogroup.co",
        status: "soon",
        group: "Proximamente",
      },
      {
        id: "fogo",
        name: "FOGO",
        description: "Recetas y produccion.",
        logoSrc: "/apps/fogo.svg",
        brandColor: "#FB7185",
        href: "https://fogo.ventogroup.co",
        status: "soon",
        group: "Proximamente",
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
    ],
    []
  );

  const workspace = apps.filter((a) => a.group === "Workspace");
  const operacion = apps.filter((a) => a.group === "Operacion");
  const proximamente = apps.filter((a) => a.group === "Proximamente");

  const currentSiteId = searchParams.get("site_id") ?? activeSiteId ?? "";
  const currentSite = useMemo(
    () => sites.find((site) => site.id === currentSiteId),
    [sites, currentSiteId]
  );
  const currentSiteLabel = currentSite?.name ?? currentSiteId ?? "";

  const navigateWithSite = (nextId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextId) {
      params.set("site_id", nextId);
    } else {
      params.delete("site_id");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open) return;
      const t = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--ui-surface)] px-4 text-base font-semibold text-[var(--ui-text)] ring-1 ring-inset ring-[var(--ui-border)] hover:bg-[var(--ui-surface-2)]"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Abrir launcher de apps"
      >
        <DotsIcon />
        Apps
      </button>

      {open ? (
        <div className="ui-app-launcher absolute right-0 z-50 mt-2 w-[420px] max-w-[calc(100vw-24px)] animate-[launcherIn_160ms_ease-out] rounded-2xl">
          <div className="ui-app-launcher-header">
            <div>
              <div className="text-sm font-semibold text-[var(--ui-text)]">Apps del ecosistema</div>
              <div className="text-xs text-[var(--ui-muted)]">Cambia de modulo rapido por sede activa.</div>
            </div>
            {sites.length ? (
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold tracking-wide text-[var(--ui-muted)]">SEDE</div>
                <select
                  className="ui-input h-11 rounded-xl px-3 text-sm"
                  value={currentSiteId}
                  onChange={(e) => {
                    navigateWithSite(e.target.value);
                    setOpen(false);
                  }}
                >
                  <option value="">Sin sede</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name ?? site.id}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">Activa: {currentSiteLabel || "Sin sede"}</div>
              </div>
            ) : null}
          </div>

          <div className="ui-app-launcher-scroll ui-scrollbar-subtle max-h-[min(78vh,620px)] space-y-4 overflow-y-auto p-4">
            {workspace.length > 0 ? (
              <section>
                <div className="mb-2 text-xs font-semibold tracking-wide text-[var(--ui-muted)]">WORKSPACE</div>
                <div className="ui-app-launcher-grid">
                  {workspace.map((app) => (
                    <AppTile key={app.id} app={app} onNavigate={() => setOpen(false)} />
                  ))}
                </div>
              </section>
            ) : null}

            {operacion.length > 0 ? (
              <section>
                <div className="mb-2 text-xs font-semibold tracking-wide text-[var(--ui-muted)]">OPERACION</div>
                <div className="ui-app-launcher-grid">
                  {operacion.map((app) => (
                    <AppTile key={app.id} app={app} onNavigate={() => setOpen(false)} />
                  ))}
                </div>
              </section>
            ) : null}

            {proximamente.length > 0 ? (
              <section>
                <div className="mb-2 text-xs font-semibold tracking-wide text-[var(--ui-muted)]">PROXIMAMENTE</div>
                <div className="ui-app-launcher-grid">
                  {proximamente.map((app) => (
                    <AppTile key={app.id} app={app} onNavigate={() => setOpen(false)} />
                  ))}
                </div>
              </section>
            ) : null}

            {!workspace.length && !operacion.length && !proximamente.length ? (
              <div className="ui-empty">No hay apps disponibles.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
