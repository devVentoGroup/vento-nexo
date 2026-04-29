const HISTORY_DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const HISTORY_TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatHistoryDateParts(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return { date: "-", time: "" };

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { date: raw, time: "" };

  return {
    date: HISTORY_DATE_FORMATTER.format(parsed).replace(".", ""),
    time: HISTORY_TIME_FORMATTER.format(parsed).toLowerCase(),
  };
}

export function formatHistoryDateTime(value: string | null | undefined) {
  const parts = formatHistoryDateParts(value);
  return parts.time ? `${parts.date}, ${parts.time}` : parts.date;
}
