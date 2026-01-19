import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import { AppSwitcher } from "./app-switcher";
import { ProfileMenu } from "./profile-menu";

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

export async function VentoTopbar() {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;

  let employee: { role?: string | null; full_name?: string | null; alias?: string | null; site_id?: string | null } | null =
    null;
  let sites: Array<{ id: string; name: string | null; site_type: string | null }> = [];
  let activeSiteId = "";

  if (user) {
    const { data: employeeRow } = await supabase
      .from("employees")
      .select("role,full_name,alias,site_id")
      .eq("id", user.id)
      .single();

    employee = employeeRow ?? null;

    const { data: employeeSites } = await supabase
      .from("employee_sites")
      .select("site_id,is_primary")
      .eq("employee_id", user.id)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .limit(50);

    const defaultSiteId = employeeSites?.[0]?.site_id ?? employee?.site_id ?? "";
    activeSiteId = defaultSiteId;

    const siteIds = (employeeSites ?? [])
      .map((row) => row.site_id)
      .filter((id): id is string => Boolean(id));

    if (siteIds.length) {
      const { data: sitesRows } = await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", siteIds)
        .order("name", { ascending: true });
      sites = sitesRows ?? [];
    }
  }

  const displayName =
    employee?.alias ?? employee?.full_name ?? user?.email ?? "Usuario";
  const role = employee?.role ?? "";

  return (
    <header>
      <div className="flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4">
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
          <AppSwitcher sites={sites} activeSiteId={activeSiteId} />
          {user ? (
            <ProfileMenu name={displayName} role={role} email={user.email} />
          ) : null}
        </div>
      </div>
    </header>
  );
}
