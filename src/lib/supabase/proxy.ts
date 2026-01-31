import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const cookieDomain =
  process.env.NEXT_PUBLIC_COOKIE_DOMAIN || process.env.COOKIE_DOMAIN;

function withCookieDomain(options?: any) {
  if (!cookieDomain) return options;
  return { ...(options ?? {}), domain: cookieDomain };
}

function getSupabaseKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY
  );
}

function hasSupabaseCookies(request: NextRequest) {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
}

function clearSupabaseCookies(request: NextRequest, response: NextResponse) {
  // Borra todas las cookies Supabase presentes en el request (sb-*)
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-")) {
      response.cookies.set(
        c.name,
        "",
        withCookieDomain({ path: "/", maxAge: 0 })
      );
    }
  }
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = getSupabaseKey();

  if (!url || !key) {
    // Si faltan envs, no intentamos auth en middleware (evita ruido)
    return NextResponse.next({ request });
  }

  // Si no hay cookies sb-*, NO hacemos llamadas de auth (evita spam en dev).
  if (!hasSupabaseCookies(request)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mantener request y response sincronizados
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, withCookieDomain(options));
        });
      },
    },
  });

  try {
    // Mantiene la sesión consistente cuando sí existe cookie.
    await supabase.auth.getUser();
  } catch (e: any) {
    // Si la sesión está corrupta o es de otro proyecto, limpiamos cookies para cortar el loop.
    const code = e?.code || e?.__isAuthError ? e?.code : undefined;

    if (code === "refresh_token_not_found") {
      clearSupabaseCookies(request, response);
      return response;
    }

    // Para cualquier otro error de auth en middleware, no bloqueamos la app.
    return response;
  }

  return response;
}

