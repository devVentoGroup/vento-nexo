import type { LabelElement, LabelTemplate } from "./types";

function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

function safeText(s: string): string {
  return String(s ?? "").replace(/[\r\n]+/g, " ").trim();
}

type Variables = {
  code?: string;
  note?: string;
  title?: string;
};

function resolveContent(content: string, vars: Variables): string {
  let out = content;
  if (vars.code) out = out.replace(/\{code\}/gi, vars.code);
  if (vars.note) out = out.replace(/\{note\}/gi, vars.note);
  if (vars.title) out = out.replace(/\{title\}/gi, vars.title);
  return safeText(out);
}

function elementToZpl(el: LabelElement, dpi: number, vars: Variables): string {
  const x = mmToDots(el.x, dpi);
  const y = mmToDots(el.y, dpi);
  const w = mmToDots(el.width, dpi);
  const h = mmToDots(el.height, dpi);
  const text = resolveContent(el.content, vars);

  switch (el.type) {
    case "title":
    case "text": {
      const fontSize = el.fontSize ?? (el.type === "title" ? 36 : 24);
      const fontW = Math.round(fontSize * 0.5);
      return [
        `^FO${x},${y}`,
        `^A0N,${fontSize},${fontW}`,
        `^FB${w},2,0,L,0`,
        `^FD${text}^FS`,
      ].join("\n");
    }
    case "barcode_dm": {
      const moduleDots = Math.max(2, Math.round(h / 18));
      return [
        `^FO${x},${y}`,
        `^BXN,${moduleDots},200,0,0,6`,
        `^FD${text}^FS`,
      ].join("\n");
    }
    case "barcode_c128": {
      return [
        "^BY2,2," + h,
        `^FO${x},${y}`,
        `^BCN,${h},N,N,N`,
        `^FD${text}^FS`,
      ].join("\n");
    }
    case "barcode_qr": {
      const mag = Math.max(1, Math.min(10, Math.round(h / 20)));
      return [
        `^FO${x},${y}`,
        `^BQN,2,${mag}`,
        `^FDQA,${text}^FS`,
      ].join("\n");
    }
    default:
      return "";
  }
}

export function templateToZpl(
  template: LabelTemplate,
  vars: Variables = {}
): string {
  const { widthMm, heightMm, dpi, elements } = template;
  const widthDots = mmToDots(widthMm, dpi);
  const heightDots = mmToDots(heightMm, dpi);

  const header = [
    "^XA",
    `^PW${widthDots}`,
    `^LL${heightDots}`,
    "^LH0,0",
    "^CI28",
  ].join("\n");

  const body = elements
    .map((el) => elementToZpl(el, dpi, vars))
    .filter(Boolean)
    .join("\n");

  return `${header}\n${body}\n^XZ`;
}

export function templateToZplBatch(
  template: LabelTemplate,
  items: Array<{ code: string; note?: string; title?: string }>
): string {
  return items
    .map((item) => templateToZpl(template, item))
    .join("\n");
}
