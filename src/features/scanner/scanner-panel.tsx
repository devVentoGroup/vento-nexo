"use client";

import { useRouter } from "next/navigation";
import { ScanInput } from "@/components/vento/scan-input";

export function ScannerPanel() {
  const router = useRouter();

  return (
    <ScanInput
      onScan={(parsed) => {
        if (parsed.kind !== "vento") {
          router.push(`/scanner?raw=${encodeURIComponent(parsed.raw)}`);
          return;
        }

        if (parsed.entity === "LOC") {
          router.push(`/inventory/locations?code=${encodeURIComponent(parsed.code)}`);
          return;
        }

        if (parsed.entity === "LPN") {
          router.push(`/inventory/lpns?code=${encodeURIComponent(parsed.code)}`);
          return;
        }

        // AST: por ahora no tenemos ficha en NEXO (eso será VISO).
        // Lo dejamos explícito para no inventar rutas.
        alert(`AST detectado: ${parsed.code}\nFicha técnica: pendiente (VISO).`);
      }}
    />
  );
}
