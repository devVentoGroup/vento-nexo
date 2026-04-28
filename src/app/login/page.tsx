import { redirect } from "next/navigation";

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

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  redirect(buildShellLoginUrl(sp.returnTo));
}

