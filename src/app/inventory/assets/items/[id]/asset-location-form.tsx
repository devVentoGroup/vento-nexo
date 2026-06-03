"use client";

import { useEffect, useMemo, useState } from "react";

type AssetLocationFormAction = (formData: FormData) => void | Promise<void>;

type AssetLocationItem = {
  id: string;
  site_id: string | null;
  area_id: string | null;
  location_id: string | null;
  location_position_id: string | null;
  responsible_employee_id: string | null;
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

type EmployeeRow = {
  id: string;
  site_id: string | null;
  full_name: string | null;
  role: string | null;
};

type AssetLocationFormProps = {
  action: AssetLocationFormAction;
  item: AssetLocationItem;
  sites: SiteRow[];
  areas: AreaRow[];
  locations: LocationRow[];
  positions: PositionRow[];
  employees: EmployeeRow[];
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

export function AssetLocationForm({
  action,
  item,
  sites,
  areas,
  locations,
  positions,
  employees,
}: AssetLocationFormProps) {
  const [siteId, setSiteId] = useState(item.site_id ?? "");
  const [areaId, setAreaId] = useState(item.area_id ?? "");
  const [locationId, setLocationId] = useState(item.location_id ?? "");
  const [locationPositionId, setLocationPositionId] = useState(item.location_position_id ?? "");
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState(item.responsible_employee_id ?? "");

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

  useEffect(() => {
    if (
      responsibleEmployeeId &&
      !filteredEmployees.some((employee) => employee.id === responsibleEmployeeId)
    ) {
      setResponsibleEmployeeId("");
    }
  }, [filteredEmployees, responsibleEmployeeId]);

  const selectedLocation = locationId ? locationById.get(locationId) ?? null : null;
  const selectedPosition = locationPositionId
    ? positions.find((position) => position.id === locationPositionId) ?? null
    : null;

  return (
    <form id="asset-location-action" action={action} className="ui-panel space-y-4">
      <input type="hidden" name="asset_id" value={item.id} />

      <div>
        <h2 className="ui-h2">Editar ubicación</h2>
        <p className="mt-2 ui-body-muted">
          Actualiza sede, área, LOC, ubicación interna y responsable. Los campos se filtran para evitar combinaciones inválidas.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
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
            <option value="">{!locationId ? "Elige LOC primero" : "Sin ubicación interna"}</option>
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

        <label className="flex flex-col gap-1 md:col-span-2">
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

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="ui-label">Nota del movimiento</span>
          <textarea
            name="movement_notes"
            className="ui-input min-h-24"
            placeholder="Ej. Trasladado de bodega a barra para operación."
          />
        </label>
      </div>

      <div className="ui-alert ui-alert--warn">
        La validación final evita guardar un LOC o ubicación interna que no pertenezca a la sede/área seleccionada.
      </div>

      <button type="submit" className="ui-btn ui-btn--brand w-full">
        Guardar ubicación
      </button>
    </form>
  );
}
