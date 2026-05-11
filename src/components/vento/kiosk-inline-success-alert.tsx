"use client";

import { useEffect, useState } from "react";

type Props = {
  message: string;
  durationMs?: number;
};

export function KioskInlineSuccessAlert({ message, durationMs = 8000 }: Props) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) return;

    setVisible(true);

    const url = new URL(window.location.href);
    url.searchParams.delete("ok");
    url.searchParams.delete("success_message");

    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );

    const timer = window.setTimeout(() => {
      setVisible(false);
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [durationMs, message]);

  if (!visible || !message) return null;

  return (
    <div
      role="status"
      className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm"
    >
      <div className="font-semibold">Retiro registrado</div>
      <div className="mt-1">{message}</div>
    </div>
  );
}