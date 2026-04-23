import type { BarcodeKind, BrowserPrintDevice, BrowserPrintDevices, Preset } from "./types";

export function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

export function safeText(s: string): string {
  return String(s ?? "").replace(/[\r\n]+/g, " ").trim();
}

export function encodeVento(type: "LOC" | "SKU" | "PROD", code: string): string {
  return `VENTO|${type}|${safeText(code)}`;
}

export function buildZplHeader(opts: {
  widthDots: number;
  heightDots: number;
  offsetXDots: number;
  offsetYDots: number;
}): string {
  const { widthDots, heightDots, offsetXDots, offsetYDots } = opts;
  return [
    "^XA",
    `^PW${widthDots}`,
    `^LL${heightDots}`,
    `^LH${offsetXDots},${offsetYDots}`,
    "^CI28",
  ].join("\n");
}

export function buildZplFooter(): string {
  return "^XZ";
}

export function buildCode128Field(opts: {
  x: number;
  y: number;
  heightDots: number;
  data: string;
}): string {
  const { x, y, heightDots, data } = opts;
  const payload = safeText(data);
  return [
    "^BY2,2," + heightDots,
    `^FO${x},${y}`,
    `^BCN,${heightDots},N,N,N`,
    `^FD${payload}^FS`,
  ].join("\n");
}

export function buildDataMatrixField(opts: {
  x: number;
  y: number;
  moduleDots: number;
  data: string;
  /** Si true, codifica solo el código (ej. LOC-CP-BOD-MAIN) para DataMatrix más simple y mejor impresión */
  shortForLoc?: boolean;
}): string {
  const { x, y, moduleDots, data, shortForLoc } = opts;
  let payload = safeText(data);
  if (shortForLoc && payload.startsWith("VENTO|LOC|")) {
    payload = payload.replace(/^VENTO\|LOC\|/, "");
  }
  return [`^FO${x},${y}`, `^BXN,${moduleDots},200,0,0,6`, `^FD${payload}^FS`].join("\n");
}

function estimateQrModuleCount(data: string): number {
  const len = String(data ?? "").trim().length;
  if (len <= 20) return 21;
  if (len <= 38) return 25;
  if (len <= 61) return 29;
  if (len <= 90) return 33;
  if (len <= 122) return 37;
  if (len <= 154) return 41;
  return 45;
}

function fitQrMagnification(data: string, maxSizeDots: number, preferredMagnification: number): number {
  const modules = estimateQrModuleCount(data) + 8;
  const preferred = Math.min(10, Math.max(1, preferredMagnification));
  const fitted = Math.floor(Math.max(1, maxSizeDots) / modules);
  return Math.max(1, Math.min(preferred, fitted));
}

function qrSizeDots(data: string, magnification: number): number {
  return (estimateQrModuleCount(data) + 8) * Math.max(1, magnification);
}

export function buildQRField(opts: {
  x: number;
  y: number;
  magnification: number;
  data: string;
}): string {
  const { x, y, magnification, data } = opts;
  const payload = String(data ?? "").trim();
  if (!payload) return "";
  const mag = Math.min(10, Math.max(1, magnification));
  return [
    `^FO${x},${y}`,
    `^BQN,2,${mag}`,
    `^FDQA,${payload}^FS`,
  ].join("\n");
}

export function buildTextField(opts: {
  x: number;
  y: number;
  h: number;
  w: number;
  text: string;
}): string {
  const { x, y, h, w, text } = opts;
  const payload = safeText(text);
  return [`^FO${x},${y}`, `^A0N,${h},${w}`, `^FD${payload}^FS`].join("\n");
}

