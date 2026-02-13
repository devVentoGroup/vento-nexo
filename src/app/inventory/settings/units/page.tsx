import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireAppAccess } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type UnitRow = {
  code: string;
  name: string;
  family: "volume" | "mass" | "count";
  factor_to_base: number;
  symbol: string | null;
  display_decimals: number | null;
  is_active: boolean;
};

type AliasRow = {
  alias: string;
  unit_code: string;
};

function asText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

async function requireManagerRole() {
  const supabase = await createClient();
  const { data: authRes } = await supabase.auth.getUser();
  const user = authRes.user ?? null;
  if (!user) {
    redirect("/inventory/settings/units?error=" + encodeURIComponent("Sesion requerida."));
  }
  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = String(employee?.role ?? "").toLowerCase();
  if (!["propietario", "gerente_general"].includes(role)) {
    redirect(
      "/inventory/settings/units?error=" +
        encodeURIComponent("Solo propietarios y gerentes pueden gestionar unidades.")
    );
  }
  return supabase;
}

async function saveUnitAction(formData: FormData) {
  "use server";
  const supabase = await requireManagerRole();

  const code = asText(formData.get("code")).toLowerCase();
  const name = asText(formData.get("name"));
  const family = asText(formData.get("family")) as UnitRow["family"];
  const factorToBase = Number(formData.get("factor_to_base") ?? "0");
  const symbol = asText(formData.get("symbol")) || null;
  const displayDecimals = Number(formData.get("display_decimals") ?? "2");
  const isActive = formData.get("is_active") === "true";

  if (!code || !name || !["volume", "mass", "count"].includes(family)) {
    redirect(
      "/inventory/settings/units?error=" +
        encodeURIComponent("Completa codigo, nombre y familia.")
    );
  }
  if (!Number.isFinite(factorToBase) || factorToBase <= 0) {
    redirect(
      "/inventory/settings/units?error=" +
        encodeURIComponent("factor_to_base debe ser mayor a 0.")
    );
  }
  if (
    !Number.isFinite(displayDecimals) ||
    displayDecimals < 0 ||
    displayDecimals > 6
  ) {
    redirect(
      "/inventory/settings/units?error=" +
        encodeURIComponent("display_decimals debe estar entre 0 y 6.")
    );
  }

  const { error } = await supabase.from("inventory_units").upsert(
    {
      code,
      name,
      family,
      factor_to_base: factorToBase,
      symbol,
      display_decimals: displayDecimals,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "code" }
  );
  if (error) {
    redirect(
      "/inventory/settings/units?error=" + encodeURIComponent(error.message)
    );
  }

  revalidatePath("/inventory/settings/units");
  redirect("/inventory/settings/units?ok=unit_saved");
}

async function saveAliasAction(formData: FormData) {
  "use server";
  const supabase = await requireManagerRole();
  const alias = asText(formData.get("alias")).toLowerCase();
  const unitCode = asText(formData.get("unit_code")).toLowerCase();

  if (!alias || !unitCode) {
    redirect(
      "/inventory/settings/units?error=" +
        encodeURIComponent("Completa alias y unidad destino.")
    );
  }

  const { error } = await supabase.from("inventory_unit_aliases").upsert(
    {
      alias,
      unit_code: unitCode,
    },
    { onConflict: "alias" }
  );
  if (error) {
    redirect(
      "/inventory/settings/units?error=" + encodeURIComponent(error.message)
    );
  }

  revalidatePath("/inventory/settings/units");
  redirect("/inventory/settings/units?ok=alias_saved");
}

async function deleteAliasAction(formData: FormData) {
  "use server";
  const supabase = await requireManagerRole();
  const alias = asText(formData.get("alias")).toLowerCase();
  if (!alias) {
    redirect(
      "/inventory/settings/units?error=" + encodeURIComponent("Alias invalido.")
    );
  }
  const { error } = await supabase
    .from("inventory_unit_aliases")
    .delete()
    .eq("alias", alias);
  if (error) {
    redirect(
      "/inventory/settings/units?error=" + encodeURIComponent(error.message)
    );
  }

  revalidatePath("/inventory/settings/units");
  redirect("/inventory/settings/units?ok=alias_deleted");
}

