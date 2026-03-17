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

type LocRow = {
  id: string;
  code: string | null;
  zone?: string | null;
  aisle?: string | null;
  level?: string | null;
  description?: string | null;
};

function buildLocFriendlyLabel(loc: Partial<LocRow> | null | undefined): string {
  if (!loc) return "LOC";
  const description = String(loc.description ?? "").trim();
  if (description) return description;
  const parts = [
    String(loc.zone ?? "").trim(),
    String(loc.aisle ?? "").trim() ? `Pasillo ${String(loc.aisle ?? "").trim()}` : "",
    String(loc.level ?? "").trim() ? `Nivel ${String(loc.level ?? "").trim()}` : "",
  ].filter(Boolean);
  return parts.join(" · ") || String(loc.code ?? "").trim() || "LOC";
}

function buildLocDisplayLabel(loc: Partial<LocRow> | null | undefined): string {
  if (!loc) return "LOC";
  const friendly = buildLocFriendlyLabel(loc);
  const code = String(loc.code ?? "").trim();
  return code && friendly !== code ? `${friendly} · ${code}` : friendly;
}

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

  const splitQuantity = parseNumber(
    asText(formData.get(`split_quantity_${itemId}`)) || asText(formData.get("split_quantity"))
  );
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

async function chooseSourceLoc(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const target = asText(formData.get("choose_loc_target"));
  let itemId = "";
  let locationId = "";

  if (target.includes("|")) {
    const [parsedItemId, parsedLocationId] = target.split("|");
    itemId = parsedItemId.trim();
    locationId = parsedLocationId.trim();
  }

  if (!itemId) {
    itemId = asText(formData.get("choose_loc_item_id"));
  }
  if (!locationId) {
    locationId = asText(formData.get("choose_loc_location_id"));
  }
  if (!locationId && itemId) {
    locationId = asText(formData.get(`manual_loc_id_${itemId}`));
  }

  if (!itemId || !locationId) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Selecciona un LOC para continuar.",
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
        error: "Solo puedes elegir LOC mientras la remision esta pendiente o preparando.",
      })
    );
  }

  const fromSiteId = String(request?.from_site_id ?? "").trim();
  if (!fromSiteId) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "No se encontro sede origen para la remision.",
      })
    );
  }

  const { data: itemRow } = await supabase
    .from("restock_request_items")
    .select("id")
    .eq("id", itemId)
    .eq("request_id", requestId)
    .single();
  if (!itemRow) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "La linea seleccionada no pertenece a esta remision.",
      })
    );
  }

  const { data: locRow } = await supabase
    .from("inventory_locations")
    .select("id")
    .eq("id", locationId)
    .eq("site_id", fromSiteId)
    .single();
  if (!locRow) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Ese LOC no pertenece a la sede origen.",
      })
    );
  }

  const { error } = await supabase
    .from("restock_request_items")
    .update({ source_location_id: locationId })
    .eq("id", itemId);

  if (error) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
  }

  redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, ok: "loc_selected" }));
}

