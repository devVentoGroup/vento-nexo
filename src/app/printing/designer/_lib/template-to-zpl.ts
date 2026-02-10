import type { LabelElement, LabelTemplate } from "./types";

function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

function safeText(s: string): string {
  return String(s ?? "").replace(/[\r\n]+/g, " ").trim();
}

function elementToZpl(el: LabelElement, dpi: number): string {
  const x = mmToDots(el.x, dpi);
  const y = mmToDots(el.y, dpi);
  const w = mmToDots(el.width, dpi);
  const h = mmToDots(el.height, dpi);
  const text = safeText(el.content);

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
      // Codificar solo el código para LOC (menos módulos = impresión más nítida)
      let dmPayload = text;
      if (dmPayload.startsWith("VENTO|LOC|")) {
        dmPayload = dmPayload.replace(/^VENTO\|LOC\|/, "");
      }
      const targetModules = 20;
      const moduleDots = Math.max(4, Math.min(10, Math.round(h / targetModules)));
      return [
        `^FO${x},${y}`,
        `^BXN,${moduleDots},200,0,0,6`,
        `^FD${dmPayload}^FS`,
      ].join("\n");
    }
    case "barcode_c128": {
      const barH = Math.max(30, Math.min(200, h));
      return [
        `^BY2,2,${barH}`,
        `^FO${x},${y}`,
        `^BCN,${barH},N,N,N`,
        `^FD${text}^FS`,
      ].join("\n");
    }
    case "barcode_qr": {
      // Magnification: ~3 for 15mm at 203dpi
      const mag = Math.max(1, Math.min(6, Math.round(h / 40)));
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

export function templateToZpl(template: LabelTemplate): string {
  const { dpi, elements } = template;
  // Use orientation to determine physical dimensions
  const isHoriz = template.orientation === "horizontal";
  const physW = isHoriz ? Math.max(template.widthMm, template.heightMm) : template.widthMm;
  const physH = isHoriz ? Math.min(template.widthMm, template.heightMm) : template.heightMm;
  const widthDots = mmToDots(physW, dpi);
  const heightDots = mmToDots(physH, dpi);

  const header = [
    "^XA",
    `^PW${widthDots}`,
    `^LL${heightDots}`,
    "^LH0,0",
    "^CI28",
  ].join("\n");

  const body = elements
    .map((el) => elementToZpl(el, dpi))
    .filter(Boolean)
    .join("\n");

  return `${header}\n${body}\n^XZ`;
}

/** Generate ZPL for multiple LOCs using the same template layout */
export function templateToZplBatch(
  template: LabelTemplate,
  codes: Array<{ code: string; ventoCode: string; qrUrl: string; description?: string }>
): string {
  return codes.map((item) => {
    // Clone template and replace content in elements
    const modified: LabelTemplate = {
      ...template,
      elements: template.elements.map((el) => {
        if (el.id === "el_code") return { ...el, content: item.code };
        if (el.id === "el_dm") return { ...el, content: item.ventoCode };
        if (el.id === "el_qr") return { ...el, content: item.qrUrl };
        if (el.id === "el_desc") return { ...el, content: item.description ?? "" };
        return el;
      }),
    };
    return templateToZpl(modified);
  }).join("\n");
}
