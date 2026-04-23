"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { BROWSERPRINT_CORE, BROWSERPRINT_ZEBRA, LOCS_API, PRESETS } from "./_lib/constants";
import type { BarcodeKind, LocRow, PreviewMode } from "./_lib/types";
import {
  buildLocQrUrl,
  buildSingleLabelZpl,
  buildThreeUpRowZpl,
  buildZplFooter,
  buildZplHeader,
  buildTextField,
  mmToDots,
  safeText,
  encodeVento,
} from "./_lib/zpl";
import { readStoredSettings } from "./_hooks/useStoredSettings";
import { usePrinterDevices } from "./_hooks/usePrinterDevices";
import { useStoredSettings } from "./_hooks/useStoredSettings";
import { usePreviewZpl } from "./_hooks/usePreviewZpl";
import { ConfigPanel } from "./_components/ConfigPanel";
import { QueuePanel } from "./_components/QueuePanel";
import { PreviewPanel } from "./_components/PreviewPanel";
import { PrintSheet } from "./_components/PrintSheet";
import type { LabelTemplate } from "../designer/_lib/types";
import { loadTemplate, loadTemplates } from "../designer/_lib/template-storage";
import { templateToZplBatch } from "../designer/_lib/template-to-zpl";

function PrintingJobsContent() {
  const searchParams = useSearchParams();
  const presets = PRESETS;

  const [enablePrinting, setEnablePrinting] = useState(true);
  const [dpi, setDpi] = useState(203);
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "LOC_50x70_QR");
  const preset = useMemo(
    () => presets.find((p) => p.id === presetId) ?? presets[0],
    [presetId, presets]
  );
  const dpmm = useMemo(
    () => Math.max(6, Math.min(12, Math.round(dpi / 25.4))),
    [dpi]
  );

  const [offsetXmm, setOffsetXmm] = useState(0);
  const [offsetYmm, setOffsetYmm] = useState(0);
  const [title, setTitle] = useState("VENTO · LOC");
  const [barcodeKind, setBarcodeKind] = useState<BarcodeKind>(preset.defaultBarcodeKind);
  const [code128HeightDots, setCode128HeightDots] = useState(preset.defaultCode128HeightDots);
  const [dmModuleDots, setDmModuleDots] = useState(preset.defaultDmModuleDots);

  const [status, setStatus] = useState("");
  const [queueText, setQueueText] = useState("");
  const [previewZpl, setPreviewZpl] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("mock");
  const [previewScale, setPreviewScale] = useState(1);
  const [showZplCode, setShowZplCode] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [locs, setLocs] = useState<LocRow[]>([]);
  const [locSearch, setLocSearch] = useState("");
  const [selectedLocCode, setSelectedLocCode] = useState("");
  const [activeLayout, setActiveLayout] = useState<LabelTemplate | null>(null);
  const [savedLayouts, setSavedLayouts] = useState<LabelTemplate[]>([]);
  const [showLoadLayoutModal, setShowLoadLayoutModal] = useState(false);
  const [isLoadingLayouts, setIsLoadingLayouts] = useState(false);
  const locsLoadedRef = useRef(false);

  const {
    browserPrintOk,
    devices,
    selectedUid,
    setSelectedUid,
    deviceRef,
    connectSelected,
    detectPrinters: detectPrintersFromHook,
    isConnected,
    isDetecting,
    lastError,
  } = usePrinterDevices();

  const uidKey = selectedUid || "default";
  const hasPresetParam = Boolean(searchParams.get("preset"));

  useStoredSettings(
    uidKey,
    {
      presetId,
      dpi,
      offsetXmm,
      offsetYmm,
      showAdvanced,
    },
    hasPresetParam
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const presetParam = searchParams.get("preset");
    const queueParam = searchParams.get("queue");
    const titleParam = searchParams.get("title");
    if (presetParam) setPresetId(presetParam);
    if (queueParam) setQueueText(queueParam.replace(/\r/g, ""));
    if (titleParam) setTitle(titleParam);
  }, [searchParams]);

  useEffect(() => {
    const layoutId = String(searchParams.get("layout") ?? "").trim();
    if (!layoutId) {
      setActiveLayout(null);
      return;
    }
    let cancelled = false;
    loadTemplate(layoutId)
      .then((found) => {
        if (cancelled) return;
        setActiveLayout(found);
        if (!found) {
          setStatus("El layout seleccionado no existe o no está disponible para tu usuario.");
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "No se pudo cargar el layout.";
        setStatus(message);
        setActiveLayout(null);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readStoredSettings();
    const saved = stored.byPrinter?.[uidKey];
    if (saved && !hasPresetParam) {
      if (saved.presetId) setPresetId(saved.presetId);
      if (typeof saved.dpi === "number") setDpi(saved.dpi);
      if (typeof saved.offsetXmm === "number") setOffsetXmm(saved.offsetXmm);
      if (typeof saved.offsetYmm === "number") setOffsetYmm(saved.offsetYmm);
      if (typeof saved.showAdvanced === "boolean") setShowAdvanced(saved.showAdvanced);
    }
  }, [uidKey, hasPresetParam]);

  useEffect(() => {
    setBarcodeKind(preset.defaultBarcodeKind);
    setCode128HeightDots(preset.defaultCode128HeightDots);
    setDmModuleDots(preset.defaultDmModuleDots);
    if (preset.defaultType === "LOC") setTitle("VENTO · LOC");
    if (preset.defaultType === "SKU") setTitle("VENTO · SKU");
    if (preset.defaultType === "PROD") setTitle("VENTO · PROD");
  }, [presetId, preset.defaultType, preset.defaultBarcodeKind, preset.defaultCode128HeightDots, preset.defaultDmModuleDots]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const offsetXDots = useMemo(() => mmToDots(offsetXmm, dpi), [offsetXmm, dpi]);
  const offsetYDots = useMemo(() => mmToDots(offsetYmm, dpi), [offsetYmm, dpi]);

  const parsedQueue = useMemo(() => {
    const lines = queueText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.map((line) => {
      const [codeRaw, ...rest] = line.split("|");
      const code = safeText(codeRaw ?? "");
      const note = safeText(rest.join("|") ?? "");
      return { code, note: note || undefined };
    });
  }, [queueText]);

  const previewItems = useMemo(() => {
    if (preset.columns === 1) {
      return [parsedQueue[0] ?? { code: "EJEMPLO-001", note: "Demo" }];
    }
    return [
      parsedQueue[0] ?? { code: "EJ-001", note: "Demo" },
      parsedQueue[1] ?? { code: "EJ-002", note: "Demo" },
      parsedQueue[2] ?? { code: "EJ-003", note: "Demo" },
    ];
  }, [preset.columns, parsedQueue]);
  const baseUrl =
    typeof window !== "undefined" ? (window.location?.origin ?? "") : "";
  const activeLayoutPreview = useMemo(() => {
    if (!activeLayout) return null;
    const first = previewItems[0] ?? { code: "EJEMPLO-001", note: "Demo" };
    const origin = baseUrl.replace(/\/$/, "");
    return {
      ...activeLayout,
      elements: activeLayout.elements.map((el) => {
        if (el.id === "el_code") return { ...el, content: first.code };
        if (el.id === "el_dm") return { ...el, content: encodeVento("LOC", first.code) };
        if (el.id === "el_qr") {
          return {
            ...el,
            content: `${buildLocQrUrl(origin, first.code)}`,
          };
        }
        if (el.id === "el_desc") return { ...el, content: first.note ?? "" };
        return el;
      }),
    };
  }, [activeLayout, baseUrl, previewItems]);
  const printLayoutSheets = useMemo(() => {
    if (!activeLayout) return null;
    const origin = baseUrl.replace(/\/$/, "");
    return parsedQueue.map((item) => ({
      ...activeLayout,
      elements: activeLayout.elements.map((el) => {
        if (el.id === "el_code") return { ...el, content: item.code };
        if (el.id === "el_dm") return { ...el, content: encodeVento("LOC", item.code) };
        if (el.id === "el_qr") {
          return {
            ...el,
            content: `${buildLocQrUrl(origin, item.code)}`,
          };
        }
        if (el.id === "el_desc") return { ...el, content: item.note ?? "" };
        return el;
      }),
    }));
  }, [activeLayout, baseUrl, parsedQueue]);

  usePreviewZpl(
    preset,
    {
      dpi,
      offsetXDots,
      offsetYDots,
      barcodeKind,
      code128HeightDots,
      dmModuleDots,
      title,
      previewItems,
      baseUrl,
    },
    setPreviewZpl
  );

  useEffect(() => {
    if (!activeLayout) return;
    const first = previewItems[0] ?? { code: "EJEMPLO-001", note: "Demo" };
    const origin = baseUrl.replace(/\/$/, "");
    const zpl = templateToZplBatch(activeLayout, [
      {
        code: first.code,
        ventoCode: encodeVento("LOC", first.code),
        qrUrl: `${buildLocQrUrl(origin, first.code)}`,
        description: first.note ?? "",
      },
    ]);
    setPreviewZpl(zpl);
  }, [activeLayout, baseUrl, previewItems]);

  useEffect(() => {
    if (preset.defaultType !== "LOC" || locsLoadedRef.current) return;
    locsLoadedRef.current = true;
    fetch(LOCS_API, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.resolve([])))
      .then((json) => {
        const rows = Array.isArray(json)
          ? json
          : Array.isArray((json as { locations?: LocRow[] })?.locations)
            ? (json as { locations: LocRow[] }).locations
            : [];
        setLocs(rows);
      })
      .catch(() => {});
  }, [preset.defaultType]);

  const filteredLocs = useMemo(() => {
    const q = locSearch.trim().toLowerCase();
    if (!q) return locs;
    return locs.filter((l) => {
      const code = String(l.code ?? "").toLowerCase();
      const desc = String(l.description ?? "").toLowerCase();
      return code.includes(q) || desc.includes(q);
    });
  }, [locs, locSearch]);

  function detectPrinters() {
    setStatus("");
    if (!window.BrowserPrint) {
      setStatus("BrowserPrint no está disponible.");
      return;
    }
    detectPrintersFromHook((count) => setStatus(`Detectadas: ${count}`));
  }

  function connectSelectedAndStatus() {
    setStatus("");
    if (connectSelected()) {
      const dev = devices.find((d) => String(d?.uid) === String(selectedUid));
      setStatus(`Impresora lista: ${String(dev?.name ?? dev?.uid ?? "")}`);
    } else {
      setStatus("Selecciona una impresora válida.");
    }
  }

  function requireReady(): boolean {
    if (!enablePrinting) {
      setStatus("Impresión deshabilitada.");
      return false;
    }
    if (!browserPrintOk || !window.BrowserPrint) {
      setStatus("BrowserPrint no está listo. Verifica scripts/servicio.");
      return false;
    }
    if (!deviceRef.current) {
      setStatus("No hay impresora conectada.");
      return false;
    }
    return true;
  }

  function sendZpl(zpl: string) {
    if (!requireReady()) return;
    const dev = deviceRef.current;
    setStatus("Enviando impresión…");
    try {
      dev?.send?.(
        zpl,
        () => setStatus("Impresión enviada."),
        (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          setStatus(`Error al imprimir: ${msg}`);
        }
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Excepción al imprimir: ${msg}`);
    }
  }

  function printAll() {
    if (!preset) return;
    if (!parsedQueue.length) {
      setStatus("Cola vacía.");
      return;
    }

    if (activeLayout) {
      const origin = baseUrl.replace(/\/$/, "");
      const zpl = templateToZplBatch(
        activeLayout,
        parsedQueue.map((it) => ({
          code: it.code,
          ventoCode: encodeVento("LOC", it.code),
          qrUrl: `${buildLocQrUrl(origin, it.code)}`,
          description: it.note,
        }))
      );
      sendZpl(zpl);
      setStatus(`Impresión enviada con layout: ${activeLayout.name}`);
      setQueueText("");
      return;
    }

    // --- Standard preset mode ---
    if (preset.columns === 3 && parsedQueue.length < 3) {
      setStatus("Este preset imprime de a 3. Faltan etiquetas para completar una fila.");
      return;
    }

    const zplParts: string[] = [];

    if (preset.columns === 1) {
      const baseUrlForQr =
        preset.id === "LOC_50x70_QR" && preset.defaultType === "LOC" ? baseUrl : undefined;
      parsedQueue.forEach((it) => {
        zplParts.push(
          buildSingleLabelZpl({
            preset,
            dpi,
            offsetXDots,
            offsetYDots,
            barcodeKind,
            code128HeightDots,
            dmModuleDots,
            type: preset.defaultType,
            title,
            code: it.code,
            note: it.note,
            baseUrlForQr,
          })
        );
      });
      sendZpl(zplParts.join("\n"));
      setQueueText("");
      return;
    }

    const fullRows = Math.floor(parsedQueue.length / 3);
    if (fullRows <= 0) {
      setStatus("No hay filas completas de 3 para imprimir.");
      return;
    }

    for (let r = 0; r < fullRows; r++) {
      const row = parsedQueue.slice(r * 3, r * 3 + 3);
      zplParts.push(
        buildThreeUpRowZpl({
          preset,
          dpi,
          offsetXDots,
          offsetYDots,
          barcodeKind,
          code128HeightDots,
          dmModuleDots,
          type: preset.defaultType,
          title,
          items: row,
        })
      );
    }
    sendZpl(zplParts.join("\n"));

    const remainder = parsedQueue.slice(fullRows * 3);
    const newText = remainder
      .map((it) => (it.note ? `${it.code}|${it.note}` : it.code))
      .join("\n");
    setQueueText(newText);

    if (remainder.length) {
      setStatus(
        `Impreso ${fullRows * 3}. Quedan ${remainder.length} en cola (esperando completar 3).`
      );
    }
  }

  function printOneTestRow3Up() {
    if (!preset || preset.columns !== 3) return;
    const row = [
      { code: "PRUEBA-1", note: "Test" },
      { code: "PRUEBA-2", note: "Test" },
      { code: "PRUEBA-3", note: "Test" },
    ];
    const zpl = buildThreeUpRowZpl({
      preset,
      dpi,
      offsetXDots,
      offsetYDots,
      barcodeKind,
      code128HeightDots,
      dmModuleDots,
      type: preset.defaultType,
      title,
      items: row,
    });
    sendZpl(zpl);
    setStatus("Impresa una fila de prueba (3 etiquetas).");
  }

  function printAlignmentTest() {
    if (!preset) return;
    const widthDots = mmToDots(preset.widthMm, dpi);
    const heightDots = mmToDots(preset.heightMm, dpi);
    const zpl = [
      buildZplHeader({ widthDots, heightDots, offsetXDots, offsetYDots }),
      "^FO10,10^GB" + (widthDots - 20) + "," + (heightDots - 20) + ",2^FS",
      "^FO10,10^GD" + (widthDots - 20) + "," + (heightDots - 20) + ",2,B,L^FS",
      "^FO10," + (heightDots - 10) + "^GD" + (widthDots - 20) + "," + (heightDots - 20) + ",2,B,R^FS",
      buildTextField({ x: 20, y: 20, h: 26, w: 26, text: "TEST" }),
      buildZplFooter(),
    ].join("\n");
    sendZpl(zpl);
  }

  async function loadLocs() {
    setStatus("");
    try {
      const res = await fetch(LOCS_API, { cache: "no-store" });
      const raw = await res.text();
      let json: unknown = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        // noop
      }
      if (!res.ok) {
        const obj = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
        const msg =
          (obj?.error != null ? String(obj.error) : null) ??
          (obj?.message != null ? String(obj.message) : null) ??
          (typeof raw === "string" && raw.trim() ? raw : `HTTP ${res.status}`);
        setStatus(`Error cargando LOCs: ${msg}`);
        return;
      }
      const rows: LocRow[] = Array.isArray(json)
        ? (json as LocRow[])
        : Array.isArray((json as { locations?: LocRow[] })?.locations)
          ? (json as { locations: LocRow[] }).locations
          : [];
      setLocs(rows);
      setStatus(`LOCs cargados: ${rows.length}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error cargando LOCs: ${msg}`);
    }
  }

  function addSelectedLocToQueue(mode: "replace" | "append") {
    const loc = locs.find((l) => l.code === selectedLocCode);
    if (!loc) {
      setStatus("Selecciona un LOC válido.");
      return;
    }
    if (presetId !== "LOC_50x70_QR") setPresetId("LOC_50x70_QR");
    setBarcodeKind("code128");
    setTitle("VENTO · LOC");

    const line = `${loc.code}|${safeText(loc.description ?? "LOC")}`;
    if (mode === "replace") {
      setQueueText(line);
    } else {
      setQueueText((prev) => {
        const p = prev.trim();
        if (!p) return line;
        return p + "\n" + line;
      });
    }
  }

  async function openLoadLayoutModal() {
    setStatus("");
    setIsLoadingLayouts(true);
    try {
      const templates = await loadTemplates();
      setSavedLayouts(templates);
      setShowLoadLayoutModal(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar los layouts.";
      setStatus(message);
    } finally {
      setIsLoadingLayouts(false);
    }
  }

  function activateLayout(layout: LabelTemplate) {
    setActiveLayout(layout);
    setShowLoadLayoutModal(false);
    setStatus(`Layout activo: ${layout.name}`);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("layout", layout.id);
    window.history.replaceState({}, "", url.toString());
  }

  function clearActiveLayout() {
    setActiveLayout(null);
    setStatus("Layout personalizado desactivado. Volviste al preset estándar.");
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("layout");
    window.history.replaceState({}, "", url.toString());
  }

  function printInBrowser() {
    if (!parsedQueue.length) {
      setStatus("Cola vacía.");
      return;
    }
    window.print();
  }

  const hasQueue = parsedQueue.length > 0;
  const previewZplHasError = previewZpl.startsWith("// Error");
  const previewShowImage = false;
  const previewShowMock = !previewZplHasError;
  const previewLocVariant =
    preset.defaultType === "LOC" && preset.id === "LOC_50x70_QR" ? "qr" : null;
  const previewColGapMm = 2;
  const previewColWidthMm =
    preset.columns > 1
      ? (preset.widthMm - previewColGapMm * (preset.columns - 1)) / preset.columns
      : preset.widthMm;
  const previewBarcodeScale = Math.max(2, Math.round(dpmm / 2));
  const previewQrUrl = useMemo(() => {
    if (previewLocVariant !== "qr") return "";
    if (typeof window === "undefined") return "";
    const code = previewItems[0]?.code ?? "";
    if (!code) return "";
    const base = window.location?.origin ?? "";
    if (!base) return "";
    return buildLocQrUrl(base, code);
  }, [previewLocVariant, previewItems]);
  const activePrinterLabel =
    devices.find((d) => String(d?.uid) === String(selectedUid))?.name ??
    devices.find((d) => String(d?.uid) === String(selectedUid))?.uid ??
    "";

  return (
    <div className="ui-scene w-full space-y-6">
      <Script src={BROWSERPRINT_CORE} strategy="afterInteractive" />
      <Script src={BROWSERPRINT_ZEBRA} strategy="afterInteractive" />

      <div className="print-hidden">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid">
          <div>
            <span className="ui-chip ui-chip--brand">Impresión rápida</span>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[var(--ui-text)]">
              Etiquetas listas para salir
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--ui-muted)] sm:text-base">
              El flujo aquí debe sentirse así: eliges formato, armas la cola, revisas y mandas a imprimir. Lo técnico queda atrás.
            </p>
          </div>
          <div className="ui-remission-kpis">
            <div className="ui-remission-kpi" data-tone={browserPrintOk ? "success" : undefined}>
              <div className="ui-remission-kpi-label">Bridge</div>
              <div className="ui-remission-kpi-value">{browserPrintOk ? "OK" : "NO"}</div>
              <div className="ui-remission-kpi-note">Browser Print</div>
            </div>
            <div className="ui-remission-kpi" data-tone={isConnected ? "success" : "cool"}>
              <div className="ui-remission-kpi-label">Impresora</div>
              <div className="ui-remission-kpi-value">{isConnected ? "OK" : devices.length}</div>
              <div className="ui-remission-kpi-note">
                {isConnected ? String(activePrinterLabel || "Conectada") : "Disponibles en este equipo"}
              </div>
            </div>
            <div className="ui-remission-kpi" data-tone={hasQueue ? "cool" : undefined}>
              <div className="ui-remission-kpi-label">Cola</div>
              <div className="ui-remission-kpi-value">{parsedQueue.length}</div>
              <div className="ui-remission-kpi-note">{preset.columns === 3 ? "Modo 3-up" : "Modo 1-up"}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-start justify-between gap-4 ui-fade-up ui-delay-1">
        <div className="ui-caption">
          {activeLayout ? (
            <>
              Layout activo: <strong>{activeLayout.name}</strong>
            </>
          ) : (
            <>
              Preset activo: <strong>{preset.label}</strong>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--sm"
            onClick={printInBrowser}
            disabled={!hasQueue}
          >
            Imprimir en hoja
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--sm"
            onClick={openLoadLayoutModal}
            disabled={isLoadingLayouts}
          >
            {isLoadingLayouts ? "Cargando layouts..." : "Cargar layout"}
          </button>
          {activeLayout ? (
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--sm"
              onClick={clearActiveLayout}
            >
              Quitar layout
            </button>
          ) : null}
          <Link href="/printing/designer" className="ui-btn ui-btn--ghost ui-btn--sm">
            Diseñador
          </Link>
          <Link href="/printing/setup" className="ui-btn ui-btn--ghost ui-btn--sm">
            Configurar impresora
          </Link>
        </div>
      </div>

      {!browserPrintOk && (
        <div className="ui-alert ui-alert--warn ui-fade-up ui-delay-1">
          <strong>Falta Browser Print.</strong> Puedes preparar la cola y ver la vista previa, pero no enviar a la impresora.{" "}
          <Link href="/printing/setup" className="font-medium underline">
            Abrir configuración →
          </Link>
        </div>
      )}

      {lastError ? (
        <div className="ui-alert ui-alert--warn ui-fade-up ui-delay-1">
          Error de detección: {lastError}
        </div>
      ) : null}

      <div className="ui-panel ui-panel--halo ui-remission-section ui-fade-up ui-delay-1">
        <div className="flex flex-wrap items-end gap-3">
          <button
            className="ui-btn ui-btn--brand"
            onClick={detectPrinters}
            type="button"
            disabled={isDetecting}
          >
            {isDetecting ? "Detectando..." : "Detectar impresoras"}
          </button>

          <button
            className="ui-btn ui-btn--ghost"
            onClick={connectSelectedAndStatus}
            type="button"
          >
            {isConnected ? "Impresora conectada" : "Conectar impresora"}
          </button>

          <button
            className="ui-btn ui-btn--ghost"
            onClick={printAll}
            type="button"
            disabled={!hasQueue}
          >
            Imprimir cola
          </button>

          <div className="ml-auto flex min-w-[280px] items-center gap-3">
            <select
              className="ui-input min-w-[140px]"
              value={selectedUid}
              onChange={(e) => setSelectedUid(e.target.value)}
            >
              <option value="">(Selecciona)</option>
              {devices.map((d) => (
                <option key={String(d?.uid)} value={String(d?.uid)}>
                  {String(d?.name ?? d?.uid)} {d?.connection ? `(${String(d.connection)})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className={browserPrintOk ? "ui-chip ui-chip--success" : "ui-chip ui-chip--warn"}>
            Browser Print {browserPrintOk ? "activo" : "pendiente"}
          </span>
          <span className={isConnected ? "ui-chip ui-chip--success" : "ui-chip"}>
            {isConnected ? "Impresora lista" : "Sin conexión activa"}
          </span>
          <span className="ui-chip">{parsedQueue.length} en cola</span>
        </div>

        <label className="mt-4 inline-flex items-center gap-2 ui-body">
          <input
            type="checkbox"
            checked={enablePrinting}
            onChange={(e) => setEnablePrinting(e.target.checked)}
          />
          Habilitar impresión
        </label>

        {status ? (
          <div className="mt-3 ui-panel-soft px-4 py-3 ui-body">{status}</div>
        ) : null}

        <details className="mt-4 rounded-2xl border border-[var(--ui-border)] bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
            Pruebas y ajuste fino
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            {preset.columns === 3 ? (
              <button
                className="ui-btn ui-btn--ghost"
                onClick={printOneTestRow3Up}
                type="button"
                title="Imprime una fila de 3 etiquetas de prueba"
              >
                Prueba 3-up
              </button>
            ) : null}
            <button
              className="ui-btn ui-btn--ghost"
              onClick={printAlignmentTest}
              type="button"
            >
              Probar posición
            </button>
          </div>
        </details>
      </div>

      <div className="grid gap-6 md:grid-cols-2 ui-fade-up ui-delay-2">
        <ConfigPanel
          presets={presets}
          preset={preset}
          presetId={presetId}
          setPresetId={setPresetId}
          title={title}
          setTitle={setTitle}
          dpi={dpi}
          setDpi={setDpi}
          offsetXmm={offsetXmm}
          setOffsetXmm={setOffsetXmm}
          offsetYmm={offsetYmm}
          setOffsetYmm={setOffsetYmm}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
          barcodeKind={barcodeKind}
          code128HeightDots={code128HeightDots}
          setCode128HeightDots={setCode128HeightDots}
          dmModuleDots={dmModuleDots}
          setDmModuleDots={setDmModuleDots}
          locs={locs}
          locSearch={locSearch}
          setLocSearch={setLocSearch}
          filteredLocs={filteredLocs}
          selectedLocCode={selectedLocCode}
          setSelectedLocCode={setSelectedLocCode}
          loadLocs={loadLocs}
          addSelectedLocToQueue={addSelectedLocToQueue}
        />

        <div>
          <QueuePanel
            preset={preset}
            queueText={queueText}
            setQueueText={setQueueText}
            parsedQueueLength={parsedQueue.length}
          />

          <PreviewPanel
            preset={preset}
            dpi={dpi}
            dpmm={dpmm}
            previewScale={previewScale}
            setPreviewScale={setPreviewScale}
            previewZpl={previewZpl}
            previewZplHasError={previewZplHasError}
            previewShowMock={previewShowMock}
            showZplCode={showZplCode}
            setShowZplCode={setShowZplCode}
            title={title}
            barcodeKind={barcodeKind}
            previewLocVariant={previewLocVariant}
            previewColWidthMm={previewColWidthMm}
            previewColGapMm={previewColGapMm}
            previewBarcodeScale={previewBarcodeScale}
            previewQrUrl={previewLocVariant === "qr" ? previewQrUrl : ""}
            previewItems={previewItems}
            hasQueue={hasQueue}
            activeLayoutPreview={activeLayoutPreview}
          />
        </div>
      </div>

      {showLoadLayoutModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setShowLoadLayoutModal(false)}
        >
          <div
            className="ui-panel w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="ui-h3">Cargar layout guardado</div>
              <button
                type="button"
                onClick={() => setShowLoadLayoutModal(false)}
                className="ui-btn ui-btn--ghost ui-btn--sm"
              >
                Cerrar
              </button>
            </div>

            {savedLayouts.length === 0 ? (
              <p className="ui-body-muted">No tienes layouts guardados todavía.</p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {savedLayouts.map((layout) => (
                  <button
                    key={layout.id}
                    type="button"
                    onClick={() => activateLayout(layout)}
                    className="w-full text-left ui-panel-soft p-3 transition-colors hover:bg-[var(--ui-surface-2)]"
                  >
                    <div className="font-medium text-[var(--ui-text)]">{layout.name}</div>
                    <div className="ui-caption text-[var(--ui-muted)]">
                      {layout.widthMm}x{layout.heightMm}mm · {layout.orientation} · {layout.elements.length} elementos
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
      </div>

      <PrintSheet
        preset={preset}
        title={title}
        barcodeKind={barcodeKind}
        previewLocVariant={previewLocVariant}
        previewBarcodeScale={previewBarcodeScale}
        previewItems={parsedQueue.length ? parsedQueue : previewItems}
        previewQrBase={baseUrl}
        activeLayoutSheets={printLayoutSheets}
      />
    </div>
  );
}

export default function PrintingJobsPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full ui-body-muted">Cargando impresión…</div>
      }
    >
      <PrintingJobsContent />
    </Suspense>
  );
}

