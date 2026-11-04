"use client";

import { FormEvent, useState } from "react";
import { toast } from "../toast";

export default function BootstrapForm() {
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(f.get("name") ?? ""),
          email: String(f.get("email") ?? ""),
          password: String(f.get("password") ?? ""),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) window.location.href = "/admin";
      else toast(data.error ?? "Could not create admin.", "error");
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="field">
        <label className="label" htmlFor="name">Your name</label>
        <input id="name" name="name" className="input" required minLength={2} maxLength={80} />
      </div>
      <div className="field">
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" className="input" required />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">Password (min 10 chars)</label>
        <input id="password" name="password" type="password" className="input" required minLength={10} />
        <p className="hint">Use a long, unique password. This account becomes the platform owner.</p>
      </div>
      <button className="btn btn-volt w-full" disabled={busy}>
        {busy ? <span className="spinner" /> : "Create first administrator"}
      </button>
    </form>
  );
}
