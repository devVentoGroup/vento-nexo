import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const DEBUG_AUTH = process.env.NEXT_PUBLIC_DEBUG_AUTH === "1";
const COOKIE_DOMAIN =
  process.env.NEXT_PUBLIC_COOKIE_DOMAIN || process.env.COOKIE_DOMAIN;
const BODEGA_KIOSK_EMAIL = "bodega@ventogroup.co";
const BODEGA_KIOSK_LOCATION_CODE = "LOC-CP-BOD-MAIN";

function buildLoginRedirect(request: NextRequest) {
  const target = new URL("/login", request.url);
  target.searchParams.set("returnTo", request.url);
  return withNoStoreHeaders(NextResponse.redirect(target));
}

function withCookieDomain(options?: Record<string, unknown>) {
  if (!COOKIE_DOMAIN) return options;
  return { ...(options ?? {}), domain: COOKIE_DOMAIN };
}

function hasSupabaseCookies(request: NextRequest) {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
}

function clearSupabaseCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.set(cookie.name, "", withCookieDomain({ path: "/", maxAge: 0 }));
    }
  }
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

function withNoStoreHeaders(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

function isBodegaKioskUser(user: unknown) {
  const email = String((user as { email?: string | null } | null)?.email ?? "")
    .trim()
    .toLowerCase();
  return email === BODEGA_KIOSK_EMAIL;
}

function buildBodegaKioskRedirect(request: NextRequest) {
  return withNoStoreHeaders(NextResponse.redirect(new URL("/kiosk/bodega", request.url)));
}

function withRequiredKioskParam(request: NextRequest) {
  if (request.nextUrl.searchParams.get("kiosk") === "1") return null;

  const target = request.nextUrl.clone();
  target.searchParams.set("kiosk", "1");
  return withNoStoreHeaders(NextResponse.redirect(target));
}

function isStaticKioskEntry(pathname: string) {
  return pathname === "/kiosk/bodega" || pathname === "/kiosk/bodega-principal";
}

function isAllowedBodegaLocationRoute(pathname: string, locationId: string) {
  const base = `/inventory/locations/${encodeURIComponent(locationId)}`;
  return pathname === `${base}/board` || pathname === `${base}/kiosk-withdraw`;
}

export const config = {
  matcher: ["/((?!_next|login|favicon.ico|manifest.webmanifest|logos|images|fonts|api).*)"],
};

export async function middleware(request: NextRequest) {
  if (!hasSupabaseCookies(request)) {
    return withDebugHeaders(buildLoginRedirect(request), request, "no-cookies");
  }

  const response = withNoStoreHeaders(NextResponse.next());

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
          response.cookies.set(name, value, withCookieDomain(options));
        });
      },
    },
  });

  let data: { user: unknown | null } | null = null;
  try {
    const result = await supabase.auth.getUser();
    data = result.data;
  } catch {
    const redirect = buildLoginRedirect(request);
    clearSupabaseCookies(request, redirect);
    return withDebugHeaders(redirect, request, "auth-error");
  }

  if (!data.user) {
    const redirect = buildLoginRedirect(request);
    clearSupabaseCookies(request, redirect);
    return withDebugHeaders(redirect, request, "no-user");
  }

  if (isBodegaKioskUser(data.user)) {
    const pathname = request.nextUrl.pathname;

    if (isStaticKioskEntry(pathname)) {
      return withDebugHeaders(response, request, "bodega-kiosk-entry");
    }

    const { data: locationData } = await supabase
      .from("inventory_locations")
      .select("id")
      .eq("code", BODEGA_KIOSK_LOCATION_CODE)
      .eq("is_active", true)
      .maybeSingle();
    const locationId = String(
      (locationData as { id?: string | null } | null)?.id ?? ""
    ).trim();

    if (!locationId || !isAllowedBodegaLocationRoute(pathname, locationId)) {
      return withDebugHeaders(
        buildBodegaKioskRedirect(request),
        request,
        "bodega-kiosk-redirect"
      );
    }

    const kioskRedirect = withRequiredKioskParam(request);
    if (kioskRedirect) {
      return withDebugHeaders(kioskRedirect, request, "bodega-kiosk-param");
    }
  }

  return withDebugHeaders(response, request, "ok");
}
