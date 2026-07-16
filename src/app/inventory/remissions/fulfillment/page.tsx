import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createShipmentFromReady, markFulfillmentReady } from "./actions";

export const dynamic = "force-dynamic";

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

function areaLabel(value: string | null): string {
  const normalized = String(value ?? "").trim();
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

export default async function FulfillmentBoardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("restock_item_fulfillments")
    .select(
      "id,from_site_id,to_site_id,status,supply_mode,production_execution_mode,preparing_area_kind,requested_base_qty,ready_base_qty,allocated_base_qty,shortage_reason,products(name),from_site:sites!restock_item_fulfillments_from_site_id_fkey(name),to_site:sites!restock_item_fulfillments_to_site_id_fkey(name),restock_request_items(request_policy_label,stock_unit_code)",
    )
    .in("status", [
      "pending",
      "preparing",
      "partially_ready",
      "ready",
      "allocated",
      "blocked",
    ])
    .order("created_at");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Fulfillment[];
  const blockedRows = rows.filter((row) => row.status === "blocked");
  const operativeRows = rows.filter((row) => row.status !== "blocked");
  const readyByDestination = new Map<string, Fulfillment[]>();

  for (const row of operativeRows.filter(
    (candidate) =>
      Number(candidate.ready_base_qty) > Number(candidate.allocated_base_qty),
  )) {
    readyByDestination.set(row.to_site_id, [
      ...(readyByDestination.get(row.to_site_id) ?? []),
      row,
    ]);
  }

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-panel ui-panel--halo">
        <div className="ui-caption">Cumplimiento y logística</div>
        <h1 className="mt-2 ui-h1">Preparar necesidades y armar envíos</h1>
        <p className="mt-2 ui-body-muted">
          La solicitud permanece abierta. Solo las cantidades listas pueden
          entrar a un envío físico.
        </p>
      </section>

      {blockedRows.length ? (
        <section className="ui-panel space-y-3 border-amber-300 bg-amber-50/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="ui-h3">Tareas bloqueadas</h2>
              <p className="mt-1 ui-caption">
                Estas tareas permanecen visibles para auditoría, pero no pueden
                prepararse ni cargarse hasta corregir su ruta.
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
                      {modeLabel(row)} · Responsable: {areaLabel(row.preparing_area_kind)}
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

      <section className="ui-panel space-y-3">
        <h2 className="ui-h3">Tareas de preparación</h2>
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
                    {modeLabel(row)} · Responsable: {areaLabel(row.preparing_area_kind)} ·
                    Estado: {statusLabel(row.status)}
                  </div>
                </div>
                <form
                  action={markFulfillmentReady}
                  className="flex items-center gap-2"
                >
                  <input
                    type="hidden"
                    name="fulfillment_id"
                    value={row.id}
                  />
                  <input
                    className="ui-input w-28"
                    name="ready_base_qty"
                    type="number"
                    min={row.allocated_base_qty}
                    max={row.requested_base_qty}
                    step="0.001"
                    defaultValue={row.ready_base_qty || Math.max(0, remaining)}
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
            No hay tareas operativas visibles. Las bloqueadas aparecen en su
            sección de auditoría.
          </p>
        )}
      </section>

      <section className="ui-panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="ui-h3">Listo para cargar</h2>
            <p className="mt-1 ui-caption">
              Después de crear el envío físico, el conductor confirmará su
              salida.
            </p>
          </div>
          <Link
            href="/inventory/remissions/conductor"
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
            Aún no hay cantidades listas para cargar.
          </p>
        ) : null}
      </section>

      <Link href="/inventory/remissions" className="ui-btn ui-btn--ghost">
        Volver a solicitudes
      </Link>
    </div>
  );
}