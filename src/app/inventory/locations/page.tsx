import Link from "next/link";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LocCreateForm } from "@/features/inventory/locations/loc-create-form";
import { LocDeleteButton } from "@/features/inventory/locations/loc-delete-button";
import { LocEditForm } from "@/features/inventory/locations/loc-edit-form";
import { PageHeader } from "@/components/vento/standard/page-header";
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

    const payload: Record<string, string> = { site_id, code };

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
      <PageHeader
        title="Ubicaciones"
        subtitle="Ubicaciones físicas (LOC). Convención: LOC-SEDE-ZONA-PASILLO."
        actions={
          <Link href="/scanner" className="ui-btn ui-btn--ghost">
            Ir a Scanner
          </Link>
        }
      />

      {created === "1" ? (
        <div className="mt-6 ui-alert ui-alert--success">Ubicación creada correctamente.</div>
      ) : null}

      {deleted === "1" ? (
        <div className="mt-6 ui-alert ui-alert--success">LOC eliminado correctamente.</div>
      ) : null}

      {updated === "1" ? (
        <div className="mt-6 ui-alert ui-alert--success">LOC actualizado correctamente.</div>
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
        />
      </div>

      {error ? (
        <div className="mt-6 ui-alert ui-alert--error">
          Falló el SELECT de LOCs: {error.message}
        </div>
      ) : null}

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Listado</div>
        <div className="mt-1 ui-body-muted">
          Filtra por sede, zona o código. Máx. 500 registros.
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
