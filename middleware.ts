import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const LOGIN_URL =
  process.env.NEXT_PUBLIC_SHELL_LOGIN_URL || "https://os.ventogroup.co/login";
const DEBUG_AUTH = process.env.NEXT_PUBLIC_DEBUG_AUTH === "1";

function buildLoginRedirect(request: NextRequest) {
  const target = new URL(LOGIN_URL);
  target.searchParams.set("returnTo", request.url);
  return NextResponse.redirect(target);
}

function withDebugHeaders(
  response: NextResponse,
  request: NextRequest,
  status: string
) {
  if (!DEBUG_AUTH) return response;

  const cookieNames = request.cookies
    .getAll()
    .map((c) => c.name)
    .join(",");

  response.headers.set("x-vento-auth-debug", "1");
  response.headers.set("x-vento-auth-status", status);
  response.headers.set("x-vento-host", request.headers.get("host") ?? "");
  response.headers.set("x-vento-path", request.nextUrl.pathname);
  response.headers.set(
    "x-vento-cookie-count",
    String(request.cookies.getAll().length)
  );
  response.headers.set("x-vento-cookie-names", cookieNames.slice(0, 512));
  return response;
}

export const config = {
  matcher: ["/((?!_next|login|favicon.ico|logos|images|fonts|api).*)"],
};

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  if (!url || !key) {
    return withDebugHeaders(buildLoginRedirect(request), request, "no-config");
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
    return withDebugHeaders(buildLoginRedirect(request), request, "no-user");
  }

  return withDebugHeaders(response, request, "ok");
}
