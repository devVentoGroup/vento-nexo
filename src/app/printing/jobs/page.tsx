"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { useSearchParams } from "next/navigation";

declare global {
  interface Window {
    BrowserPrint?: any;
  }
}

type BarcodeKind = "datamatrix" | "code128";

type Preset = {
  id: string;
  label: string;
  // Medida REAL del rollo (para 3-up, el ancho es el rollo completo)
  widthMm: number;
  heightMm: number;
  columns: number;

  // Defaults de simbología
  defaultBarcodeKind: BarcodeKind;

  // Para Code128 (alto en dots)
  defaultCode128HeightDots: number;

  // Para DataMatrix (tamaño de módulo en dots)
  defaultDmModuleDots: number;

  // Tipo lógico (para codificar VENTO|TYPE|CODE)
  defaultType: "LOC" | "SKU" | "PROD";
};

type LocRow = {
  id: string;
  code: string;
  description?: string | null;
  zone?: string | null;
  site_id?: string | null;
  created_at?: string | null;
};

function mmToDots(mm: number, dpi: number) {
  return Math.round((mm / 25.4) * dpi);
}

function safeText(s: string) {
  // Evitamos caracteres raros para ZPL; si necesitas más, luego metemos ^FH.
  return String(s ?? "").replace(/[\r\n]+/g, " ").trim();
}

function buildZplHeader(opts: {
  widthDots: number;
  heightDots: number;
  offsetXDots: number;
  offsetYDots: number;
}) {
  const { widthDots, heightDots, offsetXDots, offsetYDots } = opts;
  return [
    "^XA",
    `^PW${widthDots}`,
    `^LL${heightDots}`,
    // Label Home (offset)
    `^LH${offsetXDots},${offsetYDots}`,
    "^CI28", // UTF-8-ish para textos (sin garantía total, pero ayuda)
  ].join("\n");
}

function buildZplFooter() {
  return "^XZ";
}

function buildCode128Field(opts: {
  x: number;
  y: number;
  heightDots: number;
  data: string;
}) {
  const { x, y, heightDots, data } = opts;
  const payload = safeText(data);
  // Importante: sin línea de interpretación (N) para que se vea limpio
  return [
    "^BY2,2," + heightDots,
    `^FO${x},${y}`,
    `^BCN,${heightDots},N,N,N`,
    `^FD${payload}^FS`,
  ].join("\n");
}

function buildDataMatrixField(opts: { x: number; y: number; moduleDots: number; data: string }) {
  const { x, y, moduleDots, data } = opts;
  const payload = safeText(data);
  // ^BX: Data Matrix (ECC 200)
  // Formato: ^BXo,h,s,c,r,f
  // o=N, h=módulo (dots), s=200 (ECC200), c/r=0 auto, f=6 default
  return [`^FO${x},${y}`, `^BXN,${moduleDots},200,0,0,6`, `^FD${payload}^FS`].join("\n");
}

/** QR Code ZPL (^BQ). Uso: retiro con URL en etiqueta LOC 50×70. */
function buildQRField(opts: { x: number; y: number; magnification: number; data: string }) {
  const { x, y, magnification, data } = opts;
  const payload = String(data ?? "").trim();
  if (!payload) return "";
  // ^BQ: o=N (normal), 2=model 2, magnification 2–10 (4 ≈ 18–20 mm a 203 dpi)
  const mag = Math.min(10, Math.max(1, magnification));
  return [`^FO${x},${y}`, `^BQN,2,${mag}`, `^FDQA,${payload}^FS`].join("\n");
}

function buildTextField(opts: { x: number; y: number; h: number; w: number; text: string }) {
  const { x, y, h, w, text } = opts;
  const payload = safeText(text);
  return [`^FO${x},${y}`, `^A0N,${h},${w}`, `^FD${payload}^FS`].join("\n");
}

