import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { KioskWithdrawForm } from "@/components/vento/kiosk-withdraw-form";
import { requireAppAccess } from "@/lib/auth/guard";
import {
  convertByProductProfile,
  normalizeUnitCode,
  roundQuantity,
  type ProductUomProfile,
} from "@/lib/inventory/uom";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { safeDecodeURIComponent } from "@/lib/url";

export const dynamic = "force-dynamic";

type Params = { id: string };
type SearchParams = {
  error?: string;
  error_product_id?: string;
  kiosk?: string;
  ok?: string;
  product_id?: string;
};

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
};

type StockRow = {
  product_id: string;
  current_qty: number | null;
  products: ProductRow | ProductRow[] | null;
};

type LocationRow = {
  id: string;
  code: string | null;
  description: string | null;
  zone: string | null;
  site_id: string | null;
};

type ParsedKioskWithdrawItem = {
  product_id: string;
  quantity: number;
  input_qty: number;
  input_unit_code: string;
  input_uom_profile_id: string;
  conversion_factor_to_stock: number;
  stock_unit_code: string;
  note: string | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeProduct(value: StockRow["products"]): ProductRow | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function locLabel(loc: Pick<LocationRow, "id" | "code" | "description" | "zone"> | null | undefined) {
  if (!loc) return "LOC";
  return String(loc.description ?? "").trim() || String(loc.zone ?? "").trim() || String(loc.code ?? "").trim() || loc.id;
}

function errorUrl(sourceLocationId: string, message: string, productId?: string | null) {
  const params = new URLSearchParams({ error: message, kiosk: "1" });
  const normalizedProductId = String(productId ?? "").trim();
  if (normalizedProductId) params.set("error_product_id", normalizedProductId);
  return `/inventory/locations/${encodeURIComponent(sourceLocationId)}/kiosk-withdraw?${params.toString()}`;
}

async function submitKioskWithdraw(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  const sourceLocationId = asText(formData.get("source_location_id"));
  const returnTo = asText(formData.get("return_to"));
  const fallbackRoute = sourceLocationId
    ? `/inventory/locations/${encodeURIComponent(sourceLocationId)}/kiosk-withdraw?kiosk=1`
    : "/inventory/stock";

  if (!user) {
    redirect(await buildShellLoginUrl(fallbackRoute));
  }

  if (!sourceLocationId) {
    redirect("/inventory/stock?error=" + encodeURIComponent("Falta el LOC de origen."));
  }

  const employeeId = asText(formData.get("employee_id"));
  const notes = asText(formData.get("notes"));

  const itemProductIds = formData.getAll("item_product_id").map((value) => String(value).trim());
  const itemQuantities = formData.getAll("item_quantity").map((value) => String(value).trim());
  const itemInputUnits = formData
    .getAll("item_input_unit_code")
    .map((value) => normalizeUnitCode(String(value).trim()));
  const itemInputUomProfileIds = formData
    .getAll("item_input_uom_profile_id")
    .map((value) => String(value).trim());
  const itemNotes = formData.getAll("item_notes").map((value) => String(value).trim());

  const hasCartItems = itemProductIds.some((productId) => Boolean(productId));

  const rawItems = hasCartItems
    ? itemProductIds.map((productId, index) => ({
      product_id: productId,
      input_qty: roundQuantity(parseNumber(itemQuantities[index] ?? "0")),
      input_unit_code: normalizeUnitCode(itemInputUnits[index] ?? ""),
      input_uom_profile_id: itemInputUomProfileIds[index] ?? "",
      note: itemNotes[index] || null,
    }))
    : [
      {
        product_id: asText(formData.get("product_id")),
        input_qty: roundQuantity(parseNumber(asText(formData.get("quantity")))),
        input_unit_code: normalizeUnitCode(asText(formData.get("input_unit_code"))),
        input_uom_profile_id: asText(formData.get("input_uom_profile_id")),
        note: notes || null,
      },
    ];

  const normalizedRawItems = rawItems.filter((item) => item.product_id || item.input_qty > 0);
  const firstProductId = normalizedRawItems[0]?.product_id ?? "";

  if (!employeeId) {
    redirect(errorUrl(sourceLocationId, "Selecciona trabajador.", firstProductId));
  }

  if (normalizedRawItems.length === 0) {
    redirect(errorUrl(sourceLocationId, "Agrega al menos un producto.", firstProductId));
  }

  for (const item of normalizedRawItems) {
    if (!item.product_id || item.input_qty <= 0) {
      redirect(errorUrl(sourceLocationId, "Cada producto debe tener cantidad mayor a cero.", item.product_id));
    }
  }

  const { data: sourceLoc } = await supabase
    .from("inventory_locations")
    .select("id,code,description,zone,site_id")
    .eq("id", sourceLocationId)
    .eq("is_active", true)
    .maybeSingle();
  const source = (sourceLoc ?? null) as LocationRow | null;

  if (!source?.site_id) {
    redirect(errorUrl(sourceLocationId, "El LOC de origen no esta activo o no tiene sede.", firstProductId));
  }

  const { data: assignmentData } = await supabase
    .from("employee_inventory_location_assignments")
    .select("employee_id,site_id,location_id,location:inventory_locations(id,code,description,zone,site_id)")
    .eq("employee_id", employeeId)
    .eq("site_id", source.site_id)
    .eq("purpose", "kiosk_withdraw")
    .eq("is_active", true)
    .maybeSingle();
  const assignment = (assignmentData ?? null) as {
    employee_id: string;
    site_id: string;
    location_id: string;
    location?: LocationRow | LocationRow[] | null;
  } | null;

  if (assignment?.location_id === sourceLocationId) {
    redirect(errorUrl(sourceLocationId, "El LOC destino del trabajador no puede ser el mismo origen.", firstProductId));
  }

  const { data: employeeData } = await supabase
    .from("employees")
    .select("id,full_name,alias")
    .eq("id", employeeId)
    .maybeSingle();
  const employeeLabel = String(employeeData?.alias ?? employeeData?.full_name ?? employeeId).trim();

  const productIdsForLookup = Array.from(new Set(normalizedRawItems.map((item) => item.product_id).filter(Boolean)));
  const { data: productsData } = productIdsForLookup.length
    ? await supabase
      .from("products")
      .select("id,unit,stock_unit_code")
      .in("id", productIdsForLookup)
    : { data: [] as ProductRow[] };

  const productMap = new Map(((productsData ?? []) as ProductRow[]).map((product) => [product.id, product]));

  const requestedUomProfileIds = Array.from(
    new Set(normalizedRawItems.map((item) => item.input_uom_profile_id).filter(Boolean))
  );

  const { data: uomProfilesData } = requestedUomProfileIds.length
    ? await supabase
      .from("product_uom_profiles")
      .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context")
      .in("id", requestedUomProfileIds)
      .eq("is_active", true)
    : { data: [] as ProductUomProfile[] };

  const uomProfileById = new Map(
    ((uomProfilesData ?? []) as ProductUomProfile[]).map((profile) => [profile.id, profile])
  );

  const items: ParsedKioskWithdrawItem[] = [];

  for (const rawItem of normalizedRawItems) {
    const product = productMap.get(rawItem.product_id) ?? null;
    if (!product) {
      redirect(errorUrl(sourceLocationId, "Producto no encontrado.", rawItem.product_id));
    }

    const stockUnitCode = normalizeUnitCode(product.stock_unit_code || product.unit || "un");
    const selectedProfile = rawItem.input_uom_profile_id
      ? uomProfileById.get(rawItem.input_uom_profile_id) ?? null
      : null;

    if (rawItem.input_uom_profile_id && (!selectedProfile || selectedProfile.product_id !== rawItem.product_id)) {
      redirect(errorUrl(sourceLocationId, "Perfil de unidad invalido para el producto.", rawItem.product_id));
    }

    try {
      const conversion = convertByProductProfile({
        quantityInInput: rawItem.input_qty,
        inputUnitCode: rawItem.input_unit_code || stockUnitCode,
        stockUnitCode,
        profile: selectedProfile,
      });

      items.push({
        product_id: rawItem.product_id,
        quantity: conversion.quantityInStock,
        input_qty: rawItem.input_qty,
        input_unit_code: rawItem.input_unit_code || stockUnitCode,
        input_uom_profile_id: rawItem.input_uom_profile_id,
        conversion_factor_to_stock: conversion.factorToStock,
        stock_unit_code: stockUnitCode,
        note: rawItem.note,
      });
    } catch (error) {
      redirect(
        errorUrl(
          sourceLocationId,
          error instanceof Error ? error.message : "Error en conversion de unidades.",
          rawItem.product_id
        )
      );
    }
  }

  if (items.length === 0) {
    redirect(errorUrl(sourceLocationId, "Agrega al menos un producto valido.", firstProductId));
  }

  const requestedByProduct = new Map<
    string,
    {
      product_id: string;
      quantity: number;
      stock_unit_code: string;
      input_summary: string;
    }
  >();

  for (const item of items) {
    const current = requestedByProduct.get(item.product_id) ?? {
      product_id: item.product_id,
      quantity: 0,
      stock_unit_code: item.stock_unit_code,
      input_summary: "",
    };

    current.quantity += item.quantity;
    current.input_summary = current.input_summary
      ? `${current.input_summary}, ${item.input_qty} ${item.input_unit_code}`
      : `${item.input_qty} ${item.input_unit_code}`;

    requestedByProduct.set(item.product_id, current);
  }

  for (const requested of requestedByProduct.values()) {
    const { data: stockLoc } = await supabase
      .from("inventory_stock_by_location")
      .select("current_qty")
      .eq("location_id", sourceLocationId)
      .eq("product_id", requested.product_id)
      .maybeSingle();

    const availableAtLoc = Number((stockLoc as { current_qty?: number } | null)?.current_qty ?? 0);
    if (availableAtLoc < requested.quantity) {
      redirect(
        errorUrl(
          sourceLocationId,
          `No alcanza stock: solicitaste ${requested.input_summary}, disponibles ${availableAtLoc} ${requested.stock_unit_code}.`,
          requested.product_id
        )
      );
    }
  }

  const destination = Array.isArray(assignment?.location)
    ? assignment.location[0] ?? null
    : assignment?.location ?? null;
  const fromLabel = locLabel(source);
  const hasDestination = Boolean(assignment?.location_id);
  const toLabel = hasDestination ? locLabel(destination) : "sin destino";

  let transferId = "";

  if (hasDestination) {
    const itemCountLabel = items.length === 1 ? "1 producto" : `${items.length} productos`;

    const { data: transfer, error: transferErr } = await supabase
      .from("inventory_transfers")
      .insert({
        site_id: source.site_id,
        from_loc_id: sourceLocationId,
        to_loc_id: assignment!.location_id,
        status: "completed",
        notes: notes
          ? `Quiosco: ${employeeLabel}. ${itemCountLabel}. ${notes}`
          : `Quiosco: traslado confirmado por ${employeeLabel}. ${itemCountLabel}.`,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (transferErr || !transfer) {
      redirect(errorUrl(sourceLocationId, transferErr?.message ?? "No se pudo crear el traslado.", firstProductId));
    }

    transferId = String(transfer.id);

    const { error: itemErr } = await supabase.from("inventory_transfer_items").insert(
      items.map((item) => ({
        transfer_id: transfer.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit: item.stock_unit_code,
        input_qty: item.input_qty,
        input_unit_code: item.input_unit_code,
        conversion_factor_to_stock: item.conversion_factor_to_stock,
        stock_unit_code: item.stock_unit_code,
        notes: item.note,
      }))
    );

    if (itemErr) {
      redirect(errorUrl(sourceLocationId, itemErr.message, firstProductId));
    }
  }

  for (const item of items) {
    const { error: positionErr } = await supabase.rpc("consume_inventory_stock_from_positions", {
      p_location_id: sourceLocationId,
      p_product_id: item.product_id,
      p_quantity: item.quantity,
      p_created_by: user.id,
      p_note: hasDestination
        ? `Quiosco ${fromLabel} -> ${toLabel}: menor stock primero`
        : `Quiosco retiro ${fromLabel}: menor stock primero`,
    });

    if (positionErr) {
      redirect(errorUrl(sourceLocationId, positionErr.message, item.product_id));
    }

    const { error: fromErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
      p_location_id: sourceLocationId,
      p_product_id: item.product_id,
      p_delta: -item.quantity,
    });

    if (fromErr) {
      redirect(errorUrl(sourceLocationId, fromErr.message, item.product_id));
    }

    if (hasDestination) {
      const { error: movementErr } = await supabase.from("inventory_movements").insert({
        site_id: source.site_id,
        product_id: item.product_id,
        movement_type: "transfer_internal",
        quantity: item.quantity,
        input_qty: item.input_qty,
        input_unit_code: item.input_unit_code,
        conversion_factor_to_stock: item.conversion_factor_to_stock,
        stock_unit_code: item.stock_unit_code,
        note: item.note
          ? `Quiosco ${transferId}: ${employeeLabel} traslado ${fromLabel} -> ${toLabel}. ${item.note}`
          : `Quiosco ${transferId}: ${employeeLabel} traslado ${fromLabel} -> ${toLabel}`,
        created_by: user.id,
      });

      if (movementErr) {
        redirect(errorUrl(sourceLocationId, movementErr.message, item.product_id));
      }

      const { error: toErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
        p_location_id: assignment!.location_id,
        p_product_id: item.product_id,
        p_delta: item.quantity,
      });

      if (toErr) {
        redirect(errorUrl(sourceLocationId, toErr.message, item.product_id));
      }
    } else {
      const { error: movementErr } = await supabase.from("inventory_movements").insert({
        site_id: source.site_id,
        product_id: item.product_id,
        movement_type: "consumption",
        quantity: -item.quantity,
        input_qty: item.input_qty,
        input_unit_code: item.input_unit_code,
        conversion_factor_to_stock: item.conversion_factor_to_stock,
        stock_unit_code: item.stock_unit_code,
        note: item.note
          ? `Quiosco retiro ${fromLabel}: ${employeeLabel}. ${item.note}`
          : `Quiosco retiro ${fromLabel}: ${employeeLabel} sin LOC destino`,
        created_by: user.id,
      });

      if (movementErr) {
        redirect(errorUrl(sourceLocationId, movementErr.message, item.product_id));
      }

      const { data: siteStock } = await supabase
        .from("inventory_stock_by_site")
        .select("current_qty")
        .eq("site_id", source.site_id)
        .eq("product_id", item.product_id)
        .maybeSingle();

      const currentQty = Number((siteStock as { current_qty?: number } | null)?.current_qty ?? 0);
      const newQty = Math.max(0, currentQty - item.quantity);

      const { error: siteErr } = await supabase
        .from("inventory_stock_by_site")
        .upsert(
          {
            site_id: source.site_id,
            product_id: item.product_id,
            current_qty: newQty,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "site_id,product_id" }
        );

      if (siteErr) {
        redirect(errorUrl(sourceLocationId, siteErr.message, item.product_id));
      }
    }
  }

  const redirectTarget = returnTo || `/inventory/locations/${encodeURIComponent(sourceLocationId)}/board?kiosk=1`;
  const joiner = redirectTarget.includes("?") ? "&" : "?";
  redirect(`${redirectTarget}${joiner}ok=kiosk_withdraw`);
}

export default async function KioskWithdrawPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMessage = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const errorProductId = sp.error_product_id ? String(sp.error_product_id).trim() : "";
  const initialProductId = sp.product_id ? String(sp.product_id).trim() : "";
  const returnTo = `/inventory/locations/${encodeURIComponent(id)}/board?kiosk=1`;

  if (!initialProductId) {
    redirect(returnTo);
  }

  const { supabase } = await requireAppAccess({
    appId: "nexo",
    returnTo: `/inventory/locations/${id}/kiosk-withdraw?kiosk=1`,
    permissionCode: ["inventory.transfers", "inventory.withdraw"],
  });

  const { data: locationData } = await supabase
    .from("inventory_locations")
    .select("id,code,description,zone,site_id")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  const location = (locationData ?? null) as LocationRow | null;
  if (!location?.site_id) notFound();

  const { data: stockData } = await supabase
    .from("inventory_stock_by_location")
    .select("product_id,current_qty,products(id,name,unit,stock_unit_code)")
    .eq("location_id", id)
    .gt("current_qty", 0)
    .order("current_qty", { ascending: false });
  const stockRows = (stockData ?? []) as unknown as StockRow[];
  const products = stockRows
    .map((row) => {
      const product = normalizeProduct(row.products);
      if (!product) return null;
      return {
        ...product,
        available_qty: Number(row.current_qty ?? 0),
      };
    })
    .filter((row): row is ProductRow & { available_qty: number } => Boolean(row))
    .sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), "es", { sensitivity: "base" }));
  const selectedProduct = products.find((product) => product.id === initialProductId) ?? null;

  if (!selectedProduct) {
    redirect(returnTo);
  }

  const productIds = [selectedProduct.id];
  const { data: uomProfilesData } = productIds.length
    ? await supabase
      .from("product_uom_profiles")
      .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context")
      .in("product_id", productIds)
      .eq("is_active", true)
    : { data: [] as ProductUomProfile[] };

  const { data: workersData, error: workersError } = await supabase.rpc("nexo_kiosk_withdraw_workers", {
    p_source_location_id: id,
  });
  const workers = ((workersData ?? []) as Array<{
    employee_id: string;
    label: string | null;
    role: string | null;
    destination_label: string | null;
    has_destination: boolean | null;
  }>).map((worker) => ({
    employee_id: worker.employee_id,
    label: String(worker.label ?? worker.employee_id).trim(),
    role: worker.role ?? null,
    destination_label: String(worker.destination_label ?? "Sin destino (descuento)").trim(),
    has_destination: worker.has_destination === true,
  }));

  const title = locLabel(location);

  return (
    <div className="ui-scene w-full space-y-5 px-4 py-5">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.35fr_0.9fr] lg:items-start">
          <div className="space-y-4">
            <Link href={returnTo} className="ui-caption underline">
              Volver al kiosco
            </Link>
            <div className="space-y-2">
              <div className="ui-caption">Quiosco operativo</div>
              <h1 className="ui-h1">{title}</h1>
              <p className="ui-body-muted">
                Selecciona quien retira. Si tiene LOC asignado, NEXO traslada; si no, descuenta del inventario.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                Origen {title}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {products.length} productos
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {workers.length} trabajadores disponibles
              </span>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Confirmacion</div>
              <div className="ui-remission-kpi-value">Trabajador</div>
              <div className="ui-remission-kpi-note">Sin PIN personal</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Movimiento</div>
              <div className="ui-remission-kpi-value">LOC / retiro</div>
              <div className="ui-remission-kpi-note">Destino asignado o descuento directo</div>
            </article>
          </div>
        </div>
      </section>

      {errorMessage && !errorProductId ? (
        <div className="ui-alert ui-alert--error">Error: {errorMessage}</div>
      ) : null}

      {workersError ? (
        <div className="ui-alert ui-alert--error">
          Error cargando trabajadores: {workersError.message}
        </div>
      ) : null}

      {!workersError && workers.length === 0 ? (
        <div className="ui-alert ui-alert--neutral">
          No hay trabajadores activos para esta sede.
        </div>
      ) : null}

      <KioskWithdrawForm
        key={initialProductId || "blank"}
        sourceLocationId={id}
        returnTo={returnTo}
        products={products}
        workers={workers}
        uomProfiles={(uomProfilesData ?? []) as ProductUomProfile[]}
        errorMessage={errorMessage}
        errorProductId={errorProductId}
        initialProductId={initialProductId}
        action={submitKioskWithdraw}
      />
    </div>
  );
}
