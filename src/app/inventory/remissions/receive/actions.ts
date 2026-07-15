"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
const PATH = "/inventory/remissions/receive";
export async function confirmShipmentReceipt(formData: FormData) {
  const shipmentId = String(formData.get("shipment_id") ?? "").trim();
  const ids = formData.getAll("shipment_item_id").map(String);
  const quantities = formData.getAll("received_base_qty");
  const items = ids.map((shipment_item_id, i) => ({ shipment_item_id, received_base_qty: Number(quantities[i] ?? 0) }));
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !shipmentId || items.some((item) => !item.shipment_item_id || !Number.isFinite(item.received_base_qty) || item.received_base_qty < 0)) redirect(`${PATH}?error=${encodeURIComponent("Revisa las cantidades recibidas.")}`);
  const { error } = await supabase.rpc("confirm_remission_shipment_receipt", { p_shipment_id: shipmentId, p_items: items, p_notes: String(formData.get("notes") ?? "") });
  if (error) redirect(`${PATH}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(PATH); redirect(`${PATH}?ok=received`);
}
