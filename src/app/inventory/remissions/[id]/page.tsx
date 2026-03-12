import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import {
  canUseRoleOverride,
  checkPermissionWithRoleOverride,
  getRoleOverrideFromCookies,
} from "@/lib/auth/role-override";
import { normalizeUnitCode, roundQuantity } from "@/lib/inventory/uom";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { safeDecodeURIComponent } from "@/lib/url";

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
  warning?: string;
  from?: string;
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

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

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
  input_qty: number | null;
  input_unit_code: string | null;
  stock_unit_code: string | null;
  source_location_id: string | null;
  prepared_quantity: number | null;
  shipped_quantity: number | null;
  received_quantity: number | null;
  shortage_quantity: number | null;
  item_status: string | null;
  production_area_kind: string | null;
  product: {
    name: string | null;
    unit: string | null;
    stock_unit_code?: string | null;
  } | null;
};

type LocRow = { id: string; code: string | null };

function formatStatus(status?: string | null) {
  const value = String(status ?? "").trim();
  switch (value) {
    case "pending":
      return { label: "Pendiente", className: "ui-chip ui-chip--warn" };
    case "preparing":
      return { label: "Preparando", className: "ui-chip ui-chip--brand" };
    case "in_transit":
      return { label: "En tránsito", className: "ui-chip ui-chip--warn" };
    case "partial":
      return { label: "Recepción parcial", className: "ui-chip ui-chip--warn" };
    case "received":
      return { label: "Recibida", className: "ui-chip ui-chip--success" };
    case "closed":
      return { label: "Recibida", className: "ui-chip ui-chip--success" };
    case "cancelled":
      return { label: "Cancelada", className: "ui-chip" };
    default:
      return { label: value || "Sin estado", className: "ui-chip" };
  }
}