export function buildTextBlock(opts: {
  x: number;
  y: number;
  h: number;
  w: number;
  maxWidthDots: number;
  lines?: number;
  align?: "L" | "C" | "R";
  text: string;
}): string {
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

export function buildSingleLabelZpl(opts: {
  preset: Preset;
  dpi: number;
  offsetXDots: number;
  offsetYDots: number;
  barcodeKind: BarcodeKind;
  code128HeightDots: number;
  dmModuleDots: number;
  type: "LOC" | "SKU" | "PROD";
  title: string;
  code: string;
  note?: string;
  baseUrlForQr?: string;
}): string {
  const { preset, dpi, offsetXDots, offsetYDots, barcodeKind, code128HeightDots, dmModuleDots, type } = opts;

  const widthDots = mmToDots(preset.widthMm, dpi);
  const heightDots = mmToDots(preset.heightMm, dpi);

  const header = buildZplHeader({ widthDots, heightDots, offsetXDots, offsetYDots });

  const titleStr = safeText(opts.title);
  const note = safeText(opts.note ?? "");
  const code = safeText(opts.code);

  const isLoc70Qr =
    preset.id === "LOC_50x70_QR" &&
    type === "LOC" &&
    Boolean(opts.baseUrlForQr?.trim());

  const encoded = encodeVento(type, code);

  const marginX = 18;
  const yTitle = 12;
  const yNote = 38;
  const isProd = type === "PROD";
  const maxTextWidth = widthDots - marginX * 2;

  const parts: string[] = [];
  parts.push(header);

  if (isLoc70Qr) {
    // --- LOC 50×70 QR para Zebra 203 dpi: ajustar QR al espacio real ---
    const baseUrl = (opts.baseUrlForQr ?? "").replace(/\/$/, "");
    const withdrawUrl = `${baseUrl}/inventory/locations/open?loc=${encodeURIComponent(code)}`;
    const titleY = 16;
    const noteY = 50;
    const qrY = 94;
    const codeY = heightDots - 88;
    const qrMaxWidth = widthDots - marginX * 2 - 12;
    const qrMaxHeight = codeY - qrY - 18;
    const qrMaxSize = Math.max(96, Math.min(qrMaxWidth, qrMaxHeight));
    const qrMag = fitQrMagnification(withdrawUrl, qrMaxSize, 4);
    const qrSize = qrSizeDots(withdrawUrl, qrMag);
    const qrX = Math.max(marginX, Math.floor((widthDots - qrSize) / 2));

    parts.push(buildTextBlock({ x: marginX, y: titleY, h: 28, w: 20, maxWidthDots: maxTextWidth, lines: 1, align: "C", text: titleStr }));

    if (note) {
      parts.push(buildTextBlock({ x: marginX, y: noteY, h: 22, w: 16, maxWidthDots: maxTextWidth, lines: 2, align: "C", text: note }));
    }

    parts.push(buildQRField({ x: qrX, y: qrY, magnification: qrMag, data: withdrawUrl }));

    parts.push(buildTextBlock({ x: marginX, y: codeY, h: 24, w: 16, maxWidthDots: maxTextWidth, lines: 1, align: "C", text: code }));
  } else {
    // --- SKU / PROD / otros presets ---
    parts.push(buildTextBlock({ x: marginX, y: yTitle, h: 26, w: 26, maxWidthDots: maxTextWidth, lines: 1, align: "L", text: titleStr }));

    if (note) {
      parts.push(buildTextBlock({ x: marginX, y: yNote, h: isProd ? 20 : 22, w: isProd ? 20 : 22, maxWidthDots: maxTextWidth, lines: isProd ? 2 : 1, align: "L", text: note }));
    }
    const yBarcode = 70;
    if (barcodeKind === "datamatrix") {
      parts.push(buildDataMatrixField({ x: marginX, y: yBarcode, moduleDots: dmModuleDots, data: encoded }));
    } else {
      parts.push(buildCode128Field({ x: marginX, y: yBarcode, heightDots: code128HeightDots, data: encoded }));
    }
    parts.push(
      buildTextBlock({
        x: marginX,
        y: heightDots - 34,
        h: 22,
        w: 18,
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

export function buildThreeUpRowZpl(opts: {
  preset: Preset;
  dpi: number;
  offsetXDots: number;
  offsetYDots: number;
  barcodeKind: BarcodeKind;
  code128HeightDots: number;
  dmModuleDots: number;
  type: "LOC" | "SKU" | "PROD";
  title: string;
  items: Array<{ code: string; note?: string }>;
}): string {
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

export function normalizeDevices(devsRaw: BrowserPrintDevices | unknown): BrowserPrintDevice[] {
  if (Array.isArray(devsRaw)) return devsRaw;
  if (devsRaw && typeof devsRaw === "object") {
    const o = devsRaw as Record<string, unknown>;
    if (Array.isArray(o.devices)) return o.devices as BrowserPrintDevice[];
    if (Array.isArray(o.device)) return o.device as BrowserPrintDevice[];
    const vals = Object.values(o);
    if (vals.every((v) => typeof v === "object")) return vals as BrowserPrintDevice[];
  }
  return [];
}
