"use server";

import { redirect } from "next/navigation";

import { normalizeUnitCode, roundQuantity } from "@/lib/inventory/uom";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";

import {
  enforceOperationalGateOrRedirect,
  loadAccessContext,
} from "./detail-access";
import {
  operationalRemissionAreaScopeAllowsKinds,
  resolveUserOperationalRemissionAreaScope,
} from "../operational-area-scope";
import {
  asText,
  buildRemissionDetailHref,
  type RemissionOperationalSummary,
  loadRemissionOperationalSummary,
  normalizeReturnOrigin,
  parseNumber,
  syncReceiveRequestStatus,
  toFriendlyRemissionActionError,
} from "./detail-utils";
import { buildPrepareFingerprintHash } from "./prepare-fingerprint";
const APP_ID = "nexo";
const REMISSIONS_INVENTORY_POSTING_SETTING_KEY =
  "remissions.inventory_posting_enabled";

async function readBooleanAppSetting(
  supabase: Awaited<ReturnType<typeof createClient>>,
  settingKey: string,
  fallback: boolean
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

async function isRemissionInventoryPostingEnabled(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<boolean> {
  return readBooleanAppSetting(
    supabase,
    REMISSIONS_INVENTORY_POSTING_SETTING_KEY,
    false
  );
}

type MeasurementMode =
  | "fixed_presentation"
  | "variable_weight"
  | "count_with_weight"
  | "bulk_volume";

type ProductMeasurementPolicy = {
  product_id: string;
  measurement_mode: MeasurementMode;
  default_tolerance_percent: number | null;
  aux_count_unit_code: string | null;
  requires_actual_receipt_qty: boolean;
  requires_actual_dispatch_qty: boolean;
  requires_count_alongside_weight: boolean;
};

function normalizeMeasurementMode(value: unknown): MeasurementMode {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "variable_weight" ||
    raw === "count_with_weight" ||
    raw === "bulk_volume"
  ) {
    return raw;
  }
  return "fixed_presentation";
}

function getDefaultMeasurementPolicy(productId: string): ProductMeasurementPolicy {
  return {
    product_id: productId,
    measurement_mode: "fixed_presentation",
    default_tolerance_percent: null,
    aux_count_unit_code: null,
    requires_actual_receipt_qty: false,
    requires_actual_dispatch_qty: false,
    requires_count_alongside_weight: false,
  };
}

function getMeasurementPolicy(
  policyByProductId: Map<string, ProductMeasurementPolicy>,
  productId: string | null | undefined
): ProductMeasurementPolicy {
  const safeProductId = String(productId ?? "").trim();
  return policyByProductId.get(safeProductId) ?? getDefaultMeasurementPolicy(safeProductId);
}

function mustRespectRequestedQuantityCap(policy: ProductMeasurementPolicy): boolean {
  return normalizeMeasurementMode(policy.measurement_mode) === "fixed_presentation";
}

function shouldRejectOverRequestedQuantity(params: {
  policyByProductId: Map<string, ProductMeasurementPolicy>;
  productId: string | null | undefined;
  requestedQty: number;
  actualQty: number;
}): boolean {
  const policy = getMeasurementPolicy(params.policyByProductId, params.productId);
  return (
    mustRespectRequestedQuantityCap(policy) &&
    params.requestedQty > 0 &&
    params.actualQty > params.requestedQty
  );
}

function requiresExplicitActualReceiptQty(policy: ProductMeasurementPolicy): boolean {
  return (
    policy.requires_actual_receipt_qty ||
    normalizeMeasurementMode(policy.measurement_mode) !== "fixed_presentation"
  );
}

function requiresAuxCountAlongsideWeight(policy: ProductMeasurementPolicy): boolean {
  return (
    policy.requires_count_alongside_weight ||
    normalizeMeasurementMode(policy.measurement_mode) === "count_with_weight"
  );
}

function normalizeAuxCountUnitCode(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return normalized || "piezas";
}

async function loadProductMeasurementPolicies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productIds: string[]
): Promise<Map<string, ProductMeasurementPolicy>> {
  const safeProductIds = Array.from(
    new Set(productIds.map((productId) => String(productId ?? "").trim()).filter(Boolean))
  );
  const policies = new Map<string, ProductMeasurementPolicy>();
  if (safeProductIds.length === 0) return policies;

  const { data, error } = await supabase
    .from("product_inventory_profiles")
    .select("product_id,measurement_mode,default_tolerance_percent,aux_count_unit_code,requires_actual_receipt_qty,requires_actual_dispatch_qty,requires_count_alongside_weight")
    .in("product_id", safeProductIds);

  if (error) return policies;

  for (const row of (data ?? []) as Array<{
    product_id: string | null;
    measurement_mode: string | null;
    default_tolerance_percent: number | null;
    aux_count_unit_code: string | null;
    requires_actual_receipt_qty: boolean | null;
    requires_actual_dispatch_qty: boolean | null;
    requires_count_alongside_weight: boolean | null;
  }>) {
    const productId = String(row.product_id ?? "").trim();
    if (!productId) continue;
    const measurementMode = normalizeMeasurementMode(row.measurement_mode);
    policies.set(productId, {
      product_id: productId,
      measurement_mode: measurementMode,
      default_tolerance_percent:
        typeof row.default_tolerance_percent === "number"
          ? row.default_tolerance_percent
          : null,
      aux_count_unit_code: String(row.aux_count_unit_code ?? "").trim() || null,
      requires_actual_receipt_qty:
        typeof row.requires_actual_receipt_qty === "boolean"
          ? row.requires_actual_receipt_qty
          : measurementMode !== "fixed_presentation",
      requires_actual_dispatch_qty:
        typeof row.requires_actual_dispatch_qty === "boolean"
          ? row.requires_actual_dispatch_qty
          : measurementMode !== "fixed_presentation",
      requires_count_alongside_weight:
        typeof row.requires_count_alongside_weight === "boolean"
          ? row.requires_count_alongside_weight
          : measurementMode === "count_with_weight",
    });
  }

  return policies;
}

function toFriendlyTransitStockError(message: string): string {
  const raw = String(message ?? "").trim();
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("insufficient physical stock") &&
    normalized.includes("selected presentation")
  ) {
    return [
      "No hay stock físico suficiente para la presentación seleccionada.",
      "La remisión no se puso en tránsito ni se descontó inventario.",
      "Revisa en la preparación: producto, presentación física, ubicación de origen y cantidad.",
      "Si el stock existe en unidad base pero no en esa presentación, cambia la preparación a una presentación disponible o corrige el stock físico de esa presentación antes de despachar.",
    ].join(" ");
  }

  if (normalized.includes("insufficient physical stock")) {
    return [
      "No hay stock físico suficiente para completar el despacho.",
      "La remisión no se puso en tránsito ni se descontó inventario.",
      "Revisa la ubicación de origen, presentación física y cantidad preparada.",
    ].join(" ");
  }

  if (normalized.includes("insufficient stock")) {
    return [
      "No hay stock suficiente para completar el despacho.",
      "La remisión no se puso en tránsito ni se descontó inventario.",
      "Revisa la ubicación de origen y la cantidad preparada.",
    ].join(" ");
  }

  return raw || "No se pudo poner la remisión en tránsito.";
}

async function requestHasPreparationPicks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestId: string
): Promise<boolean> {
  if (!requestId) return false;

  const { count, error } = await supabase
    .from("restock_request_item_picks")
    .select("id", { head: true, count: "exact" })
    .eq("request_id", requestId);

  if (error) return false;
  return Number(count ?? 0) > 0;
}

function hasOriginShortageNote(value: unknown): boolean {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  return (
    normalized.includes("faltante origen") ||
    normalized.includes("sin stock en origen") ||
    normalized.includes("no disponible en origen")
  );
}

async function ensureOperationalTransitReady(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  requestId: string;
}): Promise<boolean> {
  const { supabase, requestId } = params;

  const { data: itemsData, error } = await supabase
    .from("restock_request_items")
    .select("quantity,prepared_quantity,shipped_quantity,notes")
    .eq("request_id", requestId);

  if (error) return false;

  const rows = (itemsData ?? []) as Array<{
    quantity: number | null;
    prepared_quantity: number | null;
    shipped_quantity: number | null;
    notes: string | null;
  }>;

  if (rows.length === 0) return false;

  let hasDispatchableQty = false;

  for (const row of rows) {
    const requestedQty = roundQuantity(Number(row.quantity ?? 0));
    const preparedQty = roundQuantity(Number(row.prepared_quantity ?? 0));
    const shippedQty = roundQuantity(Number(row.shipped_quantity ?? 0));
    const effectiveQty = Math.max(preparedQty, shippedQty);

    if (effectiveQty > 0) hasDispatchableQty = true;

    const resolved =
      requestedQty <= 0 ||
      effectiveQty > 0 ||
      hasOriginShortageNote(row.notes);

    if (!resolved) return false;
  }

  return hasDispatchableQty;
}


type LocationRemissionPostingFlags = {
  inventoryRealEnabled: boolean;
  remissionsPostingEnabled: boolean;
};

const LOCATION_INVENTORY_REAL_SETTING = "inventory_real_enabled";
const LOCATION_REMISSIONS_POSTING_SETTING = "remissions_posting_enabled";
const OPERATIONAL_REMISSION_MOVEMENT_TYPE = "stock_consume_position";
const REAL_REMISSION_MOVEMENT_TYPE = "transfer_out";

function buildLocationRuntimeSettingKey(locationId: string, setting: string): string {
  return `locations.${locationId}.${setting}`;
}

function defaultLocationRemissionPostingFlags(): LocationRemissionPostingFlags {
  return {
    inventoryRealEnabled: false,
    remissionsPostingEnabled: false,
  };
}

function locationPostsRealRemissionInventory(
  flags: LocationRemissionPostingFlags | null | undefined
): boolean {
  return Boolean(flags?.inventoryRealEnabled && flags.remissionsPostingEnabled);
}

async function loadLocationRemissionPostingFlags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  locationIds: string[]
): Promise<Map<string, LocationRemissionPostingFlags>> {
  const safeLocationIds = Array.from(
    new Set(locationIds.map((locationId) => String(locationId ?? "").trim()).filter(Boolean))
  );
  const flagsByLocationId = new Map<string, LocationRemissionPostingFlags>();
  for (const locationId of safeLocationIds) {
    flagsByLocationId.set(locationId, defaultLocationRemissionPostingFlags());
  }
  if (safeLocationIds.length === 0) return flagsByLocationId;

  const settingKeys = safeLocationIds.flatMap((locationId) => [
    buildLocationRuntimeSettingKey(locationId, LOCATION_INVENTORY_REAL_SETTING),
    buildLocationRuntimeSettingKey(locationId, LOCATION_REMISSIONS_POSTING_SETTING),
  ]);

  const { data, error } = await supabase
    .from("app_runtime_settings")
    .select("setting_key,bool_value")
    .eq("app_id", APP_ID)
    .in("setting_key", settingKeys);

  if (error) return flagsByLocationId;

  for (const row of (data ?? []) as Array<{ setting_key: string | null; bool_value: boolean | null }>) {
    const settingKey = String(row.setting_key ?? "").trim();
    const boolValue = typeof row.bool_value === "boolean" ? row.bool_value : false;
    const match = settingKey.match(/^locations\.([^.]*)\.(inventory_real_enabled|remissions_posting_enabled)$/);
    if (!match) continue;

    const locationId = match[1];
    const setting = match[2];
    const current = flagsByLocationId.get(locationId) ?? defaultLocationRemissionPostingFlags();

    if (setting === LOCATION_INVENTORY_REAL_SETTING) {
      current.inventoryRealEnabled = boolValue;
    }
    if (setting === LOCATION_REMISSIONS_POSTING_SETTING) {
      current.remissionsPostingEnabled = boolValue;
    }
    flagsByLocationId.set(locationId, current);
  }

  return flagsByLocationId;
}

async function requestPicksUseOnlyRealRemissionLocations(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  requestId: string;
}): Promise<boolean> {
  const { supabase, requestId } = params;
  if (!requestId) return false;

  const { data, error } = await supabase
    .from("restock_request_item_picks")
    .select("source_location_id")
    .eq("request_id", requestId);

  if (error) return false;

  const locationIds = Array.from(
    new Set(
      ((data ?? []) as Array<{ source_location_id: string | null }>)
        .map((row) => String(row.source_location_id ?? "").trim())
        .filter(Boolean)
    )
  );
  if (locationIds.length === 0) return false;

  const flagsByLocationId = await loadLocationRemissionPostingFlags(supabase, locationIds);
  return locationIds.every((locationId) =>
    locationPostsRealRemissionInventory(flagsByLocationId.get(locationId))
  );
}

type SourceLocDeduction = {
  locationId: string;
  productId: string;
  qty: number;
  unitCode: string;
  uomProfileId?: string | null;
  presentationQty?: number;
  inputUnitCode?: string | null;
  realPosting: boolean;
};

