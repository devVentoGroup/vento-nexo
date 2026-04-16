import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const APP_ID = "nexo";

type TemplatePayload = {
  id?: string;
  name?: string;
  widthMm?: number;
  heightMm?: number;
  dpi?: number;
  orientation?: "vertical" | "horizontal";
  elements?: unknown[];
};

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

function isValidTemplate(value: TemplatePayload) {
  return (
    typeof value?.id === "string" &&
    typeof value?.name === "string" &&
    typeof value?.widthMm === "number" &&
    typeof value?.heightMm === "number" &&
    typeof value?.dpi === "number" &&
    (value?.orientation === "vertical" || value?.orientation === "horizontal") &&
    Array.isArray(value?.elements)
  );
}

export async function GET(req: Request) {
  const supabase = await getSupabase();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = String(url.searchParams.get("id") ?? "").trim();

  let query = supabase
    .from("printing_label_templates")
    .select("id, name, template, updated_at")
    .eq("app_id", APP_ID)
    .order("updated_at", { ascending: false });

  if (id) query = query.eq("id", id);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const templates = (data ?? [])
    .map((row) => {
      const template =
        row && typeof row === "object" && "template" in row
          ? (row.template as Record<string, unknown> | null)
          : null;
      if (!template) return null;
      return {
        ...template,
        id: String(template.id ?? row.id ?? ""),
        name: String(template.name ?? row.name ?? ""),
      };
    })
    .filter(Boolean);

  return NextResponse.json(id ? (templates[0] ?? null) : templates);
}

export async function POST(req: Request) {
  const supabase = await getSupabase();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: TemplatePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON_INVALIDO" }, { status: 400 });
  }

  if (!isValidTemplate(body)) {
    return NextResponse.json({ error: "TEMPLATE_INVALIDO" }, { status: 400 });
  }

  const payload = {
    id: body.id!,
    user_id: user.id,
    app_id: APP_ID,
    name: body.name!,
    template: body,
  };

  const { data, error } = await supabase
    .from("printing_label_templates")
    .upsert(payload, { onConflict: "id" })
    .select("template")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data?.template ?? body);
}

export async function DELETE(req: Request) {
  const supabase = await getSupabase();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = String(url.searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "ID_REQUERIDO" }, { status: 400 });
  }

  const { error } = await supabase
    .from("printing_label_templates")
    .delete()
    .eq("id", id)
    .eq("app_id", APP_ID);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
