import Link from "next/link";
import { redirect } from "next/navigation";

import { RemissionsCreateForm } from "@/components/vento/remissions-create-form";
import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import {
  convertByProductProfile,
  normalizeUnitCode,
  roundQuantity,
  type ProductUomProfile,
} from "@/lib/inventory/uom";
import { createClient } from "@/lib/supabase/server";
import { safeDecodeURIComponent } from "@/lib/url";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";

const PERMISSIONS = {
  remissionsRequest: "inventory.remissions.request",
  remissionsAllSites: "inventory.remissions.all_sites",
  remissionsEditOwnPending: "inventory.remissions.edit_own_pending",
};

type SearchParams = {
  error?: string;
  ok?: string;
  site_id?: string;
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
  category_id?: string | null;
};

type ProductSiteRow = {
  product_id: string;
  is_active: boolean | null;
  default_area_kind: string | null;
  audience?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type ProductProfileWithProduct = {
  product_id: string;
  products: ProductRow | null;
};

type StockReferenceRow = {
  site_id: string;
  product_id: string;
  current_qty: number | null;
  updated_at: string | null;
};

type RestockRequestItemRow = {
  id: string;
  product_id: string;
  quantity: number | null;
  input_qty: number | null;
  input_unit_code: string | null;
  stock_unit_code: string | null;
  production_area_kind: string | null;
};

type ProductAudience = "SAUDO" | "VCF" | "BOTH" | "INTERNAL";

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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
  // Compatibilidad: filas antiguas sin audience deben seguir operando como BOTH.
  if (!normalized) return requestedAudience !== "INTERNAL";
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

async function updateOwnPendingRemission(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/remissions"));
  }

  const requestId = asText(formData.get("request_id"));
  const siteId = asText(formData.get("site_id"));

  if (!requestId) {
    redirect(
      "/inventory/remissions?error=" + encodeURIComponent("Remisión inválida para edición.")
    );
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const actualRole = String(employee?.role ?? "");

  const { data: request } = await supabase
    .from("restock_requests")
    .select("id,status,created_by,to_site_id,from_site_id")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) {
    redirect(
      "/inventory/remissions?error=" + encodeURIComponent("La remisión no existe.")
    );
  }

  const canEditOwnPending =
    String(request.created_by ?? "") === user.id &&
    String(request.status ?? "") === "pending" &&
    String(request.to_site_id ?? "") !== "" &&
    (await checkPermissionWithRoleOverride({
      supabase,
      appId: APP_ID,
      code: PERMISSIONS.remissionsEditOwnPending,
      context: { siteId: request.to_site_id },
      actualRole,
    }));

  if (!canEditOwnPending) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("No tienes permiso para editar esta remisión.")
    );
  }

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
      `/inventory/remissions/${requestId}/edit?error=` +
        encodeURIComponent(
          error instanceof Error ? error.message : "Error en conversión de unidades."
        ) +
        (siteId ? `&site_id=${encodeURIComponent(siteId)}` : "")
    );
  }

  if (!toSiteId || !fromSiteId) {
    redirect(
      `/inventory/remissions/${requestId}/edit?error=` +
        encodeURIComponent("Debes definir origen y destino.") +
        (siteId ? `&site_id=${encodeURIComponent(siteId)}` : "")
    );
  }

  if (toSiteId !== String(request.to_site_id ?? "")) {
    redirect(
      `/inventory/remissions/${requestId}/edit?error=` +
        encodeURIComponent("No puedes cambiar la sede destino de la remisión.") +
        (siteId ? `&site_id=${encodeURIComponent(siteId)}` : "")
    );
  }

  const { data: toSite } = await supabase
    .from("sites")
    .select("site_type,name")
    .eq("id", toSiteId)
    .single();

  if (String(toSite?.site_type ?? "") !== "satellite") {
    redirect(
      `/inventory/remissions/${requestId}/edit?error=` +
        encodeURIComponent("Solo sedes satélite pueden solicitar remisiones.") +
        (siteId ? `&site_id=${encodeURIComponent(siteId)}` : "")
    );
  }

  if (items.length === 0) {
    redirect(
      `/inventory/remissions/${requestId}/edit?error=` +
        encodeURIComponent("Agrega al menos un producto con cantidad mayor a 0.") +
        (siteId ? `&site_id=${encodeURIComponent(siteId)}` : "")
    );
  }

  const requestedAudience = inferAudienceFromSiteName(toSite?.name ?? "");
  const configuredRows = await loadProductSiteRows(supabase, toSiteId);

  if (configuredRows.length === 0) {
    redirect(
      `/inventory/remissions/${requestId}/edit?error=` +
        encodeURIComponent(
          "Esta sede no tiene productos habilitados. Configura disponibilidad por sede en catálogo."
        ) +
        (siteId ? `&site_id=${encodeURIComponent(siteId)}` : "")
    );
  }

  const allowedProductIds = new Set(
    configuredRows
      .filter((row) => supportsAudience(row.audience, requestedAudience))
      .map((row) => row.product_id)
  );

  if (allowedProductIds.size === 0) {
    redirect(
      `/inventory/remissions/${requestId}/edit?error=` +
        encodeURIComponent(
          "Esta sede no tiene productos habilitados para su uso operativo. Ajusta Uso en sede en catálogo."
        ) +
        (siteId ? `&site_id=${encodeURIComponent(siteId)}` : "")
    );
  }

  const invalidItems = items.filter((item) => !allowedProductIds.has(item.product_id));
  if (invalidItems.length > 0) {
    redirect(
      `/inventory/remissions/${requestId}/edit?error=` +
        encodeURIComponent(
          "Algunos productos no están habilitados para esta sede o flujo operativo."
        ) +
        (siteId ? `&site_id=${encodeURIComponent(siteId)}` : "")
    );
  }

  const { error: updateRequestError } = await supabase
    .from("restock_requests")
    .update({
      from_site_id: fromSiteId,
      from_location: `site:${fromSiteId}`,
      expected_date: expectedDate || null,
      notes: notes || null,
      status_updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateRequestError) {
    redirect(
      `/inventory/remissions/${requestId}/edit?error=` +
        encodeURIComponent(updateRequestError.message ?? "No se pudo actualizar la remisión.") +
        (siteId ? `&site_id=${encodeURIComponent(siteId)}` : "")
    );
  }

  const { error: deleteItemsError } = await supabase
    .from("restock_request_items")
    .delete()
    .eq("request_id", requestId);

  if (deleteItemsError) {
    redirect(
      `/inventory/remissions/${requestId}/edit?error=` +
        encodeURIComponent(deleteItemsError.message ?? "No se pudieron reemplazar los ítems.") +
        (siteId ? `&site_id=${encodeURIComponent(siteId)}` : "")
    );
  }

  const payload = items.map((item) => ({
    request_id: requestId,
    product_id: item.product_id,
    quantity: item.quantity,
    unit: item.unit,
    input_qty: item.input_qty,
    input_unit_code: item.input_unit_code,
    conversion_factor_to_stock: item.conversion_factor_to_stock,
    stock_unit_code: item.stock_unit_code,
    production_area_kind: item.production_area_kind,
  }));

  const { error: insertItemsError } = await supabase
    .from("restock_request_items")
    .insert(payload);

  if (insertItemsError) {
    redirect(
      `/inventory/remissions/${requestId}/edit?error=` +
        encodeURIComponent(insertItemsError.message ?? "No se pudieron guardar los ítems.") +
        (siteId ? `&site_id=${encodeURIComponent(siteId)}` : "")
    );
  }

  const params = new URLSearchParams({
    ok: "Remisión actualizada.",
  });
  if (siteId) params.set("site_id", siteId);

  redirect(`/inventory/remissions/${requestId}?${params.toString()}`);
}

