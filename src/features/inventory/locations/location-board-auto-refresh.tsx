"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  intervalSeconds?: number;
};

export function LocationBoardAutoRefresh({
  intervalSeconds = 30,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [secondsLeft, setSecondsLeft] = useState(intervalSeconds);
  const pathnameRef = useRef(pathname);
  const searchParamsRef = useRef(searchParams.toString());

  useEffect(() => {
    pathnameRef.current = pathname;
    searchParamsRef.current = searchParams.toString();
  }, [pathname, searchParams]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          const nextParams = new URLSearchParams(searchParamsRef.current);
          nextParams.set("_refresh", Date.now().toString());
          router.replace(`${pathnameRef.current}?${nextParams.toString()}`, { scroll: false });
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
