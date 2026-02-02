import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";

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

type SupplierLinkRow = {
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
  site_id: string;
  is_active: boolean | null;
  default_area_kind: string | null;
  sites?: { id: string; name: string | null } | null;
};

export default async function ProductCatalogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { supabase } = await requireAppAccess({
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

  const { data: supplierLinks } = await supabase
    .from("product_suppliers")
    .select(
      "supplier_id,supplier_sku,purchase_unit,purchase_unit_size,purchase_price,currency,lead_time_days,min_order_qty,is_primary,suppliers(id,name)"
    )
    .eq("product_id", id)
    .order("is_primary", { ascending: false });

  const supplierRows = (supplierLinks ?? []) as SupplierLinkRow[];

  const { data: siteSettings } = await supabase
    .from("product_site_settings")
    .select("site_id,is_active,default_area_kind,sites(id,name)")
    .eq("product_id", id);

  const siteRows = (siteSettings ?? []) as SiteSettingRow[];

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
