import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";

import { AssetLocationForm } from "./asset-location-form";
import { AssetQrActions } from "./asset-qr-actions";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";
const NEXO_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://nexo.ventogroup.co";

type SearchParams = {
  error?: string;
};

type AssetItemViewRow = {
  id: string;
  product_id: string;
  product_name: string | null;
  product_sku: string | null;
  asset_code: string | null;
  qr_token: string | null;
  display_name: string | null;
  internal_plate: string | null;
  serial_number: string | null;
  brand: string | null;
  model: string | null;
  equipment_status: string | null;
  condition_status: string | null;
  lifecycle_status: string | null;
  ownership_status: string | null;
  site_id: string | null;
  site_name: string | null;
  area_id: string | null;
  area_name: string | null;
  area_kind: string | null;
  location_id: string | null;
  location_code: string | null;
  location_zone: string | null;
  location_position_id: string | null;
  position_code: string | null;
  position_name: string | null;
  responsible_employee_id: string | null;
  responsible_name: string | null;
  commercial_value: number | null;
  warranty_until: string | null;
  main_image_url: string | null;
  technical_sheet_path: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AssetItemRawRow = {
  id: string;
  product_id: string;
  manufacturer: string | null;
  purchase_date: string | null;
  started_use_date: string | null;
  purchase_invoice_url: string | null;
  technical_specs: Record<string, unknown> | null;
  notes: string | null;
};

type AssetDocumentRow = {
  id: string;
  document_type: string | null;
  title: string | null;
  file_url: string | null;
  issued_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string | null;
};

type AssetMaintenanceRow = {
  id: string;
  status: string | null;
  maintenance_type: string | null;
  scheduled_date: string | null;
  performed_date: string | null;
  maintenance_provider: string | null;
  work_done: string | null;
  parts_replaced: boolean | null;
  replaced_parts: string | null;
  cost: number | null;
  next_scheduled_date: string | null;
  notes: string | null;
  created_at: string | null;
};

type AssetMovementRow = {
  id: string;
  moved_at: string | null;
  movement_type: string | null;
  quantity: number | null;
  notes: string | null;
  from_site_id: string | null;
  from_location_id: string | null;
  to_site_id: string | null;
  to_location_id: string | null;
  responsible_employee_id: string | null;
  created_at: string | null;
};

type SiteRow = {
  id: string;
  name: string | null;
};

type AreaRow = {
  id: string;
  site_id: string;
  name: string | null;
  kind: string | null;
};

type LocationRow = {
  id: string;
  site_id: string;
  area_id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type PositionRow = {
  id: string;
  site_id: string;
  location_id: string;
  code: string | null;
  name: string | null;
  kind: string | null;
};

type EmployeeRow = {
  id: string;
  site_id: string | null;
  full_name: string | null;
  role: string | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableUuid(value: FormDataEntryValue | null) {
  const text = asText(value);
  return text || null;
}

function asNullableDate(value: FormDataEntryValue | null) {
  const text = asText(value);
  return text || null;
}

function asNullableNumber(value: FormDataEntryValue | null) {
  const text = asText(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildAssetReturn(assetId: string, error?: string) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  const qs = params.toString();
  return qs ? `/inventory/assets/items/${assetId}?${qs}` : `/inventory/assets/items/${assetId}`;
}

function fmtMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(parsed);
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function equipmentStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "en_mantenimiento") return "En mantenimiento";
  if (raw === "fuera_servicio") return "Fuera de servicio";
  if (raw === "baja") return "De baja";
  return "Operativo";
}

function lifecycleStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "almacenado") return "Almacenado";
  if (raw === "prestado") return "Prestado";
  if (raw === "en_reparacion") return "En reparación";
  if (raw === "retirado") return "Retirado";
  if (raw === "perdido") return "Perdido";
  return "Activo";
}

function conditionStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "nuevo") return "Nuevo";
  if (raw === "regular") return "Regular";
  if (raw === "malo") return "Malo";
  if (raw === "critico") return "Crítico";
  return "Bueno";
}

function ownershipStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "rentado") return "Rentado";
  if (raw === "prestado") return "Prestado";
  if (raw === "comodato") return "Comodato";
  return "Propio";
}

function maintenanceStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "done") return "Realizado";
  if (raw === "cancelled") return "Cancelado";
  if (raw === "overdue") return "Vencido";
  return "Planeado";
}

function maintenanceTypeLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "corrective") return "Correctivo";
  if (raw === "inspection") return "Inspección";
  if (raw === "calibration") return "Calibración";
  if (raw === "cleaning") return "Limpieza";
  if (raw === "other") return "Otro";
  return "Preventivo";
}

function movementTypeLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "initial_location") return "Ubicación inicial";
  if (raw === "loan") return "Préstamo";
  if (raw === "return") return "Devolución";
  if (raw === "maintenance_out") return "Salida a mantenimiento";
  if (raw === "maintenance_in") return "Regreso de mantenimiento";
  if (raw === "status_change") return "Cambio de estado";
  if (raw === "adjustment") return "Ajuste";
  return "Traslado";
}

function documentTypeLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "technical_sheet") return "Ficha técnica";
  if (raw === "manual") return "Manual";
  if (raw === "invoice") return "Factura";
  if (raw === "warranty") return "Garantía";
  if (raw === "maintenance_report") return "Informe mantenimiento";
  if (raw === "photo") return "Foto";
  if (raw === "certificate") return "Certificado";
  return "Documento";
}

function statusClassName(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "operativo" || raw === "activo" || raw === "bueno" || raw === "nuevo" || raw === "done") {
    return "ui-chip ui-chip--success";
  }
  if (raw === "en_mantenimiento" || raw === "en_reparacion" || raw === "regular" || raw === "almacenado" || raw === "planned") {
    return "ui-chip ui-chip--warn";
  }
  if (raw === "fuera_servicio" || raw === "baja" || raw === "malo" || raw === "critico" || raw === "perdido" || raw === "overdue") {
    return "ui-chip ui-chip--danger";
  }
  return "ui-chip";
}

function locationLabel(row: AssetItemViewRow) {
  const site = String(row.site_name ?? "").trim();
  const area = String(row.area_name ?? row.area_kind ?? "").trim();
  const loc = [row.location_code, row.location_zone].filter(Boolean).join(" - ");
  const position = String(row.position_name ?? row.position_code ?? "").trim();

  const parts = [site, area, loc, position].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sin ubicación asignada";
}

function qrImageUrl(path: string) {
  const absoluteUrl = `${NEXO_BASE_URL}${path}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(absoluteUrl)}`;
}

function technicalSpecRows(specs: Record<string, unknown> | null | undefined) {
  if (!specs || typeof specs !== "object") return [];
  return Object.entries(specs)
    .filter(([, value]) => value != null && String(value).trim() !== "")
    .map(([key, value]) => ({
      key,
      label: key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase()),
      value: typeof value === "object" ? JSON.stringify(value) : String(value),
    }));
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
      <div className="ui-label">{label}</div>
      <div className="mt-1 text-base font-semibold text-[var(--ui-text)]">
        {value == null || value === "" ? "-" : value}
      </div>
    </div>
  );
}