function buildTextBlock(opts: {
  x: number;
  y: number;
  h: number;
  w: number;
  maxWidthDots: number;
  lines?: number;
  align?: "L" | "C" | "R";
  text: string;
}) {
  const { x, y, h, w, maxWidthDots, lines = 1, align = "L", text } = opts;
  const payload = safeText(text);
  const width = Math.max(1, Math.floor(maxWidthDots));
  return [
    `^FO${x},${y}`,
    `^A0N,${h},${w}`,
    `^FB${width},${lines},0,${align},0`,
    `^FD${payload}^FS`,
  ].join("\n");
}

function encodeVento(type: "LOC" | "SKU" | "PROD", code: string) {
  return `VENTO|${type}|${safeText(code)}`;
}

function buildSingleLabelZpl(opts: {
  preset: Preset;
  dpi: number;
  offsetXDots: number;
  offsetYDots: number;

  barcodeKind: BarcodeKind;
  code128HeightDots: number;
  dmModuleDots: number;

  // Label content
  type: "LOC" | "SKU" | "PROD";
  title: string; // arriba
  code: string; // humano abajo
  note?: string; // segunda línea arriba
  /** Solo para LOC 50×70: origen para URL de retiro (DataMatrix + QR). */
  baseUrlForQr?: string;
}) {
  const { preset, dpi, offsetXDots, offsetYDots, barcodeKind, code128HeightDots, dmModuleDots, type } = opts;

  const widthDots = mmToDots(preset.widthMm, dpi);
  const heightDots = mmToDots(preset.heightMm, dpi);

  const header = buildZplHeader({ widthDots, heightDots, offsetXDots, offsetYDots });

  const title = safeText(opts.title);
  const note = safeText(opts.note ?? "");
  const code = safeText(opts.code);

  const isLoc70Dual =
    preset.id === "LOC_50x70" &&
    type === "LOC" &&
    barcodeKind === "datamatrix" &&
    Boolean(opts.baseUrlForQr?.trim());

  const encoded = isLoc70Dual ? code : encodeVento(type, code);

  const marginX = 18;
  const yTitle = 12;
  const yNote = 38;
  const isLoc70 = preset.id === "LOC_50x70" && barcodeKind === "datamatrix" && type === "LOC";
  const isProd = type === "PROD";
  const maxTextWidth = widthDots - marginX * 2;

  const parts: string[] = [];
  parts.push(header);

  // Arriba: nombre + código (LOC 50×70 según spec)
  parts.push(
    buildTextBlock({
      x: marginX,
      y: yTitle,
      h: isLoc70 ? 22 : 26,
      w: isLoc70 ? 22 : 26,
      maxWidthDots: maxTextWidth,
      lines: 1,
      align: "L",
      text: title,
    })
  );

  if (note) {
    parts.push(
      buildTextBlock({
        x: marginX,
        y: isLoc70 ? 46 : yNote,
        h: isLoc70 ? 40 : isProd ? 20 : 22,
        w: isLoc70 ? 40 : isProd ? 20 : 22,
        maxWidthDots: maxTextWidth,
        lines: isLoc70 ? 2 : isProd ? 2 : 1,
        align: "L",
        text: note,
      })
    );
  }

  // LOC 50×70 con dos códigos (8.1): DataMatrix = código LOC; QR = URL retiro
  if (isLoc70Dual) {
    const baseUrl = (opts.baseUrlForQr ?? "").replace(/\/$/, "");
    const withdrawUrl = `${baseUrl}/inventory/withdraw?loc=${encodeURIComponent(code)}`;
    const yCodes = 140;
    const dmSize = dmModuleDots * 26;
    const dmX = marginX;
    const qrMagnification = 4;
    const qrSizeApprox = 25 * qrMagnification * 4;
    const qrX = Math.min(widthDots - marginX - qrSizeApprox, dmX + dmSize + 12);
    parts.push(buildDataMatrixField({ x: dmX, y: yCodes, moduleDots: dmModuleDots, data: code }));
    parts.push(buildQRField({ x: qrX, y: yCodes, magnification: qrMagnification, data: withdrawUrl }));
    parts.push(
      buildTextBlock({
        x: marginX,
        y: heightDots - 56,
        h: 24,
        w: 20,
        maxWidthDots: maxTextWidth,
        lines: 1,
        align: "C",
        text: code,
      })
    );
  } else {
    const yBarcode = isLoc70 ? 140 : 70;
    const dmSizeGuess = dmModuleDots * 26;
    const dmX = Math.max(marginX, Math.floor((widthDots - dmSizeGuess) / 2));
    if (barcodeKind === "datamatrix") {
      parts.push(buildDataMatrixField({ x: isLoc70 ? dmX : marginX, y: yBarcode, moduleDots: dmModuleDots, data: encoded }));
    } else {
      parts.push(buildCode128Field({ x: marginX, y: yBarcode, heightDots: code128HeightDots, data: encoded }));
    }
    parts.push(
      buildTextBlock({
        x: marginX,
        y: isLoc70 ? heightDots - 56 : heightDots - 34,
        h: isLoc70 ? 24 : 22,
        w: isLoc70 ? 20 : 18,
        maxWidthDots: maxTextWidth,
        lines: 1,
        align: "C",
        text: code,
      })
    );
  }

  parts.push(buildZplFooter());
  return parts.join("\n");
}

