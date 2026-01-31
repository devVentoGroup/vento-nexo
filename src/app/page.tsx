import Link from "next/link";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";

import { requireAppAccess } from "@/lib/auth/guard";
import {
  canUseRoleOverride,
  checkPermissionWithRoleOverride,
  getRoleOverrideFromCookies,
} from "@/lib/auth/role-override";

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
  icon?: IconName;
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

type IconName =
  | "sparkles"
  | "package"
  | "scan"
  | "printer"
  | "boxes"
  | "arrows"
  | "map"
  | "layers"
  | "clipboard"
  | "badge"
  | "building"
  | "eye";

function Icon({ name, className }: { name?: IconName; className?: string }) {
  const common = "none";
  switch (name) {
    case "sparkles":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6" className={className}>
          <path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5L12 3z" />
          <path d="M5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
        </svg>
      );
    case "package":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6" className={className}>
          <path d="M21 8.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5" />
          <path d="M12 3 2 8l10 5 10-5-10-5z" />
          <path d="M12 13v8" />
        </svg>
      );
    case "scan":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6" className={className}>
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <path d="M7 12h10" />
        </svg>
      );
    case "printer":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6" className={className}>
          <path d="M7 8V4h10v4" />
          <path d="M6 17h12v3H6z" />
          <path d="M5 8h14a2 2 0 0 1 2 2v5H3v-5a2 2 0 0 1 2-2z" />
        </svg>
      );
    case "boxes":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6" className={className}>
          <path d="M3 7h7v7H3z" />
          <path d="M14 7h7v7h-7z" />
          <path d="M7 14v7" />
          <path d="M17 14v7" />
        </svg>
      );
    case "arrows":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6" className={className}>
          <path d="M7 7h11l-3-3" />
          <path d="M17 17H6l3 3" />
        </svg>
      );
    case "map":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6" className={className}>
          <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
          <path d="M9 3v15" />
          <path d="M15 6v15" />
        </svg>
      );
    case "layers":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6" className={className}>
          <path d="M12 3 2 8l10 5 10-5-10-5z" />
          <path d="M2 12l10 5 10-5" />
          <path d="M2 16l10 5 10-5" />
        </svg>
      );
    case "clipboard":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6" className={className}>
          <path d="M9 3h6a2 2 0 0 1 2 2v2H7V5a2 2 0 0 1 2-2z" />
          <path d="M7 7h10v14H7z" />
          <path d="M10 11h4" />
          <path d="M10 15h4" />
        </svg>
      );
    case "badge":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6" className={className}>
          <circle cx="12" cy="8" r="4" />
          <path d="M8 12l-2 9 6-3 6 3-2-9" />
        </svg>
      );
    case "building":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6" className={className}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 7h2M8 11h2M8 15h2M14 7h2M14 11h2M14 15h2" />
        </svg>
      );
    case "eye":
      return (
        <svg viewBox="0 0 24 24" fill={common} stroke="currentColor" strokeWidth="1.6" className={className}>
          <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    default:
      return null;
  }
}

