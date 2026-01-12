export default function Home() {
  type AppStatus = "active" | "soon";

  type AppLink = {
    id: string;
    name: string;
    description: string;
    href: string;
    status: AppStatus;
  };

  const INTERNAL_APPS: AppLink[] = [
    {
      id: "viso",
      name: "VISO",
      description: "Gerencia, auditoría y configuración.",
      href: "https://viso.ventogroup.co",
      status: "soon",
    },
    {
      id: "nexo",
      name: "NEXO",
      description: "Inventario (LOC/LPN) y logística operativa.",
      href: "https://nexo.ventogroup.co",
      status: "active",
    },
    {
      id: "fogo",
      name: "FOGO",
      description: "Recetario, producción y lotes (FIFO).",
      href: "https://fogo.ventogroup.co",
      status: "soon",
    },
    {
      id: "origo",
      name: "ORIGO",
      description: "Compras, proveedores y recepción.",
      href: "https://origo.ventogroup.co",
      status: "soon",
    },
    {
      id: "pulso",
      name: "PULSO",
      description: "POS y operación de ventas.",
      href: "https://pulso.ventogroup.co",
      status: "soon",
    },
    {
      id: "aura",
      name: "AURA",
      description: "Marketing, contenidos y aprobaciones.",
      href: "https://aura.ventogroup.co",
      status: "soon",
    },
  ];

  const DIRECT_APPS: AppLink[] = [
    {
      id: "pass",
      name: "Vento Pass",
      description: "Clientes: puntos, redenciones y experiencia.",
      href: "https://pass.ventogroup.co",
      status: "active",
    },
    {
      id: "anima",
      name: "ANIMA",
      description: "Empleados: asistencia, documentos y calendario.",
      href: "https://anima.ventogroup.co",
      status: "active",
    },
  ];

  const StatusPill = ({ status }: { status: AppStatus }) => {
    const label = status === "active" ? "Activo" : "Próximamente";
    const cls =
      status === "active"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : "bg-zinc-100 text-zinc-600 ring-zinc-200";

    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${cls}`}
      >
        {label}
      </span>
    );
  };

  const AppCard = ({ app }: { app: AppLink }) => {
    const isActive = app.status === "active";

    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-zinc-900">{app.name}</div>
            <div className="mt-1 text-sm leading-6 text-zinc-600">{app.description}</div>
          </div>
          <StatusPill status={app.status} />
        </div>

        <div className="mt-4">
          {isActive ? (
            <a
              href={app.href}
              className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Abrir
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center justify-center rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-500"
              aria-disabled="true"
            >
              Próximamente
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Top bar */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-baseline gap-3">
            <div className="text-lg font-semibold tracking-tight">NEXO</div>
            <div className="text-sm text-zinc-500">Inventario y logística</div>
          </div>

          <div className="text-sm text-zinc-500">ventogroup.co</div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* Hero */}
        <section className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">Centro de aplicaciones</h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-zinc-600">
            Accede a los módulos de Vento Group. Este Hub es un launcher: cada aplicación vive independiente
            para mantener el sistema estable y escalable.
          </p>
        </section>

        {/* Internal apps */}
        <section className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Operación interna</h2>
            <div className="text-sm text-zinc-500">VISO · NEXO · FOGO · ORIGO · PULSO · AURA</div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INTERNAL_APPS.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        </section>

        {/* Direct apps */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Apps directas</h2>
            <div className="text-sm text-zinc-500">Sin pasar por el Hub</div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {DIRECT_APPS.map((app) => (
              <div
                key={app.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-zinc-900">{app.name}</div>
                    <div className="mt-1 text-sm leading-6 text-zinc-600">{app.description}</div>
                  </div>
                  <StatusPill status={app.status} />
                </div>

                <div className="mt-4">
                  <a
                    href={app.href}
                    className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
                  >
                    Abrir
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-12 border-t border-zinc-200 pt-6 text-sm text-zinc-500">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>Vento OS · Hub</div>
            <div>Versión MVP · Launcher</div>
          </div>
        </footer>
      </main>
    </div>
  );
}
