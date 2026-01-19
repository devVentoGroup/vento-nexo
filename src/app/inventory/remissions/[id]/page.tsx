import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";

const PERMISSIONS = {
  remissionsPrepare: "inventory.remissions.prepare",
  remissionsReceive: "inventory.remissions.receive",
  remissionsCancel: "inventory.remissions.cancel",
};

type SearchParams = {
  error?: string;
  ok?: string;
};

type AccessContext = {
  role: string;
  roleLabel: string;
  fromSiteType: string;
  toSiteType: string;
  fromSiteName: string;
  toSiteName: string;
  canPrepare: boolean;
  canTransit: boolean;
  canReceive: boolean;
  canClose: boolean;
  canCancel: boolean;
};

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

type AreaKindRow = {
  code: string;
  name: string | null;
};

type RestockItemRow = {
  id: string;
  product_id: string;
  quantity: number;
  unit: string | null;
  prepared_quantity: number | null;
  shipped_quantity: number | null;
  received_quantity: number | null;
  shortage_quantity: number | null;
  item_status: string | null;
  production_area_kind: string | null;
  product: {
    name: string | null;
    unit: string | null;
  } | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function loadAccessContext(
  supabase: any,
  userId: string,
  request: { from_site_id?: string | null; to_site_id?: string | null } | null
): Promise<AccessContext> {
  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", userId)
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

  const fromSiteId = request?.from_site_id ?? "";
  const toSiteId = request?.to_site_id ?? "";
  const siteIds = [fromSiteId, toSiteId].filter((id) => id);

  const { data: requestSites } = siteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", siteIds)
    : { data: [] as SiteRow[] };

  const siteMap = new Map<string, SiteRow>(
    (requestSites ?? []).map((site: SiteRow) => [site.id, site])
  );
  const fromSiteType = String(siteMap.get(fromSiteId)?.site_type ?? "");
  const toSiteType = String(siteMap.get(toSiteId)?.site_type ?? "");
  const fromSiteName = String(siteMap.get(fromSiteId)?.name ?? fromSiteId ?? "");
  const toSiteName = String(siteMap.get(toSiteId)?.name ?? toSiteId ?? "");

  const canPreparePermission = fromSiteId
    ? await checkPermission(supabase, APP_ID, PERMISSIONS.remissionsPrepare, {
        siteId: fromSiteId,
      })
    : false;
  const canReceivePermission = toSiteId
    ? await checkPermission(supabase, APP_ID, PERMISSIONS.remissionsReceive, {
        siteId: toSiteId,
      })
    : false;
  const canCancel = await checkPermission(supabase, APP_ID, PERMISSIONS.remissionsCancel, {
    siteId: fromSiteId || toSiteId || null,
  });

  const canPrepare = fromSiteType === "production_center" && canPreparePermission;
  const canTransit = canPrepare;
  const canReceive = toSiteType === "satellite" && canReceivePermission;
  const canClose = canReceive || canCancel;

  return {
    role,
    roleLabel,
    fromSiteType,
    toSiteType,
    fromSiteName,
    toSiteName,
    canPrepare,
    canTransit,
    canReceive,
    canClose,
    canCancel,
  };
}

async function updateItems(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(`/inventory/remissions/${requestId}`));
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("from_site_id,to_site_id")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request);
  const allowPrepared = access.canPrepare;
  const allowReceived = access.canReceive;
  const allowStatus = access.canCancel || access.canPrepare || access.canReceive;
  const allowArea = access.canCancel || access.canPrepare;

  const itemIds = formData.getAll("item_id").map((v) => String(v).trim());
  const prepared = formData.getAll("prepared_quantity").map((v) => String(v).trim());
  const shipped = formData.getAll("shipped_quantity").map((v) => String(v).trim());
  const received = formData.getAll("received_quantity").map((v) => String(v).trim());
  const shortage = formData.getAll("shortage_quantity").map((v) => String(v).trim());
  const statuses = formData.getAll("item_status").map((v) => String(v).trim());
  const areaKinds = formData.getAll("item_area_kind").map((v) => String(v).trim());

  for (let i = 0; i < itemIds.length; i += 1) {
    const itemId = itemIds[i];
    if (!itemId) continue;

    const updates: Record<string, number | string | null> = {};

    if (allowPrepared) {
      updates.prepared_quantity = parseNumber(prepared[i] ?? "0");
      updates.shipped_quantity = parseNumber(shipped[i] ?? "0");
    }

    if (allowReceived) {
      updates.received_quantity = parseNumber(received[i] ?? "0");
      updates.shortage_quantity = parseNumber(shortage[i] ?? "0");
    }

    if (allowStatus) {
      updates.item_status = statuses[i] || "pending";
    }

    if (allowArea) {
      updates.production_area_kind = areaKinds[i] || null;
    }

    if (!Object.keys(updates).length) {
      continue;
    }

    const { error } = await supabase
      .from("restock_request_items")
      .update(updates)
      .eq("id", itemId);

    if (error) {
      redirect(
        `/inventory/remissions/${requestId}?error=` + encodeURIComponent(error.message)
      );
    }
  }

  redirect(`/inventory/remissions/${requestId}?ok=items_updated`);
}

