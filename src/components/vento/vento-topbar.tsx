import Link from "next/link";
import { AppSwitcher } from "./app-switcher";

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-2.5 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
    >
      {label}
    </Link>
  );
}

export function VentoTopbar() {
  return (
    <header>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex flex-col leading-tight">
            <div className="text-sm font-semibold text-zinc-900">Vento OS</div>
            <div className="text-xs text-zinc-500">NEXO</div>
          </div>
        </div>

        <nav className="flex w-full items-center gap-1 overflow-x-auto whitespace-nowrap md:w-auto">
          <NavItem href="/" label="Inicio" />
          <NavItem href="/scanner" label="Scanner" />
          <NavItem href="/inventory/locations" label="LOC" />
          <NavItem href="/inventory/lpns" label="LPN" />
          <NavItem href="/printing/jobs" label="Impresión" />
        </nav>

        <div className="flex items-center gap-2">
          <AppSwitcher />
        </div>
      </div>
    </header>
  );
}
