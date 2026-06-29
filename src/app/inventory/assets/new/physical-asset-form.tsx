"use client";

import { useMemo, useState } from "react";

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  image_url: string | null;
  catalog_image_url: string | null;
  product_inventory_profiles?: {
    inventory_kind: string | null;
  } | null;
};

type ProductAssetProfileRow = {
  product_id: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  commercial_value: number | null;
  technical_description: string | null;
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
  location_type: string | null;
};

type PositionRow = {
  id: string;
  site_id: string;
  location_id: string;
  code: string | null;
  name: string | null;
  kind: string | null;
};

type EmployeeRow = {
  id: string;
  site_id: string | null;
  full_name: string | null;
  role: string | null;
  is_active: boolean | null;
};

type AssetMode = "item" | "group";

type PhysicalAssetFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  products: ProductRow[];
  productAssetProfiles: ProductAssetProfileRow[];
  sites: SiteRow[];
  areas: AreaRow[];
  locations: LocationRow[];
  positions: PositionRow[];
  employees: EmployeeRow[];
  initialProductId?: string;
};

function productImageUrl(product: ProductRow | null | undefined) {
  return String(product?.catalog_image_url ?? product?.image_url ?? "").trim();
}

function productLabel(product: ProductRow) {
  return [product.name, product.sku ? `SKU ${product.sku}` : ""].filter(Boolean).join(" · ") || product.id;
}

function locationLabel(location: LocationRow) {
  return [location.code, location.zone, location.description].filter(Boolean).join(" - ") || location.id;
}

function positionLabel(position: PositionRow, locationById: Map<string, LocationRow>) {
  const location = locationById.get(position.location_id);

  return [
    location?.code ?? "LOC",
    position.name,
    position.code,
    position.kind,
  ]
    .filter(Boolean)
    .join(" · ");
}

function profileByProductId(profiles: ProductAssetProfileRow[], productId: string) {
  return profiles.find((profile) => profile.product_id === productId) ?? null;
}

