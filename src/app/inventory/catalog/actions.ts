"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildShellLoginUrl } from "@/lib/auth/sso";
import { createClient } from "@/lib/supabase/server";
import {
  buildCatalogListReturnUrl,
  sanitizeCatalogListReturnPath,
} from "./helpers";
async function requireCatalogManager() {
  const supabase = await createClient();
  const { data: authRes } = await supabase.auth.getUser();
  const user = authRes.user ?? null;
  if (!user) {
    redirect(await buildShellLoginUrl("/inventory/catalog"));
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = String(employee?.role ?? "").toLowerCase();
  if (!["propietario", "gerente_general"].includes(role)) {
    redirect(
      buildCatalogListReturnUrl("/inventory/catalog", {
        error: "No tienes permisos para editar productos.",
      })
    );
  }

  return { supabase };
}

export async function toggleProductActiveFromListAction(formData: FormData) {
  "use server";

  const { supabase } = await requireCatalogManager();
  const productId = String(formData.get("product_id") ?? "").trim();
  const nextIsActive = String(formData.get("next_is_active") ?? "") === "1";
  const returnTo = sanitizeCatalogListReturnPath(String(formData.get("return_to") ?? ""));

  if (!productId) {
    redirect(buildCatalogListReturnUrl(returnTo, { error: "Producto inválido." }));
  }

  const { error } = await supabase
    .from("products")
    .update({
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (error) {
    redirect(buildCatalogListReturnUrl(returnTo, { error: error.message }));
  }

  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/stock");
  redirect(buildCatalogListReturnUrl(returnTo, { ok: "product_status_updated" }));
}

export async function deleteProductFromListAction(formData: FormData) {
  "use server";

  const { supabase } = await requireCatalogManager();
  const productId = String(formData.get("product_id") ?? "").trim();
  const returnTo = sanitizeCatalogListReturnPath(String(formData.get("return_to") ?? ""));

  if (!productId) {
    redirect(buildCatalogListReturnUrl(returnTo, { error: "Producto inválido." }));
  }

  const { count: ingredientUsageCount } = await supabase
    .from("recipes")
    .select("id", { head: true, count: "exact" })
    .eq("ingredient_product_id", productId);
  if ((ingredientUsageCount ?? 0) > 0) {
    redirect(
      buildCatalogListReturnUrl(returnTo, {
        error: "No se puede eliminar: este producto se usa como ingrediente en recetas.",
      })
    );
  }

  const { count: movementCount } = await supabase
    .from("inventory_movements")
    .select("id", { head: true, count: "exact" })
    .eq("product_id", productId);
  if ((movementCount ?? 0) > 0) {
    redirect(
      buildCatalogListReturnUrl(returnTo, {
        error: "No se puede eliminar: el producto tiene historial de movimientos. Deshabilitalo.",
      })
    );
  }

  const { count: stockCount } = await supabase
    .from("inventory_stock_by_site")
    .select("product_id", { head: true, count: "exact" })
    .eq("product_id", productId)
    .gt("current_qty", 0);
  if ((stockCount ?? 0) > 0) {
    redirect(
      buildCatalogListReturnUrl(returnTo, {
        error: "No se puede eliminar: el producto tiene stock disponible. Dejalo en 0 o deshabilitalo.",
      })
    );
  }

  const { data: recipeCards } = await supabase
    .from("recipe_cards")
    .select("id")
    .eq("product_id", productId);
  const recipeCardIds = (recipeCards ?? []).map((row) => row.id as string);
  if (recipeCardIds.length > 0) {
    const { error: stepsDeleteError } = await supabase
      .from("recipe_steps")
      .delete()
      .in("recipe_card_id", recipeCardIds);
    if (stepsDeleteError) {
      redirect(buildCatalogListReturnUrl(returnTo, { error: stepsDeleteError.message }));
    }
  }

  const cleanupStatements = [
    supabase.from("recipe_cards").delete().eq("product_id", productId),
    supabase.from("recipes").delete().eq("product_id", productId),
    supabase.from("product_suppliers").delete().eq("product_id", productId),
    supabase.from("product_site_settings").delete().eq("product_id", productId),
    supabase.from("product_inventory_profiles").delete().eq("product_id", productId),
  ];
  for (const statement of cleanupStatements) {
    const { error } = await statement;
    if (error) {
      redirect(buildCatalogListReturnUrl(returnTo, { error: error.message }));
    }
  }

  const { error: deleteError } = await supabase.from("products").delete().eq("id", productId);
  if (deleteError) {
    redirect(buildCatalogListReturnUrl(returnTo, { error: deleteError.message }));
  }

  revalidatePath("/inventory/catalog");
  revalidatePath("/inventory/stock");
  redirect(buildCatalogListReturnUrl(returnTo, { ok: "product_deleted" }));
}
