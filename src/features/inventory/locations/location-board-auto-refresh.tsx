"use client";

import { useEffect, useState } from "react";

type Props = {
  intervalSeconds?: number;
};

export function LocationBoardAutoRefresh({
  intervalSeconds = 30,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(intervalSeconds);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          const nextUrl = new URL(window.location.href);
          const nextParams = nextUrl.searchParams;
          nextParams.set("_refresh", Date.now().toString());
          window.location.replace(nextUrl.toString());
          return intervalSeconds;
        }
        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [intervalSeconds]);

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm">
      Actualiza en {secondsLeft}s
    </div>
  );
}
