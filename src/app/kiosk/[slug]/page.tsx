import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type Params = { slug: string };

type KioskTarget =
  | {
      kind: "location";
      code: string;
    }
  | {
      kind: "zone";
      zone: string;
    };

const KIOSK_TARGETS: Record<string, KioskTarget> = {
  bodega: { kind: "location", code: "LOC-CP-BOD-MAIN" },
  "bodega-principal": { kind: "location", code: "LOC-CP-BOD-MAIN" },
  "nevera-produccion": { kind: "location", code: "LOC-CP-N3P-MAIN" },
  "nevera-preparaciones": { kind: "location", code: "LOC-CP-N3P-MAIN" },
  "nevera-despacho": { kind: "location", code: "LOC-CP-N3P-MAIN" },
  empaques: { kind: "zone", zone: "EMP" },
  "zona-empaques": { kind: "zone", zone: "EMP" },
};

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

function normalizeSlug(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

async function resolveActiveSiteId(params: {
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
  userId: string;
}) {
  const { supabase, userId } = params;

  const { data: employeeSitesData } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", userId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(50);

  const employeeSites = (employeeSitesData ?? []) as EmployeeSiteRow[];
  const siteIds = employeeSites
    .map((row) => row.site_id)
    .filter((siteId): siteId is string => Boolean(siteId));

  if (!siteIds.length) return "";

  const { data: employeeSettings } = await supabase
    .from("employee_settings")
    .select("selected_site_id")
    .eq("employee_id", userId)
    .maybeSingle();

  const selectedSiteId = String(employeeSettings?.selected_site_id ?? "").trim();
  const cookieStore = await cookies();
  const cookieSiteId = String(cookieStore.get("nexo_site_override_id")?.value ?? "").trim();

  if (cookieSiteId && siteIds.includes(cookieSiteId)) return cookieSiteId;
  if (selectedSiteId && siteIds.includes(selectedSiteId)) return selectedSiteId;
  return siteIds[0] ?? "";
}

export default async function KioskShortcutPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const normalizedSlug = normalizeSlug(slug);
  const target = KIOSK_TARGETS[normalizedSlug];
  if (!target) notFound();

  const returnTo = `/kiosk/${encodeURIComponent(normalizedSlug)}`;
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo,
    permissionCode: "inventory.locations",
  });

  if (target.kind === "location") {
    const { data: locationData } = await supabase
      .from("inventory_locations")
      .select("id")
      .eq("code", target.code)
      .eq("is_active", true)
      .maybeSingle();

    const location = (locationData ?? null) as { id: string } | null;
    if (!location) notFound();

    redirect(`/inventory/locations/${encodeURIComponent(location.id)}/board?kiosk=1`);
  }

  const siteId = await resolveActiveSiteId({ supabase, userId: user.id });
  if (!siteId) notFound();

  const { data: locationData } = await supabase
    .from("inventory_locations")
    .select("id")
    .eq("site_id", siteId)
    .eq("zone", target.zone)
    .eq("is_active", true)
    .limit(1);

  if (!locationData?.length) notFound();

  redirect(
    `/inventory/locations/zone?site_id=${encodeURIComponent(siteId)}&zone=${encodeURIComponent(
      target.zone
    )}&kiosk=1`
  );
}
