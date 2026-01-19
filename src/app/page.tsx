import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";

const PERMISSIONS = {
  remissions: "inventory.remissions",
  remissionsRequest: "inventory.remissions.request",
  remissionsPrepare: "inventory.remissions.prepare",
  remissionsReceive: "inventory.remissions.receive",
  locations: "inventory.locations",
  lpns: "inventory.lpns",
  movements: "inventory.movements",
  stock: "inventory.stock",
};

type SearchParams = {
  site_id?: string;
};

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type RemissionRow = {
  id: string;
  created_at: string | null;
  status: string | null;
  from_site_id: string | null;
  to_site_id: string | null;
};

type ActionLink = {
  id: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  tone?: "primary" | "secondary";
  visible?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "pendiente",
  preparing: "preparando",
  in_transit: "en_transito",
  received: "recibido",
  closed: "cerrado",
  cancelled: "cancelado",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  if (value.length >= 10) return value.slice(0, 10);
  return value;
}

function statusLabel(value?: string | null) {
  if (!value) return "-";
  return STATUS_LABELS[value] ?? value;
}

function ActionCard({ action }: { action: ActionLink }) {
  const isPrimary = action.tone === "primary";
  const buttonClass = isPrimary
    ? "inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
    : "inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50";

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="text-base font-semibold text-zinc-900">{action.title}</div>
      <p className="mt-1 text-sm leading-6 text-zinc-600">{action.description}</p>
      <div className="mt-4">
        <Link href={action.href} className={buttonClass}>
          {action.cta}
        </Link>
      </div>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/",
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("role,site_id,full_name,alias")
    .eq("id", user.id)
    .single();

  const role = String(employee?.role ?? "");
  let roleLabel = role || "sin rol";
  if (role) {
    const { data: roleRow } = await supabase
      .from("roles")
      .select("name")
      .eq("code", role)
      .single();
    roleLabel = roleRow?.name ?? role;
  }
  const displayName = String(employee?.alias ?? employee?.full_name ?? user.email ?? "Usuario");

  const { data: employeeSites } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(50);

  const employeeSiteRows = (employeeSites ?? []) as EmployeeSiteRow[];
  const defaultSiteId = employeeSiteRows[0]?.site_id ?? employee?.site_id ?? "";
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
  const siteMap = new Map(siteRows.map((site) => [site.id, site]));
  const activeSite = activeSiteId ? siteMap.get(activeSiteId) : undefined;
  const activeSiteName = activeSite?.name ?? activeSiteId ?? "Sin sede";
  const siteType = String(activeSite?.site_type ?? "");
  const isProductionCenter = siteType === "production_center";
  const isSatellite = siteType === "satellite";

  let canViewRemissions = false;
  let canRequestPermission = false;
  let canPreparePermission = false;
  let canReceivePermission = false;
  let canMovementsPermission = false;
  let canStockPermission = false;
  let canLocationsPermission = false;
  let canLpnsPermission = false;

  if (activeSiteId) {
    [
      canViewRemissions,
      canRequestPermission,
      canPreparePermission,
      canReceivePermission,
      canMovementsPermission,
      canStockPermission,
      canLocationsPermission,
      canLpnsPermission,
    ] = await Promise.all([
      checkPermission(supabase, APP_ID, PERMISSIONS.remissions, { siteId: activeSiteId }),
      checkPermission(supabase, APP_ID, PERMISSIONS.remissionsRequest, { siteId: activeSiteId }),
      checkPermission(supabase, APP_ID, PERMISSIONS.remissionsPrepare, { siteId: activeSiteId }),
      checkPermission(supabase, APP_ID, PERMISSIONS.remissionsReceive, { siteId: activeSiteId }),
      checkPermission(supabase, APP_ID, PERMISSIONS.movements, { siteId: activeSiteId }),
      checkPermission(supabase, APP_ID, PERMISSIONS.stock, { siteId: activeSiteId }),
      checkPermission(supabase, APP_ID, PERMISSIONS.locations, { siteId: activeSiteId }),
      checkPermission(supabase, APP_ID, PERMISSIONS.lpns, { siteId: activeSiteId }),
    ]);
  }

  const viewLabel = !activeSiteId
    ? "Sin sede"
    : isProductionCenter
      ? "Bodega (Centro)"
      : isSatellite
        ? "Sede satelite"
        : "Sede";

  const canRequestRemission = isSatellite && canRequestPermission;
  const canPrepareRemission = isProductionCenter && canPreparePermission;
  const canReceiveRemission = isSatellite && canReceivePermission;
  const canViewStock = canStockPermission;
  const canManageLocations = isProductionCenter && canLocationsPermission;
  const canManageLpns = isProductionCenter && canLpnsPermission;

  let remissionRows: RemissionRow[] = [];
  if (activeSiteId && canViewRemissions) {
    let remissionsQuery = supabase
      .from("restock_requests")
      .select("id,created_at,status,from_site_id,to_site_id")
      .order("created_at", { ascending: false })
      .limit(8);

    remissionsQuery = isProductionCenter
      ? remissionsQuery.eq("from_site_id", activeSiteId)
      : remissionsQuery.eq("to_site_id", activeSiteId);

    const { data: remissions } = await remissionsQuery;
    remissionRows = (remissions ?? []) as RemissionRow[];
  }

  const actions: ActionLink[] = [
    {
      id: "request-remission",
      title: "Solicitar remision",
      description: "Pide insumos desde sede satelite hacia el centro de produccion.",
      href: "/inventory/remissions",
      cta: "Solicitar",
      tone: "primary",
      visible: canRequestRemission,
    },
    {
      id: "prepare-remissions",
      title: "Preparar remisiones",
      description: "Gestiona picking y despacho para sedes satelite.",
      href: "/inventory/remissions",
      cta: "Preparar",
      tone: "primary",
      visible: canPrepareRemission,
    },
    {
      id: "receive-remissions",
      title: "Recibir remisiones",
      description: "Confirma cantidades recibidas y reporta faltantes.",
      href: "/inventory/remissions",
      cta: "Recibir",
      tone: "primary",
      visible: canReceiveRemission,
    },
    {
      id: "remissions",
      title: "Ver remisiones",
      description: "Seguimiento de solicitudes y estados recientes.",
      href: "/inventory/remissions",
      cta: "Abrir",
      tone: "secondary",
      visible: canViewRemissions,
    },
    {
      id: "stock",
      title: "Stock por sede",
      description: "Consulta stock actual por SKU y sede.",
      href: "/inventory/stock",
      cta: "Abrir",
      tone: "secondary",
      visible: canViewStock,
    },
    {
      id: "movements",
      title: "Movimientos",
      description: "Ledger de inventario por sede y tipo de movimiento.",
      href: "/inventory/movements",
      cta: "Abrir",
      tone: "secondary",
      visible: canMovementsPermission,
    },
    {
      id: "scanner",
      title: "Scanner",
      description: "Escaneo rapido de LOC/LPN/AST.",
      href: "/scanner",
      cta: "Abrir",
      tone: "secondary",
      visible: true,
    },
    {
      id: "printing",
      title: "Impresion",
      description: "Etiquetas Zebra para LOC, LPN, SKU y PROD.",
      href: "/printing/jobs",
      cta: "Abrir",
      tone: "secondary",
      visible: true,
    },
    {
      id: "locations",
      title: "LOC",
      description: "Ubicaciones fisicas y zonas de almacen.",
      href: "/inventory/locations",
      cta: "Abrir",
      tone: "secondary",
      visible: canManageLocations,
    },
    {
      id: "lpns",
      title: "LPN",
      description: "Contenedores y contenido por LPN.",
      href: "/inventory/lpns",
      cta: "Abrir",
      tone: "secondary",
      visible: canManageLpns,
    },
  ];

  const primaryActions = actions.filter((action) => action.visible && action.tone === "primary");
  const secondaryActions = actions.filter((action) => action.visible && action.tone !== "primary");

  return (
    <div className="w-full space-y-6 px-6 py-8">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-zinc-500">NEXO</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Bienvenido, {displayName}</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Panel operativo de inventario y logistica, organizado por rol y sede.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 ring-1 ring-inset ring-zinc-200">
                Rol: {roleLabel}
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 ring-1 ring-inset ring-zinc-200">
                Sede: {activeSiteName}
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 ring-1 ring-inset ring-zinc-200">
                Vista: {viewLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/inventory/remissions"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
            >
              Remisiones
            </Link>
            <Link
              href="/scanner"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Scanner
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Sede activa</div>
            <div className="mt-1 text-xs text-zinc-500">{activeSiteName || "Sin sede"}</div>
          </div>
          <form method="get" className="flex items-center gap-3">
            <select
              name="site_id"
              defaultValue={activeSiteId}
              className="h-10 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            >
              {employeeSiteRows.map((row) => {
                const siteId = row.site_id ?? "";
                if (!siteId) return null;
                const site = siteMap.get(siteId);
                const label = site?.name ? `${site.name}` : siteId;
                const suffix = row.is_primary ? " (principal)" : "";
                return (
                  <option key={siteId} value={siteId}>
                    {label}
                    {suffix}
                  </option>
                );
              })}
            </select>
            <button className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-3 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50">
              Cambiar
            </button>
          </form>
        </div>

        {!activeSiteId ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No hay sede activa. Asigna una sede al empleado para operar NEXO.
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Acciones clave</div>
        {primaryActions.length ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {primaryActions.map((action) => (
              <ActionCard key={action.id} action={action} />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            No hay acciones clave asignadas a tu rol en esta sede.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-zinc-900">Modulos</div>
          <div className="text-xs text-zinc-500">Accesos rapidos</div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {secondaryActions.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Remisiones recientes</div>
            <div className="mt-1 text-sm text-zinc-600">
              {isProductionCenter ? "Solicitudes para preparar" : "Solicitudes enviadas/recibidas"}
            </div>
          </div>
          <Link
            href="/inventory/remissions"
            className="text-sm font-semibold text-zinc-900 underline decoration-zinc-200 underline-offset-4"
          >
            Ver todas
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                <th className="border-b border-zinc-200 pb-2">Fecha</th>
                <th className="border-b border-zinc-200 pb-2">Estado</th>
                <th className="border-b border-zinc-200 pb-2">Origen</th>
                <th className="border-b border-zinc-200 pb-2">Destino</th>
                <th className="border-b border-zinc-200 pb-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {remissionRows.map((row) => (
                <tr key={row.id} className="text-sm text-zinc-800">
                  <td className="border-b border-zinc-100 py-3 font-mono">
                    {formatDate(row.created_at)}
                  </td>
                  <td className="border-b border-zinc-100 py-3">{statusLabel(row.status)}</td>
                  <td className="border-b border-zinc-100 py-3">
                    {siteMap.get(row.from_site_id ?? "")?.name ?? row.from_site_id ?? "-"}
                  </td>
                  <td className="border-b border-zinc-100 py-3">
                    {siteMap.get(row.to_site_id ?? "")?.name ?? row.to_site_id ?? "-"}
                  </td>
                  <td className="border-b border-zinc-100 py-3">
                    <Link
                      href={`/inventory/remissions/${row.id}`}
                      className="text-sm font-semibold text-zinc-900 underline decoration-zinc-200 underline-offset-4"
                    >
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}

              {!canViewRemissions ? (
                <tr>
                  <td colSpan={5} className="py-6 text-sm text-zinc-500">
                    No tienes permiso para ver remisiones.
                  </td>
                </tr>
              ) : !activeSiteId ? (
                <tr>
                  <td colSpan={5} className="py-6 text-sm text-zinc-500">
                    Selecciona una sede para ver remisiones recientes.
                  </td>
                </tr>
              ) : remissionRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-sm text-zinc-500">
                    No hay remisiones recientes para esta sede.
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
