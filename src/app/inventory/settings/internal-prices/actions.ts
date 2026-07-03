"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  asText,
  buildReturnUrl,
  computeInternalPrice,
  normalizeUnitCodeLocal,
  parseDateAsBogotaStartOfDay,
  parseNonNegativeNumber,
  parsePricingMethod,
  parseProductPriceOption,
  resolveBuyerSiteId,
} from "./helpers";

const APP_ID = "nexo";
const MANAGE_PERMISSION = "internal_prices.manage";
const PAGE_PATH = "/inventory/settings/internal-prices";
async function requireInternalPricesManager() {
  const supabase = await createClient();

  return requireAppAccess({
    appId: APP_ID,
    returnTo: PAGE_PATH,
    supabase,
    permissionCode: MANAGE_PERMISSION,
  });
}

export async function createInternalPriceList(formData: FormData) {
  "use server";

  const { supabase, user } = await requireInternalPricesManager();

  const name = asText(formData.get("name"));
  const sellerCostCenterId = asText(formData.get("seller_cost_center_id"));
  const buyerCostCenterId = asText(formData.get("buyer_cost_center_id"));
  const buyerSiteId = asText(formData.get("buyer_site_id"));
  const validFrom = parseDateAsBogotaStartOfDay(formData.get("valid_from"));
  const validTo = parseDateAsBogotaStartOfDay(formData.get("valid_to"));

  if (!name) {
    redirect(buildReturnUrl({ error: "Escribe un nombre para la lista." }));
  }

  if (!sellerCostCenterId) {
    redirect(buildReturnUrl({ error: "Selecciona el centro de costo vendedor." }));
  }

  if (!buyerCostCenterId && !buyerSiteId) {
    redirect(buildReturnUrl({ error: "Selecciona al menos un comprador: centro de costo o sede." }));
  }

  if (buyerCostCenterId && buyerCostCenterId === sellerCostCenterId) {
    redirect(buildReturnUrl({ error: "El comprador no puede ser el mismo centro de costo vendedor." }));
  }

  if (validFrom && validTo && new Date(validTo).getTime() <= new Date(validFrom).getTime()) {
    redirect(buildReturnUrl({ error: "La fecha final debe ser posterior a la fecha inicial." }));
  }

  const { data, error } = await supabase
    .from("internal_price_lists")
    .insert({
      name,
      seller_cost_center_id: sellerCostCenterId,
      buyer_cost_center_id: buyerCostCenterId || null,
      buyer_site_id: buyerSiteId || null,
      valid_from: validFrom ?? new Date().toISOString(),
      valid_to: validTo,
      is_active: true,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    redirect(buildReturnUrl({ error: error.message }));
  }

  revalidatePath(PAGE_PATH);
  redirect(buildReturnUrl({ ok: "list_created", listId: String(data.id) }));
}

export async function updateInternalPriceListStatus(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalPricesManager();

  const listId = asText(formData.get("list_id"));
  const nextIsActive = asText(formData.get("next_is_active")) === "true";

  if (!listId) {
    redirect(buildReturnUrl({ error: "Lista inválida." }));
  }

  const { error } = await supabase
    .from("internal_price_lists")
    .update({
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listId);

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId }));
  }

  revalidatePath(PAGE_PATH);
  redirect(
    buildReturnUrl({
      ok: nextIsActive ? "list_enabled" : "list_disabled",
      listId,
    })
  );
}

