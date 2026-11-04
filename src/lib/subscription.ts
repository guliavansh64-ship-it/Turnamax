import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, subscriptions } from "@/db/schema";

type AnyTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Atomically activate (new) or extend (existing) the customer's subscription
 * with the given plan. Must be called inside a transaction.
 */
export async function applySubscriptionTo(
  tx: AnyTx,
  customerId: number,
  planId: number
): Promise<{ extended: boolean; expiresAt: Date; planName: string; durationDays: number }> {
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
    const expiresAt = new Date(
      Math.max(current.expiresAt.getTime(), now.getTime()) + plan.durationDays * 86400000
    );
    await tx
      .update(subscriptions)
      .set({
        expiresAt,
        planId: plan.id,
        status: "active",
        updatedAt: now,
      })
      .where(eq(subscriptions.id, current.id));
    return { extended: true, expiresAt, planName: plan.name, durationDays: plan.durationDays };
  }
  const expiresAt = new Date(now.getTime() + plan.durationDays * 86400000);
  await tx.insert(subscriptions).values({
    customerId,
    planId: plan.id,
    status: "active",
    startsAt: now,
    expiresAt,
  });
  return { extended: false, expiresAt, planName: plan.name, durationDays: plan.durationDays };
}
