"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Zone = "identity" | "category" | "purchase" | "inventory" | "operation" | "remissions";
type Row = { id: string; name: string; sku: string | null; isActive: boolean; category: string | null; supplier: string | null; stockUnit: string | null; hasRoute: boolean; hasPolicy: boolean };
const zones: Array<{ id: Zone; label: string; hint: string }> = [
  { id: "identity", label: "Identidad", hint: "Nombre, SKU y estado" },
  { id: "category", label: "Categoría", hint: "Clasificación operativa" },
  { id: "purchase", label: "Compra", hint: "Proveedor y costo" },
  { id: "inventory", label: "Inventario", hint: "Unidad y control" },
  { id: "operation", label: "Operación", hint: "Sedes, producción y LOCs" },
  { id: "remissions", label: "Remisiones", hint: "Solicitud y rutas" },
];
export function MasterProductsConfigurator({ rows, categories, suppliers }: { rows: Row[]; categories: string[]; suppliers: string[] }) {
  const [zone, setZone] = useState<Zone>("identity"); const [q, setQ] = useState(""); const [category, setCategory] = useState(""); const [supplier, setSupplier] = useState("");
  const visible = useMemo(() => rows.filter((row) => `${row.name} ${row.sku ?? ""}`.toLowerCase().includes(q.toLowerCase()) && (!category || row.category === category) && (!supplier || row.supplier === supplier)), [rows, q, category, supplier]);
  const value = (row: Row) => zone === "identity" ? `${row.sku ? `${row.sku} · ` : ""}${row.isActive ? "Activo" : "Inactivo"}` : zone === "category" ? row.category ?? "Sin categoría" : zone === "purchase" ? row.supplier ?? "Sin proveedor" : zone === "inventory" ? row.stockUnit ?? "Sin unidad" : zone === "operation" ? "Abrir sedes y LOCs" : `${row.hasPolicy ? "Política lista" : "Sin política"} · ${row.hasRoute ? "Ruta lista" : "Sin ruta"}`;
  return <div className="ui-scene w-full space-y-5"><section className="ui-panel ui-panel--halo"><div className="ui-caption">Configuración maestra · productos</div><h1 className="mt-2 ui-h1">Configura sin perderte entre pantallas</h1><p className="mt-2 ui-body-muted">Elige una zona, filtra productos y abre solo el editor necesario.</p></section><section className="ui-panel"><div className="grid gap-3 md:grid-cols-3"><input value={q} onChange={(e) => setQ(e.target.value)} className="ui-input md:col-span-1" placeholder="Buscar nombre o SKU"/><select value={category} onChange={(e) => setCategory(e.target.value)} className="ui-input"><option value="">Todas las categorías</option>{categories.map((x) => <option key={x}>{x}</option>)}</select><select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="ui-input"><option value="">Todos los proveedores</option>{suppliers.map((x) => <option key={x}>{x}</option>)}</select></div><div className="mt-4 flex flex-wrap gap-2">{zones.map((item) => <button key={item.id} type="button" onClick={() => setZone(item.id)} className={zone === item.id ? "ui-btn ui-btn--brand ui-btn--sm" : "ui-btn ui-btn--ghost ui-btn--sm"}>{item.label}</button>)}</div><p className="mt-3 ui-caption">{zones.find((item) => item.id === zone)?.hint}</p></section><section className="ui-panel overflow-hidden"><div className="flex justify-between gap-3 border-b border-[var(--ui-border)] pb-3"><div className="ui-h3">Productos ({visible.length})</div><div className="ui-caption">Filtros instantáneos</div></div><div className="divide-y divide-[var(--ui-border)]">{visible.map((row) => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><div className="font-semibold text-[var(--ui-text)]">{row.name}</div><div className="ui-caption">{value(row)}</div></div><div className="flex items-center gap-2"><span className={row.isActive ? "ui-chip ui-chip--success" : "ui-chip"}>{row.isActive ? "Activo" : "Inactivo"}</span><Link className="ui-btn ui-btn--ghost ui-btn--sm" href={`/inventory/catalog/${row.id}`}>Configurar</Link></div></article>)}{!visible.length ? <div className="ui-empty py-12">No hay productos con esos filtros.</div> : null}</div></section></div>;
}