export async function addInternalPriceListItem(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalPricesManager();

  const priceListId = asText(formData.get("price_list_id"));
  const productOption = asText(formData.get("product_option"));
  const { productId, uomProfileId } = parseProductPriceOption(productOption);
  const pricingMethod = parsePricingMethod(formData.get("pricing_method"));
  const unitPrice = parseNonNegativeNumber(formData.get("unit_price"));
  const marginPct = parseNonNegativeNumber(formData.get("margin_pct"));
  let unitCode = "";

  if (!priceListId) {
    redirect(buildReturnUrl({ error: "Selecciona una lista.", listId: priceListId }));
  }

  if (!productId) {
    redirect(buildReturnUrl({ error: "Selecciona un producto y presentación.", listId: priceListId }));
  }

  if (uomProfileId) {
    const { data: profile, error: profileError } = await supabase
      .from("product_uom_profiles")
      .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_active")
      .eq("id", uomProfileId)
      .maybeSingle();

    if (profileError || !profile) {
      redirect(
        buildReturnUrl({
          error: profileError?.message ?? "La presentación seleccionada no existe.",
          listId: priceListId,
        })
      );
    }

    if (String(profile.product_id ?? "") !== productId || profile.is_active === false) {
      redirect(
        buildReturnUrl({
          error: "La presentación seleccionada no pertenece al producto o está inactiva.",
          listId: priceListId,
        })
      );
    }

    unitCode = normalizeUnitCodeLocal(profile.input_unit_code);
  } else {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id,unit,stock_unit_code")
      .eq("id", productId)
      .maybeSingle();

    if (productError || !product) {
      redirect(
        buildReturnUrl({
          error: productError?.message ?? "El producto seleccionado no existe.",
          listId: priceListId,
        })
      );
    }

    unitCode = normalizeUnitCodeLocal(product.stock_unit_code ?? product.unit);
  }

  if (!unitCode) {
    redirect(
      buildReturnUrl({
        error: "Selecciona una presentación válida para el precio interno.",
        listId: priceListId,
      })
    );
  }

  const priceComputation = await computeInternalPrice({
    supabase,
    priceListId,
    productId,
    uomProfileId: uomProfileId || null,
    pricingMethod,
    manualUnitPrice: unitPrice,
    marginPct,
  });

  const insertPayload: {
    price_list_id: string;
    product_id: string;
    unit_price: number;
    unit_code: string;
    pricing_method: "manual" | "cost_plus_margin";
    margin_pct: number | null;
    base_unit_cost: number | null;
    base_cost_source: string | null;
    suggested_unit_price: number | null;
    formula_snapshot: Record<string, unknown>;
    uom_profile_id: string | null;
    pricing_label?: string | null;
    pricing_input_unit_code?: string | null;
    pricing_qty_in_input_unit?: number | null;
    pricing_qty_in_stock_unit?: number | null;
    is_active: boolean;
  } = {
    price_list_id: priceListId,
    product_id: productId,
    unit_price: priceComputation.unitPrice,
    unit_code: unitCode,
    pricing_method: priceComputation.pricingMethod,
    margin_pct: priceComputation.marginPct,
    base_unit_cost: priceComputation.baseUnitCost,
    base_cost_source: priceComputation.baseCostSource,
    suggested_unit_price: priceComputation.suggestedUnitPrice,
    formula_snapshot: priceComputation.formulaSnapshot,
    uom_profile_id: uomProfileId || null,
    is_active: true,
  };

  if (uomProfileId) {
    const { data: profileSnapshot } = await supabase
      .from("product_uom_profiles")
      .select("label,input_unit_code,qty_in_input_unit,qty_in_stock_unit")
      .eq("id", uomProfileId)
      .maybeSingle();

    insertPayload.pricing_label = profileSnapshot?.label ?? null;
    insertPayload.pricing_input_unit_code = profileSnapshot?.input_unit_code ?? unitCode;
    insertPayload.pricing_qty_in_input_unit = profileSnapshot?.qty_in_input_unit ?? null;
    insertPayload.pricing_qty_in_stock_unit = profileSnapshot?.qty_in_stock_unit ?? null;
  }

  const { error } = await supabase.from("internal_price_list_items").insert(insertPayload);

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId: priceListId }));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  redirect(buildReturnUrl({ ok: "item_added", listId: priceListId }));
}

export async function updateInternalPriceListItem(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalPricesManager();

  const itemId = asText(formData.get("item_id"));
  const priceListId = asText(formData.get("price_list_id"));
  const unitCode = asText(formData.get("unit_code"));
  const pricingMethod = parsePricingMethod(formData.get("pricing_method"));
  const unitPrice = parseNonNegativeNumber(formData.get("unit_price"));
  const marginPct = parseNonNegativeNumber(formData.get("margin_pct"));

  if (!itemId || !priceListId) {
    redirect(buildReturnUrl({ error: "Ítem inválido.", listId: priceListId }));
  }

  const { data: itemRow, error: itemError } = await supabase
    .from("internal_price_list_items")
    .select("product_id,uom_profile_id")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError || !itemRow) {
    redirect(buildReturnUrl({ error: itemError?.message ?? "Ítem inválido.", listId: priceListId }));
  }

  const priceComputation = await computeInternalPrice({
    supabase,
    priceListId,
    productId: String(itemRow.product_id),
    uomProfileId: itemRow.uom_profile_id ? String(itemRow.uom_profile_id) : null,
    pricingMethod,
    manualUnitPrice: unitPrice,
    marginPct,
  });

  const payload: {
    unit_price: number;
    updated_at: string;
    pricing_method: "manual" | "cost_plus_margin";
    margin_pct: number | null;
    base_unit_cost: number | null;
    base_cost_source: string | null;
    suggested_unit_price: number | null;
    formula_snapshot: Record<string, unknown>;
    unit_code?: string;
  } = {
    unit_price: priceComputation.unitPrice,
    updated_at: new Date().toISOString(),
    pricing_method: priceComputation.pricingMethod,
    margin_pct: priceComputation.marginPct,
    base_unit_cost: priceComputation.baseUnitCost,
    base_cost_source: priceComputation.baseCostSource,
    suggested_unit_price: priceComputation.suggestedUnitPrice,
    formula_snapshot: priceComputation.formulaSnapshot,
  };

  if (unitCode) {
    payload.unit_code = unitCode;
  }

  const { error } = await supabase
    .from("internal_price_list_items")
    .update(payload)
    .eq("id", itemId);

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId: priceListId }));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  redirect(buildReturnUrl({ ok: "item_updated", listId: priceListId }));
}

export async function updateInternalPriceListItemStatus(formData: FormData) {
  "use server";

  const { supabase } = await requireInternalPricesManager();

  const itemId = asText(formData.get("item_id"));
  const priceListId = asText(formData.get("price_list_id"));
  const nextIsActive = asText(formData.get("next_is_active")) === "true";

  if (!itemId || !priceListId) {
    redirect(buildReturnUrl({ error: "Ítem inválido.", listId: priceListId }));
  }

  const { error } = await supabase
    .from("internal_price_list_items")
    .update({
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    redirect(buildReturnUrl({ error: error.message, listId: priceListId }));
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/inventory/remissions");
  redirect(
    buildReturnUrl({
      ok: nextIsActive ? "item_enabled" : "item_disabled",
      listId: priceListId,
    })
  );
}
