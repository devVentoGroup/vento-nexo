"use client";

import { useCallback, useMemo, useState } from "react";

export type SiteSettingLine = {
  id?: string;
  site_id: string;
  is_active: boolean;
  default_area_kind?: string;
  min_stock_qty?: number;
  audience?: "SAUDO" | "VCF" | "BOTH";
  _delete?: boolean;
};

type SiteOption = { id: string; name: string | null };
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

const emptyLine = (): SiteSettingLine => ({
  site_id: "",
  is_active: true,
  default_area_kind: "",
  min_stock_qty: undefined,
  audience: "BOTH",
});

export function ProductSiteSettingsEditor({
  name = "site_settings_lines",
  initialRows,
  sites,
  areaKinds,
  stockUnitCode,
  operationUnitHint,
}: Props) {
  const [lines, setLines] = useState<SiteSettingLine[]>(initialRows.length ? initialRows : [emptyLine()]);
  const siteNameById = useMemo(
    () =>
      new Map(
        sites.map((site) => [site.id, site.name?.trim() || site.id])
      ),
    [sites]
  );

  const updateLine = useCallback((index: number, patch: Partial<SiteSettingLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, emptyLine()]);
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => {
      const line = prev[index];
      if (line?.id) {
        return prev.map((current, i) => (i === index ? { ...current, _delete: true } : current));
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const visibleLines = lines.filter((line) => !line._delete);
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

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(lines)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <span className="ui-label">Configuracion por sede</span>
          <p className="text-xs text-[var(--ui-muted)]">
            Define en que sede estara habilitado el producto y a que area se enviara por defecto.
          </p>
        </div>
        <button
          type="button"
          onClick={addLine}
          className="ui-btn ui-btn--ghost ui-btn--sm"
          title="Agrega otra sede donde este producto tambien estara disponible."
        >
          + Agregar sede
        </button>
      </div>
      <div className="ui-panel-soft p-3 text-xs text-[var(--ui-muted)]">
        <p>
          <strong className="text-[var(--ui-text)]">Sede:</strong> donde se podra usar este producto.
        </p>
        <p>
          <strong className="text-[var(--ui-text)]">Disponible:</strong> si se desactiva, no aparece para esa sede.
        </p>
        <p>
          <strong className="text-[var(--ui-text)]">Area por defecto:</strong> destino sugerido para remisiones y
          distribucion interna.
        </p>
        <p>
          <strong className="text-[var(--ui-text)]">Stock minimo:</strong> umbral para alertar compra en la sede activa.
        </p>
        <p>
          <strong className="text-[var(--ui-text)]">Uso en sede:</strong> limita si esta sede usa el producto para
          Saudo, Vento Cafe o ambos.
        </p>
      </div>
      <div className="space-y-3">
        {visibleLines.map((line, index) => {
          const realIndex = lines.findIndex((current) => current === line);
          const selectedSiteIds = new Set(
            visibleLines
              .map((current) => current.site_id.trim())
              .filter(Boolean)
          );
          const selectedSiteName = line.site_id ? siteNameById.get(line.site_id) : null;
          return (
            <div
              key={line.id ?? `new-${index}`}
              className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-[var(--ui-border)] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--ui-text)]">Sede #{index + 1}</span>
                  <span className="rounded-full bg-[var(--ui-bg-soft)] px-2 py-0.5 text-xs text-[var(--ui-muted)]">
                    {selectedSiteName ?? "Sin sede"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(realIndex)}
                  className="ui-btn ui-btn--ghost ui-btn--sm text-[var(--ui-danger)] hover:text-[var(--ui-danger)]"
                  title="Quitar sede de esta configuracion"
                >
                  Quitar sede
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-12">
                <label className="flex flex-col gap-1 md:col-span-4">
                  <span className="ui-label">Sede</span>
                  <select
                    value={line.site_id}
                    onChange={(event) => updateLine(realIndex, { site_id: event.target.value })}
                    className="ui-input"
                  >
                    <option value="">Seleccionar sede</option>
                    {sites.map((site) => (
                      <option
                        key={site.id}
                        value={site.id}
                        disabled={site.id !== line.site_id && selectedSiteIds.has(site.id)}
                      >
                        {site.name ?? site.id}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-[var(--ui-muted)]">
                    Elige la sede donde este producto estara visible.
                  </p>
                </label>

                <div className="flex items-end md:col-span-2">
                  <label
                    className="flex items-center gap-2"
                    title="Activa o desactiva el producto solo para esta sede."
                  >
                    <input
                      type="checkbox"
                      checked={line.is_active}
                      onChange={(event) => updateLine(realIndex, { is_active: event.target.checked })}
                    />
                    <span className="ui-label">Disponible</span>
                  </label>
                </div>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="ui-label">Area por defecto</span>
                  <select
                    value={line.default_area_kind ?? ""}
                    onChange={(event) =>
                      updateLine(realIndex, { default_area_kind: event.target.value || undefined })
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
                  <p className="text-xs text-[var(--ui-muted)]">
                    Si no estas seguro, deja &quot;Sin definir&quot; y ajustalo despues.
                  </p>
                </label>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="ui-label">
                    Stock minimo {stockUnitCode ? `(${stockUnitCode})` : ""}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.000001"
                    value={line.min_stock_qty ?? ""}
                    onChange={(event) =>
                      updateLine(realIndex, {
                        min_stock_qty:
                          event.target.value.trim() === ""
                            ? undefined
                            : Number(event.target.value),
                      })
                    }
                    className="ui-input"
                    placeholder="Ej. 24"
                  />
                  <p className="text-xs text-[var(--ui-muted)]">
                    Si el stock de esta sede baja de aqui, aparece en bajo minimo.
                  </p>
                  {operationUnitHint ? (
                    <p className="text-xs text-[var(--ui-muted)]">
                      Equivale aprox. a{" "}
                      <strong className="text-[var(--ui-text)]">
                        {formatEquivalent(line.min_stock_qty) ?? "-"}
                      </strong>{" "}
                      (1 {operationUnitHint.label.toLowerCase()} = {operationUnitHint.qtyInStockUnit}{" "}
                      {stockUnitCode || "unidad base"}).
                    </p>
                  ) : null}
                </label>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="ui-label">Uso en sede</span>
                  <select
                    value={line.audience ?? "BOTH"}
                    onChange={(event) =>
                      updateLine(realIndex, {
                        audience: event.target.value as SiteSettingLine["audience"],
                      })
                    }
                    className="ui-input"
                  >
                    <option value="BOTH">Ambos (Saudo + Vento Cafe)</option>
                    <option value="SAUDO">Solo Saudo</option>
                    <option value="VCF">Solo Vento Cafe</option>
                  </select>
                  <p className="text-xs text-[var(--ui-muted)]">
                    En remisiones, esta sede solo vera productos del uso seleccionado.
                  </p>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
