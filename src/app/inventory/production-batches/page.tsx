import Link from "next/link";
import { Table, TableHeaderCell, TableCell } from "@/components/vento/standard/table";
import { redirect } from "next/navigation";

import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermissionWithRoleOverride } from "@/lib/auth/role-override";
import { createClient } from "@/lib/supabase/server";
import { buildShellLoginUrl } from "@/lib/auth/sso";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";

type SearchParams = {
  error?: string;
  ok?: string;
  site_id?: string;
};

function asText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  if (value.length >= 10) return value.slice(0, 10);
  return value;
}

type EmployeeSiteRow = {
  site_id: string | null;
  is_primary: boolean | null;
};

type SiteRow = {
  id: string;
  name: string | null;
  site_type: string | null;
};

type ProductRow = {
  id: string;
  name: string | null;
  unit: string | null;
};

type BatchRow = {
  id: string;
  batch_code: string | null;
  created_at: string | null;
  expires_at: string | null;
  produced_qty: number | null;
  produced_unit: string | null;
  notes: string | null;
  product: {
    name: string | null;
    unit: string | null;
  } | null;
};

async function createBatch(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/production-batches"));
  }
  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const actualRole = String(employee?.role ?? "");

  const siteId = asText(formData.get("site_id"));
  const productId = asText(formData.get("product_id"));
  const producedQty = parseNumber(asText(formData.get("produced_qty")));
  const producedUnit = asText(formData.get("produced_unit"));
  const expiresAt = asText(formData.get("expires_at"));
  const notes = asText(formData.get("notes"));

  const canRegister = siteId
    ? await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: "inventory.production_batches",
        context: { siteId },
        actualRole,
      })
    : false;

  if (!canRegister) {
    redirect(
      "/inventory/production-batches?error=" +
        encodeURIComponent("No tienes permiso para registrar producción manual.")
    );
  }

  if (!siteId || !productId || !producedUnit || producedQty <= 0) {
    redirect(
      "/inventory/production-batches?error=" +
        encodeURIComponent("Completa sede, producto, unidad y cantidad.")
    );
  }

  const { data: batch, error: batchErr } = await supabase
    .from("production_batches")
    .insert({
      site_id: siteId,
      product_id: productId,
      produced_qty: producedQty,
      produced_unit: producedUnit,
      notes: notes || null,
      expires_at: expiresAt || null,
      created_by: user.id,
    })
    .select("id, batch_code, created_at, expires_at")
    .single();

  if (batchErr || !batch) {
    redirect(
      "/inventory/production-batches?error=" +
        encodeURIComponent(batchErr?.message ?? "No se pudo crear el lote.")
    );
  }

  const { error: moveErr } = await supabase.from("inventory_movements").insert({
    site_id: siteId,
    product_id: productId,
    movement_type: "receipt",
    quantity: producedQty,
    unit: producedUnit,
    related_production_batch_id: batch.id,
    note: "Producción manual",
  });

  if (moveErr) {
    redirect(
      "/inventory/production-batches?error=" +
        encodeURIComponent(moveErr.message ?? "No se pudo registrar el movimiento.")
    );
  }

  const { data: stockRows } = await supabase
    .from("inventory_stock_by_site")
    .select("id,current_qty")
    .eq("site_id", siteId)
    .eq("product_id", productId)
    .limit(1);

  const existing = stockRows?.[0];
  if (existing) {
    const { error: stockErr } = await supabase
      .from("inventory_stock_by_site")
      .update({
        current_qty: Number(existing.current_qty ?? 0) + producedQty,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (stockErr) {
      redirect(
        "/inventory/production-batches?error=" +
          encodeURIComponent(stockErr.message ?? "No se pudo actualizar stock.")
      );
    }
  } else {
    const { error: stockErr } = await supabase.from("inventory_stock_by_site").insert({
      site_id: siteId,
      product_id: productId,
      current_qty: producedQty,
      updated_at: new Date().toISOString(),
    });

    if (stockErr) {
      redirect(
        "/inventory/production-batches?error=" +
          encodeURIComponent(stockErr.message ?? "No se pudo crear stock.")
      );
    }
  }

  redirect(`/inventory/production-batches?ok=created`);
}

export default async function ProductionBatchesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";
  const okMsg = sp.ok ? decodeURIComponent(sp.ok) : "";

  const { supabase, user } = await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/production-batches",
    permissionCode: "inventory.production_batches",
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("site_id,role")
    .eq("id", user.id)
    .single();
  const actualRole = String(employee?.role ?? "");

  const { data: employeeSites } = await supabase
    .from("employee_sites")
    .select("site_id,is_primary")
    .eq("employee_id", user.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(50);

  const employeeSiteRows = (employeeSites ?? []) as EmployeeSiteRow[];
  const defaultSiteId = employeeSiteRows[0]?.site_id ?? employee?.site_id ?? "";
  const activeSiteId = String(sp.site_id ?? defaultSiteId).trim();

  const siteIds = employeeSiteRows
    .map((row) => row.site_id)
    .filter((id): id is string => Boolean(id));

  const { data: sites } = siteIds.length
    ? await supabase
        .from("sites")
        .select("id,name,site_type")
        .in("id", siteIds)
        .order("name", { ascending: true })
    : { data: [] as SiteRow[] };

  const siteRows = (sites ?? []) as SiteRow[];
  const siteMap = new Map(siteRows.map((site) => [site.id, site]));
  const activeSiteName = siteMap.get(activeSiteId)?.name ?? activeSiteId;
  const canRegister = activeSiteId
    ? await checkPermissionWithRoleOverride({
        supabase,
        appId: APP_ID,
        code: "inventory.production_batches",
        context: { siteId: activeSiteId },
        actualRole,
      })
    : false;

  const { data: products } = await supabase
    .from("products")
    .select("id,name,unit")
    .order("name", { ascending: true })
    .limit(200);
  const productRows = (products ?? []) as ProductRow[];

  const { data: batches } = await supabase
    .from("production_batches")
    .select(
      "id, batch_code, created_at, expires_at, produced_qty, produced_unit, notes, product:products(name,unit)"
    )
    .eq("site_id", activeSiteId)
    .order("created_at", { ascending: false })
    .limit(30);
  const batchRows = (batches ?? []) as BatchRow[];

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Producción manual</h1>
          <p className="mt-2 ui-body-muted">
            Registra lotes terminados y genera etiquetas de producción.
          </p>
        </div>

        <Link
          href="/inventory/remissions"
          className="ui-btn ui-btn--ghost"
        >
          Ver remisiones
        </Link>
      </div>

      {errorMsg ? (
        <div className="mt-6 ui-alert ui-alert--error">
          Error: {errorMsg}
        </div>
      ) : null}

      {okMsg ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Lote creado y stock actualizado.
        </div>
      ) : null}

      <div className="mt-6 ui-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ui-h3">Sede activa</div>
            <div className="mt-1 ui-caption">{activeSiteName || "Sin sede"}</div>
          </div>
          <form method="get" className="flex items-center gap-3">
            <select
              name="site_id"
              defaultValue={activeSiteId}
              className="h-10 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-zinc-300 focus:outline-none"
            >
              {employeeSiteRows.map((row) => {
                const siteId = row.site_id ?? "";
                if (!siteId) return null;
                const site = siteMap.get(siteId);
                const label = site?.name ? `${site.name}` : siteId;
                const suffix = row.is_primary ? " (principal)" : "";
                return (
                  <option key={siteId} value={siteId}>
                    {label}
                    {suffix}
                  </option>
                );
              })}
            </select>
            <button className="ui-btn ui-btn--ghost">
              Cambiar
            </button>
          </form>
        </div>

        {!canRegister ? (
          <div className="mt-4 ui-alert ui-alert--neutral">
            Tu rol actual no puede registrar producción manual.
          </div>
        ) : null}

        {canRegister ? (
          <form action={createBatch} className="mt-4 space-y-4">
            <input type="hidden" name="site_id" value={activeSiteId} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Producto</span>
                <select
                  name="product_id"
                  className="ui-input"
                >
                  <option value="">Selecciona producto</option>
                  {productRows.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name ?? product.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="ui-label">Cantidad producida</span>
                <input
                  name="produced_qty"
                  placeholder="Cantidad"
                  className="ui-input"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Unidad</span>
                <input
                  name="produced_unit"
                  placeholder="ej: kg, un"
                  className="ui-input"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="ui-label">Fecha expiracion</span>
                <input
                  type="date"
                  name="expires_at"
                  className="ui-input"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="ui-label">Notas</span>
              <input
                name="notes"
                placeholder="Notas de producción"
                className="ui-input"
              />
            </label>

            <button className="ui-btn ui-btn--brand">
              Registrar lote
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-6 ui-panel">
        <div className="ui-h3">Últimos lotes</div>
        <div className="mt-1 ui-body-muted">Mostrando hasta 30 registros.</div>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>Cantidad</TableHeaderCell>
                <TableHeaderCell>Expira</TableHeaderCell>
                <TableHeaderCell>Etiqueta</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {batchRows.map((batch) => {
                const code = batch.batch_code ?? batch.id;
                const created = formatDate(batch.created_at);
                const expires = formatDate(batch.expires_at);
                const productName = batch.product?.name ?? "Producto";
                const queueLine = `${code}|${productName} - Prod ${created} - Exp ${expires}`;
                const printHref =
                  "/printing/jobs?preset=PROD_50x30&queue=" + encodeURIComponent(queueLine);

                return (
                  <tr key={batch.id} className="ui-body">
                    <TableCell className="font-mono">{created}</TableCell>
                    <TableCell>{productName}</TableCell>
                    <TableCell className="font-mono">
                      {batch.produced_qty} {batch.produced_unit ?? batch.product?.unit ?? ""}
                    </TableCell>
                    <TableCell className="font-mono">{expires || "-"}</TableCell>
                    <TableCell>
                      <Link
                        href={printHref}
                        className="ui-body font-semibold underline decoration-zinc-200 underline-offset-4"
                      >
                        Imprimir
                      </Link>
                    </TableCell>
                  </tr>
                );
              })}

              {!batches?.length ? (
                <tr>
                  <TableCell colSpan={5} className="ui-empty">
                    No hay lotes registrados.
                  </TableCell>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}




