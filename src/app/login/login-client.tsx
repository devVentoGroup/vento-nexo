"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

const SHELL_LOGIN_URL =
  process.env.NEXT_PUBLIC_SHELL_LOGIN_URL || "https://os.ventogroup.co/login";

export function LoginContent() {
  const searchParams = useSearchParams();

  const loginUrl = useMemo(() => {
    const url = new URL(SHELL_LOGIN_URL);
    const returnTo = searchParams.get("returnTo");
    if (returnTo) {
      // Convertir ruta relativa a URL absoluta si es necesario
      const absoluteReturnTo = returnTo.startsWith("http")
        ? returnTo
        : `${window.location.origin}${returnTo}`;
      url.searchParams.set("returnTo", absoluteReturnTo);
    }
    return url.toString();
  }, [searchParams]);

  useEffect(() => {
    window.location.replace(loginUrl);
  }, [loginUrl]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="ui-panel w-full max-w-md text-center">
        <h1 className="ui-h1">Redirigiendo al inicio de sesion</h1>
        <p className="mt-2 ui-body-muted">
          Si no pasa nada en unos segundos, abre el login manualmente.
        </p>
        <div className="mt-4">
          <a href={loginUrl} className="ui-btn ui-btn--brand">
            Ir a Vento OS
          </a>
        </div>
        <p className="mt-4 ui-caption">
          Si ya iniciaste sesion,{" "}
          <Link href="/" className="text-[var(--ui-brand-600)] hover:underline">
            vuelve al panel
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
