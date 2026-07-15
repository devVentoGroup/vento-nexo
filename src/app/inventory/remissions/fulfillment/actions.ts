"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PATH = "/inventory/remissions/fulfillment";

function positive(value: FormDataEntryValue | null): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
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
    .select("id,requested_base_qty,allocated_base_qty")
    .eq("id", id)
    .single();
  if (readError || !row) throw new Error(readError?.message ?? "Tarea no encontrada.");
  if (readyQty < Number(row.allocated_base_qty ?? 0) || readyQty > Number(row.requested_base_qty)) {
    throw new Error("La cantidad lista debe cubrir lo ya asignado y no superar lo solicitado.");
  }

  const { error } = await supabase
    .from("restock_item_fulfillments")
    .update({
      ready_base_qty: readyQty,
      status: readyQty === Number(row.requested_base_qty) ? "ready" : "partially_ready",
      updated_by: auth.user.id,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}

export async function createShipmentFromReady(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Tu sesión no está activa.");

  const originSiteId = String(formData.get("origin_site_id") ?? "").trim();
  const destinationSiteId = String(formData.get("destination_site_id") ?? "").trim();
  const selected = new Set(formData.getAll("include").map((value) => String(value)));
  const ids = formData.getAll("fulfillment_id").map((value) => String(value));
  const quantities = formData.getAll("base_qty");
  const items = ids.flatMap((id, index) => {
    const qty = positive(quantities[index] ?? null);
    return selected.has(id) && qty ? [{ fulfillment_id: id, base_qty: qty }] : [];
  });
  if (!originSiteId || !destinationSiteId || !items.length) {
    throw new Error("Selecciona al menos una cantidad lista para cargar.");
  }

  const { error } = await supabase.rpc("create_remission_shipment_from_fulfillments", {
    p_origin_site_id: originSiteId,
    p_destination_site_id: destinationSiteId,
    p_dispatch_run_id: null,
    p_items: items,
  });
  if (error) throw new Error(error.message);
  revalidatePath(PATH);
}