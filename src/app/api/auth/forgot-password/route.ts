import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { issueToken, originOk } from "@/lib/auth";
import { absoluteUrl, emailEnabled, sendPasswordResetEmail } from "@/lib/mailer";
import { clientIp, jsonError, jsonOk, readJsonBody } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const ip = clientIp(req);
  const body = await readJsonBody(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return jsonError("Enter your email.");
  if (!rateLimit(`forgot:${ip}:${email}`, 3, 60 * 60 * 1000))
    return jsonError("Too many requests. Try again later.", 429);

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);
  const customer = rows[0];

  // Never reveal whether the account exists
  let resetUrl: string | undefined;
  if (customer && customer.status !== "deactivated") {
    const token = await issueToken(customer.id, "password_reset");
    const path = `/reset-password/${token}`;
    if (await emailEnabled()) {
      const res = await sendPasswordResetEmail(
        customer.email,
        customer.name,
        absoluteUrl(req, path)
      );
      // Fall back to on-screen link only if delivery actually failed.
      if (!res.ok) resetUrl = path;
    } else {
      resetUrl = path;
    }
    await logAudit({
      actorType: "customer",
      actorId: customer.id,
      action: "customer.password_reset_requested",
      entity: "customer",
      entityId: String(customer.id),
      ip,
    });
  }
  return jsonOk({
    message: "If that email is registered, a reset link has been issued.",
    resetUrl,
  });
}
