import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { Table, TableCell, TableHeaderCell } from "@/components/vento/standard/table";
import { requireAppAccess } from "@/lib/auth/guard";
import { safeDecodeURIComponent } from "@/lib/url";

export const dynamic = "force-dynamic";

type Params = { id: string };
type SearchParams = {
  assigned?: string;
  created?: string;
  updated?: string;
  error?: string;
};

type LocationRow = {
  id: string;
  code: string | null;
  zone: string | null;
  description: string | null;
  site_id: string | null;
};

type SiteRow = {
  id: string;
  name: string | null;
};

type PositionRow = {
  id: string;
  location_id: string;
  parent_position_id: string | null;
  code: string;
  name: string;
  kind: string;
  sort_order: number | null;
};

type LocationStockRow = {
  product_id: string;
  current_qty: number | null;
  updated_at: string | null;
  products:
    | {
        id: string;
        name: string | null;
        stock_unit_code: string | null;
        unit: string | null;
      }
    | Array<{
        id: string;
        name: string | null;
        stock_unit_code: string | null;
        unit: string | null;
      }>
    | null;
};

type PositionStockRow = {
  position_id: string;
  product_id: string;
  current_qty: number | null;
  updated_at: string | null;
};

function normalizeProduct(
  value: LocationStockRow["products"]
): { id: string; name: string | null; stock_unit_code: string | null; unit: string | null } | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parseQuantity(value: FormDataEntryValue | null): number {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQty(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(n);
}

function buildLocTitle(loc: LocationRow) {
  return String(loc.description ?? "").trim() || String(loc.zone ?? "").trim() || String(loc.code ?? "").trim() || loc.id;
}

function buildPositionLabels(positions: PositionRow[]) {
  const byId = new Map(positions.map((position) => [position.id, position]));
  const labelById = new Map<string, string>();

  function labelFor(position: PositionRow): string {
    if (labelById.has(position.id)) return labelById.get(position.id)!;
    const self = String(position.name || position.code).trim();
    const parent = position.parent_position_id ? byId.get(position.parent_position_id) : null;
    const label = parent ? `${labelFor(parent)} / ${self}` : self;
    labelById.set(position.id, label);
    return label;
  }

  for (const position of positions) labelFor(position);
  return labelById;
}

async function assignPositionAction(formData: FormData) {
  "use server";

  const locationId = String(formData.get("location_id") ?? "").trim();
  const productId = String(formData.get("product_id") ?? "").trim();
  const positionId = String(formData.get("position_id") ?? "").trim();
  const quantity = parseQuantity(formData.get("quantity"));
  const returnTo = `/inventory/locations/${encodeURIComponent(locationId)}/positions`;

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo,
    permissionCode: "inventory.stock",
  });

  if (!locationId || !productId || !positionId || quantity <= 0) {
    redirect(`${returnTo}?error=${encodeURIComponent("Completa producto, posicion y cantidad mayor a cero.")}`);
  }

  const { error } = await supabase.rpc("assign_inventory_stock_to_position", {
    p_location_id: locationId,
    p_product_id: productId,
    p_position_id: positionId,
    p_quantity: quantity,
    p_created_by: user.id,
    p_note: null,
  });

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(returnTo);
  revalidatePath(`/inventory/locations/${encodeURIComponent(locationId)}`);
  revalidatePath(`/inventory/locations/${encodeURIComponent(locationId)}/board`);
  redirect(`${returnTo}?assigned=1`);
}

async function createPositionAction(formData: FormData) {
  "use server";

  const locationId = String(formData.get("location_id") ?? "").trim();
  const parentPositionId = String(formData.get("parent_position_id") ?? "").trim() || null;
  const kind = String(formData.get("kind") ?? "shelf").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase().replace(/\s+/g, "-");
  const name = String(formData.get("name") ?? "").trim();
  const sortOrder = Number(String(formData.get("sort_order") ?? "0").trim() || "0");
  const returnTo = `/inventory/locations/${encodeURIComponent(locationId)}/positions`;

  const { supabase } = await requireAppAccess({
    appId: "nexo",
    returnTo,
    permissionCode: "inventory.stock",
  });

  if (!locationId || !code || !name) {
    redirect(`${returnTo}?error=${encodeURIComponent("Completa codigo y nombre de la posicion interna.")}`);
  }

  const { data: location } = await supabase
    .from("inventory_locations")
    .select("id,site_id")
    .eq("id", locationId)
    .eq("is_active", true)
    .maybeSingle();

  const siteId = String((location as { site_id?: string | null } | null)?.site_id ?? "");
  if (!siteId) {
    redirect(`${returnTo}?error=${encodeURIComponent("LOC no encontrado.")}`);
  }

  const { error } = await supabase.from("inventory_location_positions").insert({
    site_id: siteId,
    location_id: locationId,
    parent_position_id: parentPositionId,
    code,
    name,
    kind,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    is_active: true,
  });

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(returnTo);
  redirect(`${returnTo}?created=1`);
}

