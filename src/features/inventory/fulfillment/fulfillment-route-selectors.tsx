"use client";

import { useMemo, useState } from "react";

type Site = { id: string; name: string | null };
type Product = { id: string; name: string | null; sku: string | null };
type Location = { id: string; site_id: string; code: string | null; description: string | null };
type Area = { code: string; name: string | null };
type ProductSiteSetting = { productId: string; siteId: string; isActive: boolean; inventoryEnabled: boolean; remissionEnabled: boolean; localProductionEnabled: boolean; productionLocationId: string | null; defaultAreaKind: string | null; areaKinds: string[] };
type ProductionRoute = { productId: string; siteId: string; areaKind: string; inputLocationId: string; outputLocationId: string | null; isActive: boolean; isDefault: boolean };
 type ActiveRoute = { productId: string; fromSiteId: string; toSiteId: string; requestingAreaKind: string | null; isActive: boolean };

type Props = {
  sites: Site[];
  products: Product[];
  locations: Location[];
  areasBySite: Record<string, Area[]>;
  productSiteSettings: ProductSiteSetting[];
  productionRoutes: ProductionRoute[];
  activeRoutes: ActiveRoute[];
  defaults: { productId: string; fromSiteId: string; toSiteId: string; sourceLocationId: string; requestingAreaKind: string; preparingAreaKind: string };
};

const locationLabel = (location: Location) => location.description ?? location.code ?? "LOC sin nombre";

