"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PATH = "/inventory/remissions/fulfillment";

const READY_EDITABLE_STATUSES = new Set([
  "pending",
  "preparing",
  "partially_ready",
  "ready",
  "allocated",
]);

function positive(value: FormDataEntryValue | null): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function blockedMessage(reason: unknown): string {
  const detail = String(reason ?? "").trim();
  return detail
    ? `Esta tarea está bloqueada: ${detail}`
    : "Esta tarea está bloqueada porque su ruta operativa está incompleta.";
}

export async function markFulfillmentReady(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Tu sesión no está activa.");

  const id = String(formData.get("fulfillment_id") ?? "").trim();
  const readyQty = positive(formData.get("ready_base_qty"));
  if (!id || !readyQty) throw new Error("Indica una cantidad lista válida.");

  const { data: row, error: readError } = await supabase
    .from("restock_item_fulfillments")
    .select(
      "id,status,requested_base_qty,ready_base_qty,allocated_base_qty,shortage_reason",
    )
    .eq("id", id)
    .single();
  if (readError || !row) {
    throw new Error(readError?.message ?? "Tarea no encontrada.");
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
    .neq("status", "blocked")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) {
    throw new Error(
      "La tarea cambió de estado y ya no puede marcarse como lista. Actualiza la pantalla.",
    );
  }

  revalidatePath(PATH);
}

export async function createShipmentFromReady(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Tu sesión no está activa.");

  const originSiteId = String(formData.get("origin_site_id") ?? "").trim();
  const destinationSiteId = String(
    formData.get("destination_site_id") ?? "",
  ).trim();
  const selected = new Set(
    formData.getAll("include").map((value) => String(value).trim()),
  );
  const ids = formData
    .getAll("fulfillment_id")
    .map((value) => String(value).trim());
  const quantities = formData.getAll("base_qty");
  const requestedItems = ids.flatMap((id, index) => {
    const qty = positive(quantities[index] ?? null);
    return selected.has(id) && qty ? [{ fulfillment_id: id, base_qty: qty }] : [];
  });

  if (!originSiteId || !destinationSiteId || !requestedItems.length) {
    throw new Error("Selecciona al menos una cantidad lista para cargar.");
  }

  const selectedIds = requestedItems.map((item) => item.fulfillment_id);
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