async function updatePositionNameAction(formData: FormData) {
  "use server";

  const locationId = String(formData.get("location_id") ?? "").trim();
  const positionId = String(formData.get("position_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const returnTo = `/inventory/locations/${encodeURIComponent(locationId)}/positions`;

  const { supabase } = await requireAppAccess({
    appId: "nexo",
    returnTo,
    permissionCode: "inventory.stock",
  });

  if (!locationId || !positionId || !name) {
    redirect(`${returnTo}?error=${encodeURIComponent("Falta posicion o nombre.")}`);
  }

  const { error } = await supabase
    .from("inventory_location_positions")
    .update({ name })
    .eq("id", positionId)
    .eq("location_id", locationId);

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(returnTo);
  revalidatePath(`/inventory/locations/${encodeURIComponent(locationId)}/board`);
  redirect(`${returnTo}?updated=1`);
}

export default async function LocationPositionsPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? safeDecodeURIComponent(sp.error) : "";

  const { supabase } = await requireAppAccess({
    appId: "nexo",
    returnTo: `/inventory/locations/${id}/positions`,
    permissionCode: "inventory.stock",
  });

  const { data: locationData } = await supabase
    .from("inventory_locations")
    .select("id,code,zone,description,site_id")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  const location = (locationData ?? null) as LocationRow | null;
  if (!location) notFound();

  const { data: siteData } = location.site_id
    ? await supabase.from("sites").select("id,name").eq("id", location.site_id).maybeSingle()
    : { data: null };
  const site = (siteData ?? null) as SiteRow | null;

  const { data: positionsData } = await supabase
    .from("inventory_location_positions")
    .select("id,location_id,parent_position_id,code,name,kind,sort_order")
    .eq("location_id", id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  const positions = (positionsData ?? []) as PositionRow[];
  const positionLabels = buildPositionLabels(positions);

  const { data: locationStockData } = await supabase
    .from("inventory_stock_by_location")
    .select("product_id,current_qty,updated_at,products(id,name,stock_unit_code,unit)")
    .eq("location_id", id)
    .neq("current_qty", 0)
    .order("updated_at", { ascending: false });

  const locationStockRows = (locationStockData ?? []) as unknown as LocationStockRow[];
  const productIds = locationStockRows.map((row) => row.product_id);
  const positionIds = positions.map((position) => position.id);

  const { data: positionStockData } =
    positionIds.length > 0 && productIds.length > 0
      ? await supabase
          .from("inventory_stock_by_position")
          .select("position_id,product_id,current_qty,updated_at")
          .in("position_id", positionIds)
          .in("product_id", productIds)
          .neq("current_qty", 0)
      : { data: [] as PositionStockRow[] };
  const positionStockRows = (positionStockData ?? []) as PositionStockRow[];

  const positionedByProduct = new Map<string, number>();
  const positionLinesByProduct = new Map<string, string[]>();
  for (const row of positionStockRows) {
    const qty = Number(row.current_qty ?? 0);
    positionedByProduct.set(row.product_id, (positionedByProduct.get(row.product_id) ?? 0) + qty);
    const label = positionLabels.get(row.position_id) ?? row.position_id.slice(0, 8);
    const lines = positionLinesByProduct.get(row.product_id) ?? [];
    lines.push(`${label}: ${formatQty(qty)}`);
    positionLinesByProduct.set(row.product_id, lines);
  }

  const assignableRows = locationStockRows
    .map((row) => {
      const product = normalizeProduct(row.products);
      const total = Number(row.current_qty ?? 0);
      const positioned = Number(positionedByProduct.get(row.product_id) ?? 0);
      const unpositioned = Math.max(0, total - positioned);
      return {
        productId: row.product_id,
        productName: product?.name ?? row.product_id,
        unit: product?.stock_unit_code ?? product?.unit ?? "un",
        total,
        positioned,
        unpositioned,
        positionLines: positionLinesByProduct.get(row.product_id) ?? [],
      };
    })
    .filter((row) => row.total !== 0);

  const locTitle = buildLocTitle(location);
  const topLevelPositions = positions.filter((position) => !position.parent_position_id);
  const childrenByParentId = new Map<string, PositionRow[]>();
  for (const position of positions) {
    if (!position.parent_position_id) continue;
    const rows = childrenByParentId.get(position.parent_position_id) ?? [];
    rows.push(position);
    childrenByParentId.set(position.parent_position_id, rows);
  }
  const visibleTopLevelPositions = topLevelPositions.slice(0, 12);
  const hiddenTopLevelCount = Math.max(0, topLevelPositions.length - visibleTopLevelPositions.length);

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <Link href={`/inventory/locations/${encodeURIComponent(id)}`} className="ui-caption underline">
              Volver al LOC
            </Link>
            <div className="space-y-2">
              <div className="ui-caption">Ubicacion interna</div>
              <h1 className="ui-h1">Detalle interno de bodega</h1>
              <p className="ui-body-muted">
                Ubica el inventario que ya esta en {locTitle} dentro de estanterias o niveles internos. Esto no cambia
                el total del LOC ni el flujo operativo: el retiro sigue entrando por el QR de bodega principal.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {site?.name ? <span className="ui-chip">{site.name}</span> : null}
              {location.code ? <span className="ui-chip">{location.code}</span> : null}
              {location.zone ? <span className="ui-chip">Zona {location.zone}</span> : null}
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="warm">
              <div className="ui-remission-kpi-label">Posiciones</div>
              <div className="ui-remission-kpi-value">{positions.length}</div>
              <div className="ui-remission-kpi-note">Solo para vistas internas y reportes</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Productos</div>
              <div className="ui-remission-kpi-value">{assignableRows.length}</div>
              <div className="ui-remission-kpi-note">Con stock en este LOC</div>
            </article>
          </div>
        </div>
      </section>

      {sp.assigned === "1" ? (
        <div className="ui-alert ui-alert--success">Stock asignado a posicion interna.</div>
      ) : null}
      {sp.created === "1" ? (
        <div className="ui-alert ui-alert--success">Posicion interna creada.</div>
      ) : null}
      {sp.updated === "1" ? (
        <div className="ui-alert ui-alert--success">Nombre interno actualizado.</div>
      ) : null}
      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}

      {positions.length === 0 ? (
        <div className="ui-alert ui-alert--warn">
          Este LOC no tiene estanterias o niveles configurados. Primero crea posiciones internas para usar este filtro interno.
        </div>
      ) : null}

      <section className="ui-panel ui-remission-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Denominaciones internas</div>
            <div className="mt-1 ui-body-muted">
              Crea nombres como Estanteria 01, Nivel 03 o Zona empaques. No generan QR operativo.
            </div>
          </div>
          <span className="ui-chip">{positions.length} posiciones</span>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(520px,1.2fr)]">
          <form action={createPositionAction} className="ui-panel-soft space-y-3 p-4">
            <input type="hidden" name="location_id" value={id} />
            <div className="ui-h3 text-base">Nueva posicion</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Tipo</span>
                <select name="kind" className="ui-input" defaultValue="shelf">
                  <option value="shelf">Estanteria</option>
                  <option value="level">Nivel</option>
                  <option value="zone">Zona interna</option>
                  <option value="bin">Contenedor</option>
                  <option value="section">Seccion</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Depende de</span>
                <select name="parent_position_id" className="ui-input" defaultValue="">
                  <option value="">Directo dentro del LOC</option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {positionLabels.get(position.id) ?? position.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Codigo</span>
                <input name="code" className="ui-input" placeholder="EST-13 o NIVEL-02" required />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Orden</span>
                <input name="sort_order" type="number" className="ui-input" defaultValue={positions.length + 1} />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="ui-label">Nombre visible</span>
                <input name="name" className="ui-input" placeholder="Estanteria 13 / Nivel 02 / Zona harinas" required />
              </label>
            </div>
            <button className="ui-btn ui-btn--brand" type="submit">
              Crear posicion interna
            </button>
          </form>

          <div className="rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-bg-soft)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="ui-h3 text-base">Mapa interno</div>
                <div className="mt-1 ui-caption">
                  Estanterias como grupos. Niveles y zonas aparecen dentro de cada una.
                </div>
              </div>
              <span className="ui-chip">{topLevelPositions.length} grupos</span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {visibleTopLevelPositions.map((position) => {
                const children = childrenByParentId.get(position.id) ?? [];
                const visibleChildren = children.slice(0, 8);
                const hiddenChildren = Math.max(0, children.length - visibleChildren.length);
                return (
                  <article
                    key={position.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="border-b border-slate-100 bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[var(--ui-text)]">{position.name}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
                              {position.code}
                            </span>
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              {children.length} internos
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 p-3">
                      <form action={updatePositionNameAction} className="grid grid-cols-[1fr_auto] gap-2">
                        <input type="hidden" name="location_id" value={id} />
                        <input type="hidden" name="position_id" value={position.id} />
                        <input
                          name="name"
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                          defaultValue={position.name}
                        />
                        <button
                          type="submit"
                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          Guardar
                        </button>
                      </form>

                      {visibleChildren.length > 0 ? (
                        <div className="grid gap-2">
                          {visibleChildren.map((child) => (
                            <form
                              key={child.id}
                              action={updatePositionNameAction}
                              className="grid grid-cols-[minmax(92px,0.55fr)_minmax(130px,1fr)_auto] items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                            >
                              <input type="hidden" name="location_id" value={id} />
                              <input type="hidden" name="position_id" value={child.id} />
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-slate-700">{child.name}</div>
                                <div className="font-mono text-[11px] text-slate-500">{child.code}</div>
                              </div>
                              <input
                                name="name"
                                className="h-8 min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                                defaultValue={child.name}
                              />
                              <button
                                type="submit"
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                              >
                                OK
                              </button>
                            </form>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-[var(--ui-muted)]">
                          Sin niveles internos todavia.
                        </div>
                      )}

                      {hiddenChildren > 0 ? (
                        <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                          +{hiddenChildren} posiciones mas en este grupo
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}

              {positions.length === 0 ? (
                <div className="ui-empty md:col-span-2">Todavia no hay posiciones internas en este LOC.</div>
              ) : null}
            </div>

            {hiddenTopLevelCount > 0 ? (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                Hay {hiddenTopLevelCount} grupos mas. Usa el selector Depende de al crear nuevas posiciones o filtra desde el board.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="ui-panel ui-remission-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Pendiente de ubicar internamente</div>
            <div className="mt-1 ui-body-muted">
              La columna sin posicion es lo que todavia no esta asignado a una estanteria/nivel.
            </div>
          </div>
          <Link href={`/inventory/locations/${encodeURIComponent(id)}/board`} className="ui-btn ui-btn--ghost">
            Ver board
          </Link>
        </div>

        <div className="ui-scrollbar-subtle mt-4 max-h-[70vh] overflow-x-auto overflow-y-auto">
          <Table className="min-w-[980px] table-auto [&_th]:pr-4 [&_td]:pr-4">
            <thead>
              <tr>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell className="text-right">Total LOC</TableHeaderCell>
                <TableHeaderCell className="text-right">Sin posicion</TableHeaderCell>
                <TableHeaderCell>Asignado</TableHeaderCell>
                <TableHeaderCell>Nueva ubicacion</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {assignableRows.map((row) => (
                <tr key={row.productId} className="ui-body">
                  <TableCell className="font-medium text-[var(--ui-text)]">{row.productName}</TableCell>
                  <TableCell className="font-mono text-right whitespace-nowrap">
                    {formatQty(row.total)} {row.unit}
                  </TableCell>
                  <TableCell className="font-mono text-right whitespace-nowrap">
                    {formatQty(row.unpositioned)} {row.unit}
                  </TableCell>
                  <TableCell className="max-w-[260px] align-top text-sm text-[var(--ui-muted)]">
                    {row.positionLines.length > 0 ? row.positionLines.join(" / ") : "-"}
                  </TableCell>
                  <TableCell>
                    {row.unpositioned > 0.000001 && positions.length > 0 ? (
                      <form action={assignPositionAction} className="grid gap-2 md:grid-cols-[minmax(240px,1fr)_130px_auto]">
                        <input type="hidden" name="location_id" value={id} />
                        <input type="hidden" name="product_id" value={row.productId} />
                        <select name="position_id" className="ui-input" required defaultValue="">
                          <option value="" disabled>
                            Selecciona estanteria/nivel
                          </option>
                          {positions.map((position) => (
                            <option key={position.id} value={position.id}>
                              {positionLabels.get(position.id) ?? position.name}
                            </option>
                          ))}
                        </select>
                        <input
                          name="quantity"
                          type="number"
                          min="0"
                          step="0.001"
                          max={row.unpositioned}
                          defaultValue={row.unpositioned}
                          className="ui-input text-right"
                          required
                        />
                        <button type="submit" className="ui-btn ui-btn--brand">
                          Ubicar
                        </button>
                      </form>
                    ) : (
                      <span className="ui-caption">Sin pendiente</span>
                    )}
                  </TableCell>
                </tr>
              ))}

              {assignableRows.length === 0 ? (
                <tr>
                  <TableCell colSpan={5} className="ui-empty">
                    No hay stock en este LOC para ubicar internamente.
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </section>
    </div>
  );
}
