"use client";

import { useMemo, useState } from "react";

import { formatOperationalPartLabel } from "@/lib/inventory/uom";

export type SiteSettingLine = {
  id?: string;
  site_id: string;
  is_active: boolean;
  default_area_kind?: string;
  area_kinds?: string[];
  production_location_id?: string;
  local_production_enabled?: boolean;
  min_stock_qty?: number;
  min_stock_input_mode?: "base" | "purchase";
  min_stock_purchase_qty?: number;
  min_stock_purchase_unit_code?: string;
  min_stock_purchase_to_base_factor?: number;
  audience?: string | null;
  remission_enabled?: boolean | null;
  _delete?: boolean;
};

type SiteOption = { id: string; name: string | null; site_type?: string | null };
type SiteCapabilities = {
  site_id: string;
  can_request_remissions: boolean;
  can_fulfill_remissions: boolean;
  can_receive_remissions: boolean;
  can_sell: boolean;
  can_produce: boolean;
  can_hold_inventory: boolean;
  is_commercial_business: boolean;
  show_in_product_setup: boolean;
};
type AreaKindOption = { code: string; name: string; use_for_remission?: boolean | null };
type SiteAreaKindOption = { site_id: string; kind: string };
type ProductionLocationOption = {
  id: string;
  site_id: string;
  code: string;
  zone?: string | null;
};

