import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { safeDecodeURIComponent } from "@/lib/url";
import { WithdrawForm } from "@/features/inventory/withdraw/withdraw-form";
import {
  convertByProductProfile,
  normalizeUnitCode,
  roundQuantity,
  type ProductUomProfile,
} from "@/lib/inventory/uom";

export const dynamic = "force-dynamic";

const MOVEMENT_TYPE = "consumption";

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function submitWithdraw(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/withdraw"));
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
    redirect("/inventory/withdraw?error=" + encodeURIComponent("No tienes sede activa."));
  }

  const locationId = asText(formData.get("location_id"));
  const returnTo = asText(formData.get("return_to"));
  if (!locationId) {
    redirect("/inventory/withdraw?error=" + encodeURIComponent("Falta área de salida."));
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
  const notes = formData.getAll("item_notes").map((v) => String(v).trim());

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
    note: string | null;
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
          note: notes[idx] || null,
        };
      })
      .filter((item) => item.product_id && item.quantity > 0);
  } catch (error) {
    redirect(
      "/inventory/withdraw?error=" +
        encodeURIComponent(
          error instanceof Error ? error.message : "Error en conversion de unidades."
        )
    );
  }

  if (items.length === 0) {
    redirect("/inventory/withdraw?error=" + encodeURIComponent("Agrega al menos un ítem con cantidad > 0."));
  }

  const { data: locRow } = await supabase
    .from("inventory_locations")
    .select("id,code,site_id")
    .eq("id", locationId)
    .eq("is_active", true)
    .single();

  if (!locRow || (locRow as { site_id?: string }).site_id !== siteId) {
    redirect("/inventory/withdraw?error=" + encodeURIComponent("Área no válida para tu sede."));
  }

  const locCode = (locRow as { code?: string }).code ?? locationId;

  for (const item of items) {
    const { data: stockLoc } = await supabase
      .from("inventory_stock_by_location")
      .select("current_qty")
      .eq("location_id", locationId)
      .eq("product_id", item.product_id)
      .maybeSingle();

    const availableAtLoc = Number((stockLoc as { current_qty?: number } | null)?.current_qty ?? 0);
    if (availableAtLoc < item.quantity) {
      redirect(
        "/inventory/withdraw?error=" +
          encodeURIComponent(
            `No alcanza stock: solicitaste ${item.input_qty} ${item.input_unit_code} (${item.quantity} ${item.stock_unit_code}), disponibles ${availableAtLoc} ${item.stock_unit_code}.`
          )
      );
    }
  }

  for (const item of items) {
    const note = item.note
      ? `Retiro ${locCode}: ${item.note}`
      : `Retiro ${locCode}`;

    const { error: positionErr } = await supabase.rpc("consume_inventory_stock_from_positions", {
      p_location_id: locationId,
      p_product_id: item.product_id,
      p_quantity: item.quantity,
      p_created_by: user.id,
      p_note: `Retiro interno ${locCode}: menor stock primero`,
    });
    if (positionErr) {
      redirect("/inventory/withdraw?error=" + encodeURIComponent(positionErr.message));
    }

    const { error: moveErr } = await supabase.from("inventory_movements").insert({
      site_id: siteId,
      product_id: item.product_id,
      movement_type: MOVEMENT_TYPE,
      quantity: -item.quantity,
      input_qty: item.input_qty,
      input_unit_code: item.input_unit_code,
      conversion_factor_to_stock: item.conversion_factor_to_stock,
      stock_unit_code: item.stock_unit_code,
      note,
      created_by: user.id,
    });
    if (moveErr) {
      redirect("/inventory/withdraw?error=" + encodeURIComponent(moveErr.message));
    }

    const { error: locErr } = await supabase.rpc("upsert_inventory_stock_by_location", {
      p_location_id: locationId,
      p_product_id: item.product_id,
      p_delta: -item.quantity,
    });
    if (locErr) {
      redirect("/inventory/withdraw?error=" + encodeURIComponent(locErr.message));
    }

    const { data: siteStock } = await supabase
      .from("inventory_stock_by_site")
      .select("current_qty")
      .eq("site_id", siteId)
      .eq("product_id", item.product_id)
      .maybeSingle();

    const currentQty = Number((siteStock as { current_qty?: number } | null)?.current_qty ?? 0);
    const newQty = Math.max(0, currentQty - item.quantity);

    const { error: siteErr } = await supabase
      .from("inventory_stock_by_site")
      .upsert(
        {
          site_id: siteId,
          product_id: item.product_id,
          current_qty: newQty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_id,product_id" }
      );
    if (siteErr) {
      redirect("/inventory/withdraw?error=" + encodeURIComponent(siteErr.message));
    }
  }

  if (returnTo) {
    const joiner = returnTo.includes("?") ? "&" : "?";
    redirect(`${returnTo}${joiner}ok=withdraw`);
  }

  redirect("/inventory/withdraw?ok=1");
}

