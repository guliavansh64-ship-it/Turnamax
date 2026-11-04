"use client";

import { FormEvent, useState } from "react";
import { toast } from "../toast";

export default function AccountCard({
  name,
  email,
  role,
  createdAt,
}: {
  name: string;
  email: string;
  role: string;
  createdAt: string;
}) {
  const [busy, setBusy] = useState(false);

  async function onName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/account", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: f.get("name") }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) toast("Name updated.", "success");
      else toast(data.error ?? "Update failed.", "error");
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const nw = String(f.get("newpw") ?? "");
    if (nw !== String(f.get("confirm") ?? "")) {
      toast("New passwords do not match.", "error");
      return;
    }
    if (!window.confirm("Change your password? You will be signed out of all admin sessions.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/account", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: f.get("current"),
          password: nw,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        toast("Password changed. Redirecting to login…", "success");
        setTimeout(() => (window.location.href = "/admin/login"), 1200);
      } else toast(data.error ?? "Change failed.", "error");
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      <form onSubmit={onName} className="card p-6 space-y-4">
        <h2 className="font-bold text-lg">Administrator account</h2>
        <dl className="space-y-2 text-sm">
          {[
            ["Email (login)", email],
            ["Role", role],
            ["Created", createdAt],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line pb-2">
              <dt className="text-mist">{k}</dt>
              <dd className="mono text-[12px] text-right break-all">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="field">
          <label className="label" htmlFor="aname">Display name</label>
          <input
            id="aname"
            name="name"
            className="input"
            defaultValue={name}
            required
            minLength={2}
            maxLength={80}
          />
        </div>
        <button className="btn btn-volt" disabled={busy}>
          {busy ? <span className="spinner" /> : "Save name"}
        </button>
      </form>

      <form onSubmit={onPassword} className="card p-6 space-y-4">
        <h2 className="font-bold text-lg">Change password</h2>
        <p className="hint !mt-0">
          Use a long, unique password (minimum 10 characters). Changing it signs you out of every
          admin session — including this one.
        </p>
        <div className="field">
          <label className="label" htmlFor="cur">Current password</label>
          <input id="cur" name="current" type="password" className="input" required autoComplete="current-password" />
        </div>
        <div className="field">
          <label className="label" htmlFor="new">New password</label>
          <input id="new" name="newpw" type="password" className="input" required minLength={10} autoComplete="new-password" />
        </div>
        <div className="field">
          <label className="label" htmlFor="conf">Confirm new password</label>
          <input id="conf" name="confirm" type="password" className="input" required minLength={10} autoComplete="new-password" />
        </div>
        <button className="btn btn-ghost" disabled={busy}>
          {busy ? <span className="spinner" /> : "Update password"}
        </button>
      </form>
    </div>
  );
}
