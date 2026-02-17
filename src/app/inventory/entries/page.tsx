import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { EntriesForm } from "@/components/vento/entries-form";
import { PageHeader } from "@/components/vento/standard/page-header";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  convertQuantity,
  createUnitMap,
  normalizeUnitCode,
  roundQuantity,
  type ProductUomProfile,
  type InventoryUnit,
} from "@/lib/inventory/uom";
import {
  computeAutoCostFromPrimarySupplier,
  computeStockUnitCostFromInput,
  computeWeightedAverageCost,
} from "@/lib/inventory/costing";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  cost: number | null;
};

type ProductProfileWithProduct = {
  product_id: string;
  products: ProductRow | null;
};

type UnitRow = InventoryUnit;

type LocRow = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type SupplierRow = {
  id: string;
  name: string | null;
};

type SearchParams = {
  error?: string;
  ok?: string;
  purchase_order_id?: string;
};

type ProductProfileRow = {
  product_id: string;
  track_inventory: boolean;
  costing_mode: "auto_primary_supplier" | "manual" | null;
};

type ProductSupplierCostRow = {
  product_id: string;
  supplier_id: string;
  is_primary: boolean | null;
  purchase_pack_qty: number | null;
  purchase_pack_unit_code: string | null;
  purchase_price: number | null;
};

type PurchaseOrderRow = {
  id: string;
  supplier_id: string | null;
  site_id: string | null;
  notes: string | null;
};

type PurchaseOrderItemRow = {
  id: string;
  product_id: string;
  quantity_ordered: number | null;
  quantity_received: number | null;
  unit_cost: number | null;
  unit: string | null;
};

