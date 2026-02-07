"use client";

import { useCallback, useEffect, useRef } from "react";
import { SETTINGS_KEY } from "../_lib/constants";
import type { PrinterSettings, StoredPrinterSettings } from "../_lib/types";

export function readStoredSettings(): StoredPrinterSettings {
  if (typeof window === "undefined") return { version: 1, byPrinter: {} };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { version: 1, byPrinter: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { version: 1, byPrinter: {} };
    return {
      version: 1,
      byPrinter:
        typeof parsed.byPrinter === "object" && parsed.byPrinter ? parsed.byPrinter : {},
    };
  } catch {
    return { version: 1, byPrinter: {} };
  }
}

function writeStoredSettings(next: StoredPrinterSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // noop
  }
}

const DEBOUNCE_MS = 600;

export function useStoredSettings(
  uidKey: string,
  settings: PrinterSettings,
  hasPresetParam: boolean
) {
  const settingsLoadedForRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount / when printer changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readStoredSettings();
    const saved = stored.byPrinter?.[uidKey];
    if (saved) {
      settingsLoadedForRef.current = uidKey;
    }
  }, [uidKey]);

  const loadSaved = useCallback(
    (apply: (saved: PrinterSettings) => void) => {
      const stored = readStoredSettings();
      const saved = stored.byPrinter?.[uidKey];
      if (saved && !hasPresetParam) {
        apply(saved);
      }
      settingsLoadedForRef.current = uidKey;
    },
    [uidKey, hasPresetParam]
  );

  // Persist with debounce
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (settingsLoadedForRef.current !== uidKey) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const stored = readStoredSettings();
      stored.byPrinter = stored.byPrinter ?? {};
      stored.byPrinter[uidKey] = {
        presetId: settings.presetId,
        dpi: settings.dpi,
        offsetXmm: settings.offsetXmm,
        offsetYmm: settings.offsetYmm,
        showAdvanced: settings.showAdvanced,
      };
      writeStoredSettings(stored);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    uidKey,
    settings.presetId,
    settings.dpi,
    settings.offsetXmm,
    settings.offsetYmm,
    settings.showAdvanced,
  ]);

  return { loadSaved };
}
