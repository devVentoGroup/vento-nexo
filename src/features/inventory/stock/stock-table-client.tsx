"use client";

import { useMemo, useState } from "react";

import { Table, TableCell, TableHeaderCell } from "@/components/vento/standard/table";

export type StockTableLocation = {
  id: string;
  label: string;
};

export type StockTableRow = {
  id: string;
  product: string;
  unit: string;
  totalQty: number;
  purchaseUnitLabel?: string | null;
  stockQtyPerPurchaseUnit?: number | null;
  updatedAt?: string | null;
  searchText: string;
  areaSummary?: string;
  hasStockWithoutArea?: boolean;
  byLocation?: Record<string, number>;
};

type Props = {
  rows: StockTableRow[];
  locations?: StockTableLocation[];
  mode: "site" | "by-location";
  emptyMessage: string;
};

function formatQty(value: number) {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("es-CO", { maximumFractionDigits: 3 });
}

function formatPurchaseQty(row: StockTableRow, value: number) {
  const factor = Number(row.stockQtyPerPurchaseUnit ?? 0);
  const label = String(row.purchaseUnitLabel ?? "").trim();
  if (!label || !Number.isFinite(factor) || factor <= 0) return `${formatQty(value)} ${row.unit}`;
  return `${formatQty(value / factor)} ${label}`;
}

function displayQty(row: StockTableRow, value: number, displayMode: "base" | "purchase") {
  return displayMode === "purchase" ? formatPurchaseQty(row, value) : formatQty(value);
}

function stockTone(value: number) {
  if (value < -0.000001) return "negative";
  if (Math.abs(value) <= 0.000001) return "zero";
  return "positive";
}

