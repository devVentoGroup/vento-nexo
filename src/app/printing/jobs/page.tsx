"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { BROWSERPRINT_CORE, BROWSERPRINT_ZEBRA, LOCS_API, PRESETS } from "./_lib/constants";
import type { BarcodeKind, BrowserPrintDevices, LocRow, PreviewMode } from "./_lib/types";
import {
  buildSingleLabelZpl,
  buildThreeUpRowZpl,
  buildZplFooter,
  buildZplHeader,
  buildTextField,
  mmToDots,
  normalizeDevices,
  safeText,
} from "./_lib/zpl";
import { readStoredSettings } from "./_hooks/useStoredSettings";
import { usePrinterDevices } from "./_hooks/usePrinterDevices";
import { useStoredSettings } from "./_hooks/useStoredSettings";
import { usePreviewZpl } from "./_hooks/usePreviewZpl";
import { usePreviewImage } from "./_hooks/usePreviewImage";
import { ConfigPanel } from "./_components/ConfigPanel";
import { QueuePanel } from "./_components/QueuePanel";
import { PreviewPanel } from "./_components/PreviewPanel";

function PrintingJobsContent() {
  const searchParams = useSearchParams();
  const presets = PRESETS;

  const [enablePrinting, setEnablePrinting] = useState(true);
  const [dpi, setDpi] = useState(203);
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "LOC_50x70");
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
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageError, setPreviewImageError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("auto");
  const [previewScale, setPreviewScale] = useState(1);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [showZplCode, setShowZplCode] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [locs, setLocs] = useState<LocRow[]>([]);
  const [locSearch, setLocSearch] = useState("");
  const [selectedLocCode, setSelectedLocCode] = useState("");
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

  useEffect(() => {
    const presetParam = searchParams.get("preset");
    const queueParam = searchParams.get("queue");
    const titleParam = searchParams.get("title");
    if (presetParam) setPresetId(presetParam);
    if (queueParam) setQueueText(queueParam.replace(/\r/g, ""));
    if (titleParam) setTitle(titleParam);
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

  usePreviewImage(
    previewZpl,
    previewMode,
    preset.widthMm,
    preset.heightMm,
    dpmm,
    previewRefreshKey,
    setPreviewImageUrl,
    setPreviewImageError
  );

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
    if (preset.columns === 3 && parsedQueue.length < 3) {
      setStatus("Este preset imprime de a 3. Faltan etiquetas para completar una fila.");
      return;
    }

    const zplParts: string[] = [];

    if (preset.columns === 1) {
      const baseUrlForQr =
        preset.id === "LOC_50x70" && preset.defaultType === "LOC" ? baseUrl : undefined;
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
    if (presetId !== "LOC_50x70") setPresetId("LOC_50x70");
    setBarcodeKind("datamatrix");
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

  const hasQueue = parsedQueue.length > 0;
  const previewZplHasError = previewZpl.startsWith("// Error");
  const previewShowImage = previewMode !== "mock" && Boolean(previewImageUrl);
  const previewShowMock =
    !previewZplHasError &&
    (previewMode === "mock" || (previewMode === "auto" && !previewShowImage));
  const previewDualMatrix =
    preset.id === "LOC_50x70" &&
    preset.defaultType === "LOC" &&
    barcodeKind === "datamatrix";
  const previewColGapMm = 2;
  const previewColWidthMm =
    preset.columns > 1
      ? (preset.widthMm - previewColGapMm * (preset.columns - 1)) / preset.columns
      : preset.widthMm;
  const previewBarcodeScale = Math.max(2, Math.round(dpmm / 2));
  const previewQrUrl = useMemo(() => {
    if (!previewDualMatrix) return "";
    if (typeof window === "undefined") return "";
    const code = previewItems[0]?.code ?? "";
    if (!code) return "";
    const base = window.location?.origin ?? "";
    if (!base) return "";
    return `${base.replace(/\/$/, "")}/inventory/withdraw?loc=${encodeURIComponent(code)}`;
  }, [previewDualMatrix, previewItems]);

  return (
    <div className="w-full space-y-6">
      <Script src={BROWSERPRINT_CORE} strategy="afterInteractive" />
      <Script src={BROWSERPRINT_ZEBRA} strategy="afterInteractive" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Impresión de etiquetas</h1>
          <p className="mt-2 ui-body-muted">
            Imprime etiquetas de ubicaciones (LOC), productos (SKU/PROD). Elige ubicación, revisa la
            vista previa e imprime.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/printing/designer" className="ui-btn ui-btn--ghost ui-btn--sm">
            Diseñador
          </Link>
          <Link href="/printing/setup" className="ui-btn ui-btn--ghost ui-btn--sm">
            Configurar impresora
          </Link>
        </div>
      </div>

      {!browserPrintOk && (
        <div className="ui-alert ui-alert--warn">
          <strong>Para imprimir a impresoras Zebra</strong> necesitas tener instalado{" "}
          <strong>Zebra Browser Print</strong> y el servicio en ejecución. Sin ello podrás usar la
          vista previa y preparar la cola, pero no enviar a la impresora.{" "}
          <Link href="/printing/setup" className="font-medium underline">
            Guía de configuración paso a paso →
          </Link>
        </div>
      )}

      <div className="ui-panel">
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="ui-btn ui-btn--brand"
            onClick={detectPrinters}
            type="button"
          >
            Detectar impresoras
          </button>

          <button
            className="ui-btn ui-btn--ghost"
            onClick={connectSelectedAndStatus}
            type="button"
          >
            Conectar impresora
          </button>

          <button
            className="ui-btn ui-btn--ghost"
            onClick={printAll}
            type="button"
          >
            Imprimir
          </button>

          {preset.columns === 3 && (
            <button
              className="ui-btn ui-btn--ghost"
              onClick={printOneTestRow3Up}
              type="button"
              title="Imprime una fila de 3 etiquetas de prueba"
            >
              Imprimir una de prueba (3-up)
            </button>
          )}

          <button
            className="ui-btn ui-btn--ghost"
            onClick={printAlignmentTest}
            type="button"
          >
            Probar posición
          </button>

          <div className="ml-auto flex items-center gap-3 ui-body-muted">
            <span>
              BrowserPrint: <span className="font-medium">{browserPrintOk ? "OK" : "NO"}</span>
            </span>
            <span>
              Impresora: <span className="font-medium">{isConnected ? "OK" : "NO"}</span>
            </span>

            <select
              className="ui-input min-w-[140px]"
              value={selectedUid}
              onChange={(e) => setSelectedUid(e.target.value)}
            >
              <option value="">(Selecciona)</option>
              {devices.map((d) => (
                <option key={String(d?.uid)} value={String(d?.uid)}>
                  {String(d?.name ?? d?.uid)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="mt-3 inline-flex items-center gap-2 ui-body">
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
      </div>

      <div className="grid gap-6 md:grid-cols-2">
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
            previewMode={previewMode}
            setPreviewMode={setPreviewMode}
            previewScale={previewScale}
            setPreviewScale={setPreviewScale}
            previewRefreshKey={previewRefreshKey}
            setPreviewRefreshKey={setPreviewRefreshKey}
            previewZpl={previewZpl}
            previewZplHasError={previewZplHasError}
            previewShowImage={previewShowImage}
            previewShowMock={previewShowMock}
            previewImageUrl={previewImageUrl}
            previewImageError={previewImageError}
            showZplCode={showZplCode}
            setShowZplCode={setShowZplCode}
            title={title}
            barcodeKind={barcodeKind}
            previewDualMatrix={previewDualMatrix}
            previewColWidthMm={previewColWidthMm}
            previewColGapMm={previewColGapMm}
            previewBarcodeScale={previewBarcodeScale}
            previewQrUrl={previewQrUrl}
            previewItems={previewItems}
            hasQueue={hasQueue}
          />
        </div>
      </div>
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
