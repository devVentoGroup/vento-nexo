"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { parseQuantity } from "./helpers";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";
export async function assignStockWithoutLocation(formData: FormData) {
  "use server";

  const siteId = String(formData.get("site_id") ?? "").trim();
  const productId = String(formData.get("product_id") ?? "").trim();
  const locationId = String(formData.get("location_id") ?? "").trim();
  const quantity = parseQuantity(formData.get("quantity"));
  const returnTo = siteId
    ? `/inventory/stock?site_id=${encodeURIComponent(siteId)}`
    : "/inventory/stock?";

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo,
    permissionCode: PERMISSION,
  });

  if (!siteId || !productId || !locationId || quantity <= 0) {
    redirect(`${returnTo}&error=${encodeURIComponent("Completa producto, destino y cantidad mayor a cero.")}`);
  }

  const { error } = await supabase.rpc("assign_inventory_stock_to_location", {
    p_site_id: siteId,
    p_product_id: productId,
    p_location_id: locationId,
    p_quantity: quantity,
    p_created_by: user.id,
    p_note: null,
  });
  if (error) {
    redirect(`${returnTo}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/inventory/stock");
  redirect(`${returnTo}&assigned=1`);
}
