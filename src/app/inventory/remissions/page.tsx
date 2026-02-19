import Link from "next/link";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";
import { createClient } from "@/lib/supabase/server";
import { RemissionsCreateForm } from "@/components/vento/remissions-create-form";
import { PageHeader } from "@/components/vento/standard/page-header";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  convertByProductProfile,
  normalizeUnitCode,
  roundQuantity,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";

const PERMISSIONS = {
  remissionsRequest: "inventory.remissions.request",
  remissionsAllSites: "inventory.remissions.all_sites",
};

type SearchParams = {
  error?: string;
  ok?: string;
  site_id?: string;
  from_site_id?: string;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

type AreaRow = {
  id: string;
  name: string | null;
  kind: string | null;
  site_id: string | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
};

type ProductSiteRow = {
  product_id: string;
  is_active: boolean | null;
  default_area_kind: string | null;
  audience?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

/** Filas de product_inventory_profiles con el join a products(id,name,unit) */
type ProductProfileWithProduct = {
  product_id: string;
  products: ProductRow | null;
};

type RemissionRow = {
  id: string;
  created_at: string | null;
  status: string | null;
  from_site_id: string | null;
  to_site_id: string | null;
  notes: string | null;
  created_by?: string | null;
};

type ProductAudience = "SAUDO" | "VCF" | "BOTH" | "INTERNAL";

function normalizeAudience(value: string | null | undefined): ProductAudience | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "SAUDO") return "SAUDO";
  if (normalized === "VCF") return "VCF";
  if (normalized === "INTERNAL") return "INTERNAL";
  if (normalized === "BOTH") return "BOTH";
  return null;
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function inferAudienceFromSiteName(siteName: string | null | undefined): ProductAudience {
  const normalized = normalizeText(siteName);
  if (normalized.includes("saudo")) return "SAUDO";
  if (normalized.includes("vento cafe")) return "VCF";
  return "BOTH";
}

function supportsAudience(
  configuredAudience: string | null | undefined,
  requestedAudience: ProductAudience
): boolean {
  const normalized = normalizeAudience(configuredAudience);
  if (!normalized) return false;
  if (normalized === "INTERNAL") {
    return requestedAudience === "INTERNAL";
  }
  if (requestedAudience === "INTERNAL") {
    return false;
  }
  return normalized === "BOTH" || requestedAudience === "BOTH" || normalized === requestedAudience;
}

async function loadProductSiteRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  siteId: string
): Promise<ProductSiteRow[]> {
  const withAudience = await supabase
    .from("product_site_settings")
    .select("product_id,is_active,default_area_kind,audience,updated_at,created_at")
    .eq("site_id", siteId)
    .eq("is_active", true);

  if (!withAudience.error) {
    const rows = (withAudience.data ?? []) as ProductSiteRow[];
    const ordered = [...rows].sort((a, b) => {
      const aTs = new Date(String(a.updated_at ?? a.created_at ?? "")).getTime();
      const bTs = new Date(String(b.updated_at ?? b.created_at ?? "")).getTime();
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
    .select("product_id,is_active,default_area_kind,updated_at,created_at")
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
    });
  }
  return Array.from(byProduct.values());
}

function formatStatus(status?: string | null) {
  const value = String(status ?? "").trim();
  switch (value) {
    case "pending":
      return { label: "Pendiente", className: "ui-chip ui-chip--warn" };
    case "preparing":
      return { label: "Preparando", className: "ui-chip ui-chip--brand" };
    case "in_transit":
      return { label: "En tránsito", className: "ui-chip ui-chip--warn" };
    case "partial":
      return { label: "Parcial", className: "ui-chip ui-chip--warn" };
    case "received":
      return { label: "Recibida", className: "ui-chip ui-chip--success" };
    case "closed":
      return { label: "Cerrada", className: "ui-chip ui-chip--success" };
    case "cancelled":
      return { label: "Cancelada", className: "ui-chip" };
    default:
      return { label: value || "Sin estado", className: "ui-chip" };
  }
}

