"use client";

import { useCallback, useState } from "react";

import { Table, TableCell, TableHeaderCell } from "@/components/vento/standard/table";

export type SiteSettingLine = {
  id?: string;
  site_id: string;
  is_active: boolean;
  default_area_kind?: string;
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
};

const emptyLine = (): SiteSettingLine => ({
  site_id: "",
  is_active: true,
  default_area_kind: "",
  audience: "BOTH",
});

export function ProductSiteSettingsEditor({
  name = "site_settings_lines",
  initialRows,
  sites,
  areaKinds,
}: Props) {
  const [lines, setLines] = useState<SiteSettingLine[]>(initialRows.length ? initialRows : [emptyLine()]);

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

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(lines)} />
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <span className="ui-label">Configuracion por sede</span>
          <p className="text-xs text-[var(--ui-muted)]">
            Define en que sede estara habilitado el producto y a que area se enviara por defecto.
          </p>
        </div>
        <button
          type="button"
          onClick={addLine}
          className="ui-btn ui-btn--ghost text-sm"
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
          <strong className="text-[var(--ui-text)]">Uso en sede:</strong> limita si esta sede usa el producto para
          Saudo, Vento Cafe o ambos.
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <TableHeaderCell>Sede</TableHeaderCell>
              <TableHeaderCell>Disponible</TableHeaderCell>
              <TableHeaderCell>Area por defecto</TableHeaderCell>
              <TableHeaderCell>Uso en sede</TableHeaderCell>
              <TableHeaderCell className="w-10" />
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((line, index) => {
              const realIndex = lines.findIndex((current) => current === line);
              return (
                <tr key={line.id ?? `new-${index}`} className="ui-body">
                  <TableCell>
                    <div className="space-y-1">
                      <select
                        value={line.site_id}
                        onChange={(event) => updateLine(realIndex, { site_id: event.target.value })}
                        className="ui-input min-w-[180px]"
                      >
                        <option value="">Seleccionar sede</option>
                        {sites.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.name ?? site.id}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-[var(--ui-muted)]">Elige la sede donde este producto estara visible.</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <label className="flex items-center gap-2" title="Activa o desactiva el producto solo para esta sede.">
                      <input
                        type="checkbox"
                        checked={line.is_active}
                        onChange={(event) => updateLine(realIndex, { is_active: event.target.checked })}
                      />
                      <span className="text-xs">Disponible</span>
                    </label>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <select
                        value={line.default_area_kind ?? ""}
                        onChange={(event) =>
                          updateLine(realIndex, { default_area_kind: event.target.value || undefined })
                        }
                        className="ui-input min-w-[120px]"
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
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <select
                        value={line.audience ?? "BOTH"}
                        onChange={(event) =>
                          updateLine(realIndex, {
                            audience: event.target.value as SiteSettingLine["audience"],
                          })
                        }
                        className="ui-input min-w-[180px]"
                      >
                        <option value="BOTH">Ambos (Saudo + Vento Cafe)</option>
                        <option value="SAUDO">Solo Saudo</option>
                        <option value="VCF">Solo Vento Cafe</option>
                      </select>
                      <p className="text-xs text-[var(--ui-muted)]">
                        En remisiones, esta sede solo vera productos del uso seleccionado.
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => removeLine(realIndex)}
                      className="text-red-600 hover:underline text-xs"
                      title="Quitar sede de esta configuracion"
                    >
                      Quitar sede
                    </button>
                  </TableCell>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
