import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { TransfersForm } from "@/components/vento/transfers-form";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  convertByProductProfile,
  normalizeUnitCode,
  roundQuantity,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
};

type StockProductRow = {
  location_id: string;
  product_id: string;
  current_qty: number | null;
  products: ProductRow | ProductRow[] | null;
};

type StockByLocationRow = {
  location_id: string;
  product_id: string;
  current_qty: number;
};

type LocRow = {
  id: string;
  code: string | null;
  description: string | null;
};

type TransferRow = {
  id: string;
  status: string | null;
  from_loc_id: string | null;
  to_loc_id: string | null;
  created_at: string | null;
};

type SearchParams = {
  error?: string;
  error_product_id?: string;
  ok?: string;
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
    case "completed":
      return { label: "Completado", className: "ui-chip ui-chip--success" };
    default:
      return { label: value || "Registrado", className: "ui-chip ui-chip--brand" };
  }
}

function normalizeProduct(value: StockProductRow["products"]): ProductRow | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function locLabel(loc: LocRow | null | undefined, fallback = "-") {
  if (!loc) return fallback;
  return String(loc.description ?? "").trim() || String(loc.code ?? "").trim() || loc.id;
}

function transferErrorUrl(message: string, productId?: string | null) {
  const params = new URLSearchParams({ error: message });
  const normalizedProductId = String(productId ?? "").trim();
  if (normalizedProductId) params.set("error_product_id", normalizedProductId);
  return `/inventory/transfers?${params.toString()}`;
}

