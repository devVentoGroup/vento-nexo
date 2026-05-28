import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { safeDecodeURIComponent } from "@/lib/url";

export const dynamic = "force-dynamic";
const APP_ID = "nexo";
const REMISSIONS_INVENTORY_POSTING_SETTING_KEY =
  "remissions.inventory_posting_enabled";

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

type RuntimeSettingRow = {
  bool_value: boolean | null;
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

async function saveInventoryPostingSetting(formData: FormData) {
  "use server";

  const returnTo = "/inventory/settings/remissions";
  const { supabase } = await requireRemissionSettingsManager(returnTo);

  const enabled = asText(formData.get("inventory_posting_enabled")) === "true";

  const { data: authRes } = await supabase.auth.getUser();
  const user = authRes.user ?? null;

  const { error } = await supabase.from("app_runtime_settings").upsert(
    {
      app_id: APP_ID,
      setting_key: REMISSIONS_INVENTORY_POSTING_SETTING_KEY,
      bool_value: enabled,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    },
    {
      onConflict: "app_id,setting_key",
    }
  );

  if (error) {
    redirect("/inventory/settings/remissions?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/inventory/settings/remissions");
  revalidatePath("/inventory/remissions");
  revalidatePath("/inventory/remissions/prepare");
  revalidatePath("/inventory/remissions/transit");

  redirect("/inventory/settings/remissions?ok=inventory_saved");
}

export default async function RemissionsSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string; site_id?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const okMsg =
    sp.ok === "inventory_saved"
      ? "Conexión de remisiones con inventario actualizada."
      : sp.ok === "global_saved"
        ? "Áreas globales de remisión actualizadas."
        : sp.ok === "site_saved"
          ? "Excepción por sede guardada."
          : sp.ok === "site_reset"
            ? "Excepción eliminada. La sede usa configuración global."
            : "";
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
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

  const [
    { data: sitesData },
    { data: areaKindsData },
    { data: rulesData },
    { data: inventoryPostingSettingData },
  ] = await Promise.all([
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
    supabase
      .from("app_runtime_settings")
      .select("bool_value")
      .eq("app_id", APP_ID)
      .eq("setting_key", REMISSIONS_INVENTORY_POSTING_SETTING_KEY)
      .maybeSingle(),
  ]);

  const sites = (sitesData ?? []) as SiteRow[];
  const areaKinds = (areaKindsData ?? []) as AreaKindRow[];
  const siteRules = (rulesData ?? []) as SiteRuleRow[];
  const inventoryPostingSetting =
    inventoryPostingSettingData as RuntimeSettingRow | null;

  const inventoryPostingEnabled =
    typeof inventoryPostingSetting?.bool_value === "boolean"
      ? inventoryPostingSetting.bool_value
      : false;
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
  const globalEnabledAreaLabels = areaKinds
    .filter((kind) => globalEnabledSet.has(String(kind.code ?? "").trim()))
    .map((kind) => kind.name ?? kind.code)
    .filter(Boolean);

  const siteEnabledAreaLabels = areaKinds
    .filter((kind) => siteEnabledKinds.has(String(kind.code ?? "").trim()))
    .map((kind) => kind.name ?? kind.code)
    .filter(Boolean);

  const selectedSiteTypeLabel =
    selectedSite?.site_type === "production_center"
      ? "Centro de producción"
      : selectedSite?.site_type === "satellite"
        ? "Satélite"
        : selectedSite?.site_type || "Sin tipo";

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Configuración de remisiones</h1>
          <p className="mt-2 ui-body-muted">
            Controla cómo operan las remisiones: si afectan inventario real y qué áreas puede usar cada sede.
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ui-h3">Estado operativo</div>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Este es el control principal. Afecta creación, preparación, despacho, recepción y reversas.
            </p>
          </div>

          <span
            className={
              inventoryPostingEnabled
                ? "ui-chip ui-chip--success"
                : "ui-chip ui-chip--warn"
            }
          >
            {inventoryPostingEnabled ? "Inventario conectado" : "Inventario desconectado"}
          </span>
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-[var(--ui-text)]">
                Remisiones afectan inventario real
              </div>
              <p className="mt-1 max-w-3xl text-sm text-[var(--ui-muted)]">
                {inventoryPostingEnabled
                  ? "Las remisiones pueden validar stock, exigir LOC, descontar al despachar, sumar al recibir y permitir reversas."
                  : "Las remisiones funcionan como solicitudes operativas. No validan disponibilidad, no exigen LOC y no descuentan ni suman inventario."}
              </p>
            </div>

            <form action={saveInventoryPostingSetting}>
              <input
                type="hidden"
                name="inventory_posting_enabled"
                value={inventoryPostingEnabled ? "false" : "true"}
              />
              <button
                type="submit"
                className={
                  inventoryPostingEnabled
                    ? "ui-btn ui-btn--ghost"
                    : "ui-btn ui-btn--brand"
                }
              >
                {inventoryPostingEnabled ? "Desconectar inventario" : "Conectar inventario"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Configuración actual</div>
        <p className="mt-1 text-sm text-[var(--ui-muted)]">
          Resumen de lo que está activo ahora. Esta sección es solo lectura.
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
            <div className="ui-caption">Áreas globales activas</div>
            <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
              {globalEnabledAreaLabels.length
                ? globalEnabledAreaLabels.join(", ")
                : "Ninguna área global activa"}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
            <div className="ui-caption">Sede seleccionada</div>
            <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
              {selectedSite?.name ?? "Sin sede seleccionada"}
            </div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">
              {selectedSiteTypeLabel}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
            <div className="ui-caption">Áreas efectivas para la sede</div>
            <div className="mt-2 text-sm font-semibold text-[var(--ui-text)]">
              {siteEnabledAreaLabels.length
                ? siteEnabledAreaLabels.join(", ")
                : "Ninguna área activa para esta sede"}
            </div>
            <div className="mt-1 text-xs text-[var(--ui-muted)]">
              {hasOverride ? "Usa excepción propia" : "Usa configuración global"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Configuración avanzada · Áreas globales</div>
        <p className="mt-1 text-sm text-[var(--ui-muted)]">
          Estas áreas aplican a todas las sedes que no tengan una excepción propia.
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
            Guardar áreas globales
          </button>
        </form>
      </div>

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Configuración avanzada · Excepción por sede</div>
        <p className="mt-1 text-sm text-[var(--ui-muted)]">
          Usa esto solo cuando una sede necesite áreas distintas a la configuración global.
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
              Estado: {hasOverride ? "Excepción activa" : "Usando configuración global"}
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
                Guardar excepción de sede
              </button>
            </div>
          </form>
        ) : null}

        {selectedSiteId ? (
          <form action={clearSiteOverride} className="mt-3">
            <input type="hidden" name="site_id" value={selectedSiteId} />
            <button type="submit" className="ui-btn ui-btn--ghost">
              Eliminar excepción y usar global
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
