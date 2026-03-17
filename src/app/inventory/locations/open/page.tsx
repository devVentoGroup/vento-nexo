import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type SearchParams = {
  loc?: string;
  loc_id?: string;
  site_id?: string;
};

function asText(value: string | undefined) {
  return String(value ?? "").trim();
}

export default async function OpenLocationPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const locationId = asText(sp.loc_id);
  const locCode = asText(sp.loc).toUpperCase();
  const requestedSiteId = asText(sp.site_id);

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/locations/open",
  });

  if (locationId) {
    redirect(`/inventory/locations/${encodeURIComponent(locationId)}`);
  }

  if (!locCode) {
    redirect("/inventory/locations?error=" + encodeURIComponent("Falta el codigo del LOC."));
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("site_id")
    .eq("id", user.id)
    .maybeSingle();
  const { data: settings } = await supabase
    .from("employee_settings")
    .select("selected_site_id")
    .eq("employee_id", user.id)
    .maybeSingle();

  const activeSiteId = requestedSiteId || settings?.selected_site_id || employee?.site_id || "";

  const { data: locations } = await supabase
    .from("inventory_locations")
    .select("id,code,site_id")
    .ilike("code", locCode)
    .eq("is_active", true)
    .limit(20);

  const rows = (locations ?? []) as Array<{ id: string; code: string | null; site_id: string | null }>;
  const exactMatches = rows.filter((row) => String(row.code ?? "").trim().toUpperCase() === locCode);

  const resolved =
    (activeSiteId
      ? exactMatches.find((row) => String(row.site_id ?? "").trim() === activeSiteId) ?? null
      : null) ||
    (exactMatches.length === 1 ? exactMatches[0] : null);

  if (!resolved) {
    redirect(
      `/inventory/locations?code=${encodeURIComponent(locCode)}&error=${encodeURIComponent(
        "No se pudo abrir ese LOC directamente. Revisa la sede activa o el codigo."
      )}`
    );
  }

  redirect(`/inventory/locations/${encodeURIComponent(resolved.id)}`);
}