async function applySourceRemissionDeductions(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  requestId: string;
  siteId: string;
  userId: string;
  deductions: SourceLocDeduction[];
}): Promise<string | null> {
  const { supabase, requestId, siteId, userId, deductions } = params;

  for (const deduction of deductions) {
    if (!deduction.locationId || !deduction.productId || deduction.qty <= 0) continue;

    if (!deduction.realPosting) {
      const { error: operationalMoveErr } = await supabase.from("inventory_movements").insert({
        site_id: siteId,
        product_id: deduction.productId,
        movement_type: OPERATIONAL_REMISSION_MOVEMENT_TYPE,
        quantity: -deduction.qty,
        input_qty: deduction.presentationQty && deduction.presentationQty > 0 ? deduction.presentationQty : deduction.qty,
        input_unit_code: deduction.inputUnitCode || deduction.unitCode,
        stock_unit_code: deduction.unitCode,
        input_uom_profile_id: deduction.uomProfileId || null,
        location_id: deduction.locationId,
        related_restock_request_id: requestId,
        note: "Salida operativa por remisión. No descuenta inventario real.",
        created_by: userId,
      });
      if (operationalMoveErr) return operationalMoveErr.message;
      continue;
    }

    const { error: movementErr } = await supabase.from("inventory_movements").insert({
      site_id: siteId,
      product_id: deduction.productId,
      movement_type: REAL_REMISSION_MOVEMENT_TYPE,
      quantity: -deduction.qty,
      input_qty: deduction.presentationQty && deduction.presentationQty > 0 ? deduction.presentationQty : deduction.qty,
      input_unit_code: deduction.inputUnitCode || deduction.unitCode,
      stock_unit_code: deduction.unitCode,
      input_uom_profile_id: deduction.uomProfileId || null,
      location_id: deduction.locationId,
      related_restock_request_id: requestId,
      note: "Salida por remisión desde LOC con inventario real activo.",
      created_by: userId,
    });
    if (movementErr) return movementErr.message;

    if (deduction.uomProfileId && Number(deduction.presentationQty ?? 0) > 0) {
      const { error: presentationErr } = await supabase.rpc("consume_inventory_stock_by_uom_profile", {
        p_location_id: deduction.locationId,
        p_product_id: deduction.productId,
        p_uom_profile_id: deduction.uomProfileId,
        p_presentation_qty: deduction.presentationQty,
        p_base_qty: deduction.qty,
        p_location_position_id: null,
      });
      if (presentationErr) return presentationErr.message;
    }

    const { error: locErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
      p_location_id: deduction.locationId,
      p_product_id: deduction.productId,
      p_delta: -deduction.qty,
    });
    if (locErr) return `No se pudo actualizar stock del área de origen: ${locErr.message}`;

    const { data: siteStock } = await supabase
      .from("inventory_stock_by_site")
      .select("current_qty")
      .eq("site_id", siteId)
      .eq("product_id", deduction.productId)
      .maybeSingle();

    const currentQty = Number((siteStock as { current_qty?: number } | null)?.current_qty ?? 0);
    const nextQty = Math.max(0, currentQty - deduction.qty);

    const { error: siteErr } = await supabase
      .from("inventory_stock_by_site")
      .upsert(
        {
          site_id: siteId,
          product_id: deduction.productId,
          current_qty: nextQty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_id,product_id" }
      );
    if (siteErr) return siteErr.message;
  }

  return null;
}

async function ensureReceiveSignature(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  requestId: string;
  employeeId: string;
}) {
  const { supabase, requestId, employeeId } = params;
  const { data: requestRow, error: requestErr } = await supabase
    .from("restock_requests")
    .select("status,received_by,received_at")
    .eq("id", requestId)
    .maybeSingle();

  if (requestErr || !requestRow) return requestErr?.message ?? null;

  const status = String(requestRow.status ?? "");
  if (!["partial", "received"].includes(status)) return null;
  if (requestRow.received_by) return null;

  const updates: { received_by: string; received_at?: string } = {
    received_by: employeeId,
  };
  if (!requestRow.received_at) {
    updates.received_at = new Date().toISOString();
  }

  const { error: updateErr } = await supabase
    .from("restock_requests")
    .update(updates)
    .eq("id", requestId)
    .is("received_by", null);
  return updateErr?.message ?? null;
}

type DestinationReceiptBucket = "bar" | "cocina" | "almacenamiento";

type DestinationReceiptItemRow = {
  id: string;
  product_id: string | null;
  received_quantity: number | null;
  production_area_kind: string | null;
};

type DestinationReceiptLocationRow = {
  id: string;
  site_id: string | null;
  area_id: string | null;
  code: string | null;
  zone: string | null;
  aisle: string | null;
  level: string | null;
  description: string | null;
  is_active?: boolean | null;
};

type DestinationReceiptAreaRow = {
  id: string;
  site_id: string | null;
  code: string | null;
  name: string | null;
  kind: string | null;
  is_active?: boolean | null;
};

type DestinationReceiptAllocation = {
  locationId: string;
  productId: string;
  qty: number;
};

function normalizeReceiptRoutingText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function resolveDestinationReceiptBucket(areaKind: unknown): DestinationReceiptBucket {
  const value = normalizeReceiptRoutingText(areaKind);

  if (value.includes("bar") || value.includes("barra")) return "bar";
  if (value.includes("coc") || value.includes("kitchen")) return "cocina";

  // Mostrador no es área de producción: en Vento Café debe entrar al stock/almacenamiento.
  return "almacenamiento";
}

function destinationReceiptBucketLabel(bucket: DestinationReceiptBucket): string {
  switch (bucket) {
    case "bar":
      return "Barra / BAR";
    case "cocina":
      return "Cocina";
    case "almacenamiento":
    default:
      return "Almacenamiento / stock";
  }
}

function destinationReceiptLocationScore(params: {
  location: DestinationReceiptLocationRow;
  areaById: Map<string, DestinationReceiptAreaRow>;
  bucket: DestinationReceiptBucket;
}): number {
  const { location, areaById, bucket } = params;
  const area = location.area_id ? areaById.get(location.area_id) ?? null : null;
  const zone = normalizeReceiptRoutingText(location.zone);
  const tokens = [
    location.code,
    location.zone,
    location.aisle,
    location.level,
    location.description,
    area?.code,
    area?.name,
    area?.kind,
  ].map(normalizeReceiptRoutingText);
  const joined = tokens.filter(Boolean).join(" ");

  let score = 0;

  if (bucket === "bar") {
    if (zone === "bar") score += 100;
    if (joined.includes("bar") || joined.includes("barra")) score += 80;
    if (joined.includes("almacen") || joined.includes("bodega")) score += 10;
  }

  if (bucket === "cocina") {
    if (zone === "coc" || zone === "cocina") score += 100;
    if (joined.includes("coc") || joined.includes("cocina") || joined.includes("kitchen")) {
      score += 80;
    }
    if (joined.includes("preparacion") || joined.includes("prep")) score += 20;
  }

  if (bucket === "almacenamiento") {
    const storageZoneCodes = new Set([
      "bod",
      "bodega",
      "frio",
      "cong",
      "n2p",
      "n3p",
      "secos1",
      "secprep",
      "emp",
      "rec",
    ]);
    const storageWords = [
      "almacen",
      "bodega",
      "stock",
      "inventario",
      "frio",
      "congel",
      "seco",
      "nevera",
      "recepcion",
      "recibo",
    ];
    const productionWords = ["bar", "barra", "coc", "cocina", "kitchen"];

    if (storageZoneCodes.has(zone)) score += 100;
    if (storageWords.some((word) => joined.includes(word))) score += 90;
    if (joined.includes("general")) score += 30;
    if (joined.includes("mostrador")) score += 20;
    if (productionWords.some((word) => joined.includes(word))) score -= 60;
  }

  return score;
}

function selectDestinationReceiptLocation(params: {
  locations: DestinationReceiptLocationRow[];
  areaById: Map<string, DestinationReceiptAreaRow>;
  bucket: DestinationReceiptBucket;
}): DestinationReceiptLocationRow | null {
  const { locations, areaById, bucket } = params;
  const activeLocations = locations.filter((location) => location.is_active !== false);
  if (activeLocations.length === 0) return null;

  const ranked = activeLocations
    .map((location) => ({
      location,
      score: destinationReceiptLocationScore({ location, areaById, bucket }),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(a.location.code ?? a.location.id).localeCompare(
          String(b.location.code ?? b.location.id)
        )
    );

  if (ranked[0]) return ranked[0].location;

  // Sedes simples o recién migradas: si solo existe un LOC activo, úsalo como fallback seguro.
  if (activeLocations.length === 1) return activeLocations[0] ?? null;

  return null;
}

async function buildDestinationReceiptLocationAllocations(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  requestId: string;
  toSiteId: string;
}): Promise<{ allocations: DestinationReceiptAllocation[]; error: string | null }> {
  const { supabase, requestId, toSiteId } = params;

  const { data: itemRowsData, error: itemRowsErr } = await supabase
    .from("restock_request_items")
    .select("id,product_id,received_quantity,production_area_kind")
    .eq("request_id", requestId);

  if (itemRowsErr) return { allocations: [], error: itemRowsErr.message };

  const itemRows = (itemRowsData ?? []) as DestinationReceiptItemRow[];
  const receivedRows = itemRows.filter(
    (row) => roundQuantity(Number(row.received_quantity ?? 0)) > 0
  );

  if (receivedRows.length === 0) return { allocations: [], error: null };

  const { data: locationRowsData, error: locationRowsErr } = await supabase
    .from("inventory_locations")
    .select("id,site_id,area_id,code,zone,aisle,level,description,is_active")
    .eq("site_id", toSiteId)
    .eq("is_active", true);

  if (locationRowsErr) return { allocations: [], error: locationRowsErr.message };

  const locations = (locationRowsData ?? []) as DestinationReceiptLocationRow[];
  if (locations.length === 0) {
    return {
      allocations: [],
      error: "La sede destino no tiene LOC/áreas activas para recibir inventario.",
    };
  }

  const areaIds = Array.from(
    new Set(locations.map((location) => String(location.area_id ?? "").trim()).filter(Boolean))
  );

  const { data: areaRowsData, error: areaRowsErr } = areaIds.length
    ? await supabase
      .from("areas")
      .select("id,site_id,code,name,kind,is_active")
      .in("id", areaIds)
    : { data: [] as DestinationReceiptAreaRow[], error: null };

  if (areaRowsErr) return { allocations: [], error: areaRowsErr.message };

  const areaById = new Map(
    ((areaRowsData ?? []) as DestinationReceiptAreaRow[])
      .filter((area) => area.is_active !== false)
      .map((area) => [area.id, area])
  );
  const allocationsByKey = new Map<string, DestinationReceiptAllocation>();

  for (const row of receivedRows) {
    const productId = String(row.product_id ?? "").trim();
    const qty = roundQuantity(Number(row.received_quantity ?? 0));
    if (!productId || qty <= 0) continue;

    const bucket = resolveDestinationReceiptBucket(row.production_area_kind);
    const location = selectDestinationReceiptLocation({ locations, areaById, bucket });

    if (!location) {
      return {
        allocations: [],
        error: `No se encontró un LOC destino activo para ${destinationReceiptBucketLabel(bucket)}. Crea o activa un LOC de esa zona en la sede destino antes de recibir.`,
      };
    }

    const key = `${location.id}|${productId}`;
    const current = allocationsByKey.get(key) ?? {
      locationId: location.id,
      productId,
      qty: 0,
    };
    current.qty = roundQuantity(current.qty + qty);
    allocationsByKey.set(key, current);
  }

  return { allocations: Array.from(allocationsByKey.values()), error: null };
}

async function applyDestinationReceiptLocationAllocations(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  allocations: DestinationReceiptAllocation[];
}): Promise<string | null> {
  const { supabase, allocations } = params;

  for (const allocation of allocations) {
    if (!allocation.locationId || !allocation.productId || allocation.qty <= 0) continue;

    const { error } = await supabase.rpc("upsert_inventory_stock_by_location", {
      p_location_id: allocation.locationId,
      p_product_id: allocation.productId,
      p_delta: allocation.qty,
    });

    if (error) return error.message;
  }

  return null;
}

async function ensureDestinationReceiptMovements(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  requestId: string;
  toSiteId?: string | null;
}) {
  const { supabase, requestId, toSiteId } = params;
  const inventoryPostingEnabled = await isRemissionInventoryPostingEnabled(supabase);
  if (!inventoryPostingEnabled) return null;

  const siteId = String(toSiteId ?? "").trim();
  if (!siteId) return null;

  const { data: reqRow, error: reqErr } = await supabase
    .from("restock_requests")
    .select("status")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr || !reqRow) return reqErr?.message ?? null;
  if (String(reqRow.status ?? "") !== "received") return null;

  const { count, error: countErr } = await supabase
    .from("inventory_movements")
    .select("id", { head: true, count: "exact" })
    .eq("related_restock_request_id", requestId)
    .eq("movement_type", "transfer_in")
    .eq("site_id", siteId);
  if (countErr) return countErr.message;
  if (Number(count ?? 0) > 0) return null;

  const allocationResult = await buildDestinationReceiptLocationAllocations({
    supabase,
    requestId,
    toSiteId: siteId,
  });
  if (allocationResult.error) return allocationResult.error;

  const { error: receiptErr } = await supabase.rpc("apply_restock_receipt", {
    p_request_id: requestId,
  });
  if (receiptErr) return receiptErr.message;

  const { data: transferInRows, error: transferInRowsErr } = await supabase
    .from("inventory_movements")
    .select("id,location_id")
    .eq("related_restock_request_id", requestId)
    .eq("movement_type", "transfer_in")
    .eq("site_id", siteId)
    .limit(10);
  if (transferInRowsErr) return transferInRowsErr.message;

  const receiptAlreadyPostedByLocation = ((transferInRows ?? []) as Array<{
    id: string;
    location_id: string | null;
  }>).some((row) => Boolean(String(row.location_id ?? "").trim()));

  if (receiptAlreadyPostedByLocation) return null;

  return applyDestinationReceiptLocationAllocations({
    supabase,
    allocations: allocationResult.allocations,
  });
}

async function ensureInternalTransferPricing(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  requestId: string;
}) {
  const { supabase, requestId } = params;
  if (!requestId) return null;

  const { data: reqRow, error: reqErr } = await supabase
    .from("restock_requests")
    .select("status")
    .eq("id", requestId)
    .maybeSingle();

  if (reqErr || !reqRow) return reqErr?.message ?? null;
  if (String(reqRow.status ?? "") !== "received") return null;

  const { error: pricingErr } = await supabase.rpc(
    "price_restock_request_internal_transfer",
    {
      p_request_id: requestId,
    }
  );

  return pricingErr?.message ?? null;
}

