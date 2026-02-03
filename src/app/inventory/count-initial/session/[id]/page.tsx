import Link from "next/link";
import { redirect } from "next/navigation";

import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { CloseCountForm } from "@/features/inventory/count-initial/close-count-form";

export const dynamic = "force-dynamic";

function asText(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

async function closeCountAction(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/inventory/count-initial");

  const sessionId = asText(formData.get("session_id"));
  if (!sessionId) redirect("/inventory/count-initial?error=" + encodeURIComponent("Falta session_id"));

  const { data: session } = await supabase
    .from("inventory_count_sessions")
    .select("id,site_id,status,scope_type,scope_location_id")
    .eq("id", sessionId)
    .single();
  if (!session || (session as { status?: string }).status !== "open") {
    redirect(`/inventory/count-initial/session/${sessionId}?error=` + encodeURIComponent("Sesión no encontrada o ya cerrada"));
  }

  const sess = session as { site_id: string; scope_type: string | null; scope_location_id: string | null };
  const { data: lines } = await supabase
    .from("inventory_count_lines")
    .select("id,product_id,quantity_counted")
    .eq("session_id", sessionId);
  const lineRows = (lines ?? []) as { id: string; product_id: string; quantity_counted: number | null }[];

  const productIds = lineRows.map((l) => l.product_id);
  let currentByProduct: Map<string, number> = new Map();
  if (sess.scope_type === "loc" && sess.scope_location_id) {
    const { data: stockLoc } = await supabase
      .from("inventory_stock_by_location")
      .select("product_id,current_qty")
      .eq("location_id", sess.scope_location_id)
      .in("product_id", productIds);
    currentByProduct = new Map(
      (stockLoc ?? []).map((r: { product_id: string; current_qty: number | null }) => [r.product_id, Number(r.current_qty ?? 0)])
    );
  } else {
    const { data: stockSite } = await supabase
      .from("inventory_stock_by_site")
      .select("product_id,current_qty")
      .eq("site_id", sess.site_id)
      .in("product_id", productIds);
    currentByProduct = new Map(
      (stockSite ?? []).map((r: { product_id: string; current_qty: number | null }) => [r.product_id, Number(r.current_qty ?? 0)])
    );
  }

  for (const line of lineRows) {
    const current = currentByProduct.get(line.product_id) ?? 0;
    const counted = Number(line.quantity_counted ?? 0);
    const delta = counted - current;
    await supabase
      .from("inventory_count_lines")
      .update({ current_qty_at_close: current, quantity_delta: delta })
      .eq("id", line.id);
  }

  await supabase
    .from("inventory_count_sessions")
    .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: user.id })
    .eq("id", sessionId);

  redirect(`/inventory/count-initial/session/${sessionId}?ok=closed`);
}

