import { redirect } from "next/navigation";

import { buildShellLoginUrl } from "@/lib/auth/sso";

type SearchParams = { returnTo?: string; error?: string; email?: string };

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const loginUrl = await buildShellLoginUrl(sp.returnTo);
  redirect(loginUrl);
}