function formatDateTime(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDate(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function isRequesterOnlyRole(role: string): boolean {
  return ["cocinero", "barista", "cajero"].includes(role);
}

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeReturnOrigin(value: string | null | undefined): "" | "prepare" {
  return String(value ?? "").trim() === "prepare" ? "prepare" : "";
}

function buildRemissionDetailHref(params: {
  requestId: string;
  from?: string | null;
  error?: string | null;
  ok?: string | null;
  warning?: string | null;
}) {
  const query = new URLSearchParams();
  const from = normalizeReturnOrigin(params.from);
  const error = String(params.error ?? "").trim();
  const ok = String(params.ok ?? "").trim();
  const warning = String(params.warning ?? "").trim();

  if (from) query.set("from", from);
  if (error) query.set("error", error);
  if (ok) query.set("ok", ok);
  if (warning) query.set("warning", warning);

  const search = query.toString();
  return search
    ? `/inventory/remissions/${params.requestId}?${search}`
    : `/inventory/remissions/${params.requestId}`;
}

async function loadAccessContext(
  supabase: SupabaseClient,
  userId: string,
  request: { from_site_id?: string | null; to_site_id?: string | null } | null
): Promise<AccessContext> {
  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", userId)
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
    ? await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsPrepare,
        context: { siteId: fromSiteId },
        actualRole: role,
      })
    : false;
  const canReceivePermission = toSiteId
    ? await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsReceive,
        context: { siteId: toSiteId },
        actualRole: role,
      })
    : false;
  const canCancel = await checkPermissionWithRoleOverride({
    supabase,
    appId: APP_ID,
    code: PERMISSIONS.remissionsCancel,
    context: { siteId: fromSiteId || toSiteId || null },
    actualRole: role,
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
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request);
  const currentStatus = String(request?.status ?? "");
  const allowPrepared =
    access.canPrepare && ["pending", "preparing"].includes(currentStatus);
  const allowReceived =
    access.canReceive && ["in_transit", "partial"].includes(currentStatus);
  const allowArea = access.canCancel || allowPrepared;

  const itemIds = formData.getAll("item_id").map((v) => String(v).trim());
  const prepared = formData.getAll("prepared_quantity").map((v) => String(v).trim());
  const shipped = formData.getAll("shipped_quantity").map((v) => String(v).trim());
  const received = formData.getAll("received_quantity").map((v) => String(v).trim());
  const shortage = formData.getAll("shortage_quantity").map((v) => String(v).trim());
  const areaKinds = formData.getAll("item_area_kind").map((v) => String(v).trim());
  const sourceLocationIds = formData
    .getAll("source_location_id")
    .map((v) => String(v).trim());
  const { data: itemStateRows } = await supabase
    .from("restock_request_items")
    .select("id,product_id,quantity,prepared_quantity,shipped_quantity,received_quantity,shortage_quantity")
    .eq("request_id", requestId);
  const itemStateById = new Map(
    (
      (itemStateRows ?? []) as Array<{
        id: string;
        product_id: string;
        quantity: number | null;
        prepared_quantity: number | null;
        shipped_quantity: number | null;
        received_quantity: number | null;
        shortage_quantity: number | null;
      }>
    ).map((row) => [row.id, row])
  );

  const fromSiteId = request?.from_site_id ?? "";
  const allowSourceLocation = allowPrepared && access.fromSiteType === "production_center";
  if (allowPrepared && fromSiteId) {
    const { data: stockRows } = await supabase
      .from("inventory_stock_by_site")
      .select("product_id,current_qty")
      .eq("site_id", fromSiteId);
    const stockMap = new Map(
      (stockRows ?? []).map((r: { product_id: string; current_qty: number | null }) => [
        r.product_id,
        Number(r.current_qty ?? 0),
      ])
    );
    const productById = new Map(
      Array.from(itemStateById.values()).map((row) => [row.id, row.product_id])
    );

    const selectedLocIds = Array.from(
      new Set(sourceLocationIds.filter(Boolean))
    );
    const selectedProductIds = Array.from(new Set(productById.values()));
    const { data: locStockRows } =
      allowSourceLocation && selectedLocIds.length > 0 && selectedProductIds.length > 0
        ? await supabase
            .from("inventory_stock_by_location")
            .select("location_id,product_id,current_qty")
            .in("location_id", selectedLocIds)
            .in("product_id", selectedProductIds)
        : { data: [] as { location_id: string; product_id: string; current_qty: number | null }[] };
    const locStockMap = new Map(
      (locStockRows ?? []).map((row) => [
        `${row.location_id}|${row.product_id}`,
        Number(row.current_qty ?? 0),
      ])
    );

    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i];
      const itemState = itemStateById.get(itemId);
      const productId = productById.get(itemId);
      if (!productId) continue;
      const available = stockMap.get(productId) ?? 0;
      const prepQty = parseNumber(prepared[i] ?? "0");
      const shipQty = parseNumber(shipped[i] ?? "0");
      const requestedQty = roundQuantity(Number(itemState?.quantity ?? 0));
      if (prepQty < 0 || shipQty < 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Preparado y enviado no pueden ser negativos.",
          })
        );
      }
      if (requestedQty > 0 && prepQty > requestedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad preparada (${prepQty}) mayor que solicitada (${requestedQty}).`,
          })
        );
      }
      if (requestedQty > 0 && shipQty > requestedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad enviada (${shipQty}) mayor que solicitada (${requestedQty}).`,
          })
        );
      }
      if (shipQty > prepQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad enviada (${shipQty}) no puede superar la preparada (${prepQty}).`,
          })
        );
      }
      const maxQty = Math.max(prepQty, shipQty);
      if (maxQty > available) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad preparada/enviada (${maxQty}) mayor que stock disponible en origen (${available}). Ajusta las cantidades.`,
          })
        );
      }
      if (allowSourceLocation && maxQty > 0) {
        const sourceLocId = sourceLocationIds[i] || "";
        if (!sourceLocId) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: "Selecciona LOC origen para todos los items preparados/enviados.",
            })
          );
        }
        const availableAtLoc = locStockMap.get(`${sourceLocId}|${productId}`) ?? 0;
        if (maxQty > availableAtLoc) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: `Cantidad preparada/enviada (${maxQty}) mayor que disponible en LOC origen (${availableAtLoc}).`,
            })
          );
        }
      }
    }
  }

  if (allowReceived) {
    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i];
      const itemState = itemStateById.get(itemId);
      if (!itemState) continue;
      const receivedQty = parseNumber(received[i] ?? "0");
      const shortageQty = parseNumber(shortage[i] ?? "0");
      const shippedQty = roundQuantity(Number(itemState.shipped_quantity ?? 0));

      if (receivedQty < 0 || shortageQty < 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Recibido y faltante no pueden ser negativos.",
          })
        );
      }
      if (shippedQty <= 0 && (receivedQty > 0 || shortageQty > 0)) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "No puedes registrar recibido o faltante en items que no fueron enviados.",
          })
        );
      }
      if (receivedQty + shortageQty > shippedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Recibido + faltante (${receivedQty + shortageQty}) no puede superar enviado (${shippedQty}).`,
          })
        );
      }
    }
  }

  for (let i = 0; i < itemIds.length; i += 1) {
    const itemId = itemIds[i];
    if (!itemId) continue;

    const updates: Record<string, number | string | null> = {};

    if (allowPrepared) {
      updates.prepared_quantity = parseNumber(prepared[i] ?? "0");
      updates.shipped_quantity = parseNumber(shipped[i] ?? "0");
      updates.source_location_id = sourceLocationIds[i] || null;
    }

    if (allowReceived) {
      updates.received_quantity = parseNumber(received[i] ?? "0");
      updates.shortage_quantity = parseNumber(shortage[i] ?? "0");
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
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
    }
  }

  redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, ok: "items_updated" }));
}

async function splitItem(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const itemId = asText(formData.get("split_item_id"));
  if (!itemId) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "Falta la linea a partir." }));
  }

  const splitQuantity = parseNumber(asText(formData.get(`split_quantity_${itemId}`)));
  if (splitQuantity <= 0) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Define una cantidad valida para partir la linea.",
      })
    );
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request);
  const currentStatus = String(request?.status ?? "");

  if (!access.canPrepare || !["pending", "preparing"].includes(currentStatus)) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Solo puedes partir lineas mientras la remision esta pendiente o preparando.",
      })
    );
  }

  const { error } = await supabase.rpc("split_restock_request_item", {
    p_item_id: itemId,
    p_split_quantity: splitQuantity,
  });

  if (error) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
  }

  redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, ok: "split_item" }));
}

async function updateStatus(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const action = asText(formData.get("action"));

  const { data: request } = await supabase
    .from("restock_requests")
    .select("from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request);
  const currentStatus = String(request?.status ?? "");

  if (action === "prepare" && !access.canPrepare) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No puedes preparar." }));
  }

  if (action === "transit" && !access.canTransit) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No puedes enviar." }));
  }

  if (action === "receive" && !access.canReceive) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No puedes recibir." }));
  }

  if (action === "receive_partial" && !access.canReceive) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No puedes recibir." }));
  }

  if (action === "close") {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "En v1 la remision termina en recibida. El cierre administrativo ya no se usa.",
      })
    );
  }

  if (action === "cancel" && !access.canCancel) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No tienes permiso para cancelar." }));
  }

  if (action === "prepare" && currentStatus !== "pending") {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "Solo puedes preparar una remision pendiente." }));
  }
  if (action === "transit" && currentStatus !== "preparing") {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "Solo puedes enviar una remision en estado preparando." }));
  }
  if (
    (action === "receive" || action === "receive_partial") &&
    !["in_transit", "partial"].includes(currentStatus)
  ) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "La remision debe estar en transito/parcial para recibir." }));
  }
  if (action === "receive_partial" && currentStatus !== "in_transit") {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "Solo puedes registrar recepcion parcial desde en transito." }));
  }
  const sourceLocDeductions: Array<{
    locationId: string;
    productId: string;
    qty: number;
    unitCode: string;
  }> = [];
  if (action === "transit") {
    const { data: itemsData } = await supabase
      .from("restock_request_items")
      .select("id,product_id,quantity,prepared_quantity,shipped_quantity,source_location_id,stock_unit_code,unit")
      .eq("request_id", requestId);
    const itemRows = (itemsData ?? []) as Array<{
      id: string;
      product_id: string;
      quantity: number | null;
      prepared_quantity: number | null;
      shipped_quantity: number | null;
      source_location_id: string | null;
      stock_unit_code: string | null;
      unit: string | null;
    }>;

    if (access.fromSiteType === "production_center") {
      const locIds = Array.from(
        new Set(itemRows.map((row) => row.source_location_id).filter(Boolean) as string[])
      );
      const productIds = Array.from(new Set(itemRows.map((row) => row.product_id).filter(Boolean)));
      const { data: locStockRows } =
        locIds.length > 0 && productIds.length > 0
          ? await supabase
              .from("inventory_stock_by_location")
              .select("location_id,product_id,current_qty")
              .in("location_id", locIds)
              .in("product_id", productIds)
          : { data: [] as { location_id: string; product_id: string; current_qty: number | null }[] };
      const locStockMap = new Map(
        (locStockRows ?? []).map((row) => [
          `${row.location_id}|${row.product_id}`,
          Number(row.current_qty ?? 0),
        ])
      );

      let anyTransitQty = false;
      for (const row of itemRows) {
        const requestedQty = roundQuantity(Number(row.quantity ?? 0));
        const preparedQty = roundQuantity(Number(row.prepared_quantity ?? 0));
        const shippedQty = roundQuantity(Number(row.shipped_quantity ?? 0));
        const effectiveShippedQty = shippedQty > 0 ? shippedQty : preparedQty;
        const effectivePreparedQty = Math.max(preparedQty, effectiveShippedQty);
        const qty = effectiveShippedQty;

        if (preparedQty < 0 || shippedQty < 0) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: "Preparado y enviado no pueden ser negativos.",
            })
          );
        }
        if (requestedQty > 0 && preparedQty > requestedQty) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: `Cantidad preparada (${preparedQty}) mayor que solicitada (${requestedQty}).`,
            })
          );
        }
        if (requestedQty > 0 && effectiveShippedQty > requestedQty) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: `Cantidad enviada (${effectiveShippedQty}) mayor que solicitada (${requestedQty}).`,
            })
          );
        }
        if (shippedQty > 0 && preparedQty > 0 && shippedQty > preparedQty) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: `Cantidad enviada (${shippedQty}) no puede superar la preparada (${preparedQty}).`,
            })
          );
        }
        if (qty <= 0) continue;
        anyTransitQty = true;
        const sourceLocId = row.source_location_id ?? "";
        if (!sourceLocId) {
          redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "Falta LOC origen en uno o mas items para enviar." }));
        }
        const availableAtLoc = locStockMap.get(`${sourceLocId}|${row.product_id}`) ?? 0;
        if (qty > availableAtLoc) {
          redirect(buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad enviada (${qty}) supera stock disponible en LOC origen (${availableAtLoc}).`,
          }));
        }
        if (effectivePreparedQty !== preparedQty || effectiveShippedQty !== shippedQty) {
          const { error: syncErr } = await supabase
            .from("restock_request_items")
            .update({
              prepared_quantity: effectivePreparedQty,
              shipped_quantity: effectiveShippedQty,
            })
            .eq("id", row.id);
          if (syncErr) {
            redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: syncErr.message }));
          }
        }
        sourceLocDeductions.push({
          locationId: sourceLocId,
          productId: row.product_id,
          qty,
          unitCode: normalizeUnitCode(row.stock_unit_code || row.unit || "un"),
        });
      }
      if (!anyTransitQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Define al menos una cantidad preparada o enviada mayor a 0 antes de despachar.",
          })
        );
      }
    }
  }

  if (action === "receive" || action === "receive_partial") {
    const { data: itemsData } = await supabase
      .from("restock_request_items")
      .select("id,product_id,shipped_quantity,received_quantity,shortage_quantity")
      .eq("request_id", requestId);
    const itemRows = (itemsData ?? []) as Array<{
      id: string;
      product_id: string;
      shipped_quantity: number | null;
      received_quantity: number | null;
      shortage_quantity: number | null;
    }>;

    let anyAccountedQty = false;
    let allFullyAccounted = true;
    for (const row of itemRows) {
      const shippedQty = roundQuantity(Number(row.shipped_quantity ?? 0));
      const receivedQty = roundQuantity(Number(row.received_quantity ?? 0));
      const shortageQty = roundQuantity(Number(row.shortage_quantity ?? 0));
      const accountedQty = roundQuantity(receivedQty + shortageQty);

      if (receivedQty < 0 || shortageQty < 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Recibido y faltante no pueden ser negativos.",
          })
        );
      }
      if (accountedQty > shippedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Recibido + faltante (${accountedQty}) no puede superar enviado (${shippedQty}).`,
          })
        );
      }
      if (accountedQty > 0) anyAccountedQty = true;
      if (shippedQty > 0 && accountedQty !== shippedQty) allFullyAccounted = false;
    }

    if (!anyAccountedQty) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Registra al menos una cantidad recibida o faltante antes de continuar.",
        })
      );
    }

    if (action === "receive" && !allFullyAccounted) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Para cerrar la recepcion completa, cada item enviado debe quedar cubierto entre recibido y faltante.",
        })
      );
    }

    if (action === "receive_partial" && allFullyAccounted) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Todas las cantidades ya quedaron cubiertas. Usa 'Recibir' para cerrar la recepcion.",
        })
      );
    }
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

  if (action === "receive_partial") {
    updates.status = "partial";
    updates.received_at = new Date().toISOString();
    updates.received_by = user.id;
  }

  if (action === "cancel") {
    updates.status = "cancelled";
    updates.cancelled_at = new Date().toISOString();
  }

  if (action === "transit") {
    const { error: moveErr } = await supabase.rpc("apply_restock_shipment", {
      p_request_id: requestId,
    });
    if (moveErr) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: moveErr.message }));
    }
    const fromSiteIdForMovement = request?.from_site_id ?? "";
    if (!fromSiteIdForMovement) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No se encontro sede origen para la remision." }));
    }

    for (const deduction of sourceLocDeductions) {
      const { error: locErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
        p_location_id: deduction.locationId,
        p_product_id: deduction.productId,
        p_delta: -deduction.qty,
      });
      if (locErr) {
        redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: `No se pudo descontar LOC origen: ${locErr.message}` }));
      }

      const { error: moveLocErr } = await supabase.from("inventory_movements").insert({
        site_id: fromSiteIdForMovement,
        product_id: deduction.productId,
        movement_type: "transfer_out",
        quantity: -deduction.qty,
        input_qty: deduction.qty,
        input_unit_code: deduction.unitCode,
        conversion_factor_to_stock: 1,
        stock_unit_code: deduction.unitCode,
        note: `Remision ${requestId} desde LOC ${deduction.locationId}`,
        created_by: user.id,
      });
      if (moveLocErr) {
        redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: `No se pudo registrar movimiento LOC: ${moveLocErr.message}` }));
      }
    }
  }

  if (action === "receive" || action === "receive_partial") {
    const { error: moveErr } = await supabase.rpc("apply_restock_receipt", {
      p_request_id: requestId,
    });
    if (moveErr) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: moveErr.message }));
    }
  }

  const { error } = await supabase.from("restock_requests").update(updates).eq("id", requestId);
  if (error) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
  }

  redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, ok: "status_updated" }));
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
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const okMsg = sp.ok === "created"
    ? "Remisión creada."
    : sp.ok === "items_updated"
      ? "Ítems actualizados."
      : sp.ok === "split_item"
        ? "Linea partida. Ya puedes asignar un LOC distinto por linea."
      : sp.ok === "status_updated"
        ? "Estado actualizado."
        : sp.ok
          ? safeDecodeURIComponent(sp.ok)
          : "";
  const lowStockWarning = sp.warning === "low_stock";
  const cameFromPrepareQueue = sp.from === "prepare";
  const backHref = cameFromPrepareQueue ? "/inventory/remissions/prepare" : "/inventory/remissions";
  const backLabel = cameFromPrepareQueue ? "Volver a cola de preparacion" : "Volver a remisiones";

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/remissions/${id}`,
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
      "id, product_id, quantity, unit, input_qty, input_unit_code, stock_unit_code, source_location_id, prepared_quantity, shipped_quantity, received_quantity, shortage_quantity, item_status, production_area_kind, product:products(name,unit,stock_unit_code)"
    )
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  const { data: areaKinds } = await supabase
    .from("area_kinds")
    .select("code, name")
    .order("code", { ascending: true });

  const itemRows = (items ?? []) as unknown as RestockItemRow[];
  const areaKindRows = (areaKinds ?? []) as AreaKindRow[];
  const showSourceLocSelector =
    access.canPrepare && access.fromSiteType === "production_center";

  // Fase 2.1: stock disponible por sede y por LOC en origen (solo lectura al preparar)
  const fromSiteId = request?.from_site_id ?? "";
  type StockBySiteRow = { product_id: string; current_qty: number | null };
  type StockByLocRow = { location_id: string; product_id: string; current_qty: number | null; location?: { code: string | null } | null };
  const { data: stockBySiteData } = fromSiteId
    ? await supabase
        .from("inventory_stock_by_site")
        .select("product_id,current_qty")
        .eq("site_id", fromSiteId)
    : { data: [] as StockBySiteRow[] };
  const stockBySiteMap = new Map<string, number>(
    (stockBySiteData ?? []).map((r: StockBySiteRow) => [r.product_id, Number(r.current_qty ?? 0)])
  );

  let locIdsFromSite: string[] = [];
  const { data: locsFromSite } = fromSiteId
    ? await supabase
        .from("inventory_locations")
        .select("id,code")
        .eq("site_id", fromSiteId)
        .order("code", { ascending: true })
        .limit(500)
    : { data: [] as LocRow[] };
  const originLocRows = (locsFromSite ?? []) as LocRow[];
  const originLocMap = new Map(originLocRows.map((loc) => [loc.id, loc.code ?? loc.id]));
  locIdsFromSite = originLocRows.map((row) => row.id);

  const { data: stockByLocData } =
    fromSiteId && locIdsFromSite.length > 0
      ? await supabase
          .from("inventory_stock_by_location")
          .select("location_id,product_id,current_qty,location:inventory_locations(code)")
          .in("location_id", locIdsFromSite)
          .gt("current_qty", 0)
      : { data: [] as StockByLocRow[] };
  const stockByLocRows = (stockByLocData ?? []) as StockByLocRow[];
  const stockByLocByProduct = new Map<string, string[]>();
  const stockByLocValueMap = new Map<string, number>();
  const stockByLocCandidates = new Map<
    string,
    Array<{ locationId: string; code: string; qty: number }>
  >();
  for (const row of stockByLocRows) {
    const code = row.location?.code ?? row.location_id?.slice(0, 8) ?? "";
    const qty = Number(row.current_qty ?? 0);
    stockByLocValueMap.set(`${row.location_id}|${row.product_id}`, qty);
    if (!qty) continue;
    const key = row.product_id;
    if (!stockByLocByProduct.has(key)) stockByLocByProduct.set(key, []);
    stockByLocByProduct.get(key)!.push(`${code}: ${qty}`);
    if (!stockByLocCandidates.has(key)) stockByLocCandidates.set(key, []);
    stockByLocCandidates.get(key)!.push({
      locationId: row.location_id,
      code,
      qty,
    });
  }
  for (const candidates of stockByLocCandidates.values()) {
    candidates.sort((a, b) => b.qty - a.qty || a.code.localeCompare(b.code));
  }

  if (!request) {
    return (
      <div className="w-full">
        <Link href={backHref} className="ui-body-muted underline">
          {backLabel}
        </Link>
        <div className="mt-4 ui-alert ui-alert--error">Remisión no encontrada o sin acceso.</div>
      </div>
    );
  }

  if (isRequesterOnlyRole(access.role) && request.created_by !== user.id) {
    return (
      <div className="w-full">
        <Link href={backHref} className="ui-body-muted underline">
          {backLabel}
        </Link>
        <div className="mt-4 ui-alert ui-alert--error">
          Esta remision no fue creada por ti. Los roles operativos solo pueden ver sus propias solicitudes.
        </div>
      </div>
    );
  }

  const currentStatus = String(request.status ?? "");
  const canPrepareAction = access.canPrepare && currentStatus === "pending";
  const canTransitAction = access.canTransit && currentStatus === "preparing";
  const canReceiveAction =
    access.canReceive && ["in_transit", "partial"].includes(currentStatus);
  const canReceivePartialAction = access.canReceive && currentStatus === "in_transit";
  const canCloseAction = false;
  const canCancelAction = access.canCancel && !["closed", "cancelled"].includes(currentStatus);
  const canEditPrepareItems =
    access.canPrepare && ["pending", "preparing"].includes(currentStatus);
  const canEditReceiveItems =
    access.canReceive && ["in_transit", "partial"].includes(currentStatus);
  const canEditArea = access.canCancel || canEditPrepareItems;
  const pendingReceiptLines = itemRows.filter((item) => {
    const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
    const accountedQty = roundQuantity(
      Number(item.received_quantity ?? 0) + Number(item.shortage_quantity ?? 0)
    );
    return shippedQty > 0 && accountedQty < shippedQty;
  }).length;
  const shortageLines = itemRows.filter(
    (item) => roundQuantity(Number(item.shortage_quantity ?? 0)) > 0
  ).length;
  const receivedLines = itemRows.filter(
    (item) => roundQuantity(Number(item.received_quantity ?? 0)) > 0
  ).length;
  const linesMissingSourceLoc = itemRows.filter((item) => {
    const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
    const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
    const plannedQty = Math.max(preparedQty, shippedQty);
    return canEditPrepareItems && showSourceLocSelector && plannedQty > 0 && !item.source_location_id;
  }).length;
  const linesOverSiteStock = itemRows.filter((item) => {
    const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
    const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
    const plannedQty = Math.max(preparedQty, shippedQty);
    const availableSite = stockBySiteMap.get(item.product_id) ?? 0;
    return canEditPrepareItems && plannedQty > availableSite;
  }).length;
  const linesOverSelectedLocStock = itemRows.filter((item) => {
    const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
    const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
    const plannedQty = Math.max(preparedQty, shippedQty);
    if (!canEditPrepareItems || !item.source_location_id) return false;
    const availableAtSelectedLoc =
      stockByLocValueMap.get(`${item.source_location_id}|${item.product_id}`) ?? 0;
    return plannedQty > availableAtSelectedLoc;
  }).length;
  const linesPartialPreparation = itemRows.filter((item) => {
    const requestedQty = roundQuantity(Number(item.quantity ?? 0));
    const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
    const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
    const plannedQty = Math.max(preparedQty, shippedQty);
    return canEditPrepareItems && plannedQty > 0 && requestedQty > 0 && plannedQty < requestedQty;
  }).length;
  const linesWithoutCoveringLoc = itemRows.filter((item) => {
    const requestedQty = roundQuantity(Number(item.quantity ?? 0));
    const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
    const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
    const plannedQty = Math.max(preparedQty, shippedQty);
    const targetQty = plannedQty > 0 ? plannedQty : requestedQty;
    const availableSite = stockBySiteMap.get(item.product_id) ?? 0;
    const bestLocQty = stockByLocCandidates.get(item.product_id)?.[0]?.qty ?? 0;
    return canEditPrepareItems && targetQty > 0 && targetQty <= availableSite && bestLocQty < targetQty;
  }).length;
  let responsibleActor = "Sin actor operativo pendiente.";
  if (["pending", "preparing"].includes(currentStatus)) {
    responsibleActor = `${access.fromSiteName || "Centro"} / bodega`;
  } else if (["in_transit", "partial"].includes(currentStatus)) {
    responsibleActor = `${access.toSiteName || "Destino"} / recepción`;
  } else if (currentStatus === "received") {
    responsibleActor = access.canClose
      ? "Cierre administrativo opcional"
      : "Recepción completa registrada";
  } else if (currentStatus === "closed") {
    responsibleActor = "Flujo terminado";
  } else if (currentStatus === "cancelled") {
    responsibleActor = "Remisión cancelada";
  }

  let nextStep = "Sin acciones disponibles.";
  if (currentStatus === "pending") {
    nextStep = access.canPrepare
      ? "Paso 2: revisa items, guarda preparación y luego marca preparado."
      : `${access.fromSiteName || "Centro"} debe tomar esta solicitud y empezar preparación.`;
  } else if (currentStatus === "preparing") {
    nextStep = access.canTransit
      ? "Paso 2: confirma cantidades enviadas y marca en viaje."
      : `${access.fromSiteName || "Centro"} debe despachar esta remisión.`;
  } else if (currentStatus === "in_transit") {
    nextStep = access.canReceive
      ? "Paso 3: registra recibido y faltante, guarda items y luego confirma recepción completa o parcial."
      : `${access.toSiteName || "Destino"} debe registrar la recepción.`;
  } else if (currentStatus === "partial") {
    nextStep = access.canReceive
      ? "La recepción quedó parcial. Completa lo pendiente entre recibido y faltante o confirma la recepción total cuando ya esté conciliada."
      : `La recepción quedó parcial y requiere conciliación en ${access.toSiteName || "destino"}.`;
  } else if (currentStatus === "received") {
    nextStep = "La recepción ya quedó completa. En v1 aquí termina el flujo.";
  } else if (currentStatus === "closed") {
    nextStep = "Registro legado: esta remisión ya estaba cerrada y en v1 se trata como recibida.";
  } else if (currentStatus === "cancelled") {
    nextStep = "La remisión fue cancelada.";
  }

  return (
    <div className="w-full space-y-6 pb-28 lg:pb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href={backHref} className="ui-caption underline">
            {backLabel}
          </Link>
          <h1 className="mt-2 ui-h1">Remision #{String(request.id).slice(0, 8)}</h1>
          <p className="mt-2 ui-body-muted">
            Estado:{" "}
            <span className={formatStatus(request.status).className}>
              {formatStatus(request.status).label}
            </span>
          </p>
          <p className="mt-1 ui-caption">
            Vista: {access.fromSiteType === "production_center" ? "Bodega (Centro)" : "Sede satelite"} | Rol: {access.roleLabel || "sin rol"}
          </p>
        </div>
      </div>

      {cameFromPrepareQueue ? (
        <div className="ui-panel-soft p-4 text-sm text-[var(--ui-muted)]">
          Estas trabajando desde la cola especializada de bodega. Termina esta preparacion y vuelve a la cola para seguir con la siguiente solicitud.
        </div>
      ) : null}

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">
          Error: {errorMsg}
        </div>
      ) : null}

      {okMsg ? (
        <div className="ui-alert ui-alert--success">{okMsg}</div>
      ) : null}

      {lowStockWarning ? (
        <div className="ui-alert ui-alert--warn">
          Algunos productos pueden no tener stock suficiente en Centro. Bodega verificara al preparar.
        </div>
      ) : null}

      <div className="ui-panel">
        <div className="ui-h3">Detalle</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5 ui-body">
          <div>
            <div className="ui-caption">Origen</div>
            <div>{access.fromSiteName || "-"}</div>
          </div>
          <div>
            <div className="ui-caption">Destino</div>
            <div>{access.toSiteName || "-"}</div>
          </div>
          <div>
            <div className="ui-caption">Creada</div>
            <div>{formatDateTime(request.created_at)}</div>
          </div>
          <div>
            <div className="ui-caption">Fecha esperada</div>
            <div>{formatDate(request.expected_date ?? null)}</div>
          </div>
          <div>
            <div className="ui-caption">Notas</div>
            <div>{request.notes ?? "-"}</div>
          </div>
        </div>
      </div>

      <div className="ui-panel">
        <div className="ui-h3">Flujo de trabajo</div>
        <div className="mt-2 ui-caption">
          Estado actual: <strong>{formatStatus(request.status).label}</strong>
        </div>
        <div className="mt-1 ui-caption">
          Quién debe actuar: <strong>{responsibleActor}</strong>
        </div>
        <div className="mt-1 ui-caption">
          Siguiente paso: <strong>{nextStep}</strong>
        </div>
      </div>

      {currentStatus === "partial" ? (
        <div className="ui-alert ui-alert--warn">
          Recepción parcial activa. Hay <strong>{pendingReceiptLines}</strong> linea(s) con cantidades todavía por conciliar y <strong>{shortageLines}</strong> con faltante registrado.
          {receivedLines > 0 ? ` También hay ${receivedLines} linea(s) con recepción registrada.` : ""}
        </div>
      ) : null}

      {currentStatus === "closed" ? (
        <div className="ui-alert ui-alert--neutral">
          Esta remisión viene de una lógica anterior con estado <strong>closed</strong>. Para operación v1 se interpreta como remisión ya recibida.
        </div>
      ) : null}

      <div className="ui-panel">
        <div className="ui-h3">Acciones</div>
        <form action={updateStatus} className="mt-4 grid gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap">
          <input type="hidden" name="request_id" value={request.id} />
          <input type="hidden" name="return_origin" value={cameFromPrepareQueue ? "prepare" : ""} />
          {canPrepareAction ? (
            <button
              name="action"
              value="prepare"
              className="ui-btn ui-btn--ghost"
            >
              Paso 2: marcar preparado
            </button>
          ) : null}
          {canTransitAction ? (
            <button
              name="action"
              value="transit"
              className="ui-btn ui-btn--brand"
            >
              Paso 2: marcar en viaje
            </button>
          ) : null}
          {canReceiveAction ? (
            <button
              name="action"
              value="receive"
              className="ui-btn ui-btn--ghost"
            >
              Paso 3: confirmar recepción
            </button>
          ) : null}
          {canReceivePartialAction ? (
            <button
              name="action"
              value="receive_partial"
              className="ui-btn ui-btn--ghost"
            >
              Paso 3: guardar como parcial
            </button>
          ) : null}
          {canCancelAction ? (
            <button
              name="action"
              value="cancel"
              className="ui-btn ui-btn--danger"
            >
              Cancelar
            </button>
          ) : null}
        </form>
        {!canPrepareAction &&
        !canTransitAction &&
        !canReceiveAction &&
        !canReceivePartialAction &&
        !canCloseAction &&
        !canCancelAction ? (
          <div className="mt-3 ui-caption">
            No hay acciones disponibles para tu rol en el estado actual.
          </div>
        ) : null}
        <div className="mt-2 ui-caption">
          &quot;Marcar en viaje&quot; descuenta stock en origen. &quot;Confirmar recepción&quot; agrega stock en destino. Si queda parcial, vuelve a esta misma remisión para completar la conciliación.
        </div>
      </div>

      <div className="ui-panel">
        <div className="ui-h3">
          {canEditPrepareItems
            ? "Preparación y despacho"
            : canEditReceiveItems
              ? "Recepción en destino"
              : "Items de la remision"}
        </div>
        {canEditPrepareItems ? (
          <p className="mt-2 ui-caption">
            Paso 2 del flujo: selecciona LOC origen, captura preparado/enviado, guarda ítems y luego usa
            <strong> Marcar preparado</strong> y <strong>Marcar en viaje</strong>.
          </p>
        ) : null}
        {canEditReceiveItems ? (
          <p className="mt-2 ui-caption">
            Paso 3 del flujo: captura recibido/faltante, guarda ítems y luego usa <strong>Confirmar recepción</strong> o{" "}
            <strong>Guardar como parcial</strong>.
          </p>
        ) : null}
        <form action={updateItems} className="mt-4 space-y-4 pb-24 lg:pb-0">
          <input type="hidden" name="request_id" value={request.id} />
          <input type="hidden" name="return_origin" value={cameFromPrepareQueue ? "prepare" : ""} />

          {canEditPrepareItems ? (
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <div className="ui-panel-soft p-4">
                <div className="ui-caption">Lineas con LOC pendiente</div>
                <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
                  {linesMissingSourceLoc}
                </div>
              </div>
              <div className="ui-panel-soft p-4">
                <div className="ui-caption">Lineas pasadas de stock sede</div>
                <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
                  {linesOverSiteStock}
                </div>
              </div>
              <div className="ui-panel-soft p-4">
                <div className="ui-caption">Lineas pasadas de stock LOC</div>
                <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
                  {linesOverSelectedLocStock}
                </div>
              </div>
              <div className="ui-panel-soft p-4">
                <div className="ui-caption">Preparacion corta</div>
                <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
                  {linesPartialPreparation}
                </div>
              </div>
              <div className="ui-panel-soft p-4">
                <div className="ui-caption">Sin LOC unico suficiente</div>
                <div className="mt-1 text-2xl font-semibold text-[var(--ui-text)]">
                  {linesWithoutCoveringLoc}
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            {itemRows.map((item) => {
              const requestedQty = roundQuantity(Number(item.quantity ?? 0));
              const availableSite = stockBySiteMap.get(item.product_id) ?? 0;
              const locLines = stockByLocByProduct.get(item.product_id) ?? [];
              const locCandidates = stockByLocCandidates.get(item.product_id) ?? [];
              const bestLocCandidate = locCandidates[0] ?? null;
              const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
              const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
              const receivedQty = roundQuantity(Number(item.received_quantity ?? 0));
              const shortageQty = roundQuantity(Number(item.shortage_quantity ?? 0));
              const plannedQty = Math.max(preparedQty, shippedQty);
              const accountedQty = roundQuantity(receivedQty + shortageQty);
              const stockOk = availableSite >= (item.quantity ?? 0);
              const sourceLocLabel = item.source_location_id
                ? originLocMap.get(item.source_location_id) ?? item.source_location_id.slice(0, 8)
                : "-";
              const availableAtSelectedLoc = item.source_location_id
                ? stockByLocValueMap.get(`${item.source_location_id}|${item.product_id}`) ?? 0
                : 0;
              const missingSourceLoc = canEditPrepareItems && showSourceLocSelector && plannedQty > 0 && !item.source_location_id;
              const overSiteStock = canEditPrepareItems && plannedQty > availableSite;
              const overLocStock =
                canEditPrepareItems &&
                Boolean(item.source_location_id) &&
                plannedQty > availableAtSelectedLoc;
              const linePreparationPartial =
                canEditPrepareItems && plannedQty > 0 && requestedQty > 0 && plannedQty < requestedQty;
              const targetQtyForLoc = plannedQty > 0 ? plannedQty : requestedQty;
              const lineWithoutCoveringLoc =
                canEditPrepareItems &&
                targetQtyForLoc > 0 &&
                targetQtyForLoc <= availableSite &&
                (bestLocCandidate?.qty ?? 0) < targetQtyForLoc;
              const selectedLocIsNotBest =
                canEditPrepareItems &&
                Boolean(item.source_location_id) &&
                Boolean(bestLocCandidate) &&
                item.source_location_id !== bestLocCandidate?.locationId &&
                availableAtSelectedLoc < (bestLocCandidate?.qty ?? 0);
              const canSplitLine =
                canEditPrepareItems &&
                lineWithoutCoveringLoc &&
                requestedQty > 0 &&
                preparedQty === 0 &&
                shippedQty === 0 &&
                receivedQty === 0 &&
                shortageQty === 0 &&
                (bestLocCandidate?.qty ?? 0) > 0 &&
                (bestLocCandidate?.qty ?? 0) < requestedQty;
              const suggestedSplitQty = canSplitLine
                ? roundQuantity(Math.min(bestLocCandidate?.qty ?? 0, requestedQty))
                : 0;
              const remainingSplitQty = canSplitLine
                ? roundQuantity(requestedQty - suggestedSplitQty)
                : requestedQty;
              const linePendingReceipt =
                canEditReceiveItems && shippedQty > 0 && accountedQty < shippedQty;
              const linePartialReceipt =
                canEditReceiveItems && accountedQty > 0 && accountedQty < shippedQty;
              const lineCompleteReceipt =
                canEditReceiveItems && shippedQty > 0 && accountedQty === shippedQty;
              const lineStatusLabel = canEditPrepareItems
                ? missingSourceLoc
                  ? "LOC pendiente"
                  : linePreparationPartial
                    ? "Preparación parcial"
                    : lineWithoutCoveringLoc
                      ? "LOC insuficiente"
                  : plannedQty > 0
                    ? "Lista para despacho"
                    : "Pendiente de preparación"
                : canEditReceiveItems
                  ? linePartialReceipt
                    ? "Recepción parcial"
                    : lineCompleteReceipt
                      ? "Conciliada"
                      : linePendingReceipt
                        ? "Pendiente de recepción"
                        : "Sin envío"
                  : formatStatus(item.item_status).label;
              const lineStatusClassName = canEditPrepareItems
                ? missingSourceLoc
                  ? "ui-chip ui-chip--warn"
                  : linePreparationPartial || lineWithoutCoveringLoc
                    ? "ui-chip ui-chip--warn"
                  : plannedQty > 0
                    ? "ui-chip ui-chip--brand"
                    : "ui-chip"
                : canEditReceiveItems
                  ? linePartialReceipt
                    ? "ui-chip ui-chip--warn"
                    : lineCompleteReceipt
                      ? "ui-chip ui-chip--success"
                      : "ui-chip"
                  : formatStatus(item.item_status).className;
              return (
              <div key={item.id} className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="ui-h3">
                    {item.product?.name ?? item.product_id}
                  </div>
                  <span className={lineStatusClassName}>{lineStatusLabel}</span>
                </div>
                <div className="mt-1 ui-caption">
                  Producto: <span className="font-mono">{item.product_id}</span>
                  {" "}Solicitado: {requestedQty} {item.stock_unit_code ?? item.unit ?? item.product?.unit ?? ""}
                  {" "}· LOC origen: {sourceLocLabel}
                </div>
                {missingSourceLoc ? (
                  <div className="mt-2 ui-alert ui-alert--warn">
                    Esta linea ya tiene cantidad preparada/enviada pero todavía no tiene LOC origen seleccionado.
                  </div>
                ) : null}
                {overSiteStock ? (
                  <div className="mt-2 ui-alert ui-alert--warn">
                    La cantidad preparada/enviada de esta linea supera el stock disponible en la sede origen.
                  </div>
                ) : null}
                {overLocStock ? (
                  <div className="mt-2 ui-alert ui-alert--warn">
                    La cantidad preparada/enviada de esta linea supera el stock del LOC origen seleccionado.
                  </div>
                ) : null}
                {linePreparationPartial ? (
                  <div className="mt-2 ui-alert ui-alert--warn">
                    Esta linea va corta frente a lo solicitado: solicitado {requestedQty}, preparado/enviado {plannedQty}. Si despachas así, la remisión probablemente terminará parcial.
                  </div>
                ) : null}
                {lineWithoutCoveringLoc ? (
                  <div className="mt-2 ui-alert ui-alert--warn">
                    La sede sí tiene stock suficiente para esta linea, pero ningún LOC único cubre {targetQtyForLoc}. Ajusta cantidad o parte la linea para repartir la preparación en más de un LOC.
                  </div>
                ) : null}
                {linePartialReceipt ? (
                  <div className="mt-2 ui-alert ui-alert--warn">
                    Esta linea quedó parcial: enviado {shippedQty}, recibido {receivedQty}, faltante {shortageQty}.
                  </div>
                ) : null}
                {canEditPrepareItems && fromSiteId ? (
                  <div className="mt-2 ui-panel-soft px-3 py-2 text-sm">
                    <span className="font-semibold text-[var(--ui-text)]">Stock en origen:</span>{" "}
                    <span className={stockOk ? "text-[var(--ui-success)]" : "text-[var(--ui-brand-700)]"}>
                      {availableSite} {item.unit ?? item.product?.unit ?? ""}
                    </span>
                    {locLines.length > 0 ? (
                      <span className="ml-2 text-zinc-600">
                        por LOC: {locLines.join(" · ")}
                      </span>
                    ) : null}
                    {item.source_location_id ? (
                      <span className="ml-2 text-zinc-600">
                        seleccionado: {availableAtSelectedLoc}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {canEditPrepareItems && locCandidates.length > 0 ? (
                  <div className="mt-2 ui-panel-soft px-3 py-2 text-sm text-[var(--ui-muted)]">
                    <span className="font-semibold text-[var(--ui-text)]">LOC sugeridos:</span>{" "}
                    {locCandidates.slice(0, 3).map((candidate, index) => {
                      const isBest = index === 0;
                      const isSelected = candidate.locationId === item.source_location_id;
                      const suffix = [
                        isBest ? "recomendado" : "",
                        isSelected ? "seleccionado" : "",
                      ]
                        .filter(Boolean)
                        .join(", ");
                      return (
                        <span key={`${item.id}-${candidate.locationId}`} className="mr-2 inline-flex">
                          {candidate.code}: {candidate.qty}
                          {suffix ? ` (${suffix})` : ""}
                        </span>
                      );
                    })}
                    {selectedLocIsNotBest ? (
                      <span className="block mt-1">
                        El LOC seleccionado no es el que más stock tiene para esta linea.
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {canSplitLine ? (
                  <div className="mt-3 rounded-2xl border border-dashed border-[var(--ui-border)] bg-white px-3 py-3">
                    <div className="text-sm font-semibold text-[var(--ui-text)]">Partir linea</div>
                    <p className="mt-1 ui-caption">
                      Usa este escape hatch de v1 antes de preparar o enviar. Se crea una linea nueva con parte de la cantidad para que puedas asignar otro LOC origen.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <label className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="ui-caption">Cantidad para la nueva linea</span>
                        <input
                          name={`split_quantity_${item.id}`}
                          defaultValue={suggestedSplitQty}
                          inputMode="decimal"
                          step="any"
                          className="ui-input h-10 min-w-0"
                        />
                      </label>
                      <button
                        formAction={splitItem}
                        name="split_item_id"
                        value={item.id}
                        className="ui-btn ui-btn--ghost w-full sm:w-auto"
                      >
                        Partir linea
                      </button>
                    </div>
                    <div className="mt-2 ui-caption">
                      Sugerencia inicial: crear una linea con {suggestedSplitQty} desde {bestLocCandidate?.code ?? "el mejor LOC disponible"} y dejar {remainingSplitQty} en la linea actual.
                    </div>
                  </div>
                ) : null}

                <input type="hidden" name="item_id" value={item.id} />

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  {showSourceLocSelector && canEditPrepareItems ? (
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">LOC origen</span>
                      <select
                        name="source_location_id"
                        defaultValue={item.source_location_id ?? ""}
                        className="ui-input h-12 min-w-0"
                      >
                        <option value="">Selecciona LOC</option>
                        {originLocRows.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.code ?? loc.id}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <input type="hidden" name="source_location_id" value={item.source_location_id ?? ""} />
                  )}
                  {canEditPrepareItems ? (
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Preparado</span>
                      <input
                        name="prepared_quantity"
                        defaultValue={item.prepared_quantity ?? 0}
                        className="ui-input h-10 min-w-0"
                      />
                    </label>
                  ) : null}
                  {canEditPrepareItems ? (
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Enviado</span>
                      <input
                        name="shipped_quantity"
                        defaultValue={item.shipped_quantity ?? 0}
                        className="ui-input h-10 min-w-0"
                      />
                    </label>
                  ) : null}
                  {canEditReceiveItems ? (
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Recibido</span>
                      <input
                        name="received_quantity"
                        defaultValue={item.received_quantity ?? 0}
                        className="ui-input h-10 min-w-0"
                      />
                    </label>
                  ) : null}
                  {canEditReceiveItems ? (
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Faltante</span>
                      <input
                        name="shortage_quantity"
                        defaultValue={item.shortage_quantity ?? 0}
                        className="ui-input h-10 min-w-0"
                      />
                    </label>
                  ) : null}
                  {canEditArea ? (
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Área</span>
                      <select
                        name="item_area_kind"
                        defaultValue={item.production_area_kind ?? ""}
                        className="ui-input h-10 min-w-0"
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
            );
            })}
          </div>

          <div className="sticky bottom-0 z-20 -mx-4 border-t border-[var(--ui-border)] bg-white/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
            <button className="ui-btn ui-btn--brand w-full lg:w-auto">
            {canEditPrepareItems
              ? "Guardar preparación"
              : canEditReceiveItems
                ? "Guardar recepción"
                : "Guardar items"}
          </button>
          </div>
        </form>
      </div>
    </div>
  );
}
