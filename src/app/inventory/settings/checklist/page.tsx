import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type CheckResult = {
  ok: boolean;
  label: string;
  detail?: string;
  href: string;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export default async function ConfigChecklistPage() {
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/settings/checklist",
  });

  const { data: emp } = await supabase.from("employees").select("role").eq("id", user.id).maybeSingle();
  const role = String((emp as { role?: string } | null)?.role ?? "").toLowerCase();
  const canUseChecklist = ["propietario", "gerente_general", "gerente", "bodeguero"].includes(role);

  if (!canUseChecklist) {
    return (
      <div className="w-full">
        <h1 className="ui-h1">Checklist operativo</h1>
        <div className="mt-6 ui-alert ui-alert--warn">
          Esta vista esta reservada para gestion operativa y bodega.
        </div>
      </div>
    );
  }

  const checks: CheckResult[] = [];

  const { data: activeSites } = await supabase
    .from("sites")
    .select("id,name,site_type")
    .eq("is_active", true)
    .neq("name", "App Review (Demo)");

  const siteRows = (activeSites ?? []) as Array<{
    id: string;
    name: string | null;
    site_type: string | null;
  }>;
  const centerSite = siteRows.find((site) => site.site_type === "production_center") ?? null;
  const saudoSite =
    siteRows.find((site) => site.site_type === "satellite" && normalizeText(site.name).includes("saudo")) ??
    null;

  checks.push({
    ok: Boolean(centerSite),
    label: "Centro activo",
    detail: centerSite
      ? `Centro listo: ${centerSite.name ?? centerSite.id}.`
      : "Necesitas una sede activa tipo production_center para operar inventario.",
    href: "/inventory/settings/sites",
  });

  checks.push({
    ok: Boolean(saudoSite),
    label: "Saudo activo",
    detail: saudoSite
      ? `Satelite listo: ${saudoSite.name ?? saudoSite.id}.`
      : "Saudo es el primer satelite operativo esperado.",
    href: "/inventory/settings/sites",
  });

  const { count: routeCount } =
    centerSite && saudoSite
      ? await supabase
          .from("site_supply_routes")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .eq("requesting_site_id", saudoSite.id)
          .eq("fulfillment_site_id", centerSite.id)
      : { count: 0 };
  checks.push({
    ok: (routeCount ?? 0) > 0,
    label: "Ruta Saudo -> Centro",
    detail:
      (routeCount ?? 0) > 0
        ? "Saudo ya tiene abastecedor configurado hacia Centro."
        : "Configura la ruta activa de abastecimiento entre Saudo y Centro.",
    href: "/inventory/settings/supply-routes",
  });

  const { count: productSiteCount } =
    centerSite && saudoSite
      ? await supabase
          .from("product_site_settings")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .in("site_id", [centerSite.id, saudoSite.id])
      : await supabase
          .from("product_site_settings")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true);
  checks.push({
    ok: (productSiteCount ?? 0) > 0,
    label: "Catalogo habilitado para operacion",
    detail: `${productSiteCount ?? 0} configuracion(es) activas entre Centro y Saudo.`,
    href: "/inventory/catalog?tab=insumos",
  });

  const { count: locsCount } = centerSite
    ? await supabase
        .from("inventory_locations")
        .select("id", { count: "exact", head: true })
        .eq("site_id", centerSite.id)
        .eq("is_active", true)
    : { count: 0 };
  checks.push({
    ok: (locsCount ?? 0) > 0,
    label: "LOCs en Centro",
    detail: `${locsCount ?? 0} ubicacion(es) activas en el Centro.`,
    href: "/inventory/locations",
  });

  const { count: stockCount } = centerSite
    ? await supabase
        .from("inventory_stock_by_site")
        .select("id", { count: "exact", head: true })
        .eq("site_id", centerSite.id)
        .gt("current_qty", 0)
    : { count: 0 };
  checks.push({
    ok: (stockCount ?? 0) > 0,
    label: "Stock inicial en Centro",
    detail:
      (stockCount ?? 0) > 0
        ? "Centro ya tiene stock cargado para arrancar remisiones."
        : "Carga stock inicial del Centro con entradas manuales.",
    href: "/inventory/entries",
  });

  const completed = checks.filter((c) => c.ok).length;
  const total = checks.length;

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Configuracion inicial operativa</h1>
          <p className="mt-2 ui-body-muted">
            Checklist para dejar Centro + Saudo listos para operar inventario y remisiones.
          </p>
        </div>
        <Link href="/" className="ui-btn ui-btn--ghost">
          Ir al panel
        </Link>
      </div>

      <div className="mt-6 flex items-center gap-3 ui-panel-soft px-4 py-3">
        <span className="text-2xl font-bold text-[var(--ui-text)]">{completed}/{total}</span>
        <span className="text-sm text-[var(--ui-muted)]">
          {completed === total ? "Todo configurado para operar." : "Completa los pasos pendientes para salir a operar."}
        </span>
      </div>

      <div className="mt-6 space-y-3">
        {checks.map((check, i) => (
          <Link
            key={i}
            href={check.href}
            className="flex items-center gap-4 ui-panel p-4 transition-colors hover:bg-[var(--ui-surface-2)]"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                check.ok ? "ui-chip ui-chip--success" : "ui-chip ui-chip--warn"
              }`}
            >
              {check.ok ? "OK" : "!"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[var(--ui-text)]">{check.label}</div>
              {check.detail ? <div className="mt-0.5 text-sm text-[var(--ui-muted)]">{check.detail}</div> : null}
            </div>
            <span className="text-sm text-[var(--ui-muted)]">-&gt;</span>
          </Link>
        ))}
      </div>

      <div className="mt-8 ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
        <strong className="text-[var(--ui-text)]">Orden sugerido:</strong> Centro -&gt; Saudo -&gt; Ruta Saudo/Centro -&gt; Catalogo por sede -&gt; LOCs del Centro -&gt; Entrada inicial. Ver{" "}
        <Link href="/inventory/remissions" className="font-medium underline">
          Remisiones
        </Link>{" "}
        cuando el checklist quede en verde.
      </div>
    </div>
  );
}