function ActionCard({ action }: { action: ActionLink }) {
  const isPrimary = action.tone === "primary";
  const buttonClass = isPrimary
    ? "ui-btn ui-btn--brand"
    : "ui-btn ui-btn--ghost";

  return (
    <div className="ui-card">
      <div className="flex items-center gap-2 ui-h3">
        <Icon name={action.icon} className="h-5 w-5 text-[var(--ui-brand-600)]" />
        {action.title}
      </div>
      <p className="mt-1 ui-body-muted">{action.description}</p>
      <div className="mt-4">
        <Link href={action.href} className={buttonClass}>
          {action.cta}
        </Link>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  cta,
  href,
}: {
  title: string;
  description: string;
  cta?: string;
  href?: string;
}) {
  return (
    <div className="ui-empty-state">
      <Icon name="sparkles" />
      <div className="ui-h3">{title}</div>
      <div className="ui-body-muted">{description}</div>
      {cta && href ? (
        <Link href={href} className="ui-btn ui-btn--ghost">
          {cta}
        </Link>
      ) : null}
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
  const overrideRole = await getRoleOverrideFromCookies();
  const canOverrideRole = canUseRoleOverride(role, overrideRole);
  const effectiveRole = canOverrideRole ? String(overrideRole) : role;
  let roleLabel = effectiveRole || "sin rol";
  if (effectiveRole) {
    const { data: roleRow } = await supabase
      .from("roles")
      .select("name")
      .eq("code", effectiveRole)
      .single();
    roleLabel = roleRow?.name ?? effectiveRole;
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
      checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissions,
        context: { siteId: activeSiteId },
        actualRole: role,
      }),
      checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsRequest,
        context: { siteId: activeSiteId },
        actualRole: role,
      }),
      checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsPrepare,
        context: { siteId: activeSiteId },
        actualRole: role,
      }),
      checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsReceive,
        context: { siteId: activeSiteId },
        actualRole: role,
      }),
      checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.movements,
        context: { siteId: activeSiteId },
        actualRole: role,
      }),
      checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.stock,
        context: { siteId: activeSiteId },
        actualRole: role,
      }),
      checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.locations,
        context: { siteId: activeSiteId },
        actualRole: role,
      }),
      checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.lpns,
        context: { siteId: activeSiteId },
        actualRole: role,
      }),
    ]);
  }

  const viewLabel = !activeSiteId
    ? "Sin sede"
    : isProductionCenter
      ? "Bodega (Centro)"
      : isSatellite
        ? "Sede satélite"
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
      title: "Solicitar remisión",
      description: "Pide insumos desde sede satélite hacia el centro de producción.",
      href: "/inventory/remissions",
      cta: "Solicitar",
      tone: "primary",
      visible: canRequestRemission,
      icon: "package",
    },
    {
      id: "prepare-remissions",
      title: "Preparar remisiones",
      description: "Gestiona picking y despacho para sedes satélite.",
      href: "/inventory/remissions",
      cta: "Preparar",
      tone: "primary",
      visible: canPrepareRemission,
      icon: "package",
    },
    {
      id: "receive-remissions",
      title: "Recibir remisiones",
      description: "Confirma cantidades recibidas y reporta faltantes.",
      href: "/inventory/remissions",
      cta: "Recibir",
      tone: "primary",
      visible: canReceiveRemission,
      icon: "package",
    },
    {
      id: "remissions",
      title: "Ver remisiones",
      description: "Seguimiento de solicitudes y estados recientes.",
      href: "/inventory/remissions",
      cta: "Abrir",
      tone: "secondary",
      visible: canViewRemissions,
      icon: "package",
    },
    {
      id: "stock",
      title: "Stock por sede",
      description: "Consulta stock actual por SKU y sede.",
      href: "/inventory/stock",
      cta: "Abrir",
      tone: "secondary",
      visible: canViewStock,
      icon: "boxes",
    },
    {
      id: "movements",
      title: "Movimientos",
      description: "Ledger de inventario por sede y tipo de movimiento.",
      href: "/inventory/movements",
      cta: "Abrir",
      tone: "secondary",
      visible: canMovementsPermission,
      icon: "arrows",
    },
    {
      id: "scanner",
      title: "Scanner",
      description: "Escaneo rápido de LOC/LPN/AST.",
      href: "/scanner",
      cta: "Abrir",
      tone: "secondary",
      visible: true,
      icon: "scan",
    },
    {
      id: "printing",
      title: "Impresión",
      description: "Etiquetas Zebra para LOC, LPN, SKU y PROD.",
      href: "/printing/jobs",
      cta: "Abrir",
      tone: "secondary",
      visible: true,
      icon: "printer",
    },
    {
      id: "locations",
      title: "LOC",
      description: "Ubicaciones fisicas y zonas de almacen.",
      href: "/inventory/locations",
      cta: "Abrir",
      tone: "secondary",
      visible: canManageLocations,
      icon: "map",
    },
    {
      id: "lpns",
      title: "LPN",
      description: "Contenedores y contenido por LPN.",
      href: "/inventory/lpns",
      cta: "Abrir",
      tone: "secondary",
      visible: canManageLpns,
      icon: "layers",
    },
  ];

  const primaryActions = actions.filter((action) => action.visible && action.tone === "primary");
  const secondaryActions = actions.filter((action) => action.visible && action.tone !== "primary");

  return (
    <div className="w-full space-y-6">
      <div className="ui-panel ui-panel--halo">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="ui-caption">NEXO · Inventario</div>
            <h1 className="mt-2 ui-h1">
              Bienvenido, {displayName}
            </h1>
            <p className="mt-2 ui-body-muted">
              Panel operativo de inventario y logística, organizado por rol y sede.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 ui-caption">
              <span className="ui-chip">
                <Icon name="badge" className="h-3.5 w-3.5" />
                Rol: {roleLabel}
              </span>
              {canOverrideRole && overrideRole ? (
                <span className="ui-chip ui-chip--brand">
                  Modo prueba
                </span>
              ) : null}
              <span className="ui-chip">
                <Icon name="building" className="h-3.5 w-3.5" />
                Sede: {activeSiteName}
              </span>
              <span className="ui-chip">
                <Icon name="eye" className="h-3.5 w-3.5" />
                Vista: {viewLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/inventory/remissions"
              className="ui-btn ui-btn--ghost"
            >
              <Icon name="package" className="h-4 w-4" />
              Remisiones
            </Link>
            <Link
              href="/scanner"
              className="ui-btn ui-btn--brand"
            >
              <Icon name="scan" className="h-4 w-4" />
              Scanner
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Sede activa</div>
            <div className="mt-1 ui-caption">{activeSiteName || "Sin sede"}</div>
          </div>
          <form method="get" className="flex items-center gap-3">
            <select
              name="site_id"
              defaultValue={activeSiteId}
              className="ui-input"
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
            <button className="ui-btn ui-btn--ghost">
              Cambiar
            </button>
          </form>
        </div>

        {!activeSiteId ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            No hay sede activa. Asigna una sede al empleado para operar NEXO.
          </div>
        ) : null}
      </div>

      <div className="ui-panel">
        <div className="ui-section-title">
          <Icon name="sparkles" />
          Acciones clave
        </div>
        {primaryActions.length ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {primaryActions.map((action) => (
              <ActionCard key={action.id} action={action} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No hay acciones clave"
            description="Tu rol no tiene acciones asignadas en esta sede."
          />
        )}
      </div>

      <div className="ui-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="ui-section-title">
            <Icon name="sparkles" />
            Módulos
          </div>
          <div className="ui-caption">Accesos rápidos</div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {secondaryActions.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      </div>

      <div className="ui-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-section-title">
              <Icon name="package" />
              Remisiones recientes
            </div>
            <div className="mt-1 ui-body-muted">
              {isProductionCenter ? "Solicitudes para preparar" : "Solicitudes enviadas/recibidas"}
            </div>
          </div>
          <Link
            href="/inventory/remissions"
            className="ui-body font-semibold underline decoration-zinc-200 underline-offset-4"
          >
            Ver todas
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Origen</TableHeaderCell>
                <TableHeaderCell>Destino</TableHeaderCell>
                <TableHeaderCell>Acciones</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {remissionRows.map((row) => (
                <tr key={row.id} className="ui-body">
                  <TableCell className="font-mono">
                    {formatDate(row.created_at)}
                  </TableCell>
                  <TableCell>{statusLabel(row.status)}</TableCell>
                  <TableCell>
                    {siteMap.get(row.from_site_id ?? "")?.name ?? row.from_site_id ?? "-"}
                  </TableCell>
                  <TableCell>
                    {siteMap.get(row.to_site_id ?? "")?.name ?? row.to_site_id ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/inventory/remissions/${row.id}`}
                      className="ui-body font-semibold underline decoration-zinc-200 underline-offset-4"
                    >
                      Ver detalle
                    </Link>
                  </TableCell>
                </tr>
              ))}

              {!canViewRemissions ? (
                <tr>
                  <TableCell colSpan={5}>
                    <EmptyState
                      title="Sin permiso de remisiones"
                      description="Solicita acceso para consultar remisiones."
                    />
                  </TableCell>
                </tr>
              ) : !activeSiteId ? (
                <tr>
                  <TableCell colSpan={5}>
                    <EmptyState
                      title="Selecciona una sede"
                      description="Elige una sede para ver remisiones recientes."
                    />
                  </TableCell>
                </tr>
              ) : remissionRows.length === 0 ? (
                <tr>
                  <TableCell colSpan={5}>
                    <EmptyState
                      title="Sin remisiones recientes"
                      description="Cuando se creen solicitudes aparecerán aquí."
                      cta="Abrir remisiones"
                      href="/inventory/remissions"
                    />
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






