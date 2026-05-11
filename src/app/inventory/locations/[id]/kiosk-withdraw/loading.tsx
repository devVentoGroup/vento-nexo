export default function KioskWithdrawLoading() {
  return (
    <div className="ui-scene flex min-h-screen w-full items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl rounded-3xl border border-amber-200 bg-amber-50 px-5 py-5 text-center shadow-sm">
        <div className="text-sm font-semibold uppercase tracking-[0.08em] text-amber-900">
          Quiosco operativo
        </div>
        <div className="mt-2 text-2xl font-bold text-amber-950">
          Abriendo retiro...
        </div>
        <p className="mt-2 text-sm text-amber-900">
          Preparando el formulario para confirmar producto, cantidad y trabajador.
        </p>
      </div>
    </div>
  );
}