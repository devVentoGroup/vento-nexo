"use client";

import { useEffect, useState } from "react";

type CreateRequestKeyFieldProps = {
  name?: string;
  initialValue: string;
};

function generateRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CreateRequestKeyField({
  name = "_create_request_key",
  initialValue,
}: CreateRequestKeyFieldProps) {
  const [requestKey, setRequestKey] = useState(() => initialValue || generateRequestKey());

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setRequestKey(generateRequestKey());
      }
    };

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return <input type="hidden" name={name} value={requestKey} readOnly />;
}