export async function updateItems(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("id,from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request);
  const inventoryPostingEnabled = await isRemissionInventoryPostingEnabled(supabase);
  const currentStatus = String(request?.status ?? "");
  const allowPrepared =
    access.canPrepare && ["pending", "preparing"].includes(currentStatus);
  const allowReceived =
    access.canReceive && ["in_transit", "partial"].includes(currentStatus);
  const allowArea = access.canCancel || allowPrepared;

  if (allowPrepared) {
    await enforceOperationalGateOrRedirect({
      supabase,
      userId: user.id,
      siteId: request?.from_site_id,
      requestId,
      returnOrigin,
      fallbackMessage: "No puedes preparar esta remisión en este momento.",
    });
  }
  if (allowReceived) {
    await enforceOperationalGateOrRedirect({
      supabase,
      userId: user.id,
      siteId: request?.to_site_id,
      requestId,
      returnOrigin,
      fallbackMessage: "No puedes recibir esta remisión en este momento.",
    });
  }

  const itemIds = formData.getAll("item_id").map((v) => String(v).trim());
  const prepared = formData.getAll("prepared_quantity").map((v) => String(v).trim());
  const shipped = formData.getAll("shipped_quantity").map((v) => String(v).trim());
  const received = formData.getAll("received_quantity").map((v) => String(v).trim());
  const shortage = formData.getAll("shortage_quantity").map((v) => String(v).trim());
  const areaKinds = formData.getAll("item_area_kind").map((v) => String(v).trim());
  const sourceLocationIds = formData
    .getAll("source_location_id")
    .map((v) => String(v).trim());
  const { data: itemStateRows } = await supabase
    .from("restock_request_items")
    .select("id,product_id,quantity,prepared_quantity,shipped_quantity,received_quantity,shortage_quantity")
    .eq("request_id", requestId);
  const itemStateById = new Map(
    (
      (itemStateRows ?? []) as Array<{
        id: string;
        product_id: string;
        quantity: number | null;
        prepared_quantity: number | null;
        shipped_quantity: number | null;
        received_quantity: number | null;
        shortage_quantity: number | null;
      }>
    ).map((row) => [row.id, row])
  );
  const itemMeasurementPolicyByProductId = await loadProductMeasurementPolicies(
    supabase,
    Array.from(itemStateById.values()).map((row) => row.product_id)
  );

  const fromSiteId = request?.from_site_id ?? "";
  const allowSourceLocation =
    inventoryPostingEnabled &&
    allowPrepared &&
    access.fromCanFulfillRemissions;
  if (allowPrepared) {
    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i];
      const itemState = itemStateById.get(itemId);
      if (!itemState) continue;

      const prepQty = parseNumber(prepared[i] ?? "0");
      const shipQty = parseNumber(shipped[i] ?? "0");
      const requestedQty = roundQuantity(Number(itemState.quantity ?? 0));

      if (prepQty < 0 || shipQty < 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Preparado y enviado no pueden ser negativos.",
          })
        );
      }

      if (
        shouldRejectOverRequestedQuantity({
          policyByProductId: itemMeasurementPolicyByProductId,
          productId: itemState.product_id,
          requestedQty,
          actualQty: prepQty,
        })
      ) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad preparada (${prepQty}) mayor que solicitada (${requestedQty}) para una presentación fija.`,
          })
        );
      }

      if (
        shouldRejectOverRequestedQuantity({
          policyByProductId: itemMeasurementPolicyByProductId,
          productId: itemState.product_id,
          requestedQty,
          actualQty: shipQty,
        })
      ) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad enviada (${shipQty}) mayor que solicitada (${requestedQty}) para una presentación fija.`,
          })
        );
      }

      if (shipQty > prepQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad enviada (${shipQty}) no puede superar la preparada (${prepQty}).`,
          })
        );
      }
    }
  }

  if (inventoryPostingEnabled && allowPrepared && fromSiteId) {
    const { data: stockRows } = await supabase
      .from("inventory_stock_by_site")
      .select("product_id,current_qty")
      .eq("site_id", fromSiteId);
    const stockMap = new Map(
      (stockRows ?? []).map((r: { product_id: string; current_qty: number | null }) => [
        r.product_id,
        Number(r.current_qty ?? 0),
      ])
    );
    const productById = new Map(
      Array.from(itemStateById.values()).map((row) => [row.id, row.product_id])
    );

    const selectedLocIds = Array.from(new Set(sourceLocationIds.filter(Boolean)));
    const selectedProductIds = Array.from(new Set(productById.values()));
    const { data: locStockRows } =
      allowSourceLocation && selectedLocIds.length > 0 && selectedProductIds.length > 0
        ? await supabase
          .from("inventory_stock_by_location")
          .select("location_id,product_id,current_qty")
          .in("location_id", selectedLocIds)
          .in("product_id", selectedProductIds)
        : { data: [] as { location_id: string; product_id: string; current_qty: number | null }[] };
    const locStockMap = new Map(
      (locStockRows ?? []).map((row) => [
        `${row.location_id}|${row.product_id}`,
        Number(row.current_qty ?? 0),
      ])
    );

    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i];
      const itemState = itemStateById.get(itemId);
      const productId = productById.get(itemId);
      if (!productId) continue;
      const available = Number(stockMap.get(productId) ?? 0);
      const prepQty = parseNumber(prepared[i] ?? "0");
      const shipQty = parseNumber(shipped[i] ?? "0");
      const requestedQty = roundQuantity(Number(itemState?.quantity ?? 0));
      const maxQty = Math.max(prepQty, shipQty);
      if (maxQty > available) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad preparada/enviada (${maxQty}) mayor que stock disponible en origen (${available}). Ajusta las cantidades.`,
          })
        );
      }
      if (allowSourceLocation && maxQty > 0) {
        const sourceLocId = sourceLocationIds[i] || "";
        if (!sourceLocId) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: "Selecciona área de origen para todos los items preparados/enviados.",
            })
          );
        }
        const availableAtLoc = Number(locStockMap.get(`${sourceLocId}|${productId}`) ?? 0);
        if (maxQty > availableAtLoc) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: `Cantidad preparada/enviada (${maxQty}) mayor que disponible en el área de origen (${availableAtLoc}).`,
            })
          );
        }
      }
    }
  }

  if (allowReceived) {
    for (let i = 0; i < itemIds.length; i += 1) {
      const itemId = itemIds[i];
      const itemState = itemStateById.get(itemId);
      if (!itemState) continue;
      const receivedQty = parseNumber(received[i] ?? "0");
      const shortageQty = parseNumber(shortage[i] ?? "0");
      const shippedQty = roundQuantity(Number(itemState.shipped_quantity ?? 0));

      if (receivedQty < 0 || shortageQty < 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Recibido y faltante no pueden ser negativos.",
          })
        );
      }
      if (shippedQty <= 0 && (receivedQty > 0 || shortageQty > 0)) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "No puedes registrar recibido o faltante en items que no fueron enviados.",
          })
        );
      }
      if (receivedQty + shortageQty > shippedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Recibido + faltante (${receivedQty + shortageQty}) no puede superar enviado (${shippedQty}).`,
          })
        );
      }
    }
  }

  for (let i = 0; i < itemIds.length; i += 1) {
    const itemId = itemIds[i];
    if (!itemId) continue;

    const updates: Record<string, number | string | null> = {};
    const itemState = itemStateById.get(itemId);

    if (allowPrepared) {
      updates.prepared_quantity = parseNumber(prepared[i] ?? "0");
      updates.shipped_quantity = parseNumber(shipped[i] ?? "0");
      updates.source_location_id = inventoryPostingEnabled
        ? sourceLocationIds[i] || null
        : null;
    }
    if (allowReceived) {
      updates.received_quantity = parseNumber(received[i] ?? "0");
      updates.shortage_quantity = parseNumber(shortage[i] ?? "0");
    }

    if (allowArea) {
      updates.production_area_kind = areaKinds[i] || null;
    }

    if (itemState) {
      const requestedQty = roundQuantity(Number(itemState.quantity ?? 0));
      const preparedQty = roundQuantity(
        Number(
          allowPrepared ? updates.prepared_quantity ?? 0 : itemState.prepared_quantity ?? 0
        )
      );
      const shippedQty = roundQuantity(
        Number(
          allowPrepared ? updates.shipped_quantity ?? 0 : itemState.shipped_quantity ?? 0
        )
      );
      const receivedQty = roundQuantity(
        Number(
          allowReceived ? updates.received_quantity ?? 0 : itemState.received_quantity ?? 0
        )
      );
      const shortageQty = roundQuantity(
        Number(
          allowReceived ? updates.shortage_quantity ?? 0 : itemState.shortage_quantity ?? 0
        )
      );
    }

    if (!Object.keys(updates).length) continue;

    const { error } = await supabase
      .from("restock_request_items")
      .update(updates)
      .eq("id", itemId);

    if (error) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
    }
  }

  redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, ok: "items_updated" }));
}

type CommitLinePayload = {
  id: string;
  baseItemId: string;
  selectedLocId: string;
  dispatchQty: number;
  requestedQty: number;
  shortageReason: string;
  isVirtualSplit: boolean;
};

type CommitSplitPayload = {
  tempLineId: string;
  sourceItemId: string;
  splitQuantity: number;
};

type ProductionPackagePlanItem = {
  packageId: string;
  dispatchQty: number;
  unitCode: string;
  remainingQty: number;
  label: string;
  batchId: string | null;
  fractional: boolean;
};

type CommitPickPayload = {
  id?: string;
  itemId?: string;
  item_id?: string;
  baseItemId?: string;
  base_item_id?: string;
  productId?: string;
  product_id?: string;
  sourceLocationId?: string;
  source_location_id?: string;
  selectedLocId?: string;
  locationId?: string;
  location_id?: string;
  sourceLocationPositionId?: string | null;
  source_location_position_id?: string | null;
  sourcePositionId?: string | null;
  source_position_id?: string | null;
  selectedPositionId?: string | null;
  positionId?: string | null;
  position_id?: string | null;
  uomProfileId?: string | null;
  uom_profile_id?: string | null;
  inputUomProfileId?: string | null;
  input_uom_profile_id?: string | null;
  presentationQty?: number | string;
  presentation_qty?: number | string;
  baseQty?: number | string;
  base_qty?: number | string;
  dispatchQty?: number | string;
  quantity?: number | string;
  note?: string | null;
  notes?: string | null;
  shortageReason?: string | null;
  shortage_reason?: string | null;
  productionPackageId?: string | null;
  production_package_id?: string | null;
};

function parseProductionPackagePlan(value: unknown): ProductionPackagePlanItem[] {
  if (!value) return [];

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => {
        const packageId = String(entry?.packageId ?? "").trim();
        const dispatchQty = roundQuantity(Number(entry?.dispatchQty ?? 0));
        const unitCode = normalizeUnitCode(String(entry?.unitCode ?? ""));
        const remainingQty = roundQuantity(Number(entry?.remainingQty ?? 0));
        const label = String(entry?.label ?? "").trim();
        const batchId = String(entry?.batchId ?? "").trim() || null;
        const fractional = Boolean(entry?.fractional);

        if (!packageId || dispatchQty <= 0) return null;

        return {
          packageId,
          dispatchQty,
          unitCode,
          remainingQty,
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

async function applyProductionPackageDispatchForRequest(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  requestId: string;
  userId: string;
}): Promise<string | null> {
  const { supabase, requestId, userId } = params;
  if (!requestId) return null;

  const { data: itemRowsData, error: itemRowsErr } = await supabase
    .from("restock_request_items")
    .select(
      "id,product_id,prepared_quantity,shipped_quantity,production_package_plan,requires_package_dispatch,production_package_dispatch_applied_at"
    )
    .eq("request_id", requestId)
    .eq("requires_package_dispatch", true)
    .is("production_package_dispatch_applied_at", null);

  if (itemRowsErr) return itemRowsErr.message;

  const itemRows = (itemRowsData ?? []) as Array<{
    id: string;
    product_id: string | null;
    prepared_quantity: number | null;
    shipped_quantity: number | null;
    production_package_plan: unknown;
    requires_package_dispatch: boolean | null;
    production_package_dispatch_applied_at: string | null;
  }>;

  if (itemRows.length === 0) return null;

  const requestedByPackage = new Map<
    string,
    {
      qty: number;
      productId: string;
      itemIds: Set<string>;
    }
  >;
  const itemIdsToMark = new Set<string>();

  for (const item of itemRows) {
    const productId = String(item.product_id ?? "").trim();
    const shippedQty = roundQuantity(Number(item.shipped_quantity ?? 0));
    const preparedQty = roundQuantity(Number(item.prepared_quantity ?? 0));
    const effectiveQty = shippedQty > 0 ? shippedQty : preparedQty;
    const plan = parseProductionPackagePlan(item.production_package_plan);
    const planTotal = roundQuantity(plan.reduce((sum, entry) => sum + Number(entry.dispatchQty ?? 0), 0));

    if (!productId) {
      return "Una línea con empaques FOGO no tiene producto asociado.";
    }

    if (effectiveQty <= 0) {
      return "Una línea con empaques FOGO no tiene cantidad enviada.";
    }

    if (!plan.length) {
      return "Una línea producida requiere empaques FOGO, pero no tiene plan de empaques.";
    }

    if (Math.abs(planTotal - effectiveQty) > 0.001) {
      return "La cantidad enviada no coincide con el plan de empaques FOGO.";
    }

    itemIdsToMark.add(item.id);

    for (const entry of plan) {
      const current = requestedByPackage.get(entry.packageId) ?? {
        qty: 0,
        productId,
        itemIds: new Set<string>(),
      };

      if (current.productId !== productId) {
        return "Un empaque FOGO fue asignado a productos diferentes.";
      }

      current.qty = roundQuantity(current.qty + Number(entry.dispatchQty ?? 0));
      current.itemIds.add(item.id);
      requestedByPackage.set(entry.packageId, current);
    }
  }

  const packageIds = Array.from(requestedByPackage.keys());
  if (packageIds.length === 0) return null;

  const { data: packageRowsData, error: packageRowsErr } = await supabase
    .from("production_batch_packages")
    .select("id,product_id,remaining_qty,status")
    .in("id", packageIds);

  if (packageRowsErr) return packageRowsErr.message;

  const packageRowsById = new Map(
    ((packageRowsData ?? []) as Array<{
      id: string;
      product_id: string | null;
      remaining_qty: number | null;
      status: string | null;
    }>).map((row) => [row.id, row])
  );

  const nowIso = new Date().toISOString();

  for (const [packageId, requested] of requestedByPackage.entries()) {
    const packageRow = packageRowsById.get(packageId);
    if (!packageRow) return "Uno de los empaques FOGO ya no existe.";

    const packageProductId = String(packageRow.product_id ?? "").trim();
    const status = String(packageRow.status ?? "available").trim().toLowerCase();
    const remainingQty = roundQuantity(Number(packageRow.remaining_qty ?? 0));

    if (packageProductId !== requested.productId) {
      return "Uno de los empaques FOGO no coincide con el producto solicitado.";
    }

    if (!["available", "opened", "reserved"].includes(status)) {
      return "Uno de los empaques FOGO ya no está disponible.";
    }

    if (requested.qty > remainingQty + 0.001) {
      return "Uno de los empaques FOGO ya no tiene cantidad suficiente.";
    }

    const nextRemainingQty = roundQuantity(Math.max(remainingQty - requested.qty, 0));
    const nextStatus = nextRemainingQty <= 0.001 ? "dispatched" : "opened";

    const updatePayload: Record<string, string | number> = {
      remaining_qty: nextRemainingQty,
      status: nextStatus,
    };

    if (nextStatus === "opened") {
      updatePayload.opened_at = nowIso;
    } else {
      updatePayload.dispatched_at = nowIso;
    }

    const { error: updatePackageErr } = await supabase
      .from("production_batch_packages")
      .update(updatePayload)
      .eq("id", packageId);

    if (updatePackageErr) return updatePackageErr.message;
  }

  if (itemIdsToMark.size > 0) {
    const { error: markItemsErr } = await supabase
      .from("restock_request_items")
      .update({
        production_package_dispatch_applied_at: nowIso,
        production_package_dispatch_applied_by: userId,
      })
      .in("id", Array.from(itemIdsToMark));

    if (markItemsErr) return markItemsErr.message;
  }

  return null;
}

function payloadString(value: unknown): string {
  return String(value ?? "").trim();
}

function payloadNumber(value: unknown): number {
  return roundQuantity(parseNumber(String(value ?? "0")));
}

export async function commitPreparationDraft(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  const payloadRaw = asText(formData.get("payload"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  let parsed: {
    lines?: CommitLinePayload[];
    splitDrafts?: CommitSplitPayload[];
    picks?: CommitPickPayload[];
  } = {};
  try {
    parsed = JSON.parse(payloadRaw || "{}");
  } catch {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: "No se pudo leer el borrador de preparación.",
      })
    );
  }

  const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
  const splitDrafts = Array.isArray(parsed.splitDrafts) ? parsed.splitDrafts : [];
  const picks = Array.isArray(parsed.picks) ? parsed.picks : [];
  if (!lines.length && !picks.length) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: "No hay líneas para despachar.",
      })
    );
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("id,from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const inventoryPostingEnabled = await isRemissionInventoryPostingEnabled(supabase);

  if (!access.canPrepare) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: "No tienes permiso para preparar/despachar esta remisión.",
      })
    );
  }

  await enforceOperationalGateOrRedirect({
    supabase,
    userId: user.id,
    siteId: request?.from_site_id,
    requestId,
    returnOrigin,
    fallbackMessage: "No puedes despachar esta remisión en este momento.",
  });

  if (picks.length > 0) {
    const { data: itemRowsData, error: itemRowsError } = await supabase
      .from("restock_request_items")
      .select("id,product_id,quantity")
      .eq("request_id", requestId);

    if (itemRowsError) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: itemRowsError.message,
        })
      );
    }

    const itemRows = (itemRowsData ?? []) as Array<{
      id: string;
      product_id: string;
      quantity: number | null;
    }>;
    const itemById = new Map(itemRows.map((row) => [row.id, row]));
    const pickMeasurementPolicyByProductId = await loadProductMeasurementPolicies(
      supabase,
      itemRows.map((row) => row.product_id)
    );
    const pickedQtyByItem = new Map<string, number>();
    const locsByItem = new Map<string, Set<string>>();
    const shortageReasonByItem = new Map<string, string>();

    const nextPickRows: Array<{
      request_id: string;
      item_id: string;
      product_id: string;
      source_location_id: string;
      source_location_position_id: string | null;
      uom_profile_id: string | null;
      presentation_qty: number;
      base_qty: number;
      note: string | null;
      created_by: string;
      updated_by: string;
    }> = [];

    for (const rawPick of picks) {
      const itemId = payloadString(
        rawPick.itemId ?? rawPick.item_id ?? rawPick.baseItemId ?? rawPick.base_item_id
      );
      const item = itemById.get(itemId);
      if (!item) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: "El plan de salida contiene una línea que no pertenece a esta remisión.",
          })
        );
      }

      const productId = payloadString(rawPick.productId ?? rawPick.product_id) || item.product_id;
      if (productId !== item.product_id) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: "El producto de un pick no coincide con la línea solicitada.",
          })
        );
      }

      const sourceLocationId = payloadString(
        rawPick.sourceLocationId ??
          rawPick.source_location_id ??
          rawPick.selectedLocId ??
          rawPick.locationId ??
          rawPick.location_id
      );
      if (!sourceLocationId) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: "Cada pick debe tener una ubicación de salida.",
          })
        );
      }

      const sourceLocationPositionId =
        payloadString(
          rawPick.sourceLocationPositionId ??
            rawPick.source_location_position_id ??
            rawPick.sourcePositionId ??
            rawPick.source_position_id ??
            rawPick.selectedPositionId ??
            rawPick.positionId ??
            rawPick.position_id
        ) || null;
      const uomProfileId =
        payloadString(
          rawPick.uomProfileId ??
            rawPick.uom_profile_id ??
            rawPick.inputUomProfileId ??
            rawPick.input_uom_profile_id
        ) || null;
      const presentationQty = uomProfileId
        ? payloadNumber(rawPick.presentationQty ?? rawPick.presentation_qty)
        : 0;
      const baseQty = payloadNumber(
        rawPick.baseQty ?? rawPick.base_qty ?? rawPick.dispatchQty ?? rawPick.quantity
      );
      const note =
        payloadString(rawPick.note ?? rawPick.notes ?? rawPick.shortageReason ?? rawPick.shortage_reason) ||
        null;
      const shortageReason = payloadString(rawPick.shortageReason ?? rawPick.shortage_reason);

      if (baseQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: "Cada pick debe tener una cantidad base mayor a cero.",
          })
        );
      }
      if (uomProfileId && presentationQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: "Cada pick con presentación física debe tener cantidad de presentación mayor a cero.",
          })
        );
      }

      pickedQtyByItem.set(itemId, roundQuantity((pickedQtyByItem.get(itemId) ?? 0) + baseQty));
      const locs = locsByItem.get(itemId) ?? new Set<string>();
      locs.add(sourceLocationId);
      locsByItem.set(itemId, locs);
      if (shortageReason) shortageReasonByItem.set(itemId, shortageReason);

      nextPickRows.push({
        request_id: requestId,
        item_id: itemId,
        product_id: productId,
        source_location_id: sourceLocationId,
        source_location_position_id: sourceLocationPositionId,
        uom_profile_id: uomProfileId,
        presentation_qty: presentationQty,
        base_qty: baseQty,
        note,
        created_by: user.id,
        updated_by: user.id,
      });
    }

    for (const item of itemRows) {
      const requestedQty = roundQuantity(Number(item.quantity ?? 0));
      const pickedQty = roundQuantity(Number(pickedQtyByItem.get(item.id) ?? 0));

      if (requestedQty > 0 && pickedQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: "Todas las líneas solicitadas deben tener al menos un pick de salida.",
          })
        );
      }
      if (
        shouldRejectOverRequestedQuantity({
          policyByProductId: pickMeasurementPolicyByProductId,
          productId: item.product_id,
          requestedQty,
          actualQty: pickedQty,
        })
      ) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: `Cantidad preparada (${pickedQty}) mayor que solicitada (${requestedQty}) para una presentación fija.`,
          })
        );
      }
      if (requestedQty > 0 && pickedQty < requestedQty && !shortageReasonByItem.get(item.id)) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: "Debes registrar motivo de faltante en todas las líneas incompletas.",
          })
        );
      }
    }

    const { error: deletePicksError } = await supabase
      .from("restock_request_item_picks")
      .delete()
      .eq("request_id", requestId);

    if (deletePicksError) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: deletePicksError.message,
        })
      );
    }

    const { error: insertPicksError } = await supabase
      .from("restock_request_item_picks")
      .insert(nextPickRows);

    if (insertPicksError) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: insertPicksError.message,
        })
      );
    }

    for (const item of itemRows) {
      const pickedQty = roundQuantity(Number(pickedQtyByItem.get(item.id) ?? 0));
      const requestedQty = roundQuantity(Number(item.quantity ?? 0));
      const shortageReason = shortageReasonByItem.get(item.id) ?? "";
      const itemLocs = Array.from(locsByItem.get(item.id) ?? []);
      const sourceLocationId = itemLocs.length === 1 ? itemLocs[0] : null;
      const noteSuffix = pickedQty < requestedQty && shortageReason ? `FALTANTE ORIGEN: ${shortageReason}` : null;

      const { error: updateItemError } = await supabase
        .from("restock_request_items")
        .update({
          source_location_id: inventoryPostingEnabled ? sourceLocationId : null,
          prepared_quantity: pickedQty,
          shipped_quantity: pickedQty,
          notes: noteSuffix,
        })
        .eq("id", item.id)
        .eq("request_id", requestId);

      if (updateItemError) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: updateItemError.message,
          })
        );
      }
    }

    const nowIso = new Date().toISOString();
    const { error: reqErr } = await supabase
      .from("restock_requests")
      .update({
        status: "preparing",
        prepared_at: nowIso,
        prepared_by: user.id,
        status_updated_at: nowIso,
      })
      .eq("id", requestId);
    if (reqErr) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: reqErr.message,
        })
      );
    }

    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        ok: "ready_dispatch",
      })
    );
  }

  const virtualToRealId = new Map<string, string>();
  for (const splitDraft of splitDrafts) {
    const splitQty = Number(splitDraft.splitQuantity ?? 0);
    if (!splitDraft.sourceItemId || !splitDraft.tempLineId || splitQty <= 0) continue;
    const { data: newItemId, error } = await supabase.rpc("split_restock_request_item", {
      p_item_id: splitDraft.sourceItemId,
      p_split_quantity: splitQty,
    });
    if (error || !newItemId) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: error?.message || "No se pudo partir una línea.",
        })
      );
    }
    virtualToRealId.set(splitDraft.tempLineId, String(newItemId));
  }

  const resolvedLineIds = lines
    .map((line) =>
      line.isVirtualSplit
        ? virtualToRealId.get(line.id) ?? ""
        : String(line.id ?? "").trim()
    )
    .filter(Boolean);
  const { data: commitLineItemRows } = resolvedLineIds.length
    ? await supabase
      .from("restock_request_items")
      .select("id,product_id,quantity")
      .eq("request_id", requestId)
      .in("id", resolvedLineIds)
    : { data: [] as Array<{ id: string; product_id: string; quantity: number | null }> };
  const commitLineItemById = new Map(
    ((commitLineItemRows ?? []) as Array<{
      id: string;
      product_id: string;
      quantity: number | null;
    }>).map((row) => [row.id, row])
  );
  const commitLineMeasurementPolicyByProductId = await loadProductMeasurementPolicies(
    supabase,
    Array.from(commitLineItemById.values()).map((row) => row.product_id)
  );

  for (const line of lines) {
    const lineId = line.isVirtualSplit
      ? virtualToRealId.get(line.id) ?? ""
      : String(line.id ?? "").trim();
    const selectedLocId = String(line.selectedLocId ?? "").trim();
    const lineItem = commitLineItemById.get(lineId);
    const requestedQty = roundQuantity(Number(lineItem?.quantity ?? line.requestedQty ?? 0));
    const dispatchQty = roundQuantity(Number(line.dispatchQty ?? 0));
    const shortageReasonRaw = String(line.shortageReason ?? "").trim();
    const shortageReason =
      dispatchQty < requestedQty && !shortageReasonRaw && !inventoryPostingEnabled
        ? "Sin stock en origen"
        : shortageReasonRaw;

    if (!lineId || !lineItem || (inventoryPostingEnabled && dispatchQty > 0 && !selectedLocId)) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: inventoryPostingEnabled && dispatchQty > 0
            ? "Todas las líneas con cantidad a despachar deben tener un área seleccionada."
            : "No se pudo identificar una línea de preparación.",
        })
      );
    }
    if (
      dispatchQty < 0 ||
      shouldRejectOverRequestedQuantity({
        policyByProductId: commitLineMeasurementPolicyByProductId,
        productId: lineItem.product_id,
        requestedQty,
        actualQty: dispatchQty,
      })
    ) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: "Hay líneas con cantidad a despachar inválida para una presentación fija.",
        })
      );
    }
    if (dispatchQty < requestedQty && !shortageReason) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: "Debes registrar motivo de faltante en todas las líneas incompletas.",
        })
      );
    }

    const noteSuffix =
      dispatchQty < requestedQty
        ? `FALTANTE ORIGEN: ${shortageReason}`
        : null;

    const { error: lineErr } = await supabase
      .from("restock_request_items")
      .update({
        source_location_id: inventoryPostingEnabled ? selectedLocId : null,
        prepared_quantity: dispatchQty,
        shipped_quantity: dispatchQty,
        notes: noteSuffix,
      })
      .eq("id", lineId)
      .eq("request_id", requestId);
    if (lineErr) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: lineErr.message,
        })
      );
    }
  }

  const nowIso = new Date().toISOString();
  const { error: reqErr } = await supabase
    .from("restock_requests")
    .update({
      status: "preparing",
      prepared_at: nowIso,
      prepared_by: user.id,
      status_updated_at: nowIso,
    })
    .eq("id", requestId);
  if (reqErr) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: reqErr.message,
      })
    );
  }

  redirect(
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      siteId: activeSiteId,
      ok: "ready_dispatch",
    })
  );
}

export async function submitTransitChecklist(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("id,from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();
  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const inventoryPostingEnabled = await isRemissionInventoryPostingEnabled(supabase);
  const currentStatus = String(request?.status ?? "");
  if (!access.canTransit || currentStatus !== "preparing") {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: "Solo conductor autorizado puede poner en tránsito desde estado preparando.",
      })
    );
  }

  const { data: operationalSummary, error: operationalSummaryError } =
    await loadRemissionOperationalSummary({
      supabase,
      requestId,
    });
  if (operationalSummaryError) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: operationalSummaryError,
      })
    );
  }
  const summary = operationalSummary as RemissionOperationalSummary;

  const hasPreparationPicks = inventoryPostingEnabled
    ? await requestHasPreparationPicks(supabase, requestId)
    : false;
  const preparationPicksUseOnlyRealLocations = hasPreparationPicks
    ? await requestPicksUseOnlyRealRemissionLocations({ supabase, requestId })
    : false;
  const canTransitNow = hasPreparationPicks
    ? true
    : inventoryPostingEnabled
      ? Boolean(summary.can_transit) ||
        (await ensureOperationalTransitReady({ supabase, requestId }))
      : await ensureOperationalTransitReady({ supabase, requestId });

  if (!canTransitNow) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: "Completa la preparación de todas las líneas antes de despachar.",
      })
    );
  }

  const submittedPrepareFingerprint = asText(formData.get("prepare_fingerprint"));
  if (submittedPrepareFingerprint) {
    const { data: fpRows, error: fpErr } = await supabase
      .from("restock_request_items")
      .select("id,quantity,source_location_id,prepared_quantity,shipped_quantity")
      .eq("request_id", requestId);
    if (fpErr) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: fpErr.message,
        })
      );
    }
    const currentFp = buildPrepareFingerprintHash(fpRows ?? []);
    if (currentFp !== submittedPrepareFingerprint) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error:
            "La preparación cambió mientras revisabas. Actualiza la página y vuelve a confirmar el tránsito.",
        })
      );
    }
  }

  const itemIds = formData.getAll("item_id").map((v) => String(v).trim());
  const notes = formData.getAll("transit_note").map((v) => String(v).trim());
  for (let i = 0; i < itemIds.length; i += 1) {
    const itemId = itemIds[i];
    if (!itemId) continue;
    const note = notes[i] ?? "";
    if (!note) continue;
    const { data: existingRow } = await supabase
      .from("restock_request_items")
      .select("notes")
      .eq("id", itemId)
      .eq("request_id", requestId)
      .maybeSingle();
    const existing = String(existingRow?.notes ?? "").trim();
    const composed = existing
      ? `${existing}\nCONDUCTOR: ${note}`
      : `CONDUCTOR: ${note}`;
    const { error: noteErr } = await supabase
      .from("restock_request_items")
      .update({ notes: composed })
      .eq("id", itemId)
      .eq("request_id", requestId);
    if (noteErr) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: noteErr.message,
        })
      );
    }
  }

  if (inventoryPostingEnabled && hasPreparationPicks) {
    if (!preparationPicksUseOnlyRealLocations) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: "El plan de picks contiene LOCs operativos. Corrige la preparación para usar el flujo híbrido sin picks antes de poner en tránsito.",
        })
      );
    }

    const { error: moveErr } = await supabase.rpc("apply_restock_shipment_from_picks", {
      p_request_id: requestId,
    });
    if (moveErr) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: toFriendlyTransitStockError(moveErr.message),
        })
      );
    }

    const packageDispatchErr = await applyProductionPackageDispatchForRequest({
      supabase,
      requestId,
      userId: user.id,
    });
    if (packageDispatchErr) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: packageDispatchErr,
        })
      );
    }

    const nowIso = new Date().toISOString();
    const { error: reqErr } = await supabase
      .from("restock_requests")
      .update({
        status: "in_transit",
        in_transit_at: nowIso,
        in_transit_by: user.id,
        status_updated_at: nowIso,
      })
      .eq("id", requestId);
    if (reqErr) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: reqErr.message,
        })
      );
    }

    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        ok: "transit_started",
      })
    );
  }

  const sourceLocDeductions: SourceLocDeduction[] = [];

  const { data: itemsData } = await supabase
    .from("restock_request_items")
    .select("id,product_id,quantity,input_qty,input_unit_code,input_uom_profile_id,prepared_quantity,shipped_quantity,source_location_id,stock_unit_code,unit")
    .eq("request_id", requestId);

  const itemRows = (itemsData ?? []) as Array<{
    id: string;
    product_id: string;
    quantity: number | null;
    input_qty: number | null;
    input_unit_code: string | null;
    input_uom_profile_id: string | null;
    prepared_quantity: number | null;
    shipped_quantity: number | null;
    source_location_id: string | null;
    stock_unit_code: string | null;
    unit: string | null;
  }>;
  const transitMeasurementPolicyByProductId = await loadProductMeasurementPolicies(
    supabase,
    itemRows.map((row) => row.product_id)
  );

  if (inventoryPostingEnabled && access.fromCanFulfillRemissions) {
    const locIds = Array.from(
      new Set(itemRows.map((row) => row.source_location_id).filter(Boolean) as string[])
    );
    const productIds = Array.from(new Set(itemRows.map((row) => row.product_id).filter(Boolean)));

    const { data: locStockRows } =
      locIds.length > 0 && productIds.length > 0
        ? await supabase
          .from("inventory_stock_by_location")
          .select("location_id,product_id,current_qty")
          .in("location_id", locIds)
          .in("product_id", productIds)
        : { data: [] as { location_id: string; product_id: string; current_qty: number | null }[] };

    const locStockMap = new Map(
      (locStockRows ?? []).map((row) => [
        `${row.location_id}|${row.product_id}`,
        Number(row.current_qty ?? 0),
      ])
    );
    const locPostingFlags = await loadLocationRemissionPostingFlags(supabase, locIds);

    let anyTransitQty = false;

    for (const row of itemRows) {
      const requestedQty = roundQuantity(Number(row.quantity ?? 0));
      const preparedQty = roundQuantity(Number(row.prepared_quantity ?? 0));
      const shippedQty = roundQuantity(Number(row.shipped_quantity ?? 0));
      const effectiveShippedQty = shippedQty > 0 ? shippedQty : preparedQty;
      const effectivePreparedQty = Math.max(preparedQty, effectiveShippedQty);
      const qty = effectiveShippedQty;

      if (preparedQty < 0 || shippedQty < 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: "Preparado y enviado no pueden ser negativos.",
          })
        );
      }

      if (
        shouldRejectOverRequestedQuantity({
          policyByProductId: transitMeasurementPolicyByProductId,
          productId: row.product_id,
          requestedQty,
          actualQty: preparedQty,
        })
      ) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: `Cantidad preparada (${preparedQty}) mayor que solicitada (${requestedQty}) para una presentación fija.`,
          })
        );
      }

      if (
        shouldRejectOverRequestedQuantity({
          policyByProductId: transitMeasurementPolicyByProductId,
          productId: row.product_id,
          requestedQty,
          actualQty: effectiveShippedQty,
        })
      ) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: `Cantidad enviada (${effectiveShippedQty}) mayor que solicitada (${requestedQty}) para una presentación fija.`,
          })
        );
      }

      if (shippedQty > 0 && preparedQty > 0 && shippedQty > preparedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: `Cantidad enviada (${shippedQty}) no puede superar la preparada (${preparedQty}).`,
          })
        );
      }

      if (qty <= 0) continue;
      anyTransitQty = true;

      const sourceLocId = row.source_location_id ?? "";
      if (!sourceLocId) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: "Falta área de origen en uno o más items para enviar.",
          })
        );
      }

      const realPosting = locationPostsRealRemissionInventory(locPostingFlags.get(sourceLocId));
      const availableAtLoc = locStockMap.get(`${sourceLocId}|${row.product_id}`) ?? 0;
      if (realPosting && qty > availableAtLoc) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            siteId: activeSiteId,
            error: `Cantidad enviada (${qty}) supera el disponible en el área de origen (${availableAtLoc}).`,
          })
        );
      }

      if (effectivePreparedQty !== preparedQty || effectiveShippedQty !== shippedQty) {
        const { error: syncErr } = await supabase
          .from("restock_request_items")
          .update({
            prepared_quantity: effectivePreparedQty,
            shipped_quantity: effectiveShippedQty,
          })
          .eq("id", row.id);

        if (syncErr) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              siteId: activeSiteId,
              error: syncErr.message,
            })
          );
        }
      }

      sourceLocDeductions.push({
        locationId: sourceLocId,
        productId: row.product_id,
        qty,
        unitCode: normalizeUnitCode(row.stock_unit_code || row.unit || "un"),
        inputUnitCode: row.input_unit_code,
        uomProfileId: row.input_uom_profile_id,
        presentationQty:
          row.input_uom_profile_id && requestedQty > 0
            ? roundQuantity((qty / requestedQty) * Number(row.input_qty ?? 0))
            : 0,
        realPosting,
      });
    }

    if (!anyTransitQty) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: "Define al menos una cantidad preparada o enviada mayor a 0 antes de despachar.",
        })
      );
    }
  }

  if (inventoryPostingEnabled) {
    const packageDispatchErr = await applyProductionPackageDispatchForRequest({
      supabase,
      requestId,
      userId: user.id,
    });
    if (packageDispatchErr) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: packageDispatchErr,
        })
      );
    }

    const fromSiteIdForMovement = String(request?.from_site_id ?? "").trim();
    if (!fromSiteIdForMovement) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: "No se encontro sede origen para la remisión.",
        })
      );
    }

    const deductionErr = await applySourceRemissionDeductions({
      supabase,
      requestId,
      siteId: fromSiteIdForMovement,
      userId: user.id,
      deductions: sourceLocDeductions,
    });
    if (deductionErr) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          siteId: activeSiteId,
          error: toFriendlyTransitStockError(deductionErr),
        })
      );
    }
  }

  const nowIso = new Date().toISOString();
  const { error: reqErr } = await supabase
    .from("restock_requests")
    .update({
      status: "in_transit",
      in_transit_at: nowIso,
      in_transit_by: user.id,
      status_updated_at: nowIso,
    })
    .eq("id", requestId);
  if (reqErr) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        error: reqErr.message,
      })
    );
  }

  redirect(
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      siteId: activeSiteId,
      ok: "transit_started",
    })
  );
}

export async function splitItem(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  const detailHref = (extra: {
    error?: string | null;
    ok?: string | null;
    warning?: string | null;
    line?: string | null;
    event?: string | null;
  } = {}) =>
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      siteId: activeSiteId,
      ...extra,
    });
  if (!user) {
    redirect(await buildShellLoginUrl(detailHref()));
  }

  const itemId = asText(formData.get("split_item_id"));
  if (!itemId) {
    redirect(detailHref({ error: "Falta la linea a partir." }));
  }

  const splitQuantity = parseNumber(
    asText(formData.get(`split_quantity_${itemId}`)) || asText(formData.get("split_quantity"))
  );
  if (splitQuantity <= 0) {
    redirect(detailHref({ error: "Define una cantidad valida para partir la linea." }));
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("id,from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const currentStatus = String(request?.status ?? "");

  if (!access.canPrepare || !["pending", "preparing"].includes(currentStatus)) {
    redirect(detailHref({ error: "Solo puedes partir líneas mientras la remisión esta pendiente o preparando." }));
  }

  await enforceOperationalGateOrRedirect({
    supabase,
    userId: user.id,
    siteId: request?.from_site_id,
    requestId,
    returnOrigin,
    fallbackMessage: "No puedes preparar esta remisión en este momento.",
  });

  const { error } = await supabase.rpc("split_restock_request_item", {
    p_item_id: itemId,
    p_split_quantity: splitQuantity,
  });

  if (error) {
    redirect(detailHref({ error: error.message }));
  }

  redirect(detailHref({ ok: "split_item" }));
}

export async function chooseSourceLoc(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const inventoryPostingEnabled = await isRemissionInventoryPostingEnabled(supabase);
  if (!inventoryPostingEnabled) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        siteId: activeSiteId,
        ok: "loc_selected",
      })
    );
  }

  const target = asText(formData.get("choose_loc_target"));
  const chooseLocMode = asText(formData.get("choose_loc_mode"));
  let itemId = "";
  let locationId = "";

  if (target.includes("|")) {
    const [parsedItemId, parsedLocationId] = target.split("|");
    itemId = parsedItemId.trim();
    locationId = parsedLocationId.trim();
  }

  if (!itemId) itemId = asText(formData.get("choose_loc_item_id"));
  if (!locationId) locationId = asText(formData.get("choose_loc_location_id"));
  if (!locationId && itemId) locationId = asText(formData.get(`manual_loc_id_${itemId}`));

  if (!itemId || !locationId) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Selecciona un área para continuar.",
      })
    );
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("id,from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const currentStatus = String(request?.status ?? "");
  if (!access.canPrepare || !["pending", "preparing"].includes(currentStatus)) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Solo puedes elegir área mientras la remisión está pendiente o preparando.",
      })
    );
  }

  await enforceOperationalGateOrRedirect({
    supabase,
    userId: user.id,
    siteId: request?.from_site_id,
    requestId,
    returnOrigin,
    fallbackMessage: "No puedes preparar esta remisión en este momento.",
  });

  const fromSiteId = String(request?.from_site_id ?? "").trim();
  if (!fromSiteId) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "No se encontro sede origen para la remisión.",
      })
    );
  }

  const { data: itemRow } = await supabase
    .from("restock_request_items")
    .select("id,product_id,quantity,prepared_quantity,shipped_quantity")
    .eq("id", itemId)
    .eq("request_id", requestId)
    .single();
  if (!itemRow) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "La linea seleccionada no pertenece a esta remisión.",
      })
    );
  }

  const { data: locRow } = await supabase
    .from("inventory_locations")
    .select("id")
    .eq("id", locationId)
    .eq("site_id", fromSiteId)
    .eq("is_active", true)
    .single();
  if (!locRow) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Esa área no pertenece a la sede origen.",
      })
    );
  }

  const updates: Record<string, string | number | null> = { source_location_id: locationId };
  if (chooseLocMode === "complete_line" || chooseLocMode === "prepare_auto") {
    // Mantener compatibilidad si todavía existe algún form antiguo enviando este modo.
    updates.source_location_id = locationId;
  }

  const { error } = await supabase
    .from("restock_request_items")
    .update(updates)
    .eq("id", itemId);

  if (error) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
  }

  redirect(
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      ok: "loc_selected",
      line: itemId,
      event: "loc",
    })
  );
}

export async function updateStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const action = asText(formData.get("action"));
  const allowedActions = new Set([
    "prepare",
    "transit",
    "receive",
    "receive_partial",
    "resolve_shortage",
    "close",
    "cancel",
    "delete",
  ]);
  if (!allowedActions.has(action)) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Acción invalida. Vuelve a intentar desde el botón correspondiente.",
      })
    );
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("id,from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const inventoryPostingEnabled = await isRemissionInventoryPostingEnabled(supabase);
  const currentStatus = String(request?.status ?? "");
  const { data: operationalSummary, error: operationalSummaryError } =
    await loadRemissionOperationalSummary({
      supabase,
      requestId,
    });

  if (operationalSummaryError) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: operationalSummaryError }));
  }

  const summary = operationalSummary as RemissionOperationalSummary;
  const hasPreparationPicks = inventoryPostingEnabled && action === "transit"
    ? await requestHasPreparationPicks(supabase, requestId)
    : false;
  const preparationPicksUseOnlyRealLocations = hasPreparationPicks
    ? await requestPicksUseOnlyRealRemissionLocations({ supabase, requestId })
    : false;

  if (action === "prepare" && !access.canPrepare) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No puedes preparar." }));
  }

  if (action === "transit" && !access.canTransit) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No puedes enviar." }));
  }

  if (action === "receive" && !access.canReceive) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No puedes recibir." }));
  }

  if (action === "receive_partial" && !access.canReceive) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No puedes recibir." }));
  }

  if (action === "resolve_shortage" && !access.canReceive) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "No puedes cerrar diferencias como faltante.",
      })
    );
  }

  if (action === "close") {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "En v1 la remisión termina en recibida. El cierre administrativo ya no se usa.",
      })
    );
  }

  if (action === "cancel" && !access.canCancel) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No tienes permiso para cancelar." }));
  }
  if (action === "delete" && !access.canCancel) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No tienes permiso para eliminar." }));
  }
  if (action === "cancel" || action === "delete") {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Esta acción se ejecuta desde la bandeja de remisiones.",
      })
    );
  }

  if (action === "prepare" || action === "transit") {
    await enforceOperationalGateOrRedirect({
      supabase,
      userId: user.id,
      siteId: request?.from_site_id,
      requestId,
      returnOrigin,
      fallbackMessage: "No puedes preparar/despachar esta remisión en este momento.",
    });
  }

  if (action === "receive" || action === "receive_partial" || action === "resolve_shortage") {
    await enforceOperationalGateOrRedirect({
      supabase,
      userId: user.id,
      siteId: request?.to_site_id,
      requestId,
      returnOrigin,
      fallbackMessage: "No puedes recibir esta remisión en este momento.",
    });
  }

  if (action === "prepare" && currentStatus !== "pending") {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "Solo puedes preparar una remisión pendiente." }));
  }
  if (
    inventoryPostingEnabled &&
    action === "prepare" &&
    access.fromCanFulfillRemissions &&
    !summary.can_start_prepare
  ) {
    if (summary.pending_loc_selection_lines > 0) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: `Selecciona un área en las ${summary.pending_loc_selection_lines} línea(s) faltantes antes de empezar preparación.`,
        })
      );
    }
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "La remisión aún no está lista para iniciar preparación.",
      })
    );
  }
  if (action === "transit" && currentStatus !== "preparing") {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "Solo puedes enviar una remisión en estado preparando." }));
  }
  if (action === "transit") {
    const canTransitNow = hasPreparationPicks
      ? true
      : inventoryPostingEnabled
        ? Boolean(summary.can_transit) ||
          (await ensureOperationalTransitReady({ supabase, requestId }))
        : await ensureOperationalTransitReady({ supabase, requestId });

    if (!canTransitNow) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Completa la preparación de todas las líneas antes de despachar.",
        })
      );
    }
  }
  if (
    (action === "receive" || action === "receive_partial" || action === "resolve_shortage") &&
    !["in_transit", "partial"].includes(currentStatus)
  ) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "La remisión debe estar en transito/parcial para recibir." }));
  }
  if (action === "receive_partial" && currentStatus !== "in_transit") {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "Solo puedes registrar recepcion parcial desde en transito." }));
  }

  if (action === "resolve_shortage" && !["in_transit", "partial"].includes(currentStatus)) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Solo puedes cerrar diferencias mientras la remisión siga abierta en tránsito o parcial.",
      })
    );
  }
  if (action === "receive" && !summary.can_complete_receive) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Para confirmar recepción, todas las líneas enviadas deben quedar cubiertas entre recibido y faltante.",
      })
    );
  }
  if (action === "receive_partial" && !summary.can_receive_partial) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Primero registra una recepción parcial real antes de guardar ese estado.",
      })
    );
  }

  if (action === "resolve_shortage") {
    if (summary.pending_receipt_lines <= 0) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "No hay diferencias pendientes por cerrar como faltante.",
        })
      );
    }
  }

  if (action === "delete") {
    const deleteRequest = async () =>
      supabase.from("restock_requests").delete().eq("id", requestId).select("id");

    let { data: deletedRows, error } = await deleteRequest();

    if (error) {
      const hasMovementTrace =
        /inventory_movements/i.test(error.message) ||
        /related_restock_request_id/i.test(error.message);

      if (!hasMovementTrace) {
        const { error: deleteItemsError } = await supabase
          .from("restock_request_items")
          .delete()
          .eq("request_id", requestId);

        if (!deleteItemsError) {
          const retry = await deleteRequest();
          deletedRows = retry.data;
          error = retry.error;
        } else {
          error = deleteItemsError;
        }
      }

      if (error && hasMovementTrace) {
        const fallbackNow = new Date().toISOString();
        const { error: cancelFallbackError } = await supabase
          .from("restock_requests")
          .update({
            status: "cancelled",
            cancelled_at: fallbackNow,
            status_updated_at: fallbackNow,
          })
          .eq("id", requestId);
        if (!cancelFallbackError) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              ok: "No se pudo eliminar por trazabilidad. Se canceló la remisión.",
            })
          );
        }
      }

      if (error) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: toFriendlyRemissionActionError(error.message),
          })
        );
      }
    }

    if (!deletedRows || deletedRows.length === 0) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "No se pudo eliminar la remisión. Puede estar bloqueada por permisos o no existir.",
        })
      );
    }

    if (returnOrigin === "prepare") {
      redirect("/inventory/remissions/prepare?ok=deleted");
    }
    redirect("/inventory/remissions?ok=deleted");
  }
  const sourceLocDeductions: SourceLocDeduction[] = [];
  if (inventoryPostingEnabled && action === "transit" && !hasPreparationPicks) {
    const { data: itemsData } = await supabase
      .from("restock_request_items")
      .select("id,product_id,quantity,input_qty,input_unit_code,input_uom_profile_id,prepared_quantity,shipped_quantity,source_location_id,stock_unit_code,unit")
      .eq("request_id", requestId);
    const itemRows = (itemsData ?? []) as Array<{
      id: string;
      product_id: string;
      quantity: number | null;
      input_qty: number | null;
      input_unit_code: string | null;
      input_uom_profile_id: string | null;
      prepared_quantity: number | null;
      shipped_quantity: number | null;
      source_location_id: string | null;
      stock_unit_code: string | null;
      unit: string | null;
    }>;
    const statusTransitMeasurementPolicyByProductId = await loadProductMeasurementPolicies(
      supabase,
      itemRows.map((row) => row.product_id)
    );

    if (access.fromCanFulfillRemissions) {
      const locIds = Array.from(
        new Set(itemRows.map((row) => row.source_location_id).filter(Boolean) as string[])
      );
      const productIds = Array.from(new Set(itemRows.map((row) => row.product_id).filter(Boolean)));
      const { data: locStockRows } =
        locIds.length > 0 && productIds.length > 0
          ? await supabase
            .from("inventory_stock_by_location")
            .select("location_id,product_id,current_qty")
            .in("location_id", locIds)
            .in("product_id", productIds)
          : { data: [] as { location_id: string; product_id: string; current_qty: number | null }[] };
      const locStockMap = new Map(
        (locStockRows ?? []).map((row) => [
          `${row.location_id}|${row.product_id}`,
          Number(row.current_qty ?? 0),
        ])
      );
      const locPostingFlags = await loadLocationRemissionPostingFlags(supabase, locIds);

      let anyTransitQty = false;
      for (const row of itemRows) {
        const requestedQty = roundQuantity(Number(row.quantity ?? 0));
        const preparedQty = roundQuantity(Number(row.prepared_quantity ?? 0));
        const shippedQty = roundQuantity(Number(row.shipped_quantity ?? 0));
        const effectiveShippedQty = shippedQty > 0 ? shippedQty : preparedQty;
        const effectivePreparedQty = Math.max(preparedQty, effectiveShippedQty);
        const qty = effectiveShippedQty;

        if (preparedQty < 0 || shippedQty < 0) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: "Preparado y enviado no pueden ser negativos.",
            })
          );
        }
        if (
          shouldRejectOverRequestedQuantity({
            policyByProductId: statusTransitMeasurementPolicyByProductId,
            productId: row.product_id,
            requestedQty,
            actualQty: preparedQty,
          })
        ) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: `Cantidad preparada (${preparedQty}) mayor que solicitada (${requestedQty}) para una presentación fija.`,
            })
          );
        }
        if (
          shouldRejectOverRequestedQuantity({
            policyByProductId: statusTransitMeasurementPolicyByProductId,
            productId: row.product_id,
            requestedQty,
            actualQty: effectiveShippedQty,
          })
        ) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: `Cantidad enviada (${effectiveShippedQty}) mayor que solicitada (${requestedQty}) para una presentación fija.`,
            })
          );
        }
        if (shippedQty > 0 && preparedQty > 0 && shippedQty > preparedQty) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: `Cantidad enviada (${shippedQty}) no puede superar la preparada (${preparedQty}).`,
            })
          );
        }
        if (qty <= 0) continue;
        anyTransitQty = true;
        const sourceLocId = row.source_location_id ?? "";
        if (!sourceLocId) {
          redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "Falta área de origen en uno o más items para enviar." }));
        }
        const realPosting = locationPostsRealRemissionInventory(locPostingFlags.get(sourceLocId));
        const availableAtLoc = locStockMap.get(`${sourceLocId}|${row.product_id}`) ?? 0;
        if (realPosting && qty > availableAtLoc) {
          redirect(buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Cantidad enviada (${qty}) supera el disponible en el área de origen (${availableAtLoc}).`,
          }));
        }
        if (effectivePreparedQty !== preparedQty || effectiveShippedQty !== shippedQty) {
          const { error: syncErr } = await supabase
            .from("restock_request_items")
            .update({
              prepared_quantity: effectivePreparedQty,
              shipped_quantity: effectiveShippedQty,
            })
            .eq("id", row.id);
          if (syncErr) {
            redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: syncErr.message }));
          }
        }
        sourceLocDeductions.push({
          locationId: sourceLocId,
          productId: row.product_id,
          qty,
          unitCode: normalizeUnitCode(row.stock_unit_code || row.unit || "un"),
          inputUnitCode: row.input_unit_code,
          uomProfileId: row.input_uom_profile_id,
          presentationQty:
            row.input_uom_profile_id && requestedQty > 0
              ? roundQuantity((qty / requestedQty) * Number(row.input_qty ?? 0))
              : 0,
          realPosting,
        });
      }
      if (!anyTransitQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Define al menos una cantidad preparada o enviada mayor a 0 antes de despachar.",
          })
        );
      }
    }
  }

  if (action === "receive" || action === "receive_partial" || action === "resolve_shortage") {
    const { data: itemsData } = await supabase
      .from("restock_request_items")
      .select("id,product_id,quantity,prepared_quantity,shipped_quantity,received_quantity,shortage_quantity")
      .eq("request_id", requestId);
    const itemRows = (itemsData ?? []) as Array<{
      id: string;
      product_id: string;
      quantity: number | null;
      prepared_quantity: number | null;
      shipped_quantity: number | null;
      received_quantity: number | null;
      shortage_quantity: number | null;
    }>;

    let anyAccountedQty = false;
    let allFullyReceived = true;
    for (const row of itemRows) {
      const shippedQty = roundQuantity(Number(row.shipped_quantity ?? 0));
      const receivedQty = roundQuantity(Number(row.received_quantity ?? 0));
      const shortageQty = roundQuantity(Number(row.shortage_quantity ?? 0));
      const accountedQty = roundQuantity(receivedQty + shortageQty);

      if (receivedQty < 0 || shortageQty < 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Recibido y faltante no pueden ser negativos.",
          })
        );
      }
      if (accountedQty > shippedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Recibido + faltante (${accountedQty}) no puede superar enviado (${shippedQty}).`,
          })
        );
      }
      if (accountedQty > 0) anyAccountedQty = true;
      // "receive" completa solo cuando received cubre el total enviado.
      // El shortage se guarda como alerta/faltante, pero no debe conciliar automáticamente.
      if (shippedQty > 0 && receivedQty !== shippedQty) allFullyReceived = false;

    }

    if (!anyAccountedQty) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Registra al menos una cantidad recibida o faltante antes de continuar.",
        })
      );
    }

    if (action === "receive" && !allFullyReceived) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Para cerrar la recepcion completa, cada item enviado debe quedar totalmente recibido (received === shipped).",
        })
      );
    }

    if (action === "receive_partial" && allFullyReceived) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Todas las cantidades ya quedaron totalmente recibidas. Usa 'Recibir' para cerrar la recepcion.",
        })
      );
    }
  }

  const updates: Record<string, string | null> = {
    status_updated_at: new Date().toISOString(),
  };

  if (action === "resolve_shortage") {
    const { data: itemsData } = await supabase
      .from("restock_request_items")
      .select("id,shipped_quantity,received_quantity,shortage_quantity")
      .eq("request_id", requestId);

    const itemRows = (itemsData ?? []) as Array<{
      id: string;
      shipped_quantity: number | null;
      received_quantity: number | null;
      shortage_quantity: number | null;
    }>;

    const hasAnyReceivedQty = itemRows.some((row) => {
      const receivedQty = roundQuantity(Number(row.received_quantity ?? 0));
      return receivedQty > 0;
    });

    if (!hasAnyReceivedQty) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Primero registra al menos una recepción antes de cerrar la diferencia como faltante.",
        })
      );
    }

    let anyResolved = false;

    for (const row of itemRows) {
      const shippedQty = roundQuantity(Number(row.shipped_quantity ?? 0));
      const receivedQty = roundQuantity(Number(row.received_quantity ?? 0));
      const shortageQty = roundQuantity(Number(row.shortage_quantity ?? 0));
      const pendingQty = roundQuantity(Math.max(shippedQty - receivedQty - shortageQty, 0));

      if (pendingQty <= 0) continue;

      const nextShortage = roundQuantity(shortageQty + pendingQty);

      const { error: itemError } = await supabase
        .from("restock_request_items")
        .update({
          shortage_quantity: nextShortage,
        })
        .eq("id", row.id);

      if (itemError) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: itemError.message,
          })
        );
      }

      anyResolved = true;
    }

    if (!anyResolved) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "No había cantidades pendientes para cerrar como faltante.",
        })
      );
    }
  }

  if (action === "prepare") {
    updates.status = "preparing";
    updates.prepared_at = new Date().toISOString();
    updates.prepared_by = user.id;
  }

  if (action === "transit") {
    updates.status = "in_transit";
    updates.in_transit_at = new Date().toISOString();
    updates.in_transit_by = user.id;
  }

  if (action === "receive") {
    updates.status = "received";
    updates.received_at = new Date().toISOString();
    updates.received_by = user.id;
  }

  if (action === "resolve_shortage") {
    updates.status = "partial";
    updates.received_at = new Date().toISOString();
    updates.received_by = user.id;
  }

  if (action === "cancel") {
    updates.status = "cancelled";
    updates.cancelled_at = new Date().toISOString();
  }

  if (inventoryPostingEnabled && action === "transit") {
    if (hasPreparationPicks) {
      if (!preparationPicksUseOnlyRealLocations) {
        redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "El plan de picks contiene LOCs operativos. Corrige la preparación para usar el flujo híbrido sin picks antes de poner en tránsito." }));
      }

      const { error: moveErr } = await supabase.rpc("apply_restock_shipment_from_picks", {
        p_request_id: requestId,
      });
      if (moveErr) {
        redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: toFriendlyTransitStockError(moveErr.message) }));
      }

      const packageDispatchErr = await applyProductionPackageDispatchForRequest({
        supabase,
        requestId,
        userId: user.id,
      });
      if (packageDispatchErr) {
        redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: packageDispatchErr }));
      }
    } else {
      const packageDispatchErr = await applyProductionPackageDispatchForRequest({
        supabase,
        requestId,
        userId: user.id,
      });
      if (packageDispatchErr) {
        redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: packageDispatchErr }));
      }

      const fromSiteIdForMovement = String(request?.from_site_id ?? "").trim();
      if (!fromSiteIdForMovement) {
        redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: "No se encontro sede origen para la remisión." }));
      }

      const deductionErr = await applySourceRemissionDeductions({
        supabase,
        requestId,
        siteId: fromSiteIdForMovement,
        userId: user.id,
        deductions: sourceLocDeductions,
      });
      if (deductionErr) {
        redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: toFriendlyTransitStockError(deductionErr) }));
      }
    }
  }

  const { error: reqErr } = await supabase
    .from("restock_requests")
    .update(updates)
    .eq("id", requestId);
  if (reqErr) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: reqErr.message }));
  }

  if (action === "receive" || action === "receive_partial" || action === "resolve_shortage") {
    const syncError = await syncReceiveRequestStatus({
      supabase,
      requestId,
    });
    if (syncError) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: syncError }));
    }
    if (inventoryPostingEnabled) {
      const receiptMoveError = await ensureDestinationReceiptMovements({
        supabase,
        requestId,
        toSiteId: request?.to_site_id,
      });
      if (receiptMoveError) {
        redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: receiptMoveError }));
      }
    }

    if (action === "receive") {
      const pricingError = await ensureInternalTransferPricing({
        supabase,
        requestId,
      });
      if (pricingError) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `Remisión recibida, pero no se pudo valorizar internamente: ${pricingError}`,
          })
        );
      }
    }
  }

  const okCodeByAction: Record<string, string> = {
    prepare: "preparing_started",
    transit: "transit_started",
    receive: "received_complete",
    receive_partial: "received_partial",
    resolve_shortage: "shortage_resolved",
    cancel: "cancelled",
  };

  redirect(
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      ok: okCodeByAction[action] ?? "status_updated",
    })
  );
}

export async function applyPrepareShortcut(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const target = asText(formData.get("line_shortcut_target"));
  const [itemId, shortcut] = target.split("|").map((value) => value.trim());
  if (!itemId || !shortcut) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "No se pudo aplicar la acción rápida.",
      })
    );
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("id,from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const inventoryPostingEnabled = await isRemissionInventoryPostingEnabled(supabase);
  const currentStatus = String(request?.status ?? "");
  if (!access.canPrepare || !["pending", "preparing"].includes(currentStatus)) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Solo puedes preparar mientras la remisión esta pendiente o preparando.",
      })
    );
  }

  const { data: itemRow } = await supabase
    .from("restock_request_items")
    .select("id,product_id,quantity,source_location_id,prepared_quantity,shipped_quantity")
    .eq("id", itemId)
    .eq("request_id", requestId)
    .single();

  if (!itemRow) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "La línea seleccionada no pertenece a esta remisión.",
      })
    );
  }

  const prepareShortcutMeasurementPolicyByProductId = await loadProductMeasurementPolicies(
    supabase,
    [itemRow.product_id]
  );

  let nextPrepared = roundQuantity(Number(itemRow.prepared_quantity ?? 0));
  let nextShipped = roundQuantity(Number(itemRow.shipped_quantity ?? 0));
  const requestedQty = roundQuantity(Number(itemRow.quantity ?? 0));
  const sourceLocId = String(itemRow.source_location_id ?? "").trim();
  const manualPrepareRaw = asText(formData.get("prepare_qty"));

  let availableAtLoc = Number.MAX_SAFE_INTEGER;

  if (
    inventoryPostingEnabled &&
    shortcut !== "clear_prepare" &&
    shortcut !== "clear_ship"
  ) {
    if (!sourceLocId) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Selecciona primero el área de origen.",
        })
      );
    }

    const { data: locStockRow } = await supabase
      .from("inventory_stock_by_location")
      .select("current_qty")
      .eq("location_id", sourceLocId)
      .eq("product_id", itemRow.product_id)
      .maybeSingle();

    availableAtLoc = roundQuantity(Number(locStockRow?.current_qty ?? 0));
  }

  switch (shortcut) {
    case "complete_line": {
      if (requestedQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Esta línea no tiene cantidad solicitada válida.",
          })
        );
      }
      if (availableAtLoc < requestedQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Esa área no cubre completa la línea. Cambia el área o divide la remisión.",
          })
        );
      }
      nextPrepared = requestedQty;
      nextShipped = 0;
      break;
    }
    case "prepare_auto": {
      const suggestedQty = roundQuantity(Math.min(requestedQty, availableAtLoc));
      if (suggestedQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Esa área no tiene stock disponible para preparar esta línea.",
          })
        );
      }
      nextPrepared = suggestedQty;
      nextShipped = 0;
      break;
    }
    case "ship_prepared": {
      if (nextPrepared <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Primero marca cuánto preparas.",
          })
        );
      }
      nextShipped = nextPrepared;
      break;
    }
    case "set_prepare_partial": {
      const partialQty = roundQuantity(parseNumber(manualPrepareRaw || "0"));
      if (partialQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Define una cantidad parcial mayor a 0.",
          })
        );
      }
      if (
        shouldRejectOverRequestedQuantity({
          policyByProductId: prepareShortcutMeasurementPolicyByProductId,
          productId: itemRow.product_id,
          requestedQty,
          actualQty: partialQty,
        })
      ) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `La cantidad parcial (${partialQty}) no puede superar la solicitada (${requestedQty}) para una presentación fija.`,
          })
        );
      }
      if (availableAtLoc > 0 && partialQty > availableAtLoc) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `La cantidad parcial (${partialQty}) supera el disponible del área (${availableAtLoc}).`,
          })
        );
      }
      nextPrepared = partialQty;
      nextShipped = 0;
      break;
    }
    case "clear_prepare":
      nextPrepared = 0;
      nextShipped = 0;
      break;
    case "clear_ship":
      nextShipped = 0;
      break;
    default:
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Acción rápida no soportada.",
        })
      );
  }

  if (nextPrepared < 0 || nextShipped < 0) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Las cantidades no pueden ser negativas.",
      })
    );
  }
  if (
    shouldRejectOverRequestedQuantity({
      policyByProductId: prepareShortcutMeasurementPolicyByProductId,
      productId: itemRow.product_id,
      requestedQty,
      actualQty: nextPrepared,
    })
  ) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Cantidad preparada (${nextPrepared}) mayor que solicitada (${requestedQty}) para una presentación fija.`,
      })
    );
  }
  if (
    shouldRejectOverRequestedQuantity({
      policyByProductId: prepareShortcutMeasurementPolicyByProductId,
      productId: itemRow.product_id,
      requestedQty,
      actualQty: nextShipped,
    })
  ) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Cantidad enviada (${nextShipped}) mayor que solicitada (${requestedQty}) para una presentación fija.`,
      })
    );
  }
  if (nextShipped > nextPrepared) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Cantidad enviada (${nextShipped}) no puede superar la preparada (${nextPrepared}).`,
      })
    );
  }
  if (
    inventoryPostingEnabled &&
    sourceLocId &&
    Math.max(nextPrepared, nextShipped) > availableAtLoc
  ) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `La cantidad elegida supera el disponible en el área (${availableAtLoc}).`,
      })
    );
  }

  const { error } = await supabase
    .from("restock_request_items")
    .update({
      prepared_quantity: nextPrepared,
      shipped_quantity: nextShipped,
    })
    .eq("id", itemId);

  if (error) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
  }

  if (currentStatus === "pending" && nextPrepared > 0) {
    const { error: requestError } = await supabase
      .from("restock_requests")
      .update({
        status: "preparing",
        prepared_at: new Date().toISOString(),
        prepared_by: user.id,
        status_updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);
    if (requestError) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: requestError.message }));
    }
  }

  redirect(
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      ok: "line_shortcut",
      line: itemId,
      event: shortcut,
    })
  );
}

