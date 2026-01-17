import { headers } from "next/headers";
import { redirect } from "next/navigation";

type SearchParams = { returnTo?: string; error?: string; email?: string };

const SHELL_LOGIN_URL = "https://shell.ventogroup.co/login";

function safeReturnTo(value?: string) {
  const v = (value ?? "").trim();
  if (!v) return "/";
  if (!v.startsWith("/")) return "/";
  return v;
}

async function buildReturnToUrl(pathname: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "nexo.ventogroup.co";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}${pathname}`;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const returnPath = safeReturnTo(sp.returnTo);
  const returnTo = await buildReturnToUrl(returnPath);

  const qs = new URLSearchParams();
  qs.set("returnTo", returnTo);

  if (sp.email) {
    try {
      qs.set("email", decodeURIComponent(sp.email));
    } catch {
      qs.set("email", sp.email);
    }
  }

  redirect(`${SHELL_LOGIN_URL}?${qs.toString()}`);
}
