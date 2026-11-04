import { getCurrentAdmin, originOk } from "@/lib/auth";
import {
  emailEnabled,
  sendMail,
  supportEmail,
  verifySmtp,
} from "@/lib/mailer";
import { checkMysql } from "@/lib/mysql";
import { resolveSmtp, resolveZetpay } from "@/lib/integrations";
import { clientIp, jsonError, jsonOk, readJsonBody } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function smtpConfig() {
  const cfg = await resolveSmtp();
  const user = cfg.user ?? "";
  const maskEmail = (v: string) => {
    const [name, domain] = v.split("@");
    if (!domain) return v ? `${v.slice(0, 2)}••` : "";
    const head = name.length <= 3 ? name.slice(0, 1) : name.slice(0, 3);
    return `${head}••••@${domain}`;
  };
  return {
    enabled: cfg.enabled,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: maskEmail(user),
    from: cfg.fromAddress,
    support: cfg.supportEmail,
    adminEmail: cfg.adminEmail,
    hasBrevo: Boolean(cfg.brevoApiKey || process.env.BREVO_API_KEY),
    provider: (cfg.brevoApiKey || process.env.BREVO_API_KEY)
      ? "Brevo (HTTPS Port 443 - Recommended for Render)"
      : "Gmail SMTP",
  };
}

export async function GET() {
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);

  const [smtp, mysqlStatus, cfg, zetpay] = await Promise.all([
    verifySmtp(),
    checkMysql(),
    smtpConfig(),
    resolveZetpay(),
  ]);
  return jsonOk({
    zetpay: {
      enabled: zetpay.enabled,
      mode: zetpay.mode,
      title: zetpay.title,
      hasKey: Boolean(zetpay.apiKey),
      keyPreview: zetpay.apiKey
        ? `${zetpay.apiKey.slice(0, 4)}${"•".repeat(20)}${zetpay.apiKey.slice(-4)}`
        : "",
    },
    smtp: { config: cfg, verified: smtp.ok, error: smtp.error },
    mysql: mysqlStatus,
  });
}

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const body = await readJsonBody(req);
  if (String(body.action ?? "") !== "send_test")
    return jsonError("Unknown action.");

  const to = String(body.to ?? "").trim() || (process.env.SMTP_USER ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to))
    return jsonError("Enter a valid recipient email.");

  const res = await sendMail({
    to,
    subject: "Tournamax SMTP test — it works",
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f2f4f7;padding:28px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e8ee;">
        <div style="background:#0a0e14;padding:20px 24px;">
          <span style="font-size:17px;font-weight:800;color:#fff;">Turf<span style="color:#c8f32e;">Launch</span></span>
        </div>
        <div style="padding:24px;color:#3d4756;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 12px;"><b>Your email delivery is working.</b></p>
          <p style="margin:0 0 12px;">This test message was sent from the Main Admin panel by
          <b>${cur.admin.name}</b>. Customer verification links, password resets, payment
          confirmations and APK-ready notices will now be delivered from this mailbox.</p>
          <p style="margin:0;font-size:13px;color:#7b8594;">Nothing requires action — you can delete this email.</p>
        </div>
      </div>
    </div>`,
  });

  await logAudit({
    actorType: "admin",
    actorId: cur.admin.id,
    action: "system.test_email",
    entity: "system",
    meta: { to, ok: res.ok },
    ip: clientIp(req),
  });

  if (!res.ok) return jsonError(res.error ?? "Send failed.", 502);
  return jsonOk({ messageId: res.messageId });
}
