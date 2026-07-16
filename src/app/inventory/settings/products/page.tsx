import { requireAppAccess } from "@/lib/auth/guard";
import { MasterProductsConfigurator } from "@/features/inventory/master-products/master-products-configurator";
export const dynamic = "force-dynamic";
export default async function MasterProductsPage() {
 const { supabase }=await requireAppAccess({appId:"nexo",returnTo:"/inventory/settings/products",permissionCode:"inventory.stock"});
 const [products,categories,suppliers,links,policies,routes]=await Promise.all([supabase.from("products").select("id,name,sku,is_active,stock_unit_code,category_id").order("name").limit(1000),supabase.from("inventory_categories").select("id,name"),supabase.from("suppliers").select("id,name").eq("is_active",true),supabase.from("product_suppliers").select("product_id,suppliers(name)").eq("is_primary",true),supabase.from("product_request_policies").select("product_id").eq("is_active",true),supabase.from("product_fulfillment_routes").select("product_id").eq("is_active",true)]);
 const categoryMap=new Map((categories.data??[]).map((x:any)=>[x.id,x.name])); const supplierMap=new Map((links.data??[]).map((x:any)=>[x.product_id,Array.isArray(x.suppliers)?x.suppliers[0]?.name:x.suppliers?.name])); const policyIds=new Set((policies.data??[]).map((x:any)=>x.product_id)); const routeIds=new Set((routes.data??[]).map((x:any)=>x.product_id));
 const rows=(products.data??[]).map((x:any)=>({id:x.id,name:x.name??"Sin nombre",sku:x.sku,isActive:Boolean(x.is_active),category:categoryMap.get(x.category_id)??null,supplier:supplierMap.get(x.id)??null,stockUnit:x.stock_unit_code,hasPolicy:policyIds.has(x.id),hasRoute:routeIds.has(x.id)}));
 return <MasterProductsConfigurator rows={rows} categories={Array.from(new Set(rows.map(x=>x.category).filter(Boolean))) as string[]} suppliers={Array.from(new Set(rows.map(x=>x.supplier).filter(Boolean))) as string[]}/>;
}