async function approveAdjustmentsAction(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/inventory/count-initial");

  const sessionId = asText(formData.get("session_id"));
  if (!sessionId) redirect("/inventory/count-initial?error=" + encodeURIComponent("Falta session_id"));

  const { data: session } = await supabase
    .from("inventory_count_sessions")
    .select("id,site_id,status,scope_type,scope_location_id")
    .eq("id", sessionId)
    .single();
  if (!session || (session as { status?: string }).status !== "closed") {
    redirect(`/inventory/count-initial/session/${sessionId}?error=` + encodeURIComponent("Sesión debe estar cerrada"));
  }

  const sess = session as { site_id: string; scope_type: string | null; scope_location_id: string | null };
  const { data: lines } = await supabase
    .from("inventory_count_lines")
    .select("id,product_id,quantity_delta,adjustment_applied_at")
    .eq("session_id", sessionId);
  const lineRows = (lines ?? []) as { id: string; product_id: string; quantity_delta: number | null; adjustment_applied_at: string | null }[];
  const toApply = lineRows.filter((l) => Number(l.quantity_delta ?? 0) !== 0 && !l.adjustment_applied_at);

  for (const line of toApply) {
    const delta = Number(line.quantity_delta ?? 0);
    const note = `Ajuste por conteo sesión ${sessionId}`;
    await supabase.from("inventory_movements").insert({
      site_id: sess.site_id,
      product_id: line.product_id,
      movement_type: "adjustment",
      quantity: delta,
      note,
      created_by: user.id,
    });

    if (sess.scope_type === "loc" && sess.scope_location_id) {
      await supabase.rpc("upsert_inventory_stock_by_location", {
        p_location_id: sess.scope_location_id,
        p_product_id: line.product_id,
        p_delta: delta,
      });
    }

    const { data: siteStock } = await supabase
      .from("inventory_stock_by_site")
      .select("current_qty")
      .eq("site_id", sess.site_id)
      .eq("product_id", line.product_id)
      .maybeSingle();
    const currentQty = Number((siteStock as { current_qty?: number } | null)?.current_qty ?? 0);
    const newQty = Math.max(0, currentQty + delta);
    await supabase
      .from("inventory_stock_by_site")
      .upsert(
        {
          site_id: sess.site_id,
          product_id: line.product_id,
          current_qty: newQty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_id,product_id" }
      );

    await supabase
      .from("inventory_count_lines")
      .update({ adjustment_applied_at: new Date().toISOString() })
      .eq("id", line.id);
  }

  redirect(`/inventory/count-initial/session/${sessionId}?ok=adjusted`);
}

type SessionRow = {
  id: string;
  site_id: string;
  status: string | null;
  scope_type: string | null;
  scope_zone: string | null;
  scope_location_id: string | null;
  name: string | null;
  created_at: string | null;
  closed_at: string | null;
};
type LineRow = {
  id: string;
  product_id: string;
  quantity_counted: number | null;
  current_qty_at_close: number | null;
  quantity_delta: number | null;
  adjustment_applied_at: string | null;
  product: { name: string | null; unit: string | null } | null;
};
type SiteRow = { id: string; name: string | null };
type LocRow = { id: string; code: string | null };

export default async function CountSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/count-initial",
    permissionCode: "inventory.counts",
  });

  const { data: session, error: sessionErr } = await supabase
    .from("inventory_count_sessions")
    .select("*")
    .eq("id", id)
    .single();

  if (sessionErr || !session) {
    return (
      <div className="w-full">
        <Link href="/inventory/count-initial" className="ui-caption underline">
          Volver a conteos
        </Link>
        <div className="mt-4 ui-alert ui-alert--error">
          Sesión no encontrada o sin acceso.
        </div>
      </div>
    );
  }

  const sess = session as SessionRow;
  const siteId = sess.site_id;
  const isOpen = sess.status === "open";

  const { data: siteRow } = await supabase
    .from("sites")
    .select("id,name")
    .eq("id", siteId)
    .single();
  const siteName = (siteRow as SiteRow | null)?.name ?? siteId;

  const { data: lines } = await supabase
    .from("inventory_count_lines")
    .select("id,product_id,quantity_counted,current_qty_at_close,quantity_delta,adjustment_applied_at,product:products(name,unit)")
    .eq("session_id", id)
    .order("product_id", { ascending: true });
  const lineRows = (lines ?? []) as LineRow[];

  let currentQtyByProduct: Map<string, number> = new Map();
  if (isOpen && lineRows.length > 0) {
    const productIds = lineRows.map((l) => l.product_id);
    if (sess.scope_type === "loc" && sess.scope_location_id) {
      const { data: stockLoc } = await supabase
        .from("inventory_stock_by_location")
        .select("product_id,current_qty")
        .eq("location_id", sess.scope_location_id)
        .in("product_id", productIds);
      currentQtyByProduct = new Map(
        (stockLoc ?? []).map((r: { product_id: string; current_qty: number | null }) => [
          r.product_id,
          Number(r.current_qty ?? 0),
        ])
      );
    } else {
      const { data: stockSite } = await supabase
        .from("inventory_stock_by_site")
        .select("product_id,current_qty")
        .eq("site_id", siteId)
        .in("product_id", productIds);
      currentQtyByProduct = new Map(
        (stockSite ?? []).map((r: { product_id: string; current_qty: number | null }) => [
          r.product_id,
          Number(r.current_qty ?? 0),
        ])
      );
    }
  }

  const scopeLabel =
    sess.scope_type === "loc" && sess.scope_location_id
      ? "LOC"
      : sess.scope_zone
        ? `Zona ${sess.scope_zone}`
        : "Sede";

  let locCode: string | null = null;
  if (sess.scope_location_id) {
    const { data: locRow } = await supabase
      .from("inventory_locations")
      .select("code")
      .eq("id", sess.scope_location_id)
      .single();
    locCode = (locRow as LocRow | null)?.code ?? null;
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <Link href="/inventory/count-initial" className="ui-caption underline">
          Volver a conteos
        </Link>
        <h1 className="mt-2 ui-h1">
          Sesión de conteo — {sess.name ?? sess.id.slice(0, 8)}
        </h1>
        <p className="mt-2 ui-body-muted">
          Sede: {siteName} · Ámbito: {scopeLabel}
          {locCode ? ` (${locCode})` : ""} · Estado:{" "}
          <strong>{isOpen ? "Abierta" : "Cerrada"}</strong>
        </p>
        <p className="mt-1 ui-caption">
          Creada: {sess.created_at ? new Date(sess.created_at).toLocaleString() : "—"}
          {sess.closed_at ? ` · Cerrada: ${new Date(sess.closed_at).toLocaleString()}` : ""}
        </p>
      </div>

      {sp.ok ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {sp.ok === "closed" ? "Conteo cerrado. Revisa diferencias y aprueba ajustes." : ""}
          {sp.ok === "adjusted" ? "Ajustes aplicados." : ""}
        </div>
      ) : null}
      {sp.error ? (
        <div className="ui-alert ui-alert--error">
          {decodeURIComponent(sp.error)}
        </div>
      ) : null}

      <div className="ui-panel">
        <div className="ui-h3">Líneas del conteo</div>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>Unidad</TableHeaderCell>
                <TableHeaderCell>Contado</TableHeaderCell>
                <TableHeaderCell>Actual en sistema</TableHeaderCell>
                <TableHeaderCell>Diferencia</TableHeaderCell>
                <TableHeaderCell>Ajuste</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {lineRows.map((line) => {
                const current = isOpen
                  ? currentQtyByProduct.get(line.product_id) ?? 0
                  : Number(line.current_qty_at_close ?? 0);
                const counted = Number(line.quantity_counted ?? 0);
                const delta = isOpen ? counted - current : Number(line.quantity_delta ?? 0);
                const applied = Boolean(line.adjustment_applied_at);
                return (
                  <tr key={line.id} className="ui-body">
                    <TableCell>{line.product?.name ?? line.product_id}</TableCell>
                    <TableCell>{line.product?.unit ?? "—"}</TableCell>
                    <TableCell className="font-mono">{counted}</TableCell>
                    <TableCell className="font-mono">{current}</TableCell>
                    <TableCell className="font-mono">
                      {delta !== 0 ? (delta > 0 ? `+${delta}` : delta) : "0"}
                    </TableCell>
                    <TableCell>{applied ? "Aplicado" : delta !== 0 ? "Pendiente" : "—"}</TableCell>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </div>

      {isOpen ? (
        <CloseCountForm sessionId={id} closeAction={closeCountAction} />
      ) : (
        <ApproveAdjustmentsForm sessionId={id} approveAction={approveAdjustmentsAction} lines={lineRows.filter((l) => Number(l.quantity_delta ?? 0) !== 0 && !l.adjustment_applied_at)} />
      )}
    </div>
  );
}

async function ApproveAdjustmentsForm({
  sessionId,
  approveAction,
  lines,
}: {
  sessionId: string;
  approveAction: (formData: FormData) => Promise<void>;
  lines: LineRow[];
}) {
  if (lines.length === 0) {
    return (
      <div className="ui-panel">
        <p className="ui-body-muted">
          No hay diferencias pendientes de ajustar, o ya se aplicaron los ajustes.
        </p>
      </div>
    );
  }
  return (
    <form action={approveAction} className="ui-panel">
      <div className="ui-h3">Aprobar ajustes (Fase 3.4)</div>
      <p className="mt-1 ui-body-muted">
        {lines.length} línea(s) con diferencia. Al aprobar se generan movimientos de ajuste y se actualiza el stock.
      </p>
      <div className="mt-4">
        <input type="hidden" name="session_id" value={sessionId} />
        <button type="submit" className="ui-btn ui-btn--brand">
          Aprobar ajustes
        </button>
      </div>
    </form>
  );
}
