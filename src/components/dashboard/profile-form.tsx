"use client";

import { FormEvent, useState } from "react";
import { toast } from "../toast";

export default function ProfileForm({ name, email }: { name: string; email: string }) {
  const [busy, setBusy] = useState<"profile" | "password" | null>(null);

  async function send(
    url: string,
    method: string,
    body: Record<string, unknown>,
    kind: "profile" | "password"
  ) {
    setBusy(kind);
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) toast("Profile updated.", "success");
      else toast(data.error ?? "Update failed.", "error");
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(null);
    }
  }

  function onProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    send("/api/auth/profile", "PUT", { name: f.get("name") }, "profile");
  }

  function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const current = String(f.get("current") ?? "");
    const nw = String(f.get("newpw") ?? "");
    const confirm = String(f.get("confirm") ?? "");
    if (nw !== confirm) {
      toast("New passwords do not match.", "error");
      return;
    }
    send("/api/auth/profile", "PUT", { currentPassword: current, password: nw }, "password");
  }

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      <form onSubmit={onProfile} className="card p-6 space-y-4">
        <h2 className="font-bold text-lg">Account details</h2>
        <div className="field">
          <label className="label" htmlFor="pname">Full name</label>
          <input id="pname" name="name" className="input" defaultValue={name} required minLength={2} maxLength={80} />
        </div>
        <div className="field">
          <label className="label">Email</label>
          <input className="input" value={email} disabled />
          <p className="hint">Email is your login identity and cannot be changed here.</p>
        </div>
        <button className="btn btn-volt" disabled={busy !== null}>
          {busy === "profile" ? <span className="spinner" /> : "Save changes"}
        </button>
      </form>

      <form onSubmit={onPassword} className="card p-6 space-y-4">
        <h2 className="font-bold text-lg">Change password</h2>
        <div className="field">
          <label className="label" htmlFor="cur">Current password</label>
          <input id="cur" name="current" type="password" className="input" required autoComplete="current-password" />
        </div>
        <div className="field">
          <label className="label" htmlFor="new">New password</label>
          <input id="new" name="newpw" type="password" className="input" required minLength={8} autoComplete="new-password" />
        </div>
        <div className="field">
          <label className="label" htmlFor="conf">Confirm new password</label>
          <input id="conf" name="confirm" type="password" className="input" required minLength={8} autoComplete="new-password" />
        </div>
        <button className="btn btn-ghost" disabled={busy !== null}>
          {busy === "password" ? <span className="spinner" /> : "Update password"}
        </button>
      </form>
    </div>
  );
}
