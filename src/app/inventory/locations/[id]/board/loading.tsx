export default function LocationBoardLoading() {
  return (
    <div className="ui-scene flex min-h-screen w-full items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center shadow-sm">
        <div className="text-sm font-semibold uppercase tracking-[0.08em] text-emerald-900">
          Quiosco operativo
        </div>
        <div className="mt-2 text-2xl font-bold text-emerald-950">
          Actualizando inventario...
        </div>
        <p className="mt-2 text-sm text-emerald-900">
          Cargando productos, cantidades disponibles y ubicaciones internas.
        </p>
      </div>
    </div>
  );
}