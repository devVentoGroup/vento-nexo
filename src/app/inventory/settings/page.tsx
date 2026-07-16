import Link from "next/link";
import { requireAppAccess } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type Card = {
  title: string;
  description: string;
  href: string;
  cta: string;
  state?: string;
};

type Group = {
  eyebrow: string;
  title: string;
  description: string;
  cards: Card[];
};

const groups: Group[] = [
  {
    eyebrow: "1 · Base del catálogo",
    title: "Productos, categorías y unidades",
    description: "Define qué es cada producto y en qué unidad se controla antes de usarlo en sedes, LOCs o remisiones.",
    cards: [
      { title: "Configurador maestro de productos", description: "Busca y filtra productos; revisa identidad, compra, inventario, operación y remisiones desde una sola mesa.", href: "/inventory/settings/products", cta: "Configurar productos" },
      { title: "Productos maestros", description: "Crear productos y abrir su ficha detallada cuando necesites un caso específico.", href: "/inventory/catalog", cta: "Abrir catálogo" },
      { title: "Categorías", description: "Orden visual y tipo operativo de las categorías del inventario.", href: "/inventory/settings/categories", cta: "Configurar categorías" },
      { title: "Unidades y equivalencias", description: "Unidades base, aliases y conversiones permitidas.", href: "/inventory/settings/units", cta: "Configurar unidades" },
    ],
  },
  {
    eyebrow: "2 · Dónde opera",
    title: "Sedes, áreas y LOCs",
    description: "Define dónde se solicita, prepara, guarda, cuenta y recibe cada producto.",
    cards: [
      { title: "Sedes", description: "Capacidades de cada sede y acceso a su operación.", href: "/inventory/settings/sites", cta: "Configurar sedes" },
      { title: "Operación por sede", description: "Áreas, LOCs, posiciones internas y rutas de producción de una sede.", href: "/inventory/settings/sites", cta: "Elegir sede", state: "Abre una sede y entra a Operaciones" },
      { title: "Áreas y ubicaciones", description: "Áreas físicas, LOCs, posiciones internas y catálogo esperado para inventario.", href: "/inventory/locations", cta: "Configurar áreas y LOCs" },
      { title: "Zonas", description: "Agrupación operativa de ubicaciones para conteo, consulta y trabajo diario.", href: "/inventory/locations/zone", cta: "Configurar zonas" },
    ],
  },
  {
    eyebrow: "3 · Solicitud y cumplimiento",
    title: "Abastecimiento, preparación y remisiones",
    description: "Configura cómo se pide un producto, quién lo prepara y cómo se mueve entre sedes.",
    cards: [
      { title: "Productos por sede", description: "Qué productos y categorías participan en remisiones de cada sede.", href: "/inventory/settings/remissions/products", cta: "Configurar productos" },
      { title: "Políticas de solicitud", description: "Unidad visible, equivalencia, mínimo y paso para solicitudes futuras.", href: "/inventory/settings/request-policies", cta: "Configurar políticas" },
      { title: "Rutas entre sedes", description: "Qué sede abastece a cuál. Es el origen general de una solicitud.", href: "/inventory/settings/supply-routes", cta: "Configurar rutas" },
      { title: "Rutas operativas por producto", description: "Define por producto desde qué sede y LOC se prepara, y a qué sede y LOC se entrega cada remisión.", href: "/inventory/settings/fulfillment-routes", cta: "Configurar rutas" },
      { title: "Reglas de remisiones", description: "Modos operativos, inventario real y excepciones por sede.", href: "/inventory/settings/remissions", cta: "Configurar remisiones" },
      { title: "Cumplimiento y cargas", description: "Preparar cantidades listas y agruparlas en envíos físicos.", href: "/inventory/remissions/fulfillment", cta: "Abrir operación", state: "Operación, no configuración" },
    ],
  },
  {
    eyebrow: "4 · Valor y control",
    title: "Precios y verificación",
    description: "Configura el valor interno y luego consulta el resultado operativo.",
    cards: [
      { title: "Centros de costo", description: "Responsables y centros internos usados para valorar la operación.", href: "/inventory/cost-center", cta: "Configurar centros" },
      { title: "Precios internos", description: "Listas y reglas para valoración de transferencias internas.", href: "/inventory/settings/internal-prices", cta: "Configurar precios" },
      { title: "Stock por sede", description: "Consulta existencias después de configurar catálogo, LOCs y movimientos.", href: "/inventory/stock", cta: "Ver stock", state: "Consulta, no configuración" },
    ],
  },
];

export default async function InventorySettingsHubPage() {
  await requireAppAccess({ appId: "nexo", returnTo: "/inventory/settings", permissionCode: "inventory.stock" });
  return (
    <div className="ui-scene w-full space-y-6">
      <section className="ui-panel ui-panel--halo">
        <div className="ui-caption">Inventario · centro de configuración</div>
        <h1 className="mt-2 ui-h1">¿Qué necesitas configurar?</h1>
        <p className="mt-2 max-w-3xl ui-body-muted">Empieza por el tipo de decisión que necesitas tomar. No tienes que recordar dónde vive cada pantalla.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="#productos" className="ui-btn ui-btn--ghost justify-start">Producto</Link>
        <Link href="#operacion" className="ui-btn ui-btn--ghost justify-start">Sede o LOC</Link>
        <Link href="#cumplimiento" className="ui-btn ui-btn--ghost justify-start">Solicitud o remisión</Link>
        <Link href="#control" className="ui-btn ui-btn--ghost justify-start">Precio o stock</Link>
      </section>

      {groups.map((group, index) => (
        <section key={group.title} id={["productos", "operacion", "cumplimiento", "control"][index]} className="ui-panel ui-remission-section space-y-4">
          <div>
            <div className="ui-caption">{group.eyebrow}</div>
            <h2 className="mt-1 ui-h3">{group.title}</h2>
            <p className="mt-1 ui-body-muted">{group.description}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.cards.map((card) => (
              <article key={card.title} className="rounded-xl border border-[var(--ui-border)] bg-white p-4 shadow-sm">
                <div className="font-semibold text-[var(--ui-text)]">{card.title}</div>
                <p className="mt-1 text-sm text-[var(--ui-muted)]">{card.description}</p>
                {card.state ? <div className="mt-3 text-xs font-medium text-amber-800">{card.state}</div> : null}
                <Link href={card.href} className="ui-btn ui-btn--ghost ui-btn--sm mt-4">{card.cta}</Link>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}