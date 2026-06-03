"use client";

import { useEffect, useMemo, useState } from "react";

type CountLineAction = (formData: FormData) => void | Promise<void>;

type CountLineClientRow = {
  id: string;
  expected_qty: number | null;
  counted_qty: number | null;
  count_status: string | null;
  condition_status: string | null;
  found_site_id: string | null;
  found_area_id: string | null;
  found_location_id: string | null;
  found_location_position_id: string | null;
  notes: string | null;
  is_group: boolean;
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

type AssetCountLineActionsProps = {
  action: CountLineAction;
  disabled: boolean;
  sessionId: string;
  line: CountLineClientRow;
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

function defaultCountedQtyForStatus(
  status: string,
  line: CountLineClientRow
) {
  if (status === "missing" || status === "not_applicable" || status === "pending") return "0";
  if (status === "found" || status === "found_elsewhere" || status === "damaged") {
    if (line.is_group) return String(line.expected_qty ?? 0);
    return "1";
  }
  if (status === "extra") return line.is_group ? "1" : "1";
  return String(line.counted_qty ?? 0);
}

function statusNeedsFoundLocation(status: string) {
  return status === "found_elsewhere" || status === "extra";
}

export function AssetCountLineActions({
  action,
  disabled,
  sessionId,
  line,
  sites,
  areas,
  locations,
  positions,
}: AssetCountLineActionsProps) {
  const [countStatus, setCountStatus] = useState(line.count_status || "pending");
  const [countedQty, setCountedQty] = useState(
    line.counted_qty == null
      ? defaultCountedQtyForStatus(line.count_status || "pending", line)
      : String(line.counted_qty)
  );
  const [siteId, setSiteId] = useState(line.found_site_id ?? "");
  const [areaId, setAreaId] = useState(line.found_area_id ?? "");
  const [locationId, setLocationId] = useState(line.found_location_id ?? "");
  const [locationPositionId, setLocationPositionId] = useState(line.found_location_position_id ?? "");

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

  const applyCountStatus = (nextStatus: string) => {
    setCountStatus(nextStatus);
    setCountedQty(defaultCountedQtyForStatus(nextStatus, line));

    if (!statusNeedsFoundLocation(nextStatus)) {
      setSiteId("");
      setAreaId("");
      setLocationId("");
      setLocationPositionId("");
    }
  };

  useEffect(() => {
    if (!statusNeedsFoundLocation(countStatus)) {
      setSiteId("");
      setAreaId("");
      setLocationId("");
      setLocationPositionId("");
    }
  }, [countStatus]);

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

  const shouldShowFoundLocation = statusNeedsFoundLocation(countStatus);

  return (
    <form action={action} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="line_id" value={line.id} />

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="ui-label">Resultado</span>
          <select
            name="count_status"
            value={countStatus}
            onChange={(event) => applyCountStatus(event.target.value)}
            className="ui-input"
            disabled={disabled}
          >
            <option value="pending">Pendiente</option>
            <option value="found">Encontrado</option>
            <option value="missing">Faltante</option>
            <option value="found_elsewhere">Encontrado en otro LOC</option>
            <option value="damaged">Dañado</option>
            <option value="extra">Extra</option>
            <option value="not_applicable">No aplica</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="ui-label">Cantidad contada</span>
          <input
            name="counted_qty"
            type="number"
            min="0"
            step="0.001"
            value={countedQty}
            onChange={(event) => setCountedQty(event.target.value)}
            className="ui-input"
            disabled={disabled || countStatus === "missing" || countStatus === "not_applicable" || countStatus === "pending"}
          />
          <span className="text-xs text-[var(--ui-muted)]">
            Faltante, pendiente y no aplica guardan 0 automáticamente.
          </span>
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="ui-label">Condición física</span>
          <select
            name="condition_status"
            defaultValue={line.condition_status || ""}
            className="ui-input"
            disabled={disabled}
          >
            <option value="">Sin cambio / no aplica</option>
            <option value="nuevo">Nuevo</option>
            <option value="bueno">Bueno</option>
            <option value="regular">Regular</option>
            <option value="malo">Malo</option>
            <option value="critico">Crítico</option>
          </select>
        </label>

        {shouldShowFoundLocation ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="ui-label">Sede encontrada</span>
              <select
                name="found_site_id"
                value={siteId}
                onChange={(event) => {
                  setSiteId(event.target.value);
                  setAreaId("");
                  setLocationId("");
                  setLocationPositionId("");
                }}
                className="ui-input"
                disabled={disabled}
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
              <span className="ui-label">Área encontrada</span>
              <select
                name="found_area_id"
                value={areaId}
                onChange={(event) => {
                  setAreaId(event.target.value);
                  setLocationId("");
                  setLocationPositionId("");
                }}
                className="ui-input"
                disabled={disabled}
              >
                <option value="">Sin área</option>
                {filteredAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name ?? area.kind ?? area.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">LOC encontrado</span>
              <select
                name="found_location_id"
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
                disabled={disabled}
              >
                <option value="">Sin LOC</option>
                {filteredLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {locationLabel(location)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Ubicación interna encontrada</span>
              <select
                name="found_location_position_id"
                value={locationPositionId}
                onChange={(event) => setLocationPositionId(event.target.value)}
                className="ui-input"
                disabled={disabled || !locationId}
              >
                <option value="">{!locationId ? "Elige LOC primero" : "Sin ubicación interna"}</option>
                {filteredPositions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {positionLabel(position, locationById)}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="ui-label">Notas</span>
          <textarea
            name="notes"
            defaultValue={line.notes ?? ""}
            className="ui-input min-h-24"
            placeholder="Ej. No se encontró, está dañado, está en otra sede, se contó menos cantidad..."
            disabled={disabled}
          />
        </label>
      </div>

      <button type="submit" className="ui-btn ui-btn--brand mt-4 w-full" disabled={disabled}>
        Guardar línea
      </button>

      {disabled ? (
        <div className="mt-3 text-xs font-semibold text-[var(--ui-muted)]">
          Esta sesión no está abierta. No se pueden editar líneas.
        </div>
      ) : null}
    </form>
  );
}
