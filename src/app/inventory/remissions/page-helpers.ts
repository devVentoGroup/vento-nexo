import type { createClient } from "@/lib/supabase/server";
import type { SiteOperationalCapabilities } from "@/lib/inventory/site-capabilities";
import {
  isTemporaryOperationUnitProfile,
  normalizeUnitCode,
  roundQuantity,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

const APP_ID = "nexo";

export type SiteCapabilityRow = SiteOperationalCapabilities;

export type MeasurementMode =
  | "fixed_presentation"
  | "variable_weight"
  | "count_with_weight"
  | "bulk_volume";

export function normalizeMeasurementMode(value: unknown): MeasurementMode {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (
    raw === "variable_weight" ||
    raw === "count_with_weight" ||
    raw === "bulk_volume"
  ) {
    return raw;
  }
  return "fixed_presentation";
}

export function usesFixedPresentationMode(value: unknown): boolean {
  return normalizeMeasurementMode(value) === "fixed_presentation";
}

export function usesActualQuantityMode(value: unknown): boolean {
  return normalizeMeasurementMode(value) !== "fixed_presentation";
}

export function isProducedPackagedProduct(
  product: ProductRow | null | undefined,
): boolean {
  const productType = String(product?.product_type ?? "")
    .trim()
    .toLowerCase();
  const inventoryKind = String(product?.inventory_kind ?? "")
    .trim()
    .toLowerCase();
  return (
    productType === "preparacion" ||
    (productType === "venta" && inventoryKind !== "resale")
  );
}

export function usesProductionPackageDispatch(
  product: ProductRow | null | undefined,
  profile: ProductUomProfile | null | undefined,
  stockUnitCode: string,
): boolean {
  return isProducedPackagedProduct(product) && !isTemporaryOperationUnitProfile(profile, stockUnitCode);
}

export function parseProductionPackagePlan(raw: string): ProductionPackagePlanItem[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        const packageId = String(entry?.packageId ?? "").trim();
        const dispatchQty = Number(entry?.dispatchQty ?? 0);
        const remainingQty = Number(entry?.remainingQty ?? 0);
        const unitCode = normalizeUnitCode(String(entry?.unitCode ?? ""));
        const label = String(entry?.label ?? "").trim();
        const batchId = String(entry?.batchId ?? "").trim() || null;
        const fractional = Boolean(entry?.fractional);

        if (!packageId || !Number.isFinite(dispatchQty) || dispatchQty <= 0)
          return null;

        return {
          packageId,
          dispatchQty: roundQuantity(dispatchQty),
          unitCode,
          remainingQty: Number.isFinite(remainingQty)
            ? roundQuantity(remainingQty)
            : 0,
          label,
          batchId,
          fractional,
        };
      })
      .filter((entry): entry is ProductionPackagePlanItem => entry !== null);
  } catch {
    return [];
  }
}

export function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

export type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

export type AreaRow = {
  id: string;
  name: string | null;
  kind: string | null;
  site_id: string | null;
};
export type AreaKindPurposeRow = {
  code: string;
  use_for_remission?: boolean | null;
};
export type SiteAreaPurposeRuleRow = {
  site_id: string | null;
  area_kind: string | null;
  purpose: string | null;
  is_enabled: boolean | null;
};

export type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  product_type?: string | null;
  inventory_kind?: string | null;
  category_id?: string | null;
  measurement_mode?: MeasurementMode;
  default_tolerance_percent?: number | null;
  requires_actual_dispatch_qty?: boolean | null;
  requires_count_alongside_weight?: boolean | null;
};

