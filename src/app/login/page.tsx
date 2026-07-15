import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isLocalHostname } from "@/lib/auth/request-host";
import { LocalLoginForm } from "./local-login-form";

const SHELL_LOGIN_URL =
  process.env.NEXT_PUBLIC_SHELL_LOGIN_URL || "https://os.ventogroup.co/login";

type SearchParams = { returnTo?: string };

function buildShellLoginUrl(returnTo?: string) {
  const url = new URL(SHELL_LOGIN_URL);
  const target = (returnTo ?? "").trim();
  if (target) {
    url.searchParams.set("returnTo", target);
  }
  return url.toString();
}

function normalizeLocalReturnTo(returnTo?: string) {
  const target = String(returnTo ?? "").trim();
  if (!target) return "/";
  if (target.startsWith("/")) return target;

  try {
    const url = new URL(target);
    if (!isLocalHostname(url.hostname)) return "/";
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";

  if (!isLocalHostname(host)) {
    redirect(buildShellLoginUrl(sp.returnTo));
  }

  return <LocalLoginForm returnTo={normalizeLocalReturnTo(sp.returnTo)} />;
}
