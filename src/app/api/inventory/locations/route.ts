import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: Request) {
    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? "500");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 1000)) : 500;

    const cookieStore = await cookies();

    // RLS: usamos el usuario actual vía cookies (no service role)
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll() {
                    // no-op (en este GET no necesitamos refrescar cookies)
                    // Si luego quieres refresh tokens aquí, lo implementamos con NextResponse.
                },
            },
        }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
        return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { data, error } = await supabase
        .from("inventory_locations")
        .select("id, code, description, zone, site_id, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data ?? []);
}

