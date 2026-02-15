"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  // Kept for backward compatibility with existing call sites.
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
  searchPlaceholder = "Buscar categoria por nombre o ruta",
  emptyOptionLabel = "Todas",
  className = "",
  maxVisibleOptions = 12,
  showMeta = true,
  metaDomainLabelMode = "domain",
  metaUseBusinessDomainLabel = false,
}: CategoryTreeFilterProps) {
  const [query, setQuery] = useState("");
  const [value, setValue] = useState(selectedCategoryId);
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setValue(selectedCategoryId);
  }, [selectedCategoryId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      const target = event.target as Node | null;
      if (target && !rootRef.current.contains(target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

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
      const optionLabel = meta ? `${path} (${meta})` : path;
      return {
        id: row.id,
        label: optionLabel,
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

  useEffect(() => {
    if (!value) return;
    const stillAvailable = options.some((option) => option.id === value);
    if (!stillAvailable) {
      setValue("");
    }
  }, [options, value]);

  const selectedInFiltered = Boolean(filtered.find((option) => option.id === value));
  const visibleOptions =
    selectedOption && !selectedInFiltered ? [selectedOption, ...filtered] : filtered;

  const selectedLabel = selectedOption?.label ?? emptyOptionLabel;
  const maxListHeightClass =
    maxVisibleOptions <= 6 ? "max-h-48" : maxVisibleOptions <= 10 ? "max-h-64" : "max-h-80";

  return (
    <div className={`flex flex-col gap-1 ${className}`.trim()} ref={rootRef}>
      <span className="ui-label">{label}</span>
      <input type="hidden" name={name} value={value} />

      <button
        type="button"
        className="ui-input flex h-11 items-center justify-between text-left"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="truncate">{selectedLabel}</span>
        <span className="ui-caption">{isOpen ? "Ocultar" : "Elegir"}</span>
      </button>

      {isOpen ? (
        <div className="ui-panel-soft space-y-2 p-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="ui-input"
          />

          <div className={`overflow-auto rounded-lg border border-[var(--ui-border)] ${maxListHeightClass}`}>
            <button
              type="button"
              onClick={() => {
                setValue("");
                setIsOpen(false);
              }}
              className={`block w-full border-b border-[var(--ui-border)] px-3 py-2 text-left text-sm hover:bg-[var(--ui-surface)] ${
                value === "" ? "bg-[var(--ui-surface)] font-semibold" : ""
              }`}
            >
              {emptyOptionLabel}
            </button>

            {visibleOptions.length > 0 ? (
              visibleOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setValue(option.id);
                    setIsOpen(false);
                  }}
                  className={`block w-full border-b border-[var(--ui-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--ui-surface)] ${
                    value === option.id ? "bg-[var(--ui-surface)] font-semibold" : ""
                  }`}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-[var(--ui-muted)]">
                Sin resultados para el filtro actual
              </div>
            )}
          </div>
        </div>
      ) : null}

      <span className="ui-caption">{visibleOptions.length} categoria(s) visibles</span>
    </div>
  );
}
