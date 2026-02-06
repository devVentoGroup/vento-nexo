import Link from "next/link";

type SearchParams = { returnTo?: string };

const HUB_URL = "https://os.ventogroup.co";

function safeReturnTo(value?: string) {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (!v.startsWith("/")) return "";
  return v;
}

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const returnTo = safeReturnTo(sp.returnTo);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="ui-caption">Vento OS</div>
        <h1 className="mt-2 ui-h1">No tienes permisos</h1>
        <p className="mt-2 ui-body-muted">
          Tu usuario esta autenticado, pero no tiene acceso a este modulo.
        </p>

        {returnTo ? (
          <div className="mt-3 ui-caption">
            Ruta solicitada: <span className="font-mono">{returnTo}</span>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <a
            href={HUB_URL}
            className="ui-btn ui-btn--brand"
          >
            Volver al Hub
          </a>
          <Link
            href="/"
            className="ui-btn ui-btn--ghost"
          >
            Ir a inicio NEXO
          </Link>
        </div>
      </div>
    </div>
  );
}

