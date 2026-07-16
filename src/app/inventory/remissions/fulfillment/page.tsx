import Link from "next/link";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";
import { checkOperationalSessionPermission } from "@/lib/auth/operational-session";
import {
  buildOperationalBlockMessage,
  checkOperationalPermission,
  getOperationalContext,
} from "@/lib/auth/operational-context";
import { normalizeOperationalAreaKind } from "../operational-area-scope";
import { createShipmentFromReady, markFulfillmentReady } from "./actions";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSIONS = {
  prepare: "inventory.remissions.prepare",
  transit: "inventory.remissions.transit",
  allSites: "inventory.remissions.all_sites",
};

const ACTIVE_STATUSES = [
  "pending",
  "preparing",
  "partially_ready",
  "ready",
  "allocated",
  "blocked",
];

type QueueMode = "all" | "stock" | "production";

type SearchParams = {
  site_id?: string;
  area_kind?: string;
  mode?: string;
};

type SiteOption = {
  id: string;
  name: string | null;
};

type AreaRow = {
  name: string | null;
  kind: string | null;
};

type RouteScopeRow = {
  preparing_area_kind: string | null;
};

type Fulfillment = {
  id: string;
  from_site_id: string;
  to_site_id: string;
  status: string;
  supply_mode: string | null;
  production_execution_mode: string | null;
  preparing_area_kind: string | null;
  requested_base_qty: number;
  ready_base_qty: number;
  allocated_base_qty: number;
  shortage_reason: string | null;
  products: { name: string | null } | null;
  from_site: { name: string | null } | null;
  to_site: { name: string | null } | null;
  restock_request_items: {
    request_policy_label: string | null;
    stock_unit_code: string | null;
  } | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  preparing: "En preparación",
  partially_ready: "Parcialmente lista",
  ready: "Lista",
  allocated: "Asignada a carga",
  blocked: "Bloqueada",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function normalizeMode(value: unknown): QueueMode {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "stock") return "stock";
  if (normalized === "production") return "production";
  return "all";
}

