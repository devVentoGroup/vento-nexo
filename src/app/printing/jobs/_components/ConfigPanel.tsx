"use client";

import type { BarcodeKind, LocRow, Preset } from "../_lib/types";

export type ConfigPanelProps = {
  presets: Preset[];
  preset: Preset;
  presetId: string;
  setPresetId: (id: string) => void;
  title: string;
  setTitle: (t: string) => void;
  dpi: number;
  setDpi: (n: number) => void;
  offsetXmm: number;
  setOffsetXmm: (n: number) => void;
  offsetYmm: number;
  setOffsetYmm: (n: number) => void;
  showAdvanced: boolean;
  setShowAdvanced: (v: boolean) => void;
  barcodeKind: BarcodeKind;
  code128HeightDots: number;
  setCode128HeightDots: (n: number) => void;
  dmModuleDots: number;
  setDmModuleDots: (n: number) => void;
  locs: LocRow[];
  locSearch: string;
  setLocSearch: (s: string) => void;
  filteredLocs: LocRow[];
  selectedLocCode: string;
  setSelectedLocCode: (s: string) => void;
  loadLocs: () => void;
  addSelectedLocToQueue: (mode: "replace" | "append") => void;
};

export function ConfigPanel({
  presets,
  preset,
  presetId,
  setPresetId,
  title,
  setTitle,
  dpi,
  setDpi,
  offsetXmm,
  setOffsetXmm,
  offsetYmm,
  setOffsetYmm,
  showAdvanced,
  setShowAdvanced,
  barcodeKind,
  code128HeightDots,
  setCode128HeightDots,
  dmModuleDots,
  setDmModuleDots,
  locs,
  locSearch,
  setLocSearch,
  filteredLocs,
  selectedLocCode,
  setSelectedLocCode,
  loadLocs,
  addSelectedLocToQueue,
}: ConfigPanelProps) {
  return (
    <div className="ui-panel">
      <div className="ui-h3">Configuración</div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <div className="ui-caption font-medium">Tipo rápido</div>
          <div className="mt-1 inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <button
              type="button"
              onClick={() => setPresetId("LOC_50x70")}
              className={`px-4 py-2 text-sm font-semibold ${
                preset.defaultType === "LOC"
                  ? "bg-[var(--ui-brand)] text-[var(--ui-on-primary)]"
                  : "bg-[var(--ui-surface)] text-[var(--ui-text)]"
              }`}
            >
              LOC
            </button>
            <button
              type="button"
              onClick={() => setPresetId("SKU_32x25_3UP")}
              className={`px-4 py-2 text-sm font-semibold ${
                preset.defaultType === "SKU"
                  ? "bg-[var(--ui-brand)] text-[var(--ui-on-primary)]"
                  : "bg-[var(--ui-surface)] text-[var(--ui-text)]"
              }`}
            >
              SKU
            </button>
            <button
              type="button"
              onClick={() => setPresetId("PROD_50x30")}
              className={`px-4 py-2 text-sm font-semibold ${
                preset.defaultType === "PROD"
                  ? "bg-[var(--ui-brand)] text-[var(--ui-on-primary)]"
                  : "bg-[var(--ui-surface)] text-[var(--ui-text)]"
              }`}
            >
              PROD
            </button>
          </div>
          <div className="mt-2 ui-caption">
            Esto solo cambia el preset recomendado. La cola es la que define qué se imprime.
          </div>
        </div>

        <div className="col-span-2">
          <div className="ui-caption font-medium">Preset</div>
          <select
            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <div className="ui-caption font-medium">Título</div>
          <input
            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="col-span-2 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold"
          >
            {showAdvanced ? "Ocultar ajustes avanzados" : "Mostrar ajustes avanzados"}
          </button>
          <div className="ui-caption text-[var(--ui-muted)]">
            DPI {dpi} · Offset {offsetXmm}×{offsetYmm} mm · {preset.widthMm}×{preset.heightMm} mm
          </div>
        </div>

        {showAdvanced ? (
          <>
            <div>
              <div className="ui-caption font-medium">DPI</div>
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
              >
                <option value={203}>203 dpi</option>
                <option value={300}>300 dpi</option>
              </select>
            </div>

            <div>
              <div className="ui-caption font-medium">Margen horizontal (mm)</div>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={offsetXmm}
                onChange={(e) => setOffsetXmm(Number(e.target.value || "0"))}
                title="Desplaza la etiqueta a la derecha si imprime cortada"
              />
            </div>

            <div>
              <div className="ui-caption font-medium">Margen vertical (mm)</div>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={offsetYmm}
                onChange={(e) => setOffsetYmm(Number(e.target.value || "0"))}
                title="Desplaza la etiqueta hacia abajo si imprime cortada"
              />
            </div>

            <div>
              <div className="ui-caption font-medium">Tipo de código</div>
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm opacity-70"
                value={barcodeKind}
                disabled
                title="Estándar bloqueado por preset"
              >
                <option value="datamatrix">DataMatrix (2D)</option>
                <option value="code128">Code128 (1D)</option>
              </select>
            </div>

            {barcodeKind === "datamatrix" ? (
              <div>
                <div className="ui-caption font-medium">Módulo DM (dots)</div>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={dmModuleDots}
                  onChange={(e) => setDmModuleDots(Number(e.target.value || "0"))}
                />
              </div>
            ) : (
              <div>
                <div className="ui-caption font-medium">Alto Code128 (dots)</div>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={code128HeightDots}
                  onChange={(e) => setCode128HeightDots(Number(e.target.value || "0"))}
                />
              </div>
            )}

            <div className="col-span-2 ui-caption text-[var(--ui-muted)]">
              Si la etiqueta no sale bien alineada, ajusta los márgenes o usa{" "}
              <span className="font-medium">Probar posición</span>.
            </div>
          </>
        ) : null}
      </div>

      <div className="mt-5 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 ui-caption">
        <div className="font-semibold text-[var(--ui-text)]">Ubicación</div>
        <div className="mt-1 text-[var(--ui-muted)]">
          Elige una ubicación (LOC) de la lista y agrégalo a la cola para imprimir su etiqueta.
        </div>
      </div>

      <div className="mt-6">
        {preset.defaultType === "LOC" ? (
          <>
            <div className="ui-h3">Elegir ubicación</div>

            <div className="mt-3 flex items-center gap-3">
              <button
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 ui-body font-semibold"
                onClick={loadLocs}
                type="button"
              >
                Actualizar lista
              </button>

              <input
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Buscar por código o descripción…"
                value={locSearch}
                onChange={(e) => setLocSearch(e.target.value)}
              />
            </div>

            <div className="mt-3 flex items-center gap-3">
              <select
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={selectedLocCode}
                onChange={(e) => setSelectedLocCode(e.target.value)}
              >
                <option value="">{locs.length ? "Selecciona una ubicación" : "Cargando…"}</option>
                {filteredLocs.map((l) => (
                  <option key={l.id} value={l.code}>
                    {l.code}
                    {l.description ? ` – ${String(l.description).slice(0, 40)}` : ""}
                  </option>
                ))}
              </select>

              <button
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 ui-body font-semibold"
                onClick={() => addSelectedLocToQueue("replace")}
                type="button"
              >
                Reemplazar
              </button>

              <button
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 ui-body font-semibold"
                onClick={() => addSelectedLocToQueue("append")}
                type="button"
              >
                Agregar
              </button>
            </div>

            <div className="mt-2 ui-caption text-[var(--ui-muted)]">
              Al elegir una ubicación se usa la etiqueta estándar 50×70 mm.
            </div>
          </>
        ) : null}

        {preset.defaultType === "SKU" ? (
          <div className="mt-2 ui-caption">
            Para SKU/Producto (3-up), pega códigos en la cola. Se imprime en filas de 3.
          </div>
        ) : null}
      </div>
    </div>
  );
}
