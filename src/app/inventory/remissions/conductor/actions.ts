"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const PATH = "/inventory/remissions/conductor";

export async function departPhysicalShipment(formData: FormData) {
  const shipmentId = String(formData.get("shipment_id") ?? "").trim();
  if (!shipmentId) redirect(`${PATH}?error=${encodeURIComponent("Envío inválido.")}`);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`${PATH}?error=${encodeURIComponent("Tu sesión no está activa.")}`);

  const { data: shipment, error: readError } = await supabase
    .from("remission_shipments")
    .select("id,status")
    .eq("id", shipmentId)
    .maybeSingle();
  if (readError || !shipment) {
    redirect(`${PATH}?error=${encodeURIComponent(readError?.message ?? "El envío no está disponible.")}`);
  }
  if (!["draft", "loading", "sealed"].includes(String(shipment.status))) {
    redirect(`${PATH}?error=${encodeURIComponent("Este envío ya salió o no puede ponerse en tránsito.")}`);
  }

  const { error } = await supabase
    .from("remission_shipments")
    .update({ status: "in_transit", departed_at: new Date().toISOString(), updated_by: auth.user.id })
    .eq("id", shipmentId);
  if (error) redirect(`${PATH}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(PATH);
  revalidatePath("/inventory/remissions/fulfillment");
  redirect(`${PATH}?ok=departed`);
}
