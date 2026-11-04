"use client";

import { useEffect, useState } from "react";
import { toast } from "../toast";

type Status = {
  zetpay: {
    enabled: boolean;
    mode: "test" | "live";
    title: string;
    hasKey: boolean;
    keyPreview: string;
  };
  smtp: {
    config: {
      enabled: boolean;
      host: string;
      port: number;
      secure: boolean;
      user: string;
      from: string;
      support: string;
      adminEmail: string;
    };
    verified: boolean;
    error?: string;
  };
  mysql: {
    configured: boolean;
    ok: boolean;
    host: string;
    database: string;
    user: string;
    latencyMs: number | null;
    serverVersion: string | null;
    tableCount: number | null;
    error?: string;
  };
};

export default function SystemPanel({ initial }: { initial: Status }) {
  const [st, setSt] = useState<Status>(initial);
  const [busy, setBusy] = useState<"refresh" | "test" | "save" | null>(null);
  const [to, setTo] = useState(initial.smtp.config.from || "");
  const [form, setForm] = useState({
    host: initial.smtp.config.host || "smtp.gmail.com",
    port: String(initial.smtp.config.port || 465),
    user: initial.smtp.config.user || "",
    pass: "",
    fromName: "Tournamax",
    support: initial.smtp.config.support || "",
    adminTo: initial.smtp.config.adminEmail || "",
    enabled: initial.smtp.config.enabled,
    mHost: initial.mysql.host.includes("•") ? "" : initial.mysql.host,
    mPort: "3306",
    mDb: initial.mysql.database || "",
    mUser: initial.mysql.user.includes("•") ? "" : initial.mysql.user,
    mPass: "",
    mEnabled: initial.mysql.configured,
    zEnabled: initial.zetpay.enabled,
    zKey: "",
    zTitle: initial.zetpay.title || "Tournamax subscription",
    zMode: initial.zetpay.mode === "test" ? "test" : "live",
  });
  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function saveIntegrations() {
    if (busy) return;
    setBusy("save");
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          smtp: {
            enabled: form.enabled,
            host: form.host,
            port: Number(form.port),
            secure: Number(form.port) === 465,
            user: form.user,
            pass: form.pass,
            fromAddress: form.user,
            fromName: form.fromName,
            supportEmail: form.support,
            adminEmail: form.adminTo,
          },
          zetpay: {
            enabled: form.zEnabled,
            apiKey: form.zKey,
            title: form.zTitle,
            mode: form.zMode,
          },
          mysql: {
            enabled: form.mEnabled,
            host: form.mHost,
            port: Number(form.mPort),
            database: form.mDb,
            user: form.mUser,
            password: form.mPass,
            ssl: false,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        toast("Integrations saved. Re-checking…", "success");
        setForm((f) => ({ ...f, pass: "", mPass: "", zKey: "" }));
        await refresh();
      } else toast(data.error ?? "Save failed.", "error");
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("refresh");
    try {
      const res = await fetch("/api/admin/system");
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setSt({ zetpay: data.zetpay ?? initial.zetpay, smtp: data.smtp, mysql: data.mysql });
        toast("Status refreshed.", "success");
      } else toast(data.error ?? "Could not refresh.", "error");
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    if (busy) return;
    setBusy("test");
    try {
      const res = await fetch("/api/admin/system", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send_test", to }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        toast("Test email sent — check the inbox (and spam folder).", "success");
      } else toast(data.error ?? "Send failed.", "error");
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(null);
    }
  }

  const s = st.smtp;
  const m = st.mysql;

  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      {/* SMTP */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">Email delivery (SMTP)</h2>
          {s.verified ? (
            <span className="tag tag-green">connected</span>
          ) : (
            <span className="tag tag-red">not working</span>
          )}
        </div>
        <dl className="space-y-2 text-sm mb-5">
          {[
            ["Enabled", s.config.enabled ? "yes" : "no (EMAIL_ENABLED)"],
            ["Host", `${s.config.host}:${s.config.port}${s.config.secure ? " (TLS)" : ""}`],
            ["Mailbox", s.config.user || "—"],
            ["From", s.config.from || "—"],
            ["Support address", s.config.support || "—"],
            ["Admin alerts to", s.config.adminEmail || "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-mist">{k}</dt>
              <dd className="mono text-[12px] text-right break-all">{v}</dd>
            </div>
          ))}
        </dl>
        {s.error && (
          <div className="banner danger mb-4">
            <p className="text-[13px] mono break-words">{s.error}</p>
          </div>
        )}
        <div className="space-y-3">
          <div className="field">
            <label className="label">Send a test email to</label>
            <input
              className="input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="you@gmail.com"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <button className="btn btn-volt" onClick={sendTest} disabled={busy !== null || !to}>
              {busy === "test" ? <span className="spinner" /> : "Send test email"}
            </button>
            <button className="btn btn-ghost" onClick={refresh} disabled={busy !== null}>
              {busy === "refresh" ? <span className="spinner" /> : "Re-check"}
            </button>
          </div>
          <p className="hint">
            Gmail requires 2-Step Verification and a 16-character <b>App Password</b> — your normal
            Google password will be rejected with &quot;Invalid login&quot;.
          </p>
        </div>
      </div>

      {/* Edit integrations */}
      <div className="card p-6 md:col-span-2 space-y-4">
        <div>
          <h2 className="font-bold text-lg">Configure integrations</h2>
          <p className="hint !mt-1">
            Saved in the database so they survive deployments and environment resets.
            Environment variables take priority when present. Passwords are stored server-side and
            never returned to the browser.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-3 rounded-xl border border-line p-4">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => set("enabled", e.target.checked)}
                className="size-4 accent-[var(--volt)]"
              />
              Send email (Gmail SMTP)
            </label>
            <div className="field">
              <label className="label">SMTP host</label>
              <input className="input mono" value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label className="label">Port</label>
                <input className="input mono" value={form.port} onChange={(e) => set("port", e.target.value)} placeholder="465" />
              </div>
              <div className="field">
                <label className="label">From name</label>
                <input className="input" value={form.fromName} onChange={(e) => set("fromName", e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="label">Gmail address</label>
              <input className="input mono" value={form.user} onChange={(e) => set("user", e.target.value)} placeholder="you@gmail.com" autoComplete="off" />
            </div>
            <div className="field">
              <label className="label">App password</label>
              <input className="input mono" type="password" value={form.pass} onChange={(e) => set("pass", e.target.value)} placeholder={form.enabled ? "leave blank to keep current" : "16-character app password"} autoComplete="new-password" />
              <p className="hint">Google Account → Security → 2-Step Verification → App passwords.</p>
            </div>
            <div className="field">
              <label className="label">Support email</label>
              <input className="input mono" value={form.support} onChange={(e) => set("support", e.target.value)} placeholder="support@yourdomain.com" />
            </div>
            <div className="field">
              <label className="label">Admin notification email *</label>
              <input
                className="input mono"
                type="email"
                value={form.adminTo}
                onChange={(e) => set("adminTo", e.target.value)}
                placeholder="you@gmail.com"
                autoComplete="off"
              />
              <p className="hint">
                Every important platform email is sent here: new sign-ups, payments awaiting
                verification, branding submitted, gateway confirmations and support requests.
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-line p-4">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.zEnabled}
                onChange={(e) => set("zEnabled", e.target.checked)}
                className="size-4 accent-[var(--volt)]"
              />
              Automatic UPI payments (ZetPay)
            </label>
            <div className="field">
              <label className="label">ZetAPI key (32 chars)</label>
              <input
                className="input mono"
                type="password"
                value={form.zKey}
                onChange={(e) => set("zKey", e.target.value)}
                placeholder="leave blank to keep the stored key"
                autoComplete="off"
              />
              <p className="hint">Dashboard → Developer Portal → Zap API. Stored server-side only.</p>
            </div>
            <div className="field">
              <label className="label">Checkout title</label>
              <input
                className="input"
                value={form.zTitle}
                onChange={(e) => set("zTitle", e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="field">
              <label className="label">Expected gateway mode</label>
              <select
                className="input"
                value={form.zMode}
                onChange={(e) => set("zMode", e.target.value as "test" | "live")}
              >
                <option value="live">Live (real UPI)</option>
                <option value="test">Test (ZetPay simulator)</option>
              </select>
              <p className="hint">
                The real mode is controlled in your ZetPay dashboard; this only labels what you
                expect. Live charges real money.
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-line p-4">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.mEnabled}
                onChange={(e) => set("mEnabled", e.target.checked)}
                className="size-4 accent-[var(--volt)]"
              />
              Production MySQL (read-only check)
            </label>
            <div className="field">
              <label className="label">Host</label>
              <input className="input mono" value={form.mHost} onChange={(e) => set("mHost", e.target.value)} placeholder="sq1301.alchosting.xyz" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label className="label">Port</label>
                <input className="input mono" value={form.mPort} onChange={(e) => set("mPort", e.target.value)} placeholder="3306" />
              </div>
              <div className="field">
                <label className="label">Database</label>
                <input className="input mono" value={form.mDb} onChange={(e) => set("mDb", e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="label">Username</label>
              <input className="input mono" value={form.mUser} onChange={(e) => set("mUser", e.target.value)} autoComplete="off" />
            </div>
            <div className="field">
              <label className="label">Password</label>
              <input className="input mono" type="password" value={form.mPass} onChange={(e) => set("mPass", e.target.value)} placeholder="leave blank to keep current" autoComplete="new-password" />
            </div>
            <div className="banner">
              <p className="text-[12px] leading-relaxed">
                Enable <b>Remote MySQL</b> in your hosting panel first, otherwise connections are
                refused (this check is read-only — it never writes).
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button className="btn btn-volt" onClick={saveIntegrations} disabled={busy !== null}>
            {busy === "save" ? <span className="spinner" /> : "Save & test"}
          </button>
          <button className="btn btn-ghost" onClick={refresh} disabled={busy !== null}>
            Re-check status
          </button>
        </div>
      </div>

      {/* ZetPay */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">ZetPay (automatic UPI)</h2>
          {st.zetpay.enabled && st.zetpay.hasKey ? (
            <span className="tag tag-green">enabled</span>
          ) : (
            <span className="tag tag-gray">off</span>
          )}
        </div>
        <dl className="space-y-2 text-sm mb-4">
          {[
            ["API endpoint", "zetpay-beta.vercel.app"],
            ["Mode", st.zetpay.mode === "test" ? "test" : "live"],
            ["Key on file", st.zetpay.hasKey ? st.zetpay.keyPreview || "••••" : "not set"],
            ["Checkout title", st.zetpay.title],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-mist">{k}</dt>
              <dd className="mono text-[12px] text-right break-all">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="banner !mb-4">
          <p className="text-[12.5px] leading-relaxed">
            <b className="text-volt">Server-side only.</b> The key never reaches the browser —
            checkout creates the order here and fulfilment happens only after this server calls
            <code className="mono text-volt"> order-status</code> and gets <b>success</b>. A
            customer landing back from the gateway is never trusted on its own.
          </p>
        </div>
        <p className="hint !mt-0 mb-2">
          Limits: ₹1–₹5,000 per payment · 60 API calls / 15 min (we throttle ourselves below this).
        </p>
      </div>

      {/* MySQL */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">Production MySQL</h2>
          {m.ok ? (
            <span className="tag tag-green">reachable</span>
          ) : m.configured ? (
            <span className="tag tag-red">error</span>
          ) : (
            <span className="tag tag-gray">disabled</span>
          )}
        </div>
        <dl className="space-y-2 text-sm mb-5">
          {[
            ["Configured", m.configured ? "yes" : "no (MYSQL_ENABLED)"],
            ["Host", m.host || "—"],
            ["Database", m.database || "—"],
            ["User", m.user || "—"],
            ["Latency", m.latencyMs != null ? `${m.latencyMs} ms` : "—"],
            ["Server version", m.serverVersion ?? "—"],
            ["Tables found", m.tableCount != null ? String(m.tableCount) : "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-mist">{k}</dt>
              <dd className="mono text-[12px] text-right break-all">{v}</dd>
            </div>
          ))}
        </dl>
        {m.error && (
          <div className="banner danger mb-4">
            <p className="text-[13px] mono break-words">{m.error}</p>
          </div>
        )}
        <div className="banner">
          <p className="text-[13px] leading-relaxed">
            <b className="text-gold">Read-only check.</b> This panel only connects, pings and counts
            tables. It never writes. Apply the production schema with{" "}
            <code className="mono text-volt">deploy/mysql-schema.sql</code> (see{" "}
            <code className="mono text-volt">deploy/DEPLOY.md</code>). The app&apos;s own working
            datastore is <code className="mono text-volt">DATABASE_URL</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
