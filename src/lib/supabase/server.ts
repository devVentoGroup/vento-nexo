import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { isLocalHostname } from "@/lib/auth/request-host";

const configuredCookieDomain =
  process.env.NEXT_PUBLIC_COOKIE_DOMAIN || process.env.COOKIE_DOMAIN;

function withCookieDomain(
  options: Record<string, unknown> | undefined,
  cookieDomain: string | undefined,
) {
  if (!cookieDomain) return options;
  return { ...(options ?? {}), domain: cookieDomain };
}

export async function createClient() {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const requestHost =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const cookieDomain = isLocalHostname(requestHost)
    ? undefined
    : configuredCookieDomain;

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Your project's URL and Key are required to create a Supabase client! " +
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) in .env.local."
    );
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(
              name,
              value,
              withCookieDomain(options as Record<string, unknown>, cookieDomain),
            );
          });
        } catch {
          // En Server Components Next puede bloquear set cookies; lo resolvemos con middleware.
        }
      },
    },
  });
}
