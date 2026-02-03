import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProductSiteSettingsEditor } from "@/features/inventory/catalog/product-site-settings-editor";
import { ProductSuppliersEditor } from "@/features/inventory/catalog/product-suppliers-editor";
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
  cost_original?: number | null;
  production_area_kind?: string | null;
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

type SupplierLinkRow = {
  id?: string;
  supplier_id: string;
  supplier_sku: string | null;
  purchase_unit: string | null;
  purchase_unit_size: number | null;
  purchase_price: number | null;
  currency: string | null;
  lead_time_days: number | null;
  min_order_qty: number | null;
  is_primary: boolean | null;
  suppliers?: { id: string; name: string | null } | null;
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

type SupplierOptionRow = { id: string; name: string | null };
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

  const payload: Record<string, unknown> = {
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
  const costOriginal = formData.get("cost_original");
  if (costOriginal !== null && costOriginal !== undefined && costOriginal !== "")
    payload.cost_original = Number(costOriginal);
  const productionAreaKind = asText(formData.get("production_area_kind"));
  if (productionAreaKind) payload.production_area_kind = productionAreaKind;

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

  const supplierLinesRaw = formData.get("supplier_lines");
  if (typeof supplierLinesRaw === "string" && supplierLinesRaw) {
    try {
      const supplierLines = JSON.parse(supplierLinesRaw) as Array<{
        id?: string;
        supplier_id?: string;
        supplier_sku?: string;
        purchase_unit?: string;
        purchase_unit_size?: number;
        purchase_price?: number;
        currency?: string;
        lead_time_days?: number;
        min_order_qty?: number;
        is_primary?: boolean;
        _delete?: boolean;
      }>;
      const toDelete = supplierLines.filter((l) => l.id && l._delete).map((l) => l.id as string);
      for (const id of toDelete) {
        await supabase.from("product_suppliers").delete().eq("id", id);
      }
      for (const line of supplierLines) {
        if (line._delete || !line.supplier_id) continue;
        const row = {
          product_id: productId,
          supplier_id: line.supplier_id,
          supplier_sku: line.supplier_sku || null,
          purchase_unit: line.purchase_unit || null,
          purchase_unit_size: line.purchase_unit_size ?? null,
          purchase_price: line.purchase_price ?? null,
          currency: line.currency || "COP",
          lead_time_days: line.lead_time_days ?? null,
          min_order_qty: line.min_order_qty ?? null,
          is_primary: Boolean(line.is_primary),
        };
        if (line.id) {
          const { error: upErr } = await supabase
            .from("product_suppliers")
            .update(row)
            .eq("id", line.id);
          if (upErr) redirect(`/inventory/catalog/${productId}?error=${encodeURIComponent(upErr.message)}`);
        } else {
          const { error: insErr } = await supabase.from("product_suppliers").insert(row);
          if (insErr) redirect(`/inventory/catalog/${productId}?error=${encodeURIComponent(insErr.message)}`);
        }
      }
    } catch {
      // ignore invalid JSON
    }
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
    .select("id,name,description,sku,unit,product_type,category_id,price,cost,cost_original,production_area_kind,is_active")
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

  const { data: supplierLinks } = await supabase
    .from("product_suppliers")
    .select(
      "id,supplier_id,supplier_sku,purchase_unit,purchase_unit_size,purchase_price,currency,lead_time_days,min_order_qty,is_primary,suppliers(id,name)"
    )
    .eq("product_id", id)
    .order("is_primary", { ascending: false });

  const supplierRows = (supplierLinks ?? []) as SupplierLinkRow[];

  const { data: siteSettings } = await supabase
    .from("product_site_settings")
    .select("id,site_id,is_active,default_area_kind,sites(id,name)")
    .eq("product_id", id);

  const siteRows = (siteSettings ?? []) as SiteSettingRow[];

  const { data: suppliersData } = await supabase
    .from("suppliers")
    .select("id,name")
    .eq("is_active", true)
    .order("name", { ascending: true });
  const suppliersList = (suppliersData ?? []) as SupplierOptionRow[];

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

      {canEdit ? (
        <form action={updateProduct} className="ui-panel space-y-4">
          <input type="hidden" name="product_id" value={productRow.id} />
          <div className="ui-h3">Editar producto</div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Nombre</span>
              <input name="name" defaultValue={productRow.name ?? ""} className="ui-input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">SKU</span>
              <input name="sku" defaultValue={productRow.sku ?? ""} className="ui-input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Unidad</span>
              <input name="unit" defaultValue={productRow.unit ?? ""} className="ui-input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Tipo</span>
              <select name="product_type" defaultValue={productRow.product_type ?? ""} className="ui-input">
                <option value="">Sin definir</option>
                <option value="insumo">Insumo</option>
                <option value="preparacion">Preparacion</option>
                <option value="venta">Venta</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Categoria</span>
              <select name="category_id" defaultValue={productRow.category_id ?? ""} className="ui-input">
                <option value="">Sin categoria</option>
                {categoryRows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {categoryPath(row.id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Precio</span>
              <input name="price" type="number" step="0.01" defaultValue={productRow.price ?? ""} className="ui-input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Costo</span>
              <input name="cost" type="number" step="0.01" defaultValue={productRow.cost ?? ""} className="ui-input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Costo original</span>
              <input name="cost_original" type="number" step="0.01" defaultValue={productRow.cost_original ?? ""} className="ui-input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Área de producción</span>
              <select name="production_area_kind" defaultValue={productRow.production_area_kind ?? ""} className="ui-input">
                <option value="">Sin definir</option>
                {areaKindsList.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.name ?? a.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="ui-label">Descripcion</span>
              <input name="description" defaultValue={productRow.description ?? ""} className="ui-input" />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_active" defaultChecked={Boolean(productRow.is_active)} />
              <span className="ui-label">Activo</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="track_inventory" defaultChecked={Boolean(profileRow?.track_inventory)} />
              <span className="ui-label">Track inventario</span>
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

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Tipo inventario</span>
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
              <span className="ui-label">Unidad default inventario</span>
              <input name="default_unit" defaultValue={profileRow?.default_unit ?? ""} className="ui-input" />
            </label>
          </div>

          <div className="mt-6 border-t border-[var(--ui-border)] pt-6">
            <ProductSuppliersEditor
              name="supplier_lines"
              initialRows={supplierRows.map((r) => ({
                id: r.id,
                supplier_id: r.supplier_id,
                supplier_sku: r.supplier_sku ?? "",
                purchase_unit: r.purchase_unit ?? "",
                purchase_unit_size: r.purchase_unit_size ?? undefined,
                purchase_price: r.purchase_price ?? undefined,
                currency: r.currency ?? "COP",
                lead_time_days: r.lead_time_days ?? undefined,
                min_order_qty: r.min_order_qty ?? undefined,
                is_primary: Boolean(r.is_primary),
              }))}
              suppliers={suppliersList.map((s) => ({ id: s.id, name: s.name }))}
            />
          </div>

          <div className="mt-6 border-t border-[var(--ui-border)] pt-6">
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
          </div>

          <div className="flex justify-end mt-6">
            <button className="ui-btn ui-btn--brand">Guardar cambios</button>
          </div>
        </form>
      ) : null}

      <div className="ui-panel">
        <div className="ui-h3">Datos base</div>
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
            <div className="ui-label">Categoria</div>
            <div className="mt-1">{categoryPath(productRow.category_id)}</div>
          </div>
          <div>
            <div className="ui-label">Precio</div>
            <div className="mt-1">{productRow.price ?? "-"}</div>
          </div>
          <div>
            <div className="ui-label">Costo</div>
            <div className="mt-1">{productRow.cost ?? "-"}</div>
          </div>
          <div>
            <div className="ui-label">Costo original</div>
            <div className="mt-1">{productRow.cost_original ?? "-"}</div>
          </div>
          <div>
            <div className="ui-label">Área de producción</div>
            <div className="mt-1">{productRow.production_area_kind ?? "-"}</div>
          </div>
          <div className="md:col-span-2">
            <div className="ui-label">Descripcion</div>
            <div className="mt-1">{productRow.description ?? "-"}</div>
          </div>
          <div>
            <div className="ui-label">Activo</div>
            <div className="mt-1">{productRow.is_active ? "Si" : "No"}</div>
          </div>
        </div>
      </div>

      <div className="ui-panel">
        <div className="ui-h3">Perfil de inventario</div>
        {profileRow ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <div className="ui-label">Track inventario</div>
              <div className="mt-1">{profileRow.track_inventory ? "Si" : "No"}</div>
            </div>
            <div>
              <div className="ui-label">Tipo inventario</div>
              <div className="mt-1">{profileRow.inventory_kind}</div>
            </div>
            <div>
              <div className="ui-label">Unidad default</div>
              <div className="mt-1">{profileRow.default_unit ?? "-"}</div>
            </div>
            <div>
              <div className="ui-label">Lotes</div>
              <div className="mt-1">{profileRow.lot_tracking ? "Si" : "No"}</div>
            </div>
            <div>
              <div className="ui-label">Vencimiento</div>
              <div className="mt-1">{profileRow.expiry_tracking ? "Si" : "No"}</div>
            </div>
          </div>
        ) : (
          <div className="mt-3 ui-body-muted">No hay perfil de inventario.</div>
        )}
      </div>

      <div className="ui-panel">
        <div className="ui-h3">Proveedores</div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[var(--ui-muted)]">
              <tr>
                <th className="py-2 pr-4">Proveedor</th>
                <th className="py-2 pr-4">SKU proveedor</th>
                <th className="py-2 pr-4">Unidad compra</th>
                <th className="py-2 pr-4">Tamano unidad</th>
                <th className="py-2 pr-4">Precio</th>
                <th className="py-2 pr-4">Moneda</th>
                <th className="py-2 pr-4">Lead time</th>
                <th className="py-2 pr-4">Min orden</th>
                <th className="py-2 pr-4">Primario</th>
              </tr>
            </thead>
            <tbody>
              {supplierRows.map((row) => (
                <tr key={`${row.supplier_id}-${row.supplier_sku ?? ""}`} className="border-t border-zinc-200/60">
                  <td className="py-3 pr-4">{row.suppliers?.name ?? row.supplier_id}</td>
                  <td className="py-3 pr-4 font-mono">{row.supplier_sku ?? "-"}</td>
                  <td className="py-3 pr-4">{row.purchase_unit ?? "-"}</td>
                  <td className="py-3 pr-4">{row.purchase_unit_size ?? "-"}</td>
                  <td className="py-3 pr-4">{row.purchase_price ?? "-"}</td>
                  <td className="py-3 pr-4">{row.currency ?? "-"}</td>
                  <td className="py-3 pr-4">{row.lead_time_days ?? "-"}</td>
                  <td className="py-3 pr-4">{row.min_order_qty ?? "-"}</td>
                  <td className="py-3 pr-4">{row.is_primary ? "Si" : "-"}</td>
                </tr>
              ))}
              {!supplierRows.length ? (
                <tr>
                  <td className="py-4 text-[var(--ui-muted)]" colSpan={9}>
                    No hay proveedores asociados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ui-panel">
        <div className="ui-h3">Configuracion por sede</div>
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
