import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const wRaw = Number(url.searchParams.get("w"));
  const hRaw = Number(url.searchParams.get("h"));
  const dpmmRaw = Number(url.searchParams.get("dpmm") ?? "8");

  const width = Number.isFinite(wRaw) ? wRaw : 0;
  const height = Number.isFinite(hRaw) ? hRaw : 0;
  const dpmm = Number.isFinite(dpmmRaw) ? Math.max(6, Math.min(dpmmRaw, 12)) : 8;

  if (!width || !height) {
    return NextResponse.json({ error: "INVALID_SIZE" }, { status: 400 });
  }

  const zpl = await req.text();
  if (!zpl || !zpl.trim()) {
    return NextResponse.json({ error: "EMPTY_ZPL" }, { status: 400 });
  }

  const labelaryUrl = `https://api.labelary.com/v1/printers/${dpmm}/labels/${width}x${height}/0/`;
  const res = await fetch(labelaryUrl, {
    method: "POST",
    headers: { Accept: "image/png" },
    body: zpl,
  });

  if (!res.ok) {
    const raw = await res.text();
    return NextResponse.json({ error: raw || `HTTP ${res.status}` }, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
