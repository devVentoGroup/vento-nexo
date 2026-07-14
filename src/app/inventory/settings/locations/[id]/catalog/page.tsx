import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const baseHref = (locationId: string) => `/inventory/settings/locations/${locationId}/catalog`;
const text = (value: FormDataEntryValue | null) => typeof value === "string" ? value.trim() : "";

async function addProducts(formData: FormData) {
  "use server";
  const locationId = text(formData.get("location_id"));
  const productIds = formData.getAll("product_id").map(String).filter(Boolean);
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: baseHref(locationId),
    permissionCode: "inventory.stock",
  });
  if (!locationId || productIds.length === 0) {
    redirect(`${baseHref(locationId)}?error=${encodeURIComponent("Selecciona al menos un producto.")}`);
  }
  const rows = productIds.map((productId) => ({
    location_id: locationId,
    product_id: productId,
    is_active: true,
    created_by: user