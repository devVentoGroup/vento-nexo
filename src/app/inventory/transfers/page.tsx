import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { TransfersForm } from "@/components/vento/transfers-form";
import { buildShellLoginUrl } from "@/lib/auth/sso";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
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
  const units = formData.getAll("item_unit").map((v) => String(v).trim());
  const itemNotes = formData.getAll("item_notes").map((v) => String(v).trim());

  const items = productIds
    .map((productId, idx) => ({
      product_id: productId,
      quantity: parseNumber(quantities[idx] ?? "0"),
      unit: units[idx] || null,
      notes: itemNotes[idx] || null,
    }))
    .filter((item) => item.product_id && item.quantity > 0);

  if (items.length === 0) {
    redirect("/inventory/transfers?error=" + encodeURIComponent("Agrega al menos un ítem con cantidad > 0."));
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
    unit: item.unit,
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
  const locMap = new Map((locRows ?? []).map((l: any) => [l.id, l.code ?? l.id]));
  const fromCode = locMap.get(fromLocId) ?? fromLocId;
  const toCode = locMap.get(toLocId) ?? toLocId;

  const movementRows = items.map((item) => ({
    site_id: siteId,
    product_id: item.product_id,
    movement_type: "transfer_internal",
    quantity: item.quantity,
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
    .select("product_id, products(id,name,unit)")
    .eq("track_inventory", true)
    .in("inventory_kind", ["ingredient", "finished", "resale", "packaging"])
    .order("name", { foreignTable: "products", ascending: true })
    .limit(400);

  const productRows = ((products ?? []) as ProductProfileWithProduct[])
    .map((row) => row.products)
    .filter((row): row is ProductRow => Boolean(row));

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
      <div>
        <h1 className="ui-h1">Traslados internos</h1>
        <p className="mt-2 ui-body-muted">
          Movimientos entre LOCs dentro de la misma sede.
        </p>
      </div>

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">Error: {errorMsg}</div>
      ) : null}
      {okMsg ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Traslado registrado correctamente.
        </div>
      ) : null}

      <TransfersForm locations={(locations ?? []) as LocRow[]} products={productRows} action={createTransfer} />

      <div className="ui-panel">
        <div className="ui-h3">Traslados recientes</div>
        <div className="mt-1 ui-body-muted">Últimos 25 traslados registrados.</div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
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