function formatDateTime(value: string | null | undefined): string {
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

function isRequesterOnlyRole(role: string): boolean {
  return ["cocinero", "barista", "cajero"].includes(role);
}

function isWarehouseRole(role: string): boolean {
  return role === "bodeguero";
}

async function createRemission(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/remissions"));
  }
  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const actualRole = String(employee?.role ?? "");

  const fromSiteId = asText(formData.get("from_site_id"));
  const toSiteId = asText(formData.get("to_site_id"));
  const expectedDate = asText(formData.get("expected_date"));
  const notes = asText(formData.get("notes"));

  const productIds = formData.getAll("item_product_id").map((v) => String(v).trim());
  const quantities = formData.getAll("item_quantity").map((v) => String(v).trim());
  const inputUnits = formData
    .getAll("item_input_unit_code")
    .map((v) => normalizeUnitCode(String(v).trim()));
  const inputUomProfileIds = formData
    .getAll("item_input_uom_profile_id")
    .map((v) => String(v).trim());
  const inputQuantities = formData
    .getAll("item_quantity_in_input")
    .map((v) => String(v).trim());
  const areaKinds = formData.getAll("item_area_kind").map((v) => String(v).trim());

  const productIdsForLookup = Array.from(new Set(productIds.filter(Boolean)));
  const { data: productsData } = productIdsForLookup.length
    ? await supabase
        .from("products")
        .select("id,unit,stock_unit_code")
        .in("id", productIdsForLookup)
    : { data: [] as ProductRow[] };
  const productMap = new Map(
    ((productsData ?? []) as ProductRow[]).map((product) => [product.id, product])
  );
  const requestedUomProfileIds = Array.from(new Set(inputUomProfileIds.filter(Boolean)));
  const { data: uomProfilesData } = requestedUomProfileIds.length
    ? await supabase
        .from("product_uom_profiles")
        .select(
          "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
        )
        .in("id", requestedUomProfileIds)
    : { data: [] as ProductUomProfile[] };
  const uomProfileById = new Map(
    ((uomProfilesData ?? []) as ProductUomProfile[]).map((profile) => [profile.id, profile])
  );

  let items: Array<{
    product_id: string;
    quantity: number;
    input_qty: number;
    unit: string;
    input_unit_code: string;
    conversion_factor_to_stock: number;
    stock_unit_code: string;
    production_area_kind: string | null;
  }> = [];
  try {
    items = productIds
      .map((productId, idx) => {
        const product = productMap.get(productId);
        const stockUnitCode = normalizeUnitCode(product?.stock_unit_code || product?.unit || "un");
        const quantityInInput = roundQuantity(
          parseNumber(inputQuantities[idx] ?? quantities[idx] ?? "0")
        );
        const inputUomProfileId = inputUomProfileIds[idx] || "";
        const selectedProfile = inputUomProfileId
          ? uomProfileById.get(inputUomProfileId) ?? null
          : null;
        const conversion = convertByProductProfile({
          quantityInInput,
          inputUnitCode: normalizeUnitCode(inputUnits[idx] || stockUnitCode),
          stockUnitCode,
          profile: selectedProfile,
        });
        return {
          product_id: productId,
          quantity: conversion.quantityInStock,
          input_qty: quantityInInput,
          unit: stockUnitCode,
          input_unit_code: normalizeUnitCode(inputUnits[idx] || stockUnitCode),
          conversion_factor_to_stock: conversion.factorToStock,
          stock_unit_code: stockUnitCode,
          production_area_kind: areaKinds[idx] || null,
        };
      })
      .filter((item) => item.product_id && item.quantity > 0);
  } catch (error) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          error instanceof Error ? error.message : "Error en conversion de unidades."
        )
    );
  }

  if (!toSiteId || !fromSiteId) {
    redirect("/inventory/remissions?error=" + encodeURIComponent("Debes definir origen y destino."));
  }

  const canRequest = await checkPermissionWithRoleOverride({
    supabase,
    appId: APP_ID,
    code: PERMISSIONS.remissionsRequest,
    context: { siteId: toSiteId },
    actualRole,
  });
  if (actualRole === "bodeguero") {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("Bodega no puede crear solicitudes. Usa la vista de preparar remisiones.")
    );
  }
  if (!canRequest) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("No tienes permiso para solicitar remisiones.")
    );
  }

  const { data: toSite } = await supabase
    .from("sites")
    .select("site_type,name")
    .eq("id", toSiteId)
    .single();

  if (String(toSite?.site_type ?? "") !== "satellite") {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("Solo sedes satélite pueden solicitar remisiones.")
    );
  }

  if (items.length === 0) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("Agrega al menos un producto con cantidad mayor a 0.")
    );
  }

  const requestedAudience = inferAudienceFromSiteName(toSite?.name ?? "");
  const configuredRows = await loadProductSiteRows(supabase, toSiteId);
  if (configuredRows.length === 0) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          "Esta sede no tiene productos habilitados. Configura disponibilidad por sede en catalogo."
        )
    );
  }

  const allowedProductIds = new Set(
    configuredRows
      .filter((row) => supportsAudience(row.audience, requestedAudience))
      .map((row) => row.product_id)
  );
  if (allowedProductIds.size === 0) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          "Esta sede no tiene productos habilitados para su uso operativo. Ajusta Uso en sede en catalogo."
        )
    );
  }
  const invalidItems = items.filter((item) => !allowedProductIds.has(item.product_id));
  if (invalidItems.length > 0) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(
          "Algunos productos no estan habilitados para esta sede o flujo operativo. Revisa disponibilidad por sede."
        )
    );
  }

  const { data: request, error: requestErr } = await supabase
    .from("restock_requests")
    .insert({
      status: "pending",
      created_by: user.id,
      from_site_id: fromSiteId,
      to_site_id: toSiteId,
      requested_by_site_id: toSiteId,
      from_location: `site:${fromSiteId}`,
      to_location: `site:${toSiteId}`,
      expected_date: expectedDate || null,
      notes: notes || null,
      status_updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (requestErr || !request) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(requestErr?.message ?? "No se pudo crear la remisión.")
    );
  }

  const payload = items.map((item) => ({
    request_id: request.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit: item.unit,
    input_qty: item.input_qty,
    input_unit_code: item.input_unit_code,
    conversion_factor_to_stock: item.conversion_factor_to_stock,
    stock_unit_code: item.stock_unit_code,
    production_area_kind: item.production_area_kind,
  }));

  const { error: itemsErr } = await supabase.from("restock_request_items").insert(payload);
  if (itemsErr) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent(itemsErr.message ?? "No se pudieron crear los items.")
    );
  }

  let hasLowStock = false;
  const { data: stockRows } = await supabase
    .from("inventory_stock_by_site")
    .select("product_id,current_qty")
    .eq("site_id", fromSiteId)
    .in("product_id", items.map((i) => i.product_id));
  const stockMap = new Map(
    (stockRows ?? []).map((r: { product_id: string; current_qty: number | null }) => [
      r.product_id,
      Number(r.current_qty ?? 0),
    ])
  );
  for (const item of items) {
    const available = stockMap.get(item.product_id) ?? 0;
    if (available < item.quantity) {
      hasLowStock = true;
      break;
    }
  }

  const params = new URLSearchParams({ ok: "created" });
  if (hasLowStock) params.set("warning", "low_stock");
  redirect(`/inventory/remissions/${request.id}?${params.toString()}`);
}

