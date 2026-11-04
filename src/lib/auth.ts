import { cookies } from "next/headers";
import crypto from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  adminSessions,
  admins,
  customerSessions,
  customers,
  resetTokens,
} from "@/db/schema";

export const SESSION_COOKIE = "tl_session";
export const ADMIN_SESSION_COOKIE = "tl_admin_session";
const SESSION_TTL_MS =
  (Number(process.env.SESSION_TTL_DAYS ?? 14) || 14) * 86400000;
const ADMIN_TTL_MS =
  (Number(process.env.ADMIN_SESSION_TTL_HOURS ?? 12) || 12) * 3600000;

export const secureCookie = process.env.NODE_ENV === "production";

export type Customer = typeof customers.$inferSelect;
export type Admin = typeof admins.$inferSelect;

/* ---------- password hashing (scrypt) ---------- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const check = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return (
      check.length === expected.length &&
      crypto.timingSafeEqual(check, expected)
    );
  } catch {
    return false;
  }
}

/* ---------- CSRF-ish origin check for mutating requests ---------- */

export function originOk(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/* ---------- customer sessions ---------- */

export async function createCustomerSession(
  customerId: number,
  ip: string,
  ua: string
): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(customerSessions).values({
    token,
    customerId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    ip: ip.slice(0, 64),
    userAgent: ua.slice(0, 300),
  });
  return token;
}

export async function setCustomerSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearCustomerSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getCurrentCustomer(): Promise<{
  customer: Customer;
  token: string;
} | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ session: customerSessions, customer: customers })
    .from(customerSessions)
    .innerJoin(customers, eq(customerSessions.customerId, customers.id))
    .where(eq(customerSessions.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt.getTime() < Date.now()) return null;
  if (row.customer.status === "deactivated") return null;
  return { customer: row.customer, token };
}

export async function revokeAdminSessions(adminId: number) {
  await db.delete(adminSessions).where(eq(adminSessions.adminId, adminId));
}

export async function revokeCustomerSessionsFor(customerId: number) {
  await db
    .delete(customerSessions)
    .where(eq(customerSessions.customerId, customerId));
}

/* ---------- admin sessions ---------- */

export async function createAdminSession(
  adminId: number,
  ip: string,
  ua: string
): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(adminSessions).values({
    token,
    adminId,
    expiresAt: new Date(Date.now() + ADMIN_TTL_MS),
    ip: ip.slice(0, 64),
    userAgent: ua.slice(0, 300),
  });
  return token;
}

export async function setAdminSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
    maxAge: ADMIN_TTL_MS / 1000,
  });
}

export async function clearAdminSessionCookie() {
  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getCurrentAdmin(): Promise<{
  admin: Admin;
  token: string;
} | null> {
  const jar = await cookies();
  const token = jar.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ session: adminSessions, admin: admins })
    .from(adminSessions)
    .innerJoin(admins, eq(adminSessions.adminId, admins.id))
    .where(eq(adminSessions.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt.getTime() < Date.now()) return null;
  if (!row.admin.active) return null;
  return { admin: row.admin, token };
}

/* ---------- reset / verification tokens ---------- */

export async function issueToken(
  customerId: number,
  purpose: "password_reset" | "email_verify"
): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
  const ttl = purpose === "password_reset" ? 3600000 : 14 * 86400000;
  await db.insert(resetTokens).values({
    customerId,
    tokenHash,
    purpose,
    expiresAt: new Date(Date.now() + ttl),
  });
  return token;
}

export async function consumeToken(
  token: string,
  purpose: "password_reset" | "email_verify"
): Promise<number | null> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const rows = await db
    .select()
    .from(resetTokens)
    .where(
      and(
        eq(resetTokens.tokenHash, tokenHash),
        eq(resetTokens.purpose, purpose),
        isNull(resetTokens.usedAt),
        gt(resetTokens.expiresAt, new Date())
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db
    .update(resetTokens)
    .set({ usedAt: new Date() })
    .where(eq(resetTokens.id, row.id));
  return row.customerId;
}

export function emailEnabled(): boolean {
  return process.env.EMAIL_ENABLED === "1";
}
