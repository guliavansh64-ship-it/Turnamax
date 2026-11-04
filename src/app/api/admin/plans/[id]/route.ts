import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, subscriptions } from "@/db/schema";
import { getCurrentAdmin, originOk } from "@/lib/auth";
import { clientIp, jsonError, jsonOk, readJsonBody } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const { id } = await params;
  const planId = Number(id);
  if (!Number.isInteger(planId)) return jsonError("Invalid plan.", 400);
  const ip = clientIp(req);
  const body = await readJsonBody(req);

  const rows = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  const plan = rows[0];
  if (!plan) return jsonError("Plan not found.", 404);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name != null) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 40) return jsonError("Plan name must be 2–40 characters.");
    patch.name = name;
  }
  if (body.cycle != null) {
    const cycle = String(body.cycle);
    if (!["monthly", "yearly"].includes(cycle)) return jsonError("Invalid cycle.");
    patch.cycle = cycle;
  }
  if (body.price != null) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) return jsonError("Invalid price.");
    patch.priceCents = Math.round(price * 100);
  }
  if (body.setupFee != null) {
    const setupFee = Number(body.setupFee);
    if (!Number.isFinite(setupFee) || setupFee < 0 || setupFee > 1_000_000)
      return jsonError("Invalid setup fee.");
    patch.setupFeeCents = Math.round(setupFee * 100);
  }
  if (body.durationDays != null) {
    const d = Math.floor(Number(body.durationDays));
    if (!Number.isInteger(d) || d < 1 || d > 730) return jsonError("Duration must be 1–730 days.");
    patch.durationDays = d;
  }
  if (body.description != null) patch.description = String(body.description).trim().slice(0, 200);
  if (body.features != null) {
    const features = String(body.features)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (features.length === 0) return jsonError("At least one feature is required.");
    patch.features = features;
  }
  if (body.active != null) patch.active = Boolean(body.active);
  if (body.featured != null) patch.featured = Boolean(body.featured);

  await db.update(plans).set(patch).where(eq(plans.id, planId));
  await logAudit({
    actorType: "admin",
    actorId: cur.admin.id,
    action: "plan.updated",
    entity: "plan",
    entityId: String(planId),
    meta: { changed: Object.keys(patch).filter((k) => k !== "updatedAt") },
    ip,
  });
  return jsonOk();
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!originOk(_req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const { id } = await params;
  const planId = Number(id);
  const rows = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  const plan = rows[0];
  if (!plan) return jsonError("Plan not found.", 404);

  const used = await db
    .select({ n: count() })
    .from(subscriptions)
    .where(eq(subscriptions.planId, planId));
  if ((used[0]?.n ?? 0) > 0) {
    // Deactivate instead of deleting, to keep subscription history intact.
    await db.update(plans).set({ active: false, updatedAt: new Date() }).where(eq(plans.id, planId));
    await logAudit({
      actorType: "admin",
      actorId: cur.admin.id,
      action: "plan.deactivated",
      entity: "plan",
      entityId: String(planId),
      ip: clientIp(_req),
    });
    return jsonOk({ deactivated: true });
  }
  await db.delete(plans).where(eq(plans.id, planId));
  await logAudit({
    actorType: "admin",
    actorId: cur.admin.id,
    action: "plan.deleted",
    entity: "plan",
    entityId: String(planId),
    ip: clientIp(_req),
  });
  return jsonOk({ deleted: true });
}
