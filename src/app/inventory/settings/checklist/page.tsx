import Link from "next/link";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type CheckResult = {
  ok: boolean;
  label: string;
  detail?: string;
  href: string;
};

export default async function ConfigChecklistPage() {
  const { supabase } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/settings/checklist",
    permissionCode: "inventory.stock",
  });

  const checks: CheckResult[] = [];

  const { count: sitesCount } = await supabase
    .from("sites")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  checks.push({
    ok: (sitesCount ?? 0) >= 2,
    label: "Sedes configuradas",
    detail: `${sitesCount ?? 0} sede(s) activa(s). Necesitas al menos Centro y un satélite.`,
    href: "/inventory/settings/sites",
  });

  const { count: routesCount } = await supabase
    .from("site_supply_routes")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  checks.push({
    ok: (routesCount ?? 0) > 0,
    label: "Rutas de abastecimiento",
    detail: `${routesCount ?? 0} ruta(s). Satélites → Centro.`,
    href: "/inventory/settings/supply-routes",
  });

  const { count: productSiteCount } = await supabase
    .from("product_site_settings")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  checks.push({
    ok: (productSiteCount ?? 0) > 0,
    label: "Insumos configurados por sede",
    detail: `${productSiteCount ?? 0} configuración(es). En ficha del producto → Sedes.`,
    href: "/inventory/catalog?tab=insumos",
  });

  const { data: centers } = await supabase
    .from("sites")
    .select("id")
    .eq("site_type", "production_center")
    .eq("is_active", true);
  const centerIds = (centers ?? []).map((c) => c.id);

  let locsCount = 0;
  if (centerIds.length > 0) {
    const { count } = await supabase
      .from("inventory_locations")
      .select("id", { count: "exact", head: true })
      .in("site_id", centerIds)
      .eq("is_active", true);
    locsCount = count ?? 0;
  }
  checks.push({
    ok: locsCount > 0,
    label: "LOCs en Centro",
    detail: `${locsCount} ubicación(es) en Centro de producción.`,
    href: "/inventory/locations",
  });

  const { count: stockCount } = await supabase
    .from("inventory_stock_by_site")
    .select("id", { count: "exact", head: true })
    .gt("current_qty", 0);
  checks.push({
    ok: (stockCount ?? 0) > 0,
    label: "Stock inicial cargado",
    detail: (stockCount ?? 0) > 0 ? "Hay stock en alguna sede." : "Carga stock con Entradas.",
    href: "/inventory/entries",
  });

  const completed = checks.filter((c) => c.ok).length;
  const total = checks.length;

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Configuración inicial</h1>
          <p className="mt-2 ui-body-muted">
            Checklist para dejar el inventario y remisiones listos.
          </p>
        </div>
        <Link href="/" className="ui-btn ui-btn--ghost">
          Ir al Panel
        </Link>
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-4 py-3">
        <span className="text-2xl font-bold text-[var(--ui-text)]">
          {completed}/{total}
        </span>
        <span className="text-sm text-[var(--ui-muted)]">
          {completed === total
            ? "Todo configurado."
            : "Completa los pasos pendientes."}
        </span>
      </div>

      <div className="mt-6 space-y-3">
        {checks.map((check, i) => (
          <Link
            key={i}
            href={check.href}
            className="flex items-center gap-4 rounded-xl border border-zinc-200/80 bg-white p-4 transition-colors hover:bg-zinc-50/50"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                check.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}
            >
              {check.ok ? "✓" : "—"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[var(--ui-text)]">{check.label}</div>
              {check.detail ? (
                <div className="mt-0.5 text-sm text-[var(--ui-muted)]">{check.detail}</div>
              ) : null}
            </div>
            <span className="text-sm text-[var(--ui-muted)]">→</span>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm text-[var(--ui-muted)]">
        <strong className="text-[var(--ui-text)]">Orden sugerido:</strong> Sedes → Rutas → Insumos por sede → LOCs → Entrada inicial. Ver{" "}
        <Link href="/inventory/remissions" className="font-medium underline">
          Remisiones
        </Link>{" "}
        cuando todo esté listo.
      </div>
    </div>
  );
}