export function PhysicalAssetForm({
  action,
  products,
  productAssetProfiles,
  sites,
  areas,
  locations,
  positions,
  employees,
  initialProductId,
}: PhysicalAssetFormProps) {
  const initialProduct =
    products.find((product) => product.id === initialProductId) ??
    products[0] ??
    null;
  const initialProfile = initialProduct
    ? profileByProductId(productAssetProfiles, initialProduct.id)
    : null;

  const [assetMode, setAssetMode] = useState<AssetMode>("item");
  const [selectedProductId, setSelectedProductId] = useState(initialProduct?.id ?? "");
  const [siteId, setSiteId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locationPositionId, setLocationPositionId] = useState("");
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState("");

  const [displayName, setDisplayName] = useState(initialProduct?.name ?? "");
  const [groupName, setGroupName] = useState(initialProduct?.name ?? "");
  const [serialNumber, setSerialNumber] = useState(initialProfile?.serial_number ?? "");
  const [brand, setBrand] = useState(initialProfile?.brand ?? "");
  const [model, setModel] = useState(initialProfile?.model ?? "");
  const [commercialValue, setCommercialValue] = useState(
    initialProfile?.commercial_value != null ? String(initialProfile.commercial_value) : ""
  );
  const [mainImageUrl, setMainImageUrl] = useState(productImageUrl(initialProduct));
  const [notes, setNotes] = useState(initialProfile?.technical_description ?? "");

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? products[0] ?? null,
    [products, selectedProductId]
  );

  const selectedProfile = useMemo(
    () => (selectedProduct ? profileByProductId(productAssetProfiles, selectedProduct.id) : null),
    [productAssetProfiles, selectedProduct]
  );

  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations]
  );

  const filteredAreas = useMemo(() => {
    if (!siteId) return areas;
    return areas.filter((area) => area.site_id === siteId);
  }, [areas, siteId]);

  const filteredLocations = useMemo(() => {
    return locations.filter((location) => {
      if (siteId && location.site_id !== siteId) return false;
      if (areaId && location.area_id !== areaId) return false;
      return true;
    });
  }, [areaId, locations, siteId]);

  const filteredPositions = useMemo(() => {
    if (!locationId) return [];
    return positions.filter((position) => position.location_id === locationId);
  }, [locationId, positions]);

  const filteredEmployees = useMemo(() => {
    if (!siteId) return employees;
    const sameSite = employees.filter((employee) => employee.site_id === siteId);
    return sameSite.length > 0 ? sameSite : employees;
  }, [employees, siteId]);

  const selectedImageUrl = productImageUrl(selectedProduct);
  const selectedLocation = locationId ? locationById.get(locationId) ?? null : null;
  const selectedPosition = locationPositionId
    ? positions.find((position) => position.id === locationPositionId) ?? null
    : null;

  const handleProductChange = (productId: string) => {
    const nextProduct = products.find((product) => product.id === productId) ?? null;
    const nextProfile = nextProduct ? profileByProductId(productAssetProfiles, nextProduct.id) : null;

    setSelectedProductId(productId);
    setDisplayName(nextProduct?.name ?? "");
    setGroupName(nextProduct?.name ?? "");
    setSerialNumber(nextProfile?.serial_number ?? "");
    setBrand(nextProfile?.brand ?? "");
    setModel(nextProfile?.model ?? "");
    setCommercialValue(nextProfile?.commercial_value != null ? String(nextProfile.commercial_value) : "");
    setMainImageUrl(productImageUrl(nextProduct));
    setNotes(nextProfile?.technical_description ?? "");
  };

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[1fr_0.78fr]">
      <section className="ui-panel space-y-5">
        <div>
          <h2 className="ui-h2">1. Tipo de activo</h2>
          <p className="mt-2 ui-body-muted">
            Elige cómo se controla físicamente. Usa pieza con QR propio para moldes únicos, o grupo/contenedor para cajas y bolsas de moldes iguales.
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Tipo de activo del catálogo</span>
          <select
            name="product_id"
            value={selectedProductId}
            onChange={(event) => handleProductChange(event.target.value)}
            className="ui-input"
            required
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {productLabel(product)}
              </option>
            ))}
          </select>
          <span className="text-xs text-[var(--ui-muted)]">
            Solo aparecen tipos marcados como activos.
          </span>
        </label>

        {selectedProduct ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex gap-4">
              {selectedImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedImageUrl} alt="" className="h-20 w-20 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white text-xs font-bold text-slate-400">
                  ACT
                </div>
              )}
              <div>
                <div className="font-semibold text-[var(--ui-text)]">{selectedProduct.name}</div>
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  {selectedProduct.sku ? `SKU ${selectedProduct.sku}` : selectedProduct.id}
                </div>
                <div className="mt-2 text-sm text-[var(--ui-muted)]">
                  {[selectedProfile?.brand, selectedProfile?.model].filter(Boolean).join(" · ") || "Sin marca/modelo base"}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className={`rounded-2xl border p-4 ${assetMode === "item" ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="asset_mode"
                value="item"
                checked={assetMode === "item"}
                onChange={() => setAssetMode("item")}
              />
              <div>
                <div className="font-semibold text-[var(--ui-text)]">Pieza con QR propio</div>
                <p className="mt-1 text-sm text-[var(--ui-muted)]">
                  Un molde, equipo o herramienta que se quiere rastrear individualmente.
                </p>
              </div>
            </div>
          </label>
          <label className={`rounded-2xl border p-4 ${assetMode === "group" ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="asset_mode"
                value="group"
                checked={assetMode === "group"}
                onChange={() => setAssetMode("group")}
              />
              <div>
                <div className="font-semibold text-[var(--ui-text)]">Caja, bolsa o grupo con QR</div>
                <p className="mt-1 text-sm text-[var(--ui-muted)]">
                  Varios moldes o piezas iguales guardados juntos. El QR abre el contenido y su ubicación.
                </p>
              </div>
            </div>
          </label>
        </div>

        {assetMode === "item" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Nombre visible del activo individual</span>
              <input
                name="display_name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="ui-input"
                placeholder="Ej. Horno Rational #001"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Código activo</span>
              <input
                name="asset_code"
                className="ui-input"
                placeholder="Automático si lo dejas vacío"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Placa interna</span>
              <input name="internal_plate" className="ui-input" placeholder="Ej. VENTO-KIT-0004" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Serial</span>
              <input
                name="serial_number"
                value={serialNumber}
                onChange={(event) => setSerialNumber(event.target.value)}
                className="ui-input"
                placeholder="Serial físico del equipo"
              />
            </label>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-[var(--ui-text)]">Contenido del grupo</h3>
            <p className="mt-1 text-xs text-[var(--ui-muted)]">
              Úsalo para cajas, bolsas, estuches o lotes de moldes iguales. El grupo tendrá un QR imprimible.
            </p>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Nombre del grupo</span>
                <input
                  name="group_name"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  className="ui-input"
                  placeholder="Ej. Bolsa moldes esfera 6 cm"
                  required={assetMode === "group"}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Código grupo</span>
                <input name="group_code" className="ui-input" placeholder="Automático si lo dejas vacío" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Cantidad esperada</span>
                <input
                  name="expected_qty"
                  type="number"
                  step="0.001"
                  min="0"
                  className="ui-input"
                  placeholder="Ej. 24"
                  required={assetMode === "group"}
                />
              </label>
              <label className="flex flex-col gap-1 md:col-span-1">
                <span className="ui-label">Unidad</span>
                <input name="group_unit_code" defaultValue="un" className="ui-input" />
              </label>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="ui-label">Marca</span>
            <input
              name="brand"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Modelo</span>
            <input
              name="model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="ui-input"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Fabricante</span>
            <input name="manufacturer" className="ui-input" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {assetMode === "item" ? (
            <label className="flex flex-col gap-1">
              <span className="ui-label">Estado operativo</span>
              <select name="equipment_status" defaultValue="operativo" className="ui-input">
                <option value="operativo">Operativo</option>
                <option value="en_mantenimiento">En mantenimiento</option>
                <option value="fuera_servicio">Fuera de servicio</option>
                <option value="baja">De baja</option>
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="ui-label">Condición física</span>
            <select name="condition_status" defaultValue="bueno" className="ui-input">
              <option value="nuevo">Nuevo</option>
              <option value="bueno">Bueno</option>
              <option value="regular">Regular</option>
              <option value="malo">Malo</option>
              <option value="critico">Crítico</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="ui-label">Estado de vida</span>
            <select name="lifecycle_status" defaultValue="activo" className="ui-input">
              <option value="activo">Activo</option>
              <option value="almacenado">Almacenado</option>
              <option value="prestado">Prestado</option>
              <option value="en_reparacion">En reparación</option>
              <option value="retirado">Retirado</option>
              <option value="perdido">Perdido</option>
            </select>
          </label>
        </div>
      </section>

      <aside className="space-y-6">
        <section className="ui-panel space-y-4">
          <div>
            <h2 className="ui-h2">2. Ubicación real</h2>
            <p className="mt-2 ui-body-muted">
              Los campos se filtran en cascada para evitar LOCs o ubicaciones internas que no correspondan.
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Sede</span>
            <select
              name="site_id"
              value={siteId}
              onChange={(event) => {
                setSiteId(event.target.value);
                setAreaId("");
                setLocationId("");
                setLocationPositionId("");
              }}
              className="ui-input"
            >
              <option value="">Sin sede</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Área</span>
            <select
              name="area_id"
              value={areaId}
              onChange={(event) => {
                setAreaId(event.target.value);
                setLocationId("");
                setLocationPositionId("");
              }}
              className="ui-input"
              disabled={siteId ? filteredAreas.length === 0 : areas.length === 0}
            >
              <option value="">{siteId ? "Sin área / todas" : "Elige sede para filtrar"}</option>
              {filteredAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name ?? area.kind ?? area.id}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">LOC</span>
            <select
              name="location_id"
              value={locationId}
              onChange={(event) => {
                const nextLocationId = event.target.value;
                const nextLocation = locationById.get(nextLocationId);
                setLocationId(nextLocationId);
                setLocationPositionId("");
                if (nextLocation) {
                  setSiteId(nextLocation.site_id);
                  setAreaId(nextLocation.area_id);
                }
              }}
              className="ui-input"
              disabled={filteredLocations.length === 0}
            >
              <option value="">Sin LOC</option>
              {filteredLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {locationLabel(location)}
                </option>
              ))}
            </select>
            {selectedLocation ? (
              <span className="text-xs text-[var(--ui-muted)]">
                Sede y área se sincronizan automáticamente con el LOC seleccionado.
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Ubicación interna</span>
            <select
              name="location_position_id"
              value={locationPositionId}
              onChange={(event) => setLocationPositionId(event.target.value)}
              className="ui-input"
              disabled={!locationId || filteredPositions.length === 0}
            >
              <option value="">
                {!locationId ? "Elige LOC primero" : "Sin ubicación interna"}
              </option>
              {filteredPositions.map((position) => (
                <option key={position.id} value={position.id}>
                  {positionLabel(position, locationById)}
                </option>
              ))}
            </select>
            {selectedPosition ? (
              <span className="text-xs text-[var(--ui-muted)]">
                Ubicación interna dentro del LOC seleccionado.
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Responsable</span>
            <select
              name="responsible_employee_id"
              value={responsibleEmployeeId}
              onChange={(event) => setResponsibleEmployeeId(event.target.value)}
              className="ui-input"
            >
              <option value="">Sin responsable</option>
              {filteredEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name ?? employee.id}
                  {employee.role ? ` · ${employee.role}` : ""}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--ui-muted)]">
              Se filtra por sede cuando existan responsables en esa sede.
            </span>
          </label>
        </section>

        <section className="ui-panel space-y-4">
          <div>
            <h2 className="ui-h2">3. Compra y ficha técnica</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Propiedad</span>
              <select name="ownership_status" defaultValue="propio" className="ui-input">
                <option value="propio">Propio</option>
                <option value="rentado">Rentado</option>
                <option value="prestado">Prestado</option>
                <option value="comodato">Comodato</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Valor comercial</span>
              <input
                name="commercial_value"
                type="number"
                step="0.01"
                value={commercialValue}
                onChange={(event) => setCommercialValue(event.target.value)}
                className="ui-input"
                placeholder="0"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Fecha de compra</span>
              <input name="purchase_date" type="date" className="ui-input" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Inicio de uso</span>
              <input name="started_use_date" type="date" className="ui-input" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Garantía hasta</span>
              <input name="warranty_until" type="date" className="ui-input" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Factura URL</span>
              <input name="purchase_invoice_url" type="url" className="ui-input" placeholder="https://..." />
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Imagen principal URL</span>
              <input
                name="main_image_url"
                type="url"
                value={mainImageUrl}
                onChange={(event) => setMainImageUrl(event.target.value)}
                className="ui-input"
                placeholder="https://..."
              />
            </label>
          </div>

          <div className="grid gap-3">
            <label className="flex flex-col gap-1">
              <span className="ui-label">Potencia</span>
              <input name="spec_power" className="ui-input" placeholder="Ej. 1500 W" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Voltaje</span>
              <input name="spec_voltage" className="ui-input" placeholder="Ej. 110 V / 220 V" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Capacidad</span>
              <input name="spec_capacity" className="ui-input" placeholder="Ej. 20 L / 15 kg" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Dimensiones</span>
              <input name="spec_dimensions" className="ui-input" placeholder="Alto x ancho x fondo" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Peso</span>
              <input name="spec_weight" className="ui-input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Material</span>
              <input name="spec_material" className="ui-input" />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="ui-label">Notas</span>
            <textarea
              name="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="ui-input min-h-28"
              placeholder="Observaciones, estado inicial, accesorios, restricciones de uso."
            />
          </label>

          <button type="submit" className="ui-btn ui-btn--brand w-full">
            {assetMode === "group" ? "Crear activo por cantidad" : "Crear activo individual"}
          </button>
        </section>
      </aside>
    </form>
  );
}
