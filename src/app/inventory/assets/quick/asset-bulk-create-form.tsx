"use client";

import { useMemo, useState } from "react";

type BulkAction = (formData: FormData) => void | Promise<void>;

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
};

type SiteRow = {
  id: string;
  name: string | null;
};

type AreaRow = {
  id: string;
  site_id: string;
  name: string | null;
  kind: string | null;
};

type LocationRow = {
  id: string;
  site_id: string;
  area_id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type PositionRow = {
  id: string;
  site_id: string;
  location_id: string;
  code: string | null;
  name: string | null;
  kind: string | null;
};

type BulkRow = {
  key: string;
  productId: string;
  name: string;
  siteId: string;
  areaId: string;
  locationId: string;
  locationPositionId: string;
  qty: string;
  unitCode: string;
  conditionStatus: string;
  notes: string;
};

type AssetBulkCreateFormProps = {
  action: BulkAction;
  products: ProductRow[];
  sites: SiteRow[];
  areas: AreaRow[];
  locations: LocationRow[];
  positions: PositionRow[];
};

function newRow(products: ProductRow[], sites: SiteRow[]): BulkRow {
  return {
    key: crypto.randomUUID(),
    productId: products[0]?.id ?? "",
    name: products[0]?.name ?? "",
    siteId: sites[0]?.id ?? "",
    areaId: "",
    locationId: "",
    locationPositionId: "",
    qty: "",
    unitCode: "un",
    conditionStatus: "bueno",
    notes: "",
  };
}

function productLabel(product: ProductRow) {
  return [product.name, product.sku ? `SKU ${product.sku}` : ""].filter(Boolean).join(" - ") || product.id;
}

function locationLabel(location: LocationRow) {
  return [location.code, location.zone, location.description].filter(Boolean).join(" - ") || location.id;
}

function positionLabel(position: PositionRow) {
  return [position.name, position.code, position.kind].filter(Boolean).join(" - ") || position.id;
}

function rowsForSubmit(rows: BulkRow[]) {
  return rows
    .map((row) => ({
      product_id: row.productId,
      name: row.name.trim(),
      site_id: row.siteId,
      area_id: row.areaId || null,
      location_id: row.locationId || null,
      location_position_id: row.locationPositionId || null,
      expected_qty: Number(row.qty),
      unit_code: row.unitCode.trim() || "un",
      condition_status: row.conditionStatus,
      notes: row.notes.trim() || null,
    }))
    .filter((row) => row.product_id && row.name && row.site_id && Number.isFinite(row.expected_qty) && row.expected_qty >= 0);
}

export function AssetBulkCreateForm({
  action,
  products,
  sites,
  areas,
  locations,
  positions,
}: AssetBulkCreateFormProps) {
  const [rows, setRows] = useState<BulkRow[]>(() => [newRow(products, sites), newRow(products, sites), newRow(products, sites)]);

  const areasBySite = useMemo(() => {
    const map = new Map<string, AreaRow[]>();
    for (const area of areas) {
      const list = map.get(area.site_id) ?? [];
      list.push(area);
      map.set(area.site_id, list);
    }
    return map;
  }, [areas]);

  const positionsByLocation = useMemo(() => {
    const map = new Map<string, PositionRow[]>();
    for (const position of positions) {
      const list = map.get(position.location_id) ?? [];
      list.push(position);
      map.set(position.location_id, list);
    }
    return map;
  }, [positions]);

  const updateRow = (key: string, patch: Partial<BulkRow>) => {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if (patch.productId) {
          const product = products.find((item) => item.id === patch.productId);
          const previousProduct = products.find((item) => item.id === row.productId);
          if (product && (!row.name || row.name === previousProduct?.name)) {
            next.name = product.name ?? "";
          }
        }
        if (patch.siteId) {
          next.areaId = "";
          next.locationId = "";
          next.locationPositionId = "";
        }
        if (patch.areaId) {
          next.locationId = "";
          next.locationPositionId = "";
        }
        if (patch.locationId) {
          next.locationPositionId = "";
        }
        return next;
      })
    );
  };

  const addRows = () => {
    setRows((current) => [...current, newRow(products, sites), newRow(products, sites), newRow(products, sites)]);
  };

  const removeRow = (key: string) => {
    setRows((current) => (current.length <= 1 ? current : current.filter((row) => row.key !== key)));
  };

  const validRows = rowsForSubmit(rows);

  return (
    <form action={action} className="ui-panel space-y-5">
      <input type="hidden" name="rows_json" value={JSON.stringify(validRows)} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="ui-h2">Cargar cajas, bolsas o grupos</h2>
          <p className="mt-2 ui-body-muted">
            Para lotes de moldes y objetos repetidos. Cada fila crea un grupo con QR que se cuenta por cantidad.
          </p>
        </div>
        <span className="ui-chip ui-chip--brand">{validRows.length} filas listas</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--ui-border)]">
        <table className="ui-table min-w-[1460px]">
          <thead>
            <tr>
              <th className="ui-th">Tipo de activo</th>
              <th className="ui-th">Nombre visible</th>
              <th className="ui-th">Sede</th>
              <th className="ui-th">Área</th>
              <th className="ui-th">LOC</th>
              <th className="ui-th">Ubicación interna</th>
              <th className="ui-th">Cantidad</th>
              <th className="ui-th">Estado</th>
              <th className="ui-th">Nota</th>
              <th className="ui-th">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowAreas = row.siteId ? areasBySite.get(row.siteId) ?? [] : [];
              const rowLocations = locations.filter((location) => {
                if (row.siteId && location.site_id !== row.siteId) return false;
                if (row.areaId && location.area_id !== row.areaId) return false;
                return true;
              });
              const rowPositions = row.locationId ? positionsByLocation.get(row.locationId) ?? [] : [];

              return (
                <tr key={row.key} className="border-t border-zinc-200/60 align-top">
                  <td className="ui-td">
                    <select
                      value={row.productId}
                      onChange={(event) => updateRow(row.key, { productId: event.target.value })}
                      className="ui-input min-w-[220px]"
                    >
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {productLabel(product)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="ui-td">
                    <input
                      value={row.name}
                      onChange={(event) => updateRow(row.key, { name: event.target.value })}
                      className="ui-input min-w-[220px]"
                      placeholder="Ej. Bolsa moldes esfera 6 cm"
                    />
                  </td>
                  <td className="ui-td">
                    <select
                      value={row.siteId}
                      onChange={(event) => updateRow(row.key, { siteId: event.target.value })}
                      className="ui-input min-w-[170px]"
                    >
                      <option value="">Selecciona</option>
                      {sites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name ?? site.id}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="ui-td">
                    <select
                      value={row.areaId}
                      onChange={(event) => updateRow(row.key, { areaId: event.target.value })}
                      className="ui-input min-w-[170px]"
                      disabled={!row.siteId || rowAreas.length === 0}
                    >
                      <option value="">Sin área</option>
                      {rowAreas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name ?? area.kind ?? area.id}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="ui-td">
                    <select
                      value={row.locationId}
                      onChange={(event) => updateRow(row.key, { locationId: event.target.value })}
                      className="ui-input min-w-[220px]"
                      disabled={!row.siteId || rowLocations.length === 0}
                    >
                      <option value="">Sin LOC</option>
                      {rowLocations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {locationLabel(location)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="ui-td">
                    <select
                      value={row.locationPositionId}
                      onChange={(event) => updateRow(row.key, { locationPositionId: event.target.value })}
                      className="ui-input min-w-[220px]"
                      disabled={!row.locationId || rowPositions.length === 0}
                    >
                      <option value="">{!row.locationId ? "Elige LOC primero" : "Sin ubicación interna"}</option>
                      {rowPositions.map((position) => (
                        <option key={position.id} value={position.id}>
                          {positionLabel(position)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="ui-td">
                    <div className="flex min-w-[160px] gap-2">
                      <input
                        value={row.qty}
                        onChange={(event) => updateRow(row.key, { qty: event.target.value })}
                        className="ui-input w-24"
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="0"
                      />
                      <input
                        value={row.unitCode}
                        onChange={(event) => updateRow(row.key, { unitCode: event.target.value })}
                        className="ui-input w-16"
                      />
                    </div>
                  </td>
                  <td className="ui-td">
                    <select
                      value={row.conditionStatus}
                      onChange={(event) => updateRow(row.key, { conditionStatus: event.target.value })}
                      className="ui-input min-w-[130px]"
                    >
                      <option value="nuevo">Nuevo</option>
                      <option value="bueno">Bueno</option>
                      <option value="regular">Regular</option>
                      <option value="malo">Malo</option>
                      <option value="critico">Crítico</option>
                    </select>
                  </td>
                  <td className="ui-td">
                    <input
                      value={row.notes}
                      onChange={(event) => updateRow(row.key, { notes: event.target.value })}
                      className="ui-input min-w-[220px]"
                      placeholder="Opcional"
                    />
                  </td>
                  <td className="ui-td">
                    <button type="button" onClick={() => removeRow(row.key)} className="ui-btn ui-btn--ghost h-10 px-3 text-sm">
                      Quitar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={addRows} className="ui-btn ui-btn--ghost">
          Agregar 3 filas
        </button>
        <button type="submit" className="ui-btn ui-btn--brand" disabled={validRows.length === 0}>
          Crear grupos con QR
        </button>
      </div>
    </form>
  );
}
