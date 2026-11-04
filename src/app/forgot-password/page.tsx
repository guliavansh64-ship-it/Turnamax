"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/toast";

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ resetUrl?: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: String(f.get("email") ?? "") }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setResult({ resetUrl: data.resetUrl });
      } else {
        toast(data.error ?? "Could not process request.", "error");
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
        <p className="kicker mb-3">Reset password</p>
        <h1 className="h-display text-2xl font-bold mb-3">Forgot your password?</h1>
        {!result ? (
          <>
            <p className="text-mist text-sm mb-6">
              Enter your account email. If it exists, we'll issue a secure reset link.
            </p>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="field">
                <label className="label" htmlFor="email">Email</label>
                <input id="email" name="email" type="email" className="input" required />
              </div>
              <button className="btn btn-volt w-full" disabled={busy}>
                {busy ? <span className="spinner" /> : "Send reset link"}
              </button>
            </form>
            <p className="text-mist text-sm mt-5 text-center">
              <Link href="/login" className="text-volt hover:underline">
                Back to login
              </Link>
            </p>
          </>
        ) : (
          <>
            {result.resetUrl ? (
              <>
                <div className="banner">
                  <p className="text-sm leading-relaxed">
                    <b className="text-gold">Email delivery isn&apos;t working right now</b>, so
                    your one-time reset link is shown here instead. It expires in 60 minutes.
                  </p>
                </div>
                <a href={result.resetUrl} className="btn btn-volt w-full mt-4 break-all">
                  Open reset link
                </a>
              </>
            ) : (
              <div className="card !bg-ink2 p-4 text-left">
                <p className="text-sm">
                  <b className="text-volt">Check your inbox.</b> If that email is registered, a
                  password reset link is on its way. It expires in 60 minutes and works once.
                </p>
                <p className="hint">
                  For security we show the same message whether or not the account exists.
                </p>
              </div>
            )}
            <Link href="/login" className="btn btn-ghost w-full mt-3">
              Back to login
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
