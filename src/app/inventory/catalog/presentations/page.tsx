import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import { buildShellLoginUrl } from "@/lib/auth/sso";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";
const PERMISSION = "inventory.stock";
const PAGE_PATH = "/inventory/catalog/presentations";
const MAX_ROWS = 800;
const PRESENTATION_REFERENCE_CHECKS = [
  { table: "inventory_entry_items", column: "input_uom_profile_id", label: "entradas de inventario" },
  { table: "inventory_transfer_items", column: "input_uom_profile_id", label: "traslados" },
  { table: "restock_request_items", column: "input_uom_profile_id", label: "solicitudes de reabastecimiento" },
  { table: "restock_request_item_picks", column: "uom_profile_id", label: "alistamiento de reabastecimiento" },
  { table: "inventory_movements", column: "input_uom_profile_id", label: "movimientos de inventario" },
  { table: "inventory_count_lines", column: "input_uom_profile_id", label: "conteos" },
  { table: "inventory_stock_by_uom_profile", column: "uom_profile_id", label: "stock por presentación" },
  { table: "internal_price_list_items", column: "uom_profile_id", label: "precios internos" },
  { table: "purchase_order_items", column: "input_uom_profile_id", label: "órdenes de compra" },
  { table: "production_batch_packages", column: "uom_profile_id", label: "empaques de producción" },
] as const;

type SearchParams = {
  q?: string;
  product_type?: string;
  usage_context?: string;
  source?: string;
  status?: string;
  ok?: string;
  error?: string;
};

type ProductRow = {
  id: string;
  name: string | null;
  sku: string | null;
  product_type: string | null;
  stock_unit_code: string | null;
  unit: string | null;
};

type UomProfileRow = {
  id: string;
  product_id: string;
  label: string | null;
  input_unit_code: string | null;
  qty_in_stock_unit: number | null;
  usage_context: string | null;
  source: string | null;
  is_default: boolean | null;
  is_active: boolean | null;
  updated_at: string | null;
};

function sanitizeReturnTo(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith(PAGE_PATH) ? trimmed : PAGE_PATH;
}

function withStatus(returnTo: string, status: { ok?: string; error?: string }): string {
  const [pathname, qs] = sanitizeReturnTo(returnTo).split("?");
  const params = new URLSearchParams(qs ?? "");
  if (status.ok) params.set("ok", status.ok);
  if (status.error) params.set("error", status.error);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function cleanLabel(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatQty(value: number | null | undefined): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "-";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 6 }).format(numeric);
}

function typeLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "insumo") return "Insumo";
  if (normalized === "venta") return "Producto";
  if (normalized === "preparacion") return "Preparación";
  if (normalized === "equipo" || normalized === "asset") return "Patrimonial";
  return normalized || "Sin tipo";
}

function contextLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "purchase") return "Compra";
  if (normalized === "remission") return "Remisión";
  return "General";
}

function sourceLabel(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "manual") return "Manual";
  if (normalized === "supplier_primary") return "Proveedor";
  if (normalized === "recipe_portion") return "FOGO";
  return normalized || "Sin fuente";
}

async function requirePresentationManager(returnTo = PAGE_PATH) {
  const supabase = await createClient();
  const { data: authRes } = await supabase.auth.getUser();
  const user = authRes.user ?? null;

  if (!user) redirect(await buildShellLoginUrl(returnTo));

  const [{ data: employee }, canManageCatalog] = await Promise.all([
    supabase.from("employees").select("role").eq("id", user.id).maybeSingle(),
    checkPermission(supabase, APP_ID, "catalog.products"),
  ]);

  const role = String((employee as { role?: string | null } | null)?.role ?? "").toLowerCase();
  if (!["propietario", "gerente_general"].includes(role) && !canManageCatalog) {
    redirect(withStatus(returnTo, { error: "No tienes permisos para editar presentaciones." }));
  }

  return { supabase };
}

