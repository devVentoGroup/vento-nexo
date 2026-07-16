import Link from "next/link";

type Site = { id: string; name: string | null };
type Product = { id: string; name: string | null; sku: string | null };
type Area = { code: string; name: string | null };

type Props = {
  sites: Site[];
  products: Product[];
  areas: Area[];
  defaults: {
    productId: string;
    fromSiteId: string;
    toSiteId: string;
    requestingAreaKind: string;
    status: string;
  };
};

export function FulfillmentRouteSelectors({ sites, products, areas, defaults }: Props) {
  return (
    <form method="get" className="grid gap-3 lg:grid-cols-6">
      <label className="flex flex-col gap-1 lg:col-span-2">
        <span className="ui-label">Producto</span>
        <select name="product_id" className="ui-input" defaultValue={defaults.productId}>
          <option value="">Todos</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name ?? product.sku ?? "Producto sin nombre"}
              {product.sku ? ` · ${product.sku}` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="ui-label">Origen</span>
        <select name="from_site_id" className="ui-input" defaultValue={defaults.fromSiteId}>
          <option value="">Todos</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name ?? "Sede sin nombre"}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="ui-label">Destino</span>
        <select name="to_site_id" className="ui-input" defaultValue={defaults.toSiteId}>
          <option value="">Todos</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name ?? "Sede sin nombre"}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="ui-label">Área solicitante</span>
        <select
          name="area_kind"
          className="ui-input"
          defaultValue={defaults.requestingAreaKind}
        >
          <option value="">Todas</option>
          {areas.map((area) => (
            <option key={area.code} value={area.code}>
              {area.name ?? area.code}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="ui-label">Estado</span>
        <select name="status" className="ui-input" defaultValue={defaults.status}>
          <option value="">Todos</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
          <option value="incomplete">Incompletas</option>
        </select>
      </label>

      <div className="flex items-end gap-2 lg:col-span-6">
        <button type="submit" className="ui-btn ui-btn--brand">
          Filtrar
        </button>
        <Link href="/inventory/settings/fulfillment-routes" className="ui-btn ui-btn--ghost">
          Limpiar
        </Link>
      </div>
    </form>
  );
}