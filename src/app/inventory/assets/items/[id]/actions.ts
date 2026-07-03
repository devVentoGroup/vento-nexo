"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import {
  asNullableDate,
  asNullableNumber,
  asNullableUuid,
  asText,
  buildAssetReturn,
} from "./helpers";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";
export async function updateAssetLocation(formData: FormData) {
  "use server";

  const assetId = asText(formData.get("asset_id"));
  if (!assetId) {
    redirect("/inventory/assets");
  }

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/assets/items/${assetId}`,
    permissionCode: PERMISSION,
  });

  const siteId = asNullableUuid(formData.get("site_id"));
  const areaId = asNullableUuid(formData.get("area_id"));
  const locationId = asNullableUuid(formData.get("location_id"));
  const locationPositionId = asNullableUuid(formData.get("location_position_id"));
  const responsibleEmployeeId = asNullableUuid(formData.get("responsible_employee_id"));

  const { data: current } = await supabase
    .from("asset_items")
    .select("id,site_id,area_id,location_id,location_position_id,responsible_employee_id")
    .eq("id", assetId)
    .maybeSingle();

  if (!current) {
    redirect("/inventory/assets");
  }

  if (locationPositionId && !locationId) {
    redirect(buildAssetReturn(assetId, "Si asignas ubicación interna, también debes asignar LOC."));
  }

  if (locationId) {
    const { data: location } = await supabase
      .from("inventory_locations")
      .select("id,site_id,area_id")
      .eq("id", locationId)
      .maybeSingle();

    if (!location) {
      redirect(buildAssetReturn(assetId, "El LOC seleccionado no existe."));
    }

    if (siteId && location.site_id !== siteId) {
      redirect(buildAssetReturn(assetId, "El LOC seleccionado no pertenece a la sede elegida."));
    }

    if (areaId && location.area_id !== areaId) {
      redirect(buildAssetReturn(assetId, "El LOC seleccionado no pertenece al área elegida."));
    }
  }

  if (locationPositionId) {
    const { data: position } = await supabase
      .from("inventory_location_positions")
      .select("id,site_id,location_id")
      .eq("id", locationPositionId)
      .maybeSingle();

    if (!position) {
      redirect(buildAssetReturn(assetId, "La ubicación interna seleccionada no existe."));
    }

    if (position.location_id !== locationId) {
      redirect(buildAssetReturn(assetId, "La ubicación interna no pertenece al LOC seleccionado."));
    }

    if (siteId && position.site_id !== siteId) {
      redirect(buildAssetReturn(assetId, "La ubicación interna no pertenece a la sede elegida."));
    }
  }

  const { error } = await supabase
    .from("asset_items")
    .update({
      site_id: siteId,
      area_id: areaId,
      location_id: locationId,
      location_position_id: locationPositionId,
      responsible_employee_id: responsibleEmployeeId,
      updated_by: user.id,
    })
    .eq("id", assetId);

  if (error) {
    redirect(buildAssetReturn(assetId, error.message || "No se pudo actualizar la ubicación."));
  }

  await supabase.from("asset_movements").insert({
    asset_item_id: assetId,
    movement_type: "transfer",
    from_site_id: current.site_id,
    from_area_id: current.area_id,
    from_location_id: current.location_id,
    from_location_position_id: current.location_position_id,
    to_site_id: siteId,
    to_area_id: areaId,
    to_location_id: locationId,
    to_location_position_id: locationPositionId,
    responsible_employee_id: responsibleEmployeeId,
    notes: asText(formData.get("movement_notes")) || "Actualización de ubicación desde ficha técnica.",
    created_by: user.id,
  });

  revalidatePath("/inventory/assets");
  revalidatePath(`/inventory/assets/items/${assetId}`);
  redirect(`/inventory/assets/items/${assetId}`);
}

export async function updateAssetIdentity(formData: FormData) {
  "use server";

  const assetId = asText(formData.get("asset_id"));
  if (!assetId) {
    redirect("/inventory/assets");
  }

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/assets/items/${assetId}`,
    permissionCode: PERMISSION,
  });

  const { data: current } = await supabase
    .from("asset_items")
    .select("id")
    .eq("id", assetId)
    .maybeSingle();

  if (!current) {
    redirect("/inventory/assets");
  }

  const { error } = await supabase
    .from("asset_items")
    .update({
      display_name: asText(formData.get("display_name")) || null,
      asset_code: asText(formData.get("asset_code")) || null,
      internal_plate: asText(formData.get("internal_plate")) || null,
      serial_number: asText(formData.get("serial_number")) || null,
      brand: asText(formData.get("brand")) || null,
      model: asText(formData.get("model")) || null,
      main_image_url: asText(formData.get("main_image_url")) || null,
      updated_by: user.id,
    })
    .eq("id", assetId);

  if (error) {
    redirect(buildAssetReturn(assetId, error.message || "No se pudo actualizar la identificacion."));
  }

  revalidatePath("/inventory/assets");
  revalidatePath(`/inventory/assets/items/${assetId}`);
  redirect(`/inventory/assets/items/${assetId}`);
}

export async function registerAssetMaintenance(formData: FormData) {
  "use server";

  const assetId = asText(formData.get("asset_id"));
  if (!assetId) {
    redirect("/inventory/assets");
  }

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/assets/items/${assetId}`,
    permissionCode: PERMISSION,
  });

  const status = asText(formData.get("maintenance_status")) || "planned";
  const maintenanceType = asText(formData.get("maintenance_type")) || "preventive";
  const workDone = asText(formData.get("work_done"));
  const notes = asText(formData.get("maintenance_notes"));
  const cost = asNullableNumber(formData.get("cost"));

  const { data: asset } = await supabase
    .from("asset_items")
    .select("id,product_id")
    .eq("id", assetId)
    .maybeSingle();

  if (!asset) {
    redirect("/inventory/assets");
  }

  const { error } = await supabase.from("asset_maintenance_records").insert({
    asset_item_id: assetId,
    product_id: asset.product_id,
    status,
    maintenance_type: maintenanceType,
    scheduled_date: asNullableDate(formData.get("scheduled_date")),
    performed_date: asNullableDate(formData.get("performed_date")),
    maintenance_provider: asText(formData.get("maintenance_provider")) || null,
    work_done: workDone || null,
    parts_replaced: asText(formData.get("parts_replaced")) === "yes",
    replaced_parts: asText(formData.get("replaced_parts")) || null,
    cost,
    next_scheduled_date: asNullableDate(formData.get("next_scheduled_date")),
    notes: notes || null,
    created_by: user.id,
    updated_by: user.id,
  });

  if (error) {
    redirect(buildAssetReturn(assetId, error.message || "No se pudo registrar mantenimiento."));
  }

  if (status === "planned") {
    await supabase
      .from("asset_items")
      .update({
        equipment_status: "en_mantenimiento",
        lifecycle_status: "en_reparacion",
        updated_by: user.id,
      })
      .eq("id", assetId);
  }

  if (status === "done") {
    await supabase
      .from("asset_items")
      .update({
        equipment_status: "operativo",
        lifecycle_status: "activo",
        updated_by: user.id,
      })
      .eq("id", assetId);
  }

  revalidatePath("/inventory/assets");
  revalidatePath(`/inventory/assets/items/${assetId}`);
  redirect(`/inventory/assets/items/${assetId}`);
}