function areaLabel(value: string | null): string {
  const normalized = normalizeOperationalAreaKind(value);
  if (!normalized) return "Área sin configurar";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

function modeLabel(row: Fulfillment): string {
  if (row.supply_mode === "production") {
    return row.production_execution_mode === "recipe"
      ? "Producción por receta"
      : "Producción simple";
  }
  if (row.supply_mode === "stock") return "Salida de stock";
  return "Modo sin configurar";
}

function buildQueueHref(params: {
  siteId: string;
  areaKind: string;
  mode: QueueMode;
}): string {
  const search = new URLSearchParams();
  if (params.siteId) search.set("site_id", params.siteId);
  if (params.areaKind) search.set("area_kind", params.areaKind);
  if (params.mode !== "all") search.set("mode", params.mode);
  const qs = search.toString();
  return `/inventory/remissions/fulfillment${qs ? `?${qs}` : ""}`;
}

export default async function FulfillmentBoardPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const activeMode = normalizeMode(sp.mode);

  const { supabase, user, operationalSession } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/remissions/fulfillment",
  });

  const isSharedDevice = operationalSession.isSharedDevice;
  const { data: employee } = isSharedDevice
    ? { data: null }
    : await supabase
        .from("employees")
        .select("role,site_id")
        .eq("id", user.id)
        .maybeSingle();
  const actualRole = String(operationalSession.role ?? employee?.role ?? "");

  const canViewAll = isSharedDevice
    ? false
    : await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.allSites,
        actualRole,
      });

  const { data: settings } = isSharedDevice
    ? { data: null }
    : await supabase
        .from("employee_settings")
        .select("selected_site_id")
        .eq("employee_id", user.id)
        .maybeSingle();

  let siteOptions: SiteOption[] = [];
  if (canViewAll) {
    const { data: capabilityRows } = await supabase
      .from("site_operational_capabilities")
      .select("site_id")
      .eq("can_fulfill_remissions", true);
    const siteIds = Array.from(
      new Set(
        (capabilityRows ?? [])
          .map((row) => String(row.site_id ?? "").trim())
          .filter(Boolean),
      ),
    );
    const { data: sites } = siteIds.length
      ? await supabase
          .from("sites")
          .select("id,name")
          .in("id", siteIds)
          .order("name")
      : { data: [] as SiteOption[] };
    siteOptions = (sites ?? []) as SiteOption[];
  } else {
    const automaticSiteId = isSharedDevice
      ? String(operationalSession.siteId ?? "").trim()
      : String(settings?.selected_site_id ?? employee?.site_id ?? "").trim();
    const { data: site } = automaticSiteId
      ? await supabase
          .from("sites")
          .select("id,name")
          .eq("id", automaticSiteId)
          .maybeSingle()
      : { data: null };
    siteOptions = site ? [site as SiteOption] : [];
  }

  const requestedSiteId = String(sp.site_id ?? "").trim();
  const preferredSiteId = isSharedDevice
    ? String(operationalSession.siteId ?? "").trim()
    : String(settings?.selected_site_id ?? employee?.site_id ?? "").trim();
  const selectedSiteId = canViewAll
    ? siteOptions.some((site) => site.id === requestedSiteId)
      ? requestedSiteId
      : siteOptions.some((site) => site.id === preferredSiteId)
        ? preferredSiteId
        : (siteOptions[0]?.id ?? "")
    : (siteOptions[0]?.id ?? "");
  const selectedSite = siteOptions.find((site) => site.id === selectedSiteId);

  if (!selectedSiteId) {
    return (
      <div className="ui-scene w-full space-y-4">
        <Link href="/inventory/remissions" className="ui-caption underline">
          Volver a remisiones
        </Link>
        <div className="ui-alert ui-alert--warn">
          No hay una sede habilitada para cumplir remisiones.
        </div>
      </div>
    );
  }

  let activeAreaId: string | null = operationalSession.areaId;
  let automaticAreaKind = "";
  let operationalBlockMessage = "";

  if (isSharedDevice) {
    const { data: area } = activeAreaId
      ? await supabase
          .from("areas")
          .select("kind,site_id")
          .eq("id", activeAreaId)
          .maybeSingle()
      : { data: null };
    if (String(area?.site_id ?? "") === selectedSiteId) {
      automaticAreaKind = normalizeOperationalAreaKind(area?.kind);
    }
  } else if (!canViewAll) {
    const opContext = await getOperationalContext({
      supabase,
      employeeId: user.id,
      siteId: selectedSiteId,
      appCode: APP_ID,
    });
    if (!opContext?.can_operate) {
      operationalBlockMessage = buildOperationalBlockMessage(
        opContext,
        "No puedes preparar remisiones en este momento para esta sede.",
      );
    } else {
      activeAreaId = opContext.active_area_id;
      automaticAreaKind = normalizeOperationalAreaKind(
        opContext.active_area_kind,
      );
    }
  }

  const canPrepare = isSharedDevice
    ? await checkOperationalSessionPermission({
        supabase,
        session: operationalSession,
        appId: APP_ID,
        code: PERMISSIONS.prepare,
      })
    : canViewAll
      ? await checkPermissionWithRoleOverride({
          supabase,
          appId: APP_ID,
          code: PERMISSIONS.prepare,
          context: { siteId: selectedSiteId },
          actualRole,
        })
      : await checkOperationalPermission({
          supabase,
          permissionCode: `${APP_ID}.${PERMISSIONS.prepare}`,
          siteId: selectedSiteId,
          areaId: activeAreaId,
          appCode: APP_ID,
        });

  const canTransit = isSharedDevice
    ? await checkOperationalSessionPermission({
        supabase,
        session: operationalSession,
        appId: APP_ID,
        code: PERMISSIONS.transit,
      })
    : canViewAll
      ? await checkPermissionWithRoleOverride({
          supabase,
          appId: APP_ID,
          code: PERMISSIONS.transit,
          context: { siteId: selectedSiteId },
          actualRole,
        })
      : await checkOperationalPermission({
          supabase,
          permissionCode: `${APP_ID}.${PERMISSIONS.transit}`,
          siteId: selectedSiteId,
          areaId: activeAreaId,
          appCode: APP_ID,
        });

  const [{ data, error }, { data: areaRowsData }, { data: routeScopeData }] =
    await Promise.all([
      supabase
        .from("restock_item_fulfillments")
        .select(
          "id,from_site_id,to_site_id,status,supply_mode,production_execution_mode,preparing_area_kind,requested_base_qty,ready_base_qty,allocated_base_qty,shortage_reason,products(name),from_site:sites!restock_item_fulfillments_from_site_id_fkey(name),to_site:sites!restock_item_fulfillments_to_site_id_fkey(name),restock_request_items(request_policy_label,stock_unit_code)",
        )
        .eq("from_site_id", selectedSiteId)
        .in("status", ACTIVE_STATUSES)
        .order("created_at")
        .limit(500),
      supabase
        .from("areas")
        .select("name,kind")
        .eq("site_id", selectedSiteId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("product_fulfillment_routes")
        .select("preparing_area_kind")
        .eq("from_site_id", selectedSiteId)
        .eq("is_active", true),
    ]);
  if (error) throw new Error(error.message);

  const allRows = (data ?? []) as unknown as Fulfillment[];
  const areaRows = (areaRowsData ?? []) as AreaRow[];
  const routeScopeRows = (routeScopeData ?? []) as RouteScopeRow[];
  const areaNameByKind = new Map<string, string>();
  for (const row of areaRows) {
    const kind = normalizeOperationalAreaKind(row.kind);
    if (!kind || areaNameByKind.has(kind)) continue;
    areaNameByKind.set(kind, String(row.name ?? "").trim() || areaLabel(kind));
  }

  const availableAreaKinds = Array.from(
    new Set(
      [
        ...routeScopeRows.map((row) => row.preparing_area_kind),
        ...allRows.map((row) => row.preparing_area_kind),
        automaticAreaKind,
      ]
        .map(normalizeOperationalAreaKind)
        .filter(Boolean),
    ),
  ).sort((a, b) =>
    (areaNameByKind.get(a) ?? areaLabel(a)).localeCompare(
      areaNameByKind.get(b) ?? areaLabel(b),
      "es",
      { sensitivity: "base" },
    ),
  );

  const requestedAreaKind = normalizeOperationalAreaKind(sp.area_kind);
  const selectedAreaKind = canViewAll
    ? availableAreaKinds.includes(requestedAreaKind)
      ? requestedAreaKind
      : availableAreaKinds.length === 1
        ? (availableAreaKinds[0] ?? "")
        : ""
    : automaticAreaKind;

  const matchesMode = (row: Fulfillment) =>
    activeMode === "all" || row.supply_mode === activeMode;
  const areaRowsForQueue = selectedAreaKind
    ? allRows.filter(
        (row) =>
          normalizeOperationalAreaKind(row.preparing_area_kind) ===
            selectedAreaKind && matchesMode(row),
      )
    : [];
  const unassignedBlockedRows =
    canViewAll && activeMode === "all"
      ? allRows.filter(
          (row) =>
            row.status === "blocked" &&
            !normalizeOperationalAreaKind(row.preparing_area_kind),
        )
      : [];
  const scopedRows = Array.from(
    new Map(
      [...areaRowsForQueue, ...unassignedBlockedRows].map((row) => [
        row.id,
        row,
      ]),
    ).values(),
  );
  const blockedRows = scopedRows.filter((row) => row.status === "blocked");
  const operativeRows = scopedRows.filter((row) => row.status !== "blocked");

  // La cola de carga es logística de sede, no de un área productora específica.
  const loadableRows = canTransit
    ? allRows.filter(
        (row) =>
          row.status !== "blocked" &&
          Number(row.ready_base_qty) > Number(row.allocated_base_qty),
      )
    : [];
  const readyByDestination = new Map<string, Fulfillment[]>();
  for (const row of loadableRows) {
    readyByDestination.set(row.to_site_id, [
      ...(readyByDestination.get(row.to_site_id) ?? []),
      row,
    ]);
  }

  const selectedAreaName = selectedAreaKind
    ? (areaNameByKind.get(selectedAreaKind) ?? areaLabel(selectedAreaKind))
    : "";

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-panel ui-panel--halo">
        <div className="ui-caption">Cumplimiento y logística</div>
        <h1 className="mt-2 ui-h1">Preparar necesidades y armar envíos</h1>
        <p className="mt-2 ui-body-muted">
          Cada área ve únicamente sus tareas. La carga física reúne lo que ya
          está listo en toda la sede.
        </p>
      </section>

      {canViewAll ? (
        <section className="ui-panel">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1">
              <span className="ui-label">Sede responsable</span>
              <select
                name="site_id"
                defaultValue={selectedSiteId}
                className="ui-input mt-1 w-full"
              >
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name ?? site.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[220px] flex-1">
              <span className="ui-label">Área responsable</span>
              <select
                name="area_kind"
                defaultValue={selectedAreaKind}
                className="ui-input mt-1 w-full"
                required={availableAreaKinds.length > 1}
              >
                {availableAreaKinds.length > 1 ? (
                  <option value="">Selecciona un área</option>
                ) : null}
                {availableAreaKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {areaNameByKind.get(kind) ?? areaLabel(kind)}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[180px]">
              <span className="ui-label">Modo</span>
              <select
                name="mode"
                defaultValue={activeMode}
                className="ui-input mt-1 w-full"
              >
                <option value="all">Todos</option>
                <option value="stock">Stock</option>
                <option value="production">Producción</option>
              </select>
            </label>
            <button className="ui-btn ui-btn--brand h-11 px-4">Aplicar</button>
          </form>
        </section>
      ) : (
        <section className="ui-panel flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="ui-chip">
              {selectedSite?.name ?? selectedSiteId}
            </span>
            <span className="ui-chip ui-chip--brand">
              {selectedAreaName || "Área no resuelta"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Todas"],
                ["stock", "Stock"],
                ["production", "Producción"],
              ] as Array<[QueueMode, string]>
            ).map(([mode, label]) => (
              <Link
                key={mode}
                href={buildQueueHref({
                  siteId: selectedSiteId,
                  areaKind: selectedAreaKind,
                  mode,
                })}
                className={
                  activeMode === mode
                    ? "ui-btn ui-btn--brand ui-btn--sm"
                    : "ui-btn ui-btn--ghost ui-btn--sm"
                }
              >
                {label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {operationalBlockMessage ? (
        <div className="ui-alert ui-alert--neutral">
          {operationalBlockMessage}
        </div>
      ) : null}

      {!selectedAreaKind && canViewAll ? (
        <div className="ui-alert ui-alert--warn">
          Selecciona el área responsable para cargar su cola de preparación.
        </div>
      ) : null}

      {!canPrepare ? (
        <div className="ui-alert ui-alert--neutral">
          No tienes permiso para preparar tareas en este contexto.
        </div>
      ) : null}

      {blockedRows.length ? (
        <section className="ui-panel space-y-3 border-amber-300 bg-amber-50/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="ui-h3">Tareas bloqueadas</h2>
              <p className="mt-1 ui-caption">
                Se muestran para auditoría, pero no pueden prepararse ni
                cargarse hasta corregir su ruta.
              </p>
            </div>
            <Link
              href="/inventory/settings/fulfillment-routes"
              className="ui-btn ui-btn--ghost ui-btn--sm"
            >
              Corregir rutas
            </Link>
          </div>

          {blockedRows.map((row) => {
            const unit = row.restock_request_items?.stock_unit_code || "un";
            const product = row.products?.name || "Producto";
            return (
              <article
                key={row.id}
                className="rounded-xl border border-amber-300 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-[var(--ui-text)]">
                      {product}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {row.from_site?.name || "Origen"} →{" "}
                      {row.to_site?.name || "Destino"} · solicitado{" "}
                      {row.requested_base_qty} {unit}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {modeLabel(row)} · Responsable:{" "}
                      {areaLabel(row.preparing_area_kind)}
                    </div>
                  </div>
                  <span className="ui-chip ui-chip--warn">Bloqueada</span>
                </div>
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
                  {row.shortage_reason ||
                    "La ruta operativa está incompleta y no indica la causa."}
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {selectedAreaKind && canPrepare && !operationalBlockMessage ? (
        <section className="ui-panel space-y-3">
          <div>
            <h2 className="ui-h3">Tareas de preparación</h2>
            <p className="mt-1 ui-caption">
              {selectedAreaName} ·{" "}
              {activeMode === "all"
                ? "todos los modos"
                : activeMode === "stock"
                  ? "stock"
                  : "producción"}
            </p>
          </div>

          {operativeRows.length ? (
            operativeRows.map((row) => {
              const unit = row.restock_request_items?.stock_unit_code || "un";
              const product = row.products?.name || "Producto";
              const remaining = Math.max(
                0,
                Number(row.requested_base_qty) - Number(row.ready_base_qty),
              );
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
                >
                  <div>
                    <div className="font-semibold">{product}</div>
                    <div className="text-sm text-slate-600">
                      {row.from_site?.name || "Origen"} →{" "}
                      {row.to_site?.name || "Destino"} · solicitado{" "}
                      {row.requested_base_qty} {unit}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.restock_request_items?.request_policy_label
                        ? `Solicitud: ${row.restock_request_items.request_policy_label} · `
                        : ""}
                      {modeLabel(row)} · Estado: {statusLabel(row.status)}
                    </div>
                  </div>
                  <form
                    action={markFulfillmentReady}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="fulfillment_id" value={row.id} />
                    <input
                      type="hidden"
                      name="scope_site_id"
                      value={selectedSiteId}
                    />
                    <input
                      type="hidden"
                      name="scope_area_kind"
                      value={selectedAreaKind}
                    />
                    <input type="hidden" name="scope_mode" value={activeMode} />
                    <input
                      className="ui-input w-28"
                      name="ready_base_qty"
                      type="number"
                      min={row.allocated_base_qty}
                      max={row.requested_base_qty}
                      step="0.001"
                      defaultValue={
                        row.ready_base_qty || Math.max(0, remaining)
                      }
                    />
                    <button className="ui-btn ui-btn--brand ui-btn--sm">
                      Marcar lista
                    </button>
                  </form>
                </div>
              );
            })
          ) : (
            <p className="ui-body-muted">
              No hay tareas para esta sede, área y modo.
            </p>
          )}
        </section>
      ) : null}

      {canTransit ? (
        <section className="ui-panel space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="ui-h3">Listo para cargar</h2>
              <p className="mt-1 ui-caption">
                Cola logística completa de{" "}
                {selectedSite?.name ?? selectedSiteId}; reúne cantidades listas
                de todas las áreas.
              </p>
            </div>
            <Link
              href={`/inventory/remissions/conductor?site_id=${encodeURIComponent(selectedSiteId)}`}
              className="ui-btn ui-btn--ghost ui-btn--sm"
            >
              Vista del conductor
            </Link>
          </div>

          {Array.from(readyByDestination.values()).map((group) => {
            const first = group[0];
            return (
              <form
                key={first.to_site_id}
                action={createShipmentFromReady}
                className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4"
              >
                <input
                  type="hidden"
                  name="origin_site_id"
                  value={first.from_site_id}
                />
                <input
                  type="hidden"
                  name="destination_site_id"
                  value={first.to_site_id}
                />
                <input
                  type="hidden"
                  name="scope_site_id"
                  value={selectedSiteId}
                />
                <input type="hidden" name="scope_area_kind" value="" />
                <input type="hidden" name="scope_mode" value="all" />
                <div className="font-semibold">
                  Salida a {first.to_site?.name || "destino"}
                </div>
                {group.map((row) => {
                  const available =
                    Number(row.ready_base_qty) - Number(row.allocated_base_qty);
                  return (
                    <label
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-2 text-sm"
                    >
                      <span>
                        <input
                          className="mr-2"
                          type="checkbox"
                          name="include"
                          value={row.id}
                          defaultChecked
                        />
                        {row.products?.name || "Producto"} · {available}{" "}
                        {row.restock_request_items?.stock_unit_code || "un"}
                      </span>
                      <input
                        type="hidden"
                        name="fulfillment_id"
                        value={row.id}
                      />
                      <input
                        className="ui-input w-24"
                        name="base_qty"
                        type="number"
                        min="0.001"
                        max={available}
                        step="0.001"
                        defaultValue={available}
                      />
                    </label>
                  );
                })}
                <button className="ui-btn ui-btn--brand">
                  Crear envío físico
                </button>
              </form>
            );
          })}

          {readyByDestination.size === 0 ? (
            <p className="ui-body-muted">
              Aún no hay cantidades listas para cargar en esta sede.
            </p>
          ) : null}
        </section>
      ) : null}

      <Link href="/inventory/remissions" className="ui-btn ui-btn--ghost">
        Volver a solicitudes
      </Link>
    </div>
  );
}
