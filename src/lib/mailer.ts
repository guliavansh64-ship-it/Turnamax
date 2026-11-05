import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { resolveSmtp } from "./integrations";

/* ---------------- config ---------------- */

export async function emailEnabled(): Promise<boolean> {
  const cfg = await resolveSmtp();
  if (cfg.brevoApiKey || cfg.resendApiKey || process.env.RESEND_API_KEY?.trim() || process.env.BREVO_API_KEY?.trim()) return true;
  return cfg.enabled;
}

export async function supportEmail(): Promise<string> {
  const cfg = await resolveSmtp();
  return cfg.supportEmail || "support@example.com";
}

let cached: { key: string; t: Transporter } | null = null;

async function transporter(): Promise<Transporter | null> {
  const cfg = await resolveSmtp();
  if (!cfg.enabled || !cfg.user || !cfg.pass) return null;
  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.pass.length}`;
  if (cached?.key === key) return cached.t;
  const t = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure || cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    // Keep timeouts tight so a slow mail server never hangs a request.
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
  });
  cached = { key, t };
  return t;
}

/* ---------------- link building ---------------- */

/**
 * Build an absolute link. Prefers the request's own origin (correct on any
 * domain or preview URL), falls back to APP_BASE_URL.
 */
export function absoluteUrl(req: Request | null, path: string): string {
  if (req) {
    const origin = req.headers.get("origin");
    if (origin) return `${origin}${path}`;
    const host = req.headers.get("host");
    if (host) {
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      return `${proto}://${host}${path}`;
    }
  }
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}

/* ---------------- template shell ---------------- */

const ACCENT = "#c8f32e";
const INK = "#0a0e14";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(title: string, bodyHtml: string, support: string, preheader = ""): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(title)}</title></head>`,
    '<body style="margin:0;padding:0;background:#f2f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">',
    `<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7;padding:28px 12px;"><tr><td align="center">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e8ee;">',
    `<tr><td style="background:${INK};padding:22px 26px;">`,
    `<span style="font-size:17px;font-weight:800;color:#ffffff;letter-spacing:-0.2px;">Turf<span style="color:${ACCENT};">Launch</span></span>`,
    '<div style="font-size:11px;color:#8b96a8;letter-spacing:0.18em;text-transform:uppercase;margin-top:4px;">White-label tournament apps</div>',
    "</td></tr>",
    `<tr><td style="padding:28px 26px 8px;">`,
    `<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#0a0e14;">${escapeHtml(title)}</h1>`,
    `<div style="font-size:15px;line-height:1.65;color:#3d4756;">${bodyHtml}</div>`,
    "</td></tr>",
    `<tr><td style="padding:8px 26px 26px;"><p style="margin:0;font-size:12.5px;line-height:1.6;color:#7b8594;">`,
    `Need help? Reply to this email or write to <a href="mailto:${escapeHtml(support)}" style="color:#5a6b1f;">${escapeHtml(support)}</a>.</p></td></tr>`,
    '<tr><td style="background:#f7f9fb;padding:16px 26px;border-top:1px solid #eef1f5;">',
    '<p style="margin:0;font-size:11.5px;line-height:1.6;color:#98a2b1;">You received this email because you have a Tournamax customer account. ',
    "We never ask for UPI PINs, OTPs, bank passwords or card numbers.</p></td></tr>",
    "</table></td></tr></table></body></html>",
  ].join("");
}

function button(href: string, label: string): string {
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;"><tr>',
    `<td style="background:${ACCENT};border-radius:9px;">`,
    `<a href="${href}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:800;color:${INK};text-decoration:none;">${escapeHtml(label)}</a>`,
    "</td></tr></table>",
    '<div style="font-size:12px;color:#98a2b1;word-break:break-all;">Or paste this link into your browser:<br>',
    escapeHtml(href),
    "</div>",
  ].join("");
}