export async function applyReceiveShortcut(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const target = asText(formData.get("line_receive_target"));
  const [itemId, shortcut] = target.split("|").map((value) => value.trim());
  if (!itemId || !shortcut) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "No se pudo aplicar la acción rápida de recepción.",
      })
    );
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("id,from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const inventoryPostingEnabled = await isRemissionInventoryPostingEnabled(supabase);
  const currentStatus = String(request?.status ?? "");
  if (!access.canReceive || !["in_transit", "partial"].includes(currentStatus)) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Solo puedes registrar recepción mientras la remisión está en tránsito o parcial.",
      })
    );
  }

  await enforceOperationalGateOrRedirect({
    supabase,
    userId: user.id,
    siteId: request?.to_site_id,
    requestId,
    returnOrigin,
    fallbackMessage: "No puedes recibir esta remisión en este momento.",
  });

  const { data: itemRow } = await supabase
    .from("restock_request_items")
    .select("id,product_id,quantity,prepared_quantity,shipped_quantity,received_quantity,shortage_quantity")
    .eq("id", itemId)
    .eq("request_id", requestId)
    .single();

  if (!itemRow) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "La línea seleccionada no pertenece a esta remisión.",
      })
    );
  }

  const receiveShortcutMeasurementPolicyByProductId = await loadProductMeasurementPolicies(
    supabase,
    [String(itemRow.product_id ?? "").trim()]
  );
  const receiveShortcutPolicy = getMeasurementPolicy(
    receiveShortcutMeasurementPolicyByProductId,
    itemRow.product_id
  );
  const shortcutRequiresActualReceiptQty =
    requiresExplicitActualReceiptQty(receiveShortcutPolicy);
  const shortcutRequiresAuxCount =
    requiresAuxCountAlongsideWeight(receiveShortcutPolicy);

  const shippedQty = roundQuantity(Number(itemRow.shipped_quantity ?? 0));
  let nextReceived = roundQuantity(Number(itemRow.received_quantity ?? 0));
  let nextShortage = roundQuantity(Number(itemRow.shortage_quantity ?? 0));
  let nextReceivedAuxCount: number | null = null;
  let nextAuxCountUnitCode: string | null = null;
  const manualReceiveRaw = asText(formData.get("receive_qty"));
  const manualShortageRaw = asText(formData.get("shortage_qty"));
  const manualReceiveAuxRaw =
    asText(formData.get("receive_aux_count")) ||
    asText(formData.get("line_receive_aux_count"));
  const manualReceiveAuxUnitRaw =
    asText(formData.get("receive_aux_count_unit_code")) ||
    asText(formData.get("line_receive_aux_count_unit_code"));

  switch (shortcut) {
    case "receive_all":
      if (shortcutRequiresActualReceiptQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Este producto requiere cantidad real recibida. Usa recepción parcial e ingresa la cantidad medida.",
          })
        );
      }
      if (shippedQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Esta línea no tiene envío confirmado todavía.",
          })
        );
      }
      nextReceived = shippedQty;
      nextShortage = 0;
      break;
    case "mark_shortage":
      if (shippedQty <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Esta línea no tiene envío confirmado todavía.",
          })
        );
      }
      nextShortage = roundQuantity(Math.max(shippedQty - nextReceived, 0));
      break;
    case "clear_receive":
      nextReceived = 0;
      nextShortage = 0;
      nextReceivedAuxCount = null;
      nextAuxCountUnitCode = null;
      break;
    case "set_partial": {
      const receivedQtyManual = roundQuantity(parseNumber(manualReceiveRaw || "0"));
      const receivedAuxCountManual = manualReceiveAuxRaw
        ? roundQuantity(parseNumber(manualReceiveAuxRaw))
        : null;
      if (shortcutRequiresActualReceiptQty && receivedQtyManual <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Este producto requiere una cantidad real recibida mayor a cero.",
          })
        );
      }
      if (shortcutRequiresAuxCount) {
        if (receivedAuxCountManual === null || receivedAuxCountManual <= 0) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: "Este producto requiere conteo auxiliar recibido mayor a cero.",
            })
          );
        }
        nextReceivedAuxCount = receivedAuxCountManual;
        nextAuxCountUnitCode = normalizeAuxCountUnitCode(
          manualReceiveAuxUnitRaw || receiveShortcutPolicy.aux_count_unit_code
        );
      }
      nextReceived = receivedQtyManual;
      // En recepción parcial abierta NO cerramos automáticamente la diferencia como faltante.
      // El faltante definitivo se resolverá en una acción posterior separada.
      nextShortage = roundQuantity(Number(itemRow.shortage_quantity ?? 0));
      break;
    }
    default:
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Acción rápida de recepción no soportada.",
        })
      );
  }

  if (nextReceived < 0 || nextShortage < 0) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Recibido y faltante no pueden ser negativos.",
      })
    );
  }
  if (nextReceived + nextShortage > shippedQty) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Recibido + faltante (${nextReceived + nextShortage}) no puede superar enviado (${shippedQty}).`,
      })
    );
  }

  const receiveShortcutUpdates: Record<string, number | string | null> = {
    received_quantity: nextReceived,
    shortage_quantity: nextShortage,
  };
  if (shortcut === "clear_receive") {
    receiveShortcutUpdates.received_aux_count = null;
    receiveShortcutUpdates.aux_count_unit_code = null;
  } else if (shortcutRequiresAuxCount) {
    receiveShortcutUpdates.received_aux_count = nextReceivedAuxCount;
    receiveShortcutUpdates.aux_count_unit_code = nextAuxCountUnitCode;
  }

  const { error } = await supabase
    .from("restock_request_items")
    .update(receiveShortcutUpdates)
    .eq("id", itemId);

  if (error) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
  }

  const syncError = await syncReceiveRequestStatus({
    supabase,
    requestId,
  });
  if (syncError) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: syncError }));
  }
  if (inventoryPostingEnabled) {
    const receiptMoveError = await ensureDestinationReceiptMovements({
      supabase,
      requestId,
      toSiteId: request?.to_site_id,
    });
    if (receiptMoveError) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: receiptMoveError }));
    }
  }
  const signatureError = await ensureReceiveSignature({
    supabase,
    requestId,
    employeeId: user.id,
  });
  if (signatureError) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: signatureError }));
  }

  const pricingError = await ensureInternalTransferPricing({
    supabase,
    requestId,
  });
  if (pricingError) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Recepción registrada, pero no se pudo valorizar internamente: ${pricingError}`,
      })
    );
  }

  redirect(
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      ok: "line_shortcut",
      line: itemId,
      event: shortcut,
    })
  );
}

