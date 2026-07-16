"use client";

import { useMemo, useState } from "react";

type Site = { id: string; name: string | null };
type Product = { id: string; name: string | null; sku: string | null };
type Location = {
  id: string;
  site_id: string;
  area_id: string | null;
  code: string | null;
  description: string | null;
};
type Area = { id: string; site_id: string; kind: string; name: string | null };
type ProductSiteSetting = {
  productId: string;
  siteId: string;
  isActive: boolean;
  inventoryEnabled: boolean;
  remissionEnabled: boolean;
  localProductionEnabled: boolean;
  productionLocationId: string | null;
  defaultAreaKind: string | null;
  areaKinds: string[];
};
type SupplyRoute = {
  requestingSiteId: string;
  fulfillmentSiteId: string;
  isActive: boolean;
};
type ProductionRoute = {
  productId: string;
  siteId: string;
  areaKind: string;
  inputLocationId: string;
  outputLocationId: string | null;
  isActive: boolean;
  isDefault: boolean;
};
type ActiveRoute = {
  productId: string;
  fromSiteId: string;
  toSiteId: string;
  requestingAreaKind: string | null;
  isActive: boolean;
};

type Props = {
  sites: Site[];
  products: Product[];
  locations: Location[];
  areas: Area[];
  productSiteSettings: ProductSiteSetting[];
  supplyRoutes: SupplyRoute[];
  productionRoutes: ProductionRoute[];
  activeRoutes: ActiveRoute[];
  defaults: {
    productId: string;
    fromSiteId: string;
    toSiteId: string;
    sourceLocationId: string;
    requestingAreaKind: string;
    preparingAreaKind: string;
  };
};

type RelationOption = {
  key: string;
  fromSiteId: string;
  toSiteId: string;
  requestingAreaKind: string;
  label: string;
};

const locationLabel = (location: Location) =>
  location.description ?? location.code ?? "LOC sin nombre";

