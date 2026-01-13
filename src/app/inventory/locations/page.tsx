import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { LocCreateForm } from "@/features/inventory/locations/loc-create-form";

export const dynamic = "force-dynamic";

export default async function InventoryLocationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ created?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const created = sp.created === "1";
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";

  const supabase = await createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;

  const returnTo = "/inventory/locations";
  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  // defaultSiteId desde employee_sites (para preselección en el formulario)
  const { data: sitesRows } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1);

  const defaultSiteId = sitesRows?.[0]?.site_id ?? "";

  async function createLocAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!user) {
      redirect(`/inventory/locations?error=${encodeURIComponent("Sesión requerida")}`);
    }

    const site_id = String(formData.get("site_id") ?? "").trim();
    const code = String(formData.get("code") ?? "").trim().toUpperCase();

    if (!site_id) redirect(`/inventory/locations?error=${encodeURIComponent("Falta site_id.")}`);
    if (!code) redirect(`/inventory/locations?error=${encodeURIComponent("Falta code.")}`);

    // Payload mínimo seguro (tu tabla exige zone)
    const payload: Record<string, any> = { site_id, code };

    // ZONA (requerida). La UI normalmente manda "zone".
    let zone = String(formData.get("zone") ?? "").trim().toUpperCase();

    // Fallback defensivo: derivar zone desde el code (LOC-SEDE-ZONA-PASILLO-NIVEL)
    // Ej: LOC-CP-F1FRI-01-N0  => zone = F1FRI
    if (!zone) {
      const parts = code.split("-");
      if (parts.length >= 3) zone = String(parts[2] ?? "").trim().toUpperCase();
    }

    if (!zone) {
      redirect(`/inventory/locations?error=${encodeURIComponent("Falta zone (ZONA).")}`);
    }

    payload.zone = zone;

    // Si en tu esquema también existe zone_id, lo dejamos opcional (no estorba)
    const zone_id = String(formData.get("zone_id") ?? "").trim();
    if (zone_id) payload.zone_id = zone_id;

    const aisleStr = String(formData.get("aisle") ?? "").trim();
    if (aisleStr) payload.aisle = Number(aisleStr);

    const levelStr = String(formData.get("level") ?? "").trim();
    if (levelStr) payload.level = Number(levelStr);

    const description = String(formData.get("description") ?? "").trim();
    if (description) payload.description = description;

    const { error } = await supabase.from("inventory_locations").insert(payload);

    if (error) {
      redirect(`/inventory/locations?error=${encodeURIComponent(error.message)}`);
    }

    revalidatePath("/inventory/locations");
    redirect("/inventory/locations?created=1");
  }

  const { data: locations, error } = await supabase
    .from("inventory_locations")
    .select("id,code")
    .order("code", { ascending: true })
    .limit(500);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">LOC</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Ubicaciones de inventario (lista). Si necesitas el formulario de crear LOC,
            lo conectamos en el siguiente micro-paso.
          </p>
        </div>

        <Link
          href="/scanner"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
        >
          Ir a Scanner
        </Link>
      </div>

      {created ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          LOC creado correctamente.
        </div>
      ) : null}

      {errorMsg ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error: {errorMsg}
        </div>
      ) : null}

      <div className="mt-6">
        <LocCreateForm defaultSiteId={defaultSiteId} action={createLocAction} />
      </div>

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Falló el SELECT de LOCs: {error.message}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Ubicaciones</div>
        <div className="mt-1 text-sm text-zinc-600">Mostrando hasta 500 registros.</div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                <th className="border-b border-zinc-200 pb-2">Código</th>
              </tr>
            </thead>
            <tbody>
              {(locations ?? []).map((loc) => (
                <tr key={loc.id} className="text-sm text-zinc-800">
                  <td className="border-b border-zinc-100 py-3 font-mono">
                    {loc.code}
                  </td>
                </tr>
              ))}

              {!error && (!locations || locations.length === 0) ? (
                <tr>
                  <td className="py-6 text-sm text-zinc-500">
                    No hay LOCs para mostrar (o RLS no te permite verlos).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
