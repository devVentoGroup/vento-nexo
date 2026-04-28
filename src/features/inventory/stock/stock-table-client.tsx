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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex min-w-[260px] flex-1 flex-col gap-1">
          <span className="ui-label">Buscar producto o area</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Escribe para filtrar"
            className="ui-input"
          />
        </label>
        <div className="ui-caption">
          {filteredRows.length} de {rows.length} producto(s)
        </div>
      </div>

      {hasPurchaseUnits ? (
        <div className="inline-flex rounded-lg border border-[var(--ui-border)] bg-white p-1 text-sm">
          <button
            type="button"
            onClick={() => setDisplayMode("base")}
            className={`rounded-md px-3 py-1.5 font-semibold ${
              displayMode === "base" ? "bg-[var(--ui-bg-soft)] text-[var(--ui-text)]" : "text-[var(--ui-muted)]"
            }`}
          >
            Unidad base
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode("purchase")}
            className={`rounded-md px-3 py-1.5 font-semibold ${
              displayMode === "purchase" ? "bg-[var(--ui-bg-soft)] text-[var(--ui-text)]" : "text-[var(--ui-muted)]"
            }`}
          >
            Presentacion compra
          </button>
        </div>
      ) : null}

      <div className="ui-scrollbar-subtle max-h-[70vh] overflow-x-auto overflow-y-auto">
        <Table
          className={
            isByLocation
              ? "min-w-[900px] table-auto [&_th]:pr-4 [&_td]:pr-4 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--ui-surface)] [&_thead_th]:backdrop-blur [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-20 [&_th:first-child]:bg-[var(--ui-surface)] [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-[var(--ui-surface)]"
              : "min-w-[780px] table-auto [&_th]:pr-4 [&_td]:pr-4 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[var(--ui-surface)] [&_thead_th]:backdrop-blur"
          }
        >
          <thead>
            <tr>
              <TableHeaderCell className="min-w-[260px]">Producto</TableHeaderCell>
              <TableHeaderCell className="min-w-[120px] text-right">Stock</TableHeaderCell>
              <TableHeaderCell className="min-w-[90px]">Unidad</TableHeaderCell>
              {isByLocation ? (
                locations.map((location) => (
                  <TableHeaderCell
                    key={location.id}
                    className="min-w-[130px] text-right whitespace-nowrap"
                  >
                    {location.label}
                  </TableHeaderCell>
                ))
              ) : (
                <TableHeaderCell className="min-w-[260px]">Areas</TableHeaderCell>
              )}
              {!isByLocation ? (
                <TableHeaderCell className="min-w-[120px] whitespace-nowrap">Actualizado</TableHeaderCell>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const qtyClass = row.totalQty < 0 ? "text-red-600 font-semibold" : "text-zinc-900 font-semibold";
              return (
                <tr key={row.id} className="ui-body">
                  <TableCell className="align-top font-medium text-[var(--ui-text)]">{row.product}</TableCell>
                  <TableCell className={`font-mono text-right align-top whitespace-nowrap ${qtyClass}`}>
                    {displayMode === "purchase" ? formatPurchaseQty(row, row.totalQty) : formatQty(row.totalQty)}
                  </TableCell>
                  <TableCell className="align-top whitespace-nowrap">{row.unit}</TableCell>
                  {isByLocation ? (
                    locations.map((location) => {
                      const qty = row.byLocation?.[location.id] ?? 0;
                      return (
                        <TableCell key={location.id} className="font-mono text-right align-top whitespace-nowrap">
                          {Math.abs(qty) > 0.000001
                            ? displayMode === "purchase"
                              ? formatPurchaseQty(row, qty)
                              : formatQty(qty)
                            : "-"}
                        </TableCell>
                      );
                    })
                  ) : (
                    <TableCell
                      className={`align-top ${row.hasStockWithoutArea ? "text-amber-700 font-medium" : ""}`}
                    >
                      {row.areaSummary || "-"}
                    </TableCell>
                  )}
                  {!isByLocation ? (
                    <TableCell className="font-mono align-top whitespace-nowrap">{row.updatedAt ?? "-"}</TableCell>
                  ) : null}
                </tr>
              );
            })}

            {filteredRows.length === 0 ? (
              <tr>
                <TableCell
                  colSpan={isByLocation ? 3 + locations.length : 5}
                  className="ui-empty"
                >
                  {emptyMessage}
                </TableCell>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
