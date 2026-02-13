import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { WithdrawForm } from "@/features/inventory/withdraw/withdraw-form";
import { normalizeUnitCode, roundQuantity } from "@/lib/inventory/uom";

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
  if (!locationId) {
    redirect("/inventory/withdraw?error=" + encodeURIComponent("Falta ubicación (LOC)."));
  }

  const productIds = formData.getAll("item_product_id").map((v) => String(v).trim());
  const quantities = formData.getAll("item_quantity").map((v) => String(v).trim());
  const inputUnits = formData
    .getAll("item_input_unit_code")
    .map((v) => normalizeUnitCode(String(v).trim()));
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

  const items = productIds
    .map((productId, idx) => {
      const product = productMap.get(productId);
      const stockUnitCode = normalizeUnitCode(product?.stock_unit_code || product?.unit || "un");
      return {
        product_id: productId,
        quantity: roundQuantity(parseNumber(quantities[idx] ?? "0")),
        input_unit_code: normalizeUnitCode(inputUnits[idx] || stockUnitCode),
        stock_unit_code: stockUnitCode,
        note: notes[idx] || null,
      };
    })
    .filter((item) => item.product_id && item.quantity > 0);

  if (items.length === 0) {
    redirect("/inventory/withdraw?error=" + encodeURIComponent("Agrega al menos un ítem con cantidad > 0."));
  }

  const { data: locRow } = await supabase
    .from("inventory_locations")
    .select("id,code,site_id")
    .eq("id", locationId)
    .single();

  if (!locRow || (locRow as { site_id?: string }).site_id !== siteId) {
    redirect("/inventory/withdraw?error=" + encodeURIComponent("LOC no válido para tu sede."));
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
            `Cantidad a retirar (${item.quantity}) mayor que disponible en LOC (${availableAtLoc}). Ajusta o usa otro LOC.`
          )
      );
    }
  }

  for (const item of items) {
    const note = item.note
      ? `Retiro ${locCode}: ${item.note}`
      : `Retiro ${locCode}`;

    const { error: moveErr } = await supabase.from("inventory_movements").insert({
      site_id: siteId,
      product_id: item.product_id,
      movement_type: MOVEMENT_TYPE,
      quantity: -item.quantity,
      input_qty: item.quantity,
      input_unit_code: item.input_unit_code,
      conversion_factor_to_stock: 1,
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

  redirect("/inventory/withdraw?ok=1");
}

type LocRow = { id: string; code: string | null; zone: string | null };
type ProductRow = { id: string; name: string | null; unit: string | null; stock_unit_code: string | null };

export default async function WithdrawPage({
  searchParams,
}: {
  searchParams?: Promise<{ loc_id?: string; loc?: string; site_id?: string; error?: string; ok?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const locIdParam = sp.loc_id ? String(sp.loc_id).trim() : "";
  const locCodeParam = sp.loc ? String(sp.loc).trim().toUpperCase() : "";
  const siteIdParam = sp.site_id ? String(sp.site_id).trim() : "";
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";
  const okMsg = sp.ok ? "Retiro registrado." : "";

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/withdraw",
    permissionCode: "inventory.withdraw",
  });

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

  // Prioridad: URL (selector de sede) > employee_settings > employee.site_id
  let siteId = siteIdParam || (settings?.selected_site_id ?? employee?.site_id ?? "");

  let locations: LocRow[] = [];
  let defaultLocationId = locIdParam;

  if (siteId) {
    const locQuery = supabase
      .from("inventory_locations")
      .select("id,code,zone")
      .eq("site_id", siteId)
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
      .select("id,code,zone,site_id")
      .ilike("code", locCodeParam)
      .limit(5);
    const found = (locByCode ?? []) as (LocRow & { site_id?: string })[];
    const match = found.find((l) => (l.code ?? "").toUpperCase() === locCodeParam);
    if (match?.site_id) {
      siteId = match.site_id;
      defaultLocationId = match.id;
      const { data: locData } = await supabase
        .from("inventory_locations")
        .select("id,code,zone")
        .eq("site_id", siteId)
        .order("code", { ascending: true })
        .limit(200);
      locations = (locData ?? []) as LocRow[];
    }
  }

  const { data: products } = await supabase
    .from("product_inventory_profiles")
    .select("product_id, products(id,name,unit,stock_unit_code)")
    .eq("track_inventory", true)
    .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
    .order("name", { foreignTable: "products", ascending: true })
    .limit(400);

  let productRows: ProductRow[] = [];
  const raw = (products ?? []) as unknown as { product_id: string; products: ProductRow | null }[];
  productRows = raw
    .map((r) => r.products)
    .filter((p): p is ProductRow => Boolean(p));

  if (productRows.length === 0) {
    const { data: fallback } = await supabase
      .from("products")
      .select("id,name,unit,stock_unit_code")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(400);
    productRows = (fallback ?? []) as unknown as ProductRow[];
  }

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Retirar insumos</h1>
          <p className="mt-2 ui-body-muted">
            Registra consumo desde un LOC (ej. bodega, cuarto frío). Usa el QR de la zona para abrir con el LOC ya elegido.
          </p>
        </div>
        <Link href="/inventory/stock" className="ui-btn ui-btn--ghost">
          Ver stock
        </Link>
      </div>

      {errorMsg ? (
        <div className="mt-6 ui-alert ui-alert--error">
          {errorMsg}
        </div>
      ) : null}

      {okMsg ? (
        <div className="mt-6 ui-alert ui-alert--success">{okMsg}</div>
      ) : null}

      <div className="mt-6">
        <WithdrawForm
          locations={locations}
          defaultLocationId={defaultLocationId}
          products={productRows}
          siteId={siteId}
          action={submitWithdraw}
        />
      </div>
    </div>
  );
}