async function applyPrepareShortcut(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const target = asText(formData.get("line_shortcut_target"));
  const [itemId, shortcut] = target.split("|").map((value) => value.trim());
  if (!itemId || !shortcut) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "No se pudo aplicar la acción rápida.",
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
        error: "Solo puedes preparar mientras la remision esta pendiente o preparando.",
      })
    );
  }

  const { data: itemRow } = await supabase
    .from("restock_request_items")
    .select("id,product_id,quantity,source_location_id,prepared_quantity,shipped_quantity")
    .eq("id", itemId)
    .eq("request_id", requestId)
    .single();

  if (!itemRow) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "La línea seleccionada no pertenece a esta remision.",
      })
    );
  }

  let nextPrepared = roundQuantity(Number(itemRow.prepared_quantity ?? 0));
  let nextShipped = roundQuantity(Number(itemRow.shipped_quantity ?? 0));
  const requestedQty = roundQuantity(Number(itemRow.quantity ?? 0));
  const sourceLocId = String(itemRow.source_location_id ?? "").trim();

  let availableAtLoc = 0;
  if (shortcut !== "clear_prepare" && shortcut !== "clear_ship") {
    if (!sourceLocId) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Selecciona primero el LOC de origen.",
        })
      );
    }

    const { data: locStockRow } = await supabase
      .from("inventory_stock_by_location")
      .select("current_qty")
      .eq("location_id", sourceLocId)
      .eq("product_id", itemRow.product_id)
      .maybeSingle();

    availableAtLoc = roundQuantity(Number(locStockRow?.current_qty ?? 0));
  }

  switch (shortcut) {
    case "prepare_auto": {
      const suggestedQty = roundQuantity(Math.min(requestedQty, availableAtLoc));
      if (suggestedQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Ese LOC no tiene stock disponible para preparar esta línea.",
          })
        );
      }
      nextPrepared = suggestedQty;
      if (nextShipped > nextPrepared) nextShipped = nextPrepared;
      break;
    }
    case "ship_prepared": {
      if (nextPrepared <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Primero marca cuánto preparas.",
          })
        );
      }
      nextShipped = nextPrepared;
      break;
    }
    case "clear_prepare": {
      nextPrepared = 0;
      nextShipped = 0;
      break;
    }
    case "clear_ship": {
      nextShipped = 0;
      break;
    }
    default:
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Acción rápida no soportada.",
        })
      );
  }

  if (nextPrepared < 0 || nextShipped < 0) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Las cantidades no pueden ser negativas.",
      })
    );
  }
  if (requestedQty > 0 && nextPrepared > requestedQty) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Cantidad preparada (${nextPrepared}) mayor que solicitada (${requestedQty}).`,
      })
    );
  }
  if (requestedQty > 0 && nextShipped > requestedQty) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Cantidad enviada (${nextShipped}) mayor que solicitada (${requestedQty}).`,
      })
    );
  }
  if (nextShipped > nextPrepared) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Cantidad enviada (${nextShipped}) no puede superar la preparada (${nextPrepared}).`,
      })
    );
  }
  if (sourceLocId && Math.max(nextPrepared, nextShipped) > availableAtLoc) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `La cantidad elegida supera el stock disponible en el LOC (${availableAtLoc}).`,
      })
    );
  }

  const { error } = await supabase
    .from("restock_request_items")
    .update({
      prepared_quantity: nextPrepared,
      shipped_quantity: nextShipped,
    })
    .eq("id", itemId);

  if (error) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
  }

  redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, ok: "line_shortcut" }));
}

async function applyReceiveShortcut(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const target = asText(formData.get("line_receive_target"));
  const [itemId, shortcut] = target.split("|").map((value) => value.trim());
  if (!itemId || !shortcut) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "No se pudo aplicar la acción rápida de recepción.",
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
  if (!access.canReceive || !["in_transit", "partial"].includes(currentStatus)) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Solo puedes registrar recepción mientras la remision está en tránsito o parcial.",
      })
    );
  }

  const { data: itemRow } = await supabase
    .from("restock_request_items")
    .select("id,shipped_quantity,received_quantity,shortage_quantity")
    .eq("id", itemId)
    .eq("request_id", requestId)
    .single();

  if (!itemRow) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "La línea seleccionada no pertenece a esta remisión.",
      })
    );
  }

  const shippedQty = roundQuantity(Number(itemRow.shipped_quantity ?? 0));
  let nextReceived = roundQuantity(Number(itemRow.received_quantity ?? 0));
  let nextShortage = roundQuantity(Number(itemRow.shortage_quantity ?? 0));

  switch (shortcut) {
    case "receive_all":
      if (shippedQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Esta línea no tiene envío confirmado todavía.",
          })
        );
      }
      nextReceived = shippedQty;
      nextShortage = 0;
      break;
    case "mark_shortage":
      if (shippedQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Esta línea no tiene envío confirmado todavía.",
          })
        );
      }
      nextShortage = roundQuantity(Math.max(shippedQty - nextReceived, 0));
      break;
    case "clear_receive":
      nextReceived = 0;
      nextShortage = 0;
      break;
    default:
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Acción rápida de recepción no soportada.",
        })
      );
  }

  if (nextReceived < 0 || nextShortage < 0) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Recibido y faltante no pueden ser negativos.",
      })
    );
  }
  if (nextReceived + nextShortage > shippedQty) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Recibido + faltante (${nextReceived + nextShortage}) no puede superar enviado (${shippedQty}).`,
      })
    );
  }

  const { error } = await supabase
    .from("restock_request_items")
    .update({
      received_quantity: nextReceived,
      shortage_quantity: nextShortage,
    })
    .eq("id", itemId);

  if (error) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
  }

  redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, ok: "line_shortcut" }));
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
      : sp.ok === "line_shortcut"
        ? "Línea actualizada."
      : sp.ok === "loc_selected"
        ? "LOC seleccionado."
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
  type StockByLocRow = {
    location_id: string;
    product_id: string;
    current_qty: number | null;
    location?: {
      code: string | null;
      zone?: string | null;
      aisle?: string | null;
      level?: string | null;
      description?: string | null;
    } | null;
  };
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
        .select("id,code,zone,aisle,level,description")
        .eq("site_id", fromSiteId)
        .order("code", { ascending: true })
        .limit(500)
    : { data: [] as LocRow[] };
  const originLocRows = (locsFromSite ?? []) as LocRow[];
  locIdsFromSite = originLocRows.map((row) => row.id);

  const { data: stockByLocData } =
    fromSiteId && locIdsFromSite.length > 0
      ? await supabase
          .from("inventory_stock_by_location")
          .select("location_id,product_id,current_qty,location:inventory_locations(code,zone,aisle,level,description)")
          .in("location_id", locIdsFromSite)
          .gt("current_qty", 0)
      : { data: [] as StockByLocRow[] };
  const stockByLocRows = (stockByLocData ?? []) as StockByLocRow[];
  const stockByLocByProduct = new Map<string, string[]>();
  const stockByLocValueMap = new Map<string, number>();
  const stockByLocCandidates = new Map<
    string,
    Array<{ locationId: string; code: string; label: string; qty: number }>
  >();
  for (const row of stockByLocRows) {
    const code = row.location?.code ?? row.location_id?.slice(0, 8) ?? "";
    const label = buildLocFriendlyLabel(row.location);
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
      label,
      qty,
    });
  }
  for (const candidates of stockByLocCandidates.values()) {
    candidates.sort((a, b) => b.qty - a.qty || a.code.localeCompare(b.code));
  }
  const originLocById = new Map(originLocRows.map((row) => [row.id, row]));
  const lineIdsByProduct = new Map<string, string[]>();
  for (const item of itemRows) {
    if (!lineIdsByProduct.has(item.product_id)) lineIdsByProduct.set(item.product_id, []);
    lineIdsByProduct.get(item.product_id)!.push(item.id);
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
  const isProductionView = access.fromSiteType === "production_center" && access.canPrepare;
  const isSatelliteView = access.toSiteType === "satellite" && access.canReceive;
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
  const dispatchReadyLines = itemRows.filter(
    (item) => roundQuantity(Number(item.shipped_quantity ?? 0)) > 0
  ).length;
  const dispatchBlockedLines = itemRows.filter((item) => {
    const requestedQty = roundQuantity(Number(item.quantity ?? 0));
    const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
    return canEditPrepareItems && requestedQty > 0 && shippedQty <= 0;
  }).length;
  const canTransitNow = canTransitAction && dispatchReadyLines > 0 && dispatchBlockedLines === 0;
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
  const phaseLabel = canEditPrepareItems
    ? "Preparacion en Centro"
    : canEditReceiveItems
      ? "Recepcion en destino"
      : formatStatus(request.status).label;
  const roleFlowLabel = isProductionView
    ? "Centro solo prepara y despacha."
    : isSatelliteView
      ? "Tu sede solo recibe y confirma."
      : "Vista operativa";
  const activeSignals = canEditPrepareItems
    ? linesMissingSourceLoc + linesPartialPreparation + linesWithoutCoveringLoc
    : canEditReceiveItems
      ? pendingReceiptLines + shortageLines
      : 0;

  return (
    <div className="ui-scene w-full space-y-6 pb-28 lg:pb-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid">
          <div>
            <Link href={backHref} className="ui-caption underline">
              {backLabel}
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="ui-chip ui-chip--brand">{phaseLabel}</span>
              <span className={formatStatus(request.status).className}>
                {formatStatus(request.status).label}
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
              Remision #{String(request.id).slice(0, 8)}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-muted)] sm:text-base">
              {access.fromSiteName || "-"} → {access.toSiteName || "-"}
            </p>
          </div>
          <div className="ui-remission-kpis">
            <div className="ui-remission-kpi">
              <div className="ui-remission-kpi-label">Actor actual</div>
              <div className="mt-2 text-base font-semibold text-[var(--ui-text)]">{responsibleActor}</div>
              <div className="ui-remission-kpi-note">Responsable operativo visible</div>
            </div>
            <div className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Lineas</div>
              <div className="ui-remission-kpi-value">{itemRows.length}</div>
              <div className="ui-remission-kpi-note">Items dentro de la remision</div>
            </div>
            <div className="ui-remission-kpi" data-tone={activeSignals > 0 ? "warm" : "success"}>
              <div className="ui-remission-kpi-label">Señales activas</div>
              <div className="ui-remission-kpi-value">{activeSignals}</div>
              <div className="ui-remission-kpi-note">
                {request.expected_date
                  ? `Entrega esperada ${formatDate(request.expected_date ?? null)}`
                  : "Sin fecha esperada"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mt-1 ui-caption">
            {roleFlowLabel} Vista: {access.fromSiteType === "production_center" ? "Bodega (Centro)" : "Sede satelite"}.
          </p>
        </div>
      </div>

      {errorMsg ? (
        <div className="ui-alert ui-alert--error ui-fade-up ui-delay-1">
          Error: {errorMsg}
        </div>
      ) : null}

      {okMsg ? (
        <div className="ui-alert ui-alert--success ui-fade-up ui-delay-1">{okMsg}</div>
      ) : null}

      {lowStockWarning ? (
        <div className="ui-alert ui-alert--warn ui-fade-up ui-delay-1">
          Algunos productos pueden no tener stock suficiente en Centro. Bodega verificara al preparar.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_0.9fr]">
        <div className="ui-panel ui-remission-section ui-fade-up ui-delay-1">
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

        <div className="ui-panel ui-panel--halo ui-remission-section ui-fade-up ui-delay-2">
          <div className="ui-h3">Estado</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={formatStatus(request.status).className}>
              {formatStatus(request.status).label}
            </span>
            <span className="ui-chip">{phaseLabel}</span>
          </div>
          <div className="mt-3 ui-caption">
            Actor actual: <strong>{responsibleActor}</strong>
          </div>
          <div className="mt-3 ui-caption">
            {canEditPrepareItems
              ? "Centro prepara y confirma lo que sale."
              : canEditReceiveItems
                ? "Tu sede registra lo recibido y, si hace falta, el faltante."
                : "Sin acciones operativas pendientes."}
          </div>
        </div>
      </div>

      {currentStatus === "partial" ? (
        <div className="ui-alert ui-alert--warn ui-fade-up ui-delay-2">
          Recepción parcial activa. Hay <strong>{pendingReceiptLines}</strong> linea(s) con cantidades todavía por conciliar y <strong>{shortageLines}</strong> con faltante registrado.
          {receivedLines > 0 ? ` También hay ${receivedLines} linea(s) con recepción registrada.` : ""}
        </div>
      ) : null}

      {currentStatus === "closed" ? (
        <div className="ui-alert ui-alert--neutral ui-fade-up ui-delay-2">
          Esta remisión viene de una lógica anterior con estado <strong>closed</strong>. Para operación v1 se interpreta como remisión ya recibida.
        </div>
      ) : null}

      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-2">
        <div className="ui-h3">
          {isProductionView ? "Siguiente accion en Centro" : isSatelliteView ? "Siguiente accion en tu sede" : "Acciones"}
        </div>
        <form action={updateStatus} className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <input type="hidden" name="request_id" value={request.id} />
          <input type="hidden" name="return_origin" value={cameFromPrepareQueue ? "prepare" : ""} />
          {canPrepareAction ? (
            <button
              name="action"
              value="prepare"
              className="ui-btn ui-btn--ghost h-12 w-full text-sm font-semibold md:w-auto md:min-w-[220px] md:px-5 md:text-[15px]"
            >
              Empezar preparacion
            </button>
          ) : null}
          {canTransitAction ? (
            canTransitNow ? (
              <button
                name="action"
                value="transit"
                className="ui-btn ui-btn--brand h-12 w-full text-sm font-semibold md:w-auto md:min-w-[220px] md:px-5 md:text-[15px]"
              >
                Despachar a destino
              </button>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Aún no puedes despachar. Faltan <strong>{dispatchBlockedLines}</strong> linea(s) por completar.
              </div>
            )
          ) : null}
          {canReceiveAction ? (
            <button
              name="action"
              value="receive"
              className="ui-btn ui-btn--brand h-12 w-full text-sm font-semibold md:w-auto md:min-w-[220px] md:px-5 md:text-[15px]"
            >
              Confirmar recepción
            </button>
          ) : null}
          {canReceivePartialAction ? (
            <button
              name="action"
              value="receive_partial"
              className="ui-btn ui-btn--ghost h-12 w-full text-sm font-semibold md:w-auto md:min-w-[220px] md:px-5 md:text-[15px]"
            >
              Guardar recepcion parcial
            </button>
          ) : null}
          {canCancelAction ? (
            <button
              name="action"
              value="cancel"
              className="ui-btn ui-btn--ghost h-12 w-full text-sm font-semibold md:w-auto md:px-5 md:text-[15px]"
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
      </div>

      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-3">
        <div className="ui-h3">
          {canEditPrepareItems
            ? "Preparar salida"
            : canEditReceiveItems
              ? "Recibir remision"
              : "Items de la remision"}
        </div>
        <form action={updateItems} className="mt-4 space-y-4 pb-24 lg:pb-0">
          <input type="hidden" name="request_id" value={request.id} />
          <input type="hidden" name="return_origin" value={cameFromPrepareQueue ? "prepare" : ""} />

          <div className="space-y-3">
            {itemRows.map((item) => {
              const requestedQty = roundQuantity(Number(item.quantity ?? 0));
              const availableSite = stockBySiteMap.get(item.product_id) ?? 0;
              const lineIdsForProduct = lineIdsByProduct.get(item.product_id) ?? [item.id];
              const splitLineIndex = Math.max(lineIdsForProduct.indexOf(item.id), 0) + 1;
              const plannedQtyPreview = Math.max(
                roundQuantity(Number(item.prepared_quantity ?? 0)),
                roundQuantity(Number(item.shipped_quantity ?? 0)),
              );
              const targetQtyForOrdering = plannedQtyPreview > 0 ? plannedQtyPreview : requestedQty;
              const locCandidates = [...(stockByLocCandidates.get(item.product_id) ?? [])].sort((a, b) => {
                const aCovers = a.qty >= targetQtyForOrdering;
                const bCovers = b.qty >= targetQtyForOrdering;
                if (aCovers && !bCovers) return -1;
                if (!aCovers && bCovers) return 1;
                if (aCovers && bCovers) {
                  const aSlack = a.qty - targetQtyForOrdering;
                  const bSlack = b.qty - targetQtyForOrdering;
                  return aSlack - bSlack || a.code.localeCompare(b.code);
                }
                return b.qty - a.qty || a.code.localeCompare(b.code);
              });
              const quickLocCandidates = locCandidates.slice(0, 3);
              const bestLocCandidate = locCandidates[0] ?? null;
              const selectedOriginLoc = item.source_location_id
                ? originLocById.get(item.source_location_id) ?? null
                : null;
              const selectedOriginLabel = item.source_location_id
                ? buildLocDisplayLabel(selectedOriginLoc ?? {
                    id: item.source_location_id,
                    code: null,
                    description: locCandidates.find((candidate) => candidate.locationId === item.source_location_id)?.label ?? null,
                  })
                : "";
              const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
              const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
              const receivedQty = roundQuantity(Number(item.received_quantity ?? 0));
              const shortageQty = roundQuantity(Number(item.shortage_quantity ?? 0));
              const plannedQty = Math.max(preparedQty, shippedQty);
              const accountedQty = roundQuantity(receivedQty + shortageQty);
              const stockOk = availableSite >= (item.quantity ?? 0);
              const availableAtSelectedLoc = item.source_location_id
                ? stockByLocValueMap.get(`${item.source_location_id}|${item.product_id}`) ?? 0
                : 0;
              const itemUnitLabel =
                item.stock_unit_code ?? item.unit ?? item.product?.unit ?? "";
              const quickPrepareQty = roundQuantity(
                Math.min(requestedQty, Math.max(availableAtSelectedLoc, 0))
              );
              const quickPrepareText =
                quickPrepareQty > 0
                  ? quickPrepareQty < requestedQty
                    ? `Preparar ${quickPrepareQty} ${itemUnitLabel}`
                    : `Preparar ${requestedQty} ${itemUnitLabel}`
                  : "Sin stock en este LOC";
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
              const remainingReceiptQty = roundQuantity(Math.max(shippedQty - receivedQty, 0));
              const splitFormId = `split-line-form-${item.id}`;
              const manualLocFormId = `manual-loc-form-${item.id}`;
              const prepareShortcutFormId = `prepare-shortcut-form-${item.id}`;
              const clearPrepareShortcutFormId = `clear-prepare-shortcut-form-${item.id}`;
              const shipShortcutFormId = `ship-shortcut-form-${item.id}`;
              const clearShipShortcutFormId = `clear-ship-shortcut-form-${item.id}`;
              const receiveAllShortcutFormId = `receive-all-shortcut-form-${item.id}`;
              const markShortageShortcutFormId = `mark-shortage-shortcut-form-${item.id}`;
              const clearReceiveShortcutFormId = `clear-receive-shortcut-form-${item.id}`;
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
              const prepareStepLabel = !item.source_location_id
                ? "Paso 1: elige el LOC"
                : preparedQty <= 0
                  ? "Paso 2: indica cuánto preparas"
                  : shippedQty <= 0
                    ? "Paso 3: confirma cuánto sale"
                    : "Lista para despacho";
              const receiveStepLabel =
                receivedQty <= 0 && shortageQty <= 0
                  ? "Paso 1: registra lo recibido"
                  : linePartialReceipt
                    ? "Pendiente de conciliación"
                    : "Línea conciliada";
              const stepLabel = canEditPrepareItems
                ? prepareStepLabel
                : canEditReceiveItems
                  ? receiveStepLabel
                  : lineStatusLabel;
              const primaryHint = canEditPrepareItems
                ? overSiteStock
                    ? "La cantidad supera el stock total de la sede."
                    : overLocStock
                      ? "La cantidad supera el stock del LOC elegido."
                      : lineWithoutCoveringLoc
                        ? "Ningún LOC alcanza solo. Divide esta línea y sigue."
                        : linePreparationPartial
                          ? "La preparación va corta frente a lo solicitado."
                          : ""
                : canEditReceiveItems
                  ? linePartialReceipt
                    ? `Van ${receivedQty} ${itemUnitLabel} recibidas y ${shortageQty} ${itemUnitLabel} faltantes.`
                    : ""
                  : "";
              const nextTaskLabel = canEditPrepareItems
                ? canSplitLine
                  ? "Divide esta línea"
                  : !item.source_location_id
                    ? "Ahora: elegir LOC"
                    : shippedQty > 0
                      ? "Lista"
                      : preparedQty > 0
                        ? "Ahora: confirmar salida"
                        : "Ahora: marcar preparación"
                : canEditReceiveItems
                  ? lineCompleteReceipt
                    ? "Lista"
                    : "Ahora: recibir"
                  : stepLabel;
              return (
              <div key={item.id} className="rounded-[28px] border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="ui-h3">{item.product?.name ?? item.product_id}</div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-[15px] font-semibold text-amber-950 shadow-sm">
                        {requestedQty} {itemUnitLabel} por preparar
                      </span>
                      {lineIdsForProduct.length > 1 ? (
                        <span className="rounded-full border border-[var(--ui-border)] bg-white px-3 py-1 text-[13px] font-semibold text-[var(--ui-text)] shadow-sm">
                          Línea {splitLineIndex} de {lineIdsForProduct.length}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[13px] font-semibold text-slate-700 shadow-sm">
                        {nextTaskLabel}
                      </span>
                    </div>
                  </div>
                  <span className={lineStatusClassName}>{lineStatusLabel}</span>
                </div>
                {primaryHint ? (
                  <div className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-white px-3 py-3 text-sm text-[var(--ui-muted)]">
                    {primaryHint}
                  </div>
                ) : null}
                {canSplitLine ? (
                  <div className="mt-3 rounded-2xl border border-dashed border-[var(--ui-border)] bg-white px-4 py-4">
                    <div className="text-sm font-semibold text-[var(--ui-text)]">Ningún LOC alcanza solo</div>
                    <p className="mt-1 ui-caption">
                      Divide automáticamente esta línea para seguir con dos líneas más simples.
                    </p>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="rounded-2xl bg-[var(--ui-bg-soft)] px-3 py-3 text-sm text-[var(--ui-muted)]">
                        {suggestedSplitQty} {itemUnitLabel} desde {bestLocCandidate?.label ?? "el mejor LOC"} y {remainingSplitQty} {itemUnitLabel} en la línea restante.
                      </div>
                      <input
                        type="hidden"
                        name={`split_quantity_${item.id}`}
                        value={suggestedSplitQty}
                        form={splitFormId}
                      />
                      <button
                        type="submit"
                        form={splitFormId}
                        className="ui-btn ui-btn--brand h-12 w-full px-5 text-base font-semibold sm:w-auto"
                      >
                        Dividir automáticamente
                      </button>
                    </div>
                  </div>
                ) : null}

                <input type="hidden" name="item_id" value={item.id} />

                <div className="mt-4 space-y-3">
                  {showSourceLocSelector && canEditPrepareItems && !canSplitLine ? (
                    <>
                      <input type="hidden" name="source_location_id" value={item.source_location_id ?? ""} />
                      <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-[var(--ui-text)]">
                              {item.source_location_id ? "Sale desde" : "Paso 1 · Elige de dónde sale"}
                            </div>
                            <div className="text-sm text-[var(--ui-muted)]">
                              {item.source_location_id ? "Disponible en este LOC:" : "Stock total en origen:"}{" "}
                              <span className={stockOk ? "font-semibold text-[var(--ui-success)]" : "font-semibold text-[var(--ui-brand-700)]"}>
                                {item.source_location_id ? availableAtSelectedLoc : availableSite} {itemUnitLabel}
                              </span>
                            </div>
                          </div>
                          {item.source_location_id ? (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
                              {selectedOriginLabel}
                            </div>
                          ) : null}
                        </div>

                        {!item.source_location_id && quickLocCandidates.length > 0 ? (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {quickLocCandidates.map((candidate, index) => {
                              const isBest = index === 0;
                              const isSelected = candidate.locationId === item.source_location_id;
                              return (
                                <button
                                  key={`${item.id}-${candidate.locationId}`}
                                  type="submit"
                                  form={`choose-loc-form-${item.id}-${candidate.locationId}`}
                                  className={`rounded-2xl border px-4 py-4 text-left shadow-sm transition ${
                                    isSelected
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                                      : isBest
                                        ? "border-amber-200 bg-amber-50 text-[var(--ui-text)] hover:border-amber-300 hover:bg-amber-100"
                                        : "border-[var(--ui-border)] bg-[var(--ui-bg-soft)] text-[var(--ui-text)] hover:border-[var(--ui-brand)] hover:bg-white"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-base font-semibold">{candidate.label}</span>
                                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                      isSelected
                                        ? "bg-emerald-200 text-emerald-900"
                                        : isBest
                                          ? "bg-amber-200 text-amber-900"
                                          : "bg-white text-[var(--ui-muted)]"
                                    }`}>
                                      {isSelected ? "Elegido" : isBest ? "Recomendado" : "Disponible"}
                                    </span>
                                  </div>
                                  <div className="mt-2 text-sm text-[var(--ui-muted)]">
                                    {candidate.qty} {itemUnitLabel} disponibles
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3 text-sm text-[var(--ui-muted)]">
                            No hay LOC con stock para este producto.
                          </div>
                        )}

                        {!item.source_location_id && selectedLocIsNotBest && bestLocCandidate ? (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                            Hay un LOC que cubre mejor esta línea: <strong>{bestLocCandidate.label}</strong>.
                          </div>
                        ) : null}

                        <details className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
                          <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                            {item.source_location_id ? "Cambiar LOC" : "Ver más LOCs"}
                          </summary>
                          <div className="mt-3 flex flex-col gap-3 md:max-w-xl">
                            <label className="flex flex-col gap-1">
                              <span className="ui-caption">Otro LOC</span>
                              <select
                                name={`manual_loc_id_${item.id}`}
                                form={manualLocFormId}
                                defaultValue={item.source_location_id ?? ""}
                                className="ui-input h-12 min-w-0"
                              >
                                <option value="">Selecciona LOC</option>
                                {originLocRows.map((loc) => (
                                  <option key={loc.id} value={loc.id}>
                                    {buildLocDisplayLabel(loc)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="submit"
                              form={manualLocFormId}
                              className="ui-btn ui-btn--ghost h-12 w-full text-base font-semibold md:w-auto"
                            >
                              Usar este LOC
                            </button>
                          </div>
                        </details>
                      </div>
                    </>
                  ) : (
                    <input type="hidden" name="source_location_id" value={item.source_location_id ?? ""} />
                  )}
                  <div className="space-y-3">
                    {canEditPrepareItems && item.source_location_id ? (
                      shippedQty > 0 ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                          <div className="text-sm font-semibold text-emerald-950">Hecha</div>
                          <div className="mt-1 text-sm text-emerald-900">
                            Ya quedaron marcadas {shippedQty} {itemUnitLabel} para esta línea.
                          </div>
                          <details className="mt-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3">
                            <summary className="cursor-pointer text-sm font-semibold text-emerald-950">
                              Cambiar esta línea
                            </summary>
                            <div className="mt-3 flex flex-wrap gap-3">
                              <button
                                type="submit"
                                form={clearShipShortcutFormId}
                                className="ui-btn ui-btn--ghost h-12 px-5 text-base font-semibold"
                              >
                                Limpiar envío
                              </button>
                            </div>
                          </details>
                        </div>
                      ) : preparedQty > 0 ? (
                        <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                          <div className="text-sm font-semibold text-[var(--ui-text)]">Ahora: confirmar salida</div>
                          <div className="mt-1 text-sm text-[var(--ui-muted)]">
                            Ya separaste {preparedQty} {itemUnitLabel}. Solo falta confirmar la salida.
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3">
                            <button
                              type="submit"
                              form={shipShortcutFormId}
                              className="ui-btn ui-btn--brand h-12 px-5 text-base font-semibold"
                            >
                              Enviar {preparedQty} {itemUnitLabel}
                            </button>
                            <button
                              type="submit"
                              form={clearPrepareShortcutFormId}
                              className="ui-btn ui-btn--ghost h-12 px-5 text-base font-semibold"
                            >
                              Volver atrás
                            </button>
                          </div>
                          <details className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
                            <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                              Ajustar manualmente
                            </summary>
                            <div className="mt-3">
                              <label className="flex flex-col gap-1">
                                <span className="ui-caption">Enviado</span>
                                <input
                                  name="shipped_quantity"
                                  defaultValue={item.shipped_quantity ?? 0}
                                  className="ui-input h-12 min-w-0"
                                />
                              </label>
                            </div>
                          </details>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                          <div className="text-sm font-semibold text-[var(--ui-text)]">Ahora: marcar preparación</div>
                          <div className="mt-1 text-sm text-[var(--ui-muted)]">
                            Usa el LOC elegido y marca la cantidad para esta línea.
                          </div>
                          <div className="mt-3 flex flex-wrap gap-3">
                            <button
                              type="submit"
                              form={prepareShortcutFormId}
                              className="ui-btn ui-btn--brand h-12 px-5 text-base font-semibold"
                              disabled={quickPrepareQty <= 0}
                            >
                              {quickPrepareText}
                            </button>
                          </div>
                          <details className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
                            <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                              Ajustar manualmente
                            </summary>
                            <div className="mt-3">
                              <label className="flex flex-col gap-1">
                                <span className="ui-caption">Preparado</span>
                                <input
                                  name="prepared_quantity"
                                  defaultValue={item.prepared_quantity ?? 0}
                                  className="ui-input h-12 min-w-0"
                                />
                              </label>
                            </div>
                          </details>
                        </div>
                      )
                    ) : canEditPrepareItems ? (
                      <>
                        <input type="hidden" name="prepared_quantity" value={item.prepared_quantity ?? 0} />
                        <input type="hidden" name="shipped_quantity" value={item.shipped_quantity ?? 0} />
                      </>
                    ) : null}
                    {canEditReceiveItems ? (
                      <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4">
                        <div className="text-sm font-semibold text-[var(--ui-text)]">
                          {lineCompleteReceipt ? "Hecha" : "Ahora: recibir"}
                        </div>
                        <div className="mt-1 text-sm text-[var(--ui-muted)]">
                          {lineCompleteReceipt
                            ? `Recepción completa: ${receivedQty} ${itemUnitLabel}.`
                            : linePartialReceipt
                              ? `Van ${receivedQty} ${itemUnitLabel} recibidas.`
                              : shippedQty > 0
                                ? `${shippedQty} ${itemUnitLabel} salieron hacia esta sede.`
                                : "Esta línea todavía no tiene envío confirmado."}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3">
                          <button
                            type="submit"
                            form={receiveAllShortcutFormId}
                            className="ui-btn ui-btn--brand h-12 px-5 text-base font-semibold"
                            disabled={shippedQty <= 0}
                          >
                            {shippedQty > 0 ? `Recibir ${shippedQty} ${itemUnitLabel}` : "Recibir todo"}
                          </button>
                          {shippedQty > 0 && remainingReceiptQty > 0 ? (
                            <button
                              type="submit"
                              form={markShortageShortcutFormId}
                              className="ui-btn ui-btn--ghost h-12 px-5 text-base font-semibold"
                            >
                              Marcar faltante {remainingReceiptQty} {itemUnitLabel}
                            </button>
                          ) : null}
                          {accountedQty > 0 ? (
                            <button
                              type="submit"
                              form={clearReceiveShortcutFormId}
                              className="ui-btn ui-btn--ghost h-12 px-5 text-base font-semibold"
                            >
                              Limpiar
                            </button>
                          ) : null}
                        </div>
                        <details className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] px-4 py-3">
                          <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                            Ajustar manualmente
                          </summary>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="flex flex-col gap-1">
                              <span className="ui-caption">Recibido</span>
                              <input
                                name="received_quantity"
                                defaultValue={item.received_quantity ?? 0}
                                className="ui-input h-12 min-w-0"
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="ui-caption">Faltante</span>
                              <input
                                name="shortage_quantity"
                                defaultValue={item.shortage_quantity ?? 0}
                                className="ui-input h-12 min-w-0"
                              />
                            </label>
                          </div>
                        </details>
                      </div>
                    ) : null}
                  </div>
                </div>
                {canEditArea ? (
                  <details className="mt-3 rounded-2xl border border-[var(--ui-border)] bg-white px-3 py-3">
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
                      Opciones avanzadas
                    </summary>
                    <div className="mt-3 max-w-xs">
                      <label className="flex flex-col gap-1">
                        <span className="ui-caption">Área</span>
                        <select
                          name="item_area_kind"
                          defaultValue={item.production_area_kind ?? ""}
                          className="ui-input h-12 min-w-0"
                        >
                          <option value="">(sin area)</option>
                          {areaKindRows.map((row) => (
                            <option key={row.code} value={row.code}>
                              {row.name ?? row.code}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </details>
                ) : null}
                {!canEditArea ? (
                  <input type="hidden" name="item_area_kind" value={item.production_area_kind ?? ""} />
                ) : null}
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

        {canEditPrepareItems || canEditReceiveItems ? (
          <div className="hidden" aria-hidden="true">
            {itemRows.map((item) => {
              const locCandidates = stockByLocCandidates.get(item.product_id) ?? [];
              const quickLocCandidates = locCandidates.slice(0, 3);
              const requestedQty = roundQuantity(Number(item.quantity ?? 0));
              const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
              const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
              const receivedQty = roundQuantity(Number(item.received_quantity ?? 0));
              const shortageQty = roundQuantity(Number(item.shortage_quantity ?? 0));
              const targetQtyForLoc = Math.max(preparedQty, shippedQty) > 0 ? Math.max(preparedQty, shippedQty) : requestedQty;
              const availableSite = stockBySiteMap.get(item.product_id) ?? 0;
              const bestLocCandidate = locCandidates[0] ?? null;
              const lineWithoutCoveringLoc =
                targetQtyForLoc > 0 &&
                targetQtyForLoc <= availableSite &&
                (bestLocCandidate?.qty ?? 0) < targetQtyForLoc;
              const canSplitLine =
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
              const splitFormId = `split-line-form-${item.id}`;
              const manualLocFormId = `manual-loc-form-${item.id}`;

              return (
                <div key={`hidden-actions-${item.id}`}>
                  {canEditPrepareItems && canSplitLine ? (
                    <form key={splitFormId} id={splitFormId} action={splitItem}>
                      <input type="hidden" name="request_id" value={request.id} />
                      <input
                        type="hidden"
                        name="return_origin"
                        value={cameFromPrepareQueue ? "prepare" : ""}
                      />
                      <input type="hidden" name="split_item_id" value={item.id} />
                      <input type="hidden" name="split_quantity" value={suggestedSplitQty} />
                    </form>
                  ) : null}

                  {canEditPrepareItems && !canSplitLine ? (
                    <>
                      <form id={manualLocFormId} action={chooseSourceLoc}>
                        <input type="hidden" name="request_id" value={request.id} />
                        <input
                          type="hidden"
                          name="return_origin"
                          value={cameFromPrepareQueue ? "prepare" : ""}
                        />
                        <input type="hidden" name="choose_loc_item_id" value={item.id} />
                      </form>

                      {quickLocCandidates.map((candidate) => {
                        const formId = `choose-loc-form-${item.id}-${candidate.locationId}`;
                        return (
                          <form key={formId} id={formId} action={chooseSourceLoc}>
                            <input type="hidden" name="request_id" value={request.id} />
                            <input
                              type="hidden"
                              name="return_origin"
                              value={cameFromPrepareQueue ? "prepare" : ""}
                            />
                            <input type="hidden" name="choose_loc_item_id" value={item.id} />
                            <input
                              type="hidden"
                              name="choose_loc_location_id"
                              value={candidate.locationId}
                            />
                          </form>
                        );
                      })}
                    </>
                  ) : null}

                  {canEditPrepareItems ? (
                    <>
                      <form id={`prepare-shortcut-form-${item.id}`} action={applyPrepareShortcut}>
                        <input type="hidden" name="request_id" value={request.id} />
                        <input
                          type="hidden"
                          name="return_origin"
                          value={cameFromPrepareQueue ? "prepare" : ""}
                        />
                        <input type="hidden" name="line_shortcut_target" value={`${item.id}|prepare_auto`} />
                      </form>
                      <form id={`clear-prepare-shortcut-form-${item.id}`} action={applyPrepareShortcut}>
                        <input type="hidden" name="request_id" value={request.id} />
                        <input
                          type="hidden"
                          name="return_origin"
                          value={cameFromPrepareQueue ? "prepare" : ""}
                        />
                        <input type="hidden" name="line_shortcut_target" value={`${item.id}|clear_prepare`} />
                      </form>
                      <form id={`ship-shortcut-form-${item.id}`} action={applyPrepareShortcut}>
                        <input type="hidden" name="request_id" value={request.id} />
                        <input
                          type="hidden"
                          name="return_origin"
                          value={cameFromPrepareQueue ? "prepare" : ""}
                        />
                        <input type="hidden" name="line_shortcut_target" value={`${item.id}|ship_prepared`} />
                      </form>
                      <form id={`clear-ship-shortcut-form-${item.id}`} action={applyPrepareShortcut}>
                        <input type="hidden" name="request_id" value={request.id} />
                        <input
                          type="hidden"
                          name="return_origin"
                          value={cameFromPrepareQueue ? "prepare" : ""}
                        />
                        <input type="hidden" name="line_shortcut_target" value={`${item.id}|clear_ship`} />
                      </form>
                    </>
                  ) : null}
                  {canEditReceiveItems ? (
                    <>
                      <form id={`receive-all-shortcut-form-${item.id}`} action={applyReceiveShortcut}>
                        <input type="hidden" name="request_id" value={request.id} />
                        <input
                          type="hidden"
                          name="return_origin"
                          value={cameFromPrepareQueue ? "prepare" : ""}
                        />
                        <input type="hidden" name="line_receive_target" value={`${item.id}|receive_all`} />
                      </form>
                      <form id={`mark-shortage-shortcut-form-${item.id}`} action={applyReceiveShortcut}>
                        <input type="hidden" name="request_id" value={request.id} />
                        <input
                          type="hidden"
                          name="return_origin"
                          value={cameFromPrepareQueue ? "prepare" : ""}
                        />
                        <input type="hidden" name="line_receive_target" value={`${item.id}|mark_shortage`} />
                      </form>
                      <form id={`clear-receive-shortcut-form-${item.id}`} action={applyReceiveShortcut}>
                        <input type="hidden" name="request_id" value={request.id} />
                        <input
                          type="hidden"
                          name="return_origin"
                          value={cameFromPrepareQueue ? "prepare" : ""}
                        />
                        <input type="hidden" name="line_receive_target" value={`${item.id}|clear_receive`} />
                      </form>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
