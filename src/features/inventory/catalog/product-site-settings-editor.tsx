"use client";

import { useCallback, useState } from "react";

import { Table, TableCell, TableHeaderCell } from "@/components/vento/standard/table";

export type SiteSettingLine = {
  id?: string;
  site_id: string;
  is_active: boolean;
  default_area_kind?: string;
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
        <span className="ui-label">Configuracion por sede</span>
        <button type="button" onClick={addLine} className="ui-btn ui-btn--ghost text-sm">
          + Agregar sede
        </button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <TableHeaderCell>Sede</TableHeaderCell>
              <TableHeaderCell>Activo</TableHeaderCell>
              <TableHeaderCell>Area default</TableHeaderCell>
              <TableHeaderCell className="w-10" />
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((line, index) => {
              const realIndex = lines.findIndex((current) => current === line);
              return (
                <tr key={line.id ?? `new-${index}`} className="ui-body">
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={line.is_active}
                        onChange={(event) => updateLine(realIndex, { is_active: event.target.checked })}
                      />
                      <span className="text-xs">Activo</span>
                    </label>
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => removeLine(realIndex)}
                      className="text-red-600 hover:underline text-xs"
                      title="Quitar"
                    >
                      Quitar
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

