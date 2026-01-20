"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavDropdownItem = { href: string; label: string };

type NavDropdownProps = {
  label: string;
  items: NavDropdownItem[];
  /** Rutas que marcan esta sección como activa (p. ej. ["/inventory/stock", "/inventory/movements"]) */
  activePrefixes: string[];
};

export function NavDropdown({ label, items, activePrefixes }: NavDropdownProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isActive = activePrefixes.some((p) => pathname.startsWith(p));

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
        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-semibold hover:bg-zinc-50 hover:text-zinc-900 ${
          isActive ? "bg-zinc-100 text-zinc-900" : "text-zinc-700"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {label}
        <svg
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 z-50 mt-1 min-w-[200px] rounded-xl border border-zinc-200 bg-white py-2 shadow-lg">
          {items.map((item) => {
            const itemActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 ${
                  itemActive ? "bg-amber-50 text-amber-800" : "text-zinc-700"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
