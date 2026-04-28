import Link from "next/link";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LocCreateForm } from "@/features/inventory/locations/loc-create-form";
import { LocDeleteButton } from "@/features/inventory/locations/loc-delete-button";
import { LocEditForm } from "@/features/inventory/locations/loc-edit-form";
import { STANDARD_LOCATION_ZONES } from "@/features/inventory/locations/location-form-options";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { safeDecodeURIComponent } from "@/lib/url";

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
  area_id: string | null;
  description?: string | null;
};

type AreaOption = {
  id: string;
  siteId: string;
  label: string;
  code: string;
};

function siteCodeFromName(name: string): SiteCode | null {
  const n = (name || "").toLowerCase();

  if (n.includes("centro") && n.includes("produ")) return "CP";
  if (n.includes("saudo")) return "SAU";
  if (n.includes("vento café") || n.includes("vento cafe")) return "VCF";
  if (n.includes("vento group")) return "VGR";

  return null;
}

const ZONE_LABEL_MAP = new Map<string, string>(
  STANDARD_LOCATION_ZONES.map((option) => [
    option.code,
    option.label.replace(/\s*\([^)]*\)\s*/g, "").trim(),
  ]),
);

function humanizeLocSegment(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper === "MAIN") return "principal";
  if (upper === "PICK") return "picking";
  if (upper === "PREP") return "preparacion";
  if (upper === "DSP") return "despacho";
  return raw;
}

