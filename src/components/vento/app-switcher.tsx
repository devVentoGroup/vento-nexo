"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type AppStatus = "active" | "soon";

type AppLink = {
  id: string;
  name: string;
  description: string;
  href: string;
  status: AppStatus;
  group: "Workspace" | "Interno" | "Directo";
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
        <span key={i} className="h-1.5 w-1.5 rounded-sm bg-zinc-600" />
      ))}
    </span>
  );
}

function StatusPill({ status }: { status: AppStatus }) {
  const label = status === "active" ? "Activo" : "Pr+�ximamente";
  const cls =
    status === "active"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : "bg-zinc-100 text-zinc-600 ring-zinc-200";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}

function AppTile({ app, onNavigate }: { app: AppLink; onNavigate: () => void }) {
  const isActive = app.status === "active";

  if (!isActive) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-3 opacity-70">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-semibold text-zinc-900">{app.name}</div>
          <StatusPill status={app.status} />
        </div>
        <div className="mt-1 text-xs leading-5 text-zinc-600">{app.description}</div>
      </div>
    );
  }

  return (
    <a
      href={app.href}
      onClick={onNavigate}
      className="block rounded-xl border border-zinc-200 bg-white p-3 hover:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-zinc-900">{app.name}</div>
        <StatusPill status={app.status} />
      </div>
      <div className="mt-1 text-xs leading-5 text-zinc-600">{app.description}</div>
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
        href: "https://os.ventogroup.co",
        status: "active",
        group: "Workspace",
      },
      {
        id: "viso",
        name: "VISO",
        description: "Gerencia y auditor+�a.",
        href: "https://viso.ventogroup.co",
        status: "soon",
        group: "Interno",
      },
      {
        id: "nexo",
        name: "NEXO",
        description: "Inventario y log+�stica.",
        href: "https://nexo.ventogroup.co",
        status: "active",
        group: "Interno",
      },
      {
        id: "fogo",
        name: "FOGO",
        description: "Recetas y producci+�n.",
        href: "https://fogo.ventogroup.co",
        status: "soon",
        group: "Interno",
      },
      {
        id: "origo",
        name: "ORIGO",
        description: "Compras y proveedores.",
        href: "https://origo.ventogroup.co",
        status: "soon",
        group: "Interno",
      },
      {
        id: "pulso",
        name: "PULSO",
        description: "POS y ventas.",
        href: "https://pulso.ventogroup.co",
        status: "soon",
        group: "Interno",
      },
      {
        id: "aura",
        name: "AURA",
        description: "Marketing y contenido.",
        href: "https://aura.ventogroup.co",
        status: "soon",
        group: "Interno",
      },
    ],
    []
  );

  const workspace = apps.filter((a) => a.group === "Workspace");
  const interno = apps.filter((a) => a.group === "Interno");
  const directo = apps.filter((a) => a.group === "Directo");

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
        className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <DotsIcon />
        Apps
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[360px] rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg">
          <div className="space-y-4">
            {sites.length ? (
              <div>
                <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-500">SEDE</div>
                <select
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
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
                <div className="mt-2 text-xs text-zinc-500">
                  Activa: {currentSiteLabel || "Sin sede"}
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-500">WORKSPACE</div>
              <div className="grid grid-cols-1 gap-2">
                {workspace.map((app) => (
                  <AppTile key={app.id} app={app} onNavigate={() => setOpen(false)} />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-500">INTERNO</div>
              <div className="grid grid-cols-1 gap-2">
                {interno.map((app) => (
                  <AppTile key={app.id} app={app} onNavigate={() => setOpen(false)} />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-500">DIRECTO</div>
              <div className="grid grid-cols-1 gap-2">
                {directo.map((app) => (
                  <AppTile key={app.id} app={app} onNavigate={() => setOpen(false)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
