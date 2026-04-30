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
type SearchParams = { error?: string; error_product_id?: string; ok?: string };

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
  const params = new URLSearchParams({ error: message });
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
    ? `/inventory/locations/${encodeURIComponent(sourceLocationId)}/kiosk-withdraw`
    : "/inventory/stock";

  if (!user) {
    redirect(await buildShellLoginUrl(fallbackRoute));
  }

  if (!sourceLocationId) {
    redirect("/inventory/stock?error=" + encodeURIComponent("Falta el LOC de origen."));
  }

  const employeeId = asText(formData.get("employee_id"));
  const pin = asText(formData.get("pin"));
  const productId = asText(formData.get("product_id"));
  const quantityInInput = roundQuantity(parseNumber(asText(formData.get("quantity"))));
  const inputUnitCode = normalizeUnitCode(asText(formData.get("input_unit_code")));
  const inputUomProfileId = asText(formData.get("input_uom_profile_id"));
  const notes = asText(formData.get("notes"));

  if (!employeeId || !pin) {
    redirect(errorUrl(sourceLocationId, "Selecciona trabajador e ingresa su PIN.", productId));
  }
  if (!productId || quantityInInput <= 0) {
    redirect(errorUrl(sourceLocationId, "Selecciona producto y cantidad mayor a cero.", productId));
  }

  const { data: sourceLoc } = await supabase
    .from("inventory_locations")
    .select("id,code,description,zone,site_id")
    .eq("id", sourceLocationId)
    .eq("is_active", true)
    .maybeSingle();
  const source = (sourceLoc ?? null) as LocationRow | null;
  if (!source?.site_id) {
    redirect(errorUrl(sourceLocationId, "El LOC de origen no esta activo o no tiene sede.", productId));
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

  if (!assignment?.location_id) {
    redirect(errorUrl(sourceLocationId, "Este trabajador no tiene LOC de retiro asignado en VISO.", productId));
  }
  if (assignment.location_id === sourceLocationId) {
    redirect(errorUrl(sourceLocationId, "El LOC destino del trabajador no puede ser el mismo origen.", productId));
  }

  const { data: pinOk, error: pinError } = await supabase.rpc("verify_employee_kiosk_pin", {
    p_employee_id: employeeId,
    p_pin: pin,
  });
  if (pinError || pinOk !== true) {
    redirect(errorUrl(sourceLocationId, "PIN incorrecto o trabajador inactivo.", productId));
  }

  const { data: employeeData } = await supabase
    .from("employees")
    .select("id,full_name,alias")
    .eq("id", employeeId)
    .maybeSingle();
  const employeeLabel = String(employeeData?.alias ?? employeeData?.full_name ?? employeeId).trim();

  const { data: productData } = await supabase
    .from("products")
    .select("id,unit,stock_unit_code")
    .eq("id", productId)
    .maybeSingle();
  const product = (productData ?? null) as ProductRow | null;
  const stockUnitCode = normalizeUnitCode(product?.stock_unit_code || product?.unit || "un");

  const { data: profileData } = inputUomProfileId
    ? await supabase
        .from("product_uom_profiles")
        .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context")
        .eq("id", inputUomProfileId)
        .eq("product_id", productId)
        .eq("is_active", true)
        .maybeSingle()
    : { data: null as ProductUomProfile | null };
  const selectedProfile = (profileData ?? null) as ProductUomProfile | null;

  let quantityInStock = 0;
  let conversionFactorToStock = 1;
  try {
    const conversion = convertByProductProfile({
      quantityInInput,
      inputUnitCode: inputUnitCode || stockUnitCode,
      stockUnitCode,
      profile: selectedProfile,
    });
    quantityInStock = conversion.quantityInStock;
    conversionFactorToStock = conversion.factorToStock;
  } catch (error) {
    redirect(
      errorUrl(
        sourceLocationId,
        error instanceof Error ? error.message : "Error en conversion de unidades.",
        productId
      )
    );
  }

  const { data: stockLoc } = await supabase
    .from("inventory_stock_by_location")
    .select("current_qty")
    .eq("location_id", sourceLocationId)
    .eq("product_id", productId)
    .maybeSingle();
  const availableAtLoc = Number((stockLoc as { current_qty?: number } | null)?.current_qty ?? 0);
  if (availableAtLoc < quantityInStock) {
    redirect(
      errorUrl(
        sourceLocationId,
        `No alcanza stock: solicitaste ${quantityInInput} ${inputUnitCode || stockUnitCode}, disponibles ${availableAtLoc} ${stockUnitCode}.`,
        productId
      )
    );
  }

  const destination = Array.isArray(assignment.location)
    ? assignment.location[0] ?? null
    : assignment.location ?? null;
  const fromLabel = locLabel(source);
  const toLabel = locLabel(destination);

  const { data: transfer, error: transferErr } = await supabase
    .from("inventory_transfers")
    .insert({
      site_id: source.site_id,
      from_loc_id: sourceLocationId,
      to_loc_id: assignment.location_id,
      status: "completed",
      notes: notes
        ? `Quiosco: ${employeeLabel}. ${notes}`
        : `Quiosco: retiro confirmado por ${employeeLabel}.`,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (transferErr || !transfer) {
    redirect(errorUrl(sourceLocationId, transferErr?.message ?? "No se pudo crear el traslado.", productId));
  }

  const { error: itemErr } = await supabase.from("inventory_transfer_items").insert({
    transfer_id: transfer.id,
    product_id: productId,
    quantity: quantityInStock,
    unit: stockUnitCode,
    input_qty: quantityInInput,
    input_unit_code: inputUnitCode || stockUnitCode,
    conversion_factor_to_stock: conversionFactorToStock,
    stock_unit_code: stockUnitCode,
    notes: notes || null,
  });
  if (itemErr) {
    redirect(errorUrl(sourceLocationId, itemErr.message, productId));
  }

  const { error: movementErr } = await supabase.from("inventory_movements").insert({
    site_id: source.site_id,
    product_id: productId,
    movement_type: "transfer_internal",
    quantity: quantityInStock,
    input_qty: quantityInInput,
    input_unit_code: inputUnitCode || stockUnitCode,
    conversion_factor_to_stock: conversionFactorToStock,
    stock_unit_code: stockUnitCode,
    note: `Quiosco ${transfer.id}: ${employeeLabel} retiro ${fromLabel} -> ${toLabel}`,
    created_by: user.id,
  });
  if (movementErr) {
    redirect(errorUrl(sourceLocationId, movementErr.message, productId));
  }

  const { error: positionErr } = await supabase.rpc("consume_inventory_stock_from_positions", {
    p_location_id: sourceLocationId,
    p_product_id: productId,
    p_quantity: quantityInStock,
    p_created_by: user.id,
    p_note: `Quiosco ${fromLabel} -> ${toLabel}: menor stock primero`,
  });
  if (positionErr) {
    redirect(errorUrl(sourceLocationId, positionErr.message, productId));
  }

  const { error: fromErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
    p_location_id: sourceLocationId,
    p_product_id: productId,
    p_delta: -quantityInStock,
  });
  if (fromErr) {
    redirect(errorUrl(sourceLocationId, fromErr.message, productId));
  }

  const { error: toErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
    p_location_id: assignment.location_id,
    p_product_id: productId,
    p_delta: quantityInStock,
  });
  if (toErr) {
    redirect(errorUrl(sourceLocationId, toErr.message, productId));
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
  const clearDraft = sp.ok === "1";

  const { supabase } = await requireAppAccess({
    appId: "nexo",
    returnTo: `/inventory/locations/${id}/kiosk-withdraw`,
    permissionCode: "inventory.transfers",
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

  const productIds = products.map((product) => product.id);
  const { data: uomProfilesData } = productIds.length
    ? await supabase
        .from("product_uom_profiles")
        .select("id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context")
        .in("product_id", productIds)
        .eq("is_active", true)
    : { data: [] as ProductUomProfile[] };

  const { data: assignmentData } = await supabase
    .from("employee_inventory_location_assignments")
    .select("employee_id,location_id,location:inventory_locations(id,code,description,zone,site_id)")
    .eq("site_id", location.site_id)
    .eq("purpose", "kiosk_withdraw")
    .eq("is_active", true)
    .neq("location_id", id)
    .limit(300);
  const assignments = (assignmentData ?? []) as Array<{
    employee_id: string;
    location_id: string;
    location?: LocationRow | LocationRow[] | null;
  }>;
  const employeeIds = assignments.map((assignment) => assignment.employee_id);
  const { data: employeesData } = employeeIds.length
    ? await supabase
        .from("employees")
        .select("id,full_name,alias,role,is_active")
        .in("id", employeeIds)
        .eq("is_active", true)
        .order("full_name", { ascending: true })
    : { data: [] as Array<{ id: string; full_name: string | null; alias: string | null; role: string | null }> };
  const employeeById = new Map((employeesData ?? []).map((employee) => [employee.id, employee]));
  const workers = assignments
    .map((assignment) => {
      const employee = employeeById.get(assignment.employee_id);
      if (!employee) return null;
      const destination = Array.isArray(assignment.location)
        ? assignment.location[0] ?? null
        : assignment.location ?? null;
      return {
        employee_id: assignment.employee_id,
        label: String(employee.alias ?? employee.full_name ?? assignment.employee_id).trim(),
        role: employee.role ?? null,
        destination_label: locLabel(destination),
      };
    })
    .filter((worker): worker is { employee_id: string; label: string; role: string | null; destination_label: string } =>
      Boolean(worker)
    )
    .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

  const title = locLabel(location);
  const returnTo = `/inventory/locations/${encodeURIComponent(id)}/board?kiosk=1`;

  return (
    <div className="ui-scene w-full space-y-5 px-4 py-5">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.35fr_0.9fr] lg:items-start">
          <div className="space-y-4">
            <Link href={returnTo} className="ui-caption underline">
              Volver al kiosco
            </Link>
            <div className="space-y-2">
              <div className="ui-caption">Retiro desde quiosco</div>
              <h1 className="ui-h1">{title}</h1>
              <p className="ui-body-muted">
                El trabajador confirma con PIN y NEXO registra un traslado interno hacia su LOC asignado.
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
                {workers.length} trabajadores configurados
              </span>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Confirmacion</div>
              <div className="ui-remission-kpi-value">PIN</div>
              <div className="ui-remission-kpi-note">PIN hash configurado desde VISO</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Movimiento</div>
              <div className="ui-remission-kpi-value">LOC</div>
              <div className="ui-remission-kpi-note">Traslado interno, no consumo directo</div>
            </article>
          </div>
        </div>
      </section>

      {errorMessage && !errorProductId ? (
        <div className="ui-alert ui-alert--error">Error: {errorMessage}</div>
      ) : null}

      {workers.length === 0 ? (
        <div className="ui-alert ui-alert--neutral">
          No hay trabajadores con LOC de retiro asignado para esta sede. Configuralos en VISO.
        </div>
      ) : null}

      <KioskWithdrawForm
        sourceLocationId={id}
        returnTo={returnTo}
        products={products}
        workers={workers}
        uomProfiles={(uomProfilesData ?? []) as ProductUomProfile[]}
        errorMessage={errorMessage}
        errorProductId={errorProductId}
        clearDraft={clearDraft}
        action={submitKioskWithdraw}
      />
    </div>
  );
}
