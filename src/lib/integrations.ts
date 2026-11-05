import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";

/**
 * Integration settings (SMTP + production MySQL) can be stored in the
 * database so they survive environment resets and redeploys. Real
 * environment variables always win when present.
 *
 * Stored under site_settings key = "integrations". Never exposed to the
 * browser: only the admin API returns a masked summary.
 */

export type SmtpSettings = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromAddress: string;
  fromName: string;
  supportEmail: string;
  /** Owner/ops inbox — every important platform email is sent here. */
  adminEmail: string;
  brevoApiKey?: string;
  resendApiKey?: string;
};

export type MysqlSettings = {
  enabled: boolean;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
};

export type ZetpaySettings = {
  enabled: boolean;
  apiKey: string;
  /** ZetPay dashboard mode: "test" shows a simulator, "live" uses real UPI. */
  mode: "test" | "live";
  title: string;
};

export type Integrations = { smtp: SmtpSettings; mysql: MysqlSettings; zetpay: ZetpaySettings };

export const emptyIntegrations: Integrations = {
  smtp: {
    enabled: true,
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    user: "guliavansh64@gmail.com",
    pass: "",
    fromAddress: "rahuldeveloper011@gmail.com",
    fromName: "Tournamax",
    supportEmail: "guliavansh64@gmail.com",
    adminEmail: "guliavansh64@gmail.com",
  },
  mysql: {
    enabled: false,
    host: "",
    port: 3306,
    database: "",
    user: "",
    password: "",
    ssl: false,
  },
  zetpay: {
    enabled: false,
    apiKey: "",
    mode: "live",
    title: "Tournamax subscription",
  },
};

let cache: { value: Integrations; at: number } | null = null;
const TTL_MS = 30_000;

export async function getIntegrations(force = false): Promise<Integrations> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let stored: Partial<Integrations> = {};
  try {
    const rows = await db
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, "integrations"))
      .limit(1);
    stored = (rows[0]?.value ?? {}) as Partial<Integrations>;
  } catch {
    stored = {};
  }
  const value: Integrations = {
    smtp: { ...emptyIntegrations.smtp, ...(stored.smtp ?? {}) },
    mysql: { ...emptyIntegrations.mysql, ...(stored.mysql ?? {}) },
    zetpay: { ...emptyIntegrations.zetpay, ...(stored.zetpay ?? {}) },
  };
  cache = { value, at: Date.now() };
  return value;
}

export async function saveIntegrations(next: Integrations): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ key: "integrations", value: next })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: next, updatedAt: new Date() },
    });
  cache = { value: next, at: Date.now() };
}

/**
 * Effective SMTP config: environment variables take precedence, the database
 * fills in anything missing. Called before building a transport.
 */
export async function resolveSmtp(): Promise<SmtpSettings> {
  const dbv = (await getIntegrations()).smtp;
  const envUser = process.env.SMTP_USER?.trim();
  const envPass = process.env.SMTP_PASS?.trim();
  const enabledEnv = process.env.EMAIL_ENABLED === "1";
  const brevoKey = (process.env.BREVO_API_KEY || dbv.brevoApiKey)?.trim();
  const resendKey = (process.env.RESEND_API_KEY || dbv.resendApiKey)?.trim();

  const merged: SmtpSettings = {
    enabled: Boolean(brevoKey || resendKey || (envUser && envPass) || dbv.enabled || enabledEnv),
    host: process.env.SMTP_HOST?.trim() || dbv.host || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 0) || dbv.port || 465,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE !== "false" : dbv.secure,
    user: envUser || dbv.user || "guliavansh64@gmail.com",
    pass: envPass || dbv.pass,
    fromAddress:
      process.env.MAIL_FROM_ADDRESS?.trim() ||
      dbv.fromAddress ||
      "rahuldeveloper011@gmail.com",
    fromName: process.env.APP_NAME?.trim() || dbv.fromName || "Tournamax",
    supportEmail:
      process.env.SUPPORT_EMAIL?.trim() || dbv.supportEmail || "guliavansh64@gmail.com",
    // The operator's inbox for important platform alerts (new customers,
    // payments awaiting verification, branding submitted, support).
    adminEmail:
      process.env.ADMIN_NOTIFY_EMAIL?.trim() || dbv.adminEmail || "guliavansh64@gmail.com",
    brevoApiKey: brevoKey,
    resendApiKey: process.env.RESEND_API_KEY?.trim() || dbv.resendApiKey?.trim(),
  };
  return merged;
}

/**
 * Effective ZetPay config. `ZETPAY_API_KEY` in the environment wins over the
 * stored value so secrets can still be supplied by the platform.
 */
export async function resolveZetpay(): Promise<ZetpaySettings> {
  const d = (await getIntegrations()).zetpay;
  const envKey = process.env.ZETPAY_API_KEY?.trim();
  const envEnabled = process.env.ZETPAY_ENABLED === "1";
  return {
    // A stored key alone is not enough — the integration must be switched on.
    enabled: envEnabled || d.enabled,
    apiKey: envKey || d.apiKey,
    // ZetPay controls the real mode account-side (Dashboard → Developer Portal).
    // This only labels what the admin expects; the API echoes the actual mode.
    mode: d.mode === "test" ? "test" : "live",
    title: d.title || "Tournamax subscription",
  };
}

export async function resolveMysql(): Promise<MysqlSettings> {
  const dbv = (await getIntegrations()).mysql;
  const envHost = process.env.MYSQL_HOST?.trim();
  if (envHost) {
    return {
      enabled: process.env.MYSQL_ENABLED === "1",
      host: envHost,
      port: Number(process.env.MYSQL_PORT ?? 3306) || 3306,
      database: process.env.MYSQL_DATABASE?.trim() || dbv.database,
      user: process.env.MYSQL_USER?.trim() || dbv.user,
      password: process.env.MYSQL_PASSWORD || dbv.password,
      ssl: process.env.MYSQL_SSL === "true",
    };
  }
  return dbv;
}

export function mask(value: string, keep = 4): string {
  if (!value) return "";
  if (value.length <= keep * 2) return "•".repeat(value.length);
  return `${value.slice(0, keep)}${"•".repeat(Math.max(4, value.length - keep * 2))}${value.slice(-keep)}`;
}