function suggestLocationDescription(loc: Pick<LocationRow, "zone" | "aisle" | "level" | "code" | "description">) {
  const currentDescription = String(loc.description ?? "").trim();
  if (currentDescription) return currentDescription;

  const zoneCode = String(loc.zone ?? "").trim().toUpperCase();
  const zoneLabel = ZONE_LABEL_MAP.get(zoneCode) || humanizeLocSegment(zoneCode) || "Ubicacion";
  const aisle = humanizeLocSegment(loc.aisle);
  const level = humanizeLocSegment(loc.level);

  const parts = [zoneLabel];
  if (aisle) parts.push(aisle);
  if (level) parts.push(`nivel ${level}`);
  const suggested = parts.join(" · ").trim();

  return suggested || String(loc.code ?? "").trim() || "Ubicacion";
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
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
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
  let areaOptions: AreaOption[] = [];

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

    const { data: areasRaw } = await supabase
      .from("areas")
      .select("id,site_id,code,name,kind,is_active")
      .in("site_id", siteIds)
      .eq("is_active", true)
      .order("name", { ascending: true });

    areaOptions = ((areasRaw ?? []) as Array<{
      id: string;
      site_id: string | null;
      code: string | null;
      name: string | null;
      kind: string | null;
    }>)
      .filter((area) => Boolean(area.site_id))
      .map((area) => ({
        id: area.id,
        siteId: area.site_id!,
        label: area.name ?? area.kind ?? area.code ?? "Area",
        code: area.code ?? area.kind ?? "AREA",
      }));
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
    const area_id = String(formData.get("area_id") ?? "").trim();
    const code = String(formData.get("code") ?? "")
      .trim()
      .toUpperCase();

    if (!site_id)
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Falta site_id.")}`,
      );
    if (!area_id)
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Falta area_id.")}`,
      );
    if (!code)
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Falta code.")}`,
      );

    const payload: Record<string, string> = { site_id, area_id, code };

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
        `/inventory/locations?error=${encodeURIComponent("Solo propietarios pueden eliminar áreas.")}`,
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
        `/inventory/locations?error=${encodeURIComponent("Solo propietarios pueden editar áreas.")}`,
      );
    }

    const locId = String(formData.get("loc_id") ?? "").trim();
    if (!locId) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Falta loc_id.")}`,
      );
    }

    const code = String(formData.get("code") ?? "").trim().toUpperCase();
    const areaId = String(formData.get("area_id") ?? "").trim();
    const zone = String(formData.get("zone") ?? "").trim().toUpperCase();
    if (!code || !areaId || !zone) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Código y zona son obligatorios.")}`,
      );
    }

    const aisle = String(formData.get("aisle") ?? "").trim().toUpperCase();
    const level = String(formData.get("level") ?? "").trim().toUpperCase();
    const description = String(formData.get("description") ?? "").trim();

    const updates: Record<string, string | null> = {
      code,
      area_id: areaId,
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

  async function applySuggestedNameAction(formData: FormData) {
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
        `/inventory/locations?error=${encodeURIComponent("Solo propietarios pueden renombrar áreas.")}`,
      );
    }

    const locId = String(formData.get("loc_id") ?? "").trim();
    const suggestedName = String(formData.get("suggested_name") ?? "").trim();
    if (!locId || !suggestedName) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent("Falta área o nombre sugerido.")}`,
      );
    }

    const { error } = await supabase
      .from("inventory_locations")
      .update({ description: suggestedName })
      .eq("id", locId);

    if (error) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent(error.message)}`,
      );
    }

    revalidatePath("/inventory/locations");
    redirect("/inventory/locations?updated=1");
  }

  async function applySuggestedNamesBatchAction() {
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
        `/inventory/locations?error=${encodeURIComponent("Solo propietarios pueden renombrar áreas.")}`,
      );
    }

    let batchQuery = supabase
      .from("inventory_locations")
      .select("id,code,zone,aisle,level,description,site_id,area_id")
      .eq("is_active", true)
      .order("code", { ascending: true })
      .limit(500);

    if (filterSiteId) batchQuery = batchQuery.eq("site_id", filterSiteId);
    if (filterZone) batchQuery = batchQuery.eq("zone", filterZone);
    if (filterCode) batchQuery = batchQuery.ilike("code", `%${filterCode}%`);

    const { data: rows, error } = await batchQuery;
    if (error) {
      redirect(
        `/inventory/locations?error=${encodeURIComponent(error.message)}`,
      );
    }

    const unnamedRows = ((rows ?? []) as LocationRow[]).filter(
      (row) => !String(row.description ?? "").trim(),
    );

    for (const row of unnamedRows) {
      const suggestedName = suggestLocationDescription(row);
      const { error: updateError } = await supabase
        .from("inventory_locations")
        .update({ description: suggestedName })
        .eq("id", row.id);

      if (updateError) {
        redirect(
          `/inventory/locations?error=${encodeURIComponent(updateError.message)}`,
        );
      }
    }

    revalidatePath("/inventory/locations");
    redirect("/inventory/locations?updated=1");
  }

  let locationsQuery = supabase
    .from("inventory_locations")
    .select("id,code,zone,aisle,level,site_id,area_id,description")
    .eq("is_active", true)
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
  const areaLabelById = new Map(areaOptions.map((area) => [area.id, area.label]));

  const editingLoc = editId ? locationRows.find((l) => l.id === editId) ?? null : null;
  const isEditingLoc = Boolean(canEditLoc && editingLoc);
  const requestedEditButNotFound = Boolean(editId) && canEditLoc && !editingLoc;
  const unnamedLocationRows = locationRows.filter((loc) => !String(loc.description ?? "").trim());
  const baseQuery = new URLSearchParams();
  if (filterSiteId) baseQuery.set("site_id", filterSiteId);
  if (filterZone) baseQuery.set("zone", filterZone);
  if (filterCode) baseQuery.set("code", filterCode);
  const cancelHref = `/inventory/locations${baseQuery.toString() ? `?${baseQuery.toString()}` : ""}`;

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link href="/inventory/stock" className="ui-caption underline">Volver a stock</Link>
              <h1 className="ui-h1">Áreas</h1>
              <p className="ui-body-muted">
                {isEditingLoc
                  ? "Corrige solo la ubicacion seleccionada y vuelve al listado."
                  : "Crea áreas con nombre humano primero y deja el código técnico en segundo plano."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                {isEditingLoc ? "Editar área" : "Nueva área"}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {siteOptions.length} sedes
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {locationRows.length} áreas visibles
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {isEditingLoc ? (
                <Link href={cancelHref} className="ui-btn ui-btn--ghost">
                  Volver a alta
                </Link>
              ) : null}
              <Link href="/inventory/stock" className="ui-btn ui-btn--ghost">
                Ver stock
              </Link>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Áreas visibles</div>
              <div className="ui-remission-kpi-value">{locationRows.length}</div>
              <div className="ui-remission-kpi-note">Aplicando los filtros actuales del listado</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Sedes</div>
              <div className="ui-remission-kpi-value">{siteOptions.length}</div>
              <div className="ui-remission-kpi-note">Disponibles para crear o filtrar ubicaciones</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Accion</div>
              <div className="ui-remission-kpi-value">{isEditingLoc ? "Editar" : "Crear"}</div>
              <div className="ui-remission-kpi-note">Una sola tarea visible segun el modo actual</div>
            </article>
          </div>
        </div>
      </section>

      {created === "1" ? (
        <div className="ui-alert ui-alert--success">Ubicación creada correctamente.</div>
      ) : null}

      {deleted === "1" ? (
        <div className="ui-alert ui-alert--success">Área eliminada correctamente.</div>
      ) : null}

      {updated === "1" ? (
        <div className="ui-alert ui-alert--success">Área actualizada correctamente.</div>
      ) : null}

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">
          Error: {errorMsg}
        </div>
      ) : null}

      {requestedEditButNotFound ? (
        <div className="ui-alert ui-alert--warn">
          El área solicitada para edición no aparece en el listado actual. Revisa filtros o vuelve al modo de alta.
        </div>
      ) : null}

      {canEditLoc && editingLoc ? (
        <>
          <div className="ui-panel ui-remission-section ui-fade-up ui-delay-1 space-y-3">
            <div className="ui-h3">{editingLoc.description?.trim() || editingLoc.code || "Editar ubicacion"}</div>
            <div className="flex flex-wrap gap-2 text-sm text-[var(--ui-muted)]">
              <span className="ui-chip">{editingLoc.zone ?? "Sin zona"}</span>
              {editingLoc.code ? <span className="ui-chip">{editingLoc.code}</span> : null}
            </div>
          </div>

          <LocEditForm
            loc={editingLoc}
            areas={areaOptions.filter((area) => area.siteId === editingLoc.site_id)}
            action={updateLocAction}
            cancelHref={cancelHref}
          />
        </>
      ) : (
        <div className="space-y-4">
          <LocCreateForm
            sites={siteOptions}
            areas={areaOptions}
            defaultSiteId={defaultSiteId}
            action={createLocAction}
          />
        </div>
      )}

      {error ? (
        <div className="ui-alert ui-alert--error">
          Falló el SELECT de áreas: {error.message}
        </div>
      ) : null}

      {canEditLoc && unnamedLocationRows.length > 0 ? (
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="ui-h3">Áreas sin nombre visible</div>
              <div className="mt-1 ui-body-muted">
                El código técnico se conserva. Aquí solo estás agregando el nombre humano que verá la operación.
              </div>
            </div>
            <form action={applySuggestedNamesBatchAction}>
              <button type="submit" className="ui-btn ui-btn--ghost">
                Aplicar sugerencias visibles
              </button>
            </form>
          </div>

          <div className="mt-4 grid gap-3">
            {unnamedLocationRows.slice(0, 12).map((loc) => {
              const suggestedName = suggestLocationDescription(loc);
              return (
                <div key={loc.id} className="ui-panel-soft flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-[var(--ui-text)]">{loc.code ?? "Área sin código"}</div>
                    <div className="text-sm text-[var(--ui-muted)]">
                      Sugerencia: <strong className="text-[var(--ui-text)]">{suggestedName}</strong>
                    </div>
                  </div>
                  <form action={applySuggestedNameAction} className="flex items-center gap-2">
                    <input type="hidden" name="loc_id" value={loc.id} />
                    <input type="hidden" name="suggested_name" value={suggestedName} />
                    <button type="submit" className="ui-btn ui-btn--brand">
                      Usar sugerencia
                    </button>
                    <Link
                      href={`/inventory/locations?${baseQuery.toString() ? `${baseQuery.toString()}&` : ""}edit=${encodeURIComponent(loc.id)}`}
                      className="ui-btn ui-btn--ghost"
                    >
                      Editar
                    </Link>
                  </form>
                </div>
              );
            })}
          </div>

          {unnamedLocationRows.length > 12 ? (
            <div className="mt-3 ui-caption">
              Se muestran 12 sugerencias primero. Puedes aplicar todas las visibles o editar una por una.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Listado</div>
            <div className="mt-1 ui-body-muted">
              Busca por sede, zona o codigo. Max. 500 registros.
            </div>
          </div>
          <div className="rounded-full border border-slate-200 bg-[var(--ui-bg-soft)] px-3 py-1 text-xs font-semibold text-[var(--ui-muted)]">
            {locationRows.length} resultados
          </div>
        </div>

        <details className="mt-4 ui-panel-soft p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="font-semibold text-[var(--ui-text)]">Refinar listado</span>
            <span className="ui-chip">Opcional</span>
          </summary>
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
              <span className="ui-caption font-medium">Codigo (contiene)</span>
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
        </details>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Nombre</TableHeaderCell>
                <TableHeaderCell>Area madre</TableHeaderCell>
                <TableHeaderCell>Código</TableHeaderCell>
                <TableHeaderCell>Zona</TableHeaderCell>
                <TableHeaderCell>Pasillo</TableHeaderCell>
                <TableHeaderCell>Nivel</TableHeaderCell>
                {canEditLoc || canDeleteLoc ? <TableHeaderCell>Acciones</TableHeaderCell> : null}
              </tr>
            </thead>
            <tbody>
              {locationRows.map((loc) => (
                <tr key={loc.id} className="ui-body">
                  <TableCell>
                    <div className="space-y-1">
                      <div>{loc.description?.trim() || "Sin nombre"}</div>
                      {!loc.description?.trim() ? (
                        <div className="ui-caption">
                          Sugerido: {suggestLocationDescription(loc)}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    {loc.area_id ? areaLabelById.get(loc.area_id) ?? "Area" : "Sin area"}
                  </TableCell>
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
                  <TableCell className="ui-empty" colSpan={canEditLoc || canDeleteLoc ? 7 : 6}>
                    No hay áreas para mostrar (o RLS no te permite verlas).
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