export function FulfillmentRouteSelectors({ sites, products, locations, areasBySite, productSiteSettings, productionRoutes, activeRoutes, defaults }: Props) {
  const [productId, setProductId] = useState(defaults.productId);
  const [fromSiteId, setFromSiteId] = useState(defaults.fromSiteId);
  const [toSiteId, setToSiteId] = useState(defaults.toSiteId);
  const [sourceLocationId, setSourceLocationId] = useState(defaults.sourceLocationId);
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [requestingAreaKind, setRequestingAreaKind] = useState(defaults.requestingAreaKind);
  const [preparingAreaKind, setPreparingAreaKind] = useState(defaults.preparingAreaKind);

  const settings = useMemo(() => productSiteSettings.filter((setting) => setting.productId === productId && setting.isActive), [productId, productSiteSettings]);
  const sourceRoutes = useMemo(() => productionRoutes.filter((route) => route.productId === productId && route.isActive), [productId, productionRoutes]);
  const sourceSiteIds = new Set([...settings.filter((setting) => setting.inventoryEnabled || setting.localProductionEnabled).map((setting) => setting.siteId), ...sourceRoutes.map((route) => route.siteId)]);
  const destinationSettings = settings.filter((setting) => setting.remissionEnabled);
  const sourceLocations = locations.filter((location) => location.site_id === fromSiteId);
  const destinationLocations = locations.filter((location) => location.site_id === toSiteId);
  const selectedSourceRoute = sourceRoutes.find((route) => route.siteId === fromSiteId && route.areaKind === preparingAreaKind) ?? sourceRoutes.find((route) => route.siteId === fromSiteId && route.isDefault) ?? sourceRoutes.find((route) => route.siteId === fromSiteId);
  const sourceAreas = Array.from(new Set(sourceRoutes.filter((route) => route.siteId === fromSiteId).map((route) => route.areaKind))).map((code) => (areasBySite[fromSiteId] ?? []).find((area) => area.code === code) ?? { code, name: code });
  const destinationSetting = destinationSettings.find((setting) => setting.siteId === toSiteId);
  const destinationAreas = (destinationSetting?.areaKinds.length ? destinationSetting.areaKinds.map((code) => (areasBySite[toSiteId] ?? []).find((area) => area.code === code) ?? { code, name: code }) : areasBySite[toSiteId] ?? []);  const routesForDestination = activeRoutes.filter((route) => route.isActive && route.productId === productId && route.fromSiteId === fromSiteId && route.toSiteId === toSiteId);
  const isDestinationCovered = (setting: ProductSiteSetting) => {
    const existing = activeRoutes.filter((route) => route.isActive && route.productId === productId && route.fromSiteId === fromSiteId && route.toSiteId === setting.siteId);
    if (existing.some((route) => !route.requestingAreaKind)) return true;
    const areas = setting.areaKinds.length ? setting.areaKinds : (areasBySite[setting.siteId] ?? []).map((area) => area.code);
    return areas.length > 0 && areas.every((area) => existing.some((route) => route.requestingAreaKind === area));
  };
  const availableDestinationSettings = destinationSettings.filter((setting) => setting.siteId !== fromSiteId && !isDestinationCovered(setting));
  const availableDestinationAreas = destinationAreas.filter((area) => !routesForDestination.some((route) => route.requestingAreaKind === area.code));
  const canUseAnyDestinationArea = routesForDestination.length === 0;

  const resetRoute = () => {
    setFromSiteId(""); setToSiteId(""); setSourceLocationId(""); setDestinationLocationId(""); setRequestingAreaKind(""); setPreparingAreaKind("");
  };

  return <>
    <label className="flex flex-col gap-1 lg:col-span-2"><span className="ui-label">Producto remitible</span><select name="product_id" className="ui-input" required value={productId} onChange={(event) => { setProductId(event.target.value); resetRoute(); }}><option value="">Seleccionar producto configurado para remisiones</option>{products.filter((product) => productSiteSettings.some((setting) => setting.productId === product.id && setting.isActive && setting.remissionEnabled)).map((product) => <option key={product.id} value={product.id}>{product.name ?? product.sku ?? "Sin nombre"}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></label>
    <label className="flex flex-col gap-1"><span className="ui-label">Sede origen (prepara)</span><select name="from_site_id" className="ui-input" required value={fromSiteId} disabled={!productId} onChange={(event) => { const siteId = event.target.value; setFromSiteId(siteId); setToSiteId(""); setDestinationLocationId(""); setRequestingAreaKind(""); const route = sourceRoutes.find((item) => item.siteId === siteId && item.isDefault) ?? sourceRoutes.find((item) => item.siteId === siteId); setPreparingAreaKind(route?.areaKind ?? ""); setSourceLocationId(route?.outputLocationId ?? route?.inputLocationId ?? settings.find((item) => item.siteId === siteId)?.productionLocationId ?? ""); }}><option value="">{productId ? "Seleccionar sede de origen" : "Primero selecciona producto"}</option>{sites.filter((site) => sourceSiteIds.has(site.id)).map((site) => <option key={site.id} value={site.id}>{site.name ?? "Sede sin nombre"}</option>)}</select></label>
    <label className="flex flex-col gap-1"><span className="ui-label">Sede destino (recibe)</span><select name="to_site_id" className="ui-input" required value={toSiteId} disabled={!productId} onChange={(event) => { setToSiteId(event.target.value); setDestinationLocationId(""); setRequestingAreaKind(""); }}><option value="">{productId ? "Seleccionar sede de destino" : "Primero selecciona producto"}</option>{availableDestinationSettings.map((setting) => <option key={setting.siteId} value={setting.siteId}>{sites.find((site) => site.id === setting.siteId)?.name ?? "Sede sin nombre"}</option>)}</select></label>
    <label className="flex flex-col gap-1"><span className="ui-label">LOC de salida</span><select name="preferred_source_location_id" className="ui-input" value={sourceLocationId} disabled={!fromSiteId} onChange={(event) => setSourceLocationId(event.target.value)}><option value="">{fromSiteId ? "Sin LOC preferido" : "Primero selecciona sede origen"}</option>{sourceLocations.map((location) => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select></label>
    <label className="flex flex-col gap-1"><span className="ui-label">LOC de llegada</span><select name="preferred_destination_location_id" className="ui-input" value={destinationLocationId} disabled={!toSiteId} onChange={(event) => setDestinationLocationId(event.target.value)}><option value="">{toSiteId ? "Sin LOC preferido" : "Primero selecciona sede destino"}</option>{destinationLocations.map((location) => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select></label>
    <label className="flex flex-col gap-1"><span className="ui-label">Área que solicita</span><select name="requesting_area_kind" className="ui-input" value={requestingAreaKind} disabled={!toSiteId} onChange={(event) => setRequestingAreaKind(event.target.value)}>{canUseAnyDestinationArea ? <option value="">{toSiteId ? "Cualquier área configurada" : "Primero selecciona sede destino"}</option> : null}{availableDestinationAreas.map((area) => <option key={area.code} value={area.code}>{area.name ?? area.code}</option>)}</select></label>
    <label className="flex flex-col gap-1"><span className="ui-label">Área que prepara</span><select name="preparing_area_kind" className="ui-input" value={preparingAreaKind} disabled={!fromSiteId || !sourceAreas.length} onChange={(event) => { const area = event.target.value; setPreparingAreaKind(area); const route = sourceRoutes.find((item) => item.siteId === fromSiteId && item.areaKind === area); if (route) setSourceLocationId(route.outputLocationId ?? route.inputLocationId); }}><option value="">{sourceAreas.length ? "Seleccionar área de producción" : "Este producto no tiene ruta de producción aquí"}</option>{sourceAreas.map((area) => <option key={area.code} value={area.code}>{area.name ?? area.code}</option>)}</select></label>
  </>;
}
