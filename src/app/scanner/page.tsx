import { ScannerPanel } from "@/features/scanner/scanner-panel";
import { requireAppAccess } from "@/lib/auth/guard";

type SearchParams = {
  site_id?: string;
};

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

export const dynamic = "force-dynamic";

export default async function ScannerPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/scanner",
    permissionCode: "access",
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("role,site_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data: employeeSites } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(20);

  const employeeSiteRows = (employeeSites ?? []) as EmployeeSiteRow[];
  const defaultSiteId = employeeSiteRows[0]?.site_id ?? String(employee?.site_id ?? "");
  const activeSiteId = String(sp.site_id ?? defaultSiteId).trim();
  const siteIds = employeeSiteRows
    .map((row) => row.site_id)
    .filter((id): id is string => Boolean(id));

  const { data: sites } = siteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", siteIds)
        .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  const siteRows = (sites ?? []) as SiteRow[];
  const activeSite = siteRows.find((site) => site.id === activeSiteId) ?? null;
  const siteType = String(activeSite?.site_type ?? "").toLowerCase();
  const normalizedRole = String(employee?.role ?? "").toLowerCase();
  const isManagementRole = ["propietario", "gerente_general", "admin", "manager", "gerente"].includes(
    normalizedRole
  );
  const isSatelliteFocusMode = siteType === "satellite" && !isManagementRole;
  const isProductionFocusMode = siteType === "production_center" && !isManagementRole;
  const mode = isSatelliteFocusMode
    ? "satellite"
    : isProductionFocusMode
      ? "center"
      : "general";
  const heroTitle =
    mode === "satellite"
      ? "Escanea y actúa en tu sede"
      : mode === "center"
        ? "Escanea y sigue con la operación"
        : "Scanner";
  const heroSubtitle =
    mode === "satellite"
      ? "Escanea un LOC y entra directo a retirar o revisar la ubicación, sin perder tiempo buscando pantallas."
      : mode === "center"
        ? "Escanea LOCs para entrar directo a retiro o ubicación. Menos búsqueda, más acción en piso."
        : "Escanea etiquetas LOC o pega el código para saltar rápido a la acción correcta desde celular o tablet.";
  const heroModeLabel =
    mode === "satellite" ? "Modo satelite" : mode === "center" ? "Modo Centro" : "Modo general";

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="ui-caption">{heroModeLabel}</div>
              <h1 className="ui-h1">{heroTitle}</h1>
              <p className="ui-body-muted max-w-2xl">{heroSubtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                QR
              </span>
              {activeSite?.name ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                  {activeSite.name}
                </span>
              ) : null}
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                LOC y AST
              </span>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">LOC</div>
              <div className="ui-remission-kpi-value">Actuar</div>
              <div className="ui-remission-kpi-note">Escanea, abre retiro o entra a la ubicación</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">AST</div>
              <div className="ui-remission-kpi-value">Identificar</div>
              <div className="ui-remission-kpi-note">Preparado para enlazar ficha técnica en VISO</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Modo</div>
              <div className="ui-remission-kpi-value">Táctil</div>
              <div className="ui-remission-kpi-note">Pensado para cámara o escáner tipo teclado</div>
            </article>
          </div>
        </div>
      </section>

      <ScannerPanel mode={mode} siteLabel={activeSite?.name ?? ""} />
    </div>
  );
}
