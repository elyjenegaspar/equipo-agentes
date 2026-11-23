"use client";

import { useState } from "react";

export default function LoginPage() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password }),
    });
    if (res.ok) {
      window.location.href = "/";
      return;
    }
    const json = await res.json().catch(() => ({}));
    setError(json.error ?? "No se pudo iniciar sesión");
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6 text-gray-900">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-gray-200 bg-white p-8 shadow-md"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Equipo de agentes</h1>
          <p className="mt-1 text-sm text-gray-600">Inicia sesión para continuar</p>
        </div>

        <div>
          <label htmlFor="user" className="mb-1 block text-sm font-semibold text-gray-800">
            Usuario
          </label>
          <input
            id="user"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            autoComplete="username"
            className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-300"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-semibold text-gray-800">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-300"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !user || !password}
          className="w-full rounded-lg bg-gray-900 px-4 py-2.5 font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}