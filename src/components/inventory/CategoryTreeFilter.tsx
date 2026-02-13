"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildCategoryMetaLabel,
  getCategoryPath,
  type InventoryCategoryRow,
} from "@/lib/inventory/categories";

type CategoryOption = {
  id: string;
  label: string;
  searchLabel: string;
};

type CategoryTreeFilterProps = {
  categories: InventoryCategoryRow[];
  selectedCategoryId: string;
  siteNamesById?: Record<string, string>;
  name?: string;
  label?: string;
  searchPlaceholder?: string;
  emptyOptionLabel?: string;
  className?: string;
  maxVisibleOptions?: number;
  showMeta?: boolean;
  metaDomainLabelMode?: "domain" | "channel";
  metaUseBusinessDomainLabel?: boolean;
};

function toSearchLabel(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function CategoryTreeFilter({
  categories,
  selectedCategoryId,
  siteNamesById,
  name = "category_id",
  label = "Categoria",
  searchPlaceholder = "Buscar por nombre o ruta",
  emptyOptionLabel = "Todas",
  className = "",
  maxVisibleOptions = 12,
  showMeta = true,
  metaDomainLabelMode = "domain",
  metaUseBusinessDomainLabel = false,
}: CategoryTreeFilterProps) {
  const [query, setQuery] = useState("");
  const [value, setValue] = useState(selectedCategoryId);

  useEffect(() => {
    setValue(selectedCategoryId);
  }, [selectedCategoryId]);

  const siteNameMap = useMemo(
    () => new Map(Object.entries(siteNamesById ?? {})),
    [siteNamesById]
  );

  const categoryMap = useMemo(
    () => new Map(categories.map((row) => [row.id, row])),
    [categories]
  );

  const options = useMemo(() => {
    const rows: CategoryOption[] = categories.map((row) => {
      const path = getCategoryPath(row.id, categoryMap);
      const meta = showMeta
        ? buildCategoryMetaLabel(row, siteNameMap, {
            domainLabelMode: metaDomainLabelMode,
            useBusinessDomainLabel: metaUseBusinessDomainLabel,
          })
        : "";
      const label = meta ? `${path} (${meta})` : path;
      return {
        id: row.id,
        label,
        searchLabel: toSearchLabel(`${path} ${row.name} ${meta}`),
      };
    });

    return rows.sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [
    categories,
    categoryMap,
    siteNameMap,
    showMeta,
    metaDomainLabelMode,
    metaUseBusinessDomainLabel,
  ]);

  const normalizedQuery = toSearchLabel(query);

  const filtered = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((option) => option.searchLabel.includes(normalizedQuery));
  }, [normalizedQuery, options]);

  const selectedOption = useMemo(
    () => options.find((option) => option.id === value) ?? null,
    [options, value]
  );

  const selectedInFiltered = Boolean(filtered.find((option) => option.id === value));
  const visibleOptions = selectedOption && !selectedInFiltered
    ? [selectedOption, ...filtered]
    : filtered;

  return (
    <label className={`flex flex-col gap-1 ${className}`.trim()}>
      <span className="ui-label">{label}</span>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
        className="ui-input"
      />
      <input type="hidden" name={name} value={value} />
      <select
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="ui-input"
        size={maxVisibleOptions}
      >
        <option value="">{emptyOptionLabel}</option>
        {visibleOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="ui-caption">
        {visibleOptions.length} categoria(s) visibles
      </span>
    </label>
  );
}
