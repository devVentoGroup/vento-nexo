import Link from "next/link";

import { PageHeader } from "@/components/vento/standard/page-header";
import { requireAppAccess } from "@/lib/auth/guard";
import { IngestionClient } from "@/features/inventory/ai/ingestions-client";

export const dynamic = "force-dynamic";

type SearchParams = {
  flow?: string;
};

export default async function InventoryAiIngestionsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const flowType = sp.flow === "supplier_entries" ? "supplier_entries" : "catalog_create";

  const access = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/ai-ingestions",
    permissionCode: "inventory.stock",
  });
  const supabase = access.supabase;

  const [{ data: employee }, { data: settings }] = await Promise.all([
    supabase.from("employees").select("site_id").eq("id", access.user.id).maybeSingle(),
    supabase
      .from("employee_settings")
      .select("selected_site_id")
      .eq("employee_id", access.user.id)
      .maybeSingle(),
  ]);
  const siteId = settings?.selected_site_id ?? employee?.site_id ?? "";

  const [{ data: ingestionRows }, { data: supplierRows }, { data: locationRows }] = await Promise.all([
    supabase
      .from("inventory_ai_ingestions")
      .select("id,flow_type,source_filename,status,created_at,error_message")
      .eq("site_id", siteId)
      .eq("flow_type", flowType)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("suppliers")
      .select("id,name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(300),
    supabase
      .from("inventory_locations")
      .select("id,code")
      .eq("site_id", siteId)
      .order("code", { ascending: true })
      .limit(300),
  ]);

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="IA de Inventario"
        subtitle="Copiloto con aprobacion humana para crear productos y registrar entradas desde factura/remision."
        actions={
          <Link href="/inventory/catalog" className="ui-btn ui-btn--ghost">
            Volver a catalogo
          </Link>
        }
      />

      <IngestionClient
        defaultFlowType={flowType}
        initialRows={
          ((ingestionRows ?? []) as Array<{
            id: string;
            flow_type: "catalog_create" | "supplier_entries";
            source_filename: string | null;
            status: string;
            created_at: string;
            error_message: string | null;
          }>)
        }
        suppliers={
          ((supplierRows ?? []) as Array<{
            id: string;
            name: string | null;
          }>)
        }
        locations={
          ((locationRows ?? []) as Array<{
            id: string;
            code: string | null;
          }>)
        }
      />
    </div>
  );
}