function buildThreeUpRowZpl(opts: {
  preset: Preset; // columns=3, widthMm=rollo completo
  dpi: number;
  offsetXDots: number;
  offsetYDots: number;

  barcodeKind: BarcodeKind;
  code128HeightDots: number;
  dmModuleDots: number;

  type: "LOC" | "SKU" | "PROD";
  title: string;

  items: Array<{ code: string; note?: string }>; // EXACTAMENTE 3
}) {
  const { preset, dpi, offsetXDots, offsetYDots, barcodeKind, code128HeightDots, dmModuleDots, type, title, items } =
    opts;

  const widthDots = mmToDots(preset.widthMm, dpi);
  const heightDots = mmToDots(preset.heightMm, dpi);

  const header = buildZplHeader({ widthDots, heightDots, offsetXDots, offsetYDots });

  const colWidthDots = Math.floor(widthDots / preset.columns);
  const marginX = 12;
  const yTitle = 10;
  const yNote = 34;
  const yBarcode = 60;

  const parts: string[] = [];
  parts.push(header);

  items.forEach((it, idx) => {
    const x0 = idx * colWidthDots + marginX;
    const code = safeText(it.code);
    const note = safeText(it.note ?? "");
    const encoded = encodeVento(type, code);

    parts.push(buildTextField({ x: x0, y: yTitle, h: 22, w: 22, text: title }));
    if (note) parts.push(buildTextField({ x: x0, y: yNote, h: 18, w: 18, text: note }));

    if (barcodeKind === "datamatrix") {
      parts.push(buildDataMatrixField({ x: x0, y: yBarcode, moduleDots: dmModuleDots, data: encoded }));
    } else {
      parts.push(buildCode128Field({ x: x0, y: yBarcode, heightDots: code128HeightDots, data: encoded }));
    }

    parts.push(buildTextField({ x: x0, y: heightDots - 26, h: 18, w: 18, text: code }));
  });

  parts.push(buildZplFooter());
  return parts.join("\n");
}

function normalizeDevices(devsRaw: any): any[] {
  if (Array.isArray(devsRaw)) return devsRaw;
  if (Array.isArray(devsRaw?.devices)) return devsRaw.devices;
  if (Array.isArray(devsRaw?.device)) return devsRaw.device;
  // A veces viene como objeto con keys numéricas
  if (devsRaw && typeof devsRaw === "object") {
    const vals = Object.values(devsRaw);
    if (vals.every((v) => typeof v === "object")) return vals as any[];
  }
  return [];
}

