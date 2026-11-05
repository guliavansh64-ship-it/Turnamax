import { getCurrentAdmin, originOk } from "@/lib/auth";
import { getIntegrations, resolveSmtp, saveIntegrations, type Integrations } from "@/lib/integrations";
import { clientIp, jsonError, jsonOk, readJsonBody } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Returns current values. Passwords are returned as a boolean, never echoed. */
export async function GET() {
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const cfg = await getIntegrations(true);
  const resolved = await resolveSmtp();
  const activeBrevo = resolved.brevoApiKey;
  return jsonOk({
    smtp: {
      enabled: resolved.enabled,
      host: resolved.host,
      port: resolved.port,
      secure: resolved.secure,
      user: resolved.user,
      fromAddress: resolved.fromAddress,
      fromName: resolved.fromName,
      supportEmail: resolved.supportEmail,
      adminEmail: resolved.adminEmail,
      hasPassword: Boolean(cfg.smtp.pass),
      hasBrevoKey: Boolean(activeBrevo),
      brevoKeyPreview: activeBrevo
        ? `${activeBrevo.slice(0, 8)}••••••••`
        : "",
    },
    zetpay: {
      enabled: cfg.zetpay.enabled,
      mode: cfg.zetpay.mode,
      title: cfg.zetpay.title,
      hasKey: Boolean(cfg.zetpay.apiKey),
      keyPreview: cfg.zetpay.apiKey
        ? `${cfg.zetpay.apiKey.slice(0, 4)}${"•".repeat(20)}${cfg.zetpay.apiKey.slice(-4)}`
        : "",
    },
    mysql: {
      enabled: cfg.mysql.enabled,
      host: cfg.mysql.host,
      port: cfg.mysql.port,
      database: cfg.mysql.database,
      user: cfg.mysql.user,
      ssl: cfg.mysql.ssl,
      hasPassword: Boolean(cfg.mysql.password),
    },
  });
}

export async function PUT(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  if (cur.admin.role !== "owner")
    return jsonError("Only the platform owner can change integrations.", 403);

  const body = await readJsonBody(req);
  const current = await getIntegrations(true);
  const next: Integrations = {
    smtp: { ...current.smtp },
    mysql: { ...current.mysql },
    zetpay: { ...current.zetpay },
  };

  if (body.smtp && typeof body.smtp === "object") {
    const s = body.smtp as Record<string, unknown>;
    if (s.enabled !== undefined) next.smtp.enabled = Boolean(s.enabled);
    if (s.host !== undefined) next.smtp.host = String(s.host).trim();
    if (s.port !== undefined) next.smtp.port = Number(s.port) || 465;
    if (s.secure !== undefined) next.smtp.secure = Boolean(s.secure);
    if (s.user !== undefined && String(s.user).trim().length > 0 && !String(s.user).includes("•"))
      next.smtp.user = String(s.user).trim();
    if (s.pass !== undefined && String(s.pass).length > 0)
      next.smtp.pass = String(s.pass).trim();
    if (s.fromAddress !== undefined && String(s.fromAddress).trim().length > 0 && !String(s.fromAddress).includes("•"))
      next.smtp.fromAddress = String(s.fromAddress).trim();
    if (s.fromName !== undefined) next.smtp.fromName = String(s.fromName).trim();
    if (s.supportEmail !== undefined && !String(s.supportEmail).includes("•"))
      next.smtp.supportEmail = String(s.supportEmail).trim();
    if (s.adminEmail !== undefined && !String(s.adminEmail).includes("•"))
      next.smtp.adminEmail = String(s.adminEmail).trim();
    if (s.brevoApiKey !== undefined && String(s.brevoApiKey).length > 0 && !String(s.brevoApiKey).includes("•"))
      next.smtp.brevoApiKey = String(s.brevoApiKey).trim();
  }

  if (body.mysql && typeof body.mysql === "object") {
    const m = body.mysql as Record<string, unknown>;
    if (m.enabled !== undefined) next.mysql.enabled = Boolean(m.enabled);
    if (m.host !== undefined) next.mysql.host = String(m.host).trim();
    if (m.port !== undefined) next.mysql.port = Number(m.port) || 3306;
    if (m.database !== undefined) next.mysql.database = String(m.database).trim();
    if (m.user !== undefined) next.mysql.user = String(m.user).trim();
    if (m.password !== undefined && String(m.password).length > 0)
      next.mysql.password = String(m.password);
    if (m.ssl !== undefined) next.mysql.ssl = Boolean(m.ssl);
  }

  if (next.smtp.enabled) {
    const hasHttpApi = Boolean(
      next.smtp.brevoApiKey ||
        process.env.BREVO_API_KEY ||
        next.smtp.resendApiKey ||
        process.env.RESEND_API_KEY
    );
    if (!hasHttpApi) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(next.smtp.user))
        return jsonError("SMTP username must be a valid email address.");
      if (!next.smtp.pass) return jsonError("SMTP app password is required.");
      if (![465, 587, 25].includes(next.smtp.port))
        return jsonError("SMTP port should be 465 (TLS), 587 or 25.");
    }
  }
  if (body.zetpay && typeof body.zetpay === "object") {
    const z = body.zetpay as Record<string, unknown>;
    if (z.enabled !== undefined) next.zetpay.enabled = Boolean(z.enabled);
    if (z.apiKey !== undefined && String(z.apiKey).length > 0)
      next.zetpay.apiKey = String(z.apiKey).trim();
    if (z.title !== undefined) next.zetpay.title = String(z.title).trim().slice(0, 100);
    if (z.mode !== undefined) next.zetpay.mode = z.mode === "test" ? "test" : "live";
  }
  if (next.zetpay.enabled) {
    if (next.zetpay.apiKey && next.zetpay.apiKey.length !== 32)
      return jsonError("ZetAPI key should be 32 characters (Dashboard → Developer Portal → Zap API).");
    if (!next.zetpay.apiKey) return jsonError("ZetAPI key is required to enable ZetPay.");
  }

  if (next.mysql.enabled) {
    if (!next.mysql.host) return jsonError("MySQL host is required.");
    if (!next.mysql.user) return jsonError("MySQL username is required.");
  }

  await saveIntegrations(next);
  await logAudit({
    actorType: "admin",
    actorId: cur.admin.id,
    action: "system.integrations_updated",
    entity: "system",
    meta: {
      smtpEnabled: next.smtp.enabled,
      mysqlEnabled: next.mysql.enabled,
      zetpayEnabled: next.zetpay.enabled,
    },
    ip: clientIp(req),
  });
  return jsonOk();
}