type EntryRow = {
  id: string;
  supplier_name: string | null;
  invoice_number: string | null;
  status: string | null;
  received_at: string | null;
  created_at: string | null;
  site_id: string | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatStatus(status?: string | null) {
  const value = String(status ?? "").trim();
  switch (value) {
    case "pending":
      return { label: "Pendiente", className: "ui-chip ui-chip--warn" };
    case "partial":
      return { label: "Parcial", className: "ui-chip ui-chip--warn" };
    case "received":
      return { label: "Recibida", className: "ui-chip ui-chip--success" };
    default:
      return { label: value || "Sin estado", className: "ui-chip" };
  }
}

async function createEntry(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/entries"));
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("site_id")
    .eq("id", user.id)
    .single();

  const { data: settings } = await supabase
    .from("employee_settings")
    .select("selected_site_id")
    .eq("employee_id", user.id)
    .maybeSingle();

  const siteId = settings?.selected_site_id ?? employee?.site_id ?? "";
  if (!siteId) {
    redirect("/inventory/entries?error=" + encodeURIComponent("No tienes sede activa."));
  }

  const supplierId = asText(formData.get("supplier_id"));
  const supplierCustom = asText(formData.get("supplier_custom"));
  const invoiceNumber = asText(formData.get("invoice_number"));
  const receivedAt = asText(formData.get("received_at"));
  const notes = asText(formData.get("notes"));

  const productIds = formData.getAll("item_product_id").map((v) => String(v).trim());
  const locationIds = formData.getAll("item_location_id").map((v) => String(v).trim());
  const declared = formData.getAll("item_quantity_declared").map((v) => String(v).trim());
  const received = formData.getAll("item_quantity_received").map((v) => String(v).trim());
  const inputUnits = formData
    .getAll("item_input_unit_code")
    .map((v) => normalizeUnitCode(String(v).trim()));
  const inputUnitCosts = formData.getAll("item_input_unit_cost").map((v) => String(v).trim());
  const purchaseOrderItemIds = formData
    .getAll("item_purchase_order_item_id")
    .map((v) => String(v).trim());
  const itemNotes = formData.getAll("item_notes").map((v) => String(v).trim());

  const productIdsForLookup = Array.from(new Set(productIds.filter(Boolean)));
  const { data: productsData } = productIdsForLookup.length
    ? await supabase
        .from("products")
        .select("id,unit,stock_unit_code,cost")
        .in("id", productIdsForLookup)
    : { data: [] as ProductRow[] };
  const productMap = new Map(
    ((productsData ?? []) as ProductRow[]).map((product) => [product.id, product])
  );

  const { data: profileData } = productIdsForLookup.length
    ? await supabase
        .from("product_inventory_profiles")
        .select("product_id,track_inventory,costing_mode")
        .in("product_id", productIdsForLookup)
    : { data: [] as ProductProfileRow[] };
  const productProfileMap = new Map(
    ((profileData ?? []) as ProductProfileRow[]).map((row) => [row.product_id, row])
  );

  const purchaseOrderId = asText(formData.get("purchase_order_id")) || null;
  const normalizedSupplierId =
    supplierId && supplierId !== "__new__" ? supplierId : "";
  const { data: supplierCostData } = productIdsForLookup.length
    ? await supabase
        .from("product_suppliers")
        .select(
          "product_id,supplier_id,is_primary,purchase_pack_qty,purchase_pack_unit_code,purchase_price"
        )
        .in("product_id", productIdsForLookup)
    : { data: [] as ProductSupplierCostRow[] };
  const supplierCostByProduct = new Map<string, ProductSupplierCostRow[]>();
  for (const row of (supplierCostData ?? []) as ProductSupplierCostRow[]) {
    if (!row.product_id) continue;
    const current = supplierCostByProduct.get(row.product_id) ?? [];
    current.push(row);
    supplierCostByProduct.set(row.product_id, current);
  }

  const { data: unitsData } = await supabase
    .from("inventory_units")
    .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
    .eq("is_active", true)
    .limit(500);
  const unitMap = createUnitMap((unitsData ?? []) as UnitRow[]);

  function resolveSupplierStockUnitCost(productId: string, stockUnitCode: string): number | null {
    const supplierRows = supplierCostByProduct.get(productId) ?? [];
    if (!supplierRows.length) return null;

    const isValid = (row: ProductSupplierCostRow) => {
      const packQty = Number(row.purchase_pack_qty ?? 0);
      const packPrice = Number(row.purchase_price ?? 0);
      return (
        Boolean(normalizeUnitCode(row.purchase_pack_unit_code)) &&
        Number.isFinite(packQty) &&
        packQty > 0 &&
        Number.isFinite(packPrice) &&
        packPrice > 0
      );
    };

    const selectedSupplierRow =
      normalizedSupplierId && normalizedSupplierId !== "__new__"
        ? supplierRows.find(
            (row) => row.supplier_id === normalizedSupplierId && isValid(row)
          ) ?? null
        : null;
    const primaryRow =
      supplierRows.find((row) => Boolean(row.is_primary) && isValid(row)) ?? null;
    const chosenRow = selectedSupplierRow ?? primaryRow;
    if (!chosenRow) return null;

    try {
      return computeAutoCostFromPrimarySupplier({
        packPrice: Number(chosenRow.purchase_price ?? 0),
        packQty: Number(chosenRow.purchase_pack_qty ?? 0),
        packUnitCode: normalizeUnitCode(chosenRow.purchase_pack_unit_code),
        stockUnitCode: normalizeUnitCode(stockUnitCode),
        unitMap,
      });
    } catch {
      return null;
    }
  }

  const items = productIds
    .map((productId, idx) => {
      const inputDeclared = parseNumber(declared[idx] ?? "0");
      const inputReceived = parseNumber(received[idx] ?? "0");
      const product = productMap.get(productId);
      const profile = productProfileMap.get(productId);
      const stockUnitCode = normalizeUnitCode(
        product?.stock_unit_code || product?.unit || inputUnits[idx] || "un"
      );
      const inputUnitCode = normalizeUnitCode(inputUnits[idx] || stockUnitCode);
      const rawInputUnitCost = parseNumber(inputUnitCosts[idx] ?? "");
      const suggestedSupplierStockCost = resolveSupplierStockUnitCost(productId, stockUnitCode);
      const fallbackCost =
        suggestedSupplierStockCost != null
          ? suggestedSupplierStockCost
          : Number(product?.cost ?? 0);
      const hasManualCost = Number.isFinite(rawInputUnitCost) && rawInputUnitCost > 0;
      const fallbackCostSource = suggestedSupplierStockCost != null ? "manual" : "fallback_product_cost";

      let quantityDeclared = inputDeclared;
      let quantityReceived = inputReceived;
      let conversionFactorToStock = 1;
      try {
        const factorRes = convertQuantity({
          quantity: 1,
          fromUnitCode: inputUnitCode,
          toUnitCode: stockUnitCode,
          unitMap,
        });
        conversionFactorToStock = factorRes.quantity;
        quantityDeclared = roundQuantity(inputDeclared * conversionFactorToStock);
        quantityReceived = roundQuantity(inputReceived * conversionFactorToStock);
        const autoInputUnitCost = roundQuantity(fallbackCost * conversionFactorToStock, 6);
        const effectiveInputUnitCost = hasManualCost ? rawInputUnitCost : autoInputUnitCost;
        const convertedCost = computeStockUnitCostFromInput({
          inputUnitCost: effectiveInputUnitCost,
          conversionFactorToStock,
        });
        return {
          product_id: productId,
          location_id: locationIds[idx] || "",
          input_qty_declared: inputDeclared,
          input_qty_received: inputReceived,
          input_unit_code: inputUnitCode,
          input_unit_cost: hasManualCost
            ? rawInputUnitCost
            : suggestedSupplierStockCost != null
              ? autoInputUnitCost
              : null,
          fallback_unit_cost: hasManualCost ? null : fallbackCost,
          quantity_declared: quantityDeclared,
          quantity_received: quantityReceived,
          conversion_factor_to_stock: conversionFactorToStock,
          stock_unit_code: stockUnitCode,
          stock_unit_cost: convertedCost > 0 ? convertedCost : 0,
          line_total_cost: roundQuantity(quantityReceived * (convertedCost > 0 ? convertedCost : 0), 6),
          purchase_order_item_id: purchaseOrderItemIds[idx] || null,
          cost_source: hasManualCost
            ? purchaseOrderItemIds[idx]
              ? "po_prefill"
              : "manual"
            : fallbackCostSource,
          apply_auto_cost:
            Boolean(profile?.track_inventory) &&
            profile?.costing_mode === "auto_primary_supplier",
          notes: itemNotes[idx] || null,
        };
      } catch {
        redirect(
          "/inventory/entries?error=" +
            encodeURIComponent(
              `Conversion invalida para producto ${productId}. Verifica unidad de captura y unidad canonica.`
            )
        );
      }
      return {
        product_id: productId,
        location_id: locationIds[idx] || "",
        input_qty_declared: inputDeclared,
        input_qty_received: inputReceived,
        input_unit_code: inputUnitCode,
        input_unit_cost: hasManualCost
          ? rawInputUnitCost
          : suggestedSupplierStockCost != null
            ? fallbackCost
            : null,
        fallback_unit_cost: hasManualCost ? null : fallbackCost,
        quantity_declared: quantityDeclared,
        quantity_received: quantityReceived,
        conversion_factor_to_stock: conversionFactorToStock,
        stock_unit_code: stockUnitCode,
        stock_unit_cost: fallbackCost > 0 ? fallbackCost : 0,
        line_total_cost: roundQuantity(quantityReceived * (fallbackCost > 0 ? fallbackCost : 0), 6),
        purchase_order_item_id: purchaseOrderItemIds[idx] || null,
        cost_source: hasManualCost
          ? purchaseOrderItemIds[idx]
            ? "po_prefill"
            : "manual"
          : fallbackCostSource,
        apply_auto_cost:
          Boolean(profile?.track_inventory) &&
          profile?.costing_mode === "auto_primary_supplier",
        notes: itemNotes[idx] || null,
      };
    })
    .filter((item) => item.product_id && item.quantity_declared > 0);

  let supplierName = supplierCustom;
  if (supplierId && supplierId !== "__new__") {
    const { data: supplierRow } = await supabase
      .from("suppliers")
      .select("name")
      .eq("id", supplierId)
      .maybeSingle();
    supplierName = supplierRow?.name ?? "";
  }

  if (!supplierName) {
    redirect("/inventory/entries?error=" + encodeURIComponent("Proveedor requerido."));
  }

  if (items.length === 0) {
    redirect(
      "/inventory/entries?error=" +
        encodeURIComponent("Agrega al menos un item con cantidad declarada > 0.")
    );
  }

  const missingLoc = items.some((item) => !item.location_id);
  if (missingLoc) {
    redirect("/inventory/entries?error=" + encodeURIComponent("Selecciona una LOC para cada item."));
  }

  const anyReceived = items.some((item) => item.quantity_received > 0);
  const allReceived = items.every(
    (item) => item.quantity_received >= item.quantity_declared && item.quantity_declared > 0
  );
  const status = allReceived ? "received" : anyReceived ? "partial" : "pending";

  const { data: entry, error: entryErr } = await supabase
    .from("inventory_entries")
    .insert({
      site_id: siteId,
      supplier_id: supplierId && supplierId !== "__new__" ? supplierId : null,
      supplier_name: supplierName,
      invoice_number: invoiceNumber || null,
      received_at: receivedAt || null,
      status,
      notes: notes || null,
      created_by: user.id,
      purchase_order_id: purchaseOrderId,
    })
    .select("id")
    .single();

  if (entryErr || !entry) {
    redirect(
      "/inventory/entries?error=" +
        encodeURIComponent(entryErr?.message ?? "No se pudo crear la entrada.")
    );
  }

  const payload = items.map((item) => ({
    entry_id: entry.id,
    product_id: item.product_id,
    location_id: item.location_id,
    quantity_declared: item.quantity_declared,
    quantity_received: item.quantity_received,
    unit: item.stock_unit_code,
    input_qty: item.input_qty_received > 0 ? item.input_qty_received : item.input_qty_declared,
    input_unit_code: item.input_unit_code,
    conversion_factor_to_stock: item.conversion_factor_to_stock,
    stock_unit_code: item.stock_unit_code,
    input_unit_cost: item.input_unit_cost,
    stock_unit_cost: item.stock_unit_cost,
    line_total_cost: item.line_total_cost,
    cost_source: item.cost_source,
    currency: "COP",
    purchase_order_item_id: item.purchase_order_item_id,
    notes: item.notes,
  }));

  const { error: itemsErr } = await supabase.from("inventory_entry_items").insert(payload);
  if (itemsErr) {
    redirect(
      "/inventory/entries?error=" +
        encodeURIComponent(itemsErr.message ?? "No se pudieron crear los items.")
    );
  }

  const movementRows = items
    .filter((item) => item.quantity_received > 0)
    .map((item) => ({
      site_id: siteId,
      product_id: item.product_id,
      movement_type: "receipt_in",
      quantity: item.quantity_received,
      input_qty: item.input_qty_received,
      input_unit_code: item.input_unit_code,
      conversion_factor_to_stock: item.conversion_factor_to_stock,
      stock_unit_code: item.stock_unit_code,
      stock_unit_cost: item.stock_unit_cost,
      line_total_cost: item.line_total_cost,
      note: `Entrada ${entry.id}`,
    }));

  if (movementRows.length) {
    const { error: moveErr } = await supabase
      .from("inventory_movements")
      .insert(movementRows);
    if (moveErr) {
      redirect("/inventory/entries?error=" + encodeURIComponent(moveErr.message));
    }

    const productIdsWithReceipt = Array.from(
      new Set(movementRows.map((item) => item.product_id))
    );
    const { data: globalStockRows } = await supabase
      .from("inventory_stock_by_site")
      .select("product_id,current_qty")
      .in("product_id", productIdsWithReceipt);
    const globalQtyBeforeMap = new Map<string, number>();
    for (const row of (globalStockRows ?? []) as Array<{ product_id: string; current_qty: number | null }>) {
      const prev = globalQtyBeforeMap.get(row.product_id) ?? 0;
      globalQtyBeforeMap.set(row.product_id, prev + Number(row.current_qty ?? 0));
    }
    const { data: existingSiteStocks } = await supabase
      .from("inventory_stock_by_site")
      .select("product_id,current_qty")
      .eq("site_id", siteId)
      .in("product_id", productIdsWithReceipt);
    const siteQtyMap = new Map(
      (existingSiteStocks ?? []).map((row: { product_id: string; current_qty: number | null }) => [
        row.product_id,
        Number(row.current_qty ?? 0),
      ])
    );
    for (const item of movementRows) {
      const currentQty = siteQtyMap.get(item.product_id) ?? 0;
      const nextQty = roundQuantity(currentQty + item.quantity);
      siteQtyMap.set(item.product_id, nextQty);
      const { error: stockErr } = await supabase
        .from("inventory_stock_by_site")
        .upsert(
          {
            site_id: item.site_id,
            product_id: item.product_id,
            current_qty: nextQty,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "site_id,product_id" }
        );
      if (stockErr) {
        redirect("/inventory/entries?error=" + encodeURIComponent(stockErr.message));
      }
    }

    for (const item of items.filter((row) => row.quantity_received > 0)) {
      const { error: locErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
        p_location_id: item.location_id,
        p_product_id: item.product_id,
        p_delta: item.quantity_received,
      });
      if (locErr) {
        redirect("/inventory/entries?error=" + encodeURIComponent(locErr.message));
      }
    }

    const { data: policyRow } = await supabase
      .from("inventory_cost_policies")
      .select("cost_basis,is_active")
      .eq("site_id", siteId)
      .maybeSingle();
    const basis =
      policyRow && policyRow.is_active === false
        ? "net"
        : (String(policyRow?.cost_basis ?? "net") as "net" | "gross");

    const receiptByProduct = new Map<
      string,
      { qtyIn: number; lineCostTotal: number; applyAutoCost: boolean }
    >();
    for (const row of items.filter((item) => item.quantity_received > 0)) {
      const prev = receiptByProduct.get(row.product_id) ?? {
        qtyIn: 0,
        lineCostTotal: 0,
        applyAutoCost: false,
      };
      receiptByProduct.set(row.product_id, {
        qtyIn: prev.qtyIn + Number(row.quantity_received ?? 0),
        lineCostTotal: prev.lineCostTotal + Number(row.line_total_cost ?? 0),
        applyAutoCost: prev.applyAutoCost || Boolean(row.apply_auto_cost),
      });
    }

    for (const [productId, receipt] of receiptByProduct.entries()) {
      if (!receipt.applyAutoCost || receipt.qtyIn <= 0) continue;
      const costBefore = Number(productMap.get(productId)?.cost ?? 0);
      const qtyBefore = Number(globalQtyBeforeMap.get(productId) ?? 0);
      const costIn =
        receipt.qtyIn > 0 ? Number(receipt.lineCostTotal ?? 0) / Number(receipt.qtyIn) : 0;
      const costAfter = computeWeightedAverageCost({
        currentQty: qtyBefore,
        currentUnitCost: costBefore,
        receivedQty: receipt.qtyIn,
        receivedUnitCost: costIn,
      });

      const { error: updateCostErr } = await supabase
        .from("products")
        .update({ cost: costAfter, updated_at: new Date().toISOString() })
        .eq("id", productId);
      if (updateCostErr) {
        redirect("/inventory/entries?error=" + encodeURIComponent(updateCostErr.message));
      }

      const { error: costEventErr } = await supabase.from("product_cost_events").insert({
        product_id: productId,
        site_id: siteId,
        source: "entry",
        source_entry_id: entry.id,
        qty_before: qtyBefore,
        qty_in: receipt.qtyIn,
        cost_before: costBefore,
        cost_in: costIn,
        cost_after: costAfter,
        basis,
        created_by: user.id,
      });
      if (costEventErr) {
        redirect("/inventory/entries?error=" + encodeURIComponent(costEventErr.message));
      }
    }

    if (purchaseOrderId) {
      const receivedByPoItem = new Map<string, number>();
      for (const row of items) {
        if (!row.purchase_order_item_id || row.quantity_received <= 0) continue;
        const prev = receivedByPoItem.get(row.purchase_order_item_id) ?? 0;
        receivedByPoItem.set(row.purchase_order_item_id, prev + Number(row.quantity_received));
      }

      for (const [poItemId, qtyReceived] of receivedByPoItem.entries()) {
        const { data: poItem, error: poItemErr } = await supabase
          .from("purchase_order_items")
          .select("quantity_received")
          .eq("id", poItemId)
          .maybeSingle();
        if (poItemErr) {
          redirect("/inventory/entries?error=" + encodeURIComponent(poItemErr.message));
        }
        const currentReceived = Number(poItem?.quantity_received ?? 0);
        const nextReceived = roundQuantity(currentReceived + qtyReceived, 6);
        const { error: poItemUpdateErr } = await supabase
          .from("purchase_order_items")
          .update({ quantity_received: nextReceived })
          .eq("id", poItemId);
        if (poItemUpdateErr) {
          redirect("/inventory/entries?error=" + encodeURIComponent(poItemUpdateErr.message));
        }
      }

      const { data: poAllItems, error: poItemsErr } = await supabase
        .from("purchase_order_items")
        .select("quantity_ordered,quantity_received")
        .eq("purchase_order_id", purchaseOrderId);
      if (poItemsErr) {
        redirect("/inventory/entries?error=" + encodeURIComponent(poItemsErr.message));
      }
      const allReceived = (poAllItems ?? []).every((row) => {
        const ordered = Number(row.quantity_ordered ?? 0);
        const received = Number(row.quantity_received ?? 0);
        return ordered > 0 && received >= ordered;
      });
      if (allReceived && (poAllItems ?? []).length > 0) {
        const { error: poStatusErr } = await supabase
          .from("purchase_orders")
          .update({ status: "received", received_at: new Date().toISOString() })
          .eq("id", purchaseOrderId);
        if (poStatusErr) {
          redirect("/inventory/entries?error=" + encodeURIComponent(poStatusErr.message));
        }
      }
    }
  }

  redirect("/inventory/entries?ok=created");
}

