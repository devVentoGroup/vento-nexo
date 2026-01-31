"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ParsedScan =
  | { kind: "vento"; entity: "LOC" | "LPN" | "AST"; code: string; raw: string }
  | { kind: "raw"; raw: string };

function parseScan(raw: string): ParsedScan {
  const cleaned = raw.trim();

  // Formato oficial: VENTO|TYPE|CODE
  // Ejemplos:
  // VENTO|LOC|LOC-CP-F1FRI-03-N2
  // VENTO|LPN|LPN-CP-2601-00042
  // VENTO|AST|AST-VCF-0015
  const parts = cleaned.split("|");
  if (parts.length === 3 && parts[0] === "VENTO") {
    const entity = parts[1] as "LOC" | "LPN" | "AST";
    const code = parts[2]?.trim();
    if ((entity === "LOC" || entity === "LPN" || entity === "AST") && code) {
      return { kind: "vento", entity, code, raw: cleaned };
    }
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
  const inputRef = useRef<HTMLInputElement | null>(null);

  const parsed = useMemo(() => {
    if (!value.trim()) return null;
    return parseScan(value);
  }, [value]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

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
            Compatible con escáner Bluetooth/USB tipo teclado. También puedes pegar el código.
          </div>
        </div>

        <button
          type="button"
          className="rounded-xl bg-zinc-100 px-3 py-2 ui-body font-semibold hover:bg-zinc-200"
          onClick={() => {
            // Placeholder para modo cámara; lo implementamos cuando definamos librería.
            alert("Modo cámara: pendiente. Por ahora usa escáner tipo teclado o pega el código.");
          }}
        >
          Cámara (QR)
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
          className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 ui-body outline-none ring-0 focus:border-zinc-400"
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

      <div className="mt-4 rounded-xl bg-zinc-50 p-4">
        <div className="text-xs font-semibold tracking-wide text-zinc-500">VISTA PREVIA</div>
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
            <div className="text-zinc-500">Esperando escaneo…</div>
          )}
        </div>
      </div>
    </div>
  );
}




