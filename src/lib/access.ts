import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, subscriptions } from "@/db/schema";

/** Days after expiry during which prepared APKs remain downloadable. */
export const GRACE_DAYS = Number(process.env.DOWNLOAD_GRACE_DAYS ?? 7) || 7;
export const GRACE_MS = GRACE_DAYS * 24 * 60 * 60 * 1000;

export type PlanAccess = {
  /** True when a paid term is currently active. */
  active: boolean;
  /** True inside the post-expiry grace window (downloads only). */
  grace: boolean;
  planName: string | null;
  expiresAt: Date | null;
  startsAt: Date | null;
  daysLeft: number;
  reason: "active" | "grace" | "expired" | "none";
};

/**
 * Single source of truth for subscription enforcement.
 *
 * Server-side only. Widgets may hide UI, but every protected route/action
 * must call this (or check the returned flag) before doing paid work.
 */
export async function getPlanAccess(customerId: number): Promise<PlanAccess> {
  const rows = await db
    .select({ sub: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.customerId, customerId), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.expiresAt))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return {
      active: false,
      grace: false,
      planName: null,
      expiresAt: null,
      startsAt: null,
      daysLeft: 0,
      reason: "none",
    };
  }

  const now = Date.now();
  const expires = row.sub.expiresAt.getTime();
  const active = expires > now;
  const grace = !active && now - expires <= GRACE_MS;
  return {
    active,
    grace,
    planName: row.plan.name,
    expiresAt: row.sub.expiresAt,
    startsAt: row.sub.startsAt,
    daysLeft: active ? Math.max(1, Math.ceil((expires - now) / 86_400_000)) : 0,
    reason: active ? "active" : grace ? "grace" : "expired",
  };
}

export const PLAN_LOCK_MESSAGE =
  "An active subscription is required. Choose your plan and complete payment verification to unlock this feature.";

export const DOWNLOAD_LOCK_MESSAGE =
  "Your subscription is not active. Renew your plan to restore downloads — your APK files stay stored and are never deleted.";