export default async function RemissionsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const okMsg = sp.ok ? safeDecodeURIComponent(sp.ok) : "";

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/remissions",
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("site_id,role")
    .eq("id", user.id)
    .single();

  const actualRole = String(employee?.role ?? "");
  const canViewAll = await checkPermissionWithRoleOverride({
    supabase,
    appId: APP_ID,
    code: PERMISSIONS.remissionsAllSites,
    actualRole,
  });

  const { data: sitesRows } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(50);

  const employeeSiteRows = (sitesRows ?? []) as EmployeeSiteRow[];
  const defaultSiteId = employeeSiteRows[0]?.site_id ?? employee?.site_id ?? "";
  let activeSiteId =
    sp.site_id !== undefined ? String(sp.site_id).trim() : canViewAll ? "" : defaultSiteId;
  if (!activeSiteId && !canViewAll) {
    activeSiteId = defaultSiteId;
  }

  const siteIds = employeeSiteRows
    .map((row) => row.site_id)
    .filter((id): id is string => Boolean(id));

  const { data: sites } = siteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", siteIds)
        .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  const siteRows = (sites ?? []) as SiteRow[];
  const siteMap = new Map(siteRows.map((site) => [site.id, site]));
  const activeSite = activeSiteId ? siteMap.get(activeSiteId) : undefined;
  const isAllSites = !activeSiteId && canViewAll;
  const activeSiteName = isAllSites ? "Todas las sedes" : activeSite?.name ?? activeSiteId;
  const activeSiteType = String(activeSite?.site_type ?? "");
  const isProductionCenter = activeSiteType === "production_center";

  const canRequestPermission = activeSiteId
    ? await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: PERMISSIONS.remissionsRequest,
        context: { siteId: activeSiteId },
        actualRole,
      })
    : false;

  const viewMode = isAllSites ? "all" : isProductionCenter ? "bodega" : "satélite";
  const requesterOnlyRole = isRequesterOnlyRole(actualRole);
  const warehouseRole = isWarehouseRole(actualRole);
  const canCreate = viewMode === "satélite" && canRequestPermission && !warehouseRole;

  const { data: routes } = await supabase
    .from("site_supply_routes")
    .select("fulfillment_site_id")
    .eq("requesting_site_id", activeSiteId)
    .eq("is_active", true)
    .limit(1);

  const fulfillmentSiteIds = (routes ?? [])
    .map((route: { fulfillment_site_id: string | null }) => route.fulfillment_site_id)
    .filter((id: string | null): id is string => Boolean(id));

  const { data: fulfillmentSites } = fulfillmentSiteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", fulfillmentSiteIds)
        .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  let fulfillmentSiteRows = (fulfillmentSites ?? []) as SiteRow[];
  if (activeSiteId && fulfillmentSiteRows.length === 0) {
    const { data: fallbackSites } = await supabase
      .from("sites")
      .select("id,name,site_type")
      .eq("site_type", "production_center")
      .order("name", { ascending: true })
      .limit(50);
    fulfillmentSiteRows = (fallbackSites ?? []) as SiteRow[];
  }
  const requestedFromSiteId = sp.from_site_id ? String(sp.from_site_id).trim() : "";
  const selectedFromSiteId =
    requestedFromSiteId && fulfillmentSiteRows.some((site) => site.id === requestedFromSiteId)
      ? requestedFromSiteId
      : fulfillmentSiteRows[0]?.id ?? "";
  let remissionsQuery = supabase
    .from("restock_requests")
    .select("id, created_at, status, from_site_id, to_site_id, notes, created_by")
    .order("created_at", { ascending: false })
    .limit(50);

  if (activeSiteId) {
    remissionsQuery =
      viewMode === "bodega"
        ? remissionsQuery.eq("from_site_id", activeSiteId)
        : remissionsQuery.eq("to_site_id", activeSiteId);
  }
  if (viewMode === "satélite" && requesterOnlyRole) {
    remissionsQuery = remissionsQuery.eq("created_by", user.id);
  }

  const { data: remissions } = await remissionsQuery;
  const remissionRows = (remissions ?? []) as RemissionRow[];

  const areaFilterSiteId = canCreate ? activeSiteId : selectedFromSiteId;
  const { data: areas } = areaFilterSiteId
    ? await supabase
        .from("areas")
        .select("id,name,kind,site_id")
        .eq("site_id", areaFilterSiteId)
        .order("name", { ascending: true })
    : { data: [] as AreaRow[] };

  const areaRows = (areas ?? []) as AreaRow[];
  const areaOptions = Array.from(
    areaRows.reduce((map, row) => {
      const key = String(row.kind ?? "").trim();
      if (!key) return map;
      if (!map.has(key)) {
        map.set(key, {
          value: key,
          label: row.name ?? key,
        });
      }
      return map;
    }, new Map<string, { value: string; label: string }>())
  ).map(([, value]) => value);

  // Insumos por satélite: filtrar por sede DESTINO (Saudo), no por sede origen (Centro).
  // Cuando el satélite solicita, solo debe ver productos configurados para su sede.
  const productFilterSiteId = canCreate ? activeSiteId : selectedFromSiteId;
  const requestedAudience = inferAudienceFromSiteName(activeSite?.name ?? "");
  const productSiteRows = productFilterSiteId
    ? await loadProductSiteRows(supabase, productFilterSiteId)
    : [];
  const hasActiveSiteProductConfig = productSiteRows.length > 0;
  const productSiteIds = productSiteRows
    .filter((row) => supportsAudience(row.audience, requestedAudience))
    .map((row) => row.product_id);
  const hasAudienceProducts = productSiteIds.length > 0;

  let productRows: ProductRow[] = [];
  if (hasAudienceProducts) {
    const productsQuery = await supabase
      .from("product_inventory_profiles")
      .select("product_id, products(id,name,unit,stock_unit_code)")
      .eq("track_inventory", true)
      .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
      .in("product_id", productSiteIds)
      .order("name", { foreignTable: "products", ascending: true })
      .limit(400);

    productRows = ((productsQuery.data ?? []) as unknown as ProductProfileWithProduct[])
      .map((row) => row.products)
      .filter((r): r is ProductRow => Boolean(r));

    if (productRows.length === 0) {
      const { data: fallbackProducts } = await supabase
        .from("products")
        .select("id,name,unit,stock_unit_code")
        .eq("is_active", true)
        .in("id", productSiteIds)
        .order("name", { ascending: true })
        .limit(400);
      productRows = (fallbackProducts ?? []) as unknown as ProductRow[];
    }
  }
  const productIds = productRows.map((row) => row.id);
  const { data: uomProfilesData } = productIds.length
    ? await supabase
        .from("product_uom_profiles")
        .select(
          "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
        )
        .in("product_id", productIds)
        .eq("is_default", true)
        .eq("is_active", true)
    : { data: [] as ProductUomProfile[] };
  const defaultUomProfiles = (uomProfilesData ?? []) as ProductUomProfile[];
  const canCreateWithConfiguredCatalog =
    canCreate && hasActiveSiteProductConfig && hasAudienceProducts;

  return (
    <div className="w-full">
      <PageHeader
        title="Remisiones"
        subtitle="Flujo interno entre sedes. Satelites solicitan, bodega prepara y se recibe en destino."
        actions={
          isProductionCenter && !requesterOnlyRole ? (
            <Link href="/inventory/remissions/prepare" className="ui-btn ui-btn--brand">
              Preparar remisiones
            </Link>
          ) : null
        }
      />

      {errorMsg ? (
        <div className="mt-6 ui-alert ui-alert--error">
          Error: {errorMsg}
        </div>
      ) : null}

      {okMsg ? (
        <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div>
      ) : null}

      <div className="mt-6 ui-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Sede activa</div>
            <div className="mt-1 ui-caption">
              Vista:{" "}
              {viewMode === "all"
                ? "Todas las sedes"
                : viewMode === "bodega"
                  ? "Bodega (Centro)"
                  : "Sede satélite"}
            </div>
          </div>
          <form method="get" className="flex items-center gap-3">
            <select
              name="site_id"
              defaultValue={activeSiteId}
              className="ui-input"
            >
              {canViewAll ? <option value="">Todas las sedes</option> : null}
              {employeeSiteRows.map((row) => {
                const siteId = row.site_id ?? "";
                if (!siteId) return null;
                const site = siteMap.get(siteId);
                const label = site?.name ? `${site.name}` : siteId;
                const suffix = row.is_primary ? " (principal)" : "";
                return (
                  <option key={siteId} value={siteId}>
                    {label}
                    {suffix}
                  </option>
                );
              })}
            </select>
            <button className="ui-btn ui-btn--ghost">
              Cambiar
            </button>
          </form>
        </div>

        {!activeSiteId ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            {canViewAll
              ? "Vista global activa. Selecciona una sede para operar remisiones."
              : "No hay sede activa. Asigna una sede al empleado para operar remisiones."}
          </div>
        ) : null}

        {!canCreate && viewMode === "satélite" ? (
          <div className="mt-4 ui-alert ui-alert--neutral">
            Esta vista es para sedes satélite. Tu rol actual no puede crear remisiones.
          </div>
        ) : null}

        {canCreate && activeSiteId && fulfillmentSiteIds.length === 0 ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            No hay rutas de abastecimiento para {activeSiteName}. Configúralas en{" "}
            <Link href="/inventory/settings/supply-routes" className="font-semibold underline">
              Configuración → Rutas de abastecimiento
            </Link>
            .
          </div>
        ) : null}

        {canCreate && !hasActiveSiteProductConfig ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            Esta sede no tiene productos habilitados. Configura disponibilidad por sede en{" "}
            <Link href="/inventory/catalog" className="font-semibold underline">
              Catalogo
            </Link>
            .
          </div>
        ) : null}

        {canCreate && hasActiveSiteProductConfig && !hasAudienceProducts ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            Esta sede no tiene productos habilitados para su uso operativo. Ajusta Uso en sede en{" "}
            <Link href="/inventory/catalog" className="font-semibold underline">
              Catalogo
            </Link>
            .
          </div>
        ) : null}

        {canCreate && hasActiveSiteProductConfig && hasAudienceProducts && productRows.length === 0 ? (
          <div className="mt-4 ui-alert ui-alert--warn">
            No hay insumos configurados para {activeSiteName}. Añade la sede en{" "}
            <Link href="/inventory/catalog" className="font-semibold underline">
              Catálogo
            </Link>
            → ficha del producto → Sedes.
          </div>
        ) : null}

        {canCreateWithConfiguredCatalog ? (
          <div className="mt-4">
            <RemissionsCreateForm
              action={createRemission}
              toSiteId={activeSiteId}
              toSiteName={activeSiteName}
              fromSiteOptions={fulfillmentSiteRows.map((site) => ({
                id: site.id,
                name: site.name ?? site.id,
              }))}
              defaultFromSiteId={selectedFromSiteId}
              products={productRows}
              defaultUomProfiles={defaultUomProfiles}
              areaOptions={areaOptions}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-6 ui-panel">
        <div className="ui-h3">
          {viewMode === "bodega"
            ? "Solicitudes para preparar"
            : requesterOnlyRole
              ? "Mis solicitudes"
              : "Solicitudes enviadas"}
        </div>
        <div className="mt-1 ui-body-muted">
          Mostrando hasta 50 solicitudes recientes.
        </div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell>Origen</TableHeaderCell>
                <TableHeaderCell>Destino</TableHeaderCell>
                <TableHeaderCell>Notas</TableHeaderCell>
                <TableHeaderCell>Acciones</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {remissionRows.map((row) => {
                const fromSiteId = row.from_site_id ?? "";
                const toSiteId = row.to_site_id ?? "";
                return (
                  <tr key={row.id} className="ui-body">
                    <TableCell>{formatDateTime(row.created_at)}</TableCell>
                    <TableCell>
                      <span className={formatStatus(row.status).className}>
                        {formatStatus(row.status).label}
                      </span>
                    </TableCell>
                    <TableCell>
                      {siteMap.get(fromSiteId)?.name ?? fromSiteId}
                    </TableCell>
                    <TableCell>
                      {siteMap.get(toSiteId)?.name ?? toSiteId}
                    </TableCell>
                    <TableCell>{row.notes ?? ""}</TableCell>
                    <TableCell>
                      <Link
                        href={`/inventory/remissions/${row.id}`}
                        className="ui-body font-semibold underline decoration-zinc-200 underline-offset-4"
                      >
                        Ver detalle
                      </Link>
                    </TableCell>
                  </tr>
                );
              })}

              {!remissions?.length ? (
                <tr>
                  <TableCell colSpan={6} className="ui-empty">
                    No hay remisiones todavía.
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}