async function createTransfer(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/transfers"));
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
    redirect("/inventory/transfers?error=" + encodeURIComponent("No tienes sede activa."));
  }

  const fromLocId = asText(formData.get("from_loc_id"));
  const toLocId = asText(formData.get("to_loc_id"));
  const notes = asText(formData.get("notes"));

  if (!fromLocId || !toLocId) {
    redirect("/inventory/transfers?error=" + encodeURIComponent("Debes seleccionar origen y destino."));
  }

  if (fromLocId === toLocId) {
    redirect("/inventory/transfers?error=" + encodeURIComponent("Origen y destino deben ser distintos."));
  }

  const { data: activeLocRows } = await supabase
    .from("inventory_locations")
    .select("id")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .in("id", [fromLocId, toLocId]);
  if ((activeLocRows ?? []).length !== 2) {
    redirect("/inventory/transfers?error=" + encodeURIComponent("Origen o destino ya no esta activo."));
  }

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
  const itemNotes = formData.getAll("item_notes").map((v) => String(v).trim());

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
    input_unit_code: string;
    conversion_factor_to_stock: number;
    stock_unit_code: string;
    notes: string | null;
  }> = [];
  let conversionErrorProductId = "";
  try {
    items = productIds
      .map((productId, idx) => {
        conversionErrorProductId = productId;
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
          input_unit_code: normalizeUnitCode(inputUnits[idx] || stockUnitCode),
          conversion_factor_to_stock: conversion.factorToStock,
          stock_unit_code: stockUnitCode,
          notes: itemNotes[idx] || null,
        };
      })
      .filter((item) => item.product_id && item.quantity > 0);
  } catch (error) {
    redirect(
      transferErrorUrl(
        error instanceof Error ? error.message : "Error en conversion de unidades.",
        conversionErrorProductId
      )
    );
  }

  if (items.length === 0) {
    redirect("/inventory/transfers?error=" + encodeURIComponent("Agrega al menos un item con cantidad > 0."));
  }

  // 5.1: validar que la cantidad total pedida no supere el stock disponible en el LOC origen.
  const productIdsForStock = [...new Set(items.map((i) => i.product_id))];
  const { data: stockRows } = await supabase
    .from("inventory_stock_by_location")
    .select("product_id, current_qty")
    .eq("location_id", fromLocId)
    .in("product_id", productIdsForStock);
  const stockByProduct = new Map(
    (stockRows ?? []).map((r: { product_id: string; current_qty?: number }) => [
      r.product_id,
      Number(r.current_qty ?? 0),
    ])
  );
  const requestedByProduct = new Map<string, number>();
  for (const item of items) {
    requestedByProduct.set(item.product_id, (requestedByProduct.get(item.product_id) ?? 0) + item.quantity);
  }
  for (const [productId, requestedQty] of requestedByProduct.entries()) {
    const availableAtOrigin = stockByProduct.get(productId) ?? 0;
    if (availableAtOrigin < requestedQty) {
      const item = items.find((candidate) => candidate.product_id === productId);
      redirect(
        transferErrorUrl(
          `No alcanza stock: solicitaste ${requestedQty} ${item?.stock_unit_code ?? "un"}, disponibles ${availableAtOrigin} ${item?.stock_unit_code ?? "un"}.`,
          productId
        )
      );
    }
  }

  const { data: transfer, error: transferErr } = await supabase
    .from("inventory_transfers")
    .insert({
      site_id: siteId,
      from_loc_id: fromLocId,
      to_loc_id: toLocId,
      status: "completed",
      notes: notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (transferErr || !transfer) {
    redirect("/inventory/transfers?error=" + encodeURIComponent(transferErr?.message ?? "No se pudo crear el traslado."));
  }

  const payload = items.map((item) => ({
    transfer_id: transfer.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit: item.stock_unit_code,
    input_qty: item.input_qty,
    input_unit_code: item.input_unit_code,
    conversion_factor_to_stock: item.conversion_factor_to_stock,
    stock_unit_code: item.stock_unit_code,
    notes: item.notes,
  }));

  const { error: itemsErr } = await supabase
    .from("inventory_transfer_items")
    .insert(payload);
  if (itemsErr) {
    redirect("/inventory/transfers?error=" + encodeURIComponent(itemsErr.message ?? "No se pudieron crear los items."));
  }

  const { data: locRows } = await supabase
    .from("inventory_locations")
    .select("id,code")
    .eq("is_active", true)
    .in("id", [fromLocId, toLocId]);
  type LocRow = { id: string; code?: string | null };
  const locMap = new Map(((locRows ?? []) as LocRow[]).map((l) => [l.id, l.code ?? l.id]));
  const fromCode = locMap.get(fromLocId) ?? fromLocId;
  const toCode = locMap.get(toLocId) ?? toLocId;

  const movementRows = items.map((item) => ({
    site_id: siteId,
    product_id: item.product_id,
    movement_type: "transfer_internal",
    quantity: item.quantity,
    input_qty: item.input_qty,
    input_unit_code: item.input_unit_code,
    conversion_factor_to_stock: item.conversion_factor_to_stock,
    stock_unit_code: item.stock_unit_code,
    note: `Traslado ${transfer.id} ${fromCode} -> ${toCode}`,
  }));

  const { error: moveErr } = await supabase
    .from("inventory_movements")
    .insert(movementRows);
  if (moveErr) {
    redirect("/inventory/transfers?error=" + encodeURIComponent(moveErr.message));
  }

  for (const item of items) {
    const { error: positionErr } = await supabase.rpc("consume_inventory_stock_from_positions", {
      p_location_id: fromLocId,
      p_product_id: item.product_id,
      p_quantity: item.quantity,
      p_created_by: user.id,
      p_note: `Traslado interno ${fromCode} -> ${toCode}: menor stock primero`,
    });
    if (positionErr) {
      redirect(transferErrorUrl(positionErr.message, item.product_id));
    }

    const { error: fromErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
      p_location_id: fromLocId,
      p_product_id: item.product_id,
      p_delta: -item.quantity,
    });
    if (fromErr) {
      redirect(transferErrorUrl(fromErr.message, item.product_id));
    }

    const { error: toErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
      p_location_id: toLocId,
      p_product_id: item.product_id,
      p_delta: item.quantity,
    });
    if (toErr) {
      redirect(transferErrorUrl(toErr.message, item.product_id));
    }
  }

  redirect("/inventory/transfers?ok=created");
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const errorProductId = sp.error_product_id ? String(sp.error_product_id).trim() : "";
  const okMsg = sp.ok ? safeDecodeURIComponent(sp.ok) : "";

  const access = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/transfers",
    permissionCode: "inventory.transfers",
  });

  const supabase = access.supabase;

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
        .select("id,code,description")
        .eq("site_id", siteId)
        .eq("is_active", true)
        .order("code", { ascending: true })
        .limit(200)
    : { data: [] as LocRow[] };

  const locationIds = ((locations ?? []) as LocRow[]).map((loc) => loc.id);
  const { data: stockData } = locationIds.length
    ? await supabase
        .from("inventory_stock_by_location")
        .select("location_id,product_id,current_qty,products(id,name,unit,stock_unit_code)")
        .in("location_id", locationIds)
        .gt("current_qty", 0)
    : { data: [] as StockProductRow[] };

  const stockRowsForForm = (stockData ?? []) as unknown as StockProductRow[];
  const productById = new Map<string, ProductRow>();
  for (const row of stockRowsForForm) {
    const product = normalizeProduct(row.products);
    if (product) productById.set(product.id, product);
  }

  const productRows = Array.from(productById.values()).sort((a, b) =>
    String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), "es")
  );
  const stockByLocation: StockByLocationRow[] = stockRowsForForm.map((row) => ({
    location_id: row.location_id,
    product_id: row.product_id,
    current_qty: Number(row.current_qty ?? 0),
  }));
  const productIds = productRows.map((row) => row.id);
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

  const { data: transfers } = await supabase
    .from("inventory_transfers")
    .select("id,status,from_loc_id,to_loc_id,created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  const transferRows = (transfers ?? []) as TransferRow[];
  const locMap = new Map(
    ((locations ?? []) as LocRow[]).map((loc) => [loc.id, locLabel(loc)])
  );
  const completedTransfers = transferRows.filter((row) => row.status === "completed").length;

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <a href="/inventory/stock" className="ui-caption underline">Volver a stock</a>
              <h1 className="ui-h1">Traslados internos</h1>
              <p className="ui-body-muted">
                Mueve inventario entre areas dentro de la misma sede con un flujo corto y directo.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                Misma sede
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {(locations ?? []).length} areas
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {productRows.length} productos
              </span>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Areas activas</div>
              <div className="ui-remission-kpi-value">{(locations ?? []).length}</div>
              <div className="ui-remission-kpi-note">Origen y destino disponibles para mover inventario</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Productos</div>
              <div className="ui-remission-kpi-value">{productRows.length}</div>
              <div className="ui-remission-kpi-note">Listado operativo disponible para capturar traslado</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Completados</div>
              <div className="ui-remission-kpi-value">{completedTransfers}</div>
              <div className="ui-remission-kpi-note">Traslados cerrados dentro del historial reciente</div>
            </article>
          </div>
        </div>
      </section>

      {errorMsg && !errorProductId ? (
        <div className="ui-alert ui-alert--error">Error: {errorMsg}</div>
      ) : null}
      {okMsg ? (
        <div className="ui-alert ui-alert--success">Traslado registrado correctamente.</div>
      ) : null}

      <TransfersForm
        locations={(locations ?? []) as LocRow[]}
        products={productRows}
        stockByLocation={stockByLocation}
        defaultUomProfiles={defaultUomProfiles}
        errorMessage={errorMsg}
        errorProductId={errorProductId}
        clearDraft={okMsg === "created"}
        action={createTransfer}
      />

      <div className="ui-panel ui-remission-section ui-fade-up ui-delay-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Traslados recientes</div>
            <div className="mt-1 ui-body-muted">Ultimos 25 traslados registrados.</div>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
            Completados {completedTransfers}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="ui-table min-w-full text-sm">
            <thead className="text-left text-[var(--ui-muted)]">
              <tr>
                <th className="py-2 pr-4">Fecha</th>
                <th className="py-2 pr-4">Origen</th>
                <th className="py-2 pr-4">Destino</th>
                <th className="py-2 pr-4">Estado</th>
              </tr>
            </thead>
            <tbody>
              {transferRows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-200/60">
                  <td className="py-3 pr-4 font-mono">{row.created_at ?? "-"}</td>
                  <td className="py-3 pr-4">{locMap.get(row.from_loc_id ?? "") ?? row.from_loc_id ?? "-"}</td>
                  <td className="py-3 pr-4">{locMap.get(row.to_loc_id ?? "") ?? row.to_loc_id ?? "-"}</td>
                  <td className="py-3 pr-4">
                    <span className={formatStatus(row.status).className}>
                      {formatStatus(row.status).label}
                    </span>
                  </td>
                </tr>
              ))}
              {!transferRows.length ? (
                <tr>
                  <td className="py-4 text-[var(--ui-muted)]" colSpan={4}>
                    No hay traslados registrados.
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