export default async function EntriesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const okMsg = sp.ok ? safeDecodeURIComponent(sp.ok) : "";

  const access = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/entries",
    permissionCode: "inventory.entries",
  });

  const supabase = access.supabase;

  const { data: products } = await supabase
    .from("product_inventory_profiles")
    .select("product_id, products(id,name,unit,stock_unit_code,cost)")
    .eq("track_inventory", true)
    .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
    .order("name", { foreignTable: "products", ascending: true })
    .limit(400);

  let productRows = ((products ?? []) as unknown as ProductProfileWithProduct[])
    .map((row) => row.products)
    .filter((row): row is ProductRow => Boolean(row));

  if (productRows.length === 0) {
    const { data: fallbackProducts } = await supabase
      .from("products")
      .select("id,name,unit,stock_unit_code,cost")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(400);
    productRows = (fallbackProducts ?? []) as unknown as ProductRow[];
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
  const { data: supplierCostRowsData } = productIds.length
    ? await supabase
        .from("product_suppliers")
        .select(
          "product_id,supplier_id,is_primary,purchase_pack_qty,purchase_pack_unit_code,purchase_price"
        )
        .in("product_id", productIds)
    : { data: [] as ProductSupplierCostRow[] };
  const supplierCostRows = (supplierCostRowsData ?? []) as ProductSupplierCostRow[];

  const { data: unitsData } = await supabase
    .from("inventory_units")
    .select("code,name,family,factor_to_base,symbol,display_decimals,is_active")
    .eq("is_active", true)
    .order("family", { ascending: true })
    .order("factor_to_base", { ascending: true })
    .limit(500);
  const unitsList = (unitsData ?? []) as UnitRow[];

  const { data: employee } = await supabase
    .from("employees")
    .select("site_id")
    .eq("id", access.user.id)
    .single();

  const { data: settings } = await supabase
    .from("employee_settings")
    .select("selected_site_id")
    .eq("employee_id", access.user.id)
    .maybeSingle();

  const siteId = settings?.selected_site_id ?? employee?.site_id ?? "";

  const { data: locations } = siteId
    ? await supabase
        .from("inventory_locations")
        .select("id,code,zone,description")
        .eq("site_id", siteId)
        .order("code", { ascending: true })
        .limit(300)
    : { data: [] as LocRow[] };

  const pickDefaultLocationId = (rows: LocRow[]) => {
    const byKeyword = rows.find((loc) => {
      const code = (loc.code ?? "").toLowerCase();
      const zone = (loc.zone ?? "").toLowerCase();
      const desc = (loc.description ?? "").toLowerCase();
      return (
        code.includes("global") ||
        code.includes("almacen") ||
        code.includes("bodega") ||
        zone.includes("global") ||
        zone.includes("almacen") ||
        desc.includes("global") ||
        desc.includes("almacen")
      );
    });
    return byKeyword?.id ?? rows[0]?.id ?? "";
  };

  const { data: entries } = await supabase
    .from("inventory_entries")
    .select("id,supplier_name,invoice_number,status,received_at,created_at,site_id")
    .order("created_at", { ascending: false })
    .limit(25);

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id,name")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(300);

  const supplierRows = (suppliers ?? []) as SupplierRow[];
  const purchaseOrderId = String(sp.purchase_order_id ?? "").trim();
  let prefillSupplierId = "";
  let prefillInvoiceNumber = "";
  let prefillNotes = "";
  let prefillRows: Array<{
    product_id: string;
    quantity_declared: number;
    quantity_received: number;
    input_unit_code: string;
    input_unit_cost: number;
    purchase_order_item_id: string;
    cost_source: "po_prefill";
    notes: string;
  }> = [];

  if (purchaseOrderId) {
    const { data: poRow } = await supabase
      .from("purchase_orders")
      .select("id,supplier_id,site_id,notes")
      .eq("id", purchaseOrderId)
      .maybeSingle();
    const purchaseOrder = poRow as PurchaseOrderRow | null;
    if (purchaseOrder?.site_id && purchaseOrder.site_id === siteId) {
      prefillSupplierId = purchaseOrder.supplier_id ?? "";
      prefillInvoiceNumber = purchaseOrder.id;
      prefillNotes = purchaseOrder.notes ?? "";
      const { data: poItems } = await supabase
        .from("purchase_order_items")
        .select("id,product_id,quantity_ordered,quantity_received,unit_cost,unit")
        .eq("purchase_order_id", purchaseOrderId)
        .order("created_at", { ascending: true });
      const rawRows = (poItems ?? []) as PurchaseOrderItemRow[];
      prefillRows = rawRows
        .map((row) => {
          const ordered = Number(row.quantity_ordered ?? 0);
          const receivedQty = Number(row.quantity_received ?? 0);
          const pending = roundQuantity(Math.max(ordered - receivedQty, 0), 6);
          if (!row.product_id || pending <= 0) return null;
          return {
            product_id: row.product_id,
            quantity_declared: pending,
            quantity_received: pending,
            input_unit_code: normalizeUnitCode(row.unit || "un"),
            input_unit_cost: Number(row.unit_cost ?? 0),
            purchase_order_item_id: row.id,
            cost_source: "po_prefill" as const,
            notes: "",
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
    }
  }

  const entryRows = (entries ?? []) as EntryRow[];

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Entradas"
        subtitle="Recepción de insumos por factura. Permite recepción parcial por ítem."
      />

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">Error: {errorMsg}</div>
      ) : null}
      {okMsg ? (
        <div className="ui-alert ui-alert--success">Entrada creada correctamente.</div>
      ) : null}

      <EntriesForm
        products={productRows.map((row) => ({
          id: row.id,
          name: row.name,
          unit: row.unit,
          stock_unit_code: row.stock_unit_code,
          default_unit_cost: row.cost,
        }))}
        units={unitsList.map((unit) => ({
          code: unit.code,
          name: unit.name,
          family: unit.family,
          factor_to_base: unit.factor_to_base,
        }))}
        locations={(locations ?? []) as LocRow[]}
        defaultLocationId={pickDefaultLocationId((locations ?? []) as LocRow[])}
        suppliers={supplierRows}
        supplierCostRows={supplierCostRows}
        defaultUomProfiles={defaultUomProfiles}
        defaultSupplierId={prefillSupplierId || undefined}
        defaultInvoiceNumber={prefillInvoiceNumber || undefined}
        defaultNotes={prefillNotes || undefined}
        purchaseOrderId={purchaseOrderId || undefined}
        initialRows={prefillRows}
        action={createEntry}
      />

      <div className="ui-panel">
        <div className="ui-h3">Entradas recientes</div>
        <div className="mt-1 ui-body-muted">
          Últimas 25 entradas. El estado (Pendiente / Parcial / Recibida) se calcula según cantidades declaradas vs recibidas por ítem.
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="ui-table min-w-full text-sm">
            <thead className="text-left text-[var(--ui-muted)]">
              <tr>
                <th className="py-2 pr-4">Fecha</th>
                <th className="py-2 pr-4">Proveedor</th>
                <th className="py-2 pr-4">Factura</th>
                <th className="py-2 pr-4">Estado</th>
              </tr>
            </thead>
            <tbody>
              {entryRows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-200/60">
                  <td className="py-3 pr-4 font-mono">{row.received_at ?? row.created_at ?? ""}</td>
                  <td className="py-3 pr-4">{row.supplier_name ?? "-"}</td>
                  <td className="py-3 pr-4">{row.invoice_number ?? "-"}</td>
                  <td className="py-3 pr-4">
                    <span className={formatStatus(row.status).className}>
                      {formatStatus(row.status).label}
                    </span>
                  </td>
                </tr>
              ))}
              {!entryRows.length ? (
                <tr>
                  <td className="py-4 text-[var(--ui-muted)]" colSpan={4}>
                    No hay entradas registradas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
