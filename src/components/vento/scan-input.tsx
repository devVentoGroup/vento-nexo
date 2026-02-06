"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ParsedScan =
  | { kind: "vento"; entity: "LOC" | "AST"; code: string; raw: string }
  | { kind: "raw"; raw: string };

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = {
  detect: (video: HTMLVideoElement) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

function parseScan(raw: string): ParsedScan {
  const cleaned = raw.trim();
  if (!cleaned) return { kind: "raw", raw: "" };

  // Formato oficial: VENTO|TYPE|CODE
  const parts = cleaned.split("|");
  if (parts.length === 3 && parts[0] === "VENTO") {
    const entity = parts[1] as "LOC" | "AST";
    const code = parts[2]?.trim();
    if ((entity === "LOC" || entity === "AST") && code) {
      return { kind: "vento", entity, code, raw: cleaned };
    }
  }

  // DataMatrix de etiqueta LOC suele traer solo el código (ej. LOC-CP-BODEGA-MAIN)
  if (cleaned.toUpperCase().startsWith("LOC-")) {
    return { kind: "vento", entity: "LOC", code: cleaned, raw: cleaned };
  }
  if (cleaned.toUpperCase().startsWith("AST-")) {
    return { kind: "vento", entity: "AST", code: cleaned, raw: cleaned };
  }

  return { kind: "raw", raw: cleaned };
}

export function ScanInput(props: {
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onScan: (parsed: ParsedScan) => void;
}) {
  const { label = "Escanear", placeholder = "Escanea o pega el código…", autoFocus = true, onScan } = props;

  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const lastScanAtRef = useRef<number>(0);

  const parsed = useMemo(() => {
    if (!value.trim()) return null;
    return parseScan(value);
  }, [value]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;

    async function startCamera() {
      setCameraError(null);

      const BarcodeDetectorImpl = (window as any).BarcodeDetector as BarcodeDetectorCtor | undefined;
      if (typeof window === "undefined" || !BarcodeDetectorImpl) {
        setCameraError("Tu navegador no soporta escaneo por cámara.");
        return;
      }

      try {
        const detector = new BarcodeDetectorImpl({
          formats: ["qr_code", "datamatrix", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e"],
        });
        detectorRef.current = detector;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const tick = async () => {
          if (cancelled) return;
          const video = videoRef.current;
          const detector = detectorRef.current;
          if (!video || !detector) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }

          try {
            const now = Date.now();
            if (now - lastScanAtRef.current > 350) {
              const barcodes = await detector.detect(video);
              if (barcodes.length > 0) {
                const raw = barcodes[0]?.rawValue ?? "";
                if (raw) {
                  lastScanAtRef.current = now;
                  onScan(parseScan(raw));
                  setCameraOpen(false);
                  return;
                }
              }
            }
          } catch {
            // Ignore scan errors; keep loop alive.
          }

          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        setCameraError(
          err instanceof Error
            ? err.message
            : "No se pudo abrir la cámara. Verifica permisos."
        );
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [cameraOpen, onScan]);

  function submit() {
    const v = value.trim();
    if (!v) return;
    onScan(parseScan(v));
    setValue("");
    inputRef.current?.focus();
  }

  return (
    <div className="ui-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="ui-body font-semibold">{label}</div>
          <div className="mt-1 ui-body-muted">
            En cel o tablet: usa la cámara. En PC: escáner Bluetooth/USB tipo teclado o pega el código.
          </div>
        </div>

        <button
          type="button"
          className="ui-btn ui-btn--brand"
          onClick={() => setCameraOpen(true)}
          aria-label="Abrir cámara para escanear"
        >
          Escanear con cámara
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="ui-input h-11 w-full"
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={submit}
            className="ui-btn ui-btn--brand"
          >
            Procesar
          </button>
          <button
            type="button"
            onClick={() => {
              setValue("");
              inputRef.current?.focus();
            }}
            className="ui-btn ui-btn--ghost"
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-[var(--ui-radius-card)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4">
        <div className="ui-caption font-semibold tracking-wide text-[var(--ui-muted)]">Vista previa</div>
        <div className="mt-2 ui-body">
          {parsed ? (
            parsed.kind === "vento" ? (
              <div className="space-y-1">
                <div>
                  <span className="font-semibold">Tipo:</span> {parsed.entity}
                </div>
                <div>
                  <span className="font-semibold">Código:</span> <span className="font-mono">{parsed.code}</span>
                </div>
              </div>
            ) : (
              <div>
                <span className="font-semibold">Raw:</span> <span className="font-mono">{parsed.raw}</span>
              </div>
            )
          ) : (
            <div className="ui-caption">Esperando escaneo…</div>
          )}
        </div>
      </div>

      {cameraOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="ui-panel w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="ui-h3">Escaneo por cámara</div>
                <div className="mt-1 ui-caption">
                  Apunta al QR o DataMatrix de la etiqueta. En cel/tablet usa la cámara trasera si pide elegir.
                </div>
              </div>
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                onClick={() => setCameraOpen(false)}
              >
                Cerrar
              </button>
            </div>

            {cameraError ? (
              <div className="ui-alert ui-alert--error">{cameraError}</div>
            ) : (
              <div className="relative overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-black">
                <video
                  ref={videoRef}
                  className="h-64 w-full object-cover"
                  playsInline
                  muted
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-40 w-40 rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}




