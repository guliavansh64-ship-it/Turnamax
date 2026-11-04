import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { consumeToken } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return jsonError("Missing token.");
  const customerId = await consumeToken(token, "email_verify");
  if (customerId == null)
    return jsonError("This verification link is invalid or has expired.", 400);
  await db
    .update(customers)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(customers.id, customerId));
  await logAudit({
    actorType: "customer",
    actorId: customerId,
    action: "customer.email_verified",
    entity: "customer",
    entityId: String(customerId),
  });
  return jsonOk();
}
