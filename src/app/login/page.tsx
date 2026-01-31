import { headers } from "next/headers";
import { redirect } from "next/navigation";

const LOGIN_URL =
  process.env.NEXT_PUBLIC_SHELL_LOGIN_URL || "https://os.ventogroup.co/login";

export default async function LoginPage() {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const returnTo = host ? `${proto}://${host}` : "";
  const url = new URL(LOGIN_URL);

  if (returnTo) {
    url.searchParams.set("returnTo", returnTo);
  }

  redirect(url.toString());
}
