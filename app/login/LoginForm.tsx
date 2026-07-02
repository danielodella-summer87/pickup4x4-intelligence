"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#0a1d2e] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 transition focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25";

const primaryBtnClass =
  "inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-[#06140f] shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";

export function LoginForm({ from }: { from?: string }) {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error || "Usuario o contraseña incorrectos.");
        setLoading(false);
        return;
      }
      const destino = from && from.startsWith("/") ? from : "/";
      router.push(destino);
      router.refresh();
    } catch {
      setError("No se pudo conectar. Probá de nuevo.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="user" className="mb-1.5 block text-xs font-medium text-slate-400">
          Usuario
        </label>
        <input
          id="user"
          name="user"
          type="text"
          autoComplete="username"
          required
          value={user}
          onChange={(e) => setUser(e.target.value)}
          className={inputClass}
          placeholder="usuario"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-400">
          Contraseña / PIN
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          placeholder="••••••••"
        />
      </div>
      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={loading} className={primaryBtnClass}>
        {loading ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
