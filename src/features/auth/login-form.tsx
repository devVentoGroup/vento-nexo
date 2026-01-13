"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "../../lib/supabase/client";

type Props = {
  returnTo: string;
  initialError?: string;
  defaultEmail?: string;
};

function safeReturnTo(value: string) {
  const v = (value ?? "").trim();
  if (!v) return "/";
  if (!v.startsWith("/")) return "/";
  return v;
}

export function LoginForm({ returnTo, initialError, defaultEmail }: Props) {
  const router = useRouter();

  const safeTo = useMemo(() => safeReturnTo(returnTo), [returnTo]);

  const [email, setEmail] = useState(defaultEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      router.replace(safeTo);
      return;
    } catch (err: any) {
      setError(err?.message ?? "Error inesperado al iniciar sesión.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
          Accede a NEXO para usar inventario (RLS).
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error: {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-700">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400"
              placeholder="tu@correo.com"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-zinc-700">Contraseña</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400"
              placeholder="••••••••"
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>

          <div className="text-xs text-zinc-500">
            Después del login vuelves a: <span className="font-mono">{safeTo}</span>
          </div>
        </form>
      </div>
    </div>
  );
}
