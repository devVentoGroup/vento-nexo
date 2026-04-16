import type { LabelTemplate } from "./types";

const API = "/api/printing/layouts";

export async function loadTemplates(): Promise<LabelTemplate[]> {
  const res = await fetch(API, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudieron cargar los layouts.");
  const data = await res.json();
  return Array.isArray(data) ? (data as LabelTemplate[]) : [];
}

export async function loadTemplate(id: string): Promise<LabelTemplate | null> {
  const res = await fetch(`${API}?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar el layout.");
  const data = await res.json();
  return data && typeof data === "object" ? (data as LabelTemplate) : null;
}

export async function saveTemplate(template: LabelTemplate): Promise<LabelTemplate> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(template),
  });
  if (!res.ok) throw new Error("No se pudo guardar el layout.");
  return (await res.json()) as LabelTemplate;
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${API}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("No se pudo eliminar el layout.");
}

export function generateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
