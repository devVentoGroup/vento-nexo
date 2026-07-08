import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type Params = { id: string };

function formatQty(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(n);
}

function buildLocTitle(loc: {
  description?: string | null;
  zone?: string | null;
  code?: string | null;
  id: string;
}) {
  const description = String(loc.description ?? "").trim();
  const zone = String(loc.zone ?? "").trim();
  const code = String(loc.code ?? "").trim();
  return description || zone || code || loc.id;
}

function normalizeProductRelation(
  value:
    | {
        id: string;
        name: string | null;
        stock_unit_code: string | null;
        unit: string | null;
        image_url?: string | null;
        catalog_image_url?: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        stock_unit_code: string | null;
        unit: string | null;
        image_url?: string | null;
        catalog_image_url?: string | null;
      }>
    | null
    | undefined
) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const MANAGEMENT_ROLES = new Set(["propietario", "gerente_general", "admin", "manager", "gerente"]);

const LOCATION_RUNTIME_SETTING_SPECS = [
  {
    id: "inventory_real_enabled",
    label: "Inventario real activo",
    shortLabel: "Inventario real",
    description:
      "El stock de este LOC ya está contado y puede tratarse como fuente confiable para movimientos reales.",
    defaultEnabled: false,
    requiresInventory: false,
  },
  {
    id: "remissions_posting_enabled",
    label: "Remisiones descuentan desde este LOC",
    shortLabel: "Remisiones",
    description:
      "Permite que una remisión preparada desde este LOC genere descuento real de inventario cuando el modo global esté activo.",
    defaultEnabled: false,
    requiresInventory: true,
  },
  {
    id: "production_consumption_enabled",
    label: "Producción descuenta insumos desde este LOC",
    shortLabel: "Producción",
    description:
      "Permite que FOGO consuma inventario real desde este LOC. Mantener apagado mientras producción siga operativa sin descuento.",
    defaultEnabled: false,
    requiresInventory: true,
  },
  {
    id: "manual_withdraw_enabled",
    label: "Retiro manual permitido",
    shortLabel: "Retiros",
    description:
      "Permite registrar salidas manuales desde este LOC. Se deja activo por defecto para no frenar operación.",
    defaultEnabled: true,
    requiresInventory: false,
  },
] as const;

type LocationRuntimeSettingId = (typeof LOCATION_RUNTIME_SETTING_SPECS)[number]["id"];

function isManagementRoleValue(value: string | null | undefined) {
  return MANAGEMENT_ROLES.has(String(value ?? "").toLowerCase());
}

function buildLocationRuntimeSettingKey(locationId: string, settingId: string) {
  return `locations.${locationId}.${settingId}`;
}

function settingErrorMessage(code: string | undefined) {
  if (code === "runtime_setting_forbidden") return "No tienes permisos para cambiar el control operativo del LOC.";
  if (code === "runtime_setting_invalid") return "Control operativo inválido.";
  if (code === "runtime_setting_failed") return "No se pudo guardar el control operativo del LOC.";
  return "";
}

