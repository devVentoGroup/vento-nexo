"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

type Props = {
  intervalSeconds?: number;
  staleAfterSeconds?: number;
};

function isEditableElement(element: Element | null) {
  if (!element) return false;
  const tagName = String(element.tagName || "").toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    (element as HTMLElement).isContentEditable === true
  );
}

function hasKioskSearchValue() {
  const input = document.getElementById("kiosk-board-search") as HTMLInputElement | null;
  return String(input?.value ?? "").trim().length > 0;
}

function interactionLabel() {
  if (document.hidden) return "Pausado por pantalla apagada";
  if (hasKioskSearchValue()) return "Pausado por busqueda";
  if (isEditableElement(document.activeElement)) return "Pausado por interaccion";
  if (document.documentElement.dataset.nexoKioskUserInteracting === "1") return "Pausado por operacion";
  return "";
}

function isUserInteracting() {
  return Boolean(interactionLabel());
}

export function LocationBoardAutoRefresh({ intervalSeconds = 60, staleAfterSeconds = 15 }: Props) {
  const router = useRouter();
  const safeInterval = Math.max(30, Math.floor(intervalSeconds));
  const safeStaleAfter = Math.max(5, Math.floor(staleAfterSeconds));
  const intervalMs = safeInterval * 1000;
  const staleAfterMs = safeStaleAfter * 1000;
  const [status, setStatus] = useState(`Actualiza en ${safeInterval}s`);
  const [isPending, startTransition] = useTransition();
  const deadlineRef = useRef(Date.now() + intervalMs);
  const lastRefreshRef = useRef(Date.now());
  const isRefreshingRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);

  const releaseRefreshing = useCallback(() => {
    if (releaseTimerRef.current) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }

    releaseTimerRef.current = window.setTimeout(() => {
      isRefreshingRef.current = false;
      deadlineRef.current = Date.now() + intervalMs;
      setStatus(`Actualiza en ${safeInterval}s`);
    }, 1200);
  }, [intervalMs, safeInterval]);

  const refreshNow = useCallback((label: string) => {
    if (isRefreshingRef.current) return;

    isRefreshingRef.current = true;
    pendingRefreshRef.current = false;
    lastRefreshRef.current = Date.now();
    deadlineRef.current = Date.now() + intervalMs;
    setStatus(label);

    startTransition(() => {
      router.refresh();
    });

    releaseRefreshing();
  }, [intervalMs, releaseRefreshing, router]);

  const requestRefresh = useCallback((label: string) => {
    if (isUserInteracting()) {
      pendingRefreshRef.current = true;
      deadlineRef.current = Date.now();
      setStatus("Actualizacion pendiente");
      return;
    }

    refreshNow(label);
  }, [refreshNow]);

  useEffect(() => {
    if (!isPending && isRefreshingRef.current) {
      releaseRefreshing();
    }
  }, [isPending, releaseRefreshing]);

  useEffect(() => {
    const maybeRefreshAfterResume = () => {
      if (Date.now() - lastRefreshRef.current < staleAfterMs) return;
      requestRefresh("Actualizando al reactivar...");
    };

    const onVisibilityChange = () => {
      if (!document.hidden) maybeRefreshAfterResume();
    };

    const onPageShow = () => {
      maybeRefreshAfterResume();
    };

    const onFocus = () => {
      maybeRefreshAfterResume();
    };

    const onOnline = () => {
      requestRefresh("Actualizando conexion...");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [requestRefresh, staleAfterMs]);

  useEffect(() => {
    deadlineRef.current = Date.now() + intervalMs;

    const tick = () => {
      if (isRefreshingRef.current || isPending) {
        setStatus("Actualizando...");
        return;
      }

      const pausedLabel = interactionLabel();
      if (pausedLabel) {
        setStatus(pausedLabel);
        if (!pendingRefreshRef.current) {
          deadlineRef.current = Date.now() + intervalMs;
        }
        return;
      }

      if (pendingRefreshRef.current) {
        refreshNow("Actualizando cambios...");
        return;
      }

      const remainingMs = deadlineRef.current - Date.now();
      const remaining = Math.max(0, Math.ceil(remainingMs / 1000));

      if (remaining > 0) {
        setStatus(`Actualiza en ${remaining}s`);
        return;
      }

      refreshNow("Actualizando inventario...");
    };

    tick();
    const timer = window.setInterval(tick, 1000);

    return () => {
      window.clearInterval(timer);
      if (releaseTimerRef.current) {
        window.clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
    };
  }, [intervalMs, isPending, refreshNow]);

  return (
    <div
      id="vento-location-board-refresh"
      aria-live="polite"
      className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm"
    >
      {status}
    </div>
  );
}
