"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/toast";
import { Logo } from "@/components/public-nav";

export default function AdminLoginPage() {
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(f.get("email") ?? ""),
          password: String(f.get("password") ?? ""),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) window.location.href = "/admin";
      else toast(data.error ?? "Login failed.", "error");
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 py-16 relative overflow-hidden">
      <div className="hero-bg">
        <div className="hero-glow !opacity-10" />
      </div>
      <div className="card p-8 w-full max-w-md relative">
        <Logo />
        <p className="kicker mt-6 mb-3">Main admin panel</p>
        <h1 className="h-display text-2xl font-bold mb-6">Administrator login</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" required autoComplete="email" />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="input" required autoComplete="current-password" />
          </div>
          <button className="btn btn-volt w-full" disabled={busy}>
            {busy ? <span className="spinner" /> : "Sign in"}
          </button>
        </form>
        <p className="hint mt-5 text-center">
          Restricted area. All administrative actions are audit-logged.
        </p>
        <p className="text-center mt-3">
          <Link href="/" className="mono text-[11px] text-mist hover:text-volt">
            ← Back to website
          </Link>
        </p>
      </div>
    </main>
  );
}
