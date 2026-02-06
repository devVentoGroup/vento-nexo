import Link from "next/link";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LocCreateForm } from "@/features/inventory/locations/loc-create-form";
import { LocDeleteButton } from "@/features/inventory/locations/loc-delete-button";
import { LocEditForm } from "@/features/inventory/locations/loc-edit-form";
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
  site_id: string | null;
  description?: string | null;
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

/** Plantilla "Espacios físicos": LOCs generales por zona (bodega, frío, neveras, secos). */
function buildEspaciosFisicosTemplateRows(site_id: string, siteCode: SiteCode) {
  const rows: Array<Record<string, unknown>> = [
    { site_id, code: `LOC-${siteCode}-BODEGA-MAIN`, zone: "BODEGA", aisle: "MAIN", description: "Bodega" },
    { site_id, code: `LOC-${siteCode}-FRIO-MAIN`, zone: "FRIO", aisle: "MAIN", description: "Cuarto frío" },
    { site_id, code: `LOC-${siteCode}-CONG-MAIN`, zone: "CONG", aisle: "MAIN", description: "Cuarto de congelación" },
    { site_id, code: `LOC-${siteCode}-N2P-MAIN`, zone: "N2P", aisle: "MAIN", description: "Nevera 2 puertas" },
    { site_id, code: `LOC-${siteCode}-N3P-MAIN`, zone: "N3P", aisle: "MAIN", description: "Nevera 3 puertas" },
    { site_id, code: `LOC-${siteCode}-SECOS1-MAIN`, zone: "SECOS1", aisle: "MAIN", description: "Zona de secos primer piso" },
    { site_id, code: `LOC-${siteCode}-SECPREP-MAIN`, zone: "SECPREP", aisle: "MAIN", description: "Secos preparados (porciones en bolsa)" },
  ];
  return rows;
}

