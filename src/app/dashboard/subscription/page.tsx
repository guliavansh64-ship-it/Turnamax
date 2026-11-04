import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { branding, orders, payments } from "@/db/schema";
import { getCurrentCustomer } from "@/lib/auth";
import {
  daysLeft,
  formatDateTime,
  formatMoney,
  getCustomerSubscription,
  subEffectiveStatus,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage() {
  const cur = await getCurrentCustomer();
  if (!cur) redirect("/login");
  const c = cur.customer;

  const sub = await getCustomerSubscription(c.id);
  const subStatus = subEffectiveStatus(sub?.sub);
  const [payRows, brandRows] = await Promise.all([
    db
      .select({ pay: payments, order: orders })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(eq(payments.customerId, c.id))
      .orderBy(desc(payments.createdAt))
      .limit(50),
    db.select().from(branding).where(eq(branding.customerId, c.id)).limit(1),
  ]);

  const brand = brandRows[0] ?? null;
  const tenantSlug = brand?.tenantId || `tenant-${c.id}`;

  const now = Date.now();
  const expiresAtMs = sub?.sub ? new Date(sub.sub.expiresAt).getTime() : 0;
  const diffMs = expiresAtMs - now;
  const daysRemaining = Math.ceil(diffMs / 86400000);
  const hoursRemaining = Math.max(0, Math.ceil(diffMs / 3600000));
  const isExpiringSoon = subStatus === "active" && daysRemaining <= 3 && daysRemaining > 0;
  const isAdminLocked = subStatus !== "active" || c.status !== "active";
  const isUserLocked = isAdminLocked && (now - expiresAtMs >= 2 * 86400000 || c.status !== "active");

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker mb-2">Subscription</p>
        <h1 className="h-display text-3xl font-bold">Plan & payment history</h1>
      </div>

      {/* Expiry Warning Banner (2-3 days before expiry) */}
      {isExpiringSoon && (
        <div className="card p-5 border-amber-500/50 bg-amber-500/10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-bold text-amber-300">Subscription Expiring Soon ({daysRemaining} days left)</p>
              <p className="text-sm text-mist">
                Your tournament hosting renewal is due in {daysRemaining} days ({formatDateTime(sub?.sub?.expiresAt)}). The renewal fee is ₹50.
              </p>
            </div>
          </div>
          <Link href={`/checkout?plan=${sub?.plan.id}`} className="btn btn-volt btn-sm">
            ⚡ Renew Now (₹50)
          </Link>
        </div>
      )}

      {/* Immediate Expiry Lock Alert */}
      {isAdminLocked && sub && (
        <div className="card p-5 border-red-500/50 bg-red-500/10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="font-bold text-red-400">Tournament Apps Restricted — Renewal Required</p>
              <p className="text-sm text-mist">
                Your hosting subscription has expired. Tournament Admin APK features are currently restricted. Renew now for ₹50 to instantly restore full access.
              </p>
            </div>
          </div>
          <Link href={`/checkout?plan=${sub.plan.id}`} className="btn btn-coral btn-sm">
            ⚡ Pay ₹50 & Unlock Now
          </Link>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="card p-6 lg:col-span-2">
          <h2 className="font-bold text-lg mb-5">Current subscription</h2>
          {sub ? (
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <span className="h-display text-2xl font-bold">{sub.plan.name}</span>
                <span
                  className={`tag ${
                    subStatus === "active"
                      ? "tag-green"
                      : subStatus === "expired"
                      ? "tag-amber"
                      : "tag-red"
                  }`}
                >
                  {subStatus}
                </span>
                <span className="mono text-[11px] text-mist">
                  {sub.plan.cycle} · {sub.plan.durationDays} days
                </span>
              </div>
              <div className="grid sm:grid-cols-3 gap-4 mb-6">
                <div>
                  <p className="label">Renewal fee</p>
                  <p className="mono text-lg font-bold text-volt">
                    {formatMoney(sub.plan.priceCents, sub.plan.currency)}
                  </p>
                </div>
                <div>
                  <p className="label">Time remaining</p>
                  <p className={`text-sm font-semibold ${isExpiringSoon ? "text-amber-400" : isAdminLocked ? "text-coral" : "text-green-400"}`}>
                    {subStatus === "active" ? `${daysRemaining}d (${hoursRemaining}h)` : "Expired"}
                  </p>
                </div>
                <div>
                  <p className="label">Renewal / Expiry date</p>
                  <p className={`text-sm ${isExpiringSoon ? "text-gold font-bold" : ""}`}>
                    {formatDateTime(sub.sub.expiresAt)}
                  </p>
                </div>
              </div>

              {/* Real-Time APK Synchronization Status */}
              <div className="p-4 bg-ink/60 border border-line rounded-xl mb-6">
                <h4 className="kicker dim mb-3">Live Platform Synchronization</h4>
                <div className="grid sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-mist block mb-1">Tenant ID</span>
                    <code className="text-volt font-bold text-sm">{tenantSlug}</code>
                  </div>
                  <div>
                    <span className="text-mist block mb-1">Tournament Admin APK</span>
                    <span className={`inline-flex items-center gap-1.5 font-semibold ${isAdminLocked ? "text-coral" : "text-green-400"}`}>
                      <span className={`size-2 rounded-full ${isAdminLocked ? "bg-coral" : "bg-green-400 animate-pulse"}`}></span>
                      {isAdminLocked ? "Locked (Renewal Due)" : "Active & Unlocked"}
                    </span>
                  </div>
                  <div>
                    <span className="text-mist block mb-1">Tournament User APK</span>
                    <span className={`inline-flex items-center gap-1.5 font-semibold ${isUserLocked ? "text-coral" : "text-green-400"}`}>
                      <span className={`size-2 rounded-full ${isUserLocked ? "bg-coral" : "bg-green-400 animate-pulse"}`}></span>
                      {isUserLocked ? "Coming Back Soon (Locked)" : "Active & Unlocked"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href={`/checkout?plan=${sub.plan.id}`} className="btn btn-volt">
                  {subStatus === "active" ? "⚡ Renew now (₹50)" : "Reactivate now (₹50)"}
                </Link>
                <Link href="/checkout" className="btn btn-ghost">
                  Choose a different plan
                </Link>
              </div>
            </div>
          ) : (
            <div className="empty mb-5">
              <p className="text-sm mb-4">You don&apos;t have a subscription yet.</p>
              <Link href="/checkout" className="btn btn-volt btn-sm">
                Pick a plan
              </Link>
            </div>
          )}

        </div>

        <div className="card p-6">
          <h2 className="font-bold text-lg mb-4">Automatic Lock & Renewal Policy</h2>
          <ul className="space-y-3 text-sm text-mist">
            <li className="flex gap-2">
              <span className="text-volt">•</span> <strong>₹50 Renewal Fee:</strong> One renewal extends both your User Panel and Admin Panel APKs for 30 days.
            </li>
            <li className="flex gap-2">
              <span className="text-amber-400">•</span> <strong>2–3 Days Warning:</strong> A dismissible notice appears in your Admin APK before the expiry date.
            </li>
            <li className="flex gap-2">
              <span className="text-coral">•</span> <strong>Immediate Admin Lock:</strong> If not renewed on expiry, Admin APK features lock immediately with a renewal screen.
            </li>
            <li className="flex gap-2">
              <span className="text-coral">•</span> <strong>User APK Grace Lock:</strong> If unpaid for 2–3 days after expiry, User APK displays a “Coming Back Soon” screen.
            </li>
            <li className="flex gap-2">
              <span className="text-green-400">•</span> <strong>Instant Auto-Unlock:</strong> Renew from either the Admin APK or this dashboard. When verified, all APKs unlock automatically!
            </li>
          </ul>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <h2 className="font-bold text-lg">Payment history</h2>
        </div>
        {payRows.length === 0 ? (
          <div className="p-6">
            <div className="empty">
              <p className="text-sm">No payments yet. Your order records will appear here.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Status</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {payRows.map(({ pay, order }) => (
                  <tr key={pay.id}>
                    <td className="mono text-[12px]">{order.orderCode}</td>
                    <td className="text-mist whitespace-nowrap">
                      {formatDateTime(pay.createdAt)}
                    </td>
                    <td className="mono">
                      {formatMoney(pay.amountCents, pay.currency)}
                      {order.setupFeeCents > 0 && (
                        <div className="text-[10px] text-mist mt-0.5">
                          incl. {formatMoney(order.setupFeeCents, pay.currency)} one-time setup
                        </div>
                      )}
                    </td>
                    <td className="mono text-[12px] text-mist max-w-[180px] truncate">
                      {pay.reference ?? "—"}
                    </td>
                    <td>
                      <span
                        className={`tag ${
                          pay.status === "approved"
                            ? "tag-green"
                            : pay.status === "pending"
                            ? "tag-amber"
                            : pay.status === "refunded"
                            ? "tag-blue"
                            : "tag-red"
                        }`}
                      >
                        {pay.status}
                      </span>
                    </td>
                    <td className="text-mist text-[12px] max-w-[240px]">
                      {pay.status === "rejected"
                        ? pay.rejectReason
                        : pay.status === "refunded"
                        ? "Refunded by administrator"
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
