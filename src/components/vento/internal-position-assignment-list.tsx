"use client";

import { useMemo, useState } from "react";

import { SearchableSingleSelect } from "@/components/inventory/forms/SearchableSingleSelect";

type AssignableRow = {
  productId: string;
  productName: string;
  unit: string;
  total: number;
  positioned: number;
  unpositioned: number;
  positionLines: string[];
};

type PositionOption = {
  id: string;
  label: string;
  kind: string;
};

type Props = {
  locationId: string;
  rows: AssignableRow[];
  positions: PositionOption[];
  action: (formData: FormData) => void | Promise<void>;
};

function formatQty(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(n);
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function positionKindLabel(kind: string) {
  const normalized = String(kind ?? "").toLowerCase();
  if (normalized === "level") return "Niveles";
  if (normalized === "zone") return "Zonas";
  if (normalized === "bin") return "Contenedores";
  if (normalized === "section") return "Secciones";
  return "Estanterias";
}

export function InternalPositionAssignmentList({ locationId, rows, positions, action }: Props) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"pending" | "all">("pending");
  const [selectedPositionsByProduct, setSelectedPositionsByProduct] = useState<Record<string, string>>({});

  const filteredRows = useMemo(() => {
    const needle = normalizeSearch(query);
    return rows.filter((row) => {
      if (mode === "pending" && row.unpositioned <= 0.000001) return false;
      if (!needle) return true;
      const haystack = normalizeSearch(`${row.productName} ${row.unit} ${row.positionLines.join(" ")}`);
      return haystack.includes(needle);
    });
  }, [mode, query, rows]);

  const positionOptions = positions.map((position) => ({
    value: position.id,
    label: position.label,
    searchText: `${position.label} ${position.kind}`,
    groupLabel: positionKindLabel(position.kind),
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="flex flex-col gap-1">
          <span className="ui-label">Buscar producto</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="ui-input h-12"
            placeholder="Nombre, unidad o ubicacion actual"
          />
        </label>
        <div className="flex rounded-2xl border border-[var(--ui-border)] bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMode("pending")}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              mode === "pending"
                ? "bg-amber-100 text-amber-950"
                : "text-[var(--ui-muted)] hover:bg-slate-50 hover:text-[var(--ui-text)]"
            }`}
          >
            Pendientes
          </button>
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              mode === "all"
                ? "bg-amber-100 text-amber-950"
                : "text-[var(--ui-muted)] hover:bg-slate-50 hover:text-[var(--ui-text)]"
            }`}
          >
            Todos
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--ui-muted)]">
        <span>
          Mostrando {filteredRows.length} de {rows.length} productos.
        </span>
        <span>{positions.length} posiciones internas disponibles.</span>
      </div>

      <div className="grid gap-3">
        {filteredRows.map((row) => {
          const selectedPositionId = selectedPositionsByProduct[row.productId] ?? "";
          const isPending = row.unpositioned > 0.000001;
          return (
            <article
              key={row.productId}
              className="rounded-3xl border border-[var(--ui-border)] bg-white p-4 shadow-sm"
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(240px,1fr)_minmax(220px,0.7fr)_minmax(360px,1.3fr)] xl:items-center">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-[var(--ui-text)]">{row.productName}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
                      Total {formatQty(row.total)} {row.unit}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 ${
                        isPending
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : "border-emerald-200 bg-emerald-50 text-emerald-900"
                      }`}
                    >
                      Sin posicion {formatQty(row.unpositioned)} {row.unit}
                    </span>
                  </div>
                </div>

                <div className="text-sm text-[var(--ui-muted)]">
                  <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Asignado</div>
                  <div className="mt-1 leading-relaxed">
                    {row.positionLines.length > 0 ? row.positionLines.join(" / ") : "-"}
                  </div>
                </div>

                {isPending && positions.length > 0 ? (
                  <form action={action} className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_130px_auto]">
                    <input type="hidden" name="location_id" value={locationId} />
                    <input type="hidden" name="product_id" value={row.productId} />
                    <SearchableSingleSelect
                      name="position_id"
                      value={selectedPositionId}
                      onValueChange={(next) =>
                        setSelectedPositionsByProduct((prev) => ({
                          ...prev,
                          [row.productId]: next,
                        }))
                      }
                      options={positionOptions}
                      placeholder="Selecciona estanteria/nivel"
                      searchPlaceholder="Buscar posicion..."
                      emptyMessage="Sin posiciones"
                      sheetTitle="Selecciona ubicacion interna"
                      mobilePresentation="sheet"
                      mobileBreakpointPx={1024}
                    />
                    <input
                      name="quantity"
                      type="number"
                      min="0"
                      step="0.001"
                      max={row.unpositioned}
                      defaultValue={row.unpositioned}
                      className="ui-input text-right"
                      required
                    />
                    <button type="submit" className="ui-btn ui-btn--brand">
                      Ubicar
                    </button>
                  </form>
                ) : (
                  <span className="ui-caption">Sin pendiente</span>
                )}
              </div>
            </article>
          );
        })}

        {filteredRows.length === 0 ? (
          <div className="ui-empty">
            {rows.length === 0
              ? "No hay stock en este LOC para ubicar internamente."
              : "No hay productos que coincidan con esos filtros."}
          </div>
        ) : null}
      </div>
    </div>
  );
}
