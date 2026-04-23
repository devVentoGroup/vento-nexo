import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const sessionId =
    new URL(req.url).searchParams.get("session_id")?.trim() ||
    (await req.formData()).get("session_id")?.toString()?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "session_id requerido" }, { status: 400 });
  }

  const { data: session, error: sessErr } = await supabase
    .from("inventory_count_sessions")
    .select("id,status")
    .eq("id", sessionId)
    .single();

  if (sessErr || !session) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }
  const sess = session as { status: string };
  if (sess.status !== "closed") {
    return NextResponse.json({ error: "La sesión debe estar cerrada para aprobar ajustes" }, { status: 400 });
  }
  const { data: applyData, error: applyErr } = await supabase.rpc(
    "apply_inventory_count_adjustments",
    {
      p_session_id: sessionId,
      p_user_id: user.id,
    }
  );
  if (applyErr) {
    return NextResponse.json({ error: applyErr.message }, { status: 500 });
  }
  const payload = (applyData ?? {}) as { applied?: number };
  return NextResponse.json({ ok: true, applied: Number(payload.applied ?? 0) });
}