function stockToneClass(value: number) {
  const tone = stockTone(value);
  if (tone === "negative") return "border-rose-200 bg-rose-50 text-rose-700";
  if (tone === "zero") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function stockStatusLabel(row: StockTableRow) {
  if (row.totalQty < -0.000001) return "Negativo";
  if (row.hasStockWithoutArea) return "Sin área completa";
  if (Math.abs(row.totalQty) <= 0.000001) return "Sin saldo";
  return "OK";
}

function stockStatusClass(row: StockTableRow) {
  if (row.totalQty < -0.000001) return "ui-chip ui-chip--danger";
  if (row.hasStockWithoutArea) return "ui-chip ui-chip--warn";
  if (Math.abs(row.totalQty) <= 0.000001) return "ui-chip";
  return "ui-chip ui-chip--success";
}

function splitAreaSummary(value?: string | null) {
  return String(value ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function initials(value: string) {
  const words = value
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "ST";
}

export function StockTableClient({ rows, locations = [], mode, emptyMessage }: Props) {
  const [query, setQuery] = useState("");
  const [displayMode, setDisplayMode] = useState<"base" | "purchase">("base");
  const normalizedQuery = query.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    if (!normalizedQuery) return rows;
    return rows.filter((row) => row.searchText.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, rows]);

  const isByLocation = mode === "by-location";
  const hasPurchaseUnits = rows.some((row) => row.purchaseUnitLabel && row.stockQtyPerPurchaseUnit);

  const summary = useMemo(() => {
    const totalQty = filteredRows.reduce((sum, row) => sum + (Number.isFinite(row.totalQty) ? row.totalQty : 0), 0);
    const positive = filteredRows.filter((row) => row.totalQty > 0.000001).length;
    const zero = filteredRows.filter((row) => Math.abs(row.totalQty) <= 0.000001).length;
    const negative = filteredRows.filter((row) => row.totalQty < -0.000001).length;
    const withoutArea = filteredRows.filter((row) => row.hasStockWithoutArea).length;

    return {
      totalQty,
      positive,
      zero,
      negative,
      withoutArea,
    };
  }, [filteredRows]);

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-3 md:grid-cols-[minmax(260px,1fr)_auto] md:items-end">
            <label className="flex flex-col gap-1">
              <span className="ui-label">{isByLocation ? "Buscar producto o LOC" : "Buscar producto o área"}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={isByLocation ? "Nombre, unidad, área o LOC" : "Nombre, unidad o distribución"}
                className="ui-input"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="ui-btn ui-btn--ghost"
                >
                  Limpiar
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="ui-chip">
              {filteredRows.length} de {rows.length}
            </span>
            <span className="ui-chip ui-chip--success">{summary.positive} con saldo</span>
            {summary.negative > 0 ? (
              <span className="ui-chip ui-chip--danger">{summary.negative} negativos</span>
            ) : null}
            {summary.withoutArea > 0 && !isByLocation ? (
              <span className="ui-chip ui-chip--warn">{summary.withoutArea} sin área</span>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Total visible</div>
            <div className="mt-1 font-mono text-xl font-black text-[var(--ui-text)]">
              {formatQty(summary.totalQty)}
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">Con saldo</div>
            <div className="mt-1 text-xl font-black text-emerald-950">{summary.positive}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Sin saldo</div>
            <div className="mt-1 text-xl font-black text-[var(--ui-text)]">{summary.zero}</div>
          </div>
          <div className={summary.negative > 0 ? "rounded-2xl border border-rose-200 bg-rose-50 p-3" : "rounded-2xl border border-slate-200 bg-white/80 p-3"}>
            <div className={summary.negative > 0 ? "text-xs font-bold uppercase tracking-wide text-rose-700" : "text-xs font-bold uppercase tracking-wide text-slate-500"}>
              Alertas
            </div>
            <div className={summary.negative > 0 ? "mt-1 text-xl font-black text-rose-950" : "mt-1 text-xl font-black text-[var(--ui-text)]"}>
              {summary.negative + summary.withoutArea}
            </div>
          </div>
        </div>

        {hasPurchaseUnits ? (
          <div className="mt-4 inline-flex rounded-2xl border border-[var(--ui-border)] bg-white p-1 text-sm shadow-sm">
            <button
              type="button"
              onClick={() => setDisplayMode("base")}
              className={`rounded-xl px-4 py-2 font-semibold transition ${
                displayMode === "base"
                  ? "bg-[var(--ui-bg-soft)] text-[var(--ui-text)] shadow-sm"
                  : "text-[var(--ui-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
              }`}
            >
              Unidad base
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("purchase")}
              className={`rounded-xl px-4 py-2 font-semibold transition ${
                displayMode === "purchase"
                  ? "bg-[var(--ui-bg-soft)] text-[var(--ui-text)] shadow-sm"
                  : "text-[var(--ui-muted)] hover:bg-[var(--ui-surface-2)] hover:text-[var(--ui-text)]"
              }`}
            >
              Presentación compra
            </button>
          </div>
        ) : null}
      </div>

      <div className="ui-scrollbar-subtle max-h-[70vh] overflow-x-auto overflow-y-auto rounded-[1.5rem] border border-[var(--ui-border)] bg-white">
        <Table
          className={
            isByLocation
              ? "min-w-[980px] table-auto [&_th]:pr-4 [&_td]:pr-4 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--ui-surface)] [&_thead_th]:backdrop-blur [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-20 [&_th:first-child]:bg-[var(--ui-surface)] [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-white"
              : "min-w-[900px] table-auto [&_th]:pr-4 [&_td]:pr-4 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--ui-surface)] [&_thead_th]:backdrop-blur"
          }
        >
          <thead>
            <tr>
              <TableHeaderCell className="min-w-[300px]">Producto</TableHeaderCell>
              <TableHeaderCell className="min-w-[150px] text-right">Stock</TableHeaderCell>
              <TableHeaderCell className="min-w-[90px]">Unidad</TableHeaderCell>
              {isByLocation ? (
                locations.map((location) => (
                  <TableHeaderCell
                    key={location.id}
                    className="min-w-[140px] text-right whitespace-nowrap"
                  >
                    {location.label}
                  </TableHeaderCell>
                ))
              ) : (
                <TableHeaderCell className="min-w-[360px]">Distribución por área / LOC</TableHeaderCell>
              )}
              {!isByLocation ? (
                <>
                  <TableHeaderCell className="min-w-[150px] whitespace-nowrap">Estado</TableHeaderCell>
                  <TableHeaderCell className="min-w-[120px] whitespace-nowrap">Actualizado</TableHeaderCell>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const qtyClass = row.totalQty < 0 ? "text-rose-700" : "text-[var(--ui-text)]";
              const areaParts = splitAreaSummary(row.areaSummary);

              return (
                <tr key={row.id} className="ui-body transition hover:bg-[var(--ui-surface-2)]">
                  <TableCell className="align-top">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-600">
                        {initials(row.product)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-[var(--ui-text)]">{row.product}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className={stockStatusClass(row)}>{stockStatusLabel(row)}</span>
                          {row.purchaseUnitLabel ? (
                            <span className="ui-chip">{row.purchaseUnitLabel}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className={`font-mono text-right align-top text-base font-black whitespace-nowrap ${qtyClass}`}>
                    {displayQty(row, row.totalQty, displayMode)}
                  </TableCell>

                  <TableCell className="align-top whitespace-nowrap">
                    <span className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                      {row.unit}
                    </span>
                  </TableCell>

                  {isByLocation ? (
                    locations.map((location) => {
                      const qty = row.byLocation?.[location.id] ?? 0;
                      return (
                        <TableCell key={location.id} className="text-right align-top whitespace-nowrap">
                          {Math.abs(qty) > 0.000001 ? (
                            <span className={`inline-flex rounded-xl border px-2 py-1 font-mono text-xs font-bold ${stockToneClass(qty)}`}>
                              {displayQty(row, qty, displayMode)}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--ui-muted)]">-</span>
                          )}
                        </TableCell>
                      );
                    })
                  ) : (
                    <TableCell
                      className={`align-top ${row.hasStockWithoutArea ? "text-amber-800" : ""}`}
                    >
                      {areaParts.length > 0 ? (
                        <div className="flex max-w-[520px] flex-wrap gap-1.5">
                          {areaParts.slice(0, 6).map((part) => (
                            <span
                              key={part}
                              className={
                                part.toLowerCase().includes("sin área") || part.toLowerCase().includes("sin area")
                                  ? "rounded-xl border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
                                  : "rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"
                              }
                            >
                              {part.replace("Sin area", "Sin área")}
                            </span>
                          ))}
                          {areaParts.length > 6 ? (
                            <span className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500">
                              +{areaParts.length - 6}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--ui-muted)]">Sin distribución registrada</span>
                      )}
                    </TableCell>
                  )}

                  {!isByLocation ? (
                    <>
                      <TableCell className="align-top whitespace-nowrap">
                        <span className={stockStatusClass(row)}>{stockStatusLabel(row)}</span>
                      </TableCell>
                      <TableCell className="font-mono align-top whitespace-nowrap text-xs text-[var(--ui-muted)]">
                        {row.updatedAt ?? "-"}
                      </TableCell>
                    </>
                  ) : null}
                </tr>
              );
            })}

            {filteredRows.length === 0 ? (
              <tr>
                <TableCell
                  colSpan={isByLocation ? 3 + locations.length : 6}
                  className="ui-empty"
                >
                  <div className="py-8 text-center">
                    <div className="text-3xl">🔎</div>
                    <div className="mt-2 font-semibold text-[var(--ui-text)]">Sin resultados</div>
                    <div className="mt-1 text-sm text-[var(--ui-muted)]">{emptyMessage}</div>
                  </div>
                </TableCell>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
