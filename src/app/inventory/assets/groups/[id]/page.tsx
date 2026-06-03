import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";

import { AssetGroupLocationForm } from "./asset-group-location-form";
import { AssetGroupQrActions } from "./asset-group-qr-actions";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";
const NEXO_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://nexo.ventogroup.co";

type SearchParams = {
  error?: string;
};

type AssetGroupViewRow = {
  id: string;
  product_id: string;
  product_name: string | null;
  product_sku: string | null;
  group_code: string | null;
  qr_token: string | null;
  name: string | null;
  expected_qty: number | null;
  unit_code: string | null;
  condition_status: string | null;
  lifecycle_status: string | null;
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
  main_image_url: string | null;
  technical_sheet_path: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AssetGroupRawRow = {
  id: string;
  product_id: string;
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

type AssetMovementRow = {
  id: string;
  moved_at: string | null;
  movement_type: string | null;
  quantity: number | null;
  notes: string | null;
  from_site_id: string | null;
  from_area_id: string | null;
  from_location_id: string | null;
  from_location_position_id: string | null;
  to_site_id: string | null;
  to_area_id: string | null;
  to_location_id: string | null;
  to_location_position_id: string | null;
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

function asNullableNumber(value: FormDataEntryValue | null) {
  const text = asText(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildGroupReturn(groupId: string, error?: string) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  const qs = params.toString();
  return qs ? `/inventory/assets/groups/${groupId}?${qs}` : `/inventory/assets/groups/${groupId}`;
}

function fmtQty(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 3,
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
  if (raw === "activo" || raw === "bueno" || raw === "nuevo") {
    return "ui-chip ui-chip--success";
  }
  if (raw === "en_reparacion" || raw === "regular" || raw === "almacenado") {
    return "ui-chip ui-chip--warn";
  }
  if (raw === "retirado" || raw === "malo" || raw === "critico" || raw === "perdido") {
    return "ui-chip ui-chip--danger";
  }
  return "ui-chip";
}

function locationLabel(row: AssetGroupViewRow) {
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

async function updateAssetGroupLocation(formData: FormData) {
  "use server";

  const groupId = asText(formData.get("group_id"));
  if (!groupId) {
    redirect("/inventory/assets?view=groups");
  }

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/assets/groups/${groupId}`,
    permissionCode: PERMISSION,
  });

  const siteId = asNullableUuid(formData.get("site_id"));
  const areaId = asNullableUuid(formData.get("area_id"));
  const locationId = asNullableUuid(formData.get("location_id"));
  const locationPositionId = asNullableUuid(formData.get("location_position_id"));
  const responsibleEmployeeId = asNullableUuid(formData.get("responsible_employee_id"));

  const { data: current } = await supabase
    .from("asset_groups")
    .select("id,site_id,area_id,location_id,location_position_id,responsible_employee_id,expected_qty")
    .eq("id", groupId)
    .maybeSingle();

  if (!current) {
    redirect("/inventory/assets?view=groups");
  }

  if (locationPositionId && !locationId) {
    redirect(buildGroupReturn(groupId, "Si asignas ubicación interna, también debes asignar LOC."));
  }

  if (locationId) {
    const { data: location } = await supabase
      .from("inventory_locations")
      .select("id,site_id,area_id")
      .eq("id", locationId)
      .maybeSingle();

    if (!location) {
      redirect(buildGroupReturn(groupId, "El LOC seleccionado no existe."));
    }

    if (siteId && location.site_id !== siteId) {
      redirect(buildGroupReturn(groupId, "El LOC seleccionado no pertenece a la sede elegida."));
    }

    if (areaId && location.area_id !== areaId) {
      redirect(buildGroupReturn(groupId, "El LOC seleccionado no pertenece al área elegida."));
    }
  }

  if (locationPositionId) {
    const { data: position } = await supabase
      .from("inventory_location_positions")
      .select("id,site_id,location_id")
      .eq("id", locationPositionId)
      .maybeSingle();

    if (!position) {
      redirect(buildGroupReturn(groupId, "La ubicación interna seleccionada no existe."));
    }

    if (position.location_id !== locationId) {
      redirect(buildGroupReturn(groupId, "La ubicación interna no pertenece al LOC seleccionado."));
    }

    if (siteId && position.site_id !== siteId) {
      redirect(buildGroupReturn(groupId, "La ubicación interna no pertenece a la sede elegida."));
    }
  }

  const { error } = await supabase
    .from("asset_groups")
    .update({
      site_id: siteId,
      area_id: areaId,
      location_id: locationId,
      location_position_id: locationPositionId,
      responsible_employee_id: responsibleEmployeeId,
      updated_by: user.id,
    })
    .eq("id", groupId);

  if (error) {
    redirect(buildGroupReturn(groupId, error.message || "No se pudo actualizar la ubicación."));
  }

  await supabase.from("asset_movements").insert({
    asset_group_id: groupId,
    movement_type: "transfer",
    quantity: current.expected_qty,
    from_site_id: current.site_id,
    from_area_id: current.area_id,
    from_location_id: current.location_id,
    from_location_position_id: current.location_position_id,
    to_site_id: siteId,
    to_area_id: areaId,
    to_location_id: locationId,
    to_location_position_id: locationPositionId,
    responsible_employee_id: responsibleEmployeeId,
    notes: asText(formData.get("movement_notes")) || "Actualización de ubicación desde ficha del grupo.",
    created_by: user.id,
  });

  revalidatePath("/inventory/assets");
  revalidatePath(`/inventory/assets/groups/${groupId}`);
  redirect(`/inventory/assets/groups/${groupId}`);
}

async function updateAssetGroupDetails(formData: FormData) {
  "use server";

  const groupId = asText(formData.get("group_id"));
  if (!groupId) {
    redirect("/inventory/assets?view=groups");
  }

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/assets/groups/${groupId}`,
    permissionCode: PERMISSION,
  });

  const expectedQty = asNullableNumber(formData.get("expected_qty"));
  if (expectedQty == null || expectedQty < 0) {
    redirect(buildGroupReturn(groupId, "La cantidad esperada debe ser mayor o igual a cero."));
  }

  const { data: current } = await supabase
    .from("asset_groups")
    .select("id,expected_qty")
    .eq("id", groupId)
    .maybeSingle();

  if (!current) {
    redirect("/inventory/assets?view=groups");
  }

  const name = asText(formData.get("name"));
  const unitCode = asText(formData.get("unit_code")) || "un";
  const conditionStatus = asText(formData.get("condition_status")) || "bueno";
  const lifecycleStatus = asText(formData.get("lifecycle_status")) || "activo";
  const mainImageUrl = asText(formData.get("main_image_url")) || null;
  const notes = asText(formData.get("notes")) || null;

  const { error } = await supabase
    .from("asset_groups")
    .update({
      name: name || "Grupo de activos",
      expected_qty: expectedQty,
      unit_code: unitCode,
      condition_status: conditionStatus,
      lifecycle_status: lifecycleStatus,
      main_image_url: mainImageUrl,
      notes,
      updated_by: user.id,
    })
    .eq("id", groupId);

  if (error) {
    redirect(buildGroupReturn(groupId, error.message || "No se pudo actualizar el grupo."));
  }

  if (Number(current.expected_qty ?? 0) !== expectedQty) {
    await supabase.from("asset_movements").insert({
      asset_group_id: groupId,
      movement_type: "adjustment",
      quantity: expectedQty,
      notes: `Ajuste de cantidad esperada: ${current.expected_qty ?? 0} → ${expectedQty}`,
      created_by: user.id,
    });
  }

  revalidatePath("/inventory/assets");
  revalidatePath(`/inventory/assets/groups/${groupId}`);
  redirect(`/inventory/assets/groups/${groupId}`);
}

export default async function AssetGroupTechnicalSheetPage({
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
    returnTo: `/inventory/assets/groups/${id}`,
    permissionCode: PERMISSION,
  });

  const [
    viewRes,
    rawRes,
    documentsRes,
    movementsRes,
    sitesRes,
    areasRes,
    locationsRes,
    positionsRes,
    employeesRes,
  ] = await Promise.all([
    supabase
      .from("v_asset_groups_inventory_status")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("asset_groups")
      .select("id,product_id,notes")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("asset_documents")
      .select("id,document_type,title,file_url,issued_at,expires_at,notes,created_at")
      .eq("asset_group_id", id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("asset_movements")
      .select("id,moved_at,movement_type,quantity,notes,from_site_id,from_area_id,from_location_id,from_location_position_id,to_site_id,to_area_id,to_location_id,to_location_position_id,responsible_employee_id,created_at")
      .eq("asset_group_id", id)
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

  const group = viewRes.data as AssetGroupViewRow;
  const raw = (rawRes.data ?? null) as AssetGroupRawRow | null;
  const documents = (documentsRes.data ?? []) as AssetDocumentRow[];
  const movementRows = (movementsRes.data ?? []) as AssetMovementRow[];
  const sites = (sitesRes.data ?? []) as SiteRow[];
  const areas = (areasRes.data ?? []) as AreaRow[];
  const locations = (locationsRes.data ?? []) as LocationRow[];
  const positions = (positionsRes.data ?? []) as PositionRow[];
  const employees = (employeesRes.data ?? []) as EmployeeRow[];

  const technicalPath = group.technical_sheet_path || `/inventory/assets/groups/${group.id}`;
  const absoluteUrl = `${NEXO_BASE_URL}${technicalPath}`;
  const imageUrl = String(group.main_image_url ?? "").trim();
  const title = group.name || group.product_name || "Grupo de activos";

  return (
    <div className="ui-scene w-full space-y-6">
      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6 p-6 lg:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/inventory/assets?view=groups" className="ui-btn ui-btn--ghost ui-btn--sm">
                ← Grupos de activos
              </Link>
              <Link href={`/inventory/catalog/${group.product_id}/ficha`} className="ui-btn ui-btn--ghost ui-btn--sm">
                Modelo catálogo
              </Link>
              <a href="#asset-group-location-action" className="ui-btn ui-btn--ghost ui-btn--sm">
                Editar ubicación
              </a>
              <a href="#asset-group-details-action" className="ui-btn ui-btn--ghost ui-btn--sm">
                Ajustar grupo
              </a>
            </div>

            <div className="flex flex-col gap-5 md:flex-row md:items-start">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-36 w-36 rounded-[1.75rem] object-cover shadow-sm" />
              ) : (
                <div className="flex h-36 w-36 items-center justify-center rounded-[1.75rem] bg-slate-100 text-2xl font-black text-slate-400">
                  GRP
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <span className={statusClassName(group.lifecycle_status)}>
                    {lifecycleStatusLabel(group.lifecycle_status)}
                  </span>
                  <span className={statusClassName(group.condition_status)}>
                    {conditionStatusLabel(group.condition_status)}
                  </span>
                </div>
                <h1 className="mt-4 text-4xl font-black tracking-tight text-[var(--ui-text)]">
                  {title}
                </h1>
                <p className="mt-2 text-base text-[var(--ui-muted)]">
                  Grupo contable para activos repetidos que se controlan por cantidad.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Field label="Código grupo" value={group.group_code} />
                  <Field label="Cantidad esperada" value={`${fmtQty(group.expected_qty)} ${group.unit_code || "un"}`} />
                  <Field label="Modelo base" value={group.product_name} />
                </div>
              </div>
            </div>
          </div>

          <aside className="border-t border-slate-200 bg-slate-50 p-6 lg:border-l lg:border-t-0 lg:p-8">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 text-center shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrImageUrl(technicalPath)}
                alt="QR del grupo"
                className="mx-auto h-52 w-52 rounded-2xl border border-slate-200 bg-white p-2"
              />
              <div className="mt-4 text-sm font-semibold text-[var(--ui-text)]">QR del grupo contable</div>
              <div className="mt-1 break-all text-xs text-[var(--ui-muted)]">{absoluteUrl}</div>
              <AssetGroupQrActions
                qrUrl={qrImageUrl(technicalPath)}
                assetUrl={absoluteUrl}
                groupTitle={title}
                groupCode={group.group_code}
              />
            </div>

            <div className="mt-4 rounded-[1.75rem] border border-slate-200 bg-white p-5">
              <div className="ui-label">Ubicación actual</div>
              <div className="mt-2 text-lg font-bold text-[var(--ui-text)]">{locationLabel(group)}</div>
              <div className="mt-3 text-sm text-[var(--ui-muted)]">
                Responsable: <strong className="text-[var(--ui-text)]">{group.responsible_name || "Sin responsable"}</strong>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <Field label="SKU modelo" value={group.product_sku} />
        <Field label="Unidad" value={group.unit_code || "un"} />
        <Field label="Estado" value={lifecycleStatusLabel(group.lifecycle_status)} />
        <Field label="Condición" value={conditionStatusLabel(group.condition_status)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="ui-panel space-y-4">
          <div>
            <h2 className="ui-h2">Documentos</h2>
            <p className="mt-2 ui-body-muted">
              Manuales, fotos, certificados o soportes asociados al grupo.
            </p>
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
            <h2 className="ui-h2">Notas del grupo</h2>
            <p className="mt-2 ui-body-muted">
              Contexto operativo para conteos, ubicación o criterios de agrupación.
            </p>
          </div>

          {raw?.notes ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="whitespace-pre-wrap text-sm text-[var(--ui-text)]">{raw.notes}</p>
            </div>
          ) : (
            <div className="ui-empty">Sin notas registradas.</div>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AssetGroupLocationForm
          action={updateAssetGroupLocation}
          group={{
            id: group.id,
            site_id: group.site_id,
            area_id: group.area_id,
            location_id: group.location_id,
            location_position_id: group.location_position_id,
            responsible_employee_id: group.responsible_employee_id,
          }}
          sites={sites}
          areas={areas}
          locations={locations}
          positions={positions}
          employees={employees}
        />

        <form id="asset-group-details-action" action={updateAssetGroupDetails} className="ui-panel space-y-4">
          <input type="hidden" name="group_id" value={group.id} />
          <div>
            <h2 className="ui-h2">Ajustar grupo</h2>
            <p className="mt-2 ui-body-muted">
              Actualiza cantidad esperada, estado, condición e imagen del grupo contable.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Nombre del grupo</span>
              <input name="name" defaultValue={group.name ?? ""} className="ui-input" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Cantidad esperada</span>
              <input
                name="expected_qty"
                type="number"
                min="0"
                step="0.001"
                defaultValue={group.expected_qty ?? 0}
                className="ui-input"
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Unidad</span>
              <input name="unit_code" defaultValue={group.unit_code || "un"} className="ui-input" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Condición física</span>
              <select name="condition_status" defaultValue={group.condition_status || "bueno"} className="ui-input">
                <option value="nuevo">Nuevo</option>
                <option value="bueno">Bueno</option>
                <option value="regular">Regular</option>
                <option value="malo">Malo</option>
                <option value="critico">Crítico</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Estado de vida</span>
              <select name="lifecycle_status" defaultValue={group.lifecycle_status || "activo"} className="ui-input">
                <option value="activo">Activo</option>
                <option value="almacenado">Almacenado</option>
                <option value="prestado">Prestado</option>
                <option value="en_reparacion">En reparación</option>
                <option value="retirado">Retirado</option>
                <option value="perdido">Perdido</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Imagen principal URL</span>
              <input name="main_image_url" type="url" defaultValue={group.main_image_url ?? ""} className="ui-input" />
            </label>

            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Notas</span>
              <textarea name="notes" defaultValue={raw?.notes ?? ""} className="ui-input min-h-28" />
            </label>
          </div>

          <button type="submit" className="ui-btn ui-btn--brand w-full">
            Guardar grupo
          </button>
        </form>
      </section>

      <section className="ui-panel">
        <div>
          <h2 className="ui-h2">Historial de movimientos</h2>
          <p className="mt-2 ui-body-muted">
            Traslados y ajustes patrimoniales del grupo contable.
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
                  <td className="ui-td">{fmtQty(row.quantity)}</td>
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
