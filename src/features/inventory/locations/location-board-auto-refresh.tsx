type Props = {
  intervalSeconds?: number;
};

export function LocationBoardAutoRefresh({ intervalSeconds = 30 }: Props) {
  const safeInterval = Math.max(5, Math.floor(intervalSeconds));
  const script = `
(() => {
  const id = "vento-location-board-refresh";
  const el = document.getElementById(id);
  if (!el) return;

  const intervalMs = ${safeInterval} * 1000;
  const startedAt = Date.now();

  if (window.__ventoLocationBoardRefreshTimer) {
    window.clearInterval(window.__ventoLocationBoardRefreshTimer);
  }

  const tick = () => {
    const currentEl = document.getElementById(id);
    if (!currentEl) return;

    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, Math.ceil((intervalMs - elapsed) / 1000));
    currentEl.textContent = remaining > 0 ? "Actualiza en " + remaining + "s" : "Actualizando...";

    if (remaining <= 0) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("_refresh", String(Date.now()));
      window.location.replace(nextUrl.toString());
    }
  };

  tick();
  window.__ventoLocationBoardRefreshTimer = window.setInterval(tick, 1000);
})();
`;

  return (
    <>
      <div
        id="vento-location-board-refresh"
        className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm"
      >
        Actualiza en {safeInterval}s
      </div>
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </>
  );
}
