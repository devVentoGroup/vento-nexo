"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type SelectOption = {
  value: string;
  label: string;
  searchText?: string;
};

type SearchableSingleSelectProps = {
  name?: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  mobilePresentation?: "sheet" | "dropdown" | "native";
  mobileBreakpointPx?: number;
  sheetTitle?: string;
};

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function SearchableSingleSelect({
  name,
  value,
  onValueChange,
  options,
  placeholder = "Selecciona",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Sin resultados",
  className = "",
  mobilePresentation = "sheet",
  mobileBreakpointPx = 640,
  sheetTitle = "Selecciona opcion",
}: SearchableSingleSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const updateViewport = () => {
      setIsMobile(window.innerWidth < mobileBreakpointPx);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
    };
  }, [mobileBreakpointPx]);

  useEffect(() => {
    if (!isOpen) return;
    if (!(isMobile && mobilePresentation === "sheet")) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, isMobile, mobilePresentation]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const normalizedQuery = normalize(query);
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((option) => {
      const haystack = normalize(`${option.label} ${option.searchText ?? ""}`);
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, options]);

  const selectedOption = options.find((option) => option.value === value) ?? null;
  const selectedLabel = selectedOption?.label ?? placeholder;
  const useNativeMobile = isMobile && mobilePresentation === "native";
  const useSheetMobile = isMobile && mobilePresentation === "sheet";
  const shouldRenderDropdown = !useNativeMobile && !useSheetMobile;

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      {name ? <input type="hidden" name={name} value={value} /> : null}

      {useNativeMobile ? (
        <select
          className="ui-input h-12"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
      <button
        type="button"
        className="ui-input flex h-10 w-full items-center justify-between text-left"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="truncate">{selectedLabel}</span>
        <span className="ui-caption">{isOpen ? "Ocultar" : "Elegir"}</span>
      </button>
      )}

      {isOpen && shouldRenderDropdown ? (
        <div className="absolute left-0 top-[calc(100%+4px)] z-20 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-panel)] p-2 shadow-lg">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="ui-input mb-2 h-10 w-full"
          />
          <div className="max-h-64 overflow-auto rounded-lg border border-[var(--ui-border)] bg-[var(--ui-panel)]">
            <button
              type="button"
              className={`block w-full border-b border-[var(--ui-border)] px-3 py-2 text-left text-sm hover:bg-[var(--ui-surface)] ${
                value === "" ? "bg-[var(--ui-surface)] font-semibold" : ""
              }`}
              onClick={() => {
                onValueChange("");
                setIsOpen(false);
              }}
            >
              {placeholder}
            </button>

            {filteredOptions.length ? (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`block w-full border-b border-[var(--ui-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--ui-surface)] ${
                    option.value === value ? "bg-[var(--ui-surface)] font-semibold" : ""
                  }`}
                  onClick={() => {
                    onValueChange(option.value);
                    setIsOpen(false);
                  }}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-[var(--ui-muted)]">{emptyMessage}</div>
            )}
          </div>
        </div>
      ) : null}

      {isOpen && useSheetMobile ? (
        <div className="ui-mobile-select-sheet" role="dialog" aria-modal="true" aria-label={sheetTitle}>
          <div className="ui-mobile-select-sheet__backdrop" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div className="ui-mobile-select-sheet__panel ui-mobile-safe">
            <div className="ui-mobile-select-sheet__header">
              <div className="ui-h3">{sheetTitle}</div>
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setIsOpen(false)}>
                Cerrar
              </button>
            </div>
            <div className="ui-mobile-select-sheet__search">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="ui-input h-12 w-full"
                autoFocus
              />
            </div>
            <div className="ui-mobile-select-sheet__list">
              <button
                type="button"
                className={`block w-full border-b border-[var(--ui-border)] px-3 py-3 text-left text-sm ${
                  value === "" ? "bg-[var(--ui-surface)] font-semibold" : ""
                }`}
                onClick={() => {
                  onValueChange("");
                  setIsOpen(false);
                }}
              >
                {placeholder}
              </button>
              {filteredOptions.length ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`block w-full border-b border-[var(--ui-border)] px-3 py-3 text-left text-sm last:border-b-0 ${
                      option.value === value ? "bg-[var(--ui-surface)] font-semibold" : ""
                    }`}
                    onClick={() => {
                      onValueChange(option.value);
                      setIsOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-sm text-[var(--ui-muted)]">{emptyMessage}</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
