import { createClient } from "@/lib/supabase/server";
import { VentoChrome } from "./vento-chrome";

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

export async function VentoShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;

  let displayName = "Usuario";
  let role: string | null = null;
  let sites: SiteRow[] = [];
  let activeSiteId = "";

  if (user) {
    const { data: employeeRow } = await supabase
      .from("employees")
      .select("role,full_name,alias,site_id")
      .eq("id", user.id)
      .single();

    role = employeeRow?.role ?? null;
    displayName =
      employeeRow?.alias ?? employeeRow?.full_name ?? user.email ?? "Usuario";

    const { data: employeeSites } = await supabase
      .from("employee_sites")
      .select("site_id,is_primary")
      .eq("employee_id", user.id)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .limit(50);

    const employeeSiteRows = (employeeSites ?? []) as EmployeeSiteRow[];
    const defaultSiteId =
      employeeSiteRows[0]?.site_id ?? employeeRow?.site_id ?? "";
    activeSiteId = defaultSiteId ?? "";

    const siteIds = employeeSiteRows
      .map((row) => row.site_id)
      .filter((id): id is string => Boolean(id));

    if (siteIds.length) {
      const { data: siteRows } = await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", siteIds)
        .order("name", { ascending: true });
      sites = (siteRows ?? []) as SiteRow[];
    }
  }

  return (
    <VentoChrome
      displayName={displayName}
      role={role ?? undefined}
      email={user?.email ?? null}
      sites={sites}
      activeSiteId={activeSiteId}
    >
      {children}
    </VentoChrome>
  );
}