async function updateAssetLocation(formData: FormData) {
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

async function updateAssetIdentity(formData: FormData) {
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

async function registerAssetMaintenance(formData: FormData) {
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

export default async function AssetItemTechnicalSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMsg = String(sp.error ?? "").trim();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/assets/items/${id}`,
    permissionCode: PERMISSION,
  });

  const [
    viewRes,
    rawRes,
    documentsRes,
    maintenanceRes,
    movementsRes,
    sitesRes,
    areasRes,
    locationsRes,
    positionsRes,
    employeesRes,
  ] = await Promise.all([
    supabase
      .from("v_asset_items_inventory_status")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("asset_items")
      .select("id,product_id,manufacturer,purchase_date,started_use_date,purchase_invoice_url,technical_specs,notes")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("asset_documents")
      .select("id,document_type,title,file_url,issued_at,expires_at,notes,created_at")
      .eq("asset_item_id", id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("asset_maintenance_records")
      .select("id,status,maintenance_type,scheduled_date,performed_date,maintenance_provider,work_done,parts_replaced,replaced_parts,cost,next_scheduled_date,notes,created_at")
      .eq("asset_item_id", id)
      .order("scheduled_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("asset_movements")
      .select("id,moved_at,movement_type,quantity,notes,from_site_id,from_location_id,to_site_id,to_location_id,responsible_employee_id,created_at")
      .eq("asset_item_id", id)
      .order("moved_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("sites")
      .select("id,name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("areas")
      .select("id,site_id,name,kind")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("inventory_locations")
      .select("id,site_id,area_id,code,zone,description")
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("inventory_location_positions")
      .select("id,site_id,location_id,code,name,kind")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("employees")
      .select("id,site_id,full_name,role")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
  ]);

  if (viewRes.error || !viewRes.data) {
    notFound();
  }

  const item = viewRes.data as AssetItemViewRow;
  const raw = (rawRes.data ?? null) as AssetItemRawRow | null;
  const documents = (documentsRes.data ?? []) as AssetDocumentRow[];
  const maintenanceRows = (maintenanceRes.data ?? []) as AssetMaintenanceRow[];
  const movementRows = (movementsRes.data ?? []) as AssetMovementRow[];
  const sites = (sitesRes.data ?? []) as SiteRow[];
  const areas = (areasRes.data ?? []) as AreaRow[];
  const locations = (locationsRes.data ?? []) as LocationRow[];
  const positions = (positionsRes.data ?? []) as PositionRow[];
  const employees = (employeesRes.data ?? []) as EmployeeRow[];

  const technicalPath = item.technical_sheet_path || `/inventory/assets/items/${item.id}`;
  const absoluteUrl = `${NEXO_BASE_URL}${technicalPath}`;
  const imageUrl = String(item.main_image_url ?? "").trim();
  const specRows = technicalSpecRows(raw?.technical_specs);
  const title = item.display_name || item.product_name || "Activo físico";
  const identitySubtitle = [item.brand, item.model, item.serial_number ? `Serial ${item.serial_number}` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="ui-scene w-full space-y-6">
      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6 p-6 lg:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/inventory/assets" className="ui-btn ui-btn--ghost ui-btn--sm">
                ← Activos físicos
              </Link>
              <Link href={`/inventory/catalog/${item.product_id}/ficha`} className="ui-btn ui-btn--ghost ui-btn--sm">
                Modelo catálogo
              </Link>
              <a href="#asset-location-action" className="ui-btn ui-btn--ghost ui-btn--sm">
                Editar ubicación
              </a>
              <a href="#asset-identity-action" className="ui-btn ui-btn--ghost ui-btn--sm">
                Editar identificacion
              </a>
              <a href="#asset-maintenance-action" className="ui-btn ui-btn--ghost ui-btn--sm">
                Registrar mantenimiento
              </a>
            </div>

            <div className="flex flex-col gap-5 md:flex-row md:items-start">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-36 w-36 rounded-[1.75rem] object-cover shadow-sm" />
              ) : (
                <div className="flex h-36 w-36 items-center justify-center rounded-[1.75rem] bg-slate-100 text-2xl font-black text-slate-400">
                  ACT
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <span className={statusClassName(item.equipment_status)}>
                    {equipmentStatusLabel(item.equipment_status)}
                  </span>
                  <span className={statusClassName(item.lifecycle_status)}>
                    {lifecycleStatusLabel(item.lifecycle_status)}
                  </span>
                  <span className={statusClassName(item.condition_status)}>
                    {conditionStatusLabel(item.condition_status)}
                  </span>
                </div>
                <h1 className="mt-4 text-4xl font-black tracking-tight text-[var(--ui-text)]">
                  {title}
                </h1>
                <p className="mt-2 text-base text-[var(--ui-muted)]">
                  {identitySubtitle || "Activo individual con ficha técnica."}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Field label="Código activo" value={item.asset_code} />
                  <Field label="Placa interna" value={item.internal_plate} />
                  <Field label="Serial" value={item.serial_number} />
                </div>
              </div>
            </div>
          </div>

          <aside className="border-t border-slate-200 bg-slate-50 p-6 lg:border-l lg:border-t-0 lg:p-8">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 text-center shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrImageUrl(technicalPath)}
                alt="QR del activo"
                className="mx-auto h-52 w-52 rounded-2xl border border-slate-200 bg-white p-2"
              />
              <div className="mt-4 text-sm font-semibold text-[var(--ui-text)]">QR de ficha técnica</div>
              <div className="mt-1 break-all text-xs text-[var(--ui-muted)]">{absoluteUrl}</div>
              <AssetQrActions
                qrUrl={qrImageUrl(technicalPath)}
                assetUrl={absoluteUrl}
                assetTitle={title}
                assetCode={item.asset_code}
                assetId={item.id}
                serialNumber={item.serial_number}
                brand={item.brand}
                model={item.model}
              />
            </div>

            <div className="mt-4 rounded-[1.75rem] border border-slate-200 bg-white p-5">
              <div className="ui-label">Ubicación actual</div>
              <div className="mt-2 text-lg font-bold text-[var(--ui-text)]">{locationLabel(item)}</div>
              <div className="mt-3 text-sm text-[var(--ui-muted)]">
                Responsable: <strong className="text-[var(--ui-text)]">{item.responsible_name || "Sin responsable"}</strong>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <Field label="Producto / modelo base" value={item.product_name} />
        <Field label="SKU modelo" value={item.product_sku} />
        <Field label="Propiedad" value={ownershipStatusLabel(item.ownership_status)} />
        <Field label="Valor comercial" value={fmtMoney(item.commercial_value)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <div className="ui-panel space-y-5">
          <div>
            <h2 className="ui-h2">Identificación técnica</h2>
            <p className="mt-2 ui-body-muted">
              Información propia de esta unidad física. No es la ficha genérica del producto.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Marca" value={item.brand} />
            <Field label="Modelo" value={item.model} />
            <Field label="Fabricante" value={raw?.manufacturer} />
            <Field label="QR token" value={item.qr_token} />
            <Field label="Fecha de compra" value={fmtDate(raw?.purchase_date)} />
            <Field label="Inicio de uso" value={fmtDate(raw?.started_use_date)} />
            <Field label="Garantía hasta" value={fmtDate(item.warranty_until)} />
            <Field label="Última actualización" value={fmtDateTime(item.updated_at)} />
          </div>

          {raw?.notes ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="ui-label">Notas</div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ui-text)]">{raw.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="ui-panel space-y-5">
          <div>
            <h2 className="ui-h2">Especificaciones</h2>
            <p className="mt-2 ui-body-muted">
              Datos técnicos flexibles: potencia, voltaje, capacidad, dimensiones, peso, material, consumo, presión, etc.
            </p>
          </div>

          {specRows.length > 0 ? (
            <div className="grid gap-3">
              {specRows.map((spec) => (
                <div key={spec.key} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="ui-label">{spec.label}</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{spec.value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ui-empty">
              Sin especificaciones técnicas detalladas todavía.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="ui-panel space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="ui-h2">Documentos</h2>
              <p className="mt-2 ui-body-muted">
                Manuales, factura, garantía, certificados, fotos e informes.
              </p>
            </div>
            {raw?.purchase_invoice_url ? (
              <a href={raw.purchase_invoice_url} className="ui-btn ui-btn--ghost ui-btn--sm" target="_blank" rel="noreferrer">
                Ver factura
              </a>
            ) : null}
          </div>

          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="ui-chip">{documentTypeLabel(doc.document_type)}</span>
                    <div className="mt-2 font-semibold text-[var(--ui-text)]">{doc.title || "Documento"}</div>
                    <div className="mt-1 text-xs text-[var(--ui-muted)]">
                      Emitido: {fmtDate(doc.issued_at)} · Vence: {fmtDate(doc.expires_at)}
                    </div>
                  </div>
                  {doc.file_url ? (
                    <a href={doc.file_url} className="ui-btn ui-btn--ghost ui-btn--sm" target="_blank" rel="noreferrer">
                      Abrir
                    </a>
                  ) : null}
                </div>
                {doc.notes ? <p className="mt-2 text-sm text-[var(--ui-muted)]">{doc.notes}</p> : null}
              </div>
            ))}

            {documents.length === 0 ? (
              <div className="ui-empty">Sin documentos cargados.</div>
            ) : null}
          </div>
        </div>

        <div className="ui-panel space-y-4">
          <div>
            <h2 className="ui-h2">Mantenimiento</h2>
            <p className="mt-2 ui-body-muted">
              Historial técnico por unidad física.
            </p>
          </div>

          <div className="space-y-3">
            {maintenanceRows.map((row) => (
              <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className={statusClassName(row.status)}>{maintenanceStatusLabel(row.status)}</span>
                      <span className="ui-chip">{maintenanceTypeLabel(row.maintenance_type)}</span>
                    </div>
                    <div className="mt-2 text-sm text-[var(--ui-muted)]">
                      Programado: <strong>{fmtDate(row.scheduled_date)}</strong> · Realizado: <strong>{fmtDate(row.performed_date)}</strong>
                    </div>
                    <div className="mt-1 text-sm text-[var(--ui-muted)]">
                      Próximo: <strong>{fmtDate(row.next_scheduled_date)}</strong>
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold text-[var(--ui-text)]">
                    {fmtMoney(row.cost)}
                  </div>
                </div>

                {row.maintenance_provider ? (
                  <div className="mt-3 text-sm text-[var(--ui-muted)]">
                    Proveedor: <strong className="text-[var(--ui-text)]">{row.maintenance_provider}</strong>
                  </div>
                ) : null}
                {row.work_done ? <p className="mt-2 text-sm text-[var(--ui-text)]">{row.work_done}</p> : null}
                {row.parts_replaced ? (
                  <p className="mt-2 text-sm text-[var(--ui-muted)]">
                    Piezas reemplazadas: <strong>{row.replaced_parts || "Sin detalle"}</strong>
                  </p>
                ) : null}
              </div>
            ))}

            {maintenanceRows.length === 0 ? (
              <div className="ui-empty">Sin mantenimientos registrados.</div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="ui-panel space-y-4">
        <form id="asset-identity-action" action={updateAssetIdentity} className="space-y-4">
          <input type="hidden" name="asset_id" value={item.id} />
          <div>
            <h2 className="ui-h2">Editar identificacion</h2>
            <p className="mt-2 ui-body-muted">
              Corrige codigo, placa, serial y datos visibles de esta unidad fisica.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Nombre visible</span>
              <input name="display_name" defaultValue={item.display_name ?? ""} className="ui-input" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Codigo activo</span>
              <input name="asset_code" defaultValue={item.asset_code ?? ""} className="ui-input" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Placa interna</span>
              <input name="internal_plate" defaultValue={item.internal_plate ?? ""} className="ui-input" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Serial</span>
              <input name="serial_number" defaultValue={item.serial_number ?? ""} className="ui-input" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Marca</span>
              <input name="brand" defaultValue={item.brand ?? ""} className="ui-input" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Modelo</span>
              <input name="model" defaultValue={item.model ?? ""} className="ui-input" />
            </label>

            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Imagen principal URL</span>
              <input name="main_image_url" type="url" defaultValue={item.main_image_url ?? ""} className="ui-input" />
            </label>
          </div>

          <button type="submit" className="ui-btn ui-btn--brand">
            Guardar identificacion
          </button>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AssetLocationForm
          action={updateAssetLocation}
          item={{
            id: item.id,
            site_id: item.site_id,
            area_id: item.area_id,
            location_id: item.location_id,
            location_position_id: item.location_position_id,
            responsible_employee_id: item.responsible_employee_id,
          }}
          sites={sites}
          areas={areas}
          locations={locations}
          positions={positions}
          employees={employees}
        />

        <form id="asset-maintenance-action" action={registerAssetMaintenance} className="ui-panel space-y-4">
          <input type="hidden" name="asset_id" value={item.id} />
          <div>
            <h2 className="ui-h2">Registrar mantenimiento</h2>
            <p className="mt-2 ui-body-muted">
              Crea un registro técnico para esta unidad física y actualiza el estado si aplica.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Estado</span>
              <select name="maintenance_status" defaultValue="planned" className="ui-input">
                <option value="planned">Planeado / enviar a mantenimiento</option>
                <option value="done">Realizado / volver operativo</option>
                <option value="cancelled">Cancelado</option>
                <option value="overdue">Vencido</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Tipo</span>
              <select name="maintenance_type" defaultValue="preventive" className="ui-input">
                <option value="preventive">Preventivo</option>
                <option value="corrective">Correctivo</option>
                <option value="inspection">Inspección</option>
                <option value="calibration">Calibración</option>
                <option value="cleaning">Limpieza</option>
                <option value="other">Otro</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Fecha programada</span>
              <input name="scheduled_date" type="date" className="ui-input" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Fecha realizada</span>
              <input name="performed_date" type="date" className="ui-input" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Próximo mantenimiento</span>
              <input name="next_scheduled_date" type="date" className="ui-input" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Costo</span>
              <input name="cost" type="number" step="0.01" min="0" className="ui-input" placeholder="0" />
            </label>

            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Proveedor / técnico</span>
              <input name="maintenance_provider" className="ui-input" placeholder="Nombre del proveedor o técnico" />
            </label>

            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Trabajo realizado / diagnóstico</span>
              <textarea
                name="work_done"
                className="ui-input min-h-24"
                placeholder="Describe diagnóstico, acciones, limpieza, calibración, reparación, etc."
              />
            </label>

            <label className="flex items-center gap-2 md:col-span-2">
              <input name="parts_replaced" value="yes" type="checkbox" />
              <span className="text-sm font-semibold text-[var(--ui-text)]">Hubo cambio de repuestos</span>
            </label>

            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Repuestos cambiados</span>
              <input name="replaced_parts" className="ui-input" placeholder="Ej. Empaque, resistencia, cable, tarjeta..." />
            </label>

            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Notas</span>
              <textarea name="maintenance_notes" className="ui-input min-h-24" />
            </label>
          </div>

          <button type="submit" className="ui-btn ui-btn--brand w-full">
            Registrar mantenimiento
          </button>
        </form>
      </section>

      <section className="ui-panel">
        <div>
          <h2 className="ui-h2">Historial de movimientos</h2>
          <p className="mt-2 ui-body-muted">
            Traslados y cambios del activo individual.
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="ui-table min-w-[920px]">
            <thead>
              <tr>
                <th className="ui-th">Fecha</th>
                <th className="ui-th">Tipo</th>
                <th className="ui-th">Origen</th>
                <th className="ui-th">Destino</th>
                <th className="ui-th">Cantidad</th>
                <th className="ui-th">Notas</th>
              </tr>
            </thead>
            <tbody>
              {movementRows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-200/60 align-top">
                  <td className="ui-td">{fmtDateTime(row.moved_at ?? row.created_at)}</td>
                  <td className="ui-td">
                    <span className="ui-chip">{movementTypeLabel(row.movement_type)}</span>
                  </td>
                  <td className="ui-td">
                    <div className="text-xs text-[var(--ui-muted)]">
                      Sede: {row.from_site_id || "—"}
                    </div>
                    <div className="text-xs text-[var(--ui-muted)]">
                      LOC: {row.from_location_id || "—"}
                    </div>
                  </td>
                  <td className="ui-td">
                    <div className="text-xs text-[var(--ui-muted)]">
                      Sede: {row.to_site_id || "—"}
                    </div>
                    <div className="text-xs text-[var(--ui-muted)]">
                      LOC: {row.to_location_id || "—"}
                    </div>
                  </td>
                  <td className="ui-td">{row.quantity ?? "-"}</td>
                  <td className="ui-td">{row.notes || "-"}</td>
                </tr>
              ))}

              {movementRows.length === 0 ? (
                <tr>
                  <td className="ui-td ui-empty" colSpan={6}>
                    Sin movimientos registrados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
