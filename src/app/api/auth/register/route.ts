import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import {
  createCustomerSession,
  hashPassword,
  issueToken,
  originOk,
  setCustomerSessionCookie,
} from "@/lib/auth";
import {
  absoluteUrl,
  emailEnabled,
  sendVerificationEmail,
} from "@/lib/mailer";
import { clientIp, jsonError, jsonOk, readJsonBody } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { sendAdminAlert } from "@/lib/mailer";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const ip = clientIp(req);
  if (!rateLimit(`register:${ip}`, 6, 60 * 60 * 1000))
    return jsonError("Too many registration attempts. Please try again later.", 429);

  const body = await readJsonBody(req);
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (name.length < 2 || name.length > 80)
    return jsonError("Please enter your full name (2–80 characters).");
  if (!EMAIL_RE.test(email) || email.length > 160)
    return jsonError("Please enter a valid email address.");
  if (password.length < 8 || password.length > 100)
    return jsonError("Password must be at least 8 characters.");

  const existing = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);
  if (existing.length > 0)
    return jsonError("An account with this email already exists.", 409);

  const [customer] = await db
    .insert(customers)
    .values({ name, email, passwordHash: hashPassword(password), emailVerified: true })
    .returning();

  const token = await createCustomerSession(customer.id, ip, req.headers.get("user-agent") ?? "");
  await setCustomerSessionCookie(token);
  await logAudit({
    actorType: "customer",
    actorId: customer.id,
    action: "customer.registered",
    entity: "customer",
    entityId: String(customer.id),
    ip,
  });

  const verifyToken = await issueToken(customer.id, "email_verify");
  const path = `/verify-email?token=${verifyToken}`;
  const link = absoluteUrl(req, path);

  // Send the verification email. If email is not configured (or fails), we
  // surface the one-time link on-screen so the flow still works in demo mode.
  let verifyUrl: string | undefined;
  if (await emailEnabled()) {
    const res = await sendVerificationEmail(customer.email, customer.name, link);
    if (!res.ok) verifyUrl = path;
  } else {
    verifyUrl = path;
  }

  // Operator inbox — see Admin → System.

  void sendAdminAlert(

    "New customer registered",

    "A new account just signed up and may soon submit a plan order or branding details.",

    { Name: customer.name, Email: customer.email, Joined: customer.createdAt.toISOString() }

  );


  return jsonOk({ id: customer.id, verifyUrl, emailed: verifyUrl === undefined });
}