export default async function UnitsSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : "";
  const okMsg = sp.ok
    ? sp.ok === "unit_saved"
      ? "Unidad guardada."
      : sp.ok === "alias_saved"
        ? "Alias guardado."
        : sp.ok === "alias_deleted"
          ? "Alias eliminado."
          : "Cambios guardados."
    : "";

  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/settings/units",
    permissionCode: "inventory.stock",
  });

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = String(employee?.role ?? "").toLowerCase();
  const canManage = ["propietario", "gerente_general"].includes(role);

  const { data: unitsData } = await supabase
    .from("inventory_units")
    .select(
      "code,name,family,factor_to_base,symbol,display_decimals,is_active"
    )
    .order("family", { ascending: true })
    .order("factor_to_base", { ascending: true });
  const units = (unitsData ?? []) as UnitRow[];

  const { data: aliasesData } = await supabase
    .from("inventory_unit_aliases")
    .select("alias,unit_code")
    .order("alias", { ascending: true });
  const aliases = (aliasesData ?? []) as AliasRow[];

  return (
    <div className="w-full space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-h1">Unidades de inventario</h1>
          <p className="mt-2 ui-body-muted">
            Catalogo de unidades canonicas y aliases para conversion segura.
          </p>
        </div>
        <Link href="/inventory/catalog" className="ui-btn ui-btn--ghost">
          Ir a catalogo
        </Link>
      </div>

      {errorMsg ? <div className="ui-alert ui-alert--error">Error: {errorMsg}</div> : null}
      {okMsg ? <div className="ui-alert ui-alert--success">{okMsg}</div> : null}

      {!canManage ? (
        <div className="ui-alert ui-alert--warn">
          Solo propietarios y gerentes generales pueden gestionar unidades.
        </div>
      ) : (
        <>
          <section className="ui-panel space-y-4">
            <div className="ui-h3">Nueva unidad</div>
            <form action={saveUnitAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Codigo</span>
                <input name="code" className="ui-input" placeholder="ml, kg, un" required />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Nombre</span>
                <input name="name" className="ui-input" placeholder="Mililitro" required />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Familia</span>
                <select name="family" className="ui-input" defaultValue="count">
                  <option value="count">Conteo</option>
                  <option value="mass">Masa</option>
                  <option value="volume">Volumen</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Factor a base</span>
                <input
                  name="factor_to_base"
                  type="number"
                  step="0.000001"
                  min="0.000001"
                  defaultValue="1"
                  className="ui-input"
                  required
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Simbolo</span>
                <input name="symbol" className="ui-input" placeholder="ml" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Decimales UI</span>
                <input
                  name="display_decimals"
                  type="number"
                  min="0"
                  max="6"
                  defaultValue="2"
                  className="ui-input"
                />
              </label>
              <label className="flex items-end gap-2">
                <input type="hidden" name="is_active" value="true" />
                <span className="ui-caption">Se crea activa</span>
              </label>
              <div className="flex items-end">
                <button type="submit" className="ui-btn ui-btn--brand">
                  Guardar unidad
                </button>
              </div>
            </form>
          </section>

          <section className="ui-panel space-y-4">
            <div className="ui-h3">Nuevo alias</div>
            <form action={saveAliasAction} className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="ui-label">Alias</span>
                <input name="alias" className="ui-input" placeholder="litros" required />
              </label>
              <label className="flex flex-col gap-1">
                <span className="ui-label">Unidad destino</span>
                <select name="unit_code" className="ui-input" required>
                  <option value="">Selecciona</option>
                  {units.map((unit) => (
                    <option key={unit.code} value={unit.code}>
                      {unit.code} ({unit.family})
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button type="submit" className="ui-btn ui-btn--brand">
                  Guardar alias
                </button>
              </div>
            </form>
          </section>
        </>
      )}

      <section className="ui-panel">
        <div className="ui-h3">Unidades</div>
        <div className="mt-4 overflow-x-auto">
          <table className="ui-table min-w-full text-sm">
            <thead className="text-left text-[var(--ui-muted)]">
              <tr>
                <th className="py-2 pr-4">Codigo</th>
                <th className="py-2 pr-4">Nombre</th>
                <th className="py-2 pr-4">Familia</th>
                <th className="py-2 pr-4">Factor</th>
                <th className="py-2 pr-4">Simbolo</th>
                <th className="py-2 pr-4">Decimales</th>
                <th className="py-2 pr-4">Estado</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.code} className="border-t border-zinc-200/60">
                  <td className="py-3 pr-4 font-mono">{unit.code}</td>
                  <td className="py-3 pr-4">{unit.name}</td>
                  <td className="py-3 pr-4">{unit.family}</td>
                  <td className="py-3 pr-4 font-mono">{unit.factor_to_base}</td>
                  <td className="py-3 pr-4">{unit.symbol ?? "-"}</td>
                  <td className="py-3 pr-4">{unit.display_decimals ?? 2}</td>
                  <td className="py-3 pr-4">{unit.is_active ? "Activa" : "Inactiva"}</td>
                </tr>
              ))}
              {!units.length ? (
                <tr>
                  <td className="py-4 text-[var(--ui-muted)]" colSpan={7}>
                    No hay unidades cargadas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ui-panel">
        <div className="ui-h3">Aliases</div>
        <div className="mt-4 overflow-x-auto">
          <table className="ui-table min-w-full text-sm">
            <thead className="text-left text-[var(--ui-muted)]">
              <tr>
                <th className="py-2 pr-4">Alias</th>
                <th className="py-2 pr-4">Unidad</th>
                <th className="py-2 pr-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {aliases.map((row) => (
                <tr key={row.alias} className="border-t border-zinc-200/60">
                  <td className="py-3 pr-4 font-mono">{row.alias}</td>
                  <td className="py-3 pr-4">{row.unit_code}</td>
                  <td className="py-3 pr-4">
                    {canManage ? (
                      <form action={deleteAliasAction}>
                        <input type="hidden" name="alias" value={row.alias} />
                        <button type="submit" className="ui-btn ui-btn--ghost ui-btn--sm">
                          Eliminar
                        </button>
                      </form>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
              {!aliases.length ? (
                <tr>
                  <td className="py-4 text-[var(--ui-muted)]" colSpan={3}>
                    No hay aliases configurados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
