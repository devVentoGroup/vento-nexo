import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ShortLocRedirectPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const locCode = String(code ?? "").trim().toUpperCase();
  if (!locCode) {
    redirect("/inventory/locations?error=" + encodeURIComponent("Falta el codigo del LOC."));
  }
  redirect(`/inventory/locations/open?loc=${encodeURIComponent(locCode)}`);
}