async function updateLocationRuntimeSetting(formData: FormData) {
  "use server";

  const locationId = String(formData.get("location_id") ?? "").trim();
  const settingId = String(formData.get("setting_id") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const allowedSettingIds = LOCATION_RUNTIME_SETTING_SPECS.map((setting) => setting.id as string);

  if (!locationId || !allowedSettingIds.includes(settingId)) {
    redirect("/inventory/locations?error=runtime_setting_invalid");
  }

  const returnTo = `/inventory/locations/${encodeURIComponent(locationId)}`;
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo,
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!isManagementRoleValue(employee?.role)) {
    redirect(`${returnTo}?error=runtime_setting_forbidden`);
  }

  const settingKey = buildLocationRuntimeSettingKey(locationId, settingId);
  const { data: existing } = await supabase
    .from("app_runtime_settings")
    .select("setting_key")
    .eq("app_id", "nexo")
    .eq("setting_key", settingKey)
    .maybeSingle();

  const payload = {
    bool_value: enabled,
    text_value: null,
    number_value: null,
    updated_by: user.id,
  };

  const result = existing
    ? await supabase
        .from("app_runtime_settings")
        .update(payload)
        .eq("app_id", "nexo")
        .eq("setting_key", settingKey)
    : await supabase.from("app_runtime_settings").insert({
        app_id: "nexo",
        setting_key: settingKey,
        ...payload,
      });

  if (result.error) {
    redirect(`${returnTo}?error=runtime_setting_failed`);
  }

  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=runtime_setting_updated`);
}

export default async function LocationLandingPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: `/inventory/locations/${id}`,
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("role,site_id")
    .eq("id", user.id)
    .maybeSingle();
  const { data: settings } = await supabase
    .from("employee_settings")
    .select("selected_site_id")
    .eq("employee_id", user.id)
    .maybeSingle();

  const activeSiteId = settings?.selected_site_id ?? employee?.site_id ?? "";
  const normalizedRole = String(employee?.role ?? "").toLowerCase();
  const isManagementRole = ["propietario", "gerente_general", "admin", "manager", "gerente"].includes(
    normalizedRole
  );

  const { data: locationData } = await supabase
    .from("inventory_locations")
    .select("id,code,zone,description,site_id")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  const location = (locationData ?? null) as {
    id: string;
    code: string | null;
    zone: string | null;
    description: string | null;
    site_id: string | null;
  } | null;

  if (!location) notFound();

  const { data: siteData } = location.site_id
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .eq("id", location.site_id)
        .maybeSingle()
    : { data: null };

  const site = (siteData ?? null) as { id: string; name: string | null; site_type: string | null } | null;
  const siteType = String(site?.site_type ?? "").toLowerCase();
  const mode = !isManagementRole && siteType === "satellite"
    ? "satellite"
    : !isManagementRole && siteType === "production_center"
      ? "center"
      : "general";

  const { data: stockRowsData } = await supabase
    .from("inventory_stock_by_location")
    .select(
      "product_id,current_qty,products(id,name,stock_unit_code,unit,image_url,catalog_image_url)"
    )
    .eq("location_id", id)
    .gt("current_qty", 0)
    .order("current_qty", { ascending: false })
    .limit(12);

  const stockRowsRaw = (stockRowsData ?? []) as unknown as Array<{
    product_id: string;
    current_qty: number | null;
    products: {
      id: string;
      name: string | null;
      stock_unit_code: string | null;
      unit: string | null;
      image_url?: string | null;
      catalog_image_url?: string | null;
    } | Array<{
      id: string;
      name: string | null;
      stock_unit_code: string | null;
      unit: string | null;
      image_url?: string | null;
      catalog_image_url?: string | null;
    }> | null;
  }>;
  const stockRows = stockRowsRaw.map((row) => ({
    ...row,
    products: normalizeProductRelation(row.products),
  }));

  const totalQty = stockRows.reduce((sum, row) => sum + Number(row.current_qty ?? 0), 0);
  const title = buildLocTitle(location);
  const siteMismatch = Boolean(activeSiteId && location.site_id && activeSiteId !== location.site_id);
  const canManageLocationRuntime = isManagementRoleValue(employee?.role);

  const runtimeSettingKeys = LOCATION_RUNTIME_SETTING_SPECS.map((setting) =>
    buildLocationRuntimeSettingKey(location.id, setting.id)
  );
  const { data: runtimeSettingsData } = await supabase
    .from("app_runtime_settings")
    .select("setting_key,bool_value")
    .eq("app_id", "nexo")
    .in("setting_key", runtimeSettingKeys);

  const runtimeSettingsByKey = new Map(
    ((runtimeSettingsData ?? []) as Array<{ setting_key: string; bool_value: boolean | null }>).map(
      (setting) => [setting.setting_key, setting.bool_value] as const
    )
  );

  const getRuntimeSettingValue = (settingId: LocationRuntimeSettingId) => {
    const spec = LOCATION_RUNTIME_SETTING_SPECS.find((setting) => setting.id === settingId);
    const key = buildLocationRuntimeSettingKey(location.id, settingId);
    const storedValue = runtimeSettingsByKey.get(key);
    return typeof storedValue === "boolean" ? storedValue : Boolean(spec?.defaultEnabled);
  };

  const inventoryRealEnabled = getRuntimeSettingValue("inventory_real_enabled");
  const locationRuntimeSettings = LOCATION_RUNTIME_SETTING_SPECS.map((setting) => {
    const enabled = getRuntimeSettingValue(setting.id);
    const effectiveEnabled = setting.requiresInventory ? inventoryRealEnabled && enabled : enabled;
    return { ...setting, enabled, effectiveEnabled };
  });
  const withdrawHref = `/inventory/withdraw?loc_id=${encodeURIComponent(location.id)}${
    location.site_id ? `&site_id=${encodeURIComponent(location.site_id)}` : ""
  }`;
  const boardHref = `/inventory/locations/${encodeURIComponent(location.id)}/board`;
  const positionsHref = `/inventory/locations/${encodeURIComponent(location.id)}/positions`;
  const zoneHref =
    location.site_id && location.zone
      ? `/inventory/locations/zone?site_id=${encodeURIComponent(location.site_id)}&zone=${encodeURIComponent(location.zone)}`
      : "";
  const okMsg = sp.ok === "withdraw"
    ? "Retiro registrado."
    : sp.ok === "runtime_setting_updated"
      ? "Control operativo actualizado."
      : "";
  const errorMsg = settingErrorMessage(sp.error);

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link href="/inventory/locations" className="ui-caption underline">
                Volver a áreas
              </Link>
              <div className="ui-caption">
                {mode === "center" ? "Modo Centro" : mode === "satellite" ? "Modo satelite" : "Ubicación operativa"}
              </div>
              <h1 className="ui-h1">{title}</h1>
              <p className="ui-body-muted">
                Este landing sirve para bodega y producción. Retiro y remisión son flujos distintos: retirar sirve para
                sacar producto de esta área hacia producción, consumo interno u otro uso controlado; la remisión se
                prepara y descuenta desde el flujo de despacho.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {site?.name ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                  {site.name}
                </span>
              ) : null}
              {location.zone ? (
                <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                  Zona {location.zone}
                </span>
              ) : null}
              {location.code ? (
                <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                  {location.code}
                </span>
              ) : null}
            </div>
            <div className={`grid gap-3 ${zoneHref ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"}`}>
              <Link href={withdrawHref} className="ui-btn ui-btn--brand h-16 w-full text-base font-semibold">
                Registrar salida
              </Link>
              <Link href={boardHref} className="ui-btn ui-btn--ghost h-16 w-full text-base font-semibold">
                Ver contenido
              </Link>
              <Link href={positionsHref} className="ui-btn ui-btn--ghost h-16 w-full text-base font-semibold">
                Detalle interno
              </Link>
              {zoneHref ? (
                <Link href={zoneHref} className="ui-btn ui-btn--ghost h-16 w-full text-base font-semibold">
                  Ver zona
                </Link>
              ) : null}
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Productos</div>
              <div className="ui-remission-kpi-value">{stockRows.length}</div>
              <div className="ui-remission-kpi-note">Disponible en esta área</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Qty visible</div>
              <div className="ui-remission-kpi-value">{formatQty(totalQty)}</div>
              <div className="ui-remission-kpi-note">Suma de cantidades visibles</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Acción</div>
              <div className="ui-remission-kpi-value">Área</div>
              <div className="ui-remission-kpi-note">Bodega y producción entran desde aquí</div>
            </article>
          </div>
        </div>
      </section>

      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      {errorMsg ? <div className="ui-alert ui-alert--error">{errorMsg}</div> : null}

      {siteMismatch ? (
        <div className="ui-alert ui-alert--warn">
          Esta área pertenece a otra sede distinta a tu sede activa. El botón de salida ya abrirá la sede correcta.
        </div>
      ) : null}

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-1 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="ui-h3">Control operativo del LOC</div>
            <div className="mt-1 ui-body-muted">
              Este bloque prepara la activación gradual: primero se marca qué áreas ya tienen inventario confiable;
              después remisiones, retiros y producción pueden leer estas banderas para descontar solo donde corresponda.
            </div>
          </div>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
              inventoryRealEnabled
                ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {inventoryRealEnabled ? "Inventario confiable" : "Modo operativo"}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {locationRuntimeSettings.map((setting) => {
            const isEffectivelyEnabled = setting.effectiveEnabled;
            const isBlockedByInventory = Boolean(setting.requiresInventory && !inventoryRealEnabled);
            return (
              <article
                key={setting.id}
                className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm"
              >
                <div className="flex min-h-[116px] flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-[var(--ui-text)]">
                        {setting.shortLabel}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          isEffectivelyEnabled
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {isEffectivelyEnabled ? "Activo" : "Apagado"}
                      </span>
                    </div>
                    <div className="mt-2 text-xs leading-relaxed text-[var(--ui-muted)]">
                      {setting.description}
                    </div>
                    {isBlockedByInventory ? (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-950">
                        Requiere activar inventario real en este LOC.
                      </div>
                    ) : null}
                  </div>

                  <form action={updateLocationRuntimeSetting}>
                    <input type="hidden" name="location_id" value={location.id} />
                    <input type="hidden" name="setting_id" value={setting.id} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={setting.enabled ? "false" : "true"}
                    />
                    <button
                      type="submit"
                      disabled={!canManageLocationRuntime}
                      className="ui-btn ui-btn--ghost h-10 w-full text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      title={
                        canManageLocationRuntime
                          ? setting.enabled
                            ? "Apagar control operativo"
                            : "Activar control operativo"
                          : "Solo gerencia/admin puede cambiar este control"
                      }
                    >
                      {setting.enabled ? "Apagar" : "Activar"}
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <strong>Lectura operativa:</strong>{" "}
          {inventoryRealEnabled
            ? "este LOC puede entrar al piloto de inventario real. Activa remisiones o producción solo cuando el conteo interno esté validado."
            : "este LOC sigue funcionando para operación visual y registro, pero no debe descontar inventario real todavía."}
        </div>
      </section>

      <section className="ui-panel ui-remission-section ui-fade-up ui-delay-2 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Vista rápida del área</div>
            <div className="mt-1 ui-body-muted">
              Un vistazo corto a lo que hoy tiene este espacio. Para ver todo el contenido, entra al board.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`${boardHref}?kiosk=1`} className="ui-btn ui-btn--ghost">
              Abrir vista fija
            </Link>
            {zoneHref ? (
              <Link href={`${zoneHref}&kiosk=1`} className="ui-btn ui-btn--ghost">
                Abrir zona
              </Link>
            ) : null}
          </div>
        </div>

        {stockRows.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {stockRows.map((row) => {
              const product = row.products;
              const imageUrl = product?.image_url || product?.catalog_image_url || "";
              return (
                <article
                  key={row.product_id}
                  className="overflow-hidden rounded-3xl border border-[var(--ui-border)] bg-white shadow-sm"
                >
                  <div className="flex gap-3 p-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--ui-bg-soft)]">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imageUrl}
                          alt={product?.name ?? "Producto"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-semibold text-[var(--ui-muted)]">Sin foto</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-sm font-semibold text-[var(--ui-text)]">
                        {product?.name ?? row.product_id}
                      </div>
                      <div className="mt-2 text-sm text-[var(--ui-muted)]">
                        {formatQty(row.current_qty)} {product?.stock_unit_code ?? product?.unit ?? "un"}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="ui-panel-soft p-5 text-sm text-[var(--ui-muted)]">
            Esta área no tiene stock visible en este momento.
          </div>
        )}
      </section>
    </div>
  );
}
