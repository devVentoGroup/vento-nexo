import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";
import { normalizeUnitCode } from "@/lib/inventory/uom";
import { safeDecodeURIComponent } from "@/lib/url";
import {
  createLogicalPolicyAction,
  createPhysicalPolicyAction,
  setDefaultPolicyAction,
  togglePolicyActiveAction,
} from "./actions";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";

type PolicyKind = "base_unit" | "logical_group" | "physical_presentation" | "actual_quantity";
type ConstraintMode = "free" | "strict_multiple" | "preferred_multiple";

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
  stock_unit_code: string | null;
  is_active: boolean | null;
};

type PolicyRow = {
  id: string;
  label: string;
  request_unit_code: string;
  base_unit_code: string;
  base_qty_per_request_unit: number | string;
  constraint_mode: ConstraintMode;
  minimum_request_qty: number | string | null;
  request_step_qty: number | string | null;
  allow_fraction: boolean;
  is_default: boolean;
  is_active: boolean;
  policy_kind: PolicyKind;
  physical_uom_profile_id: string | null;
  source: string;
};

type PhysicalProfileRow = {
  id: string;
  label: string | null;
  qty_in_input_unit: number | string | null;
  qty_in_stock_unit: number | string | null;
  is_active: boolean | null;
};

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberText(value: unknown): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 6 }).format(numberValue(value));
}

function kindText(kind: PolicyKind): string {
  return {
    base_unit: "Unidad base",
    logical_group: "Agrupación lógica",
    physical_presentation: "Presentación física",
    actual_quantity: "Cantidad real",
  }[kind];
}

function constraintText(mode: ConstraintMode): string {
  return {
    free: "Cantidad libre",
    strict_multiple: "Múltiplo obligatorio",
    preferred_multiple: "Múltiplo sugerido",
  }[mode];
}

