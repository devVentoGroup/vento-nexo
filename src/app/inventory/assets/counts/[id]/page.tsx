import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";

import { AssetCountLineActions } from "./asset-count-line-actions";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";

type SearchParams = {
  error?: string;
};

type CountSessionRow = {
  id: string;
  site_id: string;
  name: string | null;
  status: string | null;
  scope_type: string | null;
  scope_area_id: string | null;
  scope_location_id: string | null;
  scope_location_position_id: string | null;
  started_at: string | null;
  closed_at: string | null;
  notes: string | null;
  sites?: { id: string; name: string | null } | null;
};

type CountLineRow = {
  id: string;
  session_id: string;
  asset_item_id: string | null;
  asset_group_id: string | null;
  expected_qty: number | null;
  counted_qty: number | null;
  count_status: string | null;
  expected_site_id: string | null;
  expected_area_id: string | null;
  expected_location_id: string | null;
  expected_location_position_id: string | null;
  found_site_id: string | null;
  found_area_id: string | null;
  found_location_id: string | null;
  found_location_position_id: string | null;
  condition_status: string | null;
  scanned_qr_token: string | null;
  counted_by: string | null;
  counted_at: string | null;
  notes: string | null;
  asset_items?:
    | {
        id: string;
        product_id: string;
        asset_code: string | null;
        display_name: string | null;
        internal_plate: string | null;
        serial_number: string | null;
        brand: string | null;
        model: string | null;
        main_image_url: string | null;
        products?:
          | { id: string; name: string | null; sku: string | null }
          | Array<{ id: string; name: string | null; sku: string | null }>
          | null;
      }
    | Array<{
        id: string;
        product_id: string;
        asset_code: string | null;
        display_name: string | null;
        internal_plate: string | null;
        serial_number: string | null;
        brand: string | null;
        model: string | null;
        main_image_url: string | null;
        products?:
          | { id: string; name: string | null; sku: string | null }
          | Array<{ id: string; name: string | null; sku: string | null }>
          | null;
      }>
    | null;
  asset_groups?:
    | {
        id: string;
        product_id: string;
        group_code: string | null;
        name: string | null;
        unit_code: string | null;
        main_image_url: string | null;
        products?:
          | { id: string; name: string | null; sku: string | null }
          | Array<{ id: string; name: string | null; sku: string | null }>
          | null;
      }
    | Array<{
        id: string;
        product_id: string;
        group_code: string | null;
        name: string | null;
        unit_code: string | null;
        main_image_url: string | null;
        products?:
          | { id: string; name: string | null; sku: string | null }
          | Array<{ id: string; name: string | null; sku: string | null }>
          | null;
      }>
    | null;
};

type SiteRow = {
  id: string;
  name: string | null;
};

type AreaRow = {
  id: string;
  site_id: string;
  name: string | null;
  kind: string | null;
};

type LocationRow = {
  id: string;
  site_id: string;
  area_id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
};

type PositionRow = {
  id: string;
  site_id: string;
  location_id: string;
  code: string | null;
  name: string | null;
  kind: string | null;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableUuid(value: FormDataEntryValue | null) {
  const text = asText(value);
  return text || null;
}

function asNullableNumber(value: FormDataEntryValue | null) {
  const text = asText(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildCountReturn(sessionId: string, error?: string) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  const qs = params.toString();
  return qs ? `/inventory/assets/counts/${sessionId}?${qs}` : `/inventory/assets/counts/${sessionId}`;
}

function fmtQty(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function statusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "closed") return "Cerrada";
  if (raw === "cancelled") return "Cancelada";
  return "Abierta";
}

function statusClassName(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "closed") return "ui-chip ui-chip--success";
  if (raw === "cancelled") return "ui-chip ui-chip--danger";
  return "ui-chip ui-chip--warn";
}

function countStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "found") return "Encontrado";
  if (raw === "missing") return "Faltante";
  if (raw === "found_elsewhere") return "En otro LOC";
  if (raw === "damaged") return "Dañado";
  if (raw === "extra") return "Extra";
  if (raw === "not_applicable") return "No aplica";
  return "Pendiente";
}

function countStatusClassName(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "found") return "ui-chip ui-chip--success";
  if (raw === "missing" || raw === "damaged") return "ui-chip ui-chip--danger";
  if (raw === "found_elsewhere" || raw === "extra") return "ui-chip ui-chip--warn";
  if (raw === "not_applicable") return "ui-chip";
  return "ui-chip";
}

function conditionStatusLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "nuevo") return "Nuevo";
  if (raw === "regular") return "Regular";
  if (raw === "malo") return "Malo";
  if (raw === "critico") return "Crítico";
  return "Bueno";
}

function scopeLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw === "area") return "Área";
  if (raw === "loc") return "LOC";
  if (raw === "position") return "Ubicación interna";
  return "Sede";
}

function oneRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function lineAssetItem(line: CountLineRow) {
  return oneRelation(line.asset_items);
}

function lineAssetGroup(line: CountLineRow) {
  return oneRelation(line.asset_groups);
}

function lineProduct(
  value:
    | { products?: { id: string; name: string | null; sku: string | null } | Array<{ id: string; name: string | null; sku: string | null }> | null }
    | null
    | undefined
) {
  return oneRelation(value?.products);
}

function lineHref(line: CountLineRow) {
  if (line.asset_item_id) return `/inventory/assets/items/${line.asset_item_id}`;
  if (line.asset_group_id) return `/inventory/assets/groups/${line.asset_group_id}`;
  return "";
}

function lineSubjectLabel(line: CountLineRow) {
  if (line.asset_item_id) {
    const item = lineAssetItem(line);
    const product = lineProduct(item);

    return item?.display_name ||
      product?.name ||
      item?.asset_code ||
      "Activo individual";
  }

  const group = lineAssetGroup(line);
  const product = lineProduct(group);

  return group?.name ||
    product?.name ||
    group?.group_code ||
    "Por cantidad";
}

function lineSubjectCode(line: CountLineRow) {
  if (line.asset_item_id) {
    const item = lineAssetItem(line);

    return [
      item?.asset_code,
      item?.internal_plate ? `Placa ${item.internal_plate}` : "",
      item?.serial_number ? `Serial ${item.serial_number}` : "",
    ].filter(Boolean).join(" · ");
  }

  const group = lineAssetGroup(line);
  const product = lineProduct(group);

  return [
    group?.group_code,
    product?.sku ? `SKU ${product.sku}` : "",
  ].filter(Boolean).join(" · ");
}

function lineImageUrl(line: CountLineRow) {
  const item = lineAssetItem(line);
  const group = lineAssetGroup(line);
  return String(item?.main_image_url ?? group?.main_image_url ?? "").trim();
}

function lineTypeLabel(line: CountLineRow) {
  return line.asset_item_id ? "Individual" : "Grupo";
}

function locationName(
  ids: {
    siteId?: string | null;
    areaId?: string | null;
    locationId?: string | null;
    positionId?: string | null;
  },
  maps: {
    siteById: Map<string, SiteRow>;
    areaById: Map<string, AreaRow>;
    locationById: Map<string, LocationRow>;
    positionById: Map<string, PositionRow>;
  }
) {
  const site = ids.siteId ? maps.siteById.get(ids.siteId)?.name : "";
  const area = ids.areaId ? maps.areaById.get(ids.areaId)?.name ?? maps.areaById.get(ids.areaId)?.kind : "";
  const location = ids.locationId ? maps.locationById.get(ids.locationId) : null;
  const position = ids.positionId ? maps.positionById.get(ids.positionId) : null;
  const loc = location ? [location.code, location.zone].filter(Boolean).join(" - ") : "";
  const pos = position ? [position.name, position.code].filter(Boolean).join(" · ") : "";

  const parts = [site, area, loc, pos].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sin ubicación";
}

function countProgress(lines: CountLineRow[]) {
  const total = lines.length;
  const done = lines.filter((line) => String(line.count_status ?? "pending") !== "pending").length;
  const found = lines.filter((line) => line.count_status === "found").length;
  const missing = lines.filter((line) => line.count_status === "missing").length;
  const damaged = lines.filter((line) => line.count_status === "damaged").length;
  const elsewhere = lines.filter((line) => line.count_status === "found_elsewhere").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, found, missing, damaged, elsewhere, pct };
}

function normalizeCountStatus(value: string) {
  const allowed = new Set([
    "pending",
    "found",
    "missing",
    "found_elsewhere",
    "damaged",
    "extra",
    "not_applicable",
  ]);

  return allowed.has(value) ? value : "pending";
}

function countStatusMustBeZero(status: string) {
  return status === "pending" || status === "missing" || status === "not_applicable";
}

