import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InventoryLocationsPage() {
  const supabase = await createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;

  const returnTo = "/inventory/locations";
  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
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
  