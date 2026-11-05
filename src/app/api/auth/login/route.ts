import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import {
  createCustomerSession,
  originOk,
  setCustomerSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { clientIp, jsonError, jsonOk, readJsonBody } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { emailEnabled, sendLoginNotificationEmail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const ip = clientIp(req);
  const body = await readJsonBody(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return jsonError("Enter your email and password.");

  if (!rateLimit(`login:${ip}:${email}`, 8, 15 * 60 * 1000))
    return jsonError("Too many login attempts. Try again in 15 minutes.", 429);

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);
  const customer = rows[0];
  const valid = customer && verifyPassword(password, customer.passwordHash);
  if (!customer || !valid) return jsonError("Invalid email or password.", 401);
  if (customer.status === "deactivated")
    return jsonError("This account has been deactivated. Contact support.", 403);

  const userAgent = req.headers.get("user-agent") ?? "";
  const token = await createCustomerSession(customer.id, ip, userAgent);
  await setCustomerSessionCookie(token);
  await logAudit({
    actorType: "customer",
    actorId: customer.id,
    action: "customer.login",
    entity: "customer",
    entityId: String(customer.id),
    ip,
  });

  // Send security login notification to the customer's Gmail
  if (await emailEnabled()) {
    void sendLoginNotificationEmail(customer.email, customer.name, {
      ip,
      userAgent,
      time: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }) + " IST",
    });
  }

  return jsonOk({ id: customer.id });
}