export function FulfillmentRouteSelectors({
  sites,
  products,
  locations,
  areas,
  productSiteSettings,
  supplyRoutes,
  productionRoutes,
  activeRoutes,
  defaults,
}: Props) {
  const [productId, setProductId] = useState(defaults.productId);
  const [relationKey, setRelationKey] = useState("");
  const [preparingAreaKind, setPreparingAreaKind] = useState(defaults.preparingAreaKind);
  const [sourceLocationId, setSourceLocationId] = useState(defaults.sourceLocationId);

  const relationOptions = useMemo<RelationOption[]>(() => {
    if (!productId) return [];

    const settings = productSiteSettings.filter(
      (setting) => setting.productId === productId && setting.isActive,
    );
    const destinations = settings.filter((setting) => setting.remissionEnabled);
    const sourceSettings = settings.filter(
      (setting) => setting.inventoryEnabled || setting.localProductionEnabled,
    );

    const options: RelationOption[] = [];
    for (const destination of destinations) {
      const configuredSourceIds = supplyRoutes
        .filter(
          (route) =>
            route.isActive && route.requestingSiteId === destination.siteId,
        )
        .map((route) => route.fulfillmentSiteId);
      const sourceIds = configuredSourceIds.length
        ? configuredSourceIds
        : sourceSettings.map((setting) => setting.siteId);
      const requestingAreas = destination.areaKinds.length
        ? destination.areaKinds
        : destination.defaultAreaKind
          ? [destination.defaultAreaKind]
          : [];

      for (const fromSiteId of Array.from(new Set(sourceIds))) {
        if (!fromSiteId || fromSiteId === destination.siteId) continue;
        for (const requestingAreaKind of requestingAreas) {
          const covered = activeRoutes.some(
            (route) =>
              route.isActive &&
              route.productId === productId &&
              route.fromSiteId === fromSiteId &&
              route.toSiteId === destination.siteId &&
              (route.requestingAreaKind === requestingAreaKind ||
                route.requestingAreaKind === null),
          );
          if (covered) continue;

          const fromName = sites.find((site) => site.id === fromSiteId)?.name ?? "Origen";
          const toName = sites.find((site) => site.id === destination.siteId)?.name ?? "Destino";
          options.push({
            key: `${fromSiteId}|${destination.siteId}|${requestingAreaKind}`,
            fromSiteId,
            toSiteId: destination.siteId,
            requestingAreaKind,
            label: `${toName} · ${requestingAreaKind} ← ${fromName}`,
          });
        }
      }
    }

    return options;
  }, [activeRoutes, productId, productSiteSettings, sites, supplyRoutes]);

  const selectedRelation =
    relationOptions.find((relation) => relation.key === relationKey) ??
    relationOptions.find(
      (relation) =>
        relation.fromSiteId === defaults.fromSiteId &&
        relation.toSiteId === defaults.toSiteId &&
        relation.requestingAreaKind === defaults.requestingAreaKind,
    ) ??
    relationOptions[0] ??
    null;

  const effectiveRelationKey = selectedRelation?.key ?? "";
  const originSiteId = selectedRelation?.fromSiteId ?? "";

  const sourceAreas = useMemo(() => {
    if (!originSiteId) return [];
    const routeAreaKinds = new Set(
      productionRoutes
        .filter(
          (route) =>
            route.productId === productId &&
            route.siteId === originSiteId &&
            route.isActive,
        )
        .map((route) => route.areaKind),
    );

    const siteAreas = areas.filter((area) => area.site_id === originSiteId);
    if (routeAreaKinds.size === 0) return siteAreas;
    return siteAreas.filter((area) => routeAreaKinds.has(area.kind));
  }, [areas, originSiteId, productId, productionRoutes]);

  const selectedArea =
    sourceAreas.find((area) => area.kind === preparingAreaKind) ??
    sourceAreas[0] ??
    null;
  const effectivePreparingAreaKind = selectedArea?.kind ?? "";

  const sourceLocations = locations.filter(
    (location) =>
      location.site_id === originSiteId &&
      Boolean(selectedArea?.id) &&
      location.area_id === selectedArea?.id,
  );
  const effectiveSourceLocationId = sourceLocations.some(
    (location) => location.id === sourceLocationId,
  )
    ? sourceLocationId
    : sourceLocations[0]?.id ?? "";

  const resetProduct = (nextProductId: string) => {
    setProductId(nextProductId);
    setRelationKey("");
    setPreparingAreaKind("");
    setSourceLocationId("");
  };

  return (
    <>
      <label className="flex flex-col gap-1 lg:col-span-2">
        <span className="ui-label">Producto remitible</span>
        <select
          name="product_id"
          className="ui-input"
          required
          value={productId}
          onChange={(event) => resetProduct(event.target.value)}
        >
          <option value="">Seleccionar producto configurado para remisiones</option>
          {products
            .filter((product) =>
              productSiteSettings.some(
                (setting) =>
                  setting.productId === product.id &&
                  setting.isActive &&
                  setting.remissionEnabled,
              ),
            )
            .map((product) => (
              <option key={product.id} value={product.id}>
                {product.name ?? product.sku ?? "Sin nombre"}
                {product.sku ? ` · ${product.sku}` : ""}
              </option>
            ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 lg:col-span-2">
        <span className="ui-label">Relación de remisión ya configurada</span>
        <select
          className="ui-input"
          required
          value={effectiveRelationKey}
          disabled={!productId || relationOptions.length === 0}
          onChange={(event) => {
            setRelationKey(event.target.value);
            setPreparingAreaKind("");
            setSourceLocationId("");
          }}
        >
          <option value="">
            {!productId
              ? "Primero selecciona producto"
              : relationOptions.length
                ? "Seleccionar relación"
                : "No hay relaciones pendientes"}
          </option>
          {relationOptions.map((relation) => (
            <option key={relation.key} value={relation.key}>
              {relation.label}
            </option>
          ))}
        </select>
      </label>

      <input type="hidden" name="from_site_id" value={originSiteId} />
      <input type="hidden" name="to_site_id" value={selectedRelation?.toSiteId ?? ""} />
      <input
        type="hidden"
        name="requesting_area_kind"
        value={selectedRelation?.requestingAreaKind ?? ""}
      />
      <input type="hidden" name="preferred_destination_location_id" value="" />

      <label className="flex flex-col gap-1">
        <span className="ui-label">Área responsable en origen</span>
        <select
          name="preparing_area_kind"
          className="ui-input"
          required
          value={effectivePreparingAreaKind}
          disabled={!originSiteId || sourceAreas.length === 0}
          onChange={(event) => {
            setPreparingAreaKind(event.target.value);
            setSourceLocationId("");
          }}
        >
          <option value="">
            {sourceAreas.length
              ? "Seleccionar área responsable"
              : "El origen no tiene áreas configuradas"}
          </option>
          {sourceAreas.map((area) => (
            <option key={area.id} value={area.kind}>
              {area.name ?? area.kind}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="ui-label">LOC de salida</span>
        <select
          name="preferred_source_location_id"
          className="ui-input"
          required
          value={effectiveSourceLocationId}
          disabled={!selectedArea || sourceLocations.length === 0}
          onChange={(event) => setSourceLocationId(event.target.value)}
        >
          <option value="">
            {sourceLocations.length
              ? "Seleccionar LOC"
              : "El área no tiene LOC activo"}
          </option>
          {sourceLocations.map((location) => (
            <option key={location.id} value={location.id}>
              {locationLabel(location)}
            </option>
          ))}
        </select>
        <span className="ui-caption">
          Solo se define el LOC. Estantería, nivel, posición o LPN se resuelven al preparar y despachar.
        </span>
      </label>
    </>
  );
}
