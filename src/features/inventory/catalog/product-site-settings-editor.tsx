"use client";

import { useCallback, useState } from "react";

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
  const [lines, setLines] = useState<SiteSettingLine[]>(
    initialRows.length ? initialRows : [emptyLine()]
  );

  const updateLine = useCallback((index: number, patch: Partial<SiteSettingLine>) => {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    );
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, emptyLine()]);
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => {
      const line = prev[index];
      if (line?.id) {
        return prev.map((l, i) => (i === index ? { ...l, _delete: true } : l));
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const visibleLines = lines.filter((l) => !l._delete);

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(lines)} />
      <div className="flex items-center justify-between">
        <span className="ui-label">Configuración por sede</span>
        <button type="button" onClick={addLine} className="ui-btn ui-btn--ghost text-sm">
          + Agregar sede
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-[var(--ui-muted)]">
            <tr>
              <th className="py-2 pr-2">Sede</th>
              <th className="py-2 pr-2">Activo</th>
              <th className="py-2 pr-2">Área default</th>
              <th className="py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((line, index) => {
              const realIndex = lines.findIndex((l) => l === line);
              return (
                <tr key={line.id ?? `new-${index}`} className="border-t border-zinc-200/60">
                  <td className="py-2 pr-2">
                    <select
                      value={line.site_id}
                      onChange={(e) => updateLine(realIndex, { site_id: e.target.value })}
                      className="ui-input min-w-[180px]"
                    >
                      <option value="">Seleccionar sede</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name ?? s.id}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={line.is_active}
                        onChange={(e) => updateLine(realIndex, { is_active: e.target.checked })}
                      />
                      <span className="text-xs">Activo</span>
                    </label>
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={line.default_area_kind ?? ""}
                      onChange={(e) =>
                        updateLine(realIndex, { default_area_kind: e.target.value || undefined })
                      }
                      className="ui-input min-w-[120px]"
                    >
                      <option value="">Sin definir</option>
                      {areaKinds.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => removeLine(realIndex)}
                      className="text-red-600 hover:underline text-xs"
                      title="Quitar"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
