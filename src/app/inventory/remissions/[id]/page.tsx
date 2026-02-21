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
      return { label: "Parcial", className: "ui-chip ui-chip--warn" };
    case "received":
      return { label: "Recibida", className: "ui-chip ui-chip--success" };
    case "closed":
      return { label: "Cerrada", className: "ui-chip ui-chip--success" };
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
  if (!user) {
    redirect(await buildShellLoginUrl(`/inventory/remissions/${requestId}`));
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
  const allowStatus =
    (access.canCancel || access.canPrepare || access.canReceive) &&
    !["closed", "cancelled"].includes(currentStatus);
  const allowArea = access.canCancel || allowPrepared;

  const itemIds = formData.getAll("item_id").map((v) => String(v).trim());
  const prepared = formData.getAll("prepared_quantity").map((v) => String(v).trim());
  const shipped = formData.getAll("shipped_quantity").map((v) => String(v).trim());
  const received = formData.getAll("received_quantity").map((v) => String(v).trim());
  const shortage = formData.getAll("shortage_quantity").map((v) => String(v).trim());
  const statuses = formData.getAll("item_status").map((v) => String(v).trim());
  const areaKinds = formData.getAll("item_area_kind").map((v) => String(v).trim());
  const sourceLocationIds = formData
    .getAll("source_location_id")
    .map((v) => String(v).trim());

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
    const { data: itemsRows } = await supabase
      .from("restock_request_items")
      .select("id,product_id")
      .eq("request_id", requestId);
    const productById = new Map((itemsRows ?? []).map((r: { id: string; product_id: string }) => [r.id, r.product_id]));

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
      const productId = productById.get(itemId);
      if (!productId) continue;
      const available = stockMap.get(productId) ?? 0;
      const prepQty = parseNumber(prepared[i] ?? "0");
      const shipQty = parseNumber(shipped[i] ?? "0");
      const maxQty = Math.max(prepQty, shipQty);
      if (maxQty > available) {
        redirect(
          `/inventory/remissions/${requestId}?error=` +
            encodeURIComponent(
              `Cantidad preparada/enviada (${maxQty}) mayor que stock disponible en origen (${available}). Ajusta las cantidades.`
            )
        );
      }
      if (allowSourceLocation && maxQty > 0) {
        const sourceLocId = sourceLocationIds[i] || "";
        if (!sourceLocId) {
          redirect(
            `/inventory/remissions/${requestId}?error=` +
              encodeURIComponent("Selecciona LOC origen para todos los items preparados/enviados.")
          );
        }
        const availableAtLoc = locStockMap.get(`${sourceLocId}|${productId}`) ?? 0;
        if (maxQty > availableAtLoc) {
          redirect(
            `/inventory/remissions/${requestId}?error=` +
              encodeURIComponent(
                `Cantidad preparada/enviada (${maxQty}) mayor que disponible en LOC origen (${availableAtLoc}).`
              )
          );
        }
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
    .select("from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request);
  const currentStatus = String(request?.status ?? "");

  if (action === "prepare" && !access.canPrepare) {
    redirect(`/inventory/remissions/${requestId}?error=` + encodeURIComponent("No puedes preparar."));
  }

  if (action === "transit" && !access.canTransit) {
    redirect(`/inventory/remissions/${requestId}?error=` + encodeURIComponent("No puedes enviar."));
  }

  if (action === "receive" && !access.canReceive) {
    redirect(`/inventory/remissions/${requestId}?error=` + encodeURIComponent("No puedes recibir."));
  }

  if (action === "receive_partial" && !access.canReceive) {
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

  if (action === "prepare" && currentStatus !== "pending") {
    redirect(
      `/inventory/remissions/${requestId}?error=` +
        encodeURIComponent("Solo puedes preparar una remision pendiente.")
    );
  }
  if (action === "transit" && currentStatus !== "preparing") {
    redirect(
      `/inventory/remissions/${requestId}?error=` +
        encodeURIComponent("Solo puedes enviar una remision en estado preparando.")
    );
  }
  if (
    (action === "receive" || action === "receive_partial") &&
    !["in_transit", "partial"].includes(currentStatus)
  ) {
    redirect(
      `/inventory/remissions/${requestId}?error=` +
        encodeURIComponent("La remision debe estar en transito/parcial para recibir.")
    );
  }
  if (action === "receive_partial" && currentStatus !== "in_transit") {
    redirect(
      `/inventory/remissions/${requestId}?error=` +
        encodeURIComponent("Solo puedes registrar recepcion parcial desde en transito.")
    );
  }
  if (action === "close" && !["received", "partial"].includes(currentStatus)) {
    redirect(
      `/inventory/remissions/${requestId}?error=` +
        encodeURIComponent("Solo puedes cerrar una remision recibida o parcial.")
    );
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

      for (const row of itemRows) {
        const qty = roundQuantity(
          Number(
            (row.shipped_quantity ?? 0) > 0
              ? row.shipped_quantity
              : (row.prepared_quantity ?? 0) > 0
                ? row.prepared_quantity
                : row.quantity ?? 0
          )
        );
        if (qty <= 0) continue;
        const sourceLocId = row.source_location_id ?? "";
        if (!sourceLocId) {
          redirect(
            `/inventory/remissions/${requestId}?error=` +
              encodeURIComponent("Falta LOC origen en uno o mas items para enviar.")
          );
        }
        const availableAtLoc = locStockMap.get(`${sourceLocId}|${row.product_id}`) ?? 0;
        if (qty > availableAtLoc) {
          redirect(
            `/inventory/remissions/${requestId}?error=` +
              encodeURIComponent(
                `Cantidad enviada (${qty}) supera stock disponible en LOC origen (${availableAtLoc}).`
              )
          );
        }
        sourceLocDeductions.push({
          locationId: sourceLocId,
          productId: row.product_id,
          qty,
          unitCode: normalizeUnitCode(row.stock_unit_code || row.unit || "un"),
        });
      }
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

  if (action === "close") {
    updates.status = "closed";
    updates.closed_at = new Date().toISOString();
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
      redirect(`/inventory/remissions/${requestId}?error=` + encodeURIComponent(moveErr.message));
    }
    const fromSiteIdForMovement = request?.from_site_id ?? "";
    if (!fromSiteIdForMovement) {
      redirect(
        `/inventory/remissions/${requestId}?error=` +
          encodeURIComponent("No se encontro sede origen para la remision.")
      );
    }

    for (const deduction of sourceLocDeductions) {
      const { error: locErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
        p_location_id: deduction.locationId,
        p_product_id: deduction.productId,
        p_delta: -deduction.qty,
      });
      if (locErr) {
        redirect(
          `/inventory/remissions/${requestId}?error=` +
            encodeURIComponent(`No se pudo descontar LOC origen: ${locErr.message}`)
        );
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
        redirect(
          `/inventory/remissions/${requestId}?error=` +
            encodeURIComponent(`No se pudo registrar movimiento LOC: ${moveLocErr.message}`)
        );
      }
    }
  }

  if (action === "receive" || action === "receive_partial") {
    const { error: moveErr } = await supabase.rpc("apply_restock_receipt", {
      p_request_id: requestId,
    });
    if (moveErr) {
      redirect(`/inventory/remissions/${requestId}?error=` + encodeURIComponent(moveErr.message));
    }
  }

  const { error } = await supabase.from("restock_requests").update(updates).eq("id", requestId);
  if (error) {
    redirect(`/inventory/remissions/${requestId}?error=` + encodeURIComponent(error.message));
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
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const okMsg = sp.ok === "created"
    ? "Remisión creada."
    : sp.ok === "items_updated"
      ? "Ítems actualizados."
      : sp.ok === "status_updated"
        ? "Estado actualizado."
        : sp.ok
          ? safeDecodeURIComponent(sp.ok)
          : "";
  const lowStockWarning = sp.warning === "low_stock";

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
  for (const row of stockByLocRows) {
    const code = row.location?.code ?? row.location_id?.slice(0, 8) ?? "";
    const qty = Number(row.current_qty ?? 0);
    if (!qty) continue;
    const key = row.product_id;
    if (!stockByLocByProduct.has(key)) stockByLocByProduct.set(key, []);
    stockByLocByProduct.get(key)!.push(`${code}: ${qty}`);
  }

  if (!request) {
    return (
      <div className="w-full">
        <Link href="/inventory/remissions" className="ui-body-muted underline">
          Volver
        </Link>
        <div className="mt-4 ui-alert ui-alert--error">Remisión no encontrada o sin acceso.</div>
      </div>
    );
  }

  if (isRequesterOnlyRole(access.role) && request.created_by !== user.id) {
    return (
      <div className="w-full">
        <Link href="/inventory/remissions" className="ui-body-muted underline">
          Volver
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
  const canCloseAction = access.canClose && ["received", "partial"].includes(currentStatus);
  const canCancelAction = access.canCancel && !["closed", "cancelled"].includes(currentStatus);
  const canEditPrepareItems =
    access.canPrepare && ["pending", "preparing"].includes(currentStatus);
  const canEditReceiveItems =
    access.canReceive && ["in_transit", "partial"].includes(currentStatus);
  const canEditStatus =
    (access.canCancel || access.canPrepare || access.canReceive) &&
    !["closed", "cancelled"].includes(currentStatus);
  const canEditArea = access.canCancel || canEditPrepareItems;

  let nextStep = "Sin acciones disponibles.";
  if (canPrepareAction) nextStep = "Paso 1: guardar items preparados y marcar preparado.";
  else if (canTransitAction) nextStep = "Paso 2: enviar remision a destino (En viaje).";
  else if (canReceiveAction) nextStep = "Paso 3: registrar recepcion total o parcial.";
  else if (canCloseAction) nextStep = "Paso 4: cerrar remision.";

  return (
    <div className="w-full space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/inventory/remissions" className="ui-caption underline">
            Volver a remisiones
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
        <div className="mt-3 grid gap-3 md:grid-cols-2 ui-body">
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
          Siguiente paso: <strong>{nextStep}</strong>
        </div>
      </div>

      <div className="ui-panel">
        <div className="ui-h3">Acciones</div>
        <form action={updateStatus} className="mt-4 flex flex-wrap gap-3">
          <input type="hidden" name="request_id" value={request.id} />
          {canPrepareAction ? (
            <button
              name="action"
              value="prepare"
              className="ui-btn ui-btn--ghost"
            >
              Marcar preparado
            </button>
          ) : null}
          {canTransitAction ? (
            <button
              name="action"
              value="transit"
              className="ui-btn ui-btn--brand"
            >
              En viaje
            </button>
          ) : null}
          {canReceiveAction ? (
            <button
              name="action"
              value="receive"
              className="ui-btn ui-btn--ghost"
            >
              Recibir
            </button>
          ) : null}
          {canReceivePartialAction ? (
            <button
              name="action"
              value="receive_partial"
              className="ui-btn ui-btn--ghost"
            >
              Recibir parcial
            </button>
          ) : null}
          {canCloseAction ? (
            <button
              name="action"
              value="close"
              className="ui-btn ui-btn--ghost"
            >
              Cerrar
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
          &quot;En viaje&quot; descuenta stock en origen. &quot;Recibir&quot; agrega stock en destino.
        </div>
      </div>

      <div className="ui-panel">
        <div className="ui-h3">
          {canEditPrepareItems
            ? "Paso 1. Items a preparar y enviar"
            : canEditReceiveItems
              ? "Paso 3. Items a recibir"
              : "Items de la remision"}
        </div>
        <form action={updateItems} className="mt-4 space-y-4">
          <input type="hidden" name="request_id" value={request.id} />
          <div className="space-y-3">
            {itemRows.map((item) => {
              const availableSite = stockBySiteMap.get(item.product_id) ?? 0;
              const locLines = stockByLocByProduct.get(item.product_id) ?? [];
              const stockOk = availableSite >= (item.quantity ?? 0);
              const sourceLocLabel = item.source_location_id
                ? originLocMap.get(item.source_location_id) ?? item.source_location_id.slice(0, 8)
                : "-";
              return (
              <div key={item.id} className="ui-panel-soft p-4">
                <div className="ui-h3">
                  {item.product?.name ?? item.product_id}
                </div>
                <div className="mt-1 ui-caption">
                  Producto: <span className="font-mono">{item.product_id}</span>
                  {" "}Solicitado: {item.quantity} {item.stock_unit_code ?? item.unit ?? item.product?.unit ?? ""}
                  {" "}· LOC origen: {sourceLocLabel}
                </div>
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
                  </div>
                ) : null}

                <input type="hidden" name="item_id" value={item.id} />

                <div className="mt-3 grid gap-3 md:grid-cols-6">
                  {showSourceLocSelector && canEditPrepareItems ? (
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">LOC origen</span>
                      <select
                        name="source_location_id"
                        defaultValue={item.source_location_id ?? ""}
                        className="ui-input h-10 min-w-0"
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
                  {canEditStatus ? (
                    <label className="flex flex-col gap-1">
                      <span className="ui-caption">Estado</span>
                      <select
                        name="item_status"
                        defaultValue={item.item_status ?? "pending"}
                        className="ui-input h-10 min-w-0"
                      >
                        <option value="pending">pendiente</option>
                        <option value="preparing">preparando</option>
                        <option value="in_transit">en_transito</option>
                        <option value="received">recibido</option>
                        <option value="shortage">faltante</option>
                      </select>
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

          <button className="ui-btn ui-btn--brand">
            Guardar items
          </button>
        </form>
      </div>
    </div>
  );
}