type LocRow = { id: string; code: string | null; zone: string | null; description?: string | null };
type ProductRow = { id: string; name: string | null; unit: string | null; stock_unit_code: string | null };
type SiteRow = { id: string; name: string | null; site_type: string | null };
type EmployeePageRow = { site_id: string | null; role: string | null };

export default async function WithdrawPage({
  searchParams,
}: {
  searchParams?: Promise<{ loc_id?: string; loc?: string; site_id?: string; error?: string; ok?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const locIdParam = sp.loc_id ? String(sp.loc_id).trim() : "";
  const locCodeParam = sp.loc ? String(sp.loc).trim().toUpperCase() : "";
  const siteIdParam = sp.site_id ? String(sp.site_id).trim() : "";
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";
  const okMsg = sp.ok ? "Retiro registrado." : "";
  const openedFromQr = Boolean(locIdParam || locCodeParam);

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/withdraw",
    permissionCode: "inventory.withdraw",
  });

  const { data: employeeData } = await supabase
    .from("employees")
    .select("site_id,role")
    .eq("id", user.id)
    .single();
  const employee = (employeeData ?? null) as EmployeePageRow | null;

  const { data: settings } = await supabase
    .from("employee_settings")
    .select("selected_site_id")
    .eq("employee_id", user.id)
    .maybeSingle();

  // Prioridad: URL (selector de sede) > employee_settings > employee.site_id
  let siteId = siteIdParam || (settings?.selected_site_id ?? employee?.site_id ?? "");

  let locations: LocRow[] = [];
  let defaultLocationId = locIdParam;

  if (siteId) {
    const locQuery = supabase
      .from("inventory_locations")
      .select("id,code,zone,description")
      .eq("site_id", siteId)
      .eq("is_active", true)
      .order("code", { ascending: true })
      .limit(200);

    const { data: locData } = await locQuery;
    locations = (locData ?? []) as LocRow[];

    if (!defaultLocationId && locCodeParam) {
      const byCode = locations.find(
        (l) => (l.code ?? "").toUpperCase() === locCodeParam
      );
      if (byCode) defaultLocationId = byCode.id;
    }
    if (!defaultLocationId && locations.length > 0) {
      defaultLocationId = locations[0].id;
    }
  }

  // Si no hay LOCs en la sede actual pero tenemos ?loc=XXX, buscar el LOC y usar su sede
  if (locations.length === 0 && locCodeParam) {
    const { data: locByCode } = await supabase
      .from("inventory_locations")
      .select("id,code,zone,description,site_id")
      .ilike("code", locCodeParam)
      .eq("is_active", true)
      .limit(5);
    const found = (locByCode ?? []) as (LocRow & { site_id?: string })[];
    const match = found.find((l) => (l.code ?? "").toUpperCase() === locCodeParam);
    if (match?.site_id) {
      siteId = match.site_id;
      defaultLocationId = match.id;
      const { data: locData } = await supabase
        .from("inventory_locations")
        .select("id,code,zone,description")
        .eq("site_id", siteId)
        .eq("is_active", true)
        .order("code", { ascending: true })
        .limit(200);
      locations = (locData ?? []) as LocRow[];
    }
  }

  const { data: productsWithStock } = siteId
    ? defaultLocationId
      ? await supabase
          .from("inventory_stock_by_location")
          .select("product_id, products(id,name,unit,stock_unit_code)")
          .eq("location_id", defaultLocationId)
          .gt("current_qty", 0)
          .limit(400)
      : await supabase
          .from("inventory_stock_by_site")
          .select("product_id, products(id,name,unit,stock_unit_code)")
          .eq("site_id", siteId)
          .gt("current_qty", 0)
          .limit(400)
    : { data: [] as { product_id: string; products: ProductRow | null }[] };

  let productRows: ProductRow[] = [];
  const stocked = (productsWithStock ?? []) as unknown as { product_id: string; products: ProductRow | null }[];
  productRows = stocked
    .map((r) => r.products)
    .filter((p): p is ProductRow => Boolean(p));

  if (productRows.length === 0) {
    const { data: products } = await supabase
      .from("product_inventory_profiles")
      .select("product_id, products(id,name,unit,stock_unit_code)")
      .eq("track_inventory", true)
      .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
      .order("name", { foreignTable: "products", ascending: true })
      .limit(400);

    const raw = (products ?? []) as unknown as { product_id: string; products: ProductRow | null }[];
    productRows = raw
      .map((r) => r.products)
      .filter((p): p is ProductRow => Boolean(p));
  }

  if (productRows.length === 0) {
    const { data: fallback } = await supabase
      .from("products")
      .select("id,name,unit,stock_unit_code")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(400);
    productRows = (fallback ?? []) as unknown as ProductRow[];
  }
  const productIds = productRows.map((row) => row.id);
  const { data: uomProfilesDataForPage } = productIds.length
    ? await supabase
        .from("product_uom_profiles")
        .select(
          "id,product_id,label,input_unit_code,qty_in_input_unit,qty_in_stock_unit,is_default,is_active,source,usage_context"
        )
        .in("product_id", productIds)
        .eq("is_default", true)
        .eq("is_active", true)
    : { data: [] as ProductUomProfile[] };
  const defaultUomProfiles = (uomProfilesDataForPage ?? []) as ProductUomProfile[];
  const selectedLocation = locations.find((location) => location.id === defaultLocationId) ?? null;
  const returnTo = selectedLocation ? `/inventory/locations/${encodeURIComponent(selectedLocation.id)}` : "/inventory/stock";
  const normalizedRole = String(employee?.role ?? "").toLowerCase();
  const isManagementRole = ["propietario", "gerente_general", "admin", "manager", "gerente"].includes(
    normalizedRole
  );
  const { data: activeSiteData } = siteId
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .eq("id", siteId)
        .maybeSingle()
    : { data: null as SiteRow | null };
  const activeSite = (activeSiteData ?? null) as SiteRow | null;
  const siteType = String(activeSite?.site_type ?? "").toLowerCase();
  const mode = !isManagementRole && siteType === "satellite"
    ? "satellite"
    : !isManagementRole && siteType === "production_center"
      ? "center"
      : "general";
  const heroModeLabel = mode === "satellite" ? "Modo satelite" : mode === "center" ? "Modo Centro" : "Modo retiro";
  const heroTitle =
    mode === "satellite"
      ? "Registra salida desde el área activa"
      : mode === "center"
        ? "Registra salida desde Centro"
        : "Registrar salida de insumos";
  const heroSubtitle =
    mode === "satellite"
      ? "Confirma el área, revisa qué sale y registra la salida sin mezclarte con otras pantallas."
      : mode === "center"
        ? "Usa este flujo para descontar consumos reales desde un área y seguir rápido con la operación."
        : "Registra la salida real desde un área. Si abriste el formulario desde el QR, el origen ya queda listo para capturar.";

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
          <div className="space-y-2">
              <Link href={returnTo} className="ui-caption underline">
                {openedFromQr ? "Volver al área" : "Volver a stock"}
              </Link>
              <div className="ui-caption">{heroModeLabel}</div>
              <h1 className="ui-h1">{heroTitle}</h1>
              <p className="ui-body-muted">{heroSubtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                {siteId ? "Sede activa lista" : "Sin sede activa"}
              </span>
              {selectedLocation ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-900">
                  Área {selectedLocation.description ?? selectedLocation.zone ?? selectedLocation.code ?? selectedLocation.id}
                </span>
              ) : null}
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                {productRows.length} productos disponibles
              </span>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Área activa</div>
              <div className="ui-remission-kpi-value">
                {selectedLocation?.description ?? selectedLocation?.zone ?? selectedLocation?.code ?? "Sin área"}
              </div>
              <div className="ui-remission-kpi-note">
                {selectedLocation?.code || "La salida se descuenta del área seleccionada"}
              </div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Productos cargados</div>
              <div className="ui-remission-kpi-value">{productRows.length}</div>
              <div className="ui-remission-kpi-note">Lista disponible para capturar salida rápida</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Modo</div>
              <div className="ui-remission-kpi-value">QR + móvil</div>
              <div className="ui-remission-kpi-note">Optimizado para tablet o celular en operación</div>
            </article>
          </div>
        </div>
      </section>

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">
          {errorMsg}
        </div>
      ) : null}

      {okMsg ? (
        <div className="ui-alert ui-alert--success">{okMsg}</div>
      ) : null}

      <WithdrawForm
        locations={locations}
        defaultLocationId={defaultLocationId}
        products={productRows}
        defaultUomProfiles={defaultUomProfiles}
        siteId={siteId}
        openedFromQr={openedFromQr}
        mode={mode}
        siteLabel={activeSite?.name ?? ""}
        returnTo={returnTo}
        action={submitWithdraw}
      />
    </div>
  );
}
