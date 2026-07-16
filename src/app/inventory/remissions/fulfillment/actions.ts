"use server";

import { revalidatePath } from "next/cache";

import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";
import {
  checkOperationalSessionPermission,
  resolveOperationalSession,
} from "@/lib/auth/operational-session";
import {
  checkOperationalPermission,
  getOperationalContext,
} from "@/lib/auth/operational-context";
import { createClient } from "@/lib/supabase/server";
import { normalizeOperationalAreaKind } from "../operational-area-scope";

const APP_ID = "nexo";
const PATH = "/inventory/remissions/fulfillment";
const PERMISSIONS = {
  prepare: "inventory.remissions.prepare",
  transit: "inventory.remissions.transit",
  allSites: "inventory.remissions.all_sites",
};

const READY_EDITABLE_STATUSES = new Set([
  "pending",
  "preparing",
  "partially_ready",
  "ready",
  "allocated",
]);
const LOADABLE_STATUSES = new Set(["partially_ready", "ready", "allocated"]);

type QueueMode = "all" | "stock" | "production";
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type ActionScope = {
  siteId: string;
  areaKind: string;
  mode: QueueMode;
  canPrepare: boolean;
  canTransit: boolean;
  canViewAll: boolean;
};

function positive(value: FormDataEntryValue | null): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeMode(value: unknown): QueueMode {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "stock") return "stock";
  if (normalized === "production") return "production";
  return "all";
}

function blockedMessage(reason: unknown): string {
  const detail = String(reason ?? "").trim();
  return detail
    ? `Esta tarea está bloqueada: ${detail}`
    : "Esta tarea está bloqueada porque su ruta operativa está incompleta.";
}

async function resolveActionScope(
  supabase: SupabaseClient,
  userId: string,
  formData: FormData,
): Promise<ActionScope> {
  const operationalSession = await resolveOperationalSession({
    supabase,
    userId,
    appId: APP_ID,
  });
  const postedSiteId = String(formData.get("scope_site_id") ?? "").trim();
  const postedAreaKind = normalizeOperationalAreaKind(
    formData.get("scope_area_kind"),
  );
  const mode = normalizeMode(formData.get("scope_mode"));

  if (operationalSession.isSharedDevice) {
    const siteId = String(operationalSession.siteId ?? "").trim();
    const areaId = String(operationalSession.areaId ?? "").trim();
    const { data: area } = areaId
      ? await supabase
          .from("areas")
          .select("kind,site_id")
          .eq("id", areaId)
          .maybeSingle()
      : { data: null };
    const areaKind =
      String(area?.site_id ?? "") === siteId
        ? normalizeOperationalAreaKind(area?.kind)
        : "";

    const [canPrepare, canTransit] = await Promise.all([
      checkOperationalSessionPermission({
        supabase,
        session: operationalSession,
        appId: APP_ID,
        code: PERMISSIONS.prepare,
      }),
      checkOperationalSessionPermission({
        supabase,
        session: operationalSession,
        appId: APP_ID,
        code: PERMISSIONS.transit,
      }),
    ]);

    return {
      siteId,
      areaKind,
      mode,
      canPrepare,
      canTransit,
      canViewAll: false,
    };
  }

  const [{ data: employee }, { data: settings }] = await Promise.all([
    supabase
      .from("employees")
      .select("role,site_id")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", userId)
      .maybeSingle(),
  ]);
  const actualRole = String(employee?.role ?? "");
  const canViewAll = await checkPermissionWithRoleOverride({
    supabase,
    appId: APP_ID,
    code: PERMISSIONS.allSites,
    actualRole,
  });

  if (canViewAll) {
    if (!postedSiteId) {
      throw new Error(
        "Selecciona la sede responsable antes de operar la cola.",
      );
    }
    const [canPrepare, canTransit] = await Promise.all([
      checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.prepare,
        context: { siteId: postedSiteId },
        actualRole,
      }),
      checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.transit,
        context: { siteId: postedSiteId },
        actualRole,
      }),
    ]);
    return {
      siteId: postedSiteId,
      areaKind: postedAreaKind,
      mode,
      canPrepare,
      canTransit,
      canViewAll: true,
    };
  }

  const siteId = String(
    settings?.selected_site_id ?? employee?.site_id ?? "",
  ).trim();
  if (!siteId) throw new Error("No tienes una sede operativa activa.");

  const opContext = await getOperationalContext({
    supabase,
    employeeId: userId,
    siteId,
    appCode: APP_ID,
  });
  if (!opContext?.can_operate) {
    throw new Error("No tienes un contexto operativo activo para esta sede.");
  }

  const areaKind = normalizeOperationalAreaKind(opContext.active_area_kind);
  const [canPrepare, canTransit] = await Promise.all([
    checkOperationalPermission({
      supabase,
      permissionCode: `${APP_ID}.${PERMISSIONS.prepare}`,
      siteId,
      areaId: opContext.active_area_id,
      appCode: APP_ID,
    }),
    checkOperationalPermission({
      supabase,
      permissionCode: `${APP_ID}.${PERMISSIONS.transit}`,
      siteId,
      areaId: opContext.active_area_id,
      appCode: APP_ID,
    }),
  ]);

  return {
    siteId,
    areaKind,
    mode,
    canPrepare,
    canTransit,
    canViewAll: false,
  };
}

