import Link from "next/link";
import { redirect } from "next/navigation";

import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { CloseCountForm } from "@/features/inventory/count-initial/close-count-form";
import { formatHistoryDateTime } from "@/lib/formatters";
import { safeDecodeURIComponent } from "@/lib/url";

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
    .select("id,status")
    .eq("id", sessionId)
    .single();
  if (!session || (session as { status?: string }).status !== "open") {
    redirect(`/inventory/count-initial/session/${sessionId}?error=` + encodeURIComponent("Sesión no encontrada o ya cerrada"));
  }

  const { error: closeErr } = await supabase.rpc("close_inventory_count_session", {
    p_session_id: sessionId,
    p_closed_by: user.id,
  });
  if (closeErr) {
    redirect(`/inventory/count-initial/session/${sessionId}?error=` + encodeURIComponent(closeErr.message));
  }

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
    .select("id,status")
    .eq("id", sessionId)
    .single();
  if (!session || (session as { status?: string }).status !== "closed") {
    redirect(`/inventory/count-initial/session/${sessionId}?error=` + encodeURIComponent("Sesión debe estar cerrada"));
  }

  const { error: applyErr } = await supabase.rpc("apply_inventory_count_adjustments", {
    p_session_id: sessionId,
    p_user_id: user.id,
  });
  if (applyErr) {
    redirect(`/inventory/count-initial/session/${sessionId}?error=` + encodeURIComponent(applyErr.message));
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
  input_quantity: number | null;
  input_unit_code: string | null;
  input_uom_profile_id: string | null;
  stock_unit_code: string | null;
  location_position_id: string | null;
  current_qty_at_open: number | null;
  current_qty_at_close: number | null;
  quantity_delta: number | null;
  adjustment_applied_at: string | null;
  product: { name: string | null; unit: string | null; stock_unit_code?: string | null } | null;
};
type LineEntryRow = {
  id: string;
  count_line_id: string;
  input_quantity: number | null;
  input_unit_code: string | null;
  input_uom_profile_id: string | null;
  quantity_counted: number | null;
  stock_unit_code: string | null;
  entry_order: number | null;
};
type PositionRow = { id: string; code: string | null; name: string | null; parent_position_id: string | null; sort_order: number | null };
type UomProfileRow = { id: string; label: string | null; input_unit_code: string | null };
type SiteRow = { id: string; name: string | null };
type LocRow = { id: string; code: string | null };

function formatQty(value: number) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 6,
  }).format(Number.isFinite(value) ? value : 0);
}

function basePositionLabel(position: PositionRow) {
  return String(position.name || position.code || position.id).trim();
}

function positionPathLabel(position: PositionRow, positionById: Map<string, PositionRow>) {
  const path: string[] = [];
  const visited = new Set<string>();
  let current: PositionRow | undefined = position;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(basePositionLabel(current));
    current = current.parent_position_id ? positionById.get(current.parent_position_id) : undefined;
  }

  return path.join(" / ");
}