function paragraphs(body: string): string {
  return body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p)}</p>`)
    .join("");
}

/* ---------------- public API ---------------- */

export type MailResult = { ok: boolean; error?: string; messageId?: string };

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<MailResult> {
  const cfg = await resolveSmtp();
  const fromAddress = cfg.fromAddress || cfg.user || "guliavansh64@gmail.com";
  const fromName = cfg.fromName || "Tournamax";

  // 1. Resend HTTP API (Port 443 - never blocked by cloud hosts like Render)
  const resendKey = (process.env.RESEND_API_KEY || cfg.resendApiKey)?.trim();
  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${fromAddress}>`,
          to: [opts.to],
          subject: opts.subject,
          html: opts.html,
          text: opts.text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.message || `Resend error: ${res.statusText}` };
      }
      return { ok: true, messageId: data.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Resend send failed" };
    }
  }

  // 2. Brevo HTTP API (Port 443 - 300 free emails/day, never blocked by cloud hosts)
  const brevoKey = (process.env.BREVO_API_KEY || cfg.brevoApiKey)?.trim();
  if (brevoKey) {
    try {
      const isValidEmail = (e?: string) => Boolean(e && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && !e.includes("•"));
      const senderEmail =
        (isValidEmail(process.env.BREVO_SENDER_EMAIL) && process.env.BREVO_SENDER_EMAIL?.trim()) ||
        "rahuldeveloper011@gmail.com";
      const replyToEmail =
        (isValidEmail(cfg.adminEmail) && cfg.adminEmail) ||
        (isValidEmail(cfg.supportEmail) && cfg.supportEmail) ||
        "guliavansh64@gmail.com";

      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: fromName, email: senderEmail },
          replyTo: { email: replyToEmail, name: fromName },
          to: [{ email: opts.to }],
          subject: opts.subject,
          htmlContent: opts.html,
          textContent: opts.text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.message || `Brevo error: ${res.statusText}` };
      }
      return { ok: true, messageId: data.messageId };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Brevo send failed" };
    }
  }

  // 3. Fallback to Nodemailer SMTP
  const t = await transporter();
  if (!t) return { ok: false, error: "Email is not configured. Add SMTP or Brevo/Resend details." };
  try {
    const senderEmail = (cfg.host.includes("gmail") && cfg.user) ? cfg.user : (cfg.fromAddress || cfg.user);
    const from = `"${cfg.fromName}" <${senderEmail}>`;
    const info = await t.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text:
        opts.text ??
        opts.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000),
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Send failed";
    if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
      return {
        ok: false,
        error:
          "Connection timeout: Render Free tier blocks outbound SMTP ports 465/587. Add BREVO_API_KEY or RESEND_API_KEY in Render to send via HTTPS (Port 443).",
      };
    }
    return { ok: false, error: msg };
  }
}

