import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { LpnCreateForm } from "@/features/inventory/lpns/lpn-create-form";

type SearchParams = {
  code?: string;
  error?: string;
  created?: string;
  assigned?: string;
};

function yymmBogota() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "2-digit",
    month: "2-digit",
  }).formatToParts(new Date());

  const yy = parts.find((p) => p.type === "year")?.value ?? "00";
  const mm = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${yy}${mm}`;
}

function pad4(n: number) {
  return String(n).padStart(4, "0");
}

export default async function InventoryLpnsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const code = sp.code?.trim() ?? "";
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";
  const created = sp.created === "1";
  const assigned = sp.assigned === "1";

  const supabase = await createClient();

  let user: any = null;
  try {
    const res = await supabase.auth.getUser();
    user = res.data.user ?? null;
  } catch {
    user = null;
  }

  const returnTo = code
    ? `/inventory/lpns?code=${encodeURIComponent(code)}`
    : "/inventory/lpns";

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">LPN</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Necesitas iniciar sesión para ver/crear/asignar LPNs (RLS).
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-zinc-900">Sin sesión</div>
          <div className="mt-1 text-sm text-zinc-600">
            Inicia sesión en NEXO para continuar.
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Iniciar sesión
            </Link>

            <Link
              href="/scanner"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
            >
              Ir a Scanner
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Inferir site_id desde employee_sites (mismo patrón que LOC)
  const { data: sitesRows } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1);

  const defaultSiteId = sitesRows?.[0]?.site_id ?? "";

  // Locations para putaway
  const { data: locations, error: locErr } = await supabase
    .from("inventory_locations")
    .select("id,code")
    .order("code", { ascending: true })
    .limit(500);

  // Server action: crear LPN
  async function createLpnAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!user) {
      redirect(`/inventory/lpns?error=${encodeURIComponent("Sesión requerida")}`);
    }

    const site_id = String(formData.get("site_id") ?? "").trim();
    const sede_code = String(formData.get("sede_code") ?? "")
      .trim()
      .toUpperCase();

    if (!site_id) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta site_id.")}`);
    if (!sede_code) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta sede_code.")}`);

    const yymm = yymmBogota();
    const prefix = `LPN-${sede_code}-${yymm}-`;

    const { data: lastRows, error: lastErr } = await supabase
      .from("inventory_lpns")
      .select("code")
      .like("code", `${prefix}%`)
      .order("code", { ascending: false })
      .limit(1);

    if (lastErr) redirect(`/inventory/lpns?error=${encodeURIComponent(lastErr.message)}`);

    let nextSeq = 1;
    const lastCode = lastRows?.[0]?.code ?? "";
    if (lastCode.startsWith(prefix)) {
      const parts = lastCode.split("-");
      const seqStr = parts[parts.length - 1] ?? "";
      const parsed = Number.parseInt(seqStr, 10);
      if (Number.isFinite(parsed) && parsed > 0) nextSeq = parsed + 1;
    }

    // 2 intentos por colisión
    for (let i = 0; i < 2; i++) {
      const finalCode = `${prefix}${pad4(nextSeq + i)}`;

      const { error: insErr } = await supabase.from("inventory_lpns").insert({
        site_id,
        code: finalCode,
        location_id: null,
      });

      if (!insErr) {
        revalidatePath("/inventory/lpns");
        redirect(`/inventory/lpns?created=1&code=${encodeURIComponent(finalCode)}`);
      }

      if (i === 1) {
        redirect(`/inventory/lpns?error=${encodeURIComponent(insErr.message)}`);
      }
    }
  }

  // Server action: putaway (LPN -> LOC)
  async function putawayAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!user) {
      redirect(`/inventory/lpns?error=${encodeURIComponent("Sesión requerida")}`);
    }

    const lpn_id = String(formData.get("lpn_id") ?? "").trim();
    const location_id = String(formData.get("location_id") ?? "").trim();

    if (!lpn_id) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta lpn_id.")}`);
    if (!location_id) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta location_id.")}`);

    const { error } = await supabase
      .from("inventory_lpns")
      .update({ location_id })
      .eq("id", lpn_id);

    if (error) redirect(`/inventory/lpns?error=${encodeURIComponent(error.message)}`);

    revalidatePath("/inventory/lpns");
    redirect(`/inventory/lpns?assigned=1`);
  }

  // LPNs (con filtro por code si viene del scanner)
  let q = supabase
    .from("inventory_lpns")
    .select("id,code,location_id")
    .order("code", { ascending: false })
    .limit(200);

  if (code) q = q.eq("code", code);

  const [{ data: lpns, error: lpnsError }] = await Promise.all([q]);

  const locMap = new Map<string, { code: string }>();
  for (const loc of locations ?? []) {
    locMap.set(loc.id, { code: loc.code });
  }

  // Preselección si viene code y hay match exacto
  const preselectedLpnId =
    code && lpns?.[0]?.code === code ? (lpns?.[0]?.id ?? "") : "";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">LPN</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Contenedores para registrar ubicación (LOC) y contenido (items).
          </p>

          {code ? (
            <div className="mt-3 text-sm text-zinc-700">
              Filtro desde Scanner: <span className="font-mono">{code}</span>{" "}
              <Link
                className="ml-3 text-zinc-900 underline underline-offset-2"
                href="/inventory/lpns"
              >
                limpiar
              </Link>
            </div>
          ) : null}
        </div>

        <Link
          href="/scanner"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
        >
          Ir a Scanner
        </Link>
      </div>

      {created ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          LPN creado correctamente.
        </div>
      ) : null}

      {assigned ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          LOC asignado correctamente.
        </div>
      ) : null}

      {errorMsg ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error: {errorMsg}
        </div>
      ) : null}

      {locErr ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Falló el SELECT de LOCs: {locErr.message}
        </div>
      ) : null}

      <LpnCreateForm defaultSiteId={defaultSiteId} action={createLpnAction} />

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Putaway (LPN → LOC)</div>
        <div className="mt-1 text-sm text-zinc-600">
          Asigna un LOC a un LPN (actualiza <span className="font-mono">location_id</span>).
        </div>

        <form action={putawayAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-zinc-600">LPN</label>
            <select
              name="lpn_id"
              defaultValue={preselectedLpnId}
              className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            >
              <option value="">Selecciona un LPN…</option>
              {(lpns ?? []).map((lpn) => (
                <option key={lpn.id} value={lpn.id}>
                  {lpn.code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-600">LOC destino</label>
            <select
              name="location_id"
              className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            >
              <option value="">Selecciona un LOC…</option>
              {(locations ?? []).map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800">
              Asignar LOC
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">LPNs</div>
        <div className="mt-1 text-sm text-zinc-600">Mostrando hasta 200 registros.</div>

        {lpnsError ? (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
            Falló el SELECT: {lpnsError.message}
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                <th className="border-b border-zinc-200 pb-2">Código</th>
                <th className="border-b border-zinc-200 pb-2">LOC</th>
              </tr>
            </thead>
            <tbody>
              {(lpns ?? []).map((lpn) => {
                const loc = lpn.location_id ? locMap.get(lpn.location_id) : null;
                return (
                  <tr key={lpn.id} className="text-sm text-zinc-800">
                    <td className="border-b border-zinc-100 py-3 font-mono">{lpn.code}</td>
                    <td className="border-b border-zinc-100 py-3">
                      {loc ? (
                        <span className="font-mono">
                          {loc.code}
                        </span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!lpns || lpns.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-6 text-sm text-zinc-500">
                    No hay LPNs para mostrar (o RLS no te permite verlos).
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
