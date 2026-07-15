"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Props = {
  returnTo: string;
};

function safeLocalReturnTo(value: string): string {
  const fallback = "/";
  const target = String(value ?? "").trim();
  if (!target) return fallback;

  try {
    const url = new URL(target, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}` || fallback;
  } catch {
    return fallback;
  }
}

export function LocalLoginForm({ returnTo }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        setError(signInError.message || "No fue posible iniciar sesión.");
        return;
      }

      window.location.assign(safeLocalReturnTo(returnTo));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "No fue posible iniciar sesión.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
      <div className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">
          NEXO local
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Iniciar sesión
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Esta sesión se guardará únicamente en localhost.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Correo
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            className="h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Contraseña
          </span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 pr-20 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </label>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Ingresando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
