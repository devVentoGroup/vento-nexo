import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LpnCreateForm } from "@/features/inventory/lpns/lpn-create-form";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

type SearchParams = {
  code?: string;
  lpn_id?: string;
  tab?: string;

  error?: string;
  created?: string;
  assigned?: string;

  items_added?: string;
  items_removed?: string;

  meta_saved?: string;
};
type InventoryLocationRow = {
  id: string;
  code: string;
};

type InventoryLpnRow = {
  id: string;
  code: string;
  location_id: string | null;
  label: string | null;
  notes: string | null;
};
type InvProductRow = {
  product_id: string;
  inventory_kind: string | null;
  default_unit: string | null;
  products: any | null; // relación a products(*)
};

function productDisplay(p: any) {
  const name =
    p?.name ??
    p?.display_name ??
    p?.title ??
    p?.code ??
    p?.sku ??
    p?.id ??
    "Producto";
  const code = p?.code ?? p?.sku ?? "";
  const label = code && String(code) !== String(name) ? `${name} (${code})` : String(name);
  return label.length > 80 ? `${label.slice(0, 77)}...` : label;
}
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

  let errorMsg = "";
  if (sp.error) {
    try {
      errorMsg = decodeURIComponent(sp.error);
    } catch {
      // Si el querystring viene con % inválido, no tumbamos el render.
      errorMsg = String(sp.error);
    }
  }
  const created = sp.created === "1";
  const assigned = sp.assigned === "1";

  const itemsAdded = sp.items_added === "1";
  const itemsRemoved = sp.items_removed === "1";
  const metaSaved = sp.meta_saved === "1";

  const rawTab = String(sp.tab ?? "").toLowerCase().trim();
  const activeTab =
    rawTab === "items" || rawTab === "notes" || rawTab === "summary"
      ? rawTab
      : "summary";

  const returnParams = new URLSearchParams();
  if (code) returnParams.set("code", code);
  if (lpnIdParam) returnParams.set("lpn_id", lpnIdParam);

  const returnTo = returnParams.toString()
    ? `/inventory/lpns?${returnParams.toString()}`
    : "/inventory/lpns";

  let supabase: any;
  let user: any;
  try {
    supabase = await createClient();
    ({ supabase, user } = await requireAppAccess({
      appId: "nexo",
      returnTo,
      supabase,
      permissionCode: "inventory.lpns",
    }));
  } catch (e: any) {
    console.error("[inventory/lpns] auth guard failed:", e);

    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <div className="font-semibold">Error validando acceso</div>
          <div className="mt-2 text-red-800/90">
            No se pudo validar la sesión o permisos. Revisa los logs del servidor.
          </div>
          <div className="mt-3 rounded-xl bg-white/60 p-3 font-mono text-xs text-red-900">
            {String(e?.message ?? e)}
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    redirect(`/no-access?returnTo=${encodeURIComponent(returnTo)}`);
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
  const { data: locationsRaw, error: locErr } = await supabase
    .from("inventory_locations")
    .select("id,code")
    .order("code", { ascending: true })
    .limit(500);

  const locations = (locationsRaw ?? []) as InventoryLocationRow[];

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
  // Server action: guardar contenido libre (label/notes) en inventory_lpns
  async function saveLpnMetaAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const { data } = await supabase.auth.getUser();
    const user = data.user ?? null;
    if (!user) redirect(`/inventory/lpns?error=${encodeURIComponent("Sesión requerida")}`);

    const code = String(formData.get("code") ?? "").trim();
    const lpn_id = String(formData.get("lpn_id") ?? "").trim();
    const label = String(formData.get("label") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    if (!lpn_id) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta lpn_id.")}`);

    const payload: any = {
      label: label || null,
      notes: notes || null,
    };

    const { error } = await supabase.from("inventory_lpns").update(payload).eq("id", lpn_id);
    if (error) redirect(`/inventory/lpns?error=${encodeURIComponent(error.message)}`);

    revalidatePath("/inventory/lpns");

    const qs = new URLSearchParams();
    if (code) qs.set("code", code);
    qs.set("lpn_id", lpn_id);
    qs.set("meta_saved", "1");
    redirect(`/inventory/lpns?${qs.toString()}`);
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
    let unit = String(formData.get("unit") ?? "").trim();
    const qtyStr = String(formData.get("quantity") ?? "").trim();

    const lot_number_raw = String(formData.get("lot_number") ?? "").trim();
    const expiry_date_raw = String(formData.get("expiry_date") ?? "").trim(); // YYYY-MM-DD
    const cost_raw = String(formData.get("cost_per_unit") ?? "").trim();

    if (!lpn_id) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta lpn_id.")}`);
    if (!product_id) redirect(`/inventory/lpns?error=${encodeURIComponent("Falta product_id.")}`);
    // Enforce: producto debe estar habilitado para inventario
    const { data: prof, error: profErr } = await supabase
      .from("product_inventory_profiles")
      .select("track_inventory,default_unit")
      .eq("product_id", product_id)
      .limit(1)
      .maybeSingle();

    if (profErr) redirect(`/inventory/lpns?error=${encodeURIComponent(profErr.message)}`);
    if (!prof?.track_inventory) {
      redirect(`/inventory/lpns?error=${encodeURIComponent("Producto no habilitado para inventario (track_inventory=false).")}`);
    }

    // Si no escribieron unidad, usar default_unit del perfil
    if (!unit) unit = String(prof?.default_unit ?? "").trim();

    if (!unit) {
      redirect(`/inventory/lpns?error=${encodeURIComponent("Falta unit (y el producto no tiene default_unit).")}`);
    }

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
  // Productos inventariables (insumos/terminados/empaques, etc.)
  const { data: invProfiles, error: invProfilesErr } = await supabase
    .from("product_inventory_profiles")
    .select("product_id,inventory_kind,default_unit,products(*)")
    .eq("track_inventory", true)
    .limit(2000);

  const invProducts = (invProfiles ?? []) as any as InvProductRow[];

  // Map para render rápido (items -> nombre)
  const invProductMap = new Map<string, { label: string; default_unit: string | null; kind: string | null }>();
  for (const r of invProducts) {
    const p = (r as any).products ?? null;
    invProductMap.set(r.product_id, {
      label: productDisplay(p),
      default_unit: r.default_unit ?? null,
      kind: r.inventory_kind ?? null,
    });
  }
  // LPNs (con filtro por code si viene del scanner)
  let q = supabase
    .from("inventory_lpns")
    .select("id,code,location_id,label,notes")
    .order("code", { ascending: false })
    .limit(200);

  if (code) q = q.eq("code", code);

  const [{ data: lpnsRaw, error: lpnsError }] = await Promise.all([q]);
  const lpns = (lpnsRaw ?? []) as InventoryLpnRow[];

  const locMap = new Map<string, { code: string }>();
  for (const loc of locations ?? []) {
    locMap.set(loc.id, { code: loc.code });
  }

  // Preselección si viene code y hay match exacto
  const preselectedLpnId =
    code && lpns[0]?.code === code ? (lpns[0]?.id ?? "") : "";
  const activeLpnId = lpnIdParam || preselectedLpnId || "";
  const activeLpn = activeLpnId ? lpns.find((x) => x.id === activeLpnId) ?? null : null;

  const activeLabel = String(activeLpn?.label ?? "");
  const activeNotes = String(activeLpn?.notes ?? "");
  const activeCode = String(activeLpn?.code ?? "");

  function hrefWith(next: { lpn_id?: string; tab?: string; clearCode?: boolean } = {}) {
    const qs = new URLSearchParams();

    if (!next.clearCode && code) qs.set("code", code);

    // lpn_id: si lo pasan explícito, úsalo; si no, usa el activo actual
    const nextLpn =
      typeof next.lpn_id === "string" ? next.lpn_id : activeLpnId;
    if (nextLpn) qs.set("lpn_id", nextLpn);

    const nextTab = next.tab ?? activeTab;
    if (nextTab) qs.set("tab", nextTab);

    const s = qs.toString();
    return s ? `/inventory/lpns?${s}` : "/inventory/lpns";
  }

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
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-9 w-1.5 rounded-full bg-amber-500" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Inventario · LPN</h1>
              <p className="mt-1 text-sm text-zinc-600">
                Contenedores (LPN) para ubicación (LOC), contenido (items) y notas (manifest).
              </p>
            </div>
          </div>

          {code ? (
            <div className="mt-3 text-sm text-zinc-700">
              Filtro desde Scanner: <span className="font-mono">{code}</span>{" "}
              <Link className="ml-3 text-zinc-900 underline underline-offset-2" href={hrefWith({ clearCode: true })}>
                limpiar
              </Link>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/scanner"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
          >
            Scanner
          </Link>

          <Link
            href="/printing/jobs"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
          >
            Imprimir
          </Link>
        </div>
      </div>

      {/* Alerts */}
      <div className="mb-6 grid gap-3">
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

        {metaSaved ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Contenido libre del LPN guardado.
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

        {invProfilesErr ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            Falló el SELECT de productos inventariables: {invProfilesErr.message}
          </div>
        ) : null}

        {!invProfilesErr && invProducts.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No hay productos habilitados para inventario todavía. Agrega filas a{" "}
            <span className="font-mono">product_inventory_profiles</span> (track_inventory=true).
          </div>
        ) : null}
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: List */}
        <aside className="lg:col-span-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">LPNs</div>
                <div className="mt-1 text-sm text-zinc-600">Selecciona un LPN para ver detalle.</div>
              </div>
              <div className="text-xs text-zinc-500">{(lpns ?? []).length}/200</div>
            </div>

            {/* Crear LPN (colapsable) */}
            <details className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-900">
                Crear LPN
              </summary>
              <div className="mt-4">
                <LpnCreateForm defaultSiteId={defaultSiteId} action={createLpnAction} />
              </div>
            </details>

            {/* Selector rápido (GET) */}
            <form method="get" action="/inventory/lpns" className="mt-4 grid gap-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-zinc-600">Abrir LPN</label>
                  <select
                    name="lpn_id"
                    defaultValue={activeLpnId}
                    className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                  >
                    <option value="">Selecciona…</option>
                    {lpns.map((lpn) => (
                      <option key={lpn.id} value={lpn.id}>
                        {lpn.code}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-600">Tab</label>
                  <select
                    name="tab"
                    defaultValue={activeTab}
                    className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                  >
                    <option value="summary">Resumen</option>
                    <option value="items">Items</option>
                    <option value="notes">Notas</option>
                  </select>
                </div>
              </div>

              {code ? <input type="hidden" name="code" value={code} /> : null}

              <button className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800">
                Abrir
              </button>
            </form>

            {/* Lista */}
            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200">
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                      <th className="border-b border-zinc-200 px-3 py-2">Código</th>
                      <th className="border-b border-zinc-200 px-3 py-2">LOC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lpns.map((lpn) => {
                      const loc = lpn.location_id ? locMap.get(lpn.location_id) : null;
                      const isActive = lpn.id === activeLpnId;

                      return (
                        <tr key={lpn.id} className={isActive ? "bg-amber-50/40" : "bg-white"}>
                          <td className="border-b border-zinc-100 px-3 py-3">
                            <Link
                              href={hrefWith({ lpn_id: lpn.id })}
                              className={[
                                "block rounded-xl px-2 py-1.5 font-mono text-sm",
                                isActive
                                  ? "text-zinc-900 ring-1 ring-inset ring-amber-300"
                                  : "text-zinc-800 hover:bg-zinc-50",
                              ].join(" ")}
                            >
                              {lpn.code}
                              {lpn.label ? (
                                <div className="mt-1 text-xs font-sans text-zinc-600">{lpn.label}</div>
                              ) : null}
                            </Link>
                          </td>
                          <td className="border-b border-zinc-100 px-3 py-3">
                            {loc ? (
                              <span className="font-mono text-sm text-zinc-800">{loc.code}</span>
                            ) : (
                              <span className="text-sm text-zinc-500">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {lpns.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-3 py-6 text-sm text-zinc-500">
                          No hay LPNs para mostrar (o RLS no te permite verlos).
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            {lpnsError ? (
              <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
                Falló el SELECT: {lpnsError.message}
              </div>
            ) : null}
          </div>
        </aside>

        {/* Right: Detail */}
        <section className="lg:col-span-8">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            {!activeLpnId ? (
              <div className="rounded-2xl bg-zinc-50 p-6">
                <div className="text-sm font-semibold text-zinc-900">Selecciona un LPN</div>
                <div className="mt-1 text-sm text-zinc-600">
                  Elige un LPN en la lista para ver Resumen, Items y Notas.
                </div>
              </div>
            ) : (
              <>
                {/* Detail header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-zinc-500">LPN</div>
                    <div className="mt-1 font-mono text-xl font-semibold text-zinc-900">{activeCode}</div>
                    {activeLabel ? (
                      <div className="mt-1 text-sm text-zinc-700">{activeLabel}</div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      {activeLpn?.location_id && locMap.get(activeLpn.location_id) ? (
                        <span className="rounded-full bg-zinc-100 px-3 py-1 font-mono text-zinc-700">
                          {locMap.get(activeLpn.location_id)!.code}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-800">
                          Sin LOC
                        </span>
                      )}

                      <span className="rounded-full bg-white px-3 py-1 text-zinc-600 ring-1 ring-inset ring-zinc-200">
                        Items: {lpnItems.length}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/printing/jobs"
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-600"
                    >
                      Imprimir LPN
                    </Link>
                  </div>
                </div>

                {/* Tabs */}
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href={hrefWith({ tab: "summary" })}
                    className={[
                      "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold ring-1 ring-inset",
                      activeTab === "summary"
                        ? "bg-amber-50 text-amber-900 ring-amber-200"
                        : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    Resumen
                  </Link>

                  <Link
                    href={hrefWith({ tab: "items" })}
                    className={[
                      "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold ring-1 ring-inset",
                      activeTab === "items"
                        ? "bg-amber-50 text-amber-900 ring-amber-200"
                        : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    Items
                  </Link>

                  <Link
                    href={hrefWith({ tab: "notes" })}
                    className={[
                      "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold ring-1 ring-inset",
                      activeTab === "notes"
                        ? "bg-amber-50 text-amber-900 ring-amber-200"
                        : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50",
                    ].join(" ")}
                  >
                    Notas
                  </Link>
                </div>

                {/* Tab panels */}
                <div className="mt-5">
                  {/* SUMMARY */}
                  {activeTab === "summary" ? (
                    <div className="grid gap-4">
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="text-sm font-semibold text-zinc-900">Putaway (LPN → LOC)</div>
                        <div className="mt-1 text-sm text-zinc-600">
                          Asigna un LOC a este LPN (actualiza <span className="font-mono">location_id</span>).
                        </div>

                        <form action={putawayAction} className="mt-4 grid gap-3 sm:grid-cols-2">
                          <input type="hidden" name="lpn_id" value={activeLpnId} />

                          <div>
                            <label className="text-xs font-semibold text-zinc-600">LOC destino</label>
                            <select
                              name="location_id"
                              className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                            >
                              <option value="">Selecciona un LOC…</option>
                              {locations.map((loc) => (
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

                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="text-sm font-semibold text-zinc-900">Resumen</div>
                        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="rounded-xl bg-zinc-50 p-3">
                            <div className="text-xs font-semibold text-zinc-500">Label</div>
                            <div className="mt-1 text-sm text-zinc-800">{activeLabel || "—"}</div>
                          </div>
                          <div className="rounded-xl bg-zinc-50 p-3">
                            <div className="text-xs font-semibold text-zinc-500">Notas</div>
                            <div className="mt-1 text-sm text-zinc-800 line-clamp-3">
                              {activeNotes ? activeNotes : "—"}
                            </div>
                            <div className="mt-2">
                              <Link
                                href={hrefWith({ tab: "notes" })}
                                className="text-sm font-semibold text-amber-700 underline underline-offset-2"
                              >
                                Editar notas
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* ITEMS */}
                  {activeTab === "items" ? (
                    <div className="grid gap-4">
                      {itemsErr ? (
                        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
                          Falló el SELECT de items: {itemsErr.message}
                        </div>
                      ) : null}

                      <div className="overflow-hidden rounded-2xl border border-zinc-200">
                        <div className="max-h-[360px] overflow-auto">
                          <table className="w-full border-separate border-spacing-0">
                            <thead className="sticky top-0 z-10 bg-white">
                              <tr className="text-left text-xs font-semibold tracking-wide text-zinc-500">
                                <th className="border-b border-zinc-200 px-3 py-2">Producto</th>
                                <th className="border-b border-zinc-200 px-3 py-2">Qty</th>
                                <th className="border-b border-zinc-200 px-3 py-2">Unidad</th>
                                <th className="border-b border-zinc-200 px-3 py-2">Lote</th>
                                <th className="border-b border-zinc-200 px-3 py-2">Vence</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lpnItems.map((it) => (
                                <tr key={it.id} className="text-sm text-zinc-800">
                                  <td className="border-b border-zinc-100 px-3 py-3">
                                    <div className="text-sm text-zinc-900">
                                      {invProductMap.get(it.product_id)?.label ??
                                        `${String(it.product_id).slice(0, 8)}…`}
                                    </div>
                                    <div className="text-xs text-zinc-500 font-mono">{it.product_id}</div>
                                  </td>
                                  <td className="border-b border-zinc-100 px-3 py-3 font-mono">
                                    {String(it.quantity)}
                                  </td>
                                  <td className="border-b border-zinc-100 px-3 py-3">{it.unit}</td>
                                  <td className="border-b border-zinc-100 px-3 py-3 font-mono">
                                    {it.lot_number ?? "—"}
                                  </td>
                                  <td className="border-b border-zinc-100 px-3 py-3 font-mono">
                                    {it.expiry_date ?? "—"}
                                  </td>
                                </tr>
                              ))}

                              {lpnItems.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="px-3 py-6 text-sm text-zinc-500">
                                    Este LPN no tiene items (o RLS no te permite verlos).
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                          <div className="text-sm font-semibold text-zinc-900">Agregar item</div>

                          <form action={addItemAction} className="mt-3 grid gap-3">
                            {code ? <input type="hidden" name="code" value={code} /> : null}
                            <input type="hidden" name="lpn_id" value={activeLpnId} />

                            <div>
                              <label className="text-xs font-semibold text-zinc-600">Producto (inventariable)</label>
                              <input
                                name="product_id"
                                list="inv-products"
                                placeholder="Busca y selecciona…"
                                className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                              />
                              <datalist id="inv-products">
                                {invProducts.map((r) => (
                                  <option
                                    key={r.product_id}
                                    value={r.product_id}
                                    label={productDisplay((r as any).products)}
                                  />
                                ))}
                              </datalist>
                              <div className="mt-1 text-xs text-zinc-500">
                                Solo aparecen productos con <span className="font-mono">track_inventory=true</span>.
                              </div>
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
                    </div>
                  ) : null}

                  {/* NOTES */}
                  {activeTab === "notes" ? (
                    <div className="grid gap-4">
                      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="text-sm font-semibold text-zinc-900">Contenido libre (Navidad / Activos)</div>
                        <div className="mt-1 text-sm text-zinc-600">
                          Para cajas o activos sin SKU: guarda un nombre corto y una lista libre del contenido.
                        </div>

                        <form action={saveLpnMetaAction} className="mt-4 grid gap-3">
                          {code ? <input type="hidden" name="code" value={code} /> : null}
                          <input type="hidden" name="lpn_id" value={activeLpnId} />

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="text-xs font-semibold text-zinc-600">Nombre corto (label)</label>
                              <input
                                name="label"
                                defaultValue={activeLabel}
                                placeholder="Ej: NAVIDAD · Caja 01"
                                className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-semibold text-zinc-600">Código</label>
                              <input
                                value={activeCode}
                                readOnly
                                className="mt-1 h-11 w-full rounded-xl bg-zinc-50 px-3 text-sm text-zinc-700 ring-1 ring-inset ring-zinc-200 focus:outline-none"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-zinc-600">Contenido (notes)</label>
                            <textarea
                              name="notes"
                              defaultValue={activeNotes}
                              placeholder={"Ej:\n- Luces árbol (blancas)\n- Extensiones x2\n- Esferas rojas\n- Ganchos\n"}
                              rows={10}
                              className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
                            />
                          </div>

                          <button className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800">
                            Guardar
                          </button>
                        </form>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
