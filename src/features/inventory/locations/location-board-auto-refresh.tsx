"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  intervalSeconds?: number;
};

export function LocationBoardAutoRefresh({
  intervalSeconds = 30,
}: Props) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(intervalSeconds);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          router.refresh();
          return intervalSeconds;
        }
        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [intervalSeconds, router]);

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm">
      Actualiza en {secondsLeft}s
    </div>
  );
}