function countStatusNeedsFoundLocation(status: string) {
  return status === "found_elsewhere" || status === "extra";
}

function resolveCountedQty({
  countStatus,
  countedQty,
  expectedQty,
  isGroup,
}: {
  countStatus: string;
  countedQty: number | null;
  expectedQty: number | null;
  isGroup: boolean;
}) {
  if (countStatusMustBeZero(countStatus)) return 0;

  const safeCountedQty =
    countedQty == null || !Number.isFinite(Number(countedQty)) || Number(countedQty) < 0
      ? null
      : Number(countedQty);

  if (countStatus === "found" || countStatus === "found_elsewhere" || countStatus === "damaged") {
    if (safeCountedQty != null) return safeCountedQty;
    return isGroup ? Number(expectedQty ?? 0) : 1;
  }

  if (countStatus === "extra") {
    return safeCountedQty ?? 1;
  }

  return safeCountedQty ?? 0;
}

async function updateAssetCountLine(formData: FormData) {
  "use server";

  const sessionId = asText(formData.get("session_id"));
  const lineId = asText(formData.get("line_id"));
  if (!sessionId || !lineId) {
    redirect("/inventory/assets/counts");
  }

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/assets/counts/${sessionId}`,
    permissionCode: PERMISSION,
  });

  const { data: session } = await supabase
    .from("asset_count_sessions")
    .select("id,status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    redirect("/inventory/assets/counts");
  }

  if (session.status !== "open") {
    redirect(buildCountReturn(sessionId, "Solo puedes editar líneas de una sesión abierta."));
  }

  const countStatus = normalizeCountStatus(asText(formData.get("count_status")) || "pending");
  const countedQty = asNullableNumber(formData.get("counted_qty"));
  const { data: line } = await supabase
    .from("asset_count_lines")
    .select("id,asset_item_id,asset_group_id,expected_qty")
    .eq("id", lineId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!line) {
    redirect(buildCountReturn(sessionId, "La línea de conteo no existe o no pertenece a esta sesión."));
  }

  const shouldKeepFoundLocation = countStatusNeedsFoundLocation(countStatus);
  const foundSiteId = shouldKeepFoundLocation ? asNullableUuid(formData.get("found_site_id")) : null;
  const foundAreaId = shouldKeepFoundLocation ? asNullableUuid(formData.get("found_area_id")) : null;
  const foundLocationId = shouldKeepFoundLocation ? asNullableUuid(formData.get("found_location_id")) : null;
  const foundPositionId = shouldKeepFoundLocation ? asNullableUuid(formData.get("found_location_position_id")) : null;

  if (foundPositionId && !foundLocationId) {
    redirect(buildCountReturn(sessionId, "Si marcas ubicación interna encontrada, también debes marcar LOC encontrado."));
  }

  if (foundLocationId) {
    const { data: location } = await supabase
      .from("inventory_locations")
      .select("id,site_id,area_id")
      .eq("id", foundLocationId)
      .maybeSingle();

    if (!location) {
      redirect(buildCountReturn(sessionId, "El LOC encontrado no existe."));
    }

    if (foundSiteId && location.site_id !== foundSiteId) {
      redirect(buildCountReturn(sessionId, "El LOC encontrado no pertenece a la sede marcada."));
    }

    if (foundAreaId && location.area_id !== foundAreaId) {
      redirect(buildCountReturn(sessionId, "El LOC encontrado no pertenece al área marcada."));
    }
  }

  if (foundPositionId) {
    const { data: position } = await supabase
      .from("inventory_location_positions")
      .select("id,site_id,location_id")
      .eq("id", foundPositionId)
      .maybeSingle();

    if (!position) {
      redirect(buildCountReturn(sessionId, "La ubicación interna encontrada no existe."));
    }

    if (position.location_id !== foundLocationId) {
      redirect(buildCountReturn(sessionId, "La ubicación interna encontrada no pertenece al LOC marcado."));
    }

    if (foundSiteId && position.site_id !== foundSiteId) {
      redirect(buildCountReturn(sessionId, "La ubicación interna encontrada no pertenece a la sede marcada."));
    }
  }

  const nextQty = resolveCountedQty({
    countStatus,
    countedQty,
    expectedQty: Number(line.expected_qty ?? 0),
    isGroup: Boolean(line.asset_group_id),
  });

  const { error } = await supabase
    .from("asset_count_lines")
    .update({
      count_status: countStatus,
      counted_qty: nextQty,
      condition_status: asText(formData.get("condition_status")) || null,
      found_site_id: foundSiteId,
      found_area_id: foundAreaId,
      found_location_id: foundLocationId,
      found_location_position_id: foundPositionId,
      notes: asText(formData.get("notes")) || null,
      counted_by: user.id,
      counted_at: new Date().toISOString(),
    })
    .eq("id", lineId)
    .eq("session_id", sessionId);

  if (error) {
    redirect(buildCountReturn(sessionId, error.message || "No se pudo actualizar la línea."));
  }

  revalidatePath(`/inventory/assets/counts/${sessionId}`);
  revalidatePath("/inventory/assets/counts");
  redirect(`/inventory/assets/counts/${sessionId}`);
}

async function closeAssetCountSession(formData: FormData) {
  "use server";

  const sessionId = asText(formData.get("session_id"));
  if (!sessionId) {
    redirect("/inventory/assets/counts");
  }

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/assets/counts/${sessionId}`,
    permissionCode: PERMISSION,
  });

  const [anyLinesRes, pendingLinesRes] = await Promise.all([
    supabase
      .from("asset_count_lines")
      .select("id")
      .eq("session_id", sessionId)
      .limit(1),
    supabase
      .from("asset_count_lines")
      .select("id")
      .eq("session_id", sessionId)
      .eq("count_status", "pending")
      .limit(1),
  ]);

  if (anyLinesRes.error) {
    redirect(buildCountReturn(sessionId, anyLinesRes.error.message || "No se pudieron validar las líneas del conteo."));
  }

  if ((anyLinesRes.data ?? []).length === 0) {
    redirect(buildCountReturn(sessionId, "No puedes cerrar un conteo sin líneas."));
  }

  if (pendingLinesRes.error) {
    redirect(buildCountReturn(sessionId, pendingLinesRes.error.message || "No se pudieron validar las líneas pendientes."));
  }

  if ((pendingLinesRes.data ?? []).length > 0) {
    redirect(buildCountReturn(sessionId, "No puedes cerrar el conteo mientras existan líneas pendientes."));
  }

  const { error } = await supabase
    .from("asset_count_sessions")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: user.id,
    })
    .eq("id", sessionId);

  if (error) {
    redirect(buildCountReturn(sessionId, error.message || "No se pudo cerrar la sesión."));
  }

  revalidatePath(`/inventory/assets/counts/${sessionId}`);
  revalidatePath("/inventory/assets/counts");
  redirect(`/inventory/assets/counts/${sessionId}`);
}

