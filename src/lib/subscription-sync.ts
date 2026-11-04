import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  branding,
  customers,
  orders,
  payments,
  plans,
  siteSettings,
  subscriptions,
} from "@/db/schema";
import { daysLeft } from "./utils";

export type TenantSubscriptionStatus = {
  tenant_slug: string;
  tenant_name: string;
  tenant_status: "active" | "suspended" | "deactivated";
  customer_id: number;
  customer_email: string;
  plan_id: number;
  plan_name: string;
  plan_price: number;
  renewal_amount: number;
  currency: string;
  duration_days: number;
  warning_days: number;
  grace_days: number;
  starts_at: string | null;
  expires_at: string | null;
  days_remaining: number;
  hours_remaining: number;
  is_expired: boolean;
  admin_warning: boolean;
  admin_locked: boolean;
  user_locked: boolean;
  upi_id: string;
  upi_name: string;
  lock_message: string;
  warning_message: string;
  user_lock_message: string;
  user_lock_submessage: string;
};

/**
 * Resolves the customer, branding and subscription for a given tenant identifier.
 */
export async function getTenantSubscription(
  tenantSlug: string
): Promise<TenantSubscriptionStatus | null> {
  const slug = (tenantSlug ?? "").trim();
  if (!slug) return null;

  // 1. Find customer by tenantId or fallback
  let customerId: number | null = null;
  let tenantName = "Tournamax App";

  // Try matching branding.tenantId
  const bRows = await db
    .select({
      customerId: branding.customerId,
      appName: branding.appName,
      tenantId: branding.tenantId,
    })
    .from(branding)
    .where(eq(branding.tenantId, slug))
    .limit(1);

  if (bRows[0]) {
    customerId = bRows[0].customerId;
    tenantName = bRows[0].appName || tenantName;
  } else if (/^\d+$/.test(slug)) {
    // If slug is numeric customer ID
    customerId = Number(slug);
  } else {
    // Fallback: search for first active customer or default
    const anyCustomer = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .limit(1);
    if (anyCustomer[0]) {
      customerId = anyCustomer[0].id;
      tenantName = anyCustomer[0].name;
    }
  }

  if (!customerId) return null;

  const [custRows, subRows, planRows, settingsRows] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, customerId)).limit(1),
    db
      .select({ sub: subscriptions, plan: plans })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.customerId, customerId))
      .orderBy(desc(subscriptions.expiresAt))
      .limit(1),
    db.select().from(plans).where(eq(plans.active, true)).orderBy(plans.sort).limit(1),
    db.select().from(siteSettings),
  ]);

  const customer = custRows[0];
  if (!customer) return null;

  // Read platform config overrides from siteSettings
  const settingsMap = new Map(settingsRows.map((s) => [s.key, s.value]));
  const integrations = (settingsMap.get("integrations") as any) ?? {};
  const contact = (settingsMap.get("contact") as any) ?? {};
  const subConfig = (settingsMap.get("subscription_config") as any) ?? {};

  const warningDays = Number(subConfig.warningDays ?? 3) || 3;
  const graceDays = Number(subConfig.graceDays ?? 2) || 2;
  const upiId = (subConfig.upiId || contact.upiId || integrations.upiId || "tournamax@upi").trim();
  const upiName = subConfig.upiName || "Tournamax";

  // Active plan or default ₹50 plan
  const activePlan = subRows[0]?.plan ?? planRows[0];
  const renewalFee = activePlan ? activePlan.priceCents / 100 : 50;

  const sub = subRows[0]?.sub;
  const now = Date.now();

  let daysRemaining = 0;
  let hoursRemaining = 0;
  let isExpired = true;
  let adminWarning = false;
  let adminLocked = true;
  let userLocked = true;

  if (sub && sub.status === "active") {
    const expiresAtMs = new Date(sub.expiresAt).getTime();
    const diffMs = expiresAtMs - now;
    daysRemaining = Math.ceil(diffMs / 86400000);
    hoursRemaining = Math.max(0, Math.ceil(diffMs / 3600000));

    if (diffMs > 0 && customer.status === "active") {
      isExpired = false;
      adminLocked = false;
      userLocked = false;
      // 2–3 days before expiry
      adminWarning = daysRemaining <= warningDays;
    } else {
      // Subscription has expired
      isExpired = true;
      adminLocked = true;
      // User APK delayed lock: locked if unpaid for graceDays (2-3 days) after expiry
      const overdueMs = now - expiresAtMs;
      userLocked = overdueMs >= graceDays * 86400000 || customer.status !== "active";
    }
  } else {
    // No active subscription or revoked/suspended
    isExpired = true;
    adminLocked = true;
    userLocked = true;
  }

  // If customer itself is suspended or deactivated by admin
  if (customer.status !== "active") {
    adminLocked = true;
    userLocked = true;
    adminWarning = false;
  }

  const formattedExpiry = sub?.expiresAt
    ? new Date(sub.expiresAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "N/A";

  return {
    tenant_slug: slug,
    tenant_name: tenantName,
    tenant_status: customer.status,
    customer_id: customer.id,
    customer_email: customer.email,
    plan_id: activePlan?.id ?? 1,
    plan_name: activePlan?.name ?? "Tournament Hosting",
    plan_price: renewalFee,
    renewal_amount: renewalFee,
    currency: activePlan?.currency ?? "INR",
    duration_days: activePlan?.durationDays ?? 30,
    warning_days: warningDays,
    grace_days: graceDays,
    starts_at: sub?.startsAt?.toISOString() ?? null,
    expires_at: sub?.expiresAt?.toISOString() ?? null,
    days_remaining: daysRemaining,
    hours_remaining: hoursRemaining,
    is_expired: isExpired,
    admin_warning: adminWarning,
    admin_locked: adminLocked,
    user_locked: userLocked,
    upi_id: upiId,
    upi_name: upiName,
    lock_message:
      customer.status !== "active"
        ? `Your tournament account is ${customer.status}. Please contact platform administration.`
        : (subConfig.adminLockMessage || `Your hosting subscription expired on ${formattedExpiry}. Management features are restricted until a ₹${renewalFee} renewal payment is verified.`),
    warning_message:
      subConfig.warningMessage || `Your tournament hosting renewal is due in ${daysRemaining} days (${formattedExpiry}). Fee: ₹${renewalFee}.`,
    user_lock_message: subConfig.userLockMessage || "Coming Back Soon",
    user_lock_submessage:
      subConfig.userLockSubmessage ||
      "This tournament app is currently undergoing scheduled maintenance & subscription renewal. Tournaments, squads, and live matches will resume shortly once the organizer completes renewal!",
  };
}
