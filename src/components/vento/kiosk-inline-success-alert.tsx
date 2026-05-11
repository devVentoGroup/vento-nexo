"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  message: string;
  durationMs?: number;
};

export function KioskInlineSuccessAlert({ message, durationMs = 8000 }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) return;

    setVisible(true);

    const timer = window.setTimeout(() => {
      setVisible(false);

      const params = new URLSearchParams(searchParams.toString());
      params.delete("ok");
      params.delete("success_message");

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [durationMs, message, pathname, router, searchParams]);

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