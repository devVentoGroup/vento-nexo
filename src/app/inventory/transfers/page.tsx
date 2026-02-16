import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { TransfersForm } from "@/components/vento/transfers-form";
import { PageHeader } from "@/components/vento/standard/page-header";
import { buildShellLoginUrl } from "@/lib/auth/sso";
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

type ProductProfileWithProduct = {
  product_id: string;
  products: ProductRow | null;
};

type LocRow = {
  id: string;
  code: string | null;
  name: string | null;
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
          "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source"
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
          input_unit_code: normalizeUnitCode(inputUnits[idx] || stockUnitCode),
          conversion_factor_to_stock: conversion.factorToStock,
          stock_unit_code: stockUnitCode,
          notes: itemNotes[idx] || null,
        };
      })
      .filter((item) => item.product_id && item.quantity > 0);
  } catch (error) {
    redirect(
      "/inventory/transfers?error=" +
        encodeURIComponent(
          error instanceof Error ? error.message : "Error en conversion de unidades."
        )
    );
  }

  if (items.length === 0) {
    redirect("/inventory/transfers?error=" + encodeURIComponent("Agrega al menos un ítem con cantidad > 0."));
  }

  // 5.1: validar que cantidad ≤ stock disponible en LOC origen
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
  for (const item of items) {
    const availableAtOrigin = stockByProduct.get(item.product_id) ?? 0;
    if (availableAtOrigin < item.quantity) {
      redirect(
        "/inventory/transfers?error=" +
          encodeURIComponent(
            `No alcanza stock: solicitaste ${item.input_qty} ${item.input_unit_code} (${item.quantity} ${item.stock_unit_code}), disponibles ${availableAtOrigin} ${item.stock_unit_code}.`
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
    redirect("/inventory/transfers?error=" + encodeURIComponent(itemsErr.message ?? "No se pudieron crear los ítems."));
  }

  const { data: locRows } = await supabase
    .from("inventory_locations")
    .select("id,code")
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
    const { error: fromErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
      p_location_id: fromLocId,
      p_product_id: item.product_id,
      p_delta: -item.quantity,
    });
    if (fromErr) {
      redirect("/inventory/transfers?error=" + encodeURIComponent(fromErr.message));
    }

    const { error: toErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
      p_location_id: toLocId,
      p_product_id: item.product_id,
      p_delta: item.quantity,
    });
    if (toErr) {
      redirect("/inventory/transfers?error=" + encodeURIComponent(toErr.message));
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
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";
  const okMsg = sp.ok ? decodeURIComponent(sp.ok) : "";

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
        .select("id,code,name")
        .eq("site_id", siteId)
        .order("code", { ascending: true })
        .limit(200)
    : { data: [] as LocRow[] };

  const { data: products } = await supabase
    .from("product_inventory_profiles")
    .select("product_id, products(id,name,unit,stock_unit_code)")
    .eq("track_inventory", true)
    .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
    .order("name", { foreignTable: "products", ascending: true })
    .limit(400);

  const productRows = ((products ?? []) as unknown as ProductProfileWithProduct[])
    .map((row) => row.products)
    .filter((row): row is ProductRow => Boolean(row));
  const productIds = productRows.map((row) => row.id);
  const { data: uomProfilesData } = productIds.length
    ? await supabase
        .from("product_uom_profiles")
        .select(
          "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source"
        )
        .in("product_id", productIds)
        .eq("is_default", true)
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
    ((locations ?? []) as LocRow[]).map((loc) => [loc.id, loc.code ?? loc.name ?? loc.id])
  );

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Traslados internos"
        subtitle="Movimientos entre LOCs dentro de la misma sede."
      />

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">Error: {errorMsg}</div>
      ) : null}
      {okMsg ? (
        <div className="ui-alert ui-alert--success">Traslado registrado correctamente.</div>
      ) : null}

      <TransfersForm
        locations={(locations ?? []) as LocRow[]}
        products={productRows}
        defaultUomProfiles={defaultUomProfiles}
        action={createTransfer}
      />

      <div className="ui-panel">
        <div className="ui-h3">Traslados recientes</div>
        <div className="mt-1 ui-body-muted">Últimos 25 traslados registrados.</div>

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
