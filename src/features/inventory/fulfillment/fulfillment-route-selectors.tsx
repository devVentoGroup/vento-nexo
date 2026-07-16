"use client";

import { useMemo, useState } from "react";

type Site = { id: string; name: string | null };
type Location = { id: string; site_id: string; code: string | null; description: string | null };
type Area = { code: string; name: string | null };

type Props = {
  sites: Site[];
  locations: Location[];
  areasBySite: Record<string, Area[]>;
  defaults: {
    fromSiteId: string;
    toSiteId: string;
    sourceLocationId: string;
    requestingAreaKind: string;
    preparingAreaKind: string;
  };
};

function locationLabel(location: Location) {
  return location.description ?? location.code ?? "LOC sin nombre";
}

export function FulfillmentRouteSelectors({ sites, locations, areasBySite, defaults }: Props) {
  const [fromSiteId, setFromSiteId] = useState(defaults.fromSiteId);
  const [toSiteId, setToSiteId] = useState(defaults.toSiteId);
  const [sourceLocationId, setSourceLocationId] = useState(defaults.sourceLocationId);
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [requestingAreaKind, setRequestingAreaKind] = useState(defaults.requestingAreaKind);
  const [preparingAreaKind, setPreparingAreaKind] = useState(defaults.preparingAreaKind);

  const sourceLocations = useMemo(
    () => locations.filter((location) => location.site_id === fromSiteId),
    [fromSiteId, locations],
  );
  const destinationLocations = useMemo(
    () => locations.filter((location) => location.site_id === toSiteId),
    [locations, toSiteId],
  );
  const sourceAreas = areasBySite[fromSiteId] ?? [];
  const destinationAreas = areasBySite[toSiteId] ?? [];

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="ui-label">Sede origen (prepara)</span>
        <select
          name="from_site_id"
          className="ui-input"
          required
          value={fromSiteId}
          onChange={(event) => {
            setFromSiteId(event.target.value);
            setSourceLocationId("");
            setPreparingAreaKind("");
          }}
        >
          <option value="">Seleccionar sede</option>
          {sites.map((site) => <option key={site.id} value={site.id}>{site.name ?? "Sede sin nombre"}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="ui-label">Sede destino (recibe)</span>
        <select
          name="to_site_id"
          className="ui-input"
          required
          value={toSiteId}
          onChange={(event) => {
            setToSiteId(event.target.value);
            setDestinationLocationId("");
            setRequestingAreaKind("");
          }}
        >
          <option value="">Seleccionar sede</option>
          {sites.map((site) => <option key={site.id} value={site.id} disabled={site.id === fromSiteId}>{site.name ?? "Sede sin nombre"}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="ui-label">LOC de salida</span>
        <select name="preferred_source_location_id" className="ui-input" value={sourceLocationId} disabled={!fromSiteId} onChange={(event) => setSourceLocationId(event.target.value)}>
          <option value="">{fromSiteId ? "Sin LOC preferido" : "Primero selecciona sede origen"}</option>
          {sourceLocations.map((location) => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="ui-label">LOC de llegada</span>
        <select name="preferred_destination_location_id" className="ui-input" value={destinationLocationId} disabled={!toSiteId} onChange={(event) => setDestinationLocationId(event.target.value)}>
          <option value="">{toSiteId ? "Sin LOC preferido" : "Primero selecciona sede destino"}</option>
          {destinationLocations.map((location) => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="ui-label">Área que solicita</span>
        <select name="requesting_area_kind" className="ui-input" value={requestingAreaKind} disabled={!toSiteId} onChange={(event) => setRequestingAreaKind(event.target.value)}>
          <option value="">{toSiteId ? "Cualquier área" : "Primero selecciona sede destino"}</option>
          {destinationAreas.map((area) => <option key={area.code} value={area.code}>{area.name ?? area.code}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="ui-label">Área que prepara</span>
        <select name="preparing_area_kind" className="ui-input" value={preparingAreaKind} disabled={!fromSiteId} onChange={(event) => setPreparingAreaKind(event.target.value)}>
          <option value="">{fromSiteId ? "No definida" : "Primero selecciona sede origen"}</option>
          {sourceAreas.map((area) => <option key={area.code} value={area.code}>{area.name ?? area.code}</option>)}
        </select>
      </label>
    </>
  );
}
