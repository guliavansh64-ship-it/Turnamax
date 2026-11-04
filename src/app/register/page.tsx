"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/toast";

export default function RegisterPage() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ verifyUrl?: string; emailed?: boolean } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const body = {
      name: String(f.get("name") ?? ""),
      email: String(f.get("email") ?? ""),
      password: String(f.get("password") ?? ""),
      confirm: String(f.get("confirm") ?? ""),
    };
    if (body.password !== body.confirm) {
      toast("Passwords do not match.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setDone({ verifyUrl: data.verifyUrl, emailed: Boolean(data.emailed) });
      } else {
        toast(data.error ?? "Registration failed.", "error");
      }
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen grid place-items-center px-4">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-volt/15 border border-volt/40 grid place-items-center text-volt mb-5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h1 className="h-display text-2xl font-bold mb-3">You're in.</h1>
          <p className="text-mist text-sm leading-relaxed mb-6">
            Your account is ready and you're logged in. Pick a plan and submit your branding to
            start the preparation of your APKs.
          </p>
          {done.emailed ? (
            <div className="card !bg-ink2 p-4 text-left mb-6">
              <p className="text-sm">
                <b className="text-volt">Check your inbox.</b> We sent a verification link to your
                email. It expires in 14 days.
              </p>
              <p className="hint">
                Don&apos;t see it? Look in spam, then request a new one from your profile.
              </p>
            </div>
          ) : done.verifyUrl ? (
            <div className="banner !mb-6">
              <p className="text-sm leading-relaxed">
                <b className="text-gold">Email delivery is not configured (demo mode).</b> Your
                one-click verification link:{" "}
                <a href={done.verifyUrl} className="text-volt underline break-all">
                  verify email
                </a>
              </p>
            </div>
          ) : null}
          <Link href="/dashboard" className="btn btn-volt w-full">
            Go to your dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 py-16 relative overflow-hidden">
      <div className="hero-bg">
        <div className="hero-glow !opacity-10" />
      </div>
      <div className="card p-8 w-full max-w-md relative">
        <p className="kicker mb-3">Create account</p>
        <h1 className="h-display text-2xl font-bold mb-6">Get your tournament app</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="field">
            <label className="label" htmlFor="name">Full name</label>
            <input id="name" name="name" className="input" required minLength={2} maxLength={80} placeholder="Aarav Sharma" />
          </div>
          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" required placeholder="you@club.com" />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="input" required minLength={8} placeholder="Minimum 8 characters" />
          </div>
          <div className="field">
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input id="confirm" name="confirm" type="password" className="input" required minLength={8} />
          </div>
          <button className="btn btn-volt w-full" disabled={busy}>
            {busy ? <span className="spinner" /> : "Create account"}
          </button>
        </form>
        <p className="text-mist text-sm mt-5 text-center">
          Already registered?{" "}
          <Link href="/login" className="text-volt hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
