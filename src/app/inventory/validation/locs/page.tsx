import { Suspense } from "react";
import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { LocationsValidationClient } from "./locations-validation-client";

export const dynamic = "force-dynamic";

function ValidationLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="inline-flex h-12 w-12 animate-spin rounded-full border-t-blue-600"></div>
    </div>
  );
}

export default async function ValidationPage() {
  // Require login to NEXO
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/validation/locs",
  });

  // Require inventory.validation permission
  const hasValidationAccess = await checkPermission(
    supabase,
    "nexo",
    "inventory.validation"
  );

  if (!hasValidationAccess) {
    redirect("/no-access?reason=no_permission&permission=nexo.inventory.validation");
  }

  // Get employee info for site filtering
  const { data: employee } = await supabase
    .from("employees")
    .select("id, role, site_id, sites(id, name, site_type)")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <Suspense fallback={<ValidationLoadingFallback />}>
      <LocationsValidationClient 
        employee={employee}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      />
    </Suspense>
  );
}
