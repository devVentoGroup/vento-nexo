import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { departPhysicalShipment } from "./actions";

export const dynamic = "force-dynamic";

type ShipmentItem = { id: string; base_qty: number; stock_unit_code: string | null; products: { name: string | null } | null };
type Shipment = { id: string; shipment_code: string | null; status: string; origin: { name: string | null } | null; destination: { name: string | null } | null; remission_shipment_items: ShipmentItem[] | null };

export default async function ConductorShipmentsPage({ searchParams }: { searchParams?: Promise<{ ok?: string; error?: string }> }) {
  const sp = (await searchParams) ?? {};
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("remission_shipments")
    .select("id,shipment_code,status,origin:sites!remission_shipments_origin_site_id_fkey(name),destination:sites!remission_shipments_destination_site_id_fkey(name),remission_shipment_items(id,base_qty,stock_unit_code,products(name))")
    .in("status", ["draft", "loading", "sealed", "in_transit"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const shipments = (data ?? []) as unknown as Shipment[];
  const readyToDepart = shipments.filter((shipment) => shipment.status !== "in_transit");
  const inTransit = shipments.filter((shipment) => shipment.status === "in_transit");
  const renderShipment = (shipment: Shipment) => (
    <article key={shipment.id} className="rounded-2xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold text-[var(--ui-text)]">{shipment.shipment_code || "Envío sin código"}</div><div className="mt-1 text-sm text-[var(--ui-muted)]">{shipment.origin?.name || "Origen"} → {shipment.destination?.name || "Destino"}</div></div><span className={shipment.status === "in_transit" ? "ui-chip ui-chip--success" : "ui-chip"}>{shipment.status === "in_transit" ? "En tránsito" : "Pendiente de salida"}</span></div>
      <div className="mt-4 space-y-2 border-t border-[var(--ui-border)] pt-3">{(shipment.remission_shipment_items ?? []).map((item) => <div key={item.id} className="flex justify-between gap-4 text-sm"><span>{item.products?.name || "Producto"}</span><span className="font-medium whitespace-nowrap">{item.base_qty} {item.stock_unit_code || "un"}</span></div>)}</div>
      {shipment.status !== "in_transit" ? <form action={departPhysicalShipment} className="mt-4"><input type="hidden" name="shipment_id" value={shipment.id} /><button className="ui-btn ui-btn--brand">Confirmar salida</button></form> : <Link href="/inventory/remissions/receive" className="ui-btn ui-btn--ghost ui-btn--sm mt-4">Ir a recepción</Link>}
    </article>
  );
  return <div className="ui-scene w-full space-y-6"><section className="ui-panel ui-panel--halo"><div className="ui-caption">Conductor · logística</div><h1 className="mt-2 ui-h1">Cargas pendientes de salida</h1><p className="mt-2 ui-body-muted">Aquí ves cada envío físico creado en preparación. Confirma la salida solo cuando la carga real esté lista en el vehículo.</p></section>{sp.error ? <div className="ui-alert ui-alert--error">{decodeURIComponent(sp.error)}</div> : null}{sp.ok === "departed" ? <div className="ui-alert ui-alert--success">Salida confirmada. El envío ya está en tránsito.</div> : null}<section className="ui-panel ui-remission-section"><div className="ui-h3">Para salir ahora ({readyToDepart.length})</div><div className="mt-4 grid gap-3 lg:grid-cols-2">{readyToDepart.map(renderShipment)}{!readyToDepart.length ? <div className="ui-empty lg:col-span-2">No hay cargas pendientes de salida.</div> : null}</div></section><section className="ui-panel ui-remission-section"><div className="ui-h3">Ya en tránsito ({inTransit.length})</div><div className="mt-4 grid gap-3 lg:grid-cols-2">{inTransit.map(renderShipment)}{!inTransit.length ? <div className="ui-empty lg:col-span-2">No hay envíos en tránsito.</div> : null}</div></section><Link href="/inventory/remissions/fulfillment" className="ui-btn ui-btn--ghost">Volver a preparación</Link></div>;
}
