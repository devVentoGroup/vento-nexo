import { roundQuantity } from "@/lib/inventory/uom";
import { createClient } from "@/lib/supabase/server";

export type SearchParams = {
  error?: string;
  ok?: string;
  warning?: string;
  from?: string;
  line?: string;
  event?: string;
  site_id?: string;
  /** 1 = bodega vuelve a editar una remisión ya lista para despacho */
  edit_prepare?: string;
};

export type AccessContext = {
  role: string;
  selectedSiteId: string;
  fromSiteType: string;
  toSiteType: string;
  fromSiteName: string;
  toSiteName: string;
  canPrepare: boolean;
  canTransit: boolean;
  canReceive: boolean;
  canCancel: boolean;
};

export type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

export type RestockItemRow = {
  id: string;
  product_id: string;
  quantity: number;
  unit: string | null;
  input_qty: number | null;
  input_unit_code: string | null;
  stock_unit_code: string | null;
  source_location_id: string | null;
  prepared_quantity: number | null;
  shipped_quantity: number | null;
  received_quantity: number | null;
  shortage_quantity: number | null;
  item_status: string | null;
  production_area_kind: string | null;
  product: {
    name: string | null;
    unit: string | null;
    stock_unit_code?: string | null;
  } | null;
};

export type LocRow = {
  id: string;
  code: string | null;
  zone?: string | null;
  aisle?: string | null;
  level?: string | null;
  description?: string | null;
};

export type RemissionOperationalSummary = {
  total_lines: number;
  pending_loc_selection_lines: number;
  dispatch_ready_lines: number;
  dispatch_blocked_lines: number;
  pending_receipt_lines: number;
  shortage_lines: number;
  received_lines: number;
  can_start_prepare: boolean;
  can_transit: boolean;
  can_complete_receive: boolean;
  can_receive_partial: boolean;
};

export function buildLocFriendlyLabel(loc: Partial<LocRow> | null | undefined): string {
  if (!loc) return "LOC";
  const description = String(loc.description ?? "").trim();
  if (description) return description;
  const parts = [
    String(loc.zone ?? "").trim(),
    String(loc.aisle ?? "").trim() ? `Pasillo ${String(loc.aisle ?? "").trim()}` : "",
    String(loc.level ?? "").trim() ? `Nivel ${String(loc.level ?? "").trim()}` : "",
  ].filter(Boolean);
  return parts.join(" · ") || String(loc.code ?? "").trim() || "LOC";
}

export function buildLocDisplayLabel(loc: Partial<LocRow> | null | undefined): string {
  if (!loc) return "LOC";
  const friendly = buildLocFriendlyLabel(loc);
  const code = String(loc.code ?? "").trim();
  return code && friendly !== code ? `${friendly} · ${code}` : friendly;
}

export function formatStatus(status?: string | null) {
  const value = String(status ?? "").trim();
  switch (value) {
    case "pending":
      return { label: "Pendiente", className: "ui-chip ui-chip--warn" };
    case "preparing":
      return { label: "Preparando", className: "ui-chip ui-chip--brand" };
    case "in_transit":
      return { label: "En tránsito", className: "ui-chip ui-chip--warn" };
    case "partial":
      return { label: "Recepción parcial", className: "ui-chip ui-chip--warn" };
    case "received":
    case "closed":
      return { label: "Recibida", className: "ui-chip ui-chip--success" };
    case "cancelled":
      return { label: "Cancelada", className: "ui-chip" };
    default:
      return { label: value || "Sin estado", className: "ui-chip" };
  }
}

export function deriveItemStatus(params: {
  requestedQty: number;
  preparedQty: number;
  shippedQty: number;
  receivedQty: number;
  shortageQty: number;
}): "pending" | "preparing" | "in_transit" | "partial" | "received" {
  const requestedQty = roundQuantity(Number(params.requestedQty ?? 0));
  const preparedQty = roundQuantity(Number(params.preparedQty ?? 0));
  const shippedQty = roundQuantity(Number(params.shippedQty ?? 0));
  const receivedQty = roundQuantity(Number(params.receivedQty ?? 0));
  const shortageQty = roundQuantity(Number(params.shortageQty ?? 0));
  const accountedQty = roundQuantity(receivedQty + shortageQty);

  if (shippedQty > 0) {
    if (accountedQty >= shippedQty) return "received";
    if (accountedQty > 0) return "partial";
    return "in_transit";
  }
  if (preparedQty > 0) return "preparing";
  if (requestedQty > 0) return "pending";
  return "pending";
}