function PrintingJobsContent() {
  const searchParams = useSearchParams();
  // Si tus scripts ya están en otro path, ajusta aquí:
  const BROWSERPRINT_CORE = "/zebra/BrowserPrint.min.js";
  const BROWSERPRINT_ZEBRA = "/zebra/BrowserPrint-Zebra.min.js";
  // Endpoints (ajusta si tus rutas reales son distintas)
  const LOCS_API = "/api/inventory/locations?limit=500";
  const presets: Preset[] = useMemo(
    () => [
      {
        id: "LOC_50x70",
        label: "LOC 50×70 (DataMatrix + QR retiro)",
        widthMm: 50,
        heightMm: 70,
        columns: 1,
        defaultBarcodeKind: "datamatrix",
        defaultCode128HeightDots: 120,
        defaultDmModuleDots: 10,
        defaultType: "LOC",
      },
      {
        id: "SKU_32x25_3UP",
        label: "SKU/Producto -? 32x25 (Code128 -? 3 por fila)",
        widthMm: 105, // rollo completo 3 columnas (32x25 x3)
        heightMm: 25,
        columns: 3,
        defaultBarcodeKind: "code128",
        defaultCode128HeightDots: 55,
        defaultDmModuleDots: 4,
        defaultType: "SKU",
      },
      {
        id: "PROD_50x30",
        label: "PROD 50x30 (Code128)",
        widthMm: 50,
        heightMm: 30,
        columns: 1,
        defaultBarcodeKind: "code128",
        defaultCode128HeightDots: 60,
        defaultDmModuleDots: 4,
        defaultType: "PROD",
      },
    ],
    []
  );

  const [enablePrinting, setEnablePrinting] = useState(true);

  const [dpi, setDpi] = useState(203);
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "LOC_50x70");

  const preset = useMemo(() => presets.find((p) => p.id === presetId) ?? presets[0], [presetId, presets]);

  const [offsetXmm, setOffsetXmm] = useState(0);
  const [offsetYmm, setOffsetYmm] = useState(0);

  const [title, setTitle] = useState("VENTO -? LOC");
  const [barcodeKind, setBarcodeKind] = useState<BarcodeKind>(preset.defaultBarcodeKind);
  const [code128HeightDots, setCode128HeightDots] = useState(preset.defaultCode128HeightDots);
  const [dmModuleDots, setDmModuleDots] = useState(preset.defaultDmModuleDots);

  const [browserPrintOk, setBrowserPrintOk] = useState(false);
  const [status, setStatus] = useState<string>("");

  const [devices, setDevices] = useState<any[]>([]);
  const [selectedUid, setSelectedUid] = useState<string>("");
  const deviceRef = useRef<any>(null);

  const [queueText, setQueueText] = useState<string>("");
  const [previewZpl, setPreviewZpl] = useState<string>("");

  useEffect(() => {
    const presetParam = searchParams.get("preset");
    const queueParam = searchParams.get("queue");
    const titleParam = searchParams.get("title");

    if (presetParam) setPresetId(presetParam);
    if (queueParam) setQueueText(queueParam.replace(/\r/g, ""));
    if (titleParam) setTitle(titleParam);
  }, [searchParams]);

  // LOC selector
  const [locs, setLocs] = useState<LocRow[]>([]);
  const [locSearch, setLocSearch] = useState("");
  const [selectedLocCode, setSelectedLocCode] = useState<string>("");

  // Mantener defaults al cambiar preset
  useEffect(() => {
    setBarcodeKind(preset.defaultBarcodeKind);
    setCode128HeightDots(preset.defaultCode128HeightDots);
    setDmModuleDots(preset.defaultDmModuleDots);

    // Ajuste automático de título según tipo
    if (preset.defaultType === "LOC") setTitle("VENTO -? LOC");
    if (preset.defaultType === "SKU") setTitle("VENTO -? SKU");
    if (preset.defaultType === "PROD") setTitle("VENTO - PROD");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId]);

  // Detectar BrowserPrint
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof window !== "undefined" && window.BrowserPrint) {
        setBrowserPrintOk(true);
        clearInterval(t);
      }
    }, 300);
    return () => clearInterval(t);
  }, []);

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

  // Preview (muestra el primer label / primera fila)
  useEffect(() => {
    if (!preset) return;

    try {
      if (preset.columns === 1) {
        const first = parsedQueue[0] ?? { code: "EJEMPLO-001", note: "Demo" };
        const baseUrl =
          typeof window !== "undefined" ? (window.location?.origin ?? "") : "";
        const zpl = buildSingleLabelZpl({
          preset,
          dpi,
          offsetXDots,
          offsetYDots,
          barcodeKind,
          code128HeightDots,
          dmModuleDots,
          type: preset.defaultType,
          title,
          code: first.code,
          note: first.note,
          baseUrlForQr: preset.id === "LOC_50x70" && preset.defaultType === "LOC" ? baseUrl : undefined,
        });
        setPreviewZpl(zpl);
      } else {
        const row = [
          parsedQueue[0] ?? { code: "EJ-001", note: "Demo" },
          parsedQueue[1] ?? { code: "EJ-002", note: "Demo" },
          parsedQueue[2] ?? { code: "EJ-003", note: "Demo" },
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
        setPreviewZpl(zpl);
      }
    } catch (e: any) {
      setPreviewZpl(`// Error generando ZPL: ${String(e?.message ?? e)}`);
    }
  }, [preset, dpi, offsetXDots, offsetYDots, barcodeKind, code128HeightDots, dmModuleDots, title, parsedQueue]);

  function requireReady() {
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

  function detectPrinters() {
    setStatus("");
    if (!window.BrowserPrint) {
      setStatus("BrowserPrint no está disponible.");
      return;
    }

    window.BrowserPrint.getLocalDevices(
      (raw: any) => {
        const list = normalizeDevices(raw);

        // Filtrado defensivo: quedarnos con lo que parezca impresora
        const onlyPrinters = list.filter((d) => {
          const t = String(d?.deviceType ?? d?.type ?? "").toLowerCase();
          const n = String(d?.name ?? "").toLowerCase();
          return t.includes("printer") || n.includes("zebra") || n.includes("zd");
        });

        setDevices(onlyPrinters.length ? onlyPrinters : list);
        if (!selectedUid && (onlyPrinters[0]?.uid || list[0]?.uid)) {
          setSelectedUid(String(onlyPrinters[0]?.uid ?? list[0]?.uid));
        }
        setStatus(`Detectadas: ${onlyPrinters.length ? onlyPrinters.length : list.length}`);
      },
      (err: any) => {
        setStatus(`Error detectando impresoras: ${String(err?.message ?? err)}`);
      },
      "printer"
    );
  }

  function connectSelected() {
    setStatus("");
    const dev = devices.find((d) => String(d?.uid) === String(selectedUid));
    if (!dev) {
      setStatus("Selecciona una impresora válida.");
      return;
    }
    deviceRef.current = dev;
    setStatus(`Impresora lista: ${String(dev?.name ?? dev?.uid ?? "")}`);
  }

  function sendZpl(zpl: string) {
    if (!requireReady()) return;

    const dev = deviceRef.current;
    setStatus("Enviando impresión...");

    try {
      dev.send(
        zpl,
        () => {
          setStatus("Impresión enviada.");
        },
        (err: any) => {
          // Ojo: a veces imprime y aún así el driver devuelve error de ??connection closed???.
          setStatus(`Error al imprimir: ${String(err?.message ?? err)}`);
        }
      );
    } catch (e: any) {
      setStatus(`Excepción al imprimir: ${String(e?.message ?? e)}`);
    }
  }

  function printAll() {
    if (!preset) return;
    if (!parsedQueue.length) {
      setStatus("Cola vacía.");
      return;
    }

    // Para 3-up solo imprime filas completas
    if (preset.columns === 3 && parsedQueue.length < 3) {
      setStatus("Este preset imprime de a 3. Faltan etiquetas para completar una fila.");
      return;
    }

    const zplParts: string[] = [];

    if (preset.columns === 1) {
      const baseUrl =
        typeof window !== "undefined" ? (window.location?.origin ?? "") : "";
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
      setQueueText(""); // limpia
      return;
    }

    // 3-up
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

    // Remueve lo impreso (filas completas), deja remainder en cola
    const remainder = parsedQueue.slice(fullRows * 3);
    const newText = remainder.map((it) => (it.note ? `${it.code}|${it.note}` : it.code)).join("\n");
    setQueueText(newText);

    if (remainder.length) {
      setStatus(`Impreso ${fullRows * 3}. Quedan ${remainder.length} en cola (esperando completar 3).`);
    }
  }

  function printAlignmentTest() {
    if (!preset) return;
    const widthDots = mmToDots(preset.widthMm, dpi);
    const heightDots = mmToDots(preset.heightMm, dpi);

    const zpl = [
      buildZplHeader({ widthDots, heightDots, offsetXDots, offsetYDots }),
      // Marco
      "^FO10,10^GB" + (widthDots - 20) + "," + (heightDots - 20) + ",2^FS",
      // Diagonal simple
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
      const url = LOCS_API;
      const res = await fetch(url, { cache: "no-store" });

      // Leemos texto para poder mostrar errores reales (no solo HTTP)
      const raw = await res.text();
      let json: any = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        // si no es JSON, lo dejamos como texto
      }

      if (!res.ok) {
        const msg =
          json?.error ??
          json?.message ??
          (typeof raw === "string" && raw.trim() ? raw : `HTTP ${res.status}`);
        setStatus(`Error cargando LOCs: ${msg}`);
        return;
      }

      const rows: any[] =
        Array.isArray(json) ? json :
          Array.isArray(json?.data) ? json.data :
            Array.isArray(json?.rows) ? json.rows :
              Array.isArray(json?.locations) ? json.locations :
                [];

      setLocs(rows as LocRow[]);
      setStatus(`LOCs cargados: ${rows.length}`);
    } catch (e: any) {
      setStatus(`Error cargando LOCs: ${String(e?.message ?? e)}`);
    }
  }

  const filteredLocs = useMemo(() => {
    const q = locSearch.trim().toLowerCase();
    if (!q) return locs;
    return locs.filter((l) => {
      const code = String(l.code ?? "").toLowerCase();
      const desc = String(l.description ?? "").toLowerCase();
      return code.includes(q) || desc.includes(q);
    });
  }, [locs, locSearch]);

  function addSelectedLocToQueue(mode: "replace" | "append") {
    const loc = locs.find((l) => l.code === selectedLocCode);
    if (!loc) {
      setStatus("Selecciona un LOC válido.");
      return;
    }

    // Auto (estándar): LOC siempre es 50x70 + DataMatrix
    if (presetId !== "LOC_50x70") {
      setPresetId("LOC_50x70");
    }
    setBarcodeKind("datamatrix");
    setTitle("VENTO -? LOC");

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

  return (
    <div className="w-full space-y-6">
      <Script src={BROWSERPRINT_CORE} strategy="afterInteractive" />
      <Script src={BROWSERPRINT_ZEBRA} strategy="afterInteractive" />

      <div>
        <h1 className="ui-h1">Impresión</h1>
        <p className="mt-2 ui-body-muted">
          Zebra + BrowserPrint. Etiqueta LOC 50×70: DataMatrix (código LOC) + QR (URL retiro). SKU/PROD:{" "}
          <span className="font-mono">VENTO|TYPE|CODE</span>.
        </p>
      </div>

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
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 ui-body font-semibold"
            onClick={connectSelected}
            type="button"
          >
            Conectar impresora
          </button>

          <button
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 ui-body font-semibold"
            onClick={printAll}
            type="button"
          >
            Imprimir
          </button>

          <button
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 ui-body font-semibold"
            onClick={printAlignmentTest}
            type="button"
          >
            Prueba alineación
          </button>

          <div className="ml-auto flex items-center gap-3 ui-body-muted">
            <span>
              BrowserPrint: <span className="font-medium">{browserPrintOk ? "OK" : "NO"}</span>
            </span>
            <span>
              Impresora: <span className="font-medium">{deviceRef.current ? "OK" : "NO"}</span>
            </span>

            <select
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
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
          <div className="mt-3 rounded-xl bg-zinc-50 px-4 py-3 ui-body">{status}</div>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="ui-panel">
          <div className="ui-h3">Configuración</div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <div className="ui-caption font-medium">Preset</div>
              <div className="col-span-2">
                <div className="ui-caption font-medium">Tipo rápido</div>
                <div className="mt-1 inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setPresetId("LOC_50x70")}
                    className={`px-4 py-2 text-sm font-semibold ${preset.defaultType === "LOC" ? "bg-[var(--ui-brand)] text-[var(--ui-on-primary)]" : "bg-[var(--ui-surface)] text-[var(--ui-text)]"
                      }`}
                  >
                    LOC
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetId("SKU_32x25_3UP")}
                    className={`px-4 py-2 text-sm font-semibold ${preset.defaultType === "SKU" ? "bg-[var(--ui-brand)] text-[var(--ui-on-primary)]" : "bg-[var(--ui-surface)] text-[var(--ui-text)]"
                      }`}
                  >
                    SKU
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetId("PROD_50x30")}
                    className={`px-4 py-2 text-sm font-semibold ${preset.defaultType === "PROD" ? "bg-[var(--ui-brand)] text-[var(--ui-on-primary)]" : "bg-[var(--ui-surface)] text-[var(--ui-text)]"
                      }`}
                  >
                    PROD
                  </button>
                </div>
                <div className="mt-2 ui-caption">
                  Esto solo cambia el preset recomendado. La cola es la que define qué se imprime.
                </div>
              </div>
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="ui-caption font-medium">DPI</div>
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
              >
                <option value={203}>203 dpi</option>
                <option value={300}>300 dpi</option>
              </select>
            </div>

            <div>
              <div className="ui-caption font-medium">Offset X (mm)</div>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={offsetXmm}
                onChange={(e) => setOffsetXmm(Number(e.target.value || "0"))}
              />
            </div>

            <div>
              <div className="ui-caption font-medium">Offset Y (mm)</div>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={offsetYmm}
                onChange={(e) => setOffsetYmm(Number(e.target.value || "0"))}
              />
            </div>

            <div className="col-span-2">
              <div className="ui-caption font-medium">Título</div>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <div className="ui-caption font-medium">Tipo de código</div>
              <select
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm opacity-70"
                value={barcodeKind}
                disabled
                title="Estándar bloqueado por preset"
              >
                <option value="datamatrix">DataMatrix (2D)</option>
                <option value="code128">Code128 (1D)</option>
              </select>
            </div>

            {barcodeKind === "datamatrix" ? (
              <div>
                <div className="ui-caption font-medium">Módulo DM (dots)</div>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={dmModuleDots}
                  onChange={(e) => setDmModuleDots(Number(e.target.value || "0"))}
                />
              </div>
            ) : (
              <div>
                <div className="ui-caption font-medium">Alto Code128 (dots)</div>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={code128HeightDots}
                  onChange={(e) => setCode128HeightDots(Number(e.target.value || "0"))}
                />
              </div>
            )}

            <div className="col-span-2 ui-caption">
              Recomendación: usa <span className="font-medium">Prueba alineación</span> y ajusta Offset X/Y hasta que el
              marco caiga exactamente.
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-zinc-50 p-4 ui-caption">
            <div className="font-semibold text-zinc-700">Nota clave</div>
            <div className="mt-1">
              En LOC (DataMatrix), el contenido codificado es: <span className="font-mono">VENTO|LOC|{"<CODE>"}</span>.
              En SKU/PROD igual con su TYPE.
            </div>
          </div>

          <div className="mt-6">
            {preset.defaultType === "LOC" ? (
              <>
                <div className="ui-h3">Seleccionar LOC</div>

                <div className="mt-3 flex items-center gap-3">
                  <button
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2 ui-body font-semibold"
                    onClick={loadLocs}
                    type="button"
                  >
                    Cargar LOCs
                  </button>

                  <input
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    placeholder="Buscar por código o descripción..."
                    value={locSearch}
                    onChange={(e) => setLocSearch(e.target.value)}
                  />
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <select
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    value={selectedLocCode}
                    onChange={(e) => setSelectedLocCode(e.target.value)}
                  >
                    <option value="">{locs.length ? "(Selecciona un LOC)" : "(Primero carga LOCs)"}</option>
                    {filteredLocs.map((l) => (
                      <option key={l.id} value={l.code}>
                        {l.code} ??? {String(l.description ?? "").slice(0, 40)}
                      </option>
                    ))}
                  </select>

                  <button
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2 ui-body font-semibold"
                    onClick={() => addSelectedLocToQueue("replace")}
                    type="button"
                  >
                    Reemplazar
                  </button>

                  <button
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2 ui-body font-semibold"
                    onClick={() => addSelectedLocToQueue("append")}
                    type="button"
                  >
                    Agregar
                  </button>
                </div>

                <div className="mt-2 ui-caption">
                  Al escoger un LOC, el preset cambia automáticamente a LOC 50x70 (DataMatrix).
                </div>
              </>
            ) : null}

            {preset.defaultType === "SKU" ? (
              <div className="mt-2 ui-caption">
                Para SKU/Producto (3-up), pega códigos en la cola. Se imprime en filas de 3.
              </div>
            ) : null}
          </div>
        </div>
        <div className="ui-panel">
          <div className="ui-h3">Etiquetas</div>
          <textarea
            className="mt-4 h-64 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
            placeholder={
              preset.defaultType === "LOC"
                ? `Formato: LOC|DESCRIPCIÓN (o solo LOC)\nEj:\nLOC-VGR-OFI-01-N0|TODA LA NAVIDAD`
                : preset.defaultType === "PROD"
                  ? `Formato: LOTE|PRODUCTO - Prod YYYY-MM-DD - Exp YYYY-MM-DD\nEj:\nPB-20260118-0001|PAN BURGER - Prod 2026-01-18 - Exp 2026-01-20`
                  : `Formato: CODE|NOTA (o solo CODE)\nEj (3-up):\nSKU-0001|PIZZA\nSKU-0002|PIZZA\nSKU-0003|PIZZA`
            }
            value={queueText}
            onChange={(e) => setQueueText(e.target.value)}
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="ui-caption">
              Total en cola: {parsedQueue.length}.{" "}
              {preset.columns === 3 ? "Este preset imprime en filas de 3 (3-up)." : "Este preset imprime 1-up."}
            </div>

            <button
              type="button"
              onClick={() => setQueueText("")}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 ui-caption font-semibold"
            >
              Limpiar cola
            </button>
          </div>

          {preset.columns === 3 ? (
            <div className="mt-2 ui-caption">
              Si en cola no hay múltiplos de 3, se imprimen solo filas completas y lo restante queda esperando.
            </div>
          ) : null}

          <div className="mt-6">
            <div className="ui-h3">Preview ZPL</div>
            <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-zinc-950 p-4 ui-code text-zinc-100">
              {previewZpl || "// (vacío)"}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrintingJobsPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full ui-body-muted">
          Cargando impresion...
        </div>
      }
    >
      <PrintingJobsContent />
    </Suspense>
  );
}








