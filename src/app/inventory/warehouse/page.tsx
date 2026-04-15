import { Suspense } from "react";
import { requireAppAccess } from "@/lib/auth/guard";
import { WarehouseQRClient } from "./warehouse-qr-client";

export const dynamic = "force-dynamic";

const APP_ID = "nexo";

function WarehouseQRLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center">
        <div className="mb-4 inline-flex h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"></div>
        <p className="text-slate-600">Cargando...</p>
      </div>
    </div>
  );
}

export default async function WarehouseQRPage() {
  await requireAppAccess({
    appId: APP_ID,
    returnTo: "/inventory/warehouse",
  });

  return (
    <Suspense fallback={<WarehouseQRLoadingFallback />}>
      <WarehouseQRClient />
    </Suspense>
  );
}