async function updateStatus(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(`/inventory/remissions/${requestId}`));
  }

  const action = asText(formData.get("action"));

  const { data: request } = await supabase
    .from("restock_requests")
    .select("from_site_id,to_site_id")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request);

  if (action === "prepare" && !access.canPrepare) {
    redirect(`/inventory/remissions/${requestId}?error=` + encodeURIComponent("No puedes preparar."));
  }

  if (action === "transit" && !access.canTransit) {
    redirect(`/inventory/remissions/${requestId}?error=` + encodeURIComponent("No puedes enviar."));
  }

  if (action === "receive" && !access.canReceive) {
    redirect(`/inventory/remissions/${requestId}?error=` + encodeURIComponent("No puedes recibir."));
  }

  if (action === "close" && !access.canClose) {
    redirect(`/inventory/remissions/${requestId}?error=` + encodeURIComponent("No puedes cerrar."));
  }

  if (action === "cancel" && !access.canCancel) {
    redirect(
      `/inventory/remissions/${requestId}?error=` +
        encodeURIComponent("No tienes permiso para cancelar.")
    );
  }
  const updates: Record<string, string | null> = {
    status_updated_at: new Date().toISOString(),
  };

  if (action === "prepare") {
    updates.status = "preparing";
    updates.prepared_at = new Date().toISOString();
    updates.prepared_by = user.id;
  }

  if (action === "transit") {
    updates.status = "in_transit";
    updates.in_transit_at = new Date().toISOString();
    updates.in_transit_by = user.id;
  }

  if (action === "receive") {
    updates.status = "received";
    updates.received_at = new Date().toISOString();
    updates.received_by = user.id;
  }

  if (action === "close") {
    updates.status = "closed";
    updates.closed_at = new Date().toISOString();
  }

  if (action === "cancel") {
    updates.status = "cancelled";
    updates.cancelled_at = new Date().toISOString();
  }

  const { error } = await supabase.from("restock_requests").update(updates).eq("id", requestId);
  if (error) {
    redirect(`/inventory/remissions/${requestId}?error=` + encodeURIComponent(error.message));
  }

  if (action === "transit") {
    const { error: moveErr } = await supabase.rpc("apply_restock_shipment", {
      p_request_id: requestId,
    });
    if (moveErr) {
      redirect(`/inventory/remissions/${requestId}?error=` + encodeURIComponent(moveErr.message));
    }
  }

  if (action === "receive") {
    const { error: moveErr } = await supabase.rpc("apply_restock_receipt", {
      p_request_id: requestId,
    });
    if (moveErr) {
      redirect(`/inventory/remissions/${requestId}?error=` + encodeURIComponent(moveErr.message));
    }
  }

  redirect(`/inventory/remissions/${requestId}?ok=status_updated`);
}

