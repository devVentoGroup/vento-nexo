const NEXO_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://nexo.ventogroup.co";
export type SearchParams = {
  error?: string;
};

export type AssetItemViewRow = {
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

export type AssetItemRawRow = {
  id: string;
  product_id: string;
  manufacturer: string | null;
  purchase_date: string | null;
  started_use_date: string | null;
  purchase_invoice_url: string | null;
  technical_specs: Record<string, unknown> | null;
  notes: string | null;
};

export type AssetDocumentRow = {
  id: string;
  document_type: string | null;
  title: string | null;
  file_url: string | null;
  issued_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string | null;
};

export type AssetMaintenanceRow = {
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

export type AssetMovementRow = {
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

export type SiteRow = {
  id: string;
  name: string | null;
};

export type AreaRow = {
  id: string;
  site_id: string;
  name: string | null;
  kind: string | null;
};

export type LocationRow = {
  id: string;
  site_id: string;
  area_id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

export type PositionRow = {
  id: string;
  site_id: string;
  location_id: string;
  code: string | null;
  name: string | null;
  kind: string | null;
};

export type EmployeeRow = {
  id: string;
  site_id: string | null;
  full_name: string | null;
  role: string | null;
};

export function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function asNullableUuid(value: FormDataEntryValue | null) {
  const text = asText(value);
  return text || null;
}

export function asNullableDate(value: FormDataEntryValue | null) {
  const text = asText(value);
  return text || null;
}

export function asNullableNumber(value: FormDataEntryValue | null) {
  const text = asText(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildAssetReturn(assetId: string, error?: string) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  const qs = params.toString();
  return qs ? `/inventory/assets/items/${assetId}?${qs}` : `/inventory/assets/items/${assetId}`;
}

export function fmtMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(parsed);
}

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function equipmentStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "en_mantenimiento") return "En mantenimiento";
  if (raw === "fuera_servicio") return "Fuera de servicio";
  if (raw === "baja") return "De baja";
  return "Operativo";
}

export function lifecycleStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "almacenado") return "Almacenado";
  if (raw === "prestado") return "Prestado";
  if (raw === "en_reparacion") return "En reparación";
  if (raw === "retirado") return "Retirado";
  if (raw === "perdido") return "Perdido";
  return "Activo";
}

export function conditionStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "nuevo") return "Nuevo";
  if (raw === "regular") return "Regular";
  if (raw === "malo") return "Malo";
  if (raw === "critico") return "Crítico";
  return "Bueno";
}

export function ownershipStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "rentado") return "Rentado";
  if (raw === "prestado") return "Prestado";
  if (raw === "comodato") return "Comodato";
  return "Propio";
}

export function maintenanceStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "done") return "Realizado";
  if (raw === "cancelled") return "Cancelado";
  if (raw === "overdue") return "Vencido";
  return "Planeado";
}

export function maintenanceTypeLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "corrective") return "Correctivo";
  if (raw === "inspection") return "Inspección";
  if (raw === "calibration") return "Calibración";
  if (raw === "cleaning") return "Limpieza";
  if (raw === "other") return "Otro";
  return "Preventivo";
}

export function movementTypeLabel(value: string | null | undefined) {
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

export function documentTypeLabel(value: string | null | undefined) {
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

export function statusClassName(value: string | null | undefined) {
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

export function locationLabel(row: AssetItemViewRow) {
  const site = String(row.site_name ?? "").trim();
  const area = String(row.area_name ?? row.area_kind ?? "").trim();
  const loc = [row.location_code, row.location_zone].filter(Boolean).join(" - ");
  const position = String(row.position_name ?? row.position_code ?? "").trim();

  const parts = [site, area, loc, position].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sin ubicación asignada";
}

export function qrImageUrl(path: string) {
  const absoluteUrl = `${NEXO_BASE_URL}${path}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(absoluteUrl)}`;
}

export function technicalSpecRows(specs: Record<string, unknown> | null | undefined) {
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

