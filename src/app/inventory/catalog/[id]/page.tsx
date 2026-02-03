import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProductSiteSettingsEditor } from "@/features/inventory/catalog/product-site-settings-editor";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type ProductRow = {
  id: string;
  name: string | null;
  description: string | null;
  sku: string | null;
  unit: string | null;
  product_type: string | null;
  category_id: string | null;
  price: number | null;
  cost: number | null;
  is_active: boolean | null;
};

type InventoryProfileRow = {
  product_id: string;
  track_inventory: boolean;
  inventory_kind: string;
  default_unit: string | null;
  lot_tracking: boolean;
  expiry_tracking: boolean;
};

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
};

type SiteSettingRow = {
  id?: string;
  site_id: string;
  is_active: boolean | null;
  default_area_kind: string | null;
  sites?: { id: string; name: string | null } | null;
};

type AreaKindRow = {
  code: string;
  name: string | null;
};

type SiteOptionRow = { id: string; name: string | null };

type SearchParams = {
  ok?: string;
  error?: string;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

async function updateProduct(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/catalog"));
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = String(employee?.role ?? "").toLowerCase();
  if (!["propietario", "gerente_general"].includes(role)) {
    redirect(`/inventory/catalog?error=${encodeURIComponent("No tienes permisos para editar productos.")}`);
  }

  const productId = asText(formData.get("product_id"));
  if (!productId) {
    redirect("/inventory/catalog?error=" + encodeURIComponent("Producto inválido."));
  }

  const payload = {
    name: asText(formData.get("name")),
    description: asText(formData.get("description")) || null,
    sku: asText(formData.get("sku")) || null,
    unit: asText(formData.get("unit")) || null,
    product_type: asText(formData.get("product_type")) || null,
    category_id: asText(formData.get("category_id")) || null,
    price: formData.get("price") ? Number(formData.get("price")) : null,
    cost: formData.get("cost") ? Number(formData.get("cost")) : null,
    is_active: Boolean(formData.get("is_active")),
  };

  const { error: updateErr } = await supabase
    .from("products")
    .update(payload)
    .eq("id", productId);
  if (updateErr) {
    redirect(`/inventory/catalog/${productId}?error=${encodeURIComponent(updateErr.message)}`);
  }

  const profilePayload = {
    product_id: productId,
    track_inventory: Boolean(formData.get("track_inventory")),
    inventory_kind: asText(formData.get("inventory_kind")) || "unclassified",
    default_unit: asText(formData.get("default_unit")) || null,
    lot_tracking: Boolean(formData.get("lot_tracking")),
    expiry_tracking: Boolean(formData.get("expiry_tracking")),
  };

  const { error: profileErr } = await supabase
    .from("product_inventory_profiles")
    .upsert(profilePayload, { onConflict: "product_id" });
  if (profileErr) {
    redirect(`/inventory/catalog/${productId}?error=${encodeURIComponent(profileErr.message)}`);
  }

  const siteSettingsRaw = formData.get("site_settings_lines");
  if (typeof siteSettingsRaw === "string" && siteSettingsRaw) {
    try {
      const siteLines = JSON.parse(siteSettingsRaw) as Array<{
        id?: string;
        site_id?: string;
        is_active?: boolean;
        default_area_kind?: string;
        _delete?: boolean;
      }>;
      const toDelete = siteLines.filter((l) => l.id && l._delete).map((l) => l.id as string);
      for (const id of toDelete) {
        await supabase.from("product_site_settings").delete().eq("id", id);
      }
      for (const line of siteLines) {
        if (line._delete || !line.site_id) continue;
        const row = {
          product_id: productId,
          site_id: line.site_id,
          is_active: Boolean(line.is_active),
          default_area_kind: line.default_area_kind || null,
        };
        if (line.id) {
          const { error: upErr } = await supabase
            .from("product_site_settings")
            .update(row)
            .eq("id", line.id);
          if (upErr) redirect(`/inventory/catalog/${productId}?error=${encodeURIComponent(upErr.message)}`);
        } else {
          const { error: insErr } = await supabase.from("product_site_settings").insert(row);
          if (insErr) redirect(`/inventory/catalog/${productId}?error=${encodeURIComponent(insErr.message)}`);
        }
      }
    } catch {
      // ignore invalid JSON
    }
  }

  redirect(`/inventory/catalog/${productId}?ok=1`);
}

export default async function ProductCatalogDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const okMsg = sp.ok ? "Producto actualizado." : "";
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/catalog/${id}`,
    permissionCode: PERMISSION,
  });

  const { data: product } = await supabase
    .from("products")
    .select("id,name,description,sku,unit,product_type,category_id,price,cost,is_active")
    .eq("id", id)
    .maybeSingle();

  if (!product) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("product_inventory_profiles")
    .select("product_id,track_inventory,inventory_kind,default_unit,lot_tracking,expiry_tracking")
    .eq("product_id", id)
    .maybeSingle();

  const { data: categories } = await supabase
    .from("product_categories")
    .select("id,name,parent_id")
    .order("name", { ascending: true });

  const categoryRows = (categories ?? []) as CategoryRow[];
  const categoryMap = new Map(categoryRows.map((row) => [row.id, row]));

  const categoryPath = (categoryId: string | null) => {
    if (!categoryId) return "Sin categoria";
    const parts: string[] = [];
    let current = categoryMap.get(categoryId);
    let safety = 0;
    while (current && safety < 6) {
      parts.unshift(current.name);
      current = current.parent_id ? categoryMap.get(current.parent_id) : undefined;
      safety += 1;
    }
    return parts.join(" / ");
  };

  const { data: siteSettings } = await supabase
    .from("product_site_settings")
    .select("id,site_id,is_active,default_area_kind,sites(id,name)")
    .eq("product_id", id);

  const siteRows = (siteSettings ?? []) as SiteSettingRow[];

  const { data: sitesData } = await supabase
    .from("sites")
    .select("id,name")
    .eq("is_active", true)
    .order("name", { ascending: true });
  const sitesList = (sitesData ?? []) as SiteOptionRow[];

  const { data: areaKindsData } = await supabase
    .from("area_kinds")
    .select("code,name")
    .order("name", { ascending: true });
  const areaKindsList = (areaKindsData ?? []) as AreaKindRow[];

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = String(employee?.role ?? "").toLowerCase();
  const canEdit = ["propietario", "gerente_general"].includes(role);

  const productRow = product as ProductRow;
  const profileRow = (profile ?? null) as InventoryProfileRow | null;

  return (
    <div className="w-full space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">{productRow.name ?? "Producto"}</h1>
          <p className="mt-2 ui-body-muted">
            Ficha completa del producto y sus relaciones.
          </p>
        </div>
        <Link href="/inventory/catalog" className="ui-btn ui-btn--ghost">
          Volver al catalogo
        </Link>
      </div>

      {errorMsg ? (
        <div className="ui-alert ui-alert--error">Error: {errorMsg}</div>
      ) : null}
      {okMsg ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {okMsg}
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm text-[var(--ui-muted)]">
        <strong className="text-[var(--ui-text)]">¿Cómo crear ubicaciones (LOCs)?</strong> Ve a{" "}
        <Link href="/inventory/locations" className="font-medium underline decoration-[var(--ui-border)] underline-offset-2">
          Inventario → Ubicaciones
        </Link>
        , elige la sede y crea LOCs desde la plantilla o uno a uno. Luego en Entradas asignas cada ítem a un LOC al recibir.
      </div>

      {canEdit ? (
        <form action={updateProduct} className="ui-panel space-y-6">
          <input type="hidden" name="product_id" value={productRow.id} />

          <section className="space-y-3">
            <h2 className="ui-h3">Identificación</h2>
            <p className="text-sm text-[var(--ui-muted)]">Nombre, código y descripción del producto.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Nombre</span>
                <input name="name" defaultValue={productRow.name ?? ""} className="ui-input" placeholder="Ej. Harina 000" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">SKU</span>
                <input name="sku" defaultValue={productRow.sku ?? ""} className="ui-input font-mono" placeholder="Código único" />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="ui-label">Descripción</span>
                <input name="description" defaultValue={productRow.description ?? ""} className="ui-input" placeholder="Opcional" />
              </label>
            </div>
          </section>

          <section className="space-y-3 border-t border-[var(--ui-border)] pt-6">
            <h2 className="ui-h3">Clasificación</h2>
            <p className="text-sm text-[var(--ui-muted)]">Tipo de producto y categoría para filtros y reportes.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Tipo</span>
                <select name="product_type" defaultValue={productRow.product_type ?? ""} className="ui-input">
                  <option value="">Sin definir</option>
                  <option value="insumo">Insumo</option>
                  <option value="preparacion">Preparación</option>
                  <option value="venta">Venta</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Categoría</span>
                <select name="category_id" defaultValue={productRow.category_id ?? ""} className="ui-input">
                  <option value="">Sin categoría</option>
                  {categoryRows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {categoryPath(row.id)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="space-y-3 border-t border-[var(--ui-border)] pt-6">
            <h2 className="ui-h3">Unidades y precios</h2>
            <p className="text-sm text-[var(--ui-muted)]">Unidad de medida (kg, L, un, etc.), precio de venta y costo para inventario.</p>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Unidad</span>
                <input name="unit" defaultValue={productRow.unit ?? ""} className="ui-input" placeholder="kg, L, un" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Precio de venta</span>
                <input name="price" type="number" step="0.01" defaultValue={productRow.price ?? ""} className="ui-input" placeholder="0.00" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Costo</span>
                <input name="cost" type="number" step="0.01" defaultValue={productRow.cost ?? ""} className="ui-input" placeholder="Costo actual" />
              </label>
            </div>
          </section>

          <section className="space-y-3 border-t border-[var(--ui-border)] pt-6">
            <h2 className="ui-h3">Inventario</h2>
            <p className="text-sm text-[var(--ui-muted)]">Si se controla stock, tipo (insumo/terminado/reventa/etc.) y si usa lotes o vencimiento.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Tipo de inventario</span>
                <select name="inventory_kind" defaultValue={profileRow?.inventory_kind ?? "unclassified"} className="ui-input">
                  <option value="unclassified">Sin clasificar</option>
                  <option value="ingredient">Insumo</option>
                  <option value="finished">Producto terminado</option>
                  <option value="resale">Reventa</option>
                  <option value="packaging">Empaque</option>
                  <option value="asset">Activo</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Unidad por defecto (inventario)</span>
                <input name="default_unit" defaultValue={profileRow?.default_unit ?? ""} className="ui-input" placeholder="Misma que Unidad si está vacío" />
              </label>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="track_inventory" defaultChecked={Boolean(profileRow?.track_inventory)} />
                <span className="ui-label">Controlar stock</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="lot_tracking" defaultChecked={Boolean(profileRow?.lot_tracking)} />
                <span className="ui-label">Lotes</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="expiry_tracking" defaultChecked={Boolean(profileRow?.expiry_tracking)} />
                <span className="ui-label">Vencimiento</span>
              </label>
            </div>
          </section>

          <section className="space-y-3 border-t border-[var(--ui-border)] pt-6">
            <h2 className="ui-h3">Estado</h2>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_active" defaultChecked={Boolean(productRow.is_active)} />
              <span className="ui-label">Producto activo</span>
            </label>
          </section>

          <section className="space-y-3 border-t border-[var(--ui-border)] pt-6">
            <h2 className="ui-h3">Por sede</h2>
            <p className="text-sm text-[var(--ui-muted)]">En qué sedes aparece este producto y área sugerida para remisiones.</p>
            <ProductSiteSettingsEditor
              name="site_settings_lines"
              initialRows={siteRows.map((r) => ({
                id: r.id,
                site_id: r.site_id,
                is_active: Boolean(r.is_active),
                default_area_kind: r.default_area_kind ?? "",
              }))}
              sites={sitesList.map((s) => ({ id: s.id, name: s.name }))}
              areaKinds={areaKindsList.map((a) => ({ code: a.code, name: a.name ?? a.code }))}
            />
          </section>

          <div className="flex justify-end pt-4">
            <button type="submit" className="ui-btn ui-btn--brand">Guardar cambios</button>
          </div>
        </form>
      ) : null}

      <div className="ui-panel">
        <div className="ui-h3">Resumen</div>
        <p className="mt-1 text-sm text-[var(--ui-muted)]">Datos actuales del producto (solo lectura).</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="ui-label">SKU</div>
            <div className="mt-1 font-mono">{productRow.sku ?? "-"}</div>
          </div>
          <div>
            <div className="ui-label">Unidad</div>
            <div className="mt-1">{productRow.unit ?? "-"}</div>
          </div>
          <div>
            <div className="ui-label">Tipo</div>
            <div className="mt-1">{productRow.product_type ?? "-"}</div>
          </div>
          <div>
            <div className="ui-label">Categoría</div>
            <div className="mt-1">{categoryPath(productRow.category_id)}</div>
          </div>
          <div>
            <div className="ui-label">Precio de venta</div>
            <div className="mt-1">{productRow.price ?? "-"}</div>
          </div>
          <div>
            <div className="ui-label">Costo</div>
            <div className="mt-1">{productRow.cost ?? "-"}</div>
          </div>
          <div className="md:col-span-2">
            <div className="ui-label">Descripción</div>
            <div className="mt-1">{productRow.description ?? "-"}</div>
          </div>
          <div>
            <div className="ui-label">Activo</div>
            <div className="mt-1">{productRow.is_active ? "Sí" : "No"}</div>
          </div>
        </div>
      </div>

      <div className="ui-panel">
        <div className="ui-h3">Perfil de inventario</div>
        {profileRow ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <div className="ui-label">Controlar stock</div>
              <div className="mt-1">{profileRow.track_inventory ? "Sí" : "No"}</div>
            </div>
            <div>
              <div className="ui-label">Tipo inventario</div>
              <div className="mt-1">{profileRow.inventory_kind}</div>
            </div>
            <div>
              <div className="ui-label">Unidad por defecto</div>
              <div className="mt-1">{profileRow.default_unit ?? "-"}</div>
            </div>
            <div>
              <div className="ui-label">Lotes</div>
              <div className="mt-1">{profileRow.lot_tracking ? "Sí" : "No"}</div>
            </div>
            <div>
              <div className="ui-label">Vencimiento</div>
              <div className="mt-1">{profileRow.expiry_tracking ? "Sí" : "No"}</div>
            </div>
          </div>
        ) : (
          <div className="mt-3 ui-body-muted">No hay perfil de inventario.</div>
        )}
      </div>

      <div className="ui-panel rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
        <div className="ui-h3">Proveedores y compras</div>
        <p className="mt-1 text-sm text-[var(--ui-muted)]">
          Los proveedores, órdenes de compra y condiciones de compra se gestionan en <strong>ORIGO</strong> (módulo de compras). En Nexo solo defines el catálogo del producto y en qué sedes está disponible.
        </p>
      </div>

      <div className="ui-panel">
        <div className="ui-h3">Configuración por sede</div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[var(--ui-muted)]">
              <tr>
                <th className="py-2 pr-4">Sede</th>
                <th className="py-2 pr-4">Activo</th>
                <th className="py-2 pr-4">Area default</th>
              </tr>
            </thead>
            <tbody>
              {siteRows.map((row) => (
                <tr key={row.site_id} className="border-t border-zinc-200/60">
                  <td className="py-3 pr-4">{row.sites?.name ?? row.site_id}</td>
                  <td className="py-3 pr-4">{row.is_active ? "Si" : "No"}</td>
                  <td className="py-3 pr-4">{row.default_area_kind ?? "-"}</td>
                </tr>
              ))}
              {!siteRows.length ? (
                <tr>
                  <td className="py-4 text-[var(--ui-muted)]" colSpan={3}>
                    No hay configuracion por sede.
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
