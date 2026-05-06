type Props = {
  intervalSeconds?: number;
};

export function LocationBoardAutoRefresh({ intervalSeconds = 30 }: Props) {
  const safeInterval = Math.max(10, Math.floor(intervalSeconds));
  const script = `
(() => {
  const id = "vento-location-board-refresh";
  const el = document.getElementById(id);
  if (!el) return;

  const intervalMs = ${safeInterval} * 1000;

  if (window.__ventoLocationBoardRefreshTimer) {
    window.clearInterval(window.__ventoLocationBoardRefreshTimer);
  }

  window.__ventoLocationBoardRefreshDeadline = Date.now() + intervalMs;
  window.__ventoLocationBoardRefreshIsNavigating = false;

  const isEditableElement = (element) => {
    if (!element) return false;
    const tagName = String(element.tagName || "").toLowerCase();
    return (
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      element.isContentEditable === true
    );
  };

  const hasActiveSearch = () => {
    try {
      const url = new URL(window.location.href);
      return String(url.searchParams.get("search") || "").trim().length > 0;
    } catch {
      return false;
    }
  };

  const isUserInteracting = () => {
    if (document.hidden) return true;
    if (hasActiveSearch()) return true;
    if (isEditableElement(document.activeElement)) return true;
    if (document.documentElement.dataset.nexoKioskUserInteracting === "1") return true;
    return false;
  };

  const postpone = (label) => {
    window.__ventoLocationBoardRefreshDeadline = Date.now() + intervalMs;
    el.textContent = label;
  };

  const tick = () => {
    const currentEl = document.getElementById(id);
    if (!currentEl) {
      if (window.__ventoLocationBoardRefreshTimer) {
        window.clearInterval(window.__ventoLocationBoardRefreshTimer);
      }
      return;
    }

    if (window.__ventoLocationBoardRefreshIsNavigating) {
      currentEl.textContent = "Actualizando...";
      return;
    }

    if (isUserInteracting()) {
      postpone(hasActiveSearch() ? "Pausado por búsqueda" : "Pausado por interacción");
      return;
    }

    const remainingMs = Number(window.__ventoLocationBoardRefreshDeadline || 0) - Date.now();
    const remaining = Math.max(0, Math.ceil(remainingMs / 1000));

    currentEl.textContent = remaining > 0 ? "Actualiza en " + remaining + "s" : "Actualizando...";

    if (remaining > 0) return;

    window.__ventoLocationBoardRefreshIsNavigating = true;

    if (window.__ventoLocationBoardRefreshTimer) {
      window.clearInterval(window.__ventoLocationBoardRefreshTimer);
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("_refresh", String(Date.now()));
    window.location.replace(nextUrl.toString());
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