export function safeDecodeURIComponent(value: string | null | undefined): string {
  const raw = String(value ?? "");
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

