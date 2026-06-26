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

type SearchParams = {
  q?: string;
  product_type?: string;
  usage_context?: string;
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

export default async function CatalogPresentationsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const query = String(sp.q ?? "").trim();
  const productType = String(sp.product_type ?? "").trim();
  const usageContext = String(sp.usage_context ?? "").trim();
  const status = String(sp.status ?? "active").trim();
  const returnToParams = new URLSearchParams();
  if (query) returnToParams.set("q", query);
  if (productType) returnToParams.set("product_type", productType);
  if (usageContext) returnToParams.set("usage_context", usageContext);
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
                Renombra presentaciones físicas de productos e insumos sin tocar unidad, factor de conversión,
                contexto ni stock. Para cambios de equivalencia usa la pantalla individual del producto.
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
              Cambia solo el campo “Nombre nuevo”. Los demás datos son referencia para no confundir empaque con unidad técnica.
            </p>
          </div>
          <button className="ui-btn ui-btn--brand" disabled={!canEdit || rows.length === 0}>
            Guardar cambios
          </button>
        </div>

        {!canEdit ? (
          <div className="ui-alert ui-alert--error">
            Tu usuario puede ver presentaciones, pero no tiene permisos para editarlas.
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-2xl border border-[var(--ui-border)]">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="bg-[var(--ui-surface-2)] text-xs uppercase tracking-wide text-[var(--ui-muted)]">
              <tr>
                <th className="px-3 py-3">Producto</th>
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Nombre actual</th>
                <th className="px-3 py-3">Nombre nuevo</th>
                <th className="px-3 py-3">Unidad técnica</th>
                <th className="px-3 py-3">Factor stock</th>
                <th className="px-3 py-3">Contexto</th>
                <th className="px-3 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ui-border)] bg-white">
              {rows.map(({ profile, product }) => {
                const stockUnit = String(product?.stock_unit_code ?? product?.unit ?? "").trim();
                return (
                  <tr key={profile.id} className="align-top">
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
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-[var(--ui-muted)]">
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