export default async function CountSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase } = await requireAppAccess({
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
    .select("id,product_id,quantity_counted,input_quantity,input_unit_code,input_uom_profile_id,stock_unit_code,location_position_id,current_qty_at_open,current_qty_at_close,quantity_delta,adjustment_applied_at,product:products(name,unit,stock_unit_code)")
    .eq("session_id", id)
    .order("product_id", { ascending: true });
  const lineRows = (lines ?? []) as unknown as LineRow[];

  const { data: lineEntries } =
    lineRows.length > 0
      ? await supabase
        .from("inventory_count_line_entries")
        .select("id,count_line_id,input_quantity,input_unit_code,input_uom_profile_id,quantity_counted,stock_unit_code,entry_order")
        .eq("session_id", id)
        .order("entry_order", { ascending: true })
      : { data: [] as LineEntryRow[] };
  const lineEntryRows = (lineEntries ?? []) as LineEntryRow[];

  const { data: positionsData } =
    sess.scope_location_id
      ? await supabase
        .from("inventory_location_positions")
        .select("id,code,name,parent_position_id,sort_order")
        .eq("location_id", sess.scope_location_id)
      : { data: [] as PositionRow[] };

  const positionRows = (positionsData ?? []) as PositionRow[];
  const positionById = new Map(positionRows.map((position) => [position.id, position]));
  const positionLabelById = new Map(
    positionRows.map((position) => [
      position.id,
      positionPathLabel(position, positionById),
    ])
  );

  const uomProfileIds = Array.from(
    new Set([
      ...lineRows.map((line) => String(line.input_uom_profile_id ?? "").trim()).filter(Boolean),
      ...lineEntryRows.map((entry) => String(entry.input_uom_profile_id ?? "").trim()).filter(Boolean),
    ])
  );
  const { data: uomProfilesData } =
    uomProfileIds.length > 0
      ? await supabase
        .from("product_uom_profiles")
        .select("id,label,input_unit_code")
        .in("id", uomProfileIds)
      : { data: [] as UomProfileRow[] };
  const uomProfileById = new Map(
    ((uomProfilesData ?? []) as UomProfileRow[]).map((profile) => [profile.id, profile])
  );
  const entriesByLineId = new Map<string, LineEntryRow[]>();
  for (const entry of lineEntryRows) {
    const entries = entriesByLineId.get(entry.count_line_id) ?? [];
    entries.push(entry);
    entriesByLineId.set(entry.count_line_id, entries);
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

  const displayRows = lineRows
    .map((line) => {
      const current = isOpen
        ? Number(line.current_qty_at_open ?? 0)
        : Number(line.current_qty_at_close ?? 0);
      const counted = Number(line.quantity_counted ?? 0);
      const delta = isOpen ? counted - current : Number(line.quantity_delta ?? 0);
      const applied = Boolean(line.adjustment_applied_at);
      const positionLabel = line.location_position_id
        ? positionLabelById.get(line.location_position_id) ?? line.location_position_id.slice(0, 8)
        : "Sin ubicación interna";
      const stockUnit = line.stock_unit_code ?? line.product?.stock_unit_code ?? line.product?.unit ?? "-";
      const profile = line.input_uom_profile_id ? uomProfileById.get(line.input_uom_profile_id) : null;
      const physicalEntries = entriesByLineId.get(line.id) ?? [];
      const inputUnitLabel = physicalEntries.length > 1
        ? "Varias presentaciones"
        : String(profile?.label ?? "").trim() ||
          String(profile?.input_unit_code ?? line.input_unit_code ?? stockUnit).trim();
      const inputQty = Number(line.input_quantity ?? line.quantity_counted ?? 0);
      const physicalEntryLabels = physicalEntries.map((entry) => {
        const entryProfile = entry.input_uom_profile_id
          ? uomProfileById.get(entry.input_uom_profile_id)
          : null;
        const entryUnitLabel =
          String(entryProfile?.label ?? "").trim() ||
          String(entryProfile?.input_unit_code ?? entry.input_unit_code ?? stockUnit).trim();

        return {
          id: entry.id,
          inputQty: Number(entry.input_quantity ?? 0),
          inputUnitLabel: entryUnitLabel,
          baseQty: Number(entry.quantity_counted ?? 0),
          stockUnit: entry.stock_unit_code ?? stockUnit,
        };
      });

      return {
        line,
        productName: line.product?.name ?? line.product_id,
        stockUnit,
        positionLabel,
        counted,
        current,
        delta,
        applied,
        inputQty,
        inputUnitLabel,
        physicalEntryLabels,
      };
    })
    .sort((a, b) => {
      const positionDiff = a.positionLabel.localeCompare(b.positionLabel, "es", {
        numeric: true,
        sensitivity: "base",
      });
      if (positionDiff !== 0) return positionDiff;

      return a.productName.localeCompare(b.productName, "es", {
        numeric: true,
        sensitivity: "base",
      });
    });

  const pendingLines = displayRows.filter((row) => row.delta !== 0 && !row.applied).length;
  const appliedLines = displayRows.filter((row) => row.applied).length;
  const zeroDiffLines = displayRows.filter((row) => row.delta === 0).length;
  const totalPositiveDelta = displayRows.reduce((sum, row) => sum + Math.max(row.delta, 0), 0);
  const totalNegativeDelta = displayRows.reduce((sum, row) => sum + Math.min(row.delta, 0), 0);
  const statusLabel = isOpen ? "Abierta" : pendingLines > 0 ? "Cerrada, pendiente de aprobar" : "Cerrada sin pendientes";

  return (
    <div className="w-full space-y-6">
      <div>
        <Link href="/inventory/count-initial" className="ui-caption underline">
          Volver a conteos
        </Link>
        <h1 className="mt-2 ui-h1">
          Sesión de conteo - {sess.name ?? sess.id.slice(0, 8)}
        </h1>
        <p className="mt-2 ui-body-muted">
          Sede: {siteName} - Ámbito: {scopeLabel}
          {locCode ? ` (${locCode})` : ""} - Estado:{" "}
          <strong>{statusLabel}</strong>
        </p>
        <p className="mt-1 ui-caption">
          Creada: {formatHistoryDateTime(sess.created_at)}
          {sess.closed_at ? ` - Cerrada: ${formatHistoryDateTime(sess.closed_at)}` : ""}
        </p>
      </div>

      {sp.ok ? (
        <div className="ui-alert ui-alert--success">
          {sp.ok === "closed" ? "Conteo cerrado. Revisa diferencias y aprueba ajustes." : ""}
          {sp.ok === "adjusted" ? "Ajustes aplicados." : ""}
        </div>
      ) : null}
      {sp.error ? (
        <div className="ui-alert ui-alert--error">
          {safeDecodeURIComponent(sp.error)}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="ui-panel">
          <div className="ui-h3">Cómo leer este conteo</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--ui-muted)]">Abierta</div>
              <p className="mt-1 text-sm text-[var(--ui-text)]">Se capturó el conteo, pero todavía no recalcula contra el sistema.</p>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--ui-muted)]">Cerrada</div>
              <p className="mt-1 text-sm text-[var(--ui-text)]">Congela el saldo actual y muestra diferencias por producto y ubicación.</p>
            </div>
            <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-3">
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--ui-muted)]">Aprobada</div>
              <p className="mt-1 text-sm text-[var(--ui-text)]">Aplica los ajustes y crea movimientos de inventario trazables.</p>
            </div>
          </div>
          <p className="mt-3 ui-caption">
            Hoy el permiso <span className="font-mono">inventory.counts</span> permite crear, cerrar y aprobar. Si necesitas separación real, hay que crear permisos distintos para capturar, cerrar y aprobar.
          </p>
        </div>

        <div className="ui-panel">
          <div className="ui-h3">Resumen de diferencias</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="ui-caption">Pendientes</div>
              <div className="text-2xl font-black text-[var(--ui-text)]">{pendingLines}</div>
            </div>
            <div>
              <div className="ui-caption">Aplicadas</div>
              <div className="text-2xl font-black text-[var(--ui-text)]">{appliedLines}</div>
            </div>
            <div>
              <div className="ui-caption">Sin diferencia</div>
              <div className="text-2xl font-black text-[var(--ui-text)]">{zeroDiffLines}</div>
            </div>
            <div>
              <div className="ui-caption">Delta neto</div>
              <div className="text-2xl font-black text-[var(--ui-text)]">{formatQty(totalPositiveDelta + totalNegativeDelta)}</div>
            </div>
          </div>
        </div>
      </section>

      <div className="ui-panel">
        <div className="ui-h3">Líneas del conteo</div>
        <p className="mt-1 ui-caption">
          Ordenado por ubicación interna y luego por producto. La columna “Conteo físico” muestra el total base y, cuando aplica, el desglose físico capturado por presentación.
        </p>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Ubicación interna</TableHeaderCell>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>Unidad</TableHeaderCell>
                <TableHeaderCell>Conteo físico</TableHeaderCell>
                <TableHeaderCell>Actual en sistema</TableHeaderCell>
                <TableHeaderCell>Diferencia</TableHeaderCell>
                <TableHeaderCell>Ajuste</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                return (
                  <tr key={row.line.id} className="ui-body">
                    <TableCell>{row.positionLabel}</TableCell>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell>{row.stockUnit}</TableCell>
                    <TableCell>
                      <span className="font-mono">{formatQty(row.counted)} {row.stockUnit}</span>
                      {row.physicalEntryLabels.length > 0 ? (
                        <div className="mt-1 space-y-0.5 text-xs text-[var(--ui-muted)]">
                          {row.physicalEntryLabels.map((entry) => (
                            <div key={entry.id}>
                              {formatQty(entry.inputQty)} {entry.inputUnitLabel}
                              {" = "}
                              {formatQty(entry.baseQty)} {entry.stockUnit}
                            </div>
                          ))}
                        </div>
                      ) : row.inputUnitLabel ? (
                        <span className="ml-2 text-xs text-[var(--ui-muted)]">
                          ({formatQty(row.inputQty)} {row.inputUnitLabel})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono">{formatQty(row.current)} {row.stockUnit}</TableCell>
                    <TableCell className="font-mono">
                      {row.delta !== 0 ? (row.delta > 0 ? `+${formatQty(row.delta)}` : formatQty(row.delta)) : "0"} {row.stockUnit}
                    </TableCell>
                    <TableCell>{row.applied ? "Aplicado" : row.delta !== 0 ? "Pendiente" : "-"}</TableCell>
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
        {lines.length} linea(s) con diferencia. Al aprobar se generan movimientos de ajuste y se actualiza el stock.
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