export default async function InventoryLocationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    created?: string;
    n?: string;
    deleted?: string;
    updated?: string;
    edit?: string;
    error?: string;
    site_id?: string;
    zone?: string;
    code?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const created = String(sp.created ?? "");
  const createdN = Number(sp.n ?? "0");
  const deleted = String(sp.deleted ?? "");
  const updated = String(sp.updated ?? "");
  const editId = String(sp.edit ?? "").trim();
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";
  const filterSiteId = String(sp.site_id ?? "").trim();
  const filterZone = String(sp.zone ?? "").trim().toUpperCase();
  const filterCode = String(sp.code ?? "").trim();

  const returnTo = "/inventory/locations";
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo,
    permissionCode: "inventory.locations",
  });

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const userRole = String((employeeRow as { role?: string } | null)?.role ?? "");
  const canDeleteLoc = ["propietario", "gerente_general"].includes(userRole);
  const canEditLoc = canDeleteLoc;

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

  async function createEspaciosFisicosTemplateAction(formData: FormData) {
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

    if (!site_id) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Falta site_id.")}`,
      );
    }

    const desiredRows = buildEspaciosFisicosTemplateRows(site_id, site_code);
    const desiredCodes = desiredRows.map((r) => r.code as string);

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
      const { error: insertErr } = await supabase
        .from("inventory_locations")
        .insert(toInsert);
      if (insertErr) {
        redirect(
          `/inventory/locations?error=${encodeURIComponent(insertErr.message)}`,
        );
      }
    }

    revalidatePath("/inventory/locations");
    redirect(`/inventory/locations?created=espacios&n=${toInsert.length}`);
  }

  async function deleteLocAction(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!user) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Sesión requerida")}`,
      );
    }

    const { data: emp } = await supabase
      .from("employees")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = String((emp as { role?: string } | null)?.role ?? "");
    if (!["propietario", "gerente_general"].includes(role)) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Solo propietarios pueden eliminar LOCs.")}`,
      );
    }

    const locId = String(formData.get("loc_id") ?? "").trim();
    if (!locId) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Falta loc_id.")}`,
      );
    }

    const { error } = await supabase
      .from("inventory_locations")
      .delete()
      .eq("id", locId);

    if (error) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent(error.message)}`,
      );
    }

    revalidatePath("/inventory/locations");
    redirect("/inventory/locations?deleted=1");
  }

  async function updateLocAction(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!user) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Sesión requerida")}`,
      );
    }

    const { data: emp } = await supabase
      .from("employees")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    const role = String((emp as { role?: string } | null)?.role ?? "");
    if (!["propietario", "gerente_general"].includes(role)) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Solo propietarios pueden editar LOCs.")}`,
      );
    }

    const locId = String(formData.get("loc_id") ?? "").trim();
    if (!locId) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Falta loc_id.")}`,
      );
    }

    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const zone = String(formData.get("zone") ?? "").trim().toUpperCase();
    if (!code || !zone) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Código y zona son obligatorios.")}`,
      );
    }

    const aisle = String(formData.get("aisle") ?? "").trim().toUpperCase();
    const level = String(formData.get("level") ?? "").trim().toUpperCase();
    const description = String(formData.get("description") ?? "").trim();

    const updates: Record<string, string | null> = {
      code,
      zone,
      aisle: aisle || null,
      level: level || null,
      description: description || null,
    };

    const { error } = await supabase
      .from("inventory_locations")
      .update(updates)
      .eq("id", locId);

    if (error) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent(error.message)}`,
      );
    }

    revalidatePath("/inventory/locations");
    redirect("/inventory/locations?updated=1");
  }

  let locationsQuery = supabase
    .from("inventory_locations")
    .select("id,code,zone,aisle,level,site_id,description")
    .order("code", { ascending: true })
    .limit(500);

  if (filterSiteId) {
    locationsQuery = locationsQuery.eq("site_id", filterSiteId);
  }
  if (filterZone) {
    locationsQuery = locationsQuery.eq("zone", filterZone);
  }
  if (filterCode) {
    locationsQuery = locationsQuery.ilike("code", `%${filterCode}%`);
  }

  const { data: locations, error } = await locationsQuery;
  const locationRows = (locations ?? []) as LocationRow[];

  const editingLoc = editId ? locationRows.find((l) => l.id === editId) : null;
  const baseQuery = new URLSearchParams();
  if (filterSiteId) baseQuery.set("site_id", filterSiteId);
  if (filterZone) baseQuery.set("zone", filterZone);
  if (filterCode) baseQuery.set("code", filterCode);
  const cancelHref = `/inventory/locations${baseQuery.toString() ? `?${baseQuery.toString()}` : ""}`;

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">LOC</h1>
          <p className="mt-2 ui-body-muted">
            Ubicaciones físicas (LOC). Para CP: BOD / EMP / REC / DSP.
          </p>
        </div>

        <Link
          href="/scanner"
          className="ui-btn ui-btn--ghost"
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

      {created === "espacios" ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Plantilla espacios físicos aplicada.{" "}
          {createdN > 0 ? (
            <>
              LOCs creados: <span className="font-semibold">{createdN}</span> (Bodega, Cuarto frío, Congelación, Neveras, Secos 1.º piso, Secos preparados).
            </>
          ) : (
            <>No se creó nada (ya existían).</>
          )}
        </div>
      ) : null}

      {deleted === "1" ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          LOC eliminado correctamente.
        </div>
      ) : null}

      {updated === "1" ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          LOC actualizado correctamente.
        </div>
      ) : null}

      {errorMsg ? (
        <div className="mt-6 ui-alert ui-alert--error">
          Error: {errorMsg}
        </div>
      ) : null}

      {canEditLoc && editingLoc ? (
        <LocEditForm
          loc={editingLoc}
          action={updateLocAction}
          cancelHref={cancelHref}
        />
      ) : null}

      <div className="mt-6">
        <LocCreateForm
          sites={siteOptions}
          defaultSiteId={defaultSiteId}
          action={createLocAction}
          createCpTemplateAction={createCpTemplateAction}
          createEspaciosFisicosTemplateAction={createEspaciosFisicosTemplateAction}
        />
      </div>

      {error ? (
        <div className="mt-6 ui-alert ui-alert--error">
          Falló el SELECT de LOCs: {error.message}
        </div>
      ) : null}

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Ubicaciones</div>
        <div className="mt-1 ui-body-muted">
          Filtra por sede, zona o código. Mostrando hasta 500 registros.
        </div>

        <form
          method="get"
          action="/inventory/locations"
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-medium">Sede</span>
            <select
              name="site_id"
              defaultValue={filterSiteId}
              className="ui-input min-w-[180px]"
            >
              <option value="">Todas</option>
              {siteOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-medium">Zona</span>
            <input
              type="text"
              name="zone"
              defaultValue={filterZone}
              placeholder="Ej: BODEGA, FRIO"
              className="ui-input min-w-[120px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-caption font-medium">Código (contiene)</span>
            <input
              type="text"
              name="code"
              defaultValue={filterCode}
              placeholder="Ej: LOC-CP"
              className="ui-input min-w-[140px]"
            />
          </label>
          <button type="submit" className="ui-btn ui-btn--brand">
            Filtrar
          </button>
          <Link
            href="/inventory/locations"
            className="ui-btn ui-btn--ghost"
          >
            Limpiar
          </Link>
        </form>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Código</TableHeaderCell>
                <TableHeaderCell>Zona</TableHeaderCell>
                <TableHeaderCell>Aisle</TableHeaderCell>
                <TableHeaderCell>Level</TableHeaderCell>
                {canEditLoc || canDeleteLoc ? <TableHeaderCell>Acciones</TableHeaderCell> : null}
              </tr>
            </thead>
            <tbody>
              {locationRows.map((loc) => (
                <tr key={loc.id} className="ui-body">
                  <TableCell className="font-mono">
                    {loc.code}
                  </TableCell>
                  <TableCell className="font-mono">
                    {loc.zone ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono">
                    {loc.aisle ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono">
                    {loc.level ?? "—"}
                  </TableCell>
                  {canEditLoc || canDeleteLoc ? (
                    <TableCell className="flex flex-wrap items-center gap-2">
                      {canEditLoc ? (
                        <Link
                          href={`/inventory/locations?${baseQuery.toString() ? `${baseQuery.toString()}&` : ""}edit=${encodeURIComponent(loc.id)}`}
                          className="text-sm font-semibold text-[var(--ui-brand-600)] hover:underline"
                        >
                          Editar
                        </Link>
                      ) : null}
                      {canDeleteLoc ? (
                        <>
                          {canEditLoc ? <span className="text-[var(--ui-muted)]">·</span> : null}
                          <LocDeleteButton
                            locId={loc.id}
                            locCode={loc.code}
                            action={deleteLocAction}
                          />
                        </>
                      ) : null}
                    </TableCell>
                  ) : null}
                </tr>
              ))}

              {!error && (!locations || locations.length === 0) ? (
                <tr>
                  <TableCell className="ui-empty" colSpan={canEditLoc || canDeleteLoc ? 5 : 4}>
                    No hay LOCs para mostrar (o RLS no te permite verlos).
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}




