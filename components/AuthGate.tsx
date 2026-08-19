"use client";

import { useEffect, useState } from "react";
import LoginForm from "./LoginForm";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then(async (res) => {
        setState(res.ok ? "ok" : "denied");
      })
      .catch(() => setState("denied"));
  }, []);

  if (state === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface)] text-sm text-ink-3">
        Memuat…
      </div>
    );
  }

  if (state === "denied") {
    return <LoginForm onSuccess={() => setState("ok")} />;
  }

  return <>{children}</>;
}