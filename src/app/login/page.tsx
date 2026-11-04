"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(f.get("email") ?? ""),
          password: String(f.get("password") ?? ""),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        window.location.href = "/dashboard";
      } else {
        toast(data.error ?? "Login failed.", "error");
      }
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
        <p className="kicker mb-3">Welcome back</p>
        <h1 className="h-display text-2xl font-bold mb-6">Customer login</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" required autoComplete="email" />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="input" required autoComplete="current-password" />
          </div>
          <div className="flex justify-end -mt-1">
            <Link href="/forgot-password" className="mono text-[11px] text-mist hover:text-volt">
              Forgot password?
            </Link>
          </div>
          <button className="btn btn-volt w-full" disabled={busy}>
            {busy ? <span className="spinner" /> : "Log in"}
          </button>
        </form>
        <p className="text-mist text-sm mt-5 text-center">
          New here?{" "}
          <Link href="/register" className="text-volt hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