/** Verify SMTP / HTTP email credentials without sending a message. */
export async function verifySmtp(): Promise<MailResult> {
  const cfg = await resolveSmtp();
  const resendKey = (process.env.RESEND_API_KEY || cfg.resendApiKey)?.trim();
  const brevoKey = (process.env.BREVO_API_KEY || cfg.brevoApiKey)?.trim();

  if (resendKey) {
    try {
      const res = await fetch("https://api.resend.com/api-keys", {
        headers: { Authorization: `Bearer ${resendKey}` },
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: `Resend auth error: ${res.statusText}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Resend check failed" };
    }
  }

  if (brevoKey) {
    try {
      const res = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": brevoKey },
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: `Brevo auth error: ${res.statusText}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Brevo check failed" };
    }
  }

  const t = await transporter();
  if (!t) return { ok: false, error: "Email is not configured. Add SMTP details in Admin → System." };
  try {
    await t.verify();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification failed";
    if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
      return {
        ok: false,
        error:
          "Connection timeout: Render Free blocks SMTP ports 465/587. Use BREVO_API_KEY or RESEND_API_KEY in Render for free HTTPS delivery.",
      };
    }
    return { ok: false, error: msg };
  }
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  link: string
): Promise<MailResult> {
  const support = await supportEmail();
  return sendMail({
    to,
    subject: "Verify your Tournamax email",
    html: shell(
      "Confirm your email address",
      `<p>Hi ${escapeHtml(name)},</p><p>Welcome aboard. Confirm this email address to finish activating your Tournamax account.</p>` +
        button(link, "Verify my email") +
        "<p style=\"margin-top:18px;\">This link expires in 14 days. If you didn't create this account, you can ignore this email.</p>",
      support,
      "Confirm your email to activate your Tournamax account."
    ),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  link: string
): Promise<MailResult> {
  const support = await supportEmail();
  return sendMail({
    to,
    subject: "Reset your Tournamax password",
    html: shell(
      "Reset your password",
      `<p>Hi ${escapeHtml(name)},</p><p>We received a request to reset the password on your Tournamax account.</p>` +
        button(link, "Choose a new password") +
        '<p style="margin-top:18px;"><b>This link expires in 60 minutes</b> and can only be used once. If you didn\'t request a reset, no action is needed — your current password still works.</p>',
      support,
      "A password reset link was requested for your account."
    ),
  });
}

/** Generic transactional notice for account events (payments, APKs, subscriptions). */
export async function sendNoticeEmail(
  to: string,
  name: string,
  title: string,
  body: string
): Promise<MailResult> {
  const support = await supportEmail();
  return sendMail({
    to,
    subject: title,
    html: shell(
      title,
      `<p>Hi ${escapeHtml(name)},</p>${paragraphs(body)}` +
        '<p style="margin-top:16px;">You can always check the latest status in your Tournamax dashboard.</p>',
      support,
      body.slice(0, 90)
    ),
  });
}


/* ---------------- operator alerts ---------------- */

/**
 * Sends an important platform email to the operator inbox (Admin → System →
 * "Admin notification email"). Never throws: an SMTP hiccup must never break
 * the customer-facing action that triggered it.
 */
export async function sendAdminAlert(
  subject: string,
  body: string,
  meta?: Record<string, string | number | null | undefined>
): Promise<MailResult> {
  try {
    const cfg = await resolveSmtp();
    const adminEmail = cfg.adminEmail || "guliavansh64@gmail.com";
    const rows = Object.entries(meta ?? {})
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(
        ([k, v]) =>
          `<tr><td style="padding:6px 10px;color:#7b8594;font-size:12px;border-bottom:1px solid #eef1f5">${escapeHtml(
            k
          )}</td><td style="padding:6px 10px;font-size:13px;border-bottom:1px solid #eef1f5;font-weight:600">${escapeHtml(
            String(v)
          )}</td></tr>`
      )
      .join("");

    const html = [
      '<!doctype html><html><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1"><title>',
      escapeHtml(subject),
      "</title></head>",
      '<body style="margin:0;padding:0;background:#f2f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7;padding:26px 12px"><tr><td align="center">',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e4e8ee">',
      '<tr><td style="background:#0a0e14;padding:20px 24px"><span style="font-size:16px;font-weight:800;color:#fff">Turf<span style="color:#c8f32e">Launch</span></span><div style="font-size:11px;color:#8b96a8;letter-spacing:.18em;text-transform:uppercase;margin-top:4px">Admin alert</div></td></tr>',
      `<tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:18px;color:#0a0e14">${escapeHtml(subject)}</h1>`,
      `<div style="font-size:14px;line-height:1.65;color:#3d4756">${paragraphs(body)}</div>`,
      rows
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:14px;border:1px solid #eef1f5">${rows}</table>`
        : "",
      "</td></tr>",
      '<tr><td style="background:#f7f9fb;padding:14px 24px;font-size:11.5px;color:#98a2b1">Action required? Open the Main Admin panel to review it.</td></tr>',
      "</table></td></tr></table></body></html>",
    ].join("");

    return await sendMail({
      to: adminEmail,
      subject: `[Tournamax] ${subject}`.slice(0, 200),
      html,
      text: `${subject}\n\n${body}`,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Send failed" };
  }
}