async function updatePresentationLabelsAction(formData: FormData) {
  "use server";

  const returnTo = sanitizeReturnTo(String(formData.get("return_to") ?? PAGE_PATH));
  const { supabase } = await requirePresentationManager(returnTo);
  const ids = formData.getAll("presentation_id").map((value) => String(value ?? "").trim()).filter(Boolean);
  const labels = formData.getAll("presentation_label").map(cleanLabel);

  if (ids.length === 0) redirect(withStatus(returnTo, { error: "No hay presentaciones para guardar." }));
  if (ids.length !== labels.length) redirect(withStatus(returnTo, { error: "Formulario incompleto." }));

  const uniqueIds = Array.from(new Set(ids));
  const { data: currentRows, error: loadError } = await supabase
    .from("product_uom_profiles")
    .select("id,label")
    .in("id", uniqueIds);

  if (loadError) redirect(withStatus(returnTo, { error: loadError.message }));

  const currentLabelById = new Map(
    ((currentRows ?? []) as Array<{ id: string; label: string | null }>).map((row) => [
      row.id,
      cleanLabel(row.label),
    ])
  );

  let changed = 0;
  const now = new Date().toISOString();

  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const nextLabel = labels[index];

    if (!id) continue;
    if (!nextLabel) redirect(withStatus(returnTo, { error: "Hay presentaciones sin nombre." }));
    if (!currentLabelById.has(id)) redirect(withStatus(returnTo, { error: "Una presentación ya no existe." }));
    if (currentLabelById.get(id) === nextLabel) continue;

    const { error } = await supabase
      .from("product_uom_profiles")
      .update({ label: nextLabel, updated_at: now })
      .eq("id", id);

    if (error) redirect(withStatus(returnTo, { error: error.message }));
    changed += 1;
  }

  revalidatePath("/inventory/catalog");
  revalidatePath(PAGE_PATH);
  redirect(withStatus(returnTo, { ok: changed > 0 ? `Guardadas ${changed} presentaciones.` : "Sin cambios." }));
}