export async function syncReceiveRequestStatus(params: {
  supabase: SupabaseClient;
  requestId: string;
}) {
  const { supabase, requestId } = params;
  const { error } = await supabase.rpc("sync_restock_request_status_from_items", {
    p_request_id: requestId,
  });
  return error?.message ?? null;
}

export async function loadRemissionOperationalSummary(params: {
  supabase: SupabaseClient;
  requestId: string;
}) {
  const { supabase, requestId } = params;
  const { data, error } = await supabase.rpc("get_restock_request_operational_summary", {
    p_request_id: requestId,
  });

  if (error) return { data: null as RemissionOperationalSummary | null, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      data: {
        total_lines: 0,
        pending_loc_selection_lines: 0,
        dispatch_ready_lines: 0,
        dispatch_blocked_lines: 0,
        pending_receipt_lines: 0,
        shortage_lines: 0,
        received_lines: 0,
        can_start_prepare: false,
        can_transit: false,
        can_complete_receive: false,
        can_receive_partial: false,
      },
      error: null,
    };
  }

  return {
    data: row as RemissionOperationalSummary,
    error: null,
  };
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDateTime(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return DATE_TIME_FORMATTER.format(date);
}

export function formatDate(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return DATE_FORMATTER.format(date);
}

export function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatUnitLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Unidades";
  const normalized = raw.toLowerCase();
  if (["un", "u", "unit", "units", "unidad", "unidades"].includes(normalized)) {
    return "Unidades";
  }
  return raw;
}

export function toFriendlyRemissionActionError(rawMessage: string): string {
  const msg = String(rawMessage ?? "").toLowerCase();
  if (
    msg.includes("restock_request_items_request_id_fkey") ||
    msg.includes("restock_request_items")
  ) {
    return "No se pudo eliminar porque la remisión aún tiene ítems relacionados.";
  }
  if (msg.includes("related_restock_request_id") || msg.includes("inventory_movements")) {
    return "No se puede eliminar porque ya tiene movimientos de inventario asociados.";
  }
  if (msg.includes("permission denied") || msg.includes("row-level security") || msg.includes("rls")) {
    return "No tienes permisos para ejecutar esta acción sobre la remisión.";
  }
  return "No se pudo completar la acción sobre la remisión. Intenta nuevamente.";
}

export function normalizeReturnOrigin(value: string | null | undefined): "" | "prepare" {
  return String(value ?? "").trim() === "prepare" ? "prepare" : "";
}

export function buildRemissionDetailHref(params: {
  requestId: string;
  from?: string | null;
  error?: string | null;
  ok?: string | null;
  warning?: string | null;
  line?: string | null;
  event?: string | null;
  siteId?: string | null;
  /** Abre el workbench de preparación aunque ya esté lista para despacho */
  editPrepare?: boolean;
}) {
  const query = new URLSearchParams();
  const from = normalizeReturnOrigin(params.from);
  const error = String(params.error ?? "").trim();
  const ok = String(params.ok ?? "").trim();
  const warning = String(params.warning ?? "").trim();
  const line = String(params.line ?? "").trim();
  const event = String(params.event ?? "").trim();
  const siteId = String(params.siteId ?? "").trim();
  const rawFrom = String(params.from ?? "").trim();

  if (from) query.set("from", from);
  if (!from && rawFrom === "transit") query.set("from", "transit");
  if (error) query.set("error", error);
  if (ok) query.set("ok", ok);
  if (warning) query.set("warning", warning);
  if (line) query.set("line", line);
  if (event) query.set("event", event);
  if (siteId) query.set("site_id", siteId);
  if (params.editPrepare) query.set("edit_prepare", "1");

  const search = query.toString();
  return search
    ? `/inventory/remissions/${params.requestId}?${search}`
    : `/inventory/remissions/${params.requestId}`;
}
