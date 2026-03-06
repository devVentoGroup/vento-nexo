import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { ApprovalAction, NewProductProposal } from "@/lib/inventory/ai/types";
import { generateNextSku, isSkuConflictError } from "@/lib/inventory/sku";
import { nextWeightedAverageCost } from "@/lib/inventory/ai/workflows";
import { normalizeUnitCode, roundQuantity } from "@/lib/inventory/uom";

export const dynamic = "force-dynamic";

function asPositiveNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function mapProductTypeToInventoryKind(productType: string) {
  const normalized = String(productType || "").trim().toLowerCase();
  if (normalized === "venta") return "resale";
  if (normalized === "preparacion") return "finished";
  return "ingredient";
}

async function createProductFromProposal(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  proposal: NewProductProposal;
  supplierId: string | null;
  userId: string;
}) {
  const productType = params.proposal.product_type === "preparacion"
    ? "preparacion"
    : params.proposal.product_type === "venta"
      ? "venta"
      : "insumo";
  const inventoryKind = mapProductTypeToInventoryKind(productType);
  const stockUnitCode = normalizeUnitCode(params.proposal.stock_unit_code || "un");
  const name = params.proposal.name.trim();
  if (!name) throw new Error("Nombre de producto requerido");

  const productPayload: Record<string, unknown> = {
    name,
    description: null,
    unit: stockUnitCode,
    stock_unit_code: stockUnitCode,
    product_type: productType,
    category_id: null,
    price: null,
    cost: params.proposal.initial_cost_net ?? null,
    image_url: null,
    is_active: true,
  };

  let createdProductId = "";
  let attempts = 0;
  let lastInsertErrorMessage = "";
  while (!createdProductId && attempts < 2) {
    attempts += 1;
    const autoSku = await generateNextSku({
      supabase: params.supabase,
      productType,
      inventoryKind,
      name,
    });
    const { data, error } = await params.supabase
      .from("products")
      .insert({ ...productPayload, sku: autoSku })
      .select("id")
      .single();
    if (!error && data?.id) {
      createdProductId = data.id;
      break;
    }
    lastInsertErrorMessage = error?.message ?? "Error creando producto";
    if (!isSkuConflictError(error)) break;
  }

  if (!createdProductId) {
    throw new Error(lastInsertErrorMessage || "No se pudo crear el producto");
  }

  const productId = createdProductId;
  const profileRes = await params.supabase.from("product_inventory_profiles").upsert(
    {
      product_id: productId,
      track_inventory: true,
      inventory_kind: inventoryKind,
      default_unit: stockUnitCode,
      unit_family: null,
      costing_mode: "auto_primary_supplier",
      lot_tracking: false,
      expiry_tracking: false,
    },
    { onConflict: "product_id" }
  );
  if (profileRes.error) throw new Error(profileRes.error.message);

  if (params.proposal.purchase_uom) {
    const uom = params.proposal.purchase_uom;
    const uomRes = await params.supabase.from("product_uom_profiles").insert({
      product_id: productId,
      label: uom.label || "Empaque",
      input_unit_code: normalizeUnitCode(uom.input_unit_code || stockUnitCode),
      qty_in_input_unit: asPositiveNumber(uom.qty_in_input_unit, 1),
      qty_in_stock_unit: asPositiveNumber(uom.qty_in_stock_unit, 1),
      usage_context: "purchase",
      is_default: true,
      is_active: true,
      source: "manual",
      updated_at: new Date().toISOString(),
    });
    if (uomRes.error) throw new Error(uomRes.error.message);
  }

  if (params.supplierId) {
    const purchasePackQty = params.proposal.purchase_uom
      ? asPositiveNumber(params.proposal.purchase_uom.qty_in_stock_unit, 1)
      : 1;
    const purchasePackUnitCode = params.proposal.purchase_uom
      ? normalizeUnitCode(params.proposal.purchase_uom.input_unit_code || stockUnitCode)
      : stockUnitCode;

    const supplierRes = await params.supabase.from("product_suppliers").insert({
      product_id: productId,
      supplier_id: params.supplierId,
      supplier_sku: null,
      purchase_unit: params.proposal.purchase_uom?.label ?? "Empaque",
      purchase_unit_size: purchasePackQty,
      purchase_pack_qty: 1,
      purchase_pack_unit_code: purchasePackUnitCode,
      purchase_price: params.proposal.initial_cost_net ?? null,
      purchase_price_net: params.proposal.initial_cost_net ?? null,
      purchase_price_includes_tax: false,
      purchase_tax_rate: 0,
      currency: "COP",
      is_primary: true,
    });
    if (supplierRes.error) throw new Error(supplierRes.error.message);
  }

  return productId;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const params = await ctx.params;
  const id = String(params.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ID_REQUIRED" }, { status: 400 });

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body: {
    actions?: ApprovalAction[];
    entry_context?: {
      supplier_id?: string | null;
      supplier_name?: string | null;
      invoice_number?: string | null;
      received_at?: string | null;
      notes?: string | null;
      purchase_order_id?: string | null;
    };
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const actions = Array.isArray(body.actions) ? body.actions : [];
  if (!actions.length) return NextResponse.json({ error: "ACTIONS_REQUIRED" }, { status: 400 });

  const [{ data: ingestion }, { data: items }] = await Promise.all([
    supabase
      .from("inventory_ai_ingestions")
      .select("id,site_id,supplier_id,flow_type,parsed_document,status")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("inventory_ai_ingestion_items")
      .select("id,line_no,raw_payload,normalized_payload,review_status")
      .eq("ingestion_id", id),
  ]);
  if (!ingestion) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const itemMap = new Map((items ?? []).map((row) => [row.id as string, row]));
  const resolvedProductByItem = new Map<string, string>();
  const approvedItemIds = new Set<string>();
  const actionAuditRows: Array<{
    ingestion_id: string;
    item_id: string | null;
    action_type: "create_product" | "use_existing" | "create_entry" | "reject";
    approved_by: string;
    approved_at: string;
    audit_payload: Record<string, unknown>;
  }> = [];
  const entryRows: Array<{
    item_id: string;
    product_id: string;
    quantity_received_stock: number;
    stock_unit_code: string;
    input_qty: number;
    input_unit_code: string;
    conversion_factor_to_stock: number;
    net_unit_cost_stock: number;
    gross_unit_cost_stock: number | null;
    tax_included: boolean | null;
    tax_rate: number | null;
  }> = [];

  for (const action of actions) {
    if (!("item_id" in action) || !action.item_id || !itemMap.has(action.item_id)) {
      continue;
    }
    const itemRow = itemMap.get(action.item_id)!;
    const normalizedPayload = (itemRow.normalized_payload ?? {}) as Record<string, unknown>;
    const nowIso = new Date().toISOString();

    if (action.action === "reject") {
      approvedItemIds.add(action.item_id);
      actionAuditRows.push({
        ingestion_id: id,
        item_id: action.item_id,
        action_type: "reject",
        approved_by: user.id,
        approved_at: nowIso,
        audit_payload: { reason: "manual_reject" },
      });
      continue;
    }

    if (action.action === "create_product") {
      const baseProposal = (normalizedPayload.new_product_proposal ?? {}) as NewProductProposal;
      const override = action.payload ?? {};
      const merged: NewProductProposal = {
        name: String(override.name ?? baseProposal.name ?? "").trim(),
        product_type:
          (override.product_type as NewProductProposal["product_type"]) ??
          baseProposal.product_type ??
          "insumo",
        stock_unit_code: String(override.stock_unit_code ?? baseProposal.stock_unit_code ?? "un"),
        purchase_uom: (override.purchase_uom as NewProductProposal["purchase_uom"]) ?? baseProposal.purchase_uom ?? null,
        initial_cost_net:
          override.initial_cost_net == null
            ? (baseProposal.initial_cost_net ?? null)
            : Number(override.initial_cost_net),
      };

      const productId = await createProductFromProposal({
        supabase,
        proposal: merged,
        supplierId: ingestion.supplier_id ?? null,
        userId: user.id,
      });
      resolvedProductByItem.set(action.item_id, productId);
      approvedItemIds.add(action.item_id);

      actionAuditRows.push({
        ingestion_id: id,
        item_id: action.item_id,
        action_type: "create_product",
        approved_by: user.id,
        approved_at: nowIso,
        audit_payload: {
          created_product_id: productId,
          proposal: merged,
        },
      });
      continue;
    }

    if (action.action === "use_existing") {
      const productId = String(action.payload?.product_id ?? "").trim();
      if (!productId) continue;
      resolvedProductByItem.set(action.item_id, productId);
      approvedItemIds.add(action.item_id);

      actionAuditRows.push({
        ingestion_id: id,
        item_id: action.item_id,
        action_type: "use_existing",
        approved_by: user.id,
        approved_at: nowIso,
        audit_payload: { product_id: productId },
      });
      continue;
    }

    if (action.action === "create_entry") {
      const payload = action.payload;
      const fallbackProductId =
        resolvedProductByItem.get(action.item_id) ||
        String((normalizedPayload.selected_product_id as string) ?? "").trim();
      const productId = String(payload.product_id || fallbackProductId || "").trim();
      if (!productId) continue;

      entryRows.push({
        item_id: action.item_id,
        product_id: productId,
        quantity_received_stock: asPositiveNumber(payload.quantity_received_stock, 0),
        stock_unit_code: normalizeUnitCode(payload.stock_unit_code || "un"),
        input_qty: asPositiveNumber(payload.input_qty, 0),
        input_unit_code: normalizeUnitCode(payload.input_unit_code || payload.stock_unit_code || "un"),
        conversion_factor_to_stock: asPositiveNumber(payload.conversion_factor_to_stock, 1),
        net_unit_cost_stock: asPositiveNumber(payload.net_unit_cost_stock, 0),
        gross_unit_cost_stock:
          payload.gross_unit_cost_stock == null
            ? null
            : asPositiveNumber(payload.gross_unit_cost_stock, 0),
        tax_included: payload.tax_included,
        tax_rate:
          payload.tax_rate == null ? null : Math.max(0, Number(payload.tax_rate)),
      });
      approvedItemIds.add(action.item_id);
      actionAuditRows.push({
        ingestion_id: id,
        item_id: action.item_id,
        action_type: "create_entry",
        approved_by: user.id,
        approved_at: nowIso,
        audit_payload: payload,
      });
    }
  }

  if (entryRows.length > 0 && ingestion.flow_type !== "supplier_entries") {
    return NextResponse.json({ error: "ENTRY_ACTION_NOT_ALLOWED_FOR_FLOW" }, { status: 400 });
  }

  let createdEntryId: string | null = null;
  if (entryRows.length > 0) {
    const { data: productsData } = await supabase
      .from("products")
      .select("id,cost")
      .in("id", Array.from(new Set(entryRows.map((row) => row.product_id))));
    const productCostMap = new Map(
      ((productsData ?? []) as Array<{ id: string; cost: number | null }>).map((row) => [
        row.id,
        Number(row.cost ?? 0),
      ])
    );
    const { data: globalStockRows } = await supabase
      .from("inventory_stock_by_site")
      .select("product_id,current_qty")
      .in("product_id", Array.from(new Set(entryRows.map((row) => row.product_id))));
    const globalQtyBeforeMap = new Map<string, number>();
    for (const row of (globalStockRows ?? []) as Array<{ product_id: string; current_qty: number | null }>) {
      const prev = globalQtyBeforeMap.get(row.product_id) ?? 0;
      globalQtyBeforeMap.set(row.product_id, prev + Number(row.current_qty ?? 0));
    }

    const supplierNameFromDoc = String(
      ((ingestion.parsed_document ?? {}) as Record<string, unknown>).supplier_name ?? ""
    ).trim();
    let supplierName = String(body.entry_context?.supplier_name ?? "").trim() || supplierNameFromDoc;
    const supplierId = String(body.entry_context?.supplier_id ?? ingestion.supplier_id ?? "").trim() || null;
    if (supplierId && !supplierName) {
      const { data: supplierRow } = await supabase
        .from("suppliers")
        .select("name")
        .eq("id", supplierId)
        .maybeSingle();
      supplierName = String(supplierRow?.name ?? "").trim();
    }
    if (!supplierName) supplierName = "Proveedor IA";

    const { data: entry, error: entryErr } = await supabase
      .from("inventory_entries")
      .insert({
        site_id: ingestion.site_id,
        supplier_id: supplierId,
        supplier_name: supplierName,
        invoice_number: body.entry_context?.invoice_number ?? null,
        received_at: body.entry_context?.received_at ?? new Date().toISOString(),
        status: "received",
        notes: body.entry_context?.notes ?? "Entrada aprobada por IA (copiloto)",
        created_by: user.id,
        purchase_order_id: body.entry_context?.purchase_order_id ?? null,
        source_app: "nexo",
        entry_mode: "emergency",
        emergency_reason: "Aprobacion asistida por IA",
      })
      .select("id")
      .single();
    if (entryErr || !entry?.id) {
      return NextResponse.json({ error: entryErr?.message ?? "ENTRY_CREATE_FAILED" }, { status: 500 });
    }
    createdEntryId = entry.id;

    const locationId = String((body.entry_context as Record<string, unknown> | undefined)?.location_id ?? "").trim();
    if (!locationId) {
      return NextResponse.json({ error: "ENTRY_LOCATION_REQUIRED" }, { status: 400 });
    }

    const itemInsertRows = entryRows.map((row) => ({
      entry_id: entry.id,
      product_id: row.product_id,
      location_id: locationId,
      quantity_declared: row.quantity_received_stock,
      quantity_received: row.quantity_received_stock,
      unit: row.stock_unit_code,
      input_qty: row.input_qty,
      input_unit_code: row.input_unit_code,
      conversion_factor_to_stock: row.conversion_factor_to_stock,
      stock_unit_code: row.stock_unit_code,
      input_unit_cost:
        row.conversion_factor_to_stock > 0
          ? row.net_unit_cost_stock * row.conversion_factor_to_stock
          : row.net_unit_cost_stock,
      stock_unit_cost: row.net_unit_cost_stock,
      line_total_cost: row.quantity_received_stock * row.net_unit_cost_stock,
      cost_source: "manual",
      currency: "COP",
      notes: "Aprobado IA",
      tax_included: row.tax_included,
      tax_rate: row.tax_rate,
      net_unit_cost: row.net_unit_cost_stock,
      gross_unit_cost: row.gross_unit_cost_stock,
    }));
    const { error: itemErr } = await supabase.from("inventory_entry_items").insert(itemInsertRows);
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });

    const movementRows = entryRows.map((row) => ({
      site_id: ingestion.site_id,
      product_id: row.product_id,
      movement_type: "receipt_in",
      quantity: row.quantity_received_stock,
      input_qty: row.input_qty,
      input_unit_code: row.input_unit_code,
      conversion_factor_to_stock: row.conversion_factor_to_stock,
      stock_unit_code: row.stock_unit_code,
      stock_unit_cost: row.net_unit_cost_stock,
      line_total_cost: row.quantity_received_stock * row.net_unit_cost_stock,
      note: `Entrada IA ${entry.id}`,
      created_by: user.id,
    }));
    const { error: movErr } = await supabase.from("inventory_movements").insert(movementRows);
    if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 });

    const receiptByProduct = new Map<string, { qtyIn: number; lineCostTotal: number }>();
    for (const row of entryRows) {
      const prev = receiptByProduct.get(row.product_id) ?? { qtyIn: 0, lineCostTotal: 0 };
      receiptByProduct.set(row.product_id, {
        qtyIn: prev.qtyIn + row.quantity_received_stock,
        lineCostTotal: prev.lineCostTotal + row.quantity_received_stock * row.net_unit_cost_stock,
      });
    }

    const { data: siteStockRows } = await supabase
      .from("inventory_stock_by_site")
      .select("product_id,current_qty")
      .eq("site_id", ingestion.site_id)
      .in("product_id", Array.from(receiptByProduct.keys()));
    const siteQtyMap = new Map(
      ((siteStockRows ?? []) as Array<{ product_id: string; current_qty: number | null }>).map((row) => [
        row.product_id,
        Number(row.current_qty ?? 0),
      ])
    );
    for (const row of entryRows) {
      const currentQty = siteQtyMap.get(row.product_id) ?? 0;
      const nextQty = roundQuantity(currentQty + row.quantity_received_stock, 6);
      siteQtyMap.set(row.product_id, nextQty);
      const { error: stockErr } = await supabase.from("inventory_stock_by_site").upsert(
        {
          site_id: ingestion.site_id,
          product_id: row.product_id,
          current_qty: nextQty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_id,product_id" }
      );
      if (stockErr) return NextResponse.json({ error: stockErr.message }, { status: 500 });

      const { error: locErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
        p_location_id: locationId,
        p_product_id: row.product_id,
        p_delta: row.quantity_received_stock,
      });
      if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });
    }

    for (const [productId, receipt] of receiptByProduct.entries()) {
      if (receipt.qtyIn <= 0) continue;
      const qtyBefore = Number(globalQtyBeforeMap.get(productId) ?? 0);
      const costBefore = Number(productCostMap.get(productId) ?? 0);
      const costIn = receipt.lineCostTotal / receipt.qtyIn;
      const costAfter = nextWeightedAverageCost({
        qtyBefore,
        costBefore,
        qtyIn: receipt.qtyIn,
        costIn,
      });

      const { error: updateCostErr } = await supabase
        .from("products")
        .update({ cost: costAfter, updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (updateCostErr) return NextResponse.json({ error: updateCostErr.message }, { status: 500 });

      const { error: eventErr } = await supabase.from("product_cost_events").insert({
        product_id: productId,
        site_id: ingestion.site_id,
        source: "entry",
        source_entry_id: entry.id,
        qty_before: qtyBefore,
        qty_in: receipt.qtyIn,
        cost_before: costBefore,
        cost_in: costIn,
        cost_after: costAfter,
        basis: "net",
        created_by: user.id,
      });
      if (eventErr) return NextResponse.json({ error: eventErr.message }, { status: 500 });
    }
  }

  if (actionAuditRows.length > 0) {
    const { error: actionErr } = await supabase
      .from("inventory_ai_ingestion_actions")
      .insert(actionAuditRows);
    if (actionErr) return NextResponse.json({ error: actionErr.message }, { status: 500 });
  }

  if (approvedItemIds.size > 0) {
    const approvedIds = Array.from(approvedItemIds);
    const { error: itemUpdateErr } = await supabase
      .from("inventory_ai_ingestion_items")
      .update({ review_status: "approved", updated_at: new Date().toISOString() })
      .eq("ingestion_id", id)
      .in("id", approvedIds);
    if (itemUpdateErr) return NextResponse.json({ error: itemUpdateErr.message }, { status: 500 });
  }

  const { data: pendingRows } = await supabase
    .from("inventory_ai_ingestion_items")
    .select("id")
    .eq("ingestion_id", id)
    .eq("review_status", "needs_review")
    .limit(1);
  const nextStatus = (pendingRows ?? []).length > 0 ? "needs_review" : "approved";
  const { error: statusErr } = await supabase
    .from("inventory_ai_ingestions")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    ingestion_id: id,
    status: nextStatus,
    approved_items: approvedItemIds.size,
    entry_id: createdEntryId,
  });
}