async function deactivatePresentationsAction(formData: FormData) {
  "use server";

  const returnTo = sanitizeReturnTo(String(formData.get("return_to") ?? PAGE_PATH));
  const { supabase } = await requirePresentationManager(returnTo);
  const selectedIds = Array.from(
    new Set(
      formData
        .getAll("selected_presentation_id")
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );

  if (selectedIds.length === 0) {
    redirect(withStatus(returnTo, { error: "Selecciona al menos una presentación para sacar de uso." }));
  }

  const { error } = await supabase
    .from("product_uom_profiles")
    .update({
      is_active: false,
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .in("id", selectedIds);

  if (error) redirect(withStatus(returnTo, { error: error.message }));

  revalidatePath("/inventory/catalog");
  revalidatePath(PAGE_PATH);
  redirect(withStatus(returnTo, { ok: `Se sacaron de uso ${selectedIds.length} presentaciones.` }));
}

async function countPresentationReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string
): Promise<Array<{ label: string; count: number }>> {
  const references: Array<{ label: string; count: number }> = [];

  for (const check of PRESENTATION_REFERENCE_CHECKS) {
    const { count, error } = await supabase
      .from(check.table)
      .select("id", { count: "exact", head: true })
      .eq(check.column, profileId);

    if (error) {
      references.push({ label: check.label, count: 1 });
      continue;
    }

    if ((count ?? 0) > 0) references.push({ label: check.label, count: count ?? 0 });
  }

  return references;
}

async function deleteUnusedPresentationsAction(formData: FormData) {
  "use server";

  const returnTo = sanitizeReturnTo(String(formData.get("return_to") ?? PAGE_PATH));
  const { supabase } = await requirePresentationManager(returnTo);
  const selectedIds = Array.from(
    new Set(
      formData
        .getAll("selected_presentation_id")
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );

  if (selectedIds.length === 0) {
    redirect(withStatus(returnTo, { error: "Selecciona al menos una presentación para eliminar." }));
  }

  const { data: profiles, error: loadError } = await supabase
    .from("product_uom_profiles")
    .select("id,label")
    .in("id", selectedIds);

  if (loadError) redirect(withStatus(returnTo, { error: loadError.message }));

  const profilesById = new Map(
    ((profiles ?? []) as Array<{ id: string; label: string | null }>).map((profile) => [profile.id, profile])
  );
  const blocked: string[] = [];
  const deletableIds: string[] = [];

  for (const id of selectedIds) {
    const profile = profilesById.get(id);
    if (!profile) {
      blocked.push(`Presentación ${id.slice(0, 8)} no existe`);
      continue;
    }

    const references = await countPresentationReferences(supabase, id);
    if (references.length > 0) {
      const detail = references
        .slice(0, 2)
        .map((reference) => `${reference.label}: ${reference.count}`)
        .join(", ");
      blocked.push(`${profile.label ?? id.slice(0, 8)} (${detail})`);
      continue;
    }

    deletableIds.push(id);
  }

  if (blocked.length > 0) {
    const visibleBlocked = blocked.slice(0, 4).join("; ");
    const extra = blocked.length > 4 ? ` y ${blocked.length - 4} más` : "";
    redirect(
      withStatus(returnTo, {
        error: `No se eliminaron registros. Tienen referencias: ${visibleBlocked}${extra}. Sácalos de uso en su lugar.`,
      })
    );
  }

  if (deletableIds.length === 0) {
    redirect(withStatus(returnTo, { error: "No hay presentaciones sin referencias para eliminar." }));
  }

  const { error: deleteError } = await supabase
    .from("product_uom_profiles")
    .delete()
    .in("id", deletableIds);

  if (deleteError) redirect(withStatus(returnTo, { error: deleteError.message }));

  revalidatePath("/inventory/catalog");
  revalidatePath(PAGE_PATH);
  redirect(withStatus(returnTo, { ok: `Eliminadas ${deletableIds.length} presentaciones sin referencias.` }));
}

export default async function CatalogPresentationsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const query = String(sp.q ?? "").trim();
  const productType = String(sp.product_type ?? "").trim();
  const usageContext = String(sp.usage_context ?? "").trim();
  const source = String(sp.source ?? "manual").trim();
  const status = String(sp.status ?? "active").trim();
  const returnToParams = new URLSearchParams();
  if (query) returnToParams.set("q", query);
  if (productType) returnToParams.set("product_type", productType);
  if (usageContext) returnToParams.set("usage_context", usageContext);
  if (source) returnToParams.set("source", source);
  if (status) returnToParams.set("status", status);
  const returnTo = `${PAGE_PATH}${returnToParams.toString() ? `?${returnToParams.toString()}` : ""}`;

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: PAGE_PATH,
    permissionCode: PERMISSION,
  });

  const [{ data: employee }, canManage] = await Promise.all([
    supabase.from("employees").select("role").eq("id", user.id).maybeSingle(),
    checkPermission(supabase, APP_ID, "catalog.products"),
  ]);
  const role = String((employee as { role?: string | null } | null)?.role ?? "").toLowerCase();
  const canEdit = ["propietario", "gerente_general"].includes(role) || canManage;

  let productsQuery = supabase
    .from("products")
    .select("id,name,sku,product_type,stock_unit_code,unit")
    .order("name", { ascending: true })
    .limit(2000);

  if (productType) productsQuery = productsQuery.eq("product_type", productType);

  const { data: productsData, error: productsError } = await productsQuery;
  const allProducts = (productsData ?? []) as ProductRow[];
  const normalizedQuery = query.toLowerCase();
  const products = normalizedQuery
    ? allProducts.filter((product) =>
      `${product.name ?? ""} ${product.sku ?? ""}`.toLowerCase().includes(normalizedQuery)
    )
    : allProducts;
  const productById = new Map(products.map((product) => [product.id, product]));
  const productIds = products.map((product) => product.id);

  let profiles: UomProfileRow[] = [];
  let profilesError: string | null = null;

  if (productIds.length) {
    let profilesQuery = supabase
      .from("product_uom_profiles")
      .select("id,product_id,label,input_unit_code,qty_in_stock_unit,usage_context,source,is_default,is_active,updated_at")
      .in("product_id", productIds)
      .order("label", { ascending: true })
      .limit(MAX_ROWS);

    if (usageContext) profilesQuery = profilesQuery.eq("usage_context", usageContext);
    if (source) profilesQuery = profilesQuery.eq("source", source);
    if (status === "active") profilesQuery = profilesQuery.eq("is_active", true);
    if (status === "inactive") profilesQuery = profilesQuery.eq("is_active", false);

    const { data, error } = await profilesQuery;
    profiles = (data ?? []) as UomProfileRow[];
    profilesError = error?.message ?? null;
  }

  const rows = profiles
    .map((profile) => ({ profile, product: productById.get(profile.product_id) ?? null }))
    .filter((row) => row.product)
    .sort((a, b) => {
      const productCompare = String(a.product?.name ?? "").localeCompare(String(b.product?.name ?? ""), "es", {
        sensitivity: "base",
      });
      if (productCompare !== 0) return productCompare;
      return String(a.profile.label ?? "").localeCompare(String(b.profile.label ?? ""), "es", { sensitivity: "base" });
    });

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.35fr_0.65fr] lg:items-start">
          <div className="space-y-4">
            <Link href="/inventory/catalog" className="ui-btn ui-btn--ghost inline-flex h-12 items-center px-5 text-base font-semibold">
              ← Volver al catálogo
            </Link>
            <div>
              <h1 className="ui-h1">Presentaciones masivas</h1>
            <p className="ui-body-muted">
                Renombra o saca de uso presentaciones físicas de productos e insumos sin tocar unidad,
                factor de conversión, contexto ni stock. Para cambios de equivalencia usa la pantalla individual del producto.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">
                {rows.length} presentaciones
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700">
                Solo nombre visible
              </span>
            </div>
          </div>
          <div className="ui-remission-kpis sm:grid-cols-2 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="success">
              <div className="ui-remission-kpi-label">Editable</div>
              <div className="ui-remission-kpi-value">Nombre</div>
              <div className="ui-remission-kpi-note">No cambia cálculos ni conversiones</div>
            </article>
            <article className="ui-remission-kpi" data-tone="cool">
              <div className="ui-remission-kpi-label">Límite</div>
              <div className="ui-remission-kpi-value">{MAX_ROWS}</div>
              <div className="ui-remission-kpi-note">Usa filtros si necesitas menos ruido</div>
            </article>
          </div>
        </div>
      </section>

      {sp.ok ? <div className="ui-alert ui-alert--success">{sp.ok}</div> : null}
      {sp.error ? <div className="ui-alert ui-alert--error">Error: {sp.error}</div> : null}
      {productsError ? <div className="ui-alert ui-alert--error">Error: {productsError.message}</div> : null}
      {profilesError ? <div className="ui-alert ui-alert--error">Error: {profilesError}</div> : null}

      <form method="get" className="ui-panel ui-remission-section grid gap-3 md:grid-cols-5">
        <label className="md:col-span-2">
          <span className="ui-label">Buscar producto o SKU</span>
          <input name="q" defaultValue={query} className="ui-input mt-1" placeholder="Ej: café, leche, CAF-001" />
        </label>
        <label>
          <span className="ui-label">Tipo</span>
          <select name="product_type" defaultValue={productType} className="ui-input mt-1">
            <option value="">Todos</option>
            <option value="insumo">Insumos</option>
            <option value="venta">Productos</option>
            <option value="preparacion">Preparaciones</option>
          </select>
        </label>
        <label>
          <span className="ui-label">Contexto</span>
          <select name="usage_context" defaultValue={usageContext} className="ui-input mt-1">
            <option value="">Todos</option>
            <option value="general">General</option>
            <option value="purchase">Compra</option>
            <option value="remission">Remisión</option>
          </select>
        </label>
        <label>
          <span className="ui-label">Fuente</span>
          <select name="source" defaultValue={source} className="ui-input mt-1">
            <option value="manual">Manuales</option>
            <option value="supplier_primary">Proveedor</option>
            <option value="recipe_portion">FOGO</option>
            <option value="">Todas</option>
          </select>
        </label>
        <label>
          <span className="ui-label">Estado</span>
          <select name="status" defaultValue={status} className="ui-input mt-1">
            <option value="">Todos</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </label>
        <div className="flex items-end gap-2 md:col-span-5">
          <button className="ui-btn ui-btn--brand">Aplicar filtros</button>
          <Link href={PAGE_PATH} className="ui-btn ui-btn--ghost">
            Limpiar
          </Link>
        </div>
      </form>

      <form action={updatePresentationLabelsAction} className="ui-panel ui-remission-section space-y-4">
        <input type="hidden" name="return_to" value={returnTo} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="ui-h3">Editar nombres</h2>
            <p className="text-sm text-[var(--ui-muted)]">
              Cambia solo el campo “Nombre nuevo” o selecciona filas para sacarlas de uso. Los demás datos son referencia para no confundir empaque con unidad técnica.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="ui-btn ui-btn--ghost"
              disabled={!canEdit || rows.length === 0}
              formAction={deleteUnusedPresentationsAction}
            >
              Eliminar sin referencias
            </button>
            <button
              className="ui-btn ui-btn--ghost"
              disabled={!canEdit || rows.length === 0}
              formAction={deactivatePresentationsAction}
            >
              Sacar de uso seleccionadas
            </button>
            <button className="ui-btn ui-btn--brand" disabled={!canEdit || rows.length === 0}>
              Guardar cambios
            </button>
          </div>
        </div>

        {!canEdit ? (
          <div className="ui-alert ui-alert--error">
            Tu usuario puede ver presentaciones, pero no tiene permisos para editarlas.
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-2xl border border-[var(--ui-border)]">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="bg-[var(--ui-surface-2)] text-xs uppercase tracking-wide text-[var(--ui-muted)]">
              <tr>
                <th className="px-3 py-3">Sacar de uso</th>
                <th className="px-3 py-3">Producto</th>
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Nombre actual</th>
                <th className="px-3 py-3">Nombre nuevo</th>
                <th className="px-3 py-3">Unidad técnica</th>
                <th className="px-3 py-3">Factor stock</th>
                <th className="px-3 py-3">Contexto</th>
                <th className="px-3 py-3">Fuente</th>
                <th className="px-3 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ui-border)] bg-white">
              {rows.map(({ profile, product }) => {
                const stockUnit = String(product?.stock_unit_code ?? product?.unit ?? "").trim();
                return (
                  <tr key={profile.id} className="align-top">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        name="selected_presentation_id"
                        value={profile.id}
                        disabled={!canEdit}
                        className="h-4 w-4 rounded border-[var(--ui-border)]"
                        aria-label={`Sacar de uso ${profile.label ?? "presentación"}`}
                      />
                    </td>
                    <td className="px-3 py-3 font-semibold text-[var(--ui-text)]">{product?.name ?? "-"}</td>
                    <td className="px-3 py-3 text-[var(--ui-muted)]">{product?.sku ?? "-"}</td>
                    <td className="px-3 py-3 text-[var(--ui-muted)]">{typeLabel(product?.product_type)}</td>
                    <td className="px-3 py-3 text-[var(--ui-muted)]">{profile.label ?? "-"}</td>
                    <td className="px-3 py-3">
                      <input type="hidden" name="presentation_id" value={profile.id} />
                      <input
                        name="presentation_label"
                        defaultValue={String(profile.label ?? "").trim()}
                        className="ui-input min-w-[260px]"
                        disabled={!canEdit}
                        required
                      />
                    </td>
                    <td className="px-3 py-3 text-[var(--ui-muted)]">{profile.input_unit_code ?? "-"}</td>
                    <td className="px-3 py-3 text-[var(--ui-muted)]">
                      {formatQty(profile.qty_in_stock_unit)} {stockUnit}
                    </td>
                    <td className="px-3 py-3 text-[var(--ui-muted)]">{contextLabel(profile.usage_context)}</td>
                    <td className="px-3 py-3 text-[var(--ui-muted)]">{sourceLabel(profile.source)}</td>
                    <td className="px-3 py-3">
                      <span className={profile.is_active === false ? "ui-chip" : "ui-chip ui-chip--success"}>
                        {profile.is_active === false ? "Inactiva" : "Activa"}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-sm text-[var(--ui-muted)]">
                    No hay presentaciones con los filtros actuales.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </form>
    </div>
  );
}