export type ProductSiteRow = {
  product_id: string;
  is_active: boolean | null;
  default_area_kind: string | null;
  area_kinds?: string[] | null;
  remission_category_id?: string | null;
  audience?: string | null;
  remission_enabled?: boolean | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type ProductSiteAreaRemissionCategoryRow = {
  product_id: string | null;
  site_id: string | null;
  area_kind: string | null;
  remission_category_id: string | null;
};

export type ProductProfileWithProduct = {
  product_id: string;
  inventory_kind: string | null;
  measurement_mode: string | null;
  default_tolerance_percent: number | null;
  requires_actual_dispatch_qty?: boolean | null;
  requires_count_alongside_weight?: boolean | null;
  products: ProductRow | null;
};

export type StockReferenceRow = {
  site_id: string;
  product_id: string;
  current_qty: number | null;
  updated_at: string | null;
};

export type ProductionPackagePlanItem = {
  packageId: string;
  dispatchQty: number;
  unitCode: string;
  remainingQty: number;
  label: string;
  batchId: string | null;
  fractional: boolean;
};

export type ProductionBatchPackageRow = {
  id: string;
  batch_id: string | null;
  site_id: string | null;
  location_id: string | null;
  product_id: string | null;
  package_index: number | null;
  package_label: string | null;
  original_qty: number | null;
  remaining_qty: number | null;
  reserved_qty: number | null;
  unit_code: string | null;
  status: string | null;
  created_at: string | null;
};

export type RemissionRow = {
  id: string;
  created_at: string | null;
  status: string | null;
  from_site_id: string | null;
  to_site_id: string | null;
  notes: string | null;
  created_by?: string | null;
  prepared_by?: string | null;
  prepared_at?: string | null;
  in_transit_by?: string | null;
  in_transit_at?: string | null;
  received_by?: string | null;
  received_at?: string | null;
};

export type RemissionOperationalSummaryRow = {
  request_id: string | null;
  can_transit: boolean | null;
};

export type RemissionItemMetricsRow = {
  request_id: string | null;
  quantity: number | null;
  prepared_quantity: number | null;
};

export type EmployeeNameRow = {
  id: string;
  full_name: string | null;
  alias: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getDefaultRemissionAreaForRole(
  role: string | null | undefined,
): string {
  const normalized = normalizeText(role);
  if (normalized === "cajero") return "cajero";
  if (normalized === "barista") return "bar";
  if (normalized === "cocinero") return "cocina";
  return "";
}

function getDefaultRemissionAreaCandidatesForRole(
  role: string | null | undefined,
): string[] {
  const primary = getDefaultRemissionAreaForRole(role);
  if (primary === "cajero") return ["cajero", "mostrador"];
  if (primary === "bar") return ["bar", "barra"];
  return primary ? [primary] : [];
}

export function normalizeProductSiteAreaKinds(row: ProductSiteRow): string[] {
  const values = [
    ...(Array.isArray(row.area_kinds) ? row.area_kinds : []),
    row.default_area_kind,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

export function supportsRemission(row: ProductSiteRow): boolean {
  return row.remission_enabled !== false;
}

export function supportsRequestedArea(
  row: ProductSiteRow,
  requestedAreaKind: string,
): boolean {
  const areaKind = String(requestedAreaKind ?? "").trim();
  if (!areaKind) return true;
  const configuredKinds = normalizeProductSiteAreaKinds(row);
  return (
    configuredKinds.includes(areaKind) || configuredKinds.includes("general")
  );
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function readBooleanAppSetting(
  supabase: SupabaseClient,
  settingKey: string,
  fallback: boolean,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_runtime_settings")
    .select("bool_value")
    .eq("app_id", APP_ID)
    .eq("setting_key", settingKey)
    .maybeSingle();

  if (error) return fallback;
  return typeof data?.bool_value === "boolean" ? data.bool_value : fallback;
}

export async function loadProductSiteRows(
  supabase: SupabaseClient,
  siteId: string,
): Promise<ProductSiteRow[]> {
  const withAudience = await supabase
    .from("product_site_settings")
    .select(
      "product_id,is_active,default_area_kind,area_kinds,remission_category_id,audience,remission_enabled,updated_at,created_at",
    )
    .eq("site_id", siteId)
    .eq("is_active", true);

  if (!withAudience.error) {
    const rows = (withAudience.data ?? []) as ProductSiteRow[];
    const ordered = [...rows].sort((a, b) => {
      const aTs = new Date(
        String(a.updated_at ?? a.created_at ?? ""),
      ).getTime();
      const bTs = new Date(
        String(b.updated_at ?? b.created_at ?? ""),
      ).getTime();
      const safeA = Number.isFinite(aTs) ? aTs : 0;
      const safeB = Number.isFinite(bTs) ? bTs : 0;
      return safeB - safeA;
    });
    const byProduct = new Map<string, ProductSiteRow>();
    for (const row of ordered) {
      if (!row.product_id || byProduct.has(row.product_id)) continue;
      byProduct.set(row.product_id, row);
    }
    return Array.from(byProduct.values());
  }

  const fallback = await supabase
    .from("product_site_settings")
    .select(
      "product_id,is_active,default_area_kind,area_kinds,remission_category_id,updated_at,created_at",
    )
    .eq("site_id", siteId)
    .eq("is_active", true);

  const legacyRows = (fallback.data ?? []) as ProductSiteRow[];
  const orderedLegacy = [...legacyRows].sort((a, b) => {
    const aTs = new Date(String(a.updated_at ?? a.created_at ?? "")).getTime();
    const bTs = new Date(String(b.updated_at ?? b.created_at ?? "")).getTime();
    const safeA = Number.isFinite(aTs) ? aTs : 0;
    const safeB = Number.isFinite(bTs) ? bTs : 0;
    return safeB - safeA;
  });
  const byProduct = new Map<string, ProductSiteRow>();
  for (const row of orderedLegacy) {
    if (!row.product_id || byProduct.has(row.product_id)) continue;
    byProduct.set(row.product_id, {
      ...row,
      audience: null,
      remission_enabled: null,
    });
  }
  return Array.from(byProduct.values());
}

export async function resolveRoleScopedRemissionAreaKind(
  supabase: SupabaseClient,
  siteId: string,
  role: string | null | undefined,
) {
  const roleAreaKinds = getDefaultRemissionAreaCandidatesForRole(role);
  if (!siteId || roleAreaKinds.length === 0) return "";

  const { data: siteAreaPurposeRulesData } = await supabase
    .from("site_area_purpose_rules")
    .select("area_kind,is_enabled")
    .eq("site_id", siteId)
    .eq("purpose", "remission");

  const siteOverrideKinds = new Set(
    ((siteAreaPurposeRulesData ?? []) as SiteAreaPurposeRuleRow[])
      .filter((row) => Boolean(row.is_enabled))
      .map((row) => String(row.area_kind ?? "").trim())
      .filter((kind) => kind && kind !== "general"),
  );

  if (siteOverrideKinds.size > 0) {
    return siteOverrideKinds.size > 1
      ? (roleAreaKinds.find((kind) => siteOverrideKinds.has(kind)) ?? "")
      : "";
  }

  const [
    { data: areas },
    { data: areaKindsPurposeData, error: areaKindsPurposeError },
  ] = await Promise.all([
    supabase.from("areas").select("kind").eq("site_id", siteId),
    supabase.from("area_kinds").select("code,use_for_remission"),
  ]);

  const remissionAreaKindCodes = !areaKindsPurposeError
    ? new Set(
        ((areaKindsPurposeData ?? []) as AreaKindPurposeRow[])
          .filter((row) => Boolean(row.use_for_remission))
          .map((row) => String(row.code ?? "").trim())
          .filter(Boolean),
      )
    : new Set(["cajero", "mostrador", "bar", "barra", "cocina"]);

  const availableKinds = new Set(
    ((areas ?? []) as Array<{ kind: string | null }>)
      .map((row) => String(row.kind ?? "").trim())
      .filter(
        (kind) =>
          kind && kind !== "general" && remissionAreaKindCodes.has(kind),
      ),
  );

  return availableKinds.size > 1
    ? (roleAreaKinds.find((kind) => availableKinds.has(kind)) ?? "")
    : "";
}

export function formatStatus(status?: string | null) {
  const value = String(status ?? "").trim();
  switch (value) {
    case "dispatch_ready":
      return {
        label: "Lista para despacho",
        className: "ui-chip ui-chip--success",
      };
    case "pending":
      return { label: "Pendiente", className: "ui-chip ui-chip--warn" };
    case "preparing":
      return { label: "Preparando", className: "ui-chip ui-chip--brand" };
    case "in_transit":
      return { label: "En tránsito", className: "ui-chip ui-chip--warn" };
    case "partial":
      return { label: "Recepción parcial", className: "ui-chip ui-chip--warn" };
    case "received":
      return { label: "Recibida", className: "ui-chip ui-chip--success" };
    case "closed":
      return { label: "Recibida", className: "ui-chip ui-chip--success" };
    case "cancelled":
      return { label: "Cancelada", className: "ui-chip" };
    default:
      return { label: value || "Sin estado", className: "ui-chip" };
  }
}

export function getEffectiveRemissionStatus(
  row: RemissionRow,
  canTransitByRequestId: Map<string, boolean>,
): string {
  const baseStatus = String(row.status ?? "").trim();
  if (baseStatus === "preparing" && canTransitByRequestId.get(row.id)) {
    return "dispatch_ready";
  }
  return baseStatus;
}

export function formatDateTime(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function displayEmployeeName(employee?: EmployeeNameRow | null): string {
  if (!employee) return "-";
  return (
    String(employee.alias ?? employee.full_name ?? employee.id).trim() ||
    employee.id
  );
}

export function buildRemissionTraceSummary(
  row: RemissionRow,
  employeeNameMap: Map<string, string>,
): string {
  const steps: string[] = [];
  const requestedBy = employeeNameMap.get(String(row.created_by ?? ""));
  if (requestedBy) steps.push(`Solicito: ${requestedBy}`);
  const preparedBy = employeeNameMap.get(String(row.prepared_by ?? ""));
  if (preparedBy) steps.push(`Preparo: ${preparedBy}`);
  const dispatchedBy = employeeNameMap.get(String(row.in_transit_by ?? ""));
  if (dispatchedBy) steps.push(`Despacho: ${dispatchedBy}`);
  const receivedBy = employeeNameMap.get(String(row.received_by ?? ""));
  if (receivedBy) steps.push(`Recibio: ${receivedBy}`);
  return steps.length ? steps.join(" · ") : "Sin trazabilidad visible todavía";
}

export type RemissionListAction =
  "view" | "edit" | "cancel" | "delete" | "reverse_cancel";

function hasReversalMarker(notes: string | null | undefined): boolean {
  return String(notes ?? "").includes("[REVERSA_APLICADA");
}

export function getListActionsForRemission(
  status: string | null | undefined,
  notes: string | null | undefined,
  canManage: boolean,
  canReverse: boolean,
  canEditOwnPending: boolean,
): RemissionListAction[] {
  const normalizedStatus = String(status ?? "").trim();
  const actions: RemissionListAction[] = ["view"];

  if (canEditOwnPending && normalizedStatus === "pending") {
    actions.push("edit");
  }

  if (!canManage) return actions;

  if (["pending", "preparing"].includes(normalizedStatus)) {
    actions.push("cancel", "delete");
    return actions;
  }

  if (
    canReverse &&
    ["in_transit", "partial", "received", "closed"].includes(normalizedStatus)
  ) {
    actions.push("reverse_cancel");
    return actions;
  }

  if (normalizedStatus === "cancelled") {
    if (canReverse && !hasReversalMarker(notes)) actions.push("reverse_cancel");
    actions.push("delete");
    return actions;
  }

  return actions;
}

export function toFriendlyRemissionActionError(rawMessage: string): string {
  const msg = String(rawMessage ?? "").toLowerCase();
  if (
    msg.includes("restock_request_items_request_id_fkey") ||
    msg.includes("restock_request_items")
  ) {
    return "No se pudo eliminar porque la remisión aún tiene ítems relacionados.";
  }
  if (
    msg.includes("related_restock_request_id") ||
    msg.includes("inventory_movements")
  ) {
    return "No se puede eliminar porque ya tiene movimientos de inventario asociados. Se canceló para conservar trazabilidad.";
  }
  if (msg.includes("already_reversed")) {
    return "Esta remisión ya fue anulada con reversa.";
  }
  if (msg.includes("request_not_found")) {
    return "La remisión ya no existe o no está disponible.";
  }
  if (msg.includes("permission_denied_reverse")) {
    return "No tienes permisos para anular con reversa esta remisión.";
  }
  if (
    msg.includes("permission denied") ||
    msg.includes("row-level security") ||
    msg.includes("rls")
  ) {
    return "No tienes permisos para ejecutar esta acción sobre la remisión.";
  }
  return "No se pudo completar la acción sobre la remisión. Intenta nuevamente.";
}
