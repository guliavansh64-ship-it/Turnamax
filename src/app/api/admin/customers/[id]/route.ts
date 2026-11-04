import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { customers, plans, subscriptions } from "@/db/schema";
import { getCurrentAdmin, originOk } from "@/lib/auth";
import {
  clientIp,
  jsonError,
  jsonOk,
  notify,
  readJsonBody,
  subEffectiveStatus,
} from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function applySubscription(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  customerId: number,
  planId: number
) {
  const planRows = await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
  const plan = planRows[0];
  if (!plan) throw new Error("Plan not found");
  const all = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.customerId, customerId));
  const current = all
    .filter((s) => s.status === "active" && new Date(s.expiresAt) > new Date())
      .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];

  const now = new Date();
  if (current) {
    const newExpiry = new Date(Math.max(current.expiresAt.getTime(), now.getTime()) + plan.durationDays * 86400000);
    await tx
      .update(subscriptions)
      .set({ expiresAt: newExpiry, planId: plan.id, status: "active", updatedAt: now })
      .where(eq(subscriptions.id, current.id));
    return { extended: true, expiresAt: newExpiry, plan };
  }
  const expiresAt = new Date(now.getTime() + plan.durationDays * 86400000);
  await tx.insert(subscriptions).values({
    customerId,
    planId: plan.id,
    status: "active",
    startsAt: now,
    expiresAt,
  });
  return { extended: false, expiresAt, plan };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) return jsonError("Invalid customer.", 400);
  const ip = clientIp(req);
  const body = await readJsonBody(req);
  const action = String(body.action ?? "");

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  const customer = rows[0];
  if (!customer) return jsonError("Customer not found.", 404);

  if (action === "status") {
    const status = String(body.status ?? "");
    if (!["active", "suspended", "deactivated"].includes(status))
      return jsonError("Invalid status.");
    await db
      .update(customers)
      .set({ status: status as "active", updatedAt: new Date() })
      .where(eq(customers.id, customerId));
    await notify(
      customerId,
      status === "suspended" ? "danger" : "info",
      `Account ${status}`,
      status === "active"
        ? "Your account has been re-activated."
        : "Your account status changed by the platform. Contact support for details."
    );
    await logAudit({
      actorType: "admin",
      actorId: cur.admin.id,
      action: "customer.status_changed",
      entity: "customer",
      entityId: String(customerId),
      meta: { status },
      ip,
    });
    return jsonOk();
  }

  if (action === "assign") {
    const planId = Number(body.planId);
    if (!Number.isInteger(planId)) return jsonError("Choose a plan.");
    try {
      const res = await db.transaction((tx) => applySubscription(tx, customerId, planId));
      await notify(
        customerId,
        "success",
        `Subscription ${res.extended ? "extended" : "activated"}: ${res.plan.name}`,
        `An administrator ${res.extended ? "extended" : "assigned"} your subscription to ${res.plan.name} (expires ${res.expiresAt.toLocaleDateString("en-IN")}).`
      );
      await logAudit({
        actorType: "admin",
        actorId: cur.admin.id,
        action: "subscription.admin_assigned",
        entity: "customer",
        entityId: String(customerId),
        meta: { planId, extended: res.extended },
        ip,
      });
      return jsonOk({ expiresAt: res.expiresAt.toISOString() });
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "Failed to assign plan.", 400);
    }
  }

  if (action === "extend" || action === "instant_renew") {
    const days = action === "instant_renew" ? 30 : Math.floor(Number(body.days ?? 0));
    if (!Number.isInteger(days) || days < 1 || days > 730)
      return jsonError("Days must be between 1 and 730.");

    const all = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, customerId));

    const current = all
      .sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime())[0];

    const now = new Date();
    let newExpiry: Date;

    if (!current) {
      const activePlans = await db
        .select()
        .from(plans)
        .where(eq(plans.active, true))
        .orderBy(plans.sort)
        .limit(1);
      const plan = activePlans[0];
      if (!plan) return jsonError("No active plans configured.", 500);

      newExpiry = new Date(now.getTime() + days * 86400000);
      await db.insert(subscriptions).values({
        customerId,
        planId: plan.id,
        status: "active",
        startsAt: now,
        expiresAt: newExpiry,
      });
    } else {
      const baseMs = Math.max(new Date(current.expiresAt).getTime(), now.getTime());
      newExpiry = new Date(baseMs + days * 86400000);
      await db
        .update(subscriptions)
        .set({
          expiresAt: newExpiry,
          status: "active",
          updatedAt: now,
        })
        .where(eq(subscriptions.id, current.id));
    }

    // Reactivate customer if suspended
    if (customer.status !== "active") {
      await db
        .update(customers)
        .set({ status: "active", updatedAt: now })
        .where(eq(customers.id, customerId));
    }

    await notify(
      customerId,
      "success",
      action === "instant_renew" ? "Subscription renewed (30 days)" : "Subscription extended",
      `An administrator ${action === "instant_renew" ? "renewed" : "extended"} your subscription by ${days} day${days === 1 ? "" : "s"} (now expires ${newExpiry.toLocaleDateString("en-IN")}). Both Admin and User APKs are unlocked.`
    );
    await logAudit({
      actorType: "admin",
      actorId: cur.admin.id,
      action: action === "instant_renew" ? "subscription.admin_renewed" : "subscription.admin_extended",
      entity: "customer",
      entityId: String(customerId),
      meta: { days, expiresAt: newExpiry.toISOString() },
      ip,
    });
    return jsonOk({ expiresAt: newExpiry.toISOString() });
  }

  if (action === "revoke") {
    const active = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.customerId, customerId),
          eq(subscriptions.status, "active"),
          gte(subscriptions.expiresAt, new Date())
        )
      );
    if (active.length === 0) return jsonError("No active subscription to revoke.", 404);
    await db
      .update(subscriptions)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(
        and(
          eq(subscriptions.customerId, customerId),
          eq(subscriptions.status, "active")
        )
      );
    await notify(
      customerId,
      "danger",
      "Subscription revoked",
      "An administrator revoked your active subscription. Contact support for details."
    );
    await logAudit({
      actorType: "admin",
      actorId: cur.admin.id,
      action: "subscription.revoked",
      entity: "customer",
      entityId: String(customerId),
      ip,
    });
    return jsonOk();
  }

  return jsonError("Unknown action.");
}