export default async function RemissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";
  const okMsg = sp.ok ? decodeURIComponent(sp.ok) : "";

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/remissions/${id}`,
    permissionCode: "inventory.remissions",
  });

  const { data: request } = await supabase
    .from("restock_requests")
    .select("*")
    .eq("id", id)
    .single();

  const access = await loadAccessContext(supabase, user.id, request);

  const { data: items } = await supabase
    .from("restock_request_items")
    .select(
      "id, product_id, quantity, unit, prepared_quantity, shipped_quantity, received_quantity, shortage_quantity, item_status, production_area_kind, product:products(name,unit)"
    )
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  const { data: areaKinds } = await supabase
    .from("area_kinds")
    .select("code, name")
    .order("code", { ascending: true });

  const itemRows = (items ?? []) as RestockItemRow[];
  const areaKindRows = (areaKinds ?? []) as AreaKindRow[];

  if (!request) {
    return (
      <div className="w-full px-6 py-8">
        <Link href="/inventory/remissions" className="text-sm text-zinc-600 underline">
          Volver
        </Link>
        <div className="mt-4 text-sm text-red-700">Remision no encontrada o sin acceso.</div>
      </div>
    );
  }

  return (
    <div className="w-full px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/inventory/remissions" className="text-xs text-zinc-500 underline">
            Volver a remisiones
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Remision {request.id}</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Estado: <span className="font-semibold">{request.status}</span>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Vista: {access.fromSiteType === "production_center" ? "Bodega (Centro)" : "Sede satelite"} | Rol: {access.roleLabel || "sin rol"}
          </p>
        </div>
      </div>

      {errorMsg ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error: {errorMsg}
        </div>
      ) : null}

      {okMsg ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {okMsg}
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Detalle</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm text-zinc-700">
          <div>
            <div className="text-xs text-zinc-500">Origen</div>
            <div>{access.fromSiteName || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Destino</div>
            <div>{access.toSiteName || "-"}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Creada</div>
            <div className="font-mono">{request.created_at ?? "-"}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Notas</div>
            <div>{request.notes ?? "-"}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Acciones</div>
        <form action={updateStatus} className="mt-4 flex flex-wrap gap-3">
          <input type="hidden" name="request_id" value={request.id} />
          {access.canPrepare ? (
            <button
              name="action"
              value="prepare"
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Marcar preparado
            </button>
          ) : null}
          {access.canTransit ? (
            <button
              name="action"
              value="transit"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
            >
              En viaje
            </button>
          ) : null}
          {access.canReceive ? (
            <button
              name="action"
              value="receive"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
            >
              Recibir
            </button>
          ) : null}
          {access.canClose ? (
            <button
              name="action"
              value="close"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900"
            >
              Cerrar
            </button>
          ) : null}
          {access.canCancel ? (
            <button
              name="action"
              value="cancel"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700"
            >
              Cancelar
            </button>
          ) : null}
        </form>
        <div className="mt-2 text-xs text-zinc-500">
          "En viaje" descuenta stock en origen. "Recibir" agrega stock en destino.
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Items</div>
        <form action={updateItems} className="mt-4 space-y-4">
          <input type="hidden" name="request_id" value={request.id} />
          <div className="space-y-3">
            {itemRows.map((item) => (
              <div key={item.id} className="rounded-xl border border-zinc-200 p-4">
                <div className="text-sm font-semibold text-zinc-900">
                  {item.product?.name ?? item.product_id}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Producto: <span className="font-mono">{item.product_id}</span> Solicitado: {item.quantity} {item.unit ?? item.product?.unit ?? ""}
                </div>

                <input type="hidden" name="item_id" value={item.id} />

                                <div className="mt-3 grid gap-3 md:grid-cols-6">
                  {access.canPrepare ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-500">Preparado</span>
                      <input
                        name="prepared_quantity"
                        defaultValue={item.prepared_quantity ?? 0}
                        className="h-10 rounded-lg bg-white px-3 text-sm ring-1 ring-inset ring-zinc-200"
                      />
                    </label>
                  ) : null}
                  {access.canPrepare ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-500">Enviado</span>
                      <input
                        name="shipped_quantity"
                        defaultValue={item.shipped_quantity ?? 0}
                        className="h-10 rounded-lg bg-white px-3 text-sm ring-1 ring-inset ring-zinc-200"
                      />
                    </label>
                  ) : null}
                  {access.canReceive ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-500">Recibido</span>
                      <input
                        name="received_quantity"
                        defaultValue={item.received_quantity ?? 0}
                        className="h-10 rounded-lg bg-white px-3 text-sm ring-1 ring-inset ring-zinc-200"
                      />
                    </label>
                  ) : null}
                  {access.canReceive ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-500">Faltante</span>
                      <input
                        name="shortage_quantity"
                        defaultValue={item.shortage_quantity ?? 0}
                        className="h-10 rounded-lg bg-white px-3 text-sm ring-1 ring-inset ring-zinc-200"
                      />
                    </label>
                  ) : null}
                  {access.canCancel || access.canPrepare || access.canReceive ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-500">Estado</span>
                      <select
                        name="item_status"
                        defaultValue={item.item_status ?? "pending"}
                        className="h-10 rounded-lg bg-white px-3 text-sm ring-1 ring-inset ring-zinc-200"
                      >
                        <option value="pending">pendiente</option>
                        <option value="preparing">preparando</option>
                        <option value="in_transit">en_transito</option>
                        <option value="received">recibido</option>
                        <option value="shortage">faltante</option>
                      </select>
                    </label>
                  ) : null}
                  {access.canCancel || access.canPrepare ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-zinc-500">Area</span>
                      <select
                        name="item_area_kind"
                        defaultValue={item.production_area_kind ?? ""}
                        className="h-10 rounded-lg bg-white px-3 text-sm ring-1 ring-inset ring-zinc-200"
                      >
                        <option value="">(sin area)</option>
                        {areaKindRows.map((row) => (
                          <option key={row.code} value={row.code}>
                            {row.name ?? row.code}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <button className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white">
            Guardar items
          </button>
        </form>
      </div>
    </div>
  );
}
