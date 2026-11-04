import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { getCurrentCustomer, hashPassword, originOk, verifyPassword } from "@/lib/auth";
import { clientIp, jsonError, jsonOk, readJsonBody } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentCustomer();
  if (!cur) return jsonError("Not authenticated.", 401);
  const ip = clientIp(req);
  const body = await readJsonBody(req);

  const name = body.name != null ? String(body.name).trim() : undefined;
  const password = body.password != null ? String(body.password) : undefined;
  const currentPassword = body.currentPassword != null ? String(body.currentPassword) : undefined;

  if (name !== undefined && (name.length < 2 || name.length > 80))
    return jsonError("Name must be 2–80 characters.");
  if (password !== undefined) {
    if (!currentPassword || !verifyPassword(currentPassword, cur.customer.passwordHash))
      return jsonError("Current password is incorrect.");
    if (password.length < 8 || password.length > 100)
      return jsonError("New password must be at least 8 characters.");
  }
  if (name === undefined && password === undefined)
    return jsonError("Nothing to update.");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) patch.name = name;
  if (password !== undefined) patch.passwordHash = hashPassword(password);
  await db
    .update(customers)
    .set(patch)
    .where(eq(customers.id, cur.customer.id));

  await logAudit({
    actorType: "customer",
    actorId: cur.customer.id,
    action: "customer.profile_updated",
    entity: "customer",
    entityId: String(cur.customer.id),
    meta: { changed: [name !== undefined ? "name" : "", password !== undefined ? "password" : ""].filter(Boolean) },
    ip,
  });
  return jsonOk();
}