async function cancelAssetCountSession(formData: FormData) {
  "use server";

  const sessionId = asText(formData.get("session_id"));
  if (!sessionId) {
    redirect("/inventory/assets/counts");
  }

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/assets/counts/${sessionId}`,
    permissionCode: PERMISSION,
  });

  const { error } = await supabase
    .from("asset_count_sessions")
    .update({
      status: "cancelled",
      closed_at: new Date().toISOString(),
      closed_by: user.id,
    })
    .eq("id", sessionId);

  if (error) {
    redirect(buildCountReturn(sessionId, error.message || "No se pudo cancelar la sesión."));
  }

  revalidatePath(`/inventory/assets/counts/${sessionId}`);
  revalidatePath("/inventory/assets/counts");
  redirect(`/inventory/assets/counts/${sessionId}`);
}

export default async function AssetCountSessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMsg = String(sp.error ?? "").trim();

  const { supabase } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/assets/counts/${id}`,
    permissionCode: PERMISSION,
  });

  const [
    sessionRes,
    linesRes,
    sitesRes,
    areasRes,
    locationsRes,
    positionsRes,
  ] = await Promise.all([
    supabase
      .from("asset_count_sessions")
      .select("id,site_id,name,status,scope_type,scope_area_id,scope_location_id,scope_location_position_id,started_at,closed_at,notes,sites(id,name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("asset_count_lines")
      .select("id,session_id,asset_item_id,asset_group_id,expected_qty,counted_qty,count_status,expected_site_id,expected_area_id,expected_location_id,expected_location_position_id,found_site_id,found_area_id,found_location_id,found_location_position_id,condition_status,scanned_qr_token,counted_by,counted_at,notes,asset_items(id,product_id,asset_code,display_name,internal_plate,serial_number,brand,model,main_image_url,products(id,name,sku)),asset_groups(id,product_id,group_code,name,unit_code,main_image_url,products(id,name,sku))")
      .eq("session_id", id)
      .order("count_status", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("sites")
      .select("id,name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("areas")
      .select("id,site_id,name,kind")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("inventory_locations")
      .select("id,site_id,area_id,code,zone,description")
      .eq("is_active", true)
      .order("code", { ascending: true }),
    supabase
      .from("inventory_location_positions")
      .select("id,site_id,location_id,code,name,kind")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  if (sessionRes.error || !sessionRes.data) {
    notFound();
  }

  const session = sessionRes.data as unknown as CountSessionRow;
  const lines = (linesRes.data ?? []) as unknown as CountLineRow[];
  const sites = (sitesRes.data ?? []) as SiteRow[];
  const areas = (areasRes.data ?? []) as AreaRow[];
  const locations = (locationsRes.data ?? []) as LocationRow[];
  const positions = (positionsRes.data ?? []) as PositionRow[];

  const maps = {
    siteById: new Map(sites.map((site) => [site.id, site])),
    areaById: new Map(areas.map((area) => [area.id, area])),
    locationById: new Map(locations.map((location) => [location.id, location])),
    positionById: new Map(positions.map((position) => [position.id, position])),
  };

  const progress = countProgress(lines);
  const sessionOpen = session.status === "open";

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.35fr_0.75fr] lg:items-start">
          <div className="space-y-4">
            <div className="space-y-2">
              <Link
                href="/inventory/assets/counts"
                className="ui-btn ui-btn--ghost inline-flex h-12 items-center px-5 text-base font-semibold"
              >
                ← Conteos
              </Link>
              <h1 className="ui-h1">{session.name || "Conteo de activos"}</h1>
              <p className="ui-body-muted">
                Revisa cada activo esperado y marca si fue encontrado, faltante, dañado o encontrado en otra ubicación.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={statusClassName(session.status)}>{statusLabel(session.status)}</span>
              <span className="ui-chip">{scopeLabel(session.scope_type)}</span>
              <span className="ui-chip">{session.sites?.name || session.site_id}</span>
            </div>
          </div>

          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone={progress.pct === 100 ? "success" : "warm"}>
              <div className="ui-remission-kpi-label">Progreso</div>
              <div className="ui-remission-kpi-value">{progress.pct}%</div>
              <div className="ui-remission-kpi-note">{progress.done}/{progress.total} líneas revisadas</div>
            </article>
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Encontrados</div>
              <div className="ui-remission-kpi-value">{progress.found}</div>
              <div className="ui-remission-kpi-note">Coinciden con el conteo</div>
            </article>
            <article className="ui-remission-kpi" data-tone={progress.missing + progress.damaged > 0 ? "danger" : "cool"}>
              <div className="ui-remission-kpi-label">Alertas</div>
              <div className="ui-remission-kpi-value">{progress.missing + progress.damaged + progress.elsewhere}</div>
              <div className="ui-remission-kpi-note">faltantes, dañados o en otro LOC</div>
            </article>
          </div>
        </div>
      </section>

      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}

      {linesRes.error ? (
        <div className="ui-alert ui-alert--error">
          No se pudieron leer las líneas del conteo: {linesRes.error.message}
        </div>
      ) : null}

      <section className="ui-panel">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="ui-label">Inicio</div>
            <div className="mt-1 font-semibold text-[var(--ui-text)]">{fmtDateTime(session.started_at)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="ui-label">Cierre</div>
            <div className="mt-1 font-semibold text-[var(--ui-text)]">{fmtDateTime(session.closed_at)}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="ui-label">Alcance esperado</div>
            <div className="mt-1 font-semibold text-[var(--ui-text)]">
              {locationName(
                {
                  siteId: session.site_id,
                  areaId: session.scope_area_id,
                  locationId: session.scope_location_id,
                  positionId: session.scope_location_position_id,
                },
                maps
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="ui-label">Notas</div>
            <div className="mt-1 font-semibold text-[var(--ui-text)]">{session.notes || "-"}</div>
          </div>
        </div>

        {sessionOpen ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={closeAssetCountSession}>
              <input type="hidden" name="session_id" value={session.id} />
              <button type="submit" className="ui-btn ui-btn--brand" disabled={progress.total === 0 || progress.done < progress.total}>
                Cerrar conteo
              </button>
            </form>
            <form action={cancelAssetCountSession}>
              <input type="hidden" name="session_id" value={session.id} />
              <button type="submit" className="ui-btn ui-btn--ghost">
                Cancelar conteo
              </button>
            </form>
          </div>
        ) : null}

        {sessionOpen && progress.total === 0 ? (
          <div className="ui-alert ui-alert--warn mt-4">
            Esta sesión no tiene líneas. No se puede cerrar hasta crear una sesión con activos dentro del alcance.
          </div>
        ) : null}

        {sessionOpen && progress.total > 0 && progress.done < progress.total ? (
          <div className="ui-alert ui-alert--warn mt-4">
            Para cerrar el conteo debes resolver todas las líneas pendientes.
          </div>
        ) : null}
      </section>

      <section className="ui-panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="ui-h2">Líneas de conteo</h2>
            <p className="mt-2 ui-body-muted">
              Activos individuales se cuentan por unidad. Los activos repetidos se cuentan por cantidad.
            </p>
          </div>
          <span className="ui-chip">{lines.length} líneas</span>
        </div>

        <div className="mt-4 grid gap-4">
          {lines.map((line) => {
            const imageUrl = lineImageUrl(line);
            const expectedLocation = locationName(
              {
                siteId: line.expected_site_id,
                areaId: line.expected_area_id,
                locationId: line.expected_location_id,
                positionId: line.expected_location_position_id,
              },
              maps
            );
            const foundLocation = locationName(
              {
                siteId: line.found_site_id,
                areaId: line.found_area_id,
                locationId: line.found_location_id,
                positionId: line.found_location_position_id,
              },
              maps
            );

            return (
              <article key={line.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
                  <div className="flex gap-4">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="" className="h-20 w-20 rounded-2xl object-cover" />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 text-xs font-bold text-slate-500">
                        {line.asset_item_id ? "ACT" : "GRP"}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <span className="ui-chip">{lineTypeLabel(line)}</span>
                        <span className={countStatusClassName(line.count_status)}>
                          {countStatusLabel(line.count_status)}
                        </span>
                        {line.condition_status ? (
                          <span className="ui-chip">{conditionStatusLabel(line.condition_status)}</span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-lg font-black text-[var(--ui-text)]">{lineSubjectLabel(line)}</h3>
                      <p className="mt-1 text-xs text-[var(--ui-muted)]">{lineSubjectCode(line) || "Sin código"}</p>
                      {lineHref(line) ? (
                        <Link href={lineHref(line)} className="mt-2 inline-flex text-xs font-semibold text-cyan-700 hover:underline">
                          Abrir ficha técnica →
                        </Link>
                      ) : null}
                      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                        <div>
                          <div className="ui-label">Ubicación esperada</div>
                          <div className="mt-1 text-[var(--ui-text)]">{expectedLocation}</div>
                        </div>
                        <div>
                          <div className="ui-label">Ubicación encontrada</div>
                          <div className="mt-1 text-[var(--ui-text)]">
                            {line.found_site_id || line.found_location_id || line.found_location_position_id ? foundLocation : "-"}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 text-sm text-[var(--ui-muted)]">
                        Esperado: <strong>{fmtQty(line.expected_qty)}</strong> · Contado: <strong>{fmtQty(line.counted_qty)}</strong>
                      </div>
                      {line.notes ? (
                        <div className="mt-2 text-sm text-[var(--ui-muted)]">{line.notes}</div>
                      ) : null}
                    </div>
                  </div>

                  <AssetCountLineActions
                    action={updateAssetCountLine}
                    disabled={!sessionOpen}
                    sessionId={session.id}
                    line={{
                      id: line.id,
                      expected_qty: line.expected_qty,
                      counted_qty: line.counted_qty,
                      count_status: line.count_status,
                      condition_status: line.condition_status,
                      found_site_id: line.found_site_id,
                      found_area_id: line.found_area_id,
                      found_location_id: line.found_location_id,
                      found_location_position_id: line.found_location_position_id,
                      notes: line.notes,
                      is_group: Boolean(line.asset_group_id),
                    }}
                    sites={sites}
                    areas={areas}
                    locations={locations}
                    positions={positions}
                  />
                </div>
              </article>
            );
          })}

          {lines.length === 0 ? (
            <div className="ui-empty">
              Esta sesión no tiene líneas. Revisa si existen activos activos dentro del alcance elegido.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
