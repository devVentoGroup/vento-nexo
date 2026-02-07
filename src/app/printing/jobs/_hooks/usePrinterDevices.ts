"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserPrintDevice, BrowserPrintDevices } from "../_lib/types";
import { normalizeDevices } from "../_lib/zpl";

export function usePrinterDevices() {
  const [browserPrintOk, setBrowserPrintOk] = useState(false);
  const [devices, setDevices] = useState<BrowserPrintDevice[]>([]);
  const [selectedUid, setSelectedUid] = useState("");
  const [connectedUid, setConnectedUid] = useState<string | null>(null);
  const deviceRef = useRef<BrowserPrintDevice | null>(null);

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
        const list = normalizeDevices(raw);
        const onlyPrinters = list.filter((d) => {
          const t = String(d?.deviceType ?? d?.type ?? "").toLowerCase();
          const n = String(d?.name ?? "").toLowerCase();
          return t.includes("printer") || n.includes("zebra") || n.includes("zd");
        });
        const result = onlyPrinters.length ? onlyPrinters : list;
        setDevices(result);
        if (!selectedUid && (result[0]?.uid ?? list[0]?.uid)) {
          setSelectedUid(String(result[0]?.uid ?? list[0]?.uid));
        }
      },
      () => {},
      "printer"
    );
  }, [browserPrintOk, selectedUid]);

  const connectSelected = useCallback(() => {
    const dev = devices.find((d) => String(d?.uid) === String(selectedUid));
    if (!dev) return false;
    deviceRef.current = dev;
    setConnectedUid(selectedUid || null);
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
    window.BrowserPrint.getLocalDevices(
      (raw: BrowserPrintDevices) => {
        const list = normalizeDevices(raw);
        const onlyPrinters = list.filter((d) => {
          const t = String(d?.deviceType ?? d?.type ?? "").toLowerCase();
          const n = String(d?.name ?? "").toLowerCase();
          return t.includes("printer") || n.includes("zebra") || n.includes("zd");
        });
        const result = onlyPrinters.length ? onlyPrinters : list;
        setDevices(result);
        if (!selectedUid && (result[0]?.uid ?? list[0]?.uid)) {
          setSelectedUid(String(result[0]?.uid ?? list[0]?.uid));
        }
        onDone?.(result.length);
      },
      () => {},
      "printer"
    );
  }, [selectedUid]);

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
  };
}