type Props = {
  name?: string;
  initialRows: SiteSettingLine[];
  sites: SiteOption[];
  areaKinds: AreaKindOption[];
  siteAreaKinds: SiteAreaKindOption[];
  productionLocations?: ProductionLocationOption[];
  siteCapabilities?: SiteCapabilities[];
  remissionAreaKindsBySite?: Record<string, string[]>;
  stockUnitCode?: string;
  operationUnitHint?: {
    label: string;
    inputUnitCode: string;
    qtyInInputUnit: number;
    qtyInStockUnit: number;
  } | null;
  purchaseUnitHint?: {
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
  areaKinds: string[];
  remissionEnabled?: boolean | null;
  localProductionEnabled: boolean;
  minStockQty?: number;
  productionLocationId?: string;
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
  if (explicit === "other") return "other";

  const normalizedName = normalizeText(site.name);

  if (normalizedName.includes("centro de producción")) {
    return "production_center";
  }

  return "satellite";
}

function getKnownProductionLocationLabel(value: string | null | undefined): string | null {
  const normalized = normalizeText(value).replace(/[_\s]+/g, "-");
  if (!normalized) return null;

  const tokens = normalized
    .split(/[-/\\]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (
    tokens.includes("coc") ||
    tokens.includes("cocina") ||
    tokens.includes("kitchen")
  ) {
    return "Cocina";
  }

  if (
    tokens.includes("bar") ||
    tokens.includes("barra")
  ) {
    return "Barra";
  }

  if (
    tokens.includes("mos") ||
    tokens.includes("mostrador") ||
    tokens.includes("counter")
  ) {
    return "Mostrador";
  }

  return null;
}

function humanizeProductionLocationLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "LOC sin nombre";

  return raw
    .replace(/^LOC[-_\s]*/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatProductionLocationLabel(location: ProductionLocationOption): string {
  return (
    getKnownProductionLocationLabel(location.zone) ??
    getKnownProductionLocationLabel(location.code) ??
    humanizeProductionLocationLabel(location.zone || location.code || location.id)
  );
}

export function ProductSiteSettingsEditor({
  name = "site_settings_lines",
  initialRows,
  sites,
  areaKinds,
  siteAreaKinds,
  productionLocations = [],
  siteCapabilities = [],
  remissionAreaKindsBySite = {},
  stockUnitCode,
  operationUnitHint,
  purchaseUnitHint,
}: Props) {
  const normalizeAreaKinds = (input: Array<string | null | undefined>): string[] =>
    Array.from(
      new Set(
        input
          .map((value) => String(value ?? "").trim())
          .filter(Boolean)
      )
    );

  const siteMap = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const capabilitiesBySite = useMemo(
    () => new Map(siteCapabilities.map((row) => [row.site_id, row])),
    [siteCapabilities]
  );
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
    () =>
      sites.filter((site) => {
        const capabilities = capabilitiesBySite.get(site.id);
        if (capabilities) return capabilities.can_fulfill_remissions;
        return inferSiteKind(site) === "production_center";
      }),
    [capabilitiesBySite, sites]
  );
  const satelliteSites = useMemo(
    () =>
      sites.filter((site) => {
        const capabilities = capabilitiesBySite.get(site.id);
        if (!capabilities) return inferSiteKind(site) === "satellite";
        const hasOperationalCapability =
          capabilities.can_request_remissions ||
          capabilities.can_receive_remissions ||
          capabilities.can_sell ||
          capabilities.can_produce ||
          capabilities.can_hold_inventory;
        return (
          capabilities.show_in_product_setup &&
          !capabilities.can_fulfill_remissions &&
          (!capabilities.is_commercial_business || hasOperationalCapability)
        );
      }),
    [capabilitiesBySite, sites]
  );
  const managedSiteIds = useMemo(
    () => new Set([...productionSites, ...satelliteSites].map((site) => site.id)),
    [productionSites, satelliteSites]
  );
  const areaKindCodesBySite = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const row of siteAreaKinds) {
      const siteId = String(row.site_id ?? "").trim();
      const kind = String(row.kind ?? "").trim();
      if (!siteId || !kind) continue;
      const set = map.get(siteId) ?? new Set<string>();
      set.add(kind);
      map.set(siteId, set);
    }
    return map;
  }, [siteAreaKinds]);
  const sharedAreaKindCodes = useMemo(() => {
    const count = new Map<string, number>();
    for (const kinds of areaKindCodesBySite.values()) {
      for (const kind of kinds) {
        count.set(kind, (count.get(kind) ?? 0) + 1);
      }
    }
    return new Set(
      Array.from(count.entries())
        .filter(([, sitesCount]) => sitesCount >= 2)
        .map(([kind]) => kind)
    );
  }, [areaKindCodesBySite]);
  const getAreaOptionsForSite = (siteId: string, selectedCode?: string) => {
    const siteCodes = areaKindCodesBySite.get(siteId) ?? new Set<string>();
    const allowed = new Set<string>([...siteCodes, ...sharedAreaKindCodes]);
    if (areaKinds.some((area) => area.code === "general")) {
      allowed.add("general");
    }
    const baseOptions = areaKinds.filter((area) => allowed.has(area.code));
    const selected = String(selectedCode ?? "").trim();
    if (selected && !baseOptions.some((area) => area.code === selected)) {
      const label = areaKinds.find((area) => area.code === selected)?.name ?? selected;
      return [{ code: selected, name: `${label} (fuera de catálogo de la sede)` }, ...baseOptions];
    }
    return baseOptions;
  };
  const getSatelliteRemissionAreaOptionsForSite = (siteId: string, selectedCodes?: string[]) => {
    const selected = Array.isArray(selectedCodes) ? selectedCodes : [];
    const base = getAreaOptionsForSite(siteId, selected[0]);
    const configuredSiteKinds = Array.isArray(remissionAreaKindsBySite[siteId])
      ? remissionAreaKindsBySite[siteId].map((code) => String(code).trim()).filter(Boolean)
      : [];
    if (configuredSiteKinds.length > 0) {
      const sitePolicy = new Set(configuredSiteKinds);
      const strict = base.filter((area) => sitePolicy.has(area.code));
      if (strict.length > 0) return strict;
      return areaKinds
        .filter((area) => sitePolicy.has(area.code))
        .map((area) => ({ code: area.code, name: area.name }));
    }
    const filtered = base.filter((area) => area.code === "general" || Boolean(area.use_for_remission));
    if (filtered.length > 0) return filtered;
    return base;
  };

  const fallbackCenter = productionSites[0]?.id ?? "";
  const existingCenter = initialRows.find((row) => managedSiteIds.has(row.site_id) && inferSiteKind(siteMap.get(row.site_id) ?? { id: "", name: null }) === "production_center");
  const [centerSiteId, setCenterSiteId] = useState(existingCenter?.site_id ?? fallbackCenter);
  const [centerIsActive, setCenterIsActive] = useState(Boolean(existingCenter?.is_active ?? true));
  const [centerDefaultAreaKind, setCenterDefaultAreaKind] = useState(existingCenter?.default_area_kind ?? "");
  const [centerProductionLocationId, setCenterProductionLocationId] = useState(
    existingCenter?.production_location_id ?? ""
  );
  const [centerMinStockInputMode, setCenterMinStockInputMode] = useState<"base" | "purchase">(
    existingCenter?.min_stock_input_mode === "purchase" && purchaseUnitHint ? "purchase" : "base"
  );
  const [centerMinStockQty, setCenterMinStockQty] = useState<number | undefined>(
    existingCenter?.min_stock_qty
  );

  const initialSatelliteState = useMemo(() => {
    const state = new Map<string, SatelliteState>();
    for (const site of satelliteSites) {
      const existing = initialBySite.get(site.id);
      const isActive = Boolean(existing?.is_active ?? false);
      state.set(site.id, {
        enabled: isActive,
        isActive,
        areaKinds: normalizeAreaKinds([
          ...(Array.isArray(existing?.area_kinds) ? existing.area_kinds : []),
          existing?.default_area_kind,
        ]),
        remissionEnabled:
          typeof existing?.remission_enabled === "boolean"
            ? existing.remission_enabled
            : existing
              ? null
              : false,
        localProductionEnabled:
          Boolean(existing?.local_production_enabled) ||
          Boolean(existing?.production_location_id),
        minStockQty: existing?.min_stock_qty,
        productionLocationId: existing?.production_location_id ?? "",
      });
    }
    return state;
  }, [initialBySite, satelliteSites]);
  const [satelliteState, setSatelliteState] = useState<Map<string, SatelliteState>>(initialSatelliteState);

  const unknownRows = useMemo(
    () => initialRows.filter((row) => !managedSiteIds.has(String(row.site_id ?? "").trim())),
    [initialRows, managedSiteIds]
  );
  const getProductionLocationsForSite = (siteId: string) =>
    productionLocations.filter((location) => String(location.site_id ?? "").trim() === siteId);
  const centerProductionLocationOptions = getProductionLocationsForSite(centerSiteId);
  const validCenterProductionLocationId = centerProductionLocationOptions.some(
    (location) => location.id === centerProductionLocationId
  )
    ? centerProductionLocationId
    : "";

  const operationFactorToStock =
    operationUnitHint &&
      Number.isFinite(operationUnitHint.qtyInInputUnit) &&
      Number.isFinite(operationUnitHint.qtyInStockUnit) &&
      operationUnitHint.qtyInInputUnit > 0 &&
      operationUnitHint.qtyInStockUnit > 0
      ? operationUnitHint.qtyInStockUnit / operationUnitHint.qtyInInputUnit
      : null;
  const purchaseFactorToStock =
    purchaseUnitHint &&
      Number.isFinite(purchaseUnitHint.qtyInInputUnit) &&
      Number.isFinite(purchaseUnitHint.qtyInStockUnit) &&
      purchaseUnitHint.qtyInInputUnit > 0 &&
      purchaseUnitHint.qtyInStockUnit > 0
      ? purchaseUnitHint.qtyInStockUnit / purchaseUnitHint.qtyInInputUnit
      : null;
  const centerMinStockQtyInPurchase =
    purchaseFactorToStock &&
      centerMinStockQty != null &&
      Number.isFinite(centerMinStockQty) &&
      centerMinStockQty >= 0
      ? Math.round((centerMinStockQty / purchaseFactorToStock) * 1_000_000) / 1_000_000
      : null;
  const centerPurchaseQtyForSave =
    centerMinStockInputMode === "purchase" &&
      purchaseFactorToStock &&
      centerMinStockQty != null &&
      Number.isFinite(centerMinStockQty) &&
      centerMinStockQty >= 0
      ? Math.round((centerMinStockQty / purchaseFactorToStock) * 1_000_000) / 1_000_000
      : undefined;

  const formatEquivalent = (minStockQty?: number) => {
    if (minStockQty == null || !Number.isFinite(minStockQty) || minStockQty < 0) return null;
    if (!operationUnitHint || !operationFactorToStock) return null;
    const inOperationUnits = minStockQty / operationFactorToStock;
    const rounded = Math.round(inOperationUnits * 100) / 100;
    return `${rounded} ${formatOperationalPartLabel(operationUnitHint.label, rounded)}`;
  };

  const lines = (() => {
    const next: SiteSettingLine[] = [...unknownRows];

    if (centerSiteId) {
      const current = initialBySite.get(centerSiteId);
      next.push({
        id: current?.id,
        site_id: centerSiteId,
        is_active: centerIsActive,
        default_area_kind: centerDefaultAreaKind || undefined,
        production_location_id: validCenterProductionLocationId || undefined,
        local_production_enabled: Boolean(validCenterProductionLocationId),
        min_stock_qty: centerMinStockQty,
        min_stock_input_mode:
          centerMinStockInputMode === "purchase" && purchaseFactorToStock ? "purchase" : "base",
        min_stock_purchase_qty: centerPurchaseQtyForSave,
        min_stock_purchase_unit_code:
          centerMinStockInputMode === "purchase" && purchaseFactorToStock
            ? purchaseUnitHint?.inputUnitCode
            : undefined,
        min_stock_purchase_to_base_factor:
          centerMinStockInputMode === "purchase" && purchaseFactorToStock
            ? purchaseFactorToStock
            : undefined,
        audience: "INTERNAL",
      });
    }

    for (const site of satelliteSites) {
      const current = initialBySite.get(site.id);
      const state = satelliteState.get(site.id) ?? {
        enabled: false,
        isActive: true,
        areaKinds: [],
        localProductionEnabled: false,
        minStockQty: undefined,
      };
      if (!state.enabled && !current?.id) continue;

      const normalizedAreaKinds = normalizeAreaKinds(state.areaKinds);
      const normalizedDefaultAreaKind = normalizedAreaKinds[0] ?? "";
      next.push({
        id: current?.id,
        site_id: site.id,
        is_active: state.enabled ? state.isActive : false,
        default_area_kind: normalizedDefaultAreaKind || undefined,
        area_kinds: normalizedAreaKinds.length ? normalizedAreaKinds : undefined,
        production_location_id: state.localProductionEnabled && getProductionLocationsForSite(site.id).some((location) => location.id === state.productionLocationId)
          ? state.productionLocationId
          : undefined,
        local_production_enabled: Boolean(state.localProductionEnabled),
        min_stock_qty: state.minStockQty,
        min_stock_input_mode: "base",
        audience: current?.audience ?? "BOTH",
        remission_enabled: state.remissionEnabled ?? null,
      });
    }

    return next;
  })();

  const updateSatellite = (siteId: string, patch: Partial<SatelliteState>) => {
    setSatelliteState((prev) => {
      const next = new Map(prev);
      const current = next.get(siteId) ?? {
        enabled: false,
        isActive: true,
        areaKinds: [],
        remissionEnabled: false,
        localProductionEnabled: false,
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
          Define si el producto existe operativamente en cada sede y, aparte, si puede solicitarse por remisión.
        </p>
        <p className="text-xs text-[var(--ui-muted)]">
          El precio comercial y la visibilidad en Vento Pass se configuran después en VISO.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
        <div className="mb-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-800">
          Fase 1 · Centro
        </div>
        <div className="mb-3 border-b border-[var(--ui-border)] pb-3">
          <div className="text-sm font-semibold text-[var(--ui-text)]">Centro de producción</div>
          <p className="text-xs text-[var(--ui-muted)]">
            Este bloque define la configuración interna del Centro. Aquí vive el stock real por LOC.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-12">
          <label className="flex flex-col gap-1 md:col-span-4">
            <span className="ui-label">Sede centro</span>
            <select
              value={centerSiteId}
              onChange={(event) => {
                const nextSiteId = event.target.value;
                setCenterSiteId(nextSiteId);
                setCenterProductionLocationId("");
              }}
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

          <label className="flex flex-col gap-1 md:col-span-3">
            <span className="ui-label">Área por defecto</span>
            <select
              value={centerDefaultAreaKind}
              onChange={(event) => setCenterDefaultAreaKind(event.target.value)}
              className="ui-input"
            >
              <option value="">Sin definir</option>
              {getAreaOptionsForSite(centerSiteId, centerDefaultAreaKind).map((area) => (
                <option key={area.code} value={area.code}>
                  {area.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--ui-muted)]">
              Área sugerida para alistar y despachar en Centro.
            </p>
          </label>

          <label className="flex flex-col gap-1 md:col-span-3">
            <span className="ui-label">LOC de producción</span>
            <select
              value={validCenterProductionLocationId}
              onChange={(event) => setCenterProductionLocationId(event.target.value)}
              className="ui-input"
            >
              <option value="">Sin definir</option>
              {centerProductionLocationOptions.map((location) => (
                <option key={location.id} value={location.id}>
                  {formatProductionLocationLabel(location)}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--ui-muted)]">
              Solo para productos producidos con receta.
            </p>
          </label>

          <div className="flex items-center md:col-span-2 md:pt-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={centerIsActive}
                onChange={(event) => setCenterIsActive(event.target.checked)}
              />
              <span className="ui-label">Disponible</span>
            </label>
          </div>

          <label className="flex flex-col gap-1 md:col-span-4">
            {purchaseUnitHint && purchaseFactorToStock ? (
              <div className="flex items-center justify-between gap-2">
                <span className="ui-label">Modo de mínimo</span>
                <select
                  value={centerMinStockInputMode}
                  onChange={(event) =>
                    setCenterMinStockInputMode(event.target.value === "purchase" ? "purchase" : "base")
                  }
                  className="ui-input h-10 max-w-[180px]"
                >
                  <option value="base">Unidad base</option>
                  <option value="purchase">Unidad de compra</option>
                </select>
              </div>
            ) : null}
            <span className="ui-label">
              Stock mínimo{" "}
              {purchaseUnitHint && purchaseFactorToStock && centerMinStockInputMode === "purchase"
                ? `en compra (${purchaseUnitHint.inputUnitCode})`
                : stockUnitCode
                  ? `(${stockUnitCode})`
                  : ""}
            </span>
            {purchaseUnitHint && purchaseFactorToStock && centerMinStockInputMode === "purchase" ? (
              <input
                type="number"
                min={0}
                step="0.000001"
                value={centerMinStockQtyInPurchase ?? ""}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  if (raw === "") {
                    setCenterMinStockQty(undefined);
                    return;
                  }
                  const parsed = Number(raw);
                  if (!Number.isFinite(parsed) || parsed < 0) return;
                  setCenterMinStockQty(parsed * purchaseFactorToStock);
                }}
                className="ui-input"
                placeholder="Ej. 2"
              />
            ) : (
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
            )}
            {purchaseUnitHint && purchaseFactorToStock ? (
              <p className="text-xs text-[var(--ui-muted)]">
                Se guarda como{" "}
                <strong className="text-[var(--ui-text)]">
                  {centerMinStockQty != null && Number.isFinite(centerMinStockQty)
                    ? `${Math.round(centerMinStockQty * 1_000_000) / 1_000_000} ${stockUnitCode || ""}`
                    : "-"}
                </strong>{" "}
                en unidad base.
              </p>
            ) : null}
            {operationUnitHint ? (
              <p className="text-xs text-[var(--ui-muted)]">
                Equivale aprox. a{" "}
                <strong className="text-[var(--ui-text)]">
                  {formatEquivalent(centerMinStockQty) ?? "-"}
                </strong>
                .
              </p>
            ) : null}
            <p className="text-xs text-[var(--ui-muted)]">
              Si baja de aqui, se marca como bajo mínimo para reabastecer LOC.
            </p>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
        <div className="mb-2 inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-cyan-800">
          Fase 2 · Sedes satélite
        </div>
        <div className="mb-3 border-b border-[var(--ui-border)] pb-3">
          <div className="text-sm font-semibold text-[var(--ui-text)]">
            Sedes satélite
          </div>
          <p className="text-xs text-[var(--ui-muted)]">
            Activa la sede si el producto puede existir, venderse o producirse allí. La remisión se controla aparte.
          </p>
        </div>

        <div className="space-y-3">
          {satelliteSites.map((site) => {
            const capabilities = capabilitiesBySite.get(site.id);
            const canRequestRemissions = capabilities?.can_request_remissions ?? true;
            const canProduce = capabilities?.can_produce ?? true;
            const state = satelliteState.get(site.id) ?? {
              enabled: false,
              isActive: true,
              areaKinds: [],
              minStockQty: undefined,
              productionLocationId: "",
            };
            const satelliteProductionLocationOptions = getProductionLocationsForSite(site.id);
            const validSatelliteProductionLocationId = satelliteProductionLocationOptions.some(
              (location) => location.id === state.productionLocationId
            )
              ? state.productionLocationId
              : "";
            return (
              <div key={site.id} className="rounded-xl border border-[var(--ui-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--ui-text)]">{site.name ?? site.id}</div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={state.enabled}
                      onChange={(event) =>
                        updateSatellite(site.id, {
                          enabled: event.target.checked,
                          isActive: event.target.checked ? true : state.isActive,
                        })
                      }
                    />
                    <span className="ui-label">Configurar esta sede</span>
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
                        <span className="ui-label">Disponible en esta sede</span>
                      </label>
                    </div>

                    <div className="flex flex-col gap-1 md:col-span-4">
                      <span className="ui-label">Remisión hacia esta sede</span>
                      {canRequestRemissions ? (
                        <>
                          <select
                            value={
                              state.remissionEnabled == null
                                ? "legacy"
                                : state.remissionEnabled
                                  ? "enabled"
                                  : "disabled"
                            }
                            onChange={(event) => {
                              const value = event.target.value;
                              updateSatellite(site.id, {
                                remissionEnabled:
                                  value === "legacy" ? null : value === "enabled",
                              });
                            }}
                            className="ui-input"
                          >
                            <option value="disabled">No permitir remisión</option>
                            <option value="enabled">Permitir solicitud por remisión</option>
                            <option value="legacy">Legacy: conservar comportamiento actual</option>
                          </select>
                          <p className="text-xs text-[var(--ui-muted)]">
                            Usa remisión solo cuando esta sede deba pedir el producto a Centro u otra sede origen.
                          </p>
                        </>
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-[var(--ui-muted)]">
                          Esta sede no solicita remisiones.
                        </div>
                      )}

                      {canRequestRemissions && state.remissionEnabled !== false ? (
                        <div className="mt-2 space-y-1">
                          <span className="ui-label">Áreas que pueden solicitar</span>
                          <div className="max-h-40 overflow-auto rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-2">
                            <div className="grid gap-2">
                              {getSatelliteRemissionAreaOptionsForSite(site.id, state.areaKinds).map((area) => {
                                const checked = state.areaKinds.includes(area.code);
                                return (
                                  <label
                                    key={`${site.id}-${area.code}`}
                                    className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-[var(--ui-surface-2)]"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(event) => {
                                        const nextKinds = event.target.checked
                                          ? [...state.areaKinds, area.code]
                                          : state.areaKinds.filter((code) => code !== area.code);
                                        updateSatellite(site.id, { areaKinds: normalizeAreaKinds(nextKinds) });
                                      }}
                                    />
                                    <span>{area.code === "general" ? "Todos" : area.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                          <p className="text-xs text-[var(--ui-muted)]">
                            Puedes marcar varias áreas de remisión. La primera queda como sugerida por defecto.
                          </p>
                        </div>
                      ) : (
                        <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-[var(--ui-muted)]">
                          Este producto podrá estar disponible en la sede y en VISO, pero no aparecerá en el formulario de remisiones.
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 md:col-span-4">
                      <span className="ui-label">Producción local</span>
                      {canProduce ? (
                        <>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={state.localProductionEnabled}
                              onChange={(event) =>
                                updateSatellite(site.id, {
                                  localProductionEnabled: event.target.checked,
                                  productionLocationId: event.target.checked
                                    ? state.productionLocationId
                                    : "",
                                })
                              }
                            />
                            <span>Este producto se produce en esta sede</span>
                          </label>
                          {state.localProductionEnabled ? (
                            <label className="flex flex-col gap-1">
                              <span className="ui-label">LOC de producción local</span>
                              <select
                                value={validSatelliteProductionLocationId}
                                onChange={(event) => updateSatellite(site.id, { productionLocationId: event.target.value })}
                                className="ui-input"
                              >
                                <option value="">Sin definir</option>
                                {satelliteProductionLocationOptions.map((location) => (
                                  <option key={location.id} value={location.id}>
                                    {formatProductionLocationLabel(location)}
                                  </option>
                                ))}
                              </select>
                              <p className="text-xs text-[var(--ui-muted)]">
                                Debe ser un LOC de producción o un LOC de un área habilitada para producción.
                              </p>
                              {satelliteProductionLocationOptions.length === 0 ? (
                                <p className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                                  Esta sede produce, pero no tiene LOCs activos habilitados para producción.
                                </p>
                              ) : null}
                            </label>
                          ) : null}
                        </>
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-[var(--ui-muted)]">
                          Producción local no aplica para esta sede.
                        </div>
                      )}
                    </div>

                    <label className="flex flex-col gap-1 md:col-span-5">
                      <span className="ui-label">Stock mínimo (referencia)</span>
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
                      <p className="text-xs text-[var(--ui-muted)]">
                        Opcional: meta de abastecimiento visual para esta sede (no mueve stock real).
                      </p>
                    </label>
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



