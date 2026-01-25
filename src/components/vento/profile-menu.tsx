"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PRIVILEGED_ROLE_OVERRIDES,
  ROLE_OPTIONS,
  ROLE_OVERRIDE_COOKIE,
} from "@/lib/auth/role-override-config";

type ProfileMenuProps = {
  name?: string;
  role?: string;
  email?: string | null;
  sites?: Array<{ id: string; name: string | null }>;
};

function initialsFrom(value?: string) {
  const text = (value ?? "").trim();
  if (!text) return "VG";
  const parts = text.split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "VG";
}

export function ProfileMenu({ name, role, email, sites }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [overrideRole, setOverrideRole] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initials = useMemo(() => initialsFrom(name || email || "Vento"), [name, email]);
  const displayName = name || "Usuario";
  const shellLoginUrl =
    process.env.NEXT_PUBLIC_SHELL_LOGIN_URL || "https://os.ventogroup.co/login";
  const canSwitchRole = role ? PRIVILEGED_ROLE_OVERRIDES.has(role) : false;
  const roleLabelMap = useMemo(
    () => new Map(ROLE_OPTIONS.map((item) => [item.value, item.label])),
    []
  );
  const activeSiteId = searchParams.get("site_id") ?? "";

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      const returnTo = encodeURIComponent(window.location.origin);
      window.location.href = `${shellLoginUrl}?returnTo=${returnTo}`;
    }
  };

  const setCookieValue = (value: string | null) => {
    if (typeof document === "undefined") return;
    if (!value) {
      document.cookie = `${ROLE_OVERRIDE_COOKIE}=; path=/; max-age=0`;
      return;
    }
    const maxAge = 60 * 60 * 24 * 30;
    document.cookie = `${ROLE_OVERRIDE_COOKIE}=${value}; path=/; max-age=${maxAge}`;
  };

  const handleRoleOverride = (value: string | null) => {
    setOverrideRole(value);
    setCookieValue(value);
    router.refresh();
  };

  const handleSiteChange = (nextSiteId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextSiteId) {
      params.set("site_id", nextSiteId);
    } else {
      params.delete("site_id");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setOpen(false);
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

  useEffect(() => {
    if (typeof document === "undefined") return;
    const entry = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith(`${ROLE_OVERRIDE_COOKIE}=`));
    if (entry) {
      const value = entry.split("=")[1] ?? "";
      setOverrideRole(value || null);
    }
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-600 text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="hidden sm:inline">Perfil</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg">
          <div className="text-sm font-semibold text-zinc-900">{displayName}</div>
          {role ? (
            <div className="mt-1 text-xs text-zinc-500">
              Rol: {roleLabelMap.get(role) ?? role}
            </div>
          ) : null}
          {email ? <div className="mt-2 text-xs text-zinc-500">Email: {email}</div> : null}
          <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            Sesion activa en NEXO.
          </div>
          {canSwitchRole ? (
            <div className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Modo prueba
              </div>
              <div className="text-xs text-amber-900">
                Rol activo:{" "}
                <span className="font-semibold">
                  {overrideRole ? roleLabelMap.get(overrideRole) ?? overrideRole : "Real"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((option) => {
                  const isActive = overrideRole === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleRoleOverride(option.value)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        isActive
                          ? "bg-amber-600 text-white"
                          : "bg-white text-amber-800 ring-1 ring-inset ring-amber-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => handleRoleOverride(null)}
                className="text-xs font-semibold text-amber-700 hover:text-amber-800"
              >
                Usar rol real
              </button>
            </div>
          ) : null}
          {canSwitchRole && sites?.length ? (
            <div className="mt-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Sede activa
              </div>
              <select
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs"
                value={activeSiteId}
                onChange={(e) => handleSiteChange(e.target.value)}
              >
                <option value="">Sin sede</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.id}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl bg-amber-600 px-3 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
          >
            {isSigningOut ? "Cerrando..." : "Cerrar sesion"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
