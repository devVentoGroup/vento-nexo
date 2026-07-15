import Link from "next/link";

export default async function ProductCatalogLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  const encodedId = encodeURIComponent(id);

  return (
    <div className="space-y-4">
      <nav
        aria-label="Navegación del producto"
        className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200/70 bg-white/70 p-2 shadow-sm backdrop-blur"
      >
        <Link href={`/inventory/catalog/${encodedId}`} className="ui-btn ui-btn--ghost ui-btn--sm">
          Ficha maestra
        </Link>
        <Link
          href={`/inventory/catalog/${encodedId}/presentations`}
          className="ui-btn ui-btn--ghost ui-btn--sm"
        >
          Presentaciones físicas
        </Link>
        <Link
          href={`/inventory/catalog/${encodedId}/request-policies`}
          className="ui-btn ui-btn--ghost ui-btn--sm"
        >
          Políticas de solicitud
        </Link>
      </nav>
      {children}
    </div>
  );
}
