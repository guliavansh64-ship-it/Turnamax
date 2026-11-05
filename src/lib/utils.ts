import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { daysLeft } from "./format";
import {
  customers,
  notifications,
  plans,
  siteSettings,
  subscriptions,
} from "@/db/schema";
import { emailEnabled, sendNoticeEmail } from "./mailer";

export const APP_NAME = process.env.APP_NAME ?? "Tournamax";
export const GRACE_MS =
  (Number(process.env.DOWNLOAD_GRACE_DAYS ?? 7) || 7) * 86400000;
export const APK_MAX_BYTES =
  (Number(process.env.APK_MAX_MB ?? 150) || 150) * 1024 * 1024;
export const LOGO_MAX_BYTES =
  (Number(process.env.LOGO_MAX_MB ?? 2) || 2) * 1024 * 1024;
export const PROOF_MAX_BYTES =
  (Number(process.env.PROOF_MAX_MB ?? 5) || 5) * 1024 * 1024;
export const EMAIL_ENABLED = process.env.EMAIL_ENABLED === "1";

/* ---------- request helpers ---------- */

export function clientIp(req?: Request | null): string {
  const fwd = req?.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return "local";
}

export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const d: unknown = await req.json();
    return d && typeof d === "object" ? (d as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function jsonOk(data: Record<string, unknown> = {}) {
  return Response.json({ ok: true, ...data });
}

export function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

/* ---------- text & ids ---------- */

export {
  formatMoney,
  formatDate,
  formatDateTime,
  daysLeft,
  truncate,
  slugify,
} from "./format";

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function sha256Hex(data: Uint8Array): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function newOrderCode(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `TNT-${ymd}-${rand}`;
}

/* ---------- storage ---------- */

export function storageRoot(): string {
  return process.env.STORAGE_DIR || path.join(process.cwd(), "storage");
}

export async function ensureDir(sub: string) {
  await fs.mkdir(path.join(storageRoot(), sub), { recursive: true });
}

export function storagePath(sub: string, name: string): string {
  // Never allow path traversal into sub
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "");
  return path.join(storageRoot(), sub, safe);
}

export function safeUploadName(prefix: string, ext: string): string {
  return `${prefix}-${crypto.randomBytes(12).toString("hex")}.${ext.toLowerCase()}`;
}

/* ---------- file magic-byte validation ---------- */

export function isApkBuffer(buf: Buffer, fileName: string): boolean {
  if (!/\.apk$/i.test(fileName)) return false;
  // ZIP local file header (PK\x03\x04) or empty archive (PK\x05\x06)
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

export function isImageBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return true; // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // JPEG
  if (
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WEBP"
  )
    return true;
  return false;
}

export function isPdfBuffer(buf: Buffer): boolean {
  return buf.length > 5 && buf.slice(0, 5).toString("ascii") === "%PDF-";
}

export function imageExt(name: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  const ext = m?.[1]?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "webp"].includes(ext) ? ext : null;
}

/* ---------- subscription policy ---------- */

export type SubLike = { status: string; expiresAt: Date | string } | null | undefined;

export function subEffectiveStatus(sub: SubLike): "active" | "expired" | "revoked" | null {
  if (!sub) return null;
  if (sub.status === "revoked") return "revoked";
  if (new Date(sub.expiresAt).getTime() < Date.now()) return "expired";
  return "active";
}

/** Download policy: active, or within the configured grace window after expiry. */
export function canDownloadApk(sub: SubLike): boolean {
  if (!sub || sub.status === "revoked") return false;
  return new Date(sub.expiresAt).getTime() - Date.now() >= -GRACE_MS;
}

export async function getCustomerSubscription(customerId: number) {
  const rows = await db
    .select({ sub: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.customerId, customerId))
    .orderBy(desc(subscriptions.expiresAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function ensureExpiryWarning(customerId: number) {
  const cur = await getCustomerSubscription(customerId);
  if (!cur) return;
  const st = subEffectiveStatus(cur.sub);
  if (st !== "active") return;
  const d = daysLeft(cur.sub.expiresAt);
  if (d > 7) return;
  const recent = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.customerId, customerId),
        eq(notifications.type, "warning"),
        gt(notifications.createdAt, new Date(Date.now() - 7 * 86400000))
      )
    )
    .limit(1);
  if (recent.length > 0) return;
  await notify(
    customerId,
    "warning",
    d <= 0
      ? "Your subscription has expired"
      : `Your subscription expires in ${d} day${d === 1 ? "" : "s"}`,
    "Renew from the dashboard to keep download access and app permissions active."
  );
}

/* ---------- site settings ---------- */

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const rows = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1);
  return (rows[0]?.value as T) ?? null;
}

export async function setSetting(key: string, value: unknown) {
  await db
    .insert(siteSettings)
    .values({ key, value: value as never, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value: value as never, updatedAt: new Date() },
    });
}

/* ---------- notifications ---------- */

/**
 * Creates an in-app notification AND (when email is configured) sends the
 * customer a transactional email. Never throws — email failure must not
 * break the business action that triggered it.
 */
export async function notify(
  customerId: number,
  type: "info" | "success" | "warning" | "danger",
  title: string,
  body = ""
) {
  try {
    await db.insert(notifications).values({ customerId, type, title, body });
  } catch {
    /* non-fatal */
  }
  if (!(await emailEnabled())) return;
  try {
    const rows = await db
      .select({ email: customers.email, name: customers.name })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    const c = rows[0];
    if (!c) return;
    await sendNoticeEmail(c.email, c.name, title, body);
  } catch {
    /* non-fatal */
  }
}
