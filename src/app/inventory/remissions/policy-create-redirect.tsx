"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function PolicyCreateRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname !== "/inventory/remissions") return;

    const requestedMode = String(searchParams.get("new") ?? "")
      .trim()
      .toLowerCase();
    if (!["1", "true", "new"].includes(requestedMode)) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("new");
    const query = nextParams.toString();
    router.replace(`/inventory/remissions/new${query ? `?${query}` : ""}`);
  }, [pathname, router, searchParams]);

  return null;
}
