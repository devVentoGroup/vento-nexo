"use client";

import { useEffect, useMemo, useState } from "react";

type AssetCountScopeFormAction = (formData: FormData) => void | Promise<void>;

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

type AssetCountScopeFormProps = {
  action: AssetCountScopeFormAction;
  sites: SiteRow[];
  areas: AreaRow[];
  locations: LocationRow[];
  positions: PositionRow[];
};

function locationLabel(location: LocationRow) {
  return [location.code, location.zone, location.description].filter(Boolean).join(" - ") || location.id;
}

function positionLabel(position: PositionRow, locationById: Map<string, LocationRow>) {
  const location = locationById.get(position.location_id);
  return [location?.code ?? "LOC", position.name, position.code, position.kind]
    .filter(Boolean)
    .join(" · ");
}

export function AssetCountScopeForm({
  action,
  sites,
  areas,
  locations,
  positions,
}: AssetCountScopeFormProps) {
  const [siteId, setSiteId] = useState("");
  const [areaId, setAreaId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locationPositionId, setLocationPositionId] = useState("");

  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations]
  );

  const filteredAreas = useMemo(() => {
    if (!siteId) return [];
    return areas.filter((area) => area.site_id === siteId);
  }, [areas, siteId]);

  const filteredLocations = useMemo(() => {
    return locations.filter((location) => {
      if (!siteId) return false;
      if (location.site_id !== siteId) return false;
      if (areaId && location.area_id !== areaId) return false;
      return true;
    });
  }, [areaId, locations, siteId]);

  const filteredPositions = useMemo(() => {
    if (!locationId) return [];
    return positions.filter((position) => position.location_id === locationId);
  }, [locationId, positions]);

  useEffect(() => {
    if (areaId && !filteredAreas.some((area) => area.id === areaId)) {
      setAreaId("");
    }
  }, [areaId, filteredAreas]);

  useEffect(() => {
    if (locationId && !filteredLocations.some((location) => location.id === locationId)) {
      setLocationId("");
    }
  }, [filteredLocations, locationId]);

  useEffect(() => {
    if (locationPositionId && !filteredPositions.some((position) => position.id === locationPositionId)) {
      setLocationPositionId("");
    }
  }, [filteredPositions, locationPositionId]);

  const scopeLabel = locationPositionId
    ? "Ubicación interna"
    : locationId
      ? "LOC"
      : areaId
        ? "Área"
        : siteId
          ? "Sede completa"
          : "Selecciona una sede";

  return (
    <form action={action} className="space-y-5">
      <div>
        <h2 className="ui-h2">Nuevo conteo</h2>
        <p className="mt-2 ui-body-muted">
          Elige dónde se va a contar. El sistema prepara la lista de activos esperados automáticamente.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="ui-label">Nombre del conteo</span>
          <input
            name="name"
            className="ui-input"
            placeholder="Ej. Conteo mensual activos Vento Café"
          />
        </label>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="ui-label">Alcance detectado</div>
          <div className="mt-1 text-lg font-black text-[var(--ui-text)]">{scopeLabel}</div>
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
            required
          >
            <option value="">Selecciona sede</option>
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
            disabled={!siteId || filteredAreas.length === 0}
          >
            <option value="">{siteId ? "Todas las áreas" : "Elige sede primero"}</option>
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
            disabled={!siteId || filteredLocations.length === 0}
          >
            <option value="">Todos los LOCs del alcance</option>
            {filteredLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {locationLabel(location)}
              </option>
            ))}
          </select>
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
            <option value="">{!locationId ? "Elige LOC primero" : "Todas las ubicaciones internas"}</option>
            {filteredPositions.map((position) => (
              <option key={position.id} value={position.id}>
                {positionLabel(position, locationById)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 lg:col-span-2">
          <span className="ui-label">Notas</span>
          <textarea
            name="notes"
            className="ui-input min-h-24"
            placeholder="Ej. Conteo de apertura, conteo de auditoría, conteo por traslado..."
          />
        </label>
      </div>

      <div className="grid gap-3">
        <div className="ui-alert ui-alert--warn">
          El conteo se crea abierto y con la lista esperada según los activos activos dentro del alcance.
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-black">Importante antes de crear</div>
          <p className="mt-1 leading-6">
            Si este alcance no tiene activos activos asignados, el conteo no se creará.
            Ajusta sede, área, LOC o ubicación interna, o asigna activos antes de abrir el conteo.
          </p>
        </div>
      </div>

      <button type="submit" className="ui-btn ui-btn--brand w-full">
        Crear conteo
      </button>
    </form>
  );
}
