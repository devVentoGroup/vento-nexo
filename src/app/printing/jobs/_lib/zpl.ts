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
}): string {
  const { x, y, moduleDots, data } = opts;
  const payload = safeText(data);
  return [`^FO${x},${y}`, `^BXN,${moduleDots},200,0,0,6`, `^FD${payload}^FS`].join("\n");
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
  return [`^FO${x},${y}`, `^BQN,2,${mag}`, `^FDQA,${payload}^FS`].join("\n");
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

  if (isLoc70Dual) {
    // --- LOC 50x70 with DataMatrix + QR ---
    const baseUrl = (opts.baseUrlForQr ?? "").replace(/\/$/, "");
    const withdrawUrl = `${baseUrl}/inventory/withdraw?loc=${encodeURIComponent(code)}`;
    const ventoCode = encodeVento("LOC", code);

    // Title at top
    parts.push(buildTextBlock({ x: marginX, y: 12, h: 28, w: 28, maxWidthDots: maxTextWidth, lines: 1, align: "L", text: titleStr }));

    // Note/description below title
    if (note) {
      parts.push(buildTextBlock({ x: marginX, y: 48, h: 22, w: 22, maxWidthDots: maxTextWidth, lines: 1, align: "L", text: note }));
    }

    // Barcodes: DM left, QR right at ~30% from top
    const yCodes = Math.round(heightDots * 0.22);
    const dmMod = Math.min(dmModuleDots, 8);
    const dmSize = dmMod * 26;
    const dmX = marginX;
    const qrMag = 3;
    const qrX = dmX + dmSize + 16;

    parts.push(buildDataMatrixField({ x: dmX, y: yCodes, moduleDots: dmMod, data: ventoCode }));
    parts.push(buildQRField({ x: qrX, y: yCodes, magnification: qrMag, data: withdrawUrl }));

    // Code text at bottom - big and centered
    parts.push(buildTextBlock({ x: marginX, y: heightDots - 70, h: 30, w: 26, maxWidthDots: maxTextWidth, lines: 1, align: "C", text: code }));
  } else {
    // --- Standard presets ---
    parts.push(buildTextBlock({ x: marginX, y: yTitle, h: isLoc70 ? 22 : 26, w: isLoc70 ? 22 : 26, maxWidthDots: maxTextWidth, lines: 1, align: "L", text: titleStr }));

    if (note) {
      parts.push(buildTextBlock({ x: marginX, y: isLoc70 ? 46 : yNote, h: isLoc70 ? 40 : isProd ? 20 : 22, w: isLoc70 ? 40 : isProd ? 20 : 22, maxWidthDots: maxTextWidth, lines: isLoc70 ? 2 : isProd ? 2 : 1, align: "L", text: note }));
    }
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