export default async function EditOwnPendingRemissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const okMsg = sp.ok ? safeDecodeURIComponent(sp.ok) : "";
  const activeSiteId = String(sp.site_id ?? "").trim();

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: activeSiteId
      ? `/inventory/remissions/${id}/edit?site_id=${encodeURIComponent(activeSiteId)}`
      : `/inventory/remissions/${id}/edit`,
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("site_id,role")
    .eq("id", user.id)
    .single();

  const actualRole = String(employee?.role ?? "");

  const { data: request } = await supabase
    .from("restock_requests")
    .select("id,status,created_by,to_site_id,from_site_id,expected_date,notes")
    .eq("id", id)
    .maybeSingle();

  if (!request) {
    redirect(
      "/inventory/remissions?error=" + encodeURIComponent("La remisión no existe.")
    );
  }

  const canEditOwnPending =
    String(request.created_by ?? "") === user.id &&
    String(request.status ?? "") === "pending" &&
    String(request.to_site_id ?? "") !== "" &&
    (await checkPermissionWithRoleOverride({
      supabase,
      appId: APP_ID,
      code: PERMISSIONS.remissionsEditOwnPending,
      context: { siteId: request.to_site_id },
      actualRole,
    }));

  if (!canEditOwnPending) {
    redirect(
      "/inventory/remissions?error=" +
        encodeURIComponent("No tienes permiso para editar esta remisión.")
    );
  }

  const targetSiteId = String(request.to_site_id ?? "");
  const fromSiteId = String(request.from_site_id ?? "");
  const effectiveSiteId = activeSiteId || targetSiteId;

  const { data: employeeSites } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .limit(50);

  const employeeSiteIds = (employeeSites ?? [])
    .map((row: { site_id: string | null }) => String(row.site_id ?? "").trim())
    .filter(Boolean);

  const siteIds = Array.from(new Set([...employeeSiteIds, targetSiteId, fromSiteId].filter(Boolean)));
  const { data: sites } = siteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", siteIds)
        .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  const siteRows = (sites ?? []) as SiteRow[];
  const siteMap = new Map(siteRows.map((site) => [site.id, site]));
  const toSiteName = siteMap.get(targetSiteId)?.name ?? targetSiteId;

  const { data: routes } = await supabase
    .from("site_supply_routes")
    .select("fulfillment_site_id")
    .eq("requesting_site_id", targetSiteId)
    .eq("is_active", true)
    .limit(50);

  const fulfillmentSiteIds = (routes ?? [])
    .map((route: { fulfillment_site_id: string | null }) => route.fulfillment_site_id)
    .filter((value: string | null): value is string => Boolean(value));

  const { data: fulfillmentSites } = fulfillmentSiteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", fulfillmentSiteIds)
        .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  let fulfillmentSiteRows = (fulfillmentSites ?? []) as SiteRow[];
  if (targetSiteId && fulfillmentSiteRows.length === 0) {
    const { data: fallbackSites } = await supabase
      .from("sites")
      .select("id,name,site_type")
      .eq("site_type", "production_center")
      .order("name", { ascending: true })
      .limit(50);
    fulfillmentSiteRows = (fallbackSites ?? []) as SiteRow[];
  }

  const { data: areas } = targetSiteId
    ? await supabase
        .from("areas")
        .select("id,name,kind,site_id")
        .eq("site_id", targetSiteId)
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

  const productSiteRows = targetSiteId
    ? await loadProductSiteRows(supabase, targetSiteId)
    : [];
  const requestedAudience = inferAudienceFromSiteName(toSiteName);
  const productSiteIds = productSiteRows
    .filter((row) => supportsAudience(row.audience, requestedAudience))
    .map((row) => row.product_id);

  let productRows: ProductRow[] = [];
  if (productSiteIds.length > 0) {
    const productsQuery = await supabase
      .from("product_inventory_profiles")
      .select("product_id, products(id,name,unit,stock_unit_code,category_id)")
      .eq("track_inventory", true)
      .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
      .in("product_id", productSiteIds)
      .order("name", { foreignTable: "products", ascending: true })
      .limit(400);

    productRows = ((productsQuery.data ?? []) as unknown as ProductProfileWithProduct[])
      .map((row) => row.products)
      .filter((row): row is ProductRow => Boolean(row));

    if (productRows.length === 0) {
      const { data: fallbackProducts } = await supabase
        .from("products")
        .select("id,name,unit,stock_unit_code,category_id")
        .eq("is_active", true)
        .in("id", productSiteIds)
        .order("name", { ascending: true })
        .limit(400);
      productRows = (fallbackProducts ?? []) as ProductRow[];
    }
  }

  const productIds = productRows.map((row) => row.id);
  const categoryIds = Array.from(
    new Set(productRows.map((row) => String(row.category_id ?? "").trim()).filter(Boolean))
  );
  const { data: categoryData } = categoryIds.length
    ? await supabase
        .from("product_categories")
        .select("id,name,parent_id")
        .in("id", categoryIds)
    : { data: [] as Array<{ id: string; name: string | null; parent_id: string | null }> };

  const categoryNameById = new Map(
    ((categoryData ?? []) as Array<{ id: string; name: string | null }>).map((row) => [
      row.id,
      String(row.name ?? "").trim() || "Sin categoria",
    ])
  );

  const { data: uomProfilesData } = productIds.length
    ? await supabase
        .from("product_uom_profiles")
        .select(
          "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
        )
        .in("product_id", productIds)
        .eq("is_active", true)
    : { data: [] as ProductUomProfile[] };
  const defaultUomProfiles = (uomProfilesData ?? []) as ProductUomProfile[];

  const fulfillmentSiteIdsForStock = fulfillmentSiteRows
    .map((site) => site.id)
    .filter((value): value is string => Boolean(value));
  const { data: stockReferenceData } =
    fulfillmentSiteIdsForStock.length > 0 && productIds.length > 0
      ? await supabase
          .from("inventory_stock_by_site")
          .select("site_id,product_id,current_qty,updated_at")
          .in("site_id", fulfillmentSiteIdsForStock)
          .in("product_id", productIds)
      : { data: [] as StockReferenceRow[] };

  const originStockRows = ((stockReferenceData ?? []) as StockReferenceRow[]).map((row) => ({
    siteId: row.site_id,
    productId: row.product_id,
    currentQty: Number(row.current_qty ?? 0),
    updatedAt: row.updated_at,
  }));

  const { data: requestItems } = await supabase
    .from("restock_request_items")
    .select("id,product_id,quantity,input_qty,input_unit_code,stock_unit_code,production_area_kind")
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  const initialRows = ((requestItems ?? []) as RestockRequestItemRow[]).map((item, index) => {
    const fallbackStockUnitCode = normalizeUnitCode(String(item.stock_unit_code ?? "").trim());
    const initialInputUnitCode = normalizeUnitCode(
      String(item.input_unit_code ?? "").trim() || fallbackStockUnitCode
    );
    const initialQuantity = Number(item.input_qty ?? item.quantity ?? 0);

    return {
      id: index,
      productId: String(item.product_id ?? "").trim(),
      quantity: initialQuantity > 0 ? String(initialQuantity) : "",
      inputUnitCode: initialInputUnitCode,
      inputUomProfileId: "",
      areaKind: String(item.production_area_kind ?? "").trim(),
    };
  });

  return (
    <div className="ui-scene w-full space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="ui-h3">Editar remisión</div>
          <div className="mt-1 ui-caption">
            Solo puedes editar tu propia remisión mientras siga en estado pendiente.
          </div>
        </div>
        <Link
          href={
            effectiveSiteId
              ? `/inventory/remissions/${id}?site_id=${encodeURIComponent(effectiveSiteId)}`
              : `/inventory/remissions/${id}`
          }
          className="ui-btn ui-btn--ghost"
        >
          Volver al detalle
        </Link>
      </div>

      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      <div className="ui-panel ui-remission-section">
        <RemissionsCreateForm
          action={updateOwnPendingRemission}
          toSiteId={targetSiteId}
          toSiteName={toSiteName}
          fromSiteOptions={fulfillmentSiteRows.map((site) => ({
            id: site.id,
            name: site.name ?? site.id,
          }))}
          defaultFromSiteId={fromSiteId}
          products={productRows}
          categoryNameById={Object.fromEntries(categoryNameById)}
          defaultUomProfiles={defaultUomProfiles}
          areaOptions={areaOptions}
          originStockRows={originStockRows}
          initialExpectedDate={String(request.expected_date ?? "").trim()}
          initialNotes={String(request.notes ?? "").trim()}
          initialRows={initialRows}
          submitLabel="Guardar cambios"
          formMode="edit"
        />
      </div>
    </div>
  );
}
