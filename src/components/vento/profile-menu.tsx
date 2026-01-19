"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ProfileMenuProps = {
  name?: string;
  role?: string;
  email?: string | null;
};

function initialsFrom(value?: string) {
  const text = (value ?? "").trim();
  if (!text) return "VG";
  const parts = text.split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "VG";
}

export function ProfileMenu({ name, role, email }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const initials = useMemo(() => initialsFrom(name || email || "Vento"), [name, email]);
  const displayName = name || "Usuario";
  const shellLoginUrl =
    process.env.NEXT_PUBLIC_SHELL_LOGIN_URL || "https://os.ventogroup.co/login";

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
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-600 text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="hidden sm:inline">Perfil</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg">
          <div className="text-sm font-semibold text-zinc-900">{displayName}</div>
          {role ? <div className="mt-1 text-xs text-zinc-500">Rol: {role}</div> : null}
          {email ? <div className="mt-2 text-xs text-zinc-500">Email: {email}</div> : null}
          <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            Sesion activa en NEXO.
          </div>
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
