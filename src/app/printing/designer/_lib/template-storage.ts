import type { LabelTemplate } from "./types";

const KEY = "vento-nexo:label-templates:v1";

export function loadTemplates(): LabelTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LabelTemplate[];
  } catch {
    return [];
  }
}

export function saveTemplate(template: LabelTemplate): void {
  const all = loadTemplates();
  const idx = all.findIndex((t) => t.id === template.id);
  if (idx >= 0) {
    all[idx] = template;
  } else {
    all.push(template);
  }
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function deleteTemplate(id: string): void {
  const all = loadTemplates().filter((t) => t.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function generateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