export async function markFulfillmentReady(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Tu sesión no está activa.");

  const scope = await resolveActionScope(supabase, auth.user.id, formData);
  if (!scope.canPrepare) {
    throw new Error("No tienes permiso para preparar tareas en esta sede.");
  }
  if (!scope.areaKind) {
    throw new Error("No hay un área responsable seleccionada o activa.");
  }

  const id = String(formData.get("fulfillment_id") ?? "").trim();
  const readyQty = positive(formData.get("ready_base_qty"));
  if (!id || !readyQty) throw new Error("Indica una cantidad lista válida.");

  const { data: row, error: readError } = await supabase
    .from("restock_item_fulfillments")
    .select(
      "id,from_site_id,preparing_area_kind,supply_mode,status,requested_base_qty,ready_base_qty,allocated_base_qty,shortage_reason",
    )
    .eq("id", id)
    .single();
  if (readError || !row) {
    throw new Error(readError?.message ?? "Tarea no encontrada.");
  }

  if (String(row.from_site_id ?? "") !== scope.siteId) {
    throw new Error("La tarea no pertenece a la sede operativa seleccionada.");
  }
  if (
    normalizeOperationalAreaKind(row.preparing_area_kind) !== scope.areaKind
  ) {
    throw new Error("La tarea pertenece a otra área responsable.");
  }
  if (scope.mode !== "all" && String(row.supply_mode ?? "") !== scope.mode) {
    throw new Error("La tarea no pertenece al modo de la cola actual.");
  }

  const currentStatus = String(row.status ?? "").trim();
  if (currentStatus === "blocked") {
    throw new Error(blockedMessage(row.shortage_reason));
  }
  if (!READY_EDITABLE_STATUSES.has(currentStatus)) {
    throw new Error(
      "La tarea ya no admite cambios de cantidad lista en su estado actual.",
    );
  }

  const allocatedQty = Number(row.allocated_base_qty ?? 0);
  const requestedQty = Number(row.requested_base_qty ?? 0);
  if (readyQty < allocatedQty || readyQty > requestedQty) {
    throw new Error(
      "La cantidad lista debe cubrir lo ya asignado y no superar lo solicitado.",
    );
  }

  const nextStatus = readyQty === requestedQty ? "ready" : "partially_ready";
  const { data: updated, error } = await supabase
    .from("restock_item_fulfillments")
    .update({
      ready_base_qty: readyQty,
      status: nextStatus,
      shortage_reason: null,
      updated_by: auth.user.id,
    })
    .eq("id", id)
    .eq("from_site_id", scope.siteId)
    .eq("preparing_area_kind", scope.areaKind)
    .in("status", Array.from(READY_EDITABLE_STATUSES))
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) {
    throw new Error(
      "La tarea cambió de contexto o estado. Actualiza la pantalla antes de continuar.",
    );
  }

  revalidatePath(PATH);
}

export async function createShipmentFromReady(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Tu sesión no está activa.");

  const scope = await resolveActionScope(supabase, auth.user.id, formData);
  if (!scope.canTransit) {
    throw new Error("No tienes permiso para crear cargas desde esta sede.");
  }

  const originSiteId = String(formData.get("origin_site_id") ?? "").trim();
  const destinationSiteId = String(
    formData.get("destination_site_id") ?? "",
  ).trim();
  if (originSiteId !== scope.siteId) {
    throw new Error("La carga no pertenece a la sede operativa seleccionada.");
  }

  const selected = new Set(
    formData.getAll("include").map((value) => String(value).trim()),
  );
  const ids = formData
    .getAll("fulfillment_id")
    .map((value) => String(value).trim());
  const quantities = formData.getAll("base_qty");
  const requestedItems = ids.flatMap((id, index) => {
    const qty = positive(quantities[index] ?? null);
    return selected.has(id) && qty
      ? [{ fulfillment_id: id, base_qty: qty }]
      : [];
  });

  if (!originSiteId || !destinationSiteId || !requestedItems.length) {
    throw new Error("Selecciona al menos una cantidad lista para cargar.");
  }

  const selectedIds = Array.from(
    new Set(requestedItems.map((item) => item.fulfillment_id)),
  );
  const { data: fulfillmentRows, error: fulfillmentError } = await supabase
    .from("restock_item_fulfillments")
    .select(
      "id,from_site_id,to_site_id,status,ready_base_qty,allocated_base_qty,shortage_reason",
    )
    .in("id", selectedIds);
  if (fulfillmentError) throw new Error(fulfillmentError.message);

  const fulfillmentById = new Map(
    (fulfillmentRows ?? []).map((row) => [String(row.id), row]),
  );

  const items = requestedItems.map((item) => {
    const row = fulfillmentById.get(item.fulfillment_id);
    if (!row) throw new Error("Una de las tareas seleccionadas ya no existe.");

    const status = String(row.status ?? "").trim();
    if (status === "blocked") {
      throw new Error(blockedMessage(row.shortage_reason));
    }
    if (!LOADABLE_STATUSES.has(status)) {
      throw new Error(
        "Una tarea seleccionada todavía no está disponible para cargar.",
      );
    }
    if (
      String(row.from_site_id ?? "") !== originSiteId ||
      String(row.to_site_id ?? "") !== destinationSiteId
    ) {
      throw new Error(
        "Una tarea seleccionada no pertenece al origen y destino de este envío.",
      );
    }

    const available =
      Number(row.ready_base_qty ?? 0) - Number(row.allocated_base_qty ?? 0);
    if (!Number.isFinite(available) || available <= 0) {
      throw new Error(
        "Una tarea seleccionada ya no tiene cantidad disponible para cargar.",
      );
    }
    if (item.base_qty > available) {
      throw new Error(
        "La cantidad de una tarea supera lo que permanece listo y sin asignar.",
      );
    }

    return item;
  });

  const { error } = await supabase.rpc(
    "create_remission_shipment_from_fulfillments",
    {
      p_origin_site_id: originSiteId,
      p_destination_site_id: destinationSiteId,
      p_dispatch_run_id: null,
      p_items: items,
    },
  );
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}