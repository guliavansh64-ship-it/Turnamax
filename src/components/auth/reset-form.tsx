"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/toast";

export default function ResetForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const pw = String(f.get("password") ?? "");
    const confirm = String(f.get("confirm") ?? "");
    if (pw !== confirm) {
      toast("Passwords do not match.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) setDone(true);
      else toast(data.error ?? "Reset failed.", "error");
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <p className="text-mist text-sm mb-6">
          Your password has been changed and you are signed in with the new one.
        </p>
        <Link href="/dashboard" className="btn btn-volt w-full">
          Go to dashboard
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="field">
        <label className="label" htmlFor="password">New password</label>
        <input id="password" name="password" type="password" className="input" required minLength={8} />
      </div>
      <div className="field">
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <input id="confirm" name="confirm" type="password" className="input" required minLength={8} />
      </div>
      <button className="btn btn-volt w-full" disabled={busy}>
        {busy ? <span className="spinner" /> : "Update password"}
      </button>
    </form>
  );
}
