import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { buildShellLoginUrl } from "@/lib/auth/sso";

export const dynamic = "force-dynamic";

const FOGO_BASE_URL =
  process.env.NEXT_PUBLIC_FOGO_URL?.replace(/\/$/, "") ||
  "https://fogo.ventogroup.co";

function buildFogoProductionUrl(siteId: string) {
  const url = new URL("/production-batches", FOGO_BASE_URL);
  if (siteId) {
    url.searchParams.set("site_id", siteId);
  }
  return url.toString();
}

export default async function LegacyProductionRedirectPage() {
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/production-batches",
  });

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

  const siteId = String(settings?.selected_site_id ?? employee?.site_id ?? "").trim();

  if (!siteId) {
    redirect(
      "/inventory/catalog?error=" +
        encodeURIComponent("No tienes sede activa para abrir produccion en FOGO.")
    );
  }

  const fogoUrl = buildFogoProductionUrl(siteId);
  if (!fogoUrl) {
    redirect(await buildShellLoginUrl("/inventory/production-batches"));
  }

  redirect(fogoUrl);
}
