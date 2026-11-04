import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import {
  consumeToken,
  createCustomerSession,
  hashPassword,
  originOk,
  revokeCustomerSessionsFor,
  setCustomerSessionCookie,
} from "@/lib/auth";
import { clientIp, jsonError, jsonOk, readJsonBody } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const ip = clientIp(req);
  if (!rateLimit(`reset:${ip}`, 6, 15 * 60 * 1000))
    return jsonError("Too many attempts. Try again later.", 429);

  const body = await readJsonBody(req);
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  if (!token) return jsonError("Missing reset token.");
  if (password.length < 8 || password.length > 100)
    return jsonError("Password must be at least 8 characters.");

  const customerId = await consumeToken(token, "password_reset");
  if (customerId == null)
    return jsonError("This reset link is invalid or has expired.", 400);

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  const customer = rows[0];
  if (!customer) return jsonError("Account not found.", 404);

  await db
    .update(customers)
    .set({ passwordHash: hashPassword(password), updatedAt: new Date() })
    .where(eq(customers.id, customerId));

  await revokeCustomerSessionsFor(customerId);
  const sessionToken = await createCustomerSession(
    customerId,
    ip,
    req.headers.get("user-agent") ?? ""
  );
  await setCustomerSessionCookie(sessionToken);
  await logAudit({
    actorType: "customer",
    actorId: customerId,
    action: "customer.password_reset",
    entity: "customer",
    entityId: String(customerId),
    ip,
  });
  return jsonOk();
}
