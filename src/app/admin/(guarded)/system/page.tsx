import { verifySmtp } from "@/lib/mailer";
import { resolveSmtp, resolveZetpay } from "@/lib/integrations";
import { checkMysql } from "@/lib/mysql";
import SystemPanel from "@/components/admin/system-panel";
import AccountCard from "@/components/admin/account-card";
import { formatDateTime } from "@/lib/format";
import { APK_MAX_BYTES, LOGO_MAX_BYTES, PROOF_MAX_BYTES, GRACE_MS } from "@/lib/utils";
import { getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  const cur = await getCurrentAdmin();
  const [smtp, mysql, zetpay, cfg] = await Promise.all([
    verifySmtp(),
    checkMysql(),
    resolveZetpay(),
    resolveSmtp(),
  ]);

  const env = [
    ["App name", process.env.APP_NAME ?? "TurfLaunch"],
    ["Base URL", process.env.APP_BASE_URL ?? "—"],
    [
      "Primary database",
      process.env.DATABASE_URL
        ? `${process.env.DATABASE_URL.split("@").pop()?.split("/")[0] ?? "configured"} / ${
            process.env.DATABASE_URL.includes("postgres") ? "PostgreSQL" : "SQL"
          }`
        : "—",
    ],
    ["Customer session", `${process.env.SESSION_TTL_DAYS ?? 14} days`],
    ["Admin session", `${process.env.ADMIN_SESSION_TTL_HOURS ?? 12} hours`],
    ["APK size limit", `${(APK_MAX_BYTES / 1048576).toFixed(0)} MB`],
    ["Logo size limit", `${(LOGO_MAX_BYTES / 1048576).toFixed(0)} MB`],
    ["Proof size limit", `${(PROOF_MAX_BYTES / 1048576).toFixed(0)} MB`],
    [
      "Download grace after expiry",
      `${Math.round(GRACE_MS / 86400000)} days`,
    ],
    ["Upload storage", "./storage (outside the public web root)"],
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker mb-2">System</p>
        <h1 className="h-display text-3xl font-bold">Email &amp; database status</h1>
        <p className="text-mist mt-2 text-sm max-w-2xl">
          Verify your Gmail delivery and production MySQL credentials before going live. Secrets are
          read from environment variables only — they are never stored in the database or exposed to
          the browser.
        </p>
      </div>

      <SystemPanel
        initial={{
          zetpay: {
            enabled: zetpay.enabled,
            mode: zetpay.mode,
            title: zetpay.title,
            hasKey: Boolean(zetpay.apiKey),
            keyPreview: zetpay.apiKey
              ? `${zetpay.apiKey.slice(0, 4)}${"•".repeat(20)}${zetpay.apiKey.slice(-4)}`
              : "",
          },
          smtp: {
            config: {
              enabled: cfg.enabled,
              host: cfg.host,
              port: cfg.port,
              secure: cfg.secure,
              user: cfg.user ? `${cfg.user.slice(0, 3)}••••@${cfg.user.split("@")[1] ?? ""}` : "",
              from: cfg.fromAddress || cfg.user,
              support: cfg.supportEmail || "",
              adminEmail: cfg.adminEmail || "",
            },
            verified: smtp.ok,
            error: smtp.error,
          },
          mysql,
        }}
      />

      {cur && (
        <div>
          <h2 className="h-display text-xl font-bold mb-4">Your login</h2>
          <AccountCard
            name={cur.admin.name}
            email={cur.admin.email}
            role={cur.admin.role}
            createdAt={formatDateTime(cur.admin.createdAt)}
          />
        </div>
      )}

      <div className="card p-6">
        <h2 className="font-bold text-lg mb-4">Active configuration</h2>
        <dl className="grid sm:grid-cols-2 gap-3 text-sm">
          {env.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line pb-2">
              <dt className="text-mist">{k}</dt>
              <dd className="mono text-[12px] text-right break-all">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