/**
 * Recepción en escritorio: confirma "recibir todo" en varias líneas en un solo envío.
 * Misma regla que `receive_all` en `applyReceiveShortcut` por ítem.
 */
export async function applyReceiveBatchConfirm(formData: FormData) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const requestId = asText(formData.get("request_id"));
  const returnOrigin = normalizeReturnOrigin(asText(formData.get("return_origin")));
  const activeSiteId = asText(formData.get("site_id"));
  if (!user) {
    redirect(await buildShellLoginUrl(buildRemissionDetailHref({ requestId, from: returnOrigin })));
  }

  const rawIds = formData
    .getAll("batch_receive_item_id")
    .map((value) => asText(value).trim())
    .filter(Boolean);
  const rawNotes = formData
    .getAll("batch_receive_item_note")
    .map((value) => asText(value).trim());
  const rawReceiveQty = formData
    .getAll("batch_receive_item_receive_qty")
    .map((value) => asText(value).trim());
  const rawAuxCount = formData
    .getAll("batch_receive_item_aux_count")
    .map((value) => asText(value).trim());
  const rawAuxCountUnitCode = formData
    .getAll("batch_receive_item_aux_count_unit_code")
    .map((value) => asText(value).trim());

  const pairs: Array<{
    itemId: string;
    note: string;
    receiveQtyRaw: string;
    auxCountRaw: string;
    auxCountUnitCodeRaw: string;
  }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < rawIds.length; i += 1) {
    const itemId = rawIds[i];
    if (!itemId || seen.has(itemId)) continue;
    pairs.push({
      itemId,
      note: rawNotes[i] ?? "",
      receiveQtyRaw: rawReceiveQty[i] ?? "",
      auxCountRaw: rawAuxCount[i] ?? "",
      auxCountUnitCodeRaw: rawAuxCountUnitCode[i] ?? "",
    });
    seen.add(itemId);
  }

  if (pairs.length === 0) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Selecciona al menos una línea para registrar la recepción.",
      })
    );
  }

  const { data: request } = await supabase
    .from("restock_requests")
    .select("id,from_site_id,to_site_id,status")
    .eq("id", requestId)
    .single();

  const access = await loadAccessContext(supabase, user.id, request, activeSiteId);
  const inventoryPostingEnabled = await isRemissionInventoryPostingEnabled(supabase);
  const currentStatus = String(request?.status ?? "");
  if (!access.canReceive || !["in_transit", "partial"].includes(currentStatus)) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Solo puedes registrar recepción mientras la remisión está en tránsito o parcial.",
      })
    );
  }

  await enforceOperationalGateOrRedirect({
    supabase,
    userId: user.id,
    siteId: request?.to_site_id,
    requestId,
    returnOrigin,
    fallbackMessage: "No puedes recibir esta remisión en este momento.",
  });

  const { data: selectedItemRowsData, error: selectedItemRowsError } = await supabase
    .from("restock_request_items")
    .select("id,product_id,production_area_kind")
    .eq("request_id", requestId)
    .in("id", pairs.map((pair) => pair.itemId));

  if (selectedItemRowsError) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: selectedItemRowsError.message,
      })
    );
  }

  const selectedItemRows = (selectedItemRowsData ?? []) as Array<{
    id: string;
    product_id: string | null;
    production_area_kind: string | null;
  }>;
  const receiveAreaScope = request?.to_site_id
    ? await resolveUserOperationalRemissionAreaScope({
        supabase,
        userId: user.id,
        siteId: request.to_site_id,
      })
    : null;
  if (
    receiveAreaScope &&
    !operationalRemissionAreaScopeAllowsKinds(
      receiveAreaScope,
      selectedItemRows.map((row) => row.production_area_kind)
    )
  ) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: "Tu área operativa activa no puede recibir una o más líneas seleccionadas.",
      })
    );
  }

  const selectedProductIdByItemId = new Map(
    selectedItemRows.map((row) => [
      row.id,
      String(row.product_id ?? "").trim(),
    ])
  );
  const batchReceiveMeasurementPolicyByProductId = await loadProductMeasurementPolicies(
    supabase,
    Array.from(selectedProductIdByItemId.values())
  );

  let appliedCount = 0;
  let notesCount = 0;

  for (let i = 0; i < pairs.length; i += 1) {
    const { itemId, note, receiveQtyRaw, auxCountRaw, auxCountUnitCodeRaw } = pairs[i];
    const receiveQtyManual = receiveQtyRaw === "" ? null : roundQuantity(parseNumber(receiveQtyRaw));
    const auxCountManual = auxCountRaw === "" ? null : roundQuantity(parseNumber(auxCountRaw));
    const { data: itemRow } = await supabase
      .from("restock_request_items")
      .select(
        "id,quantity,prepared_quantity,shipped_quantity,received_quantity,shortage_quantity,received_aux_count,aux_count_unit_code,notes"
      )
      .eq("id", itemId)
      .eq("request_id", requestId)
      .single();

    if (!itemRow) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Una de las líneas seleccionadas no pertenece a esta remisión.",
        })
      );
    }

    const noteTrim = String(note ?? "").trim();
    const productId = selectedProductIdByItemId.get(itemId) ?? "";
    const measurementPolicy = getMeasurementPolicy(
      batchReceiveMeasurementPolicyByProductId,
      productId
    );
    const mustSendActualReceiptQty = requiresExplicitActualReceiptQty(measurementPolicy);
    const mustSendAuxCount = requiresAuxCountAlongsideWeight(measurementPolicy);

    const shippedQty = roundQuantity(Number(itemRow.shipped_quantity ?? 0));
    const receivedNow = roundQuantity(Number(itemRow.received_quantity ?? 0));
    const shortageNow = roundQuantity(Number(itemRow.shortage_quantity ?? 0));
    const receivedAuxNow = roundQuantity(Number(itemRow.received_aux_count ?? 0));
    const accounted = roundQuantity(receivedNow + shortageNow);

    if (shippedQty <= 0) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error:
            "Una de las líneas no tiene envío confirmado. Actualiza la página o quítala de la selección.",
        })
      );
    }

    if (accounted >= shippedQty) {
      if (noteTrim) {
        const existing = String(itemRow.notes ?? "").trim();
        const composed = existing ? `${existing}\nRECEPCION: ${noteTrim}` : `RECEPCION: ${noteTrim}`;
        const { error: noteErr } = await supabase
          .from("restock_request_items")
          .update({ notes: composed })
          .eq("id", itemId)
          .eq("request_id", requestId);
        if (noteErr) {
          redirect(
            buildRemissionDetailHref({
              requestId,
              from: returnOrigin,
              error: noteErr.message,
            })
          );
        }
        notesCount += 1;
      }
      continue;
    }

    const pendingQty = roundQuantity(Math.max(shippedQty - receivedNow - shortageNow, 0));

    let finalReceived = receivedNow;
    let finalShortage = shortageNow;
    let finalReceivedAuxCount = receivedAuxNow > 0 ? receivedAuxNow : null;
    let finalAuxCountUnitCode =
      String(itemRow.aux_count_unit_code ?? "").trim() || null;

    if (mustSendActualReceiptQty && (receiveQtyManual === null || receiveQtyManual <= 0)) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: "Una de las líneas seleccionadas requiere cantidad real recibida mayor a cero.",
        })
      );
    }

    if (mustSendAuxCount) {
      if (auxCountManual === null || auxCountManual <= 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Una de las líneas seleccionadas requiere conteo auxiliar recibido mayor a cero.",
          })
        );
      }

      finalReceivedAuxCount = roundQuantity(receivedAuxNow + auxCountManual);
      finalAuxCountUnitCode = normalizeAuxCountUnitCode(
        auxCountUnitCodeRaw || measurementPolicy.aux_count_unit_code
      );
    }

    if (receiveQtyManual !== null) {
      if (receiveQtyManual < 0) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: "Cantidad recibida no puede ser negativa.",
          })
        );
      }

      if (receiveQtyManual > pendingQty) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: `La cantidad recibida ahora (${receiveQtyManual}) supera el pendiente por resolver (${pendingQty}).`,
          })
        );
      }

      finalReceived = roundQuantity(receivedNow + receiveQtyManual);
      finalShortage = shortageNow;
    } else {
      finalReceived = roundQuantity(receivedNow + pendingQty);
      finalShortage = shortageNow;
    }

    if (finalReceived + finalShortage > shippedQty) {
      redirect(
        buildRemissionDetailHref({
          requestId,
          from: returnOrigin,
          error: `Recibido + faltante no puede superar enviado (${shippedQty}).`,
        })
      );
    }

    const batchReceiveUpdates: Record<string, number | string | null> = {
      received_quantity: finalReceived,
      shortage_quantity: finalShortage,
    };
    if (mustSendAuxCount) {
      batchReceiveUpdates.received_aux_count = finalReceivedAuxCount;
      batchReceiveUpdates.aux_count_unit_code = finalAuxCountUnitCode;
    }

    const { error } = await supabase
      .from("restock_request_items")
      .update(batchReceiveUpdates)
      .eq("id", itemId);

    if (error) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: error.message }));
    }
    appliedCount += 1;

    if (noteTrim) {
      const existing = String(itemRow.notes ?? "").trim();
      const composed = existing ? `${existing}\nRECEPCION: ${noteTrim}` : `RECEPCION: ${noteTrim}`;
      const { error: noteErr } = await supabase
        .from("restock_request_items")
        .update({ notes: composed })
        .eq("id", itemId)
        .eq("request_id", requestId);
      if (noteErr) {
        redirect(
          buildRemissionDetailHref({
            requestId,
            from: returnOrigin,
            error: noteErr.message,
          })
        );
      }
      notesCount += 1;
    }
  }

  const syncError = await syncReceiveRequestStatus({
    supabase,
    requestId,
  });
  if (syncError) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: syncError }));
  }
  if (inventoryPostingEnabled) {
    const receiptMoveError = await ensureDestinationReceiptMovements({
      supabase,
      requestId,
      toSiteId: request?.to_site_id,
    });
    if (receiptMoveError) {
      redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: receiptMoveError }));
    }
  }
  const signatureError = await ensureReceiveSignature({
    supabase,
    requestId,
    employeeId: user.id,
  });
  if (signatureError) {
    redirect(buildRemissionDetailHref({ requestId, from: returnOrigin, error: signatureError }));
  }

  const pricingError = await ensureInternalTransferPricing({
    supabase,
    requestId,
  });
  if (pricingError) {
    redirect(
      buildRemissionDetailHref({
        requestId,
        from: returnOrigin,
        error: `Recepción registrada, pero no se pudo valorizar internamente: ${pricingError}`,
      })
    );
  }

  redirect(
    buildRemissionDetailHref({
      requestId,
      from: returnOrigin,
      ok:
        appliedCount === 0
          ? notesCount > 0
            ? `Recepción: notas registradas en ${notesCount} línea(s).`
            : "Las líneas seleccionadas ya estaban conciliadas; no hubo cambios."
          : notesCount > 0
            ? `Recepción confirmada: ${appliedCount} línea(s). Notas en ${notesCount} línea(s).`
            : `Recepción confirmada: ${appliedCount} línea(s).`,
    })
  );
}
 