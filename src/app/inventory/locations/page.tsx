import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LocCreateForm } from "@/features/inventory/locations/loc-create-form";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SiteCode = "CP" | "SAU" | "VCF" | "VGR";

type SiteOption = {
  id: string;
  code: SiteCode;
  label: string;
  isPrimary: boolean;
};

type LocationRow = {
  id: string;
  code: string | null;
  zone: string | null;
  aisle: string | null;
  level: string | null;
};

function siteCodeFromName(name: string): SiteCode | null {
  const n = (name || "").toLowerCase();

  if (n.includes("centro") && n.includes("produ")) return "CP";
  if (n.includes("saudo")) return "SAU";
  if (n.includes("vento café") || n.includes("vento cafe")) return "VCF";
  if (n.includes("vento group")) return "VGR";

  return null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function buildCpTemplateRows(site_id: string, siteCode: SiteCode) {
  const rows: Array<Record<string, any>> = [];

  // BOD: 12 estanterías
  for (let i = 1; i <= 12; i++) {
    const aisle = `EST${pad2(i)}`;
    rows.push({
      site_id,
      code: `LOC-${siteCode}-BOD-${aisle}`,
      zone: "BOD",
      aisle,
      description: `Estantería ${i}`,
    });
  }

  // EMP: 2 estibas (empaques)
  for (let i = 1; i <= 2; i++) {
    const aisle = `ESTIBA${pad2(i)}`;
    rows.push({
      site_id,
      code: `LOC-${siteCode}-EMP-${aisle}`,
      zone: "EMP",
      aisle,
      description: `Estiba ${i} (empaques)`,
    });
  }

  // REC: 3 estados (pendiente / ok / cuarentena)
  rows.push({
    site_id,
    code: `LOC-${siteCode}-REC-PEND`,
    zone: "REC",
    aisle: "PEND",
    description: "Recepción - Pendiente de revisión",
  });
  rows.push({
    site_id,
    code: `LOC-${siteCode}-REC-OK`,
    zone: "REC",
    aisle: "OK",
    description: "Recepción - Revisado / listo para guardar",
  });
  rows.push({
    site_id,
    code: `LOC-${siteCode}-REC-QUAR`,
    zone: "REC",
    aisle: "QUAR",
    description: "Recepción - Cuarentena",
  });

  // DSP: único
  rows.push({
    site_id,
    code: `LOC-${siteCode}-DSP-MAIN`,
    zone: "DSP",
    aisle: "MAIN",
    description: "Despacho (único)",
  });

  return rows;
}

export default async function InventoryLocationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ created?: string; n?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const created = String(sp.created ?? "");
  const createdN = Number(sp.n ?? "0");
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";

  const returnTo = "/inventory/locations";
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo,
    permissionCode: "inventory.locations",
  });

  type EmployeeSiteRow = {
    site_id: string;
    is_primary: boolean | null;
  };

  const { data: employeeSitesRaw } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false });

  const employeeSites: EmployeeSiteRow[] = (employeeSitesRaw ??
    []) as EmployeeSiteRow[];

  const defaultSiteId = employeeSites[0]?.site_id ?? "";

  // 2) Resolvemos nombres en "sites"
  const siteIds = (employeeSites ?? []).map((r) => r.site_id).filter(Boolean);
  const primaryById = new Map(
    (employeeSites ?? []).map((r) => [r.site_id, Boolean(r.is_primary)]),
  );

  let siteOptions: SiteOption[] = [];

  if (siteIds.length > 0) {
    type SiteRow = {
      id: string;
      name: string | null;
    };

    const { data: sitesRaw } = await supabase
      .from("sites")
      .select("id,name")
      .in("id", siteIds);

    const sites: SiteRow[] = (sitesRaw ?? []) as SiteRow[];

    siteOptions = sites
      .map((s): SiteOption | null => {
        const code = siteCodeFromName(s.name ?? "");
        if (!code) return null;
        return {
          id: s.id,
          code,
          label: s.name ?? "Sede",
          isPrimary: primaryById.get(s.id) ?? false,
        };
      })
      .filter((x): x is SiteOption => Boolean(x));

    siteOptions.sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) ||
        a.label.localeCompare(b.label),
    );
  }

  async function createLocAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!user) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Sesión requerida")}`,
      );
    }

    const site_id = String(formData.get("site_id") ?? "").trim();
    const code = String(formData.get("code") ?? "")
      .trim()
      .toUpperCase();

    if (!site_id)
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Falta site_id.")}`,
      );
    if (!code)
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Falta code.")}`,
      );

    const payload: Record<string, any> = { site_id, code };

    // ZONA (requerida)
    let zone = String(formData.get("zone") ?? "")
      .trim()
      .toUpperCase();

    // Fallback defensivo (LOC-CP-BOD-EST01 => zone=BOD)
    if (!zone) {
      const parts = code.split("-");
      if (parts.length >= 3)
        zone = String(parts[2] ?? "")
          .trim()
          .toUpperCase();
    }

    if (!zone) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Falta zone (ZONA).")}`,
      );
    }

    payload.zone = zone;

    // aisle / level son TEXT en tu schema
    const aisle = String(formData.get("aisle") ?? "")
      .trim()
      .toUpperCase();
    if (aisle) payload.aisle = aisle;

    const level = String(formData.get("level") ?? "")
      .trim()
      .toUpperCase();
    if (level) payload.level = level;

    const description = String(formData.get("description") ?? "").trim();
    if (description) payload.description = description;

    const { error } = await supabase
      .from("inventory_locations")
      .insert(payload);

    if (error) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent(error.message)}`,
      );
    }

    revalidatePath("/inventory/locations");
    redirect("/inventory/locations?created=1");
  }

  async function createCpTemplateAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!user) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Sesión requerida")}`,
      );
    }

    const site_id = String(formData.get("site_id") ?? "").trim();
    const site_code = String(formData.get("site_code") ?? "")
      .trim()
      .toUpperCase() as SiteCode;

    if (!site_id)
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Falta site_id.")}`,
      );

    // Por ahora, la plantilla solo aplica a CP (decisión de negocio)
    if (site_code !== "CP") {
      redirect(
        `/inventory/locations?error=${encodeURIComponent(
          "La plantilla inicial solo está habilitada para Centro de Producción (CP).",
        )}`,
      );
    }

    const desiredRows = buildCpTemplateRows(site_id, site_code);
    const desiredCodes = desiredRows.map((r) => r.code);

    const { data: existing } = await supabase
      .from("inventory_locations")
      .select("code")
      .eq("site_id", site_id)
      .in("code", desiredCodes);

    const existingSet = new Set(
      (existing ?? []).map((r) => (r.code ?? "").toUpperCase()).filter(Boolean),
    );

    const toInsert = desiredRows.filter(
      (r) => !existingSet.has(String(r.code).toUpperCase()),
    );

    if (toInsert.length > 0) {
      const { error } = await supabase
        .from("inventory_locations")
        .insert(toInsert);
      if (error) {
        redirect(
          `/inventory/locations?error=${encodeURIComponent(error.message)}`,
        );
      }
    }

    revalidatePath("/inventory/locations");
    redirect(`/inventory/locations?created=template&n=${toInsert.length}`);
  }

  const { data: locations, error } = await supabase
    .from("inventory_locations")
    .select("id,code,zone,aisle,level")
    .order("code", { ascending: true })
    .limit(500);

  const locationRows = (locations ?? []) as LocationRow[];

  return (
    <div className="w-full px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">LOC</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Ubicaciones físicas (LOC). Para CP: BOD / EMP / REC / DSP.
          </p>
        </div>

        <Link
          href="/scanner"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
        >
          Ir a Scanner
        </Link>
      </div>

      {created === "1" ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          LOC creado correctamente.
        </div>
      ) : null}

      {created === "template" ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Plantilla CP aplicada.{" "}
          {createdN > 0 ? (
            <>
              LOCs creados: <span className="font-semibold">{createdN}</span>.
            </>
          ) : (
            <>No se creó nada (ya existían).</>
          )}
        </div>
      ) : null}

      {errorMsg ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error: {errorMsg}
        </div>
      ) : null}

      <div className="mt-6">
        <LocCreateForm
          sites={siteOptions}
          defaultSiteId={defaultSiteId}
          action={createLocAction}
          createCpTemplateAction={createCpTemplateAction}
        />
      </div>

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Falló el SELECT de LOCs: {error.message}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Ubicaciones</div>
        <div className="mt-1 text-sm text-zinc-600">
          Mostrando hasta 500 registros.
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                <th className="border-b border-zinc-200 pb-2">Código</th>
                <th className="border-b border-zinc-200 pb-2">Zona</th>
                <th className="border-b border-zinc-200 pb-2">Aisle</th>
                <th className="border-b border-zinc-200 pb-2">Level</th>
              </tr>
            </thead>
            <tbody>
              {locationRows.map((loc) => (
                <tr key={loc.id} className="text-sm text-zinc-800">
                  <td className="border-b border-zinc-100 py-3 font-mono">
                    {loc.code}
                  </td>
                  <td className="border-b border-zinc-100 py-3 font-mono">
                    {loc.zone ?? "—"}
                  </td>
                  <td className="border-b border-zinc-100 py-3 font-mono">
                    {loc.aisle ?? "—"}
                  </td>
                  <td className="border-b border-zinc-100 py-3 font-mono">
                    {loc.level ?? "—"}
                  </td>
                </tr>
              ))}

              {!error && (!locations || locations.length === 0) ? (
                <tr>
                  <td className="py-6 text-sm text-zinc-500" colSpan={4}>
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
