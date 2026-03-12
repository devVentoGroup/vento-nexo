"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserPrintDevice, BrowserPrintDevices } from "../_lib/types";
import { normalizeDevices } from "../_lib/zpl";

export function usePrinterDevices() {
  const [browserPrintOk, setBrowserPrintOk] = useState(false);
  const [devices, setDevices] = useState<BrowserPrintDevice[]>([]);
  const [selectedUid, setSelectedUid] = useState("");
  const [connectedUid, setConnectedUid] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const deviceRef = useRef<BrowserPrintDevice | null>(null);
  const autoConnectedRef = useRef(false);

  const applyDevices = useCallback(
    (raw: BrowserPrintDevices) => {
      const list = normalizeDevices(raw);
      const onlyPrinters = list.filter((d) => {
        const t = String(d?.deviceType ?? d?.type ?? "").toLowerCase();
        const n = String(d?.name ?? "").toLowerCase();
        return t.includes("printer") || n.includes("zebra") || n.includes("zd");
      });
      const result = onlyPrinters.length ? onlyPrinters : list;
      setDevices(result);

      const preferredUid =
        selectedUid ||
        String(result[0]?.uid ?? list[0]?.uid ?? "");

      if (preferredUid && !selectedUid) {
        setSelectedUid(preferredUid);
      }

      if (!autoConnectedRef.current && preferredUid) {
        const dev = result.find((d) => String(d?.uid) === preferredUid);
        if (dev) {
          deviceRef.current = dev;
          setConnectedUid(preferredUid);
          autoConnectedRef.current = true;
        }
      }

      setLastError(null);
      return result;
    },
    [selectedUid]
  );

  useEffect(() => {
    const t = setInterval(() => {
      if (typeof window !== "undefined" && window.BrowserPrint) {
        setBrowserPrintOk(true);
        clearInterval(t);
      }
    }, 300);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!browserPrintOk || !window.BrowserPrint) return;
    window.BrowserPrint.getLocalDevices(
      (raw: BrowserPrintDevices) => {
        applyDevices(raw);
        setIsDetecting(false);
      },
      (err: unknown) => {
        setIsDetecting(false);
        setLastError(err instanceof Error ? err.message : String(err));
      },
      "printer"
    );
  }, [applyDevices, browserPrintOk]);

  const connectSelected = useCallback(() => {
    const dev = devices.find((d) => String(d?.uid) === String(selectedUid));
    if (!dev) return false;
    deviceRef.current = dev;
    setConnectedUid(selectedUid || null);
    setLastError(null);
    autoConnectedRef.current = true;
    return true;
  }, [devices, selectedUid]);

  const disconnect = useCallback(() => {
    deviceRef.current = null;
    setConnectedUid(null);
  }, []);

  const setSelected = useCallback((uid: string) => {
    setSelectedUid(uid);
    deviceRef.current = null;
    setConnectedUid(null);
  }, []);

  const isConnected = connectedUid !== null && connectedUid === selectedUid;

  const detectPrinters = useCallback((onDone?: (count: number) => void) => {
    if (!window.BrowserPrint) return;
    setIsDetecting(true);
    window.BrowserPrint.getLocalDevices(
      (raw: BrowserPrintDevices) => {
        const result = applyDevices(raw);
        setIsDetecting(false);
        onDone?.(result.length);
      },
      (err: unknown) => {
        setIsDetecting(false);
        setLastError(err instanceof Error ? err.message : String(err));
        onDone?.(0);
      },
      "printer"
    );
  }, [applyDevices]);

  return {
    browserPrintOk,
    devices,
    selectedUid,
    setSelectedUid: setSelected,
    deviceRef,
    connectSelected,
    disconnect,
    detectPrinters,
    isConnected,
    isDetecting,
    lastError,
  };
}
