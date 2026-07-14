import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
const href = (id: string, q = "") => `/inventory/settings/locations/${id}/catalog${q}`;
const txt = (v: FormDataEntryValue | null) => typeof v === "string" ? v.trim() : "";

async function addProduct(formData: FormData) {
  "use server";
  const locationId = txt(formData.get("location_id"));
  const productId = txt(formData.get("product_id"));
  const { supabase, user } = await requireAppAccess({ appId: "nexo", returnTo: href(locationId), permissionCode: "inventory.stock" });
  if (!locationId || !productId) redirect(href(locationId, "?error=Producto%20inv%C3%A1lido"));
  const { error } = await supabase.from("inventory_location_product_catalog").upsert({
    location_id: locationId,
    product_id: productId,
    is_active: true,
    created_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "location_id,product_id" });
  if (error) redirect(href(locationId, `?error=${encodeURIComponent(error.message)}`));
  revalidatePath(href(locationId));
  redirect(href(locationId, "?ok=added"));
}

async function removeProduct(formData: FormData) {
  "use server";
  const locationId = txt(formData.get("location_id"));
  const productId = txt(formData.get("product_id"));
  const { supabase } = await requireAppAccess({ appId: "nexo", returnTo: href(locationId), permissionCode: "inventory.stock" });
  const { error } = await supabase.from("inventory_location_product_catalog").update({ is_active: false, updated_at: new Date().toISOString() }).eq("location_id", locationId).eq("product_id", productId);
  if (error) redirect(href(locationId, `?error=${encodeURIComponent(error.message)}`));
  revalidatePath(href(locationId));
  redirect(href(locationId, "?ok=removed"));
}

type Params = { id: string };
type Search = { q?: string; ok?: string; error?: string };

export default async function LocationCatalogPage({ params, searchParams }: { params: Promise<Params>; searchParams?: Promise<Search> }) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const q = String(sp.q ?? "").trim();
  const { supabase } = await requireAppAccess({ appId: "nexo", returnTo: href(id), permissionCode: "inventory.stock" });
  const { data: location, error: locationError } = await supabase
    .from("inventory_locations")
    .select("id,site_id,code,description,sites!inventory_locations_site_id_fkey(name)")
    .eq("id", id)
    .maybeSingle();
  if (locationError) {
    throw new Error(`No se pudo cargar el LOC: ${locationError.message}`);
  }
  if (!location) notFound();

  const { data: catalog } = await supabase.from("inventory_location_product_catalog").select("product_id,products(id,name,sku)").eq("location_id", id).eq("is_active", true);
  const catalogRows = (catalog ?? []).map((row: any) => Array.isArray(row.products) ? row.products[0] : row.products).filter(Boolean);
  const catalogIds = new Set(catalogRows.map((p: any) => p.id));

  let available: any[] = [];
  if (q.length >= 2) {
    const { data: settings } = await supabase.from("product_site_settings").select("product_id,inventory_enabled,is_active,products(id,name,sku)").eq("site_id", location.site_id).eq("is_active", true).or("inventory_enabled.eq.true,inventory_enabled.is.null").limit(100);
    available = (settings ?? []).map((row: any) => Array.isArray(row.products) ? row.products[0] : row.products).filter((p: any) => p && !catalogIds.has(p.id) && `${p.name} ${p.sku ?? ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  }

  const site = Array.isArray((location as any).sites) ? (location as any).sites[0] : (location as any).sites;
  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero">
        <Link href={`/inventory/count-initial?site_id=${location.site_id}&location_id=${id}`} className="ui-caption underline">Volver al conteo</Link>
        <h1 className="ui-h1 mt-2">Catálogo esperado del LOC</h1>
        <p className="ui-body-muted mt-2">{site?.name ?? "Sede"} · {location.description ?? location.code}. Aquí defines qué productos deben aparecer aunque su saldo sea cero.</p>
      </section>

      {sp.error ? <div className="ui-alert ui-alert--error">{decodeURIComponent(sp.error)}</div> : null}
      {sp.ok ? <div className="ui-alert ui-alert--success">Catálogo actualizado.</div> : null}

      <section className="ui-panel ui-remission-section space-y-4">
        <div className="ui-h3">Productos esperados ({catalogRows.length})</div>
        <div className="grid gap-2 md:grid-cols-2">
          {catalogRows.map((product: any) => (
            <form key={product.id} action={removeProduct} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] p-3">
              <input type="hidden" name="location_id" value={id} /><input type="hidden" name="product_id" value={product.id} />
              <div><div className="font-medium">{product.name}</div><div className="ui-caption">{product.sku ?? "Sin SKU"}</div></div>
              <button className="ui-btn ui-btn--ghost ui-btn--sm">Retirar</button>
            </form>
          ))}
          {!catalogRows.length ? <div className="ui-alert ui-alert--warn md:col-span-2">Este LOC todavía no tiene catálogo esperado.</div> : null}
        </div>
      </section>

      <section className="ui-panel ui-remission-section space-y-4">
        <div><div className="ui-h3">Agregar productos</div><p className="ui-caption mt-1">Busca dentro de los productos habilitados para inventario en esta sede.</p></div>
        <form method="get" className="flex gap-2"><input name="q" defaultValue={q} className="ui-input flex-1" placeholder="Nombre o SKU" /><button className="ui-btn ui-btn--brand">Buscar</button></form>
        <div className="space-y-2">
          {available.map((product: any) => (
            <form key={product.id} action={addProduct} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] p-3">
              <input type="hidden" name="location_id" value={id} /><input type="hidden" name="product_id" value={product.id} />
              <div><div className="font-medium">{product.name}</div><div className="ui-caption">{product.sku ?? "Sin SKU"}</div></div>
              <button className="ui-btn ui-btn--brand ui-btn--sm">Agregar</button>
            </form>
          ))}
          {q.length >= 2 && !available.length ? <div className="ui-empty">No hay productos disponibles para esa búsqueda.</div> : null}
        </div>
      </section>
    </div>
  );
}
