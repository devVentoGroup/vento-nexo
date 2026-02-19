"use client";

import { useMemo, useState } from "react";

export type SiteSettingLine = {
  id?: string;
  site_id: string;
  is_active: boolean;
  default_area_kind?: string;
  min_stock_qty?: number;
  audience?: "SAUDO" | "VCF" | "BOTH" | "INTERNAL";
  _delete?: boolean;
};

type SiteOption = { id: string; name: string | null; site_type?: string | null };
type AreaKindOption = { code: string; name: string };

type Props = {
  name?: string;
  initialRows: SiteSettingLine[];
  sites: SiteOption[];
  areaKinds: AreaKindOption[];
  stockUnitCode?: string;
  operationUnitHint?: {
    label: string;
    inputUnitCode: string;
    qtyInInputUnit: number;
    qtyInStockUnit: number;
  } | null;
};

type SiteKind = "production_center" | "satellite" | "other";

type SatelliteState = {
  enabled: boolean;
  isActive: boolean;
  defaultAreaKind: string;
  minStockQty?: number;
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function inferSiteKind(site: SiteOption): SiteKind {
  const explicit = String(site.site_type ?? "").trim().toLowerCase();
  if (explicit === "production_center") return "production_center";
  if (explicit === "satellite") return "satellite";
  const normalizedName = normalizeText(site.name);
  if (normalizedName.includes("centro de produccion")) return "production_center";
  if (normalizedName.includes("saudo") || normalizedName.includes("vento cafe")) return "satellite";
  return "other";
}

function inferSatelliteAudience(site: SiteOption): "SAUDO" | "VCF" | "BOTH" {
  const normalizedName = normalizeText(site.name);
  if (normalizedName.includes("saudo")) return "SAUDO";
  if (normalizedName.includes("vento cafe") || normalizedName.includes("vcf")) return "VCF";
  return "BOTH";
}

export function ProductSiteSettingsEditor({
  name = "site_settings_lines",
  initialRows,
  sites,
  areaKinds,
  stockUnitCode,
  operationUnitHint,
}: Props) {
  const siteMap = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const initialBySite = useMemo(() => {
    const map = new Map<string, SiteSettingLine>();
    for (const row of initialRows) {
      const siteId = String(row.site_id ?? "").trim();
      if (!siteId || map.has(siteId)) continue;
      map.set(siteId, row);
    }
    return map;
  }, [initialRows]);

  const productionSites = useMemo(
    () => sites.filter((site) => inferSiteKind(site) === "production_center"),
    [sites]
  );
  const satelliteSites = useMemo(
    () => sites.filter((site) => inferSiteKind(site) === "satellite"),
    [sites]
  );
  const managedSiteIds = useMemo(
    () => new Set([...productionSites, ...satelliteSites].map((site) => site.id)),
    [productionSites, satelliteSites]
  );

  const fallbackCenter = productionSites[0]?.id ?? "";
  const existingCenter = initialRows.find((row) => managedSiteIds.has(row.site_id) && inferSiteKind(siteMap.get(row.site_id) ?? { id: "", name: null }) === "production_center");
  const [centerSiteId, setCenterSiteId] = useState(existingCenter?.site_id ?? fallbackCenter);
  const [centerIsActive, setCenterIsActive] = useState(Boolean(existingCenter?.is_active ?? true));
  const [centerDefaultAreaKind, setCenterDefaultAreaKind] = useState(existingCenter?.default_area_kind ?? "");
  const [centerMinStockQty, setCenterMinStockQty] = useState<number | undefined>(
    existingCenter?.min_stock_qty
  );

  const initialSatelliteState = useMemo(() => {
    const state = new Map<string, SatelliteState>();
    for (const site of satelliteSites) {
      const existing = initialBySite.get(site.id);
      state.set(site.id, {
        enabled: Boolean(existing?.id) || Boolean(existing?.is_active),
        isActive: Boolean(existing?.is_active ?? true),
        defaultAreaKind: existing?.default_area_kind ?? "",
        minStockQty: existing?.min_stock_qty,
      });
    }
    return state;
  }, [initialBySite, satelliteSites]);
  const [satelliteState, setSatelliteState] = useState<Map<string, SatelliteState>>(initialSatelliteState);

  const unknownRows = useMemo(
    () => initialRows.filter((row) => !managedSiteIds.has(String(row.site_id ?? "").trim())),
    [initialRows, managedSiteIds]
  );

  const operationFactorToStock =
    operationUnitHint &&
    Number.isFinite(operationUnitHint.qtyInInputUnit) &&
    Number.isFinite(operationUnitHint.qtyInStockUnit) &&
    operationUnitHint.qtyInInputUnit > 0 &&
    operationUnitHint.qtyInStockUnit > 0
      ? operationUnitHint.qtyInStockUnit / operationUnitHint.qtyInInputUnit
      : null;

  const formatEquivalent = (minStockQty?: number) => {
    if (minStockQty == null || !Number.isFinite(minStockQty) || minStockQty < 0) return null;
    if (!operationUnitHint || !operationFactorToStock) return null;
    const inOperationUnits = minStockQty / operationFactorToStock;
    const rounded = Math.round(inOperationUnits * 100) / 100;
    return `${rounded} ${operationUnitHint.label.toLowerCase()}${rounded === 1 ? "" : "s"}`;
  };

  const lines = useMemo(() => {
    const next: SiteSettingLine[] = [...unknownRows];

    if (centerSiteId) {
      const current = initialBySite.get(centerSiteId);
      next.push({
        id: current?.id,
        site_id: centerSiteId,
        is_active: centerIsActive,
        default_area_kind: centerDefaultAreaKind || undefined,
        min_stock_qty: centerMinStockQty,
        audience: "INTERNAL",
      });
    }

    for (const site of satelliteSites) {
      const current = initialBySite.get(site.id);
      const state = satelliteState.get(site.id) ?? {
        enabled: false,
        isActive: true,
        defaultAreaKind: "",
        minStockQty: undefined,
      };
      if (!state.enabled && !current?.id) continue;

      next.push({
        id: current?.id,
        site_id: site.id,
        is_active: state.enabled ? state.isActive : false,
        default_area_kind: state.defaultAreaKind || undefined,
        min_stock_qty: state.minStockQty,
        audience: inferSatelliteAudience(site),
      });
    }

    return next;
  }, [
    centerDefaultAreaKind,
    centerIsActive,
    centerMinStockQty,
    centerSiteId,
    initialBySite,
    satelliteSites,
    satelliteState,
    unknownRows,
  ]);

  const updateSatellite = (siteId: string, patch: Partial<SatelliteState>) => {
    setSatelliteState((prev) => {
      const next = new Map(prev);
      const current = next.get(siteId) ?? {
        enabled: false,
        isActive: true,
        defaultAreaKind: "",
        minStockQty: undefined,
      };
      next.set(siteId, { ...current, ...patch });
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <input type="hidden" name={name} value={JSON.stringify(lines)} />

      <div className="space-y-1">
        <span className="ui-label">Disponibilidad por sede</span>
        <p className="text-xs text-[var(--ui-muted)]">
          Stock real solo en Centro (LOC). En satelites solo defines si el producto se puede solicitar por remision.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
        <div className="mb-3 border-b border-[var(--ui-border)] pb-3">
          <div className="text-sm font-semibold text-[var(--ui-text)]">Centro de produccion (stock real)</div>
          <p className="text-xs text-[var(--ui-muted)]">
            Este bloque define la configuracion interna del Centro. Aqui vive el stock real (por LOC).
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-12">
          <label className="flex flex-col gap-1 md:col-span-4">
            <span className="ui-label">Sede centro</span>
            <select
              value={centerSiteId}
              onChange={(event) => setCenterSiteId(event.target.value)}
              className="ui-input"
            >
              <option value="">Seleccionar centro</option>
              {productionSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name ?? site.id}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end md:col-span-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={centerIsActive}
                onChange={(event) => setCenterIsActive(event.target.checked)}
              />
              <span className="ui-label">Disponible</span>
            </label>
          </div>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="ui-label">Area por defecto</span>
            <select
              value={centerDefaultAreaKind}
              onChange={(event) => setCenterDefaultAreaKind(event.target.value)}
              className="ui-input"
            >
              <option value="">Sin definir</option>
              {areaKinds.map((area) => (
                <option key={area.code} value={area.code}>
                  {area.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="ui-label">Stock minimo {stockUnitCode ? `(${stockUnitCode})` : ""}</span>
            <input
              type="number"
              min={0}
              step="0.000001"
              value={centerMinStockQty ?? ""}
              onChange={(event) =>
                setCenterMinStockQty(
                  event.target.value.trim() === "" ? undefined : Number(event.target.value)
                )
              }
              className="ui-input"
              placeholder="Ej. 24"
            />
            {operationUnitHint ? (
              <p className="text-xs text-[var(--ui-muted)]">
                Equivale aprox. a{" "}
                <strong className="text-[var(--ui-text)]">
                  {formatEquivalent(centerMinStockQty) ?? "-"}
                </strong>
                .
              </p>
            ) : null}
          </label>

          <div className="flex flex-col gap-1 md:col-span-2">
            <span className="ui-label">Uso operativo</span>
            <div className="ui-input flex h-11 items-center text-[var(--ui-muted)]">Solo interno (Centro)</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
        <div className="mb-3 border-b border-[var(--ui-border)] pb-3">
          <div className="text-sm font-semibold text-[var(--ui-text)]">
            Sedes satelite (catalogo para solicitar remision)
          </div>
          <p className="text-xs text-[var(--ui-muted)]">
            Activa solo las sedes que pueden pedir este producto en remisiones.
          </p>
        </div>

        <div className="space-y-3">
          {satelliteSites.map((site) => {
            const state = satelliteState.get(site.id) ?? {
              enabled: false,
              isActive: true,
              defaultAreaKind: "",
              minStockQty: undefined,
            };
            return (
              <div key={site.id} className="rounded-xl border border-[var(--ui-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--ui-text)]">{site.name ?? site.id}</div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.enabled}
                      onChange={(event) => updateSatellite(site.id, { enabled: event.target.checked })}
                    />
                    <span className="ui-label">Habilitar para solicitar</span>
                  </label>
                </div>

                {state.enabled ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-12">
                    <div className="flex items-end md:col-span-3">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={state.isActive}
                          onChange={(event) => updateSatellite(site.id, { isActive: event.target.checked })}
                        />
                        <span className="ui-label">Disponible</span>
                      </label>
                    </div>

                    <label className="flex flex-col gap-1 md:col-span-4">
                      <span className="ui-label">Area por defecto</span>
                      <select
                        value={state.defaultAreaKind}
                        onChange={(event) =>
                          updateSatellite(site.id, { defaultAreaKind: event.target.value })
                        }
                        className="ui-input"
                      >
                        <option value="">Sin definir</option>
                        {areaKinds.map((area) => (
                          <option key={area.code} value={area.code}>
                            {area.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 md:col-span-3">
                      <span className="ui-label">Stock minimo (referencia)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.000001"
                        value={state.minStockQty ?? ""}
                        onChange={(event) =>
                          updateSatellite(site.id, {
                            minStockQty:
                              event.target.value.trim() === ""
                                ? undefined
                                : Number(event.target.value),
                          })
                        }
                        className="ui-input"
                        placeholder="Ej. 24"
                      />
                    </label>

                    <div className="flex flex-col gap-1 md:col-span-2">
                      <span className="ui-label">Uso operativo</span>
                      <div className="ui-input flex h-11 items-center text-[var(--ui-muted)]">
                        {inferSatelliteAudience(site) === "SAUDO"
                          ? "Solo Saudo"
                          : inferSatelliteAudience(site) === "VCF"
                            ? "Solo Vento Cafe"
                            : "Satelite"}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
