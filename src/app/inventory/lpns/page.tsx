import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { LpnCreateForm } from "@/features/inventory/lpns/lpn-create-form";

type SearchParams = {
  code?: string;
  lpn_id?: string;

  error?: string;
  created?: string;
  assigned?: string;

  items_added?: string;
  items_removed?: string;
};

type LpnItemRow = {
  id: string;
  lpn_id: string;
  product_id: string;
  quantity: any; // numeric suele venir como string
  unit: string;
  lot_number: string | null;
  expiry_date: string | null; // date
  received_at: string | null;
  cost_per_unit: any | null;
  created_at: string | null;
  updated_at: string | null;
};

function yymmBogota() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "2-digit",
    month: "2-digit",
  }).formatToParts(new Date());

  const yy = parts.find((p) => p.type === "year")?.value ?? "00";
  const mm = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${yy}${mm}`;
}

function pad4(n: number) {
  return String(n).padStart(4, "0");
}

export default async function InventoryLpnsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const code = sp.code?.trim() ?? "";
  const lpnIdParam = sp.lpn_id?.trim() ?? "";

  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";
  const created = sp.created === "1";
  const assigned = sp.assigned === "1";

  const itemsAdded = sp.items_added === "1";
  const itemsRemoved = sp.items_removed === "1";

  const supabase = await createClient();

  let user: any = null;
  try {
    const res = await supabase.auth.getUser();
    user = res.data.user ?? null;
  } catch {
    user = null;
  }

  const returnParams = new URLSearchParams();
  if (code) returnParams.set("code", code);
  if (lpnIdParam) returnParams.set("lpn_id", lpnIdParam);

  const returnTo = returnParams.toString()
    ? `/inventory/lpns?${returnParams.toString()}`
    : "/inventory/lpns";

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">LPN</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Necesitas iniciar sesión para ver/crear/asignar LPNs (RLS).
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-zinc-900">Sin sesión</div>
          <div className="mt-1 text-sm text-zinc-600">
            Inicia sesión en NEXO para continuar.
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Iniciar sesión
            </Link>

            <Link
              href="/scanner"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
            >
              Ir a Scanner
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Inferir site_id desde employee_sites (mismo patrón que LOC)
  const { data: sitesRows } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1);

  const defaultSiteId = sitesRows?.[0]?.site_id ?? "";

  // Locations para putaway
  const { data: locations, error: locErr } = await supabase
    .from("inventory_locations")
    .select("id,code")
    .order("code", { ascending: true })
    .limit(500);

  // Server action: crear LPN
  async function createLpnAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!user) {
      redirect(`/inventory/lpns?error=${encodeURIComponent("Sesión requerida")}`);
    }

    const site_id = String(formData.get("site_id") ?? "").trim();
    const sede_code = String(formData.get("sede_code") ?? "")
      .trim()
      .toUpperCase();

    if (!site_id) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta site_id.")}`);
    if (!sede_code) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta sede_code.")}`);

    const yymm = yymmBogota();
    const prefix = `LPN-${sede_code}-${yymm}-`;

    const { data: lastRows, error: lastErr } = await supabase
      .from("inventory_lpns")
      .select("code")
      .like("code", `${prefix}%`)
      .order("code", { ascending: false })
      .limit(1);

    if (lastErr) redirect(`/inventory/lpns?error=${encodeURIComponent(lastErr.message)}`);

    let nextSeq = 1;
    const lastCode = lastRows?.[0]?.code ?? "";
    if (lastCode.startsWith(prefix)) {
      const parts = lastCode.split("-");
      const seqStr = parts[parts.length - 1] ?? "";
      const parsed = Number.parseInt(seqStr, 10);
      if (Number.isFinite(parsed) && parsed > 0) nextSeq = parsed + 1;
    }

    // 2 intentos por colisión
    for (let i = 0; i < 2; i++) {
      const finalCode = `${prefix}${pad4(nextSeq + i)}`;

      const { error: insErr } = await supabase.from("inventory_lpns").insert({
        site_id,
        code: finalCode,
        location_id: null,
      });

      if (!insErr) {
        revalidatePath("/inventory/lpns");
        redirect(`/inventory/lpns?created=1&code=${encodeURIComponent(finalCode)}`);
      }

      if (i === 1) {
        redirect(`/inventory/lpns?error=${encodeURIComponent(insErr.message)}`);
      }
    }
  }

  // Server action: putaway (LPN -> LOC)
  async function putawayAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!user) {
      redirect(`/inventory/lpns?error=${encodeURIComponent("Sesión requerida")}`);
    }

    const lpn_id = String(formData.get("lpn_id") ?? "").trim();
    const location_id = String(formData.get("location_id") ?? "").trim();

    if (!lpn_id) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta lpn_id.")}`);
    if (!location_id) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta location_id.")}`);

    const { error } = await supabase
      .from("inventory_lpns")
      .update({ location_id })
      .eq("id", lpn_id);

    if (error) redirect(`/inventory/lpns?error=${encodeURIComponent(error.message)}`);

    revalidatePath("/inventory/lpns");
    redirect(`/inventory/lpns?assigned=1`);
  }
  // Server action: agregar item a LPN (sumando si ya existe mismo key)
  async function addItemAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!user) redirect(`/inventory/lpns?error=${encodeURIComponent("Sesión requerida")}`);

    const code = String(formData.get("code") ?? "").trim();
    const lpn_id = String(formData.get("lpn_id") ?? "").trim();

    const product_id = String(formData.get("product_id") ?? "").trim();
    const unit = String(formData.get("unit") ?? "").trim();
    const qtyStr = String(formData.get("quantity") ?? "").trim();

    const lot_number_raw = String(formData.get("lot_number") ?? "").trim();
    const expiry_date_raw = String(formData.get("expiry_date") ?? "").trim(); // YYYY-MM-DD
    const cost_raw = String(formData.get("cost_per_unit") ?? "").trim();

    if (!lpn_id) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta lpn_id.")}`);
    if (!product_id) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta product_id.")}`);
    if (!unit) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta unit.")}`);

    const qty = Number.parseFloat(qtyStr);
    if (!Number.isFinite(qty) || qty <= 0) {
      redirect(`/inventory/lpns?error=${encodeURIComponent("quantity debe ser > 0.")}`);
    }

    const lot_number = lot_number_raw ? lot_number_raw : null;
    const expiry_date = expiry_date_raw ? expiry_date_raw : null;
    const cost_per_unit = cost_raw ? Number.parseFloat(cost_raw) : null;

    // Buscar si ya existe el mismo "item key" en ese LPN
    let find = supabase
      .from("inventory_lpn_items")
      .select("id,quantity")
      .eq("lpn_id", lpn_id)
      .eq("product_id", product_id)
      .eq("unit", unit)
      .limit(1);

    find = lot_number ? find.eq("lot_number", lot_number) : find.is("lot_number", null);
    find = expiry_date ? find.eq("expiry_date", expiry_date) : find.is("expiry_date", null);

    const { data: existing, error: findErr } = await find;
    if (findErr) redirect(`/inventory/lpns?error=${encodeURIComponent(findErr.message)}`);

    if (existing && existing.length > 0) {
      const row = existing[0] as any;
      const currentQty = Number.parseFloat(String(row.quantity ?? "0"));
      const nextQty = (Number.isFinite(currentQty) ? currentQty : 0) + qty;

      const { error: upErr } = await supabase
        .from("inventory_lpn_items")
        .update({
          quantity: nextQty,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (upErr) redirect(`/inventory/lpns?error=${encodeURIComponent(upErr.message)}`);
    } else {
      const payload: any = {
        lpn_id,
        product_id,
        quantity: qty,
        unit,
        lot_number,
        expiry_date,
        received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (cost_per_unit !== null && Number.isFinite(cost_per_unit)) payload.cost_per_unit = cost_per_unit;

      const { error: insErr } = await supabase.from("inventory_lpn_items").insert(payload);
      if (insErr) redirect(`/inventory/lpns?error=${encodeURIComponent(insErr.message)}`);
    }

    revalidatePath("/inventory/lpns");

    const qs = new URLSearchParams();
    if (code) qs.set("code", code);
    qs.set("lpn_id", lpn_id);
    qs.set("items_added", "1");
    redirect(`/inventory/lpns?${qs.toString()}`);
  }

  // Server action: retirar qty (si queda <=0, lo deja en 0 para evitar DELETE/RLS)
  async function removeItemAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!user) redirect(`/inventory/lpns?error=${encodeURIComponent("Sesión requerida")}`);

    const code = String(formData.get("code") ?? "").trim();
    const lpn_id = String(formData.get("lpn_id") ?? "").trim();

    const item_id = String(formData.get("item_id") ?? "").trim();
    const qtyStr = String(formData.get("quantity") ?? "").trim();

    if (!lpn_id) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta lpn_id.")}`);
    if (!item_id) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta item_id.")}`);

    const removeQty = Number.parseFloat(qtyStr);
    if (!Number.isFinite(removeQty) || removeQty <= 0) {
      redirect(`/inventory/lpns?error=${encodeURIComponent("quantity debe ser > 0.")}`);
    }

    const { data: rows, error: selErr } = await supabase
      .from("inventory_lpn_items")
      .select("id,quantity")
      .eq("id", item_id)
      .limit(1);

    if (selErr) redirect(`/inventory/lpns?error=${encodeURIComponent(selErr.message)}`);
    if (!rows || rows.length === 0) redirect(`/inventory/lpns?error=${encodeURIComponent("Item no encontrado.")}`);

    const currentQty = Number.parseFloat(String((rows[0] as any).quantity ?? "0"));
    const nextQty = Math.max(0, (Number.isFinite(currentQty) ? currentQty : 0) - removeQty);

    const { error: upErr } = await supabase
      .from("inventory_lpn_items")
      .update({ quantity: nextQty, updated_at: new Date().toISOString() })
      .eq("id", item_id);

    if (upErr) redirect(`/inventory/lpns?error=${encodeURIComponent(upErr.message)}`);

    revalidatePath("/inventory/lpns");

    const qs = new URLSearchParams();
    if (code) qs.set("code", code);
    qs.set("lpn_id", lpn_id);
    qs.set("items_removed", "1");
    redirect(`/inventory/lpns?${qs.toString()}`);
  }

  // LPNs (con filtro por code si viene del scanner)
  let q = supabase
    .from("inventory_lpns")
    .select("id,code,location_id")
    .order("code", { ascending: false })
    .limit(200);

  if (code) q = q.eq("code", code);

  const [{ data: lpns, error: lpnsError }] = await Promise.all([q]);

  const locMap = new Map<string, { code: string }>();
  for (const loc of locations ?? []) {
    locMap.set(loc.id, { code: loc.code });
  }

  // Preselección si viene code y hay match exacto
  const preselectedLpnId =
    code && lpns?.[0]?.code === code ? (lpns?.[0]?.id ?? "") : "";
  const activeLpnId = lpnIdParam || preselectedLpnId || "";

  let lpnItems: LpnItemRow[] = [];
  let itemsErr: any = null;

  if (activeLpnId) {
    const { data, error } = await supabase
      .from("inventory_lpn_items")
      .select(
        "id,lpn_id,product_id,quantity,unit,lot_number,expiry_date,received_at,cost_per_unit,created_at,updated_at"
      )
      .eq("lpn_id", activeLpnId)
      .gt("quantity", 0)
      .order("created_at", { ascending: false })
      .limit(500);

    lpnItems = (data ?? []) as any;
    itemsErr = error;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">LPN</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Contenedores para registrar ubicación (LOC) y contenido (items).
          </p>

          {code ? (
            <div className="mt-3 text-sm text-zinc-700">
              Filtro desde Scanner: <span className="font-mono">{code}</span>{" "}
              <Link
                className="ml-3 text-zinc-900 underline underline-offset-2"
                href="/inventory/lpns"
              >
                limpiar
              </Link>
            </div>
          ) : null}
        </div>

        <Link
          href="/scanner"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
        >
          Ir a Scanner
        </Link>
      </div>

      {created ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          LPN creado correctamente.
        </div>
      ) : null}

      {assigned ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          LOC asignado correctamente.
        </div>
      ) : null}
      {itemsAdded ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Item agregado correctamente.
        </div>
      ) : null}

      {itemsRemoved ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Item retirado correctamente.
        </div>
      ) : null}

      {errorMsg ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error: {errorMsg}
        </div>
      ) : null}

      {locErr ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Falló el SELECT de LOCs: {locErr.message}
        </div>
      ) : null}

      <LpnCreateForm defaultSiteId={defaultSiteId} action={createLpnAction} />

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">Putaway (LPN → LOC)</div>
        <div className="mt-1 text-sm text-zinc-600">
          Asigna un LOC a un LPN (actualiza <span className="font-mono">location_id</span>).
        </div>

        <form action={putawayAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-zinc-600">LPN</label>
            <select
              name="lpn_id"
              defaultValue={preselectedLpnId}
              className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            >
              <option value="">Selecciona un LPN…</option>
              {(lpns ?? []).map((lpn) => (
                <option key={lpn.id} value={lpn.id}>
                  {lpn.code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-600">LOC destino</label>
            <select
              name="location_id"
              className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            >
              <option value="">Selecciona un LOC…</option>
              {(locations ?? []).map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800">
              Asignar LOC
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Contenido (Items)</div>
            <div className="mt-1 text-sm text-zinc-600">
              Agrega o retira items dentro de un LPN. (Por ahora: product_id UUID)
            </div>
          </div>

          <form method="get" action="/inventory/lpns" className="flex flex-wrap items-end gap-2">
            {code ? <input type="hidden" name="code" value={code} /> : null}

            <div>
              <label className="text-xs font-semibold text-zinc-600">LPN activo</label>
              <select
                name="lpn_id"
                defaultValue={activeLpnId}
                className="mt-1 h-11 w-72 max-w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
              >
                <option value="">Selecciona un LPN…</option>
                {(lpns ?? []).map((lpn) => (
                  <option key={lpn.id} value={lpn.id}>
                    {lpn.code}
                  </option>
                ))}
              </select>
            </div>

            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50">
              Ver contenido
            </button>
          </form>
        </div>

        {!activeLpnId ? (
          <div className="mt-4 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700">
            Selecciona un LPN activo para ver y editar su contenido.
          </div>
        ) : null}

        {itemsErr ? (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
            Falló el SELECT de items: {itemsErr.message}
          </div>
        ) : null}

        {activeLpnId ? (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                    <th className="border-b border-zinc-200 pb-2">Producto</th>
                    <th className="border-b border-zinc-200 pb-2">Qty</th>
                    <th className="border-b border-zinc-200 pb-2">Unidad</th>
                    <th className="border-b border-zinc-200 pb-2">Lote</th>
                    <th className="border-b border-zinc-200 pb-2">Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {lpnItems.map((it) => (
                    <tr key={it.id} className="text-sm text-zinc-800">
                      <td className="border-b border-zinc-100 py-3 font-mono">
                        {String(it.product_id).slice(0, 8)}…
                      </td>
                      <td className="border-b border-zinc-100 py-3 font-mono">
                        {String(it.quantity)}
                      </td>
                      <td className="border-b border-zinc-100 py-3">{it.unit}</td>
                      <td className="border-b border-zinc-100 py-3 font-mono">
                        {it.lot_number ?? "—"}
                      </td>
                      <td className="border-b border-zinc-100 py-3 font-mono">
                        {it.expiry_date ?? "—"}
                      </td>
                    </tr>
                  ))}

                  {lpnItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-sm text-zinc-500">
                        Este LPN no tiene items (o RLS no te permite verlos).
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-sm font-semibold text-zinc-900">Agregar item</div>

                <form action={addItemAction} className="mt-3 grid gap-3">
                  {code ? <input type="hidden" name="code" value={code} /> : null}
                  <input type="hidden" name="lpn_id" value={activeLpnId} />

                  <div>
                    <label className="text-xs font-semibold text-zinc-600">product_id (UUID)</label>
                    <input
                      name="product_id"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Cantidad</label>
                      <input
                        name="quantity"
                        type="number"
                        step="0.01"
                        min="0"
                        className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Unidad</label>
                      <input
                        name="unit"
                        placeholder="UND / g / ml"
                        className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Lote (opcional)</label>
                      <input
                        name="lot_number"
                        placeholder="LOT-001"
                        className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-600">Vencimiento (opcional)</label>
                      <input
                        name="expiry_date"
                        type="date"
                        className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Costo unitario (opcional)</label>
                    <input
                      name="cost_per_unit"
                      type="number"
                      step="0.01"
                      min="0"
                      className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                    />
                  </div>

                  <button className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800">
                    Agregar
                  </button>
                </form>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-sm font-semibold text-zinc-900">Retirar cantidad</div>

                <form action={removeItemAction} className="mt-3 grid gap-3">
                  {code ? <input type="hidden" name="code" value={code} /> : null}
                  <input type="hidden" name="lpn_id" value={activeLpnId} />

                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Item</label>
                    <select
                      name="item_id"
                      className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                    >
                      <option value="">Selecciona un item…</option>
                      {lpnItems.map((it) => (
                        <option key={it.id} value={it.id}>
                          {String(it.product_id).slice(0, 8)}… | {String(it.quantity)} {it.unit}
                          {it.lot_number ? ` | ${it.lot_number}` : ""}
                          {it.expiry_date ? ` | exp ${it.expiry_date}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-600">Cantidad a retirar</label>
                    <input
                      name="quantity"
                      type="number"
                      step="0.01"
                      min="0"
                      className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                    />
                  </div>

                  <button className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800">
                    Retirar
                  </button>
                </form>

                <div className="mt-3 text-xs text-zinc-500">
                  Nota: si el item queda en 0, lo ocultamos del listado (queda quantity=0 para no requerir DELETE/RLS).
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold text-zinc-900">LPNs</div>
        <div className="mt-1 text-sm text-zinc-600">Mostrando hasta 200 registros.</div>

        {lpnsError ? (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
            Falló el SELECT: {lpnsError.message}
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                <th className="border-b border-zinc-200 pb-2">Código</th>
                <th className="border-b border-zinc-200 pb-2">LOC</th>
              </tr>
            </thead>
            <tbody>
              {(lpns ?? []).map((lpn) => {
                const loc = lpn.location_id ? locMap.get(lpn.location_id) : null;
                return (
                  <tr key={lpn.id} className="text-sm text-zinc-800">
                    <td className="border-b border-zinc-100 py-3 font-mono">{lpn.code}</td>
                    <td className="border-b border-zinc-100 py-3">
                      {loc ? (
                        <span className="font-mono">
                          {loc.code}
                        </span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!lpns || lpns.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-6 text-sm text-zinc-500">
                    No hay LPNs para mostrar (o RLS no te permite verlos).
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
