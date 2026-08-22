"use client";

import { useCallback, useState } from "react";

export default function LoginForm({
  onSuccess,
}: {
  onSuccess: (username: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Gagal masuk");
        onSuccess(d.username ?? username);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal masuk");
      } finally {
        setBusy(false);
      }
    },
    [username, password, onSuccess],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] p-4">
      <div className="w-full max-w-sm">
        <form
          onSubmit={submit}
          className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-float)]"
        >
          <div className="mb-5 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon.jpg"
              alt="Logo Hijrah Gizi Hewani"
              className="h-12 w-12 rounded-xl object-cover shadow-[var(--shadow-panel)]"
            />
            <div>
              <h1 className="text-base font-bold leading-tight text-ink">
                Analisis Biaya & Yield Produksi
              </h1>
              <p className="text-xs text-ink-2">Hijrah Gizi Hewani Â· masuk untuk mengakses</p>
            </div>
          </div>

          <label className="block text-[11px] font-semibold uppercase text-ink-3">
            Username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            className="mt-1 mb-3 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent"
          />

          <label className="block text-[11px] font-semibold uppercase text-ink-3">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-accent"
          />

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-lg bg-accent py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Memeriksaâ€¦" : "Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}