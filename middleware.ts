import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const LOGIN_URL =
  process.env.NEXT_PUBLIC_SHELL_LOGIN_URL || "https://os.ventogroup.co/login";

function buildLoginRedirect(request: Request) {
  const target = new URL(LOGIN_URL);
  target.searchParams.set("returnTo", request.url);
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/((?!_next|login|favicon.ico|logos|images|fonts|api).*)"],
};

export async function middleware(request: Request) {
  const response = NextResponse.next();

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) {
    return buildLoginRedirect(request);
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return buildLoginRedirect(request);
  }

  return response;
}