function PolicyCard({
  productId,
  policy,
  profile,
  canManage,
}: {
  productId: string;
  policy: PolicyRow;
  profile: PhysicalProfileRow | null;
  canManage: boolean;
}) {
  const canDeactivate = policy.is_active && policy.policy_kind !== "base_unit" && !policy.is_default;

  return (
    <article className="rounded-2xl border border-zinc-200/80 bg-white/80 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-[var(--ui-ink)]">{policy.label}</h3>
              {policy.is_default ? (
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-900">
                  Predeterminada
                </span>
              ) : null}
              {!policy.is_active ? (
                <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                  Inactiva
                </span>
              ) : null}
            </div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--ui-muted)]">
              {kindText(policy.policy_kind)} · {policy.source}
            </div>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <div className="ui-caption">Equivalencia</div>
              <div className="mt-1 font-medium">
                1 {policy.request_unit_code} = {numberText(policy.base_qty_per_request_unit)} {policy.base_unit_code}
              </div>
            </div>
            <div>
              <div className="ui-caption">Regla</div>
              <div className="mt-1 font-medium">{constraintText(policy.constraint_mode)}</div>
              <div className="mt-1 text-xs text-[var(--ui-muted)]">
                Mínimo {policy.minimum_request_qty == null ? "—" : numberText(policy.minimum_request_qty)} · Paso {policy.request_step_qty == null ? "—" : numberText(policy.request_step_qty)} · Fracciones {policy.allow_fraction ? "sí" : "no"}
              </div>
            </div>
            <div>
              <div className="ui-caption">Presentación física</div>
              <div className="mt-1 font-medium">{profile?.label ?? "Sin vínculo físico"}</div>
              {profile ? (
                <div className="mt-1 text-xs text-[var(--ui-muted)]">
                  {profile.is_active ? "Perfil activo" : "Perfil inactivo"}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {canManage ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {policy.is_active && !policy.is_default ? (
              <form action={setDefaultPolicyAction}>
                <input type="hidden" name="product_id" value={productId} />
                <input type="hidden" name="policy_id" value={policy.id} />
                <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">Usar por defecto</button>
              </form>
            ) : null}
            {canDeactivate ? (
              <form action={togglePolicyActiveAction}>
                <input type="hidden" name="product_id" value={productId} />
                <input type="hidden" name="policy_id" value={policy.id} />
                <input type="hidden" name="next_active" value="false" />
                <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">Desactivar</button>
              </form>
            ) : null}
            {!policy.is_active ? (
              <form action={togglePolicyActiveAction}>
                <input type="hidden" name="product_id" value={productId} />
                <input type="hidden" name="policy_id" value={policy.id} />
                <input type="hidden" name="next_active" value="true" />
                <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">Reactivar</button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default async function ProductRequestPoliciesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: `/inventory/catalog/${id}/request-policies`,
    permissionCode: "inventory.stock",
  });

  const [{ data: productData }, { data: employeeData }] = await Promise.all([
    supabase.from("products").select("id,name,unit,stock_unit_code,is_active").eq("id", id).maybeSingle(),
    supabase.from("employees").select("role").eq("id", user.id).maybeSingle(),
  ]);
  if (!productData) notFound();

  const product = productData as ProductRow;
  const baseUnitCode = normalizeUnitCode(product.stock_unit_code || product.unit || "un");
  const role = String(employeeData?.role ?? "").toLowerCase();
  const canManage =
    ["propietario", "gerente_general"].includes(role) ||
    (await checkPermission(supabase, APP_ID, "catalog.products"));

  const [policyResult, profileResult] = await Promise.all([
    supabase
      .from("product_request_policies")
      .select("id,label,request_unit_code,base_unit_code,base_qty_per_request_unit,constraint_mode,minimum_request_qty,request_step_qty,allow_fraction,is_default,is_active,policy_kind,physical_uom_profile_id,source")
      .eq("product_id", id)
      .order("is_active", { ascending: false })
      .order("is_default", { ascending: false })
      .order("label", { ascending: true }),
    supabase
      .from("product_uom_profiles")
      .select("id,label,qty_in_input_unit,qty_in_stock_unit,is_active")
      .eq("product_id", id)
      .order("is_active", { ascending: false })
      .order("label", { ascending: true }),
  ]);

  const policies = (policyResult.data ?? []) as PolicyRow[];
  const profiles = (profileResult.data ?? []) as PhysicalProfileRow[];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const active = policies.filter((policy) => policy.is_active);
  const inactive = policies.filter((policy) => !policy.is_active);
  const defaultPolicy = active.find((policy) => policy.is_default) ?? null;
  const linkedIds = new Set(active.map((policy) => policy.physical_uom_profile_id).filter(Boolean));
  const availableProfiles = profiles.filter((profile) => profile.is_active && !linkedIds.has(profile.id));
  const loadError = policyResult.error?.message || profileResult.error?.message || "";

  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-remission-hero ui-fade-up">
        <div className="ui-remission-hero-grid lg:grid-cols-[1.45fr_1fr] lg:items-start">
          <div className="space-y-4">
            <Link href={`/inventory/catalog/${id}`} className="ui-btn ui-btn--ghost">← Volver a ficha maestra</Link>
            <div>
              <div className="ui-caption">Configuración de remisiones</div>
              <h1 className="mt-2 ui-h1">Políticas de solicitud · {product.name ?? "Producto"}</h1>
              <p className="mt-2 max-w-3xl ui-body-muted">
                Define agrupaciones de pedido sin cambiar la unidad de inventario ni crear stock separado.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold">Unidad base: {baseUnitCode}</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">{product.is_active === false ? "Producto inactivo" : "Producto activo"}</span>
              {!canManage ? <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold">Solo lectura</span> : null}
            </div>
          </div>
          <div className="ui-remission-kpis ui-remission-kpis--stack sm:grid-cols-3 lg:grid-cols-1">
            <article className="ui-remission-kpi" data-tone="cool"><div className="ui-remission-kpi-label">Activas</div><div className="ui-remission-kpi-value">{active.length}</div></article>
            <article className="ui-remission-kpi" data-tone="warm"><div className="ui-remission-kpi-label">Predeterminada</div><div className="ui-remission-kpi-value text-xl">{defaultPolicy?.label ?? "Sin definir"}</div></article>
            <article className="ui-remission-kpi" data-tone="neutral"><div className="ui-remission-kpi-label">Físicas</div><div className="ui-remission-kpi-value">{active.filter((policy) => policy.policy_kind === "physical_presentation").length}</div></article>
          </div>
        </div>
      </section>

      {sp.error ? <div className="ui-alert ui-alert--error">{safeDecodeURIComponent(sp.error)}</div> : null}
      {sp.ok ? <div className="ui-alert ui-alert--success">{safeDecodeURIComponent(sp.ok)}</div> : null}
      {loadError ? <div className="ui-alert ui-alert--error">No se pudo cargar el catálogo: {loadError}</div> : null}

      <section className="ui-panel space-y-4">
        <div><div className="ui-h3">Políticas activas</div><p className="mt-1 ui-body-muted">Solo afectan solicitudes nuevas; el historial conserva su propia equivalencia.</p></div>
        <div className="space-y-3">
          {active.map((policy) => <PolicyCard key={policy.id} productId={id} policy={policy} profile={policy.physical_uom_profile_id ? profileById.get(policy.physical_uom_profile_id) ?? null : null} canManage={canManage} />)}
          {!active.length ? <div className="ui-alert ui-alert--warn">Este producto no tiene políticas activas.</div> : null}
        </div>
      </section>

      {canManage ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="ui-panel space-y-4">
            <div><div className="ui-h3">Nueva agrupación lógica</div><p className="mt-1 ui-body-muted">Ejemplos: paquete x6, docena o bandeja x12.</p></div>
            <form action={createLogicalPolicyAction} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="product_id" value={id} />
              <label className="flex flex-col gap-1 sm:col-span-2"><span className="ui-label">Nombre visible</span><input name="label" className="ui-input" placeholder="Paquete x6" required /></label>
              <label className="flex flex-col gap-1"><span className="ui-label">Unidad de solicitud</span><input name="request_unit_code" className="ui-input" placeholder="paquete" /></label>
              <label className="flex flex-col gap-1"><span className="ui-label">Equivalencia en {baseUnitCode}</span><input name="base_qty_per_request_unit" type="number" min="0.000001" step="0.000001" className="ui-input" required /></label>
              <label className="flex flex-col gap-1"><span className="ui-label">Regla</span><select name="constraint_mode" className="ui-input" defaultValue="free"><option value="free">Cantidad libre</option><option value="strict_multiple">Múltiplo obligatorio</option><option value="preferred_multiple">Múltiplo sugerido</option></select></label>
              <label className="flex flex-col gap-1"><span className="ui-label">Cantidad mínima</span><input name="minimum_request_qty" type="number" min="0.000001" step="0.000001" className="ui-input" /></label>
              <label className="flex flex-col gap-1"><span className="ui-label">Paso o múltiplo</span><input name="request_step_qty" type="number" min="0.000001" step="0.000001" className="ui-input" /></label>
              <div className="flex flex-col justify-end gap-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" name="allow_fraction" />Permitir fracciones</label><label className="flex items-center gap-2"><input type="checkbox" name="is_default" />Usar por defecto</label></div>
              <div className="sm:col-span-2"><button type="submit" className="ui-btn ui-btn--brand">Crear agrupación</button></div>
            </form>
          </section>

          <section className="ui-panel space-y-4">
            <div><div className="ui-h3">Vincular presentación física</div><p className="mt-1 ui-body-muted">La equivalencia se toma del perfil físico y se solicita en paquetes completos.</p></div>
            {availableProfiles.length ? (
              <form action={createPhysicalPolicyAction} className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="product_id" value={id} />
                <label className="flex flex-col gap-1 sm:col-span-2"><span className="ui-label">Presentación</span><select name="physical_uom_profile_id" className="ui-input" required defaultValue=""><option value="" disabled>Selecciona</option>{availableProfiles.map((profile) => { const input = numberValue(profile.qty_in_input_unit); const factor = input > 0 ? numberValue(profile.qty_in_stock_unit) / input : 0; return <option key={profile.id} value={profile.id}>{profile.label ?? "Sin nombre"} · {numberText(factor)} {baseUnitCode}</option>; })}</select></label>
                <label className="flex flex-col gap-1"><span className="ui-label">Nombre alternativo</span><input name="label" className="ui-input" placeholder="Opcional" /></label>
                <label className="flex flex-col gap-1"><span className="ui-label">Unidad operativa</span><input name="request_unit_code" className="ui-input" placeholder="caja, bolsa, pote..." /></label>
                <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="is_default" />Usar por defecto</label>
                <div className="sm:col-span-2"><button type="submit" className="ui-btn ui-btn--brand">Vincular presentación</button></div>
              </form>
            ) : <div className="ui-alert ui-alert--neutral">No hay presentaciones físicas activas pendientes de vincular.</div>}
          </section>
        </div>
      ) : null}

      {inactive.length ? (
        <section className="ui-panel space-y-4">
          <div><div className="ui-h3">Políticas inactivas</div><p className="mt-1 ui-body-muted">Se conservan para auditoría y pueden reactivarse.</p></div>
          <div className="space-y-3">{inactive.map((policy) => <PolicyCard key={policy.id} productId={id} policy={policy} profile={policy.physical_uom_profile_id ? profileById.get(policy.physical_uom_profile_id) ?? null : null} canManage={canManage} />)}</div>
        </section>
      ) : null}
    </div>
  );
}
