import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { safeDecodeURIComponent } from "@/lib/url";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

type AreaKindRow = {
  code: string;
  name: string | null;
  use_for_remission: boolean | null;
};

type SiteRuleRow = {
  site_id: string | null;
  area_kind: string | null;
  purpose: string | null;
  is_enabled: boolean | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

async function requireRemissionSettingsManager(returnTo: string) {
  const supabase = await createClient();
  const { data: authRes } = await supabase.auth.getUser();
  const user = authRes.user ?? null;
  if (!user) {
    redirect(`${returnTo}?error=` + encodeURIComponent("Sesión requerida."));
  }
  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = String((employee as { role?: string } | null)?.role ?? "").toLowerCase();
  const canManage = ["propietario", "gerente_general"].includes(role);
  if (!canManage) {
    redirect(`${returnTo}?error=` + encodeURIComponent("No tienes permisos para esta configuración."));
  }
  return { supabase };
}

async function saveGlobalPurpose(formData: FormData) {
  "use server";
  const returnTo = "/inventory/settings/remissions";
  const { supabase } = await requireRemissionSettingsManager(returnTo);

  const selectedKinds = Array.from(
    new Set(
      formData
        .getAll("remission_area_kind")
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );

  await supabase.from("area_kinds").update({ use_for_remission: false }).neq("code", "__none__");
  if (selectedKinds.length > 0) {
    await supabase.from("area_kinds").update({ use_for_remission: true }).in("code", selectedKinds);
  }

  revalidatePath("/inventory/settings/remissions");
  revalidatePath("/inventory/remissions");
  revalidatePath("/inventory/catalog");
  redirect("/inventory/settings/remissions?ok=global_saved");
}

async function saveSiteOverride(formData: FormData) {
  "use server";
  const returnTo = "/inventory/settings/remissions";
  const { supabase } = await requireRemissionSettingsManager(returnTo);

  const siteId = asText(formData.get("site_id"));
  if (!siteId) {
    redirect("/inventory/settings/remissions?error=" + encodeURIComponent("Selecciona una sede."));
  }
  const selectedKinds = Array.from(
    new Set(
      formData
        .getAll("site_area_kind")
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );

  await supabase
    .from("site_area_purpose_rules")
    .delete()
    .eq("site_id", siteId)
    .eq("purpose", "remission");

  if (selectedKinds.length > 0) {
    const rows = selectedKinds.map((areaKind) => ({
      site_id: siteId,
      area_kind: areaKind,
      purpose: "remission",
      is_enabled: true,
    }));
    const { error } = await supabase.from("site_area_purpose_rules").upsert(rows, {
      onConflict: "site_id,area_kind,purpose",
    });
    if (error) {
      redirect("/inventory/settings/remissions?error=" + encodeURIComponent(error.message));
    }
  }

  revalidatePath("/inventory/settings/remissions");
  revalidatePath("/inventory/remissions");
  revalidatePath("/inventory/catalog");
  redirect(
    "/inventory/settings/remissions?ok=site_saved&site_id=" + encodeURIComponent(siteId)
  );
}

async function clearSiteOverride(formData: FormData) {
  "use server";
  const returnTo = "/inventory/settings/remissions";
  const { supabase } = await requireRemissionSettingsManager(returnTo);

  const siteId = asText(formData.get("site_id"));
  if (!siteId) {
    redirect("/inventory/settings/remissions?error=" + encodeURIComponent("Selecciona una sede."));
  }

  await supabase
    .from("site_area_purpose_rules")
    .delete()
    .eq("site_id", siteId)
    .eq("purpose", "remission");

  revalidatePath("/inventory/settings/remissions");
  revalidatePath("/inventory/remissions");
  revalidatePath("/inventory/catalog");
  redirect(
    "/inventory/settings/remissions?ok=site_reset&site_id=" + encodeURIComponent(siteId)
  );
}

export default async function RemissionsSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string; site_id?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg =
    sp.ok === "global_saved"
      ? "Propósito global de remisiones actualizado."
      : sp.ok === "site_saved"
        ? "Override por sede guardado."
        : sp.ok === "site_reset"
          ? "Override eliminado. La sede usa configuración global."
          : "";
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/settings/remissions",
  });

  const { data: emp } = await supabase.from("employees").select("role").eq("id", user.id).maybeSingle();
  const role = String((emp as { role?: string } | null)?.role ?? "").toLowerCase();
  const canManage = ["propietario", "gerente_general"].includes(role);
  if (!canManage) {
    return (
      <div className="w-full">
        <h1 className="ui-h1">Configuración maestra de remisiones</h1>
        <div className="mt-6 ui-alert ui-alert--warn">
          Solo propietarios y gerentes generales pueden gestionar esta configuración.
        </div>
      </div>
    );
  }

  const [{ data: sitesData }, { data: areaKindsData }, { data: rulesData }] = await Promise.all([
    supabase
      .from("sites")
      .select("id,name,site_type")
      .eq("is_active", true)
      .neq("name", "App Review (Demo)")
      .order("name", { ascending: true }),
    supabase
      .from("area_kinds")
      .select("code,name,use_for_remission")
      .order("name", { ascending: true }),
    supabase
      .from("site_area_purpose_rules")
      .select("site_id,area_kind,purpose,is_enabled")
      .eq("purpose", "remission"),
  ]);

  const sites = (sitesData ?? []) as SiteRow[];
  const areaKinds = (areaKindsData ?? []) as AreaKindRow[];
  const siteRules = (rulesData ?? []) as SiteRuleRow[];
  const globalEnabledSet = new Set(
    areaKinds
      .filter((kind) => Boolean(kind.use_for_remission))
      .map((kind) => String(kind.code ?? "").trim())
      .filter(Boolean)
  );

  const rulesBySite = siteRules.reduce((acc, row) => {
    const siteId = String(row.site_id ?? "").trim();
    const areaKind = String(row.area_kind ?? "").trim();
    if (!siteId || !areaKind || !row.is_enabled) return acc;
    const current = acc[siteId] ?? [];
    if (!current.includes(areaKind)) current.push(areaKind);
    acc[siteId] = current;
    return acc;
  }, {} as Record<string, string[]>);

  const selectedSiteId = String(sp.site_id ?? sites[0]?.id ?? "").trim();
  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? null;
  const hasOverride = Boolean(selectedSiteId && rulesBySite[selectedSiteId]?.length);
  const siteEnabledKinds = hasOverride
    ? new Set(rulesBySite[selectedSiteId] ?? [])
    : globalEnabledSet;

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Configuración maestra de remisiones</h1>
          <p className="mt-2 ui-body-muted">
            Define áreas por propósito y overrides por sede. Esta vista reemplaza reglas hardcodeadas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/remissions" className="ui-btn ui-btn--ghost">
            Ir a remisiones
          </Link>
          <Link href="/inventory/settings/supply-routes" className="ui-btn ui-btn--ghost">
            Rutas de abastecimiento
          </Link>
        </div>
      </div>

      {errorMsg ? <div className="mt-6 ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Propósito global · Remisiones</div>
        <p className="mt-1 text-sm text-[var(--ui-muted)]">
          Si una sede no tiene override, usa esta lista global.
        </p>
        <form action={saveGlobalPurpose} className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {areaKinds.map((kind) => (
              <label key={kind.code} className="flex items-center gap-2 rounded-xl border border-[var(--ui-border)] px-3 py-2">
                <input
                  type="checkbox"
                  name="remission_area_kind"
                  value={kind.code}
                  defaultChecked={Boolean(kind.use_for_remission)}
                />
                <span className="text-sm text-[var(--ui-text)]">{kind.name ?? kind.code}</span>
              </label>
            ))}
          </div>
          <button type="submit" className="ui-btn ui-btn--brand">
            Guardar global
          </button>
        </form>
      </div>

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Override por sede · Remisiones</div>
        <p className="mt-1 text-sm text-[var(--ui-muted)]">
          Configura excepciones por sede. Si limpias override, la sede vuelve a usar el global.
        </p>

        <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede</span>
            <select name="site_id" defaultValue={selectedSiteId} className="ui-input min-w-[280px]">
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
          </label>
          <button className="ui-btn ui-btn--ghost">Ver sede</button>
        </form>

        {selectedSite ? (
          <div className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-3">
            <div className="text-sm font-semibold text-[var(--ui-text)]">
              {selectedSite.name ?? selectedSite.id}
            </div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">
              Estado: {hasOverride ? "Override activo" : "Usando configuración global"}
            </div>
          </div>
        ) : null}

        {selectedSiteId ? (
          <form action={saveSiteOverride} className="mt-4 space-y-3">
            <input type="hidden" name="site_id" value={selectedSiteId} />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {areaKinds.map((kind) => (
                <label key={`${selectedSiteId}-${kind.code}`} className="flex items-center gap-2 rounded-xl border border-[var(--ui-border)] px-3 py-2">
                  <input
                    type="checkbox"
                    name="site_area_kind"
                    value={kind.code}
                    defaultChecked={siteEnabledKinds.has(kind.code)}
                  />
                  <span className="text-sm text-[var(--ui-text)]">{kind.name ?? kind.code}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="ui-btn ui-btn--brand">
                Guardar override de sede
              </button>
            </div>
          </form>
        ) : null}

        {selectedSiteId ? (
          <form action={clearSiteOverride} className="mt-3">
            <input type="hidden" name="site_id" value={selectedSiteId} />
            <button type="submit" className="ui-btn ui-btn--ghost">
              Limpiar override (usar global)
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
