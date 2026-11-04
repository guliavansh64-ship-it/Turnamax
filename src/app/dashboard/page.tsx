import Link from "next/link";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  apkReleases,
  branding,
  notifications,
  orders,
  payments,
  siteSettings,
} from "@/db/schema";
import { getCurrentCustomer } from "@/lib/auth";
import {
  daysLeft,
  ensureExpiryWarning,
  formatDateTime,
  formatMoney,
  getCustomerSubscription,
  subEffectiveStatus,
  getSetting,
} from "@/lib/utils";
import ActionForm from "@/components/action-form";
import PlanCTA from "@/components/plan-cta";
import { plans as plansTable } from "@/db/schema";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function StatusTag({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    active: "tag-green",
    expired: "tag-amber",
    revoked: "tag-red",
    pending: "tag-amber",
    approved: "tag-green",
    rejected: "tag-red",
    refunded: "tag-blue",
  };
  return (
    <span className={`tag ${map[status ?? ""] ?? "tag-gray"}`}>{status ?? "none"}</span>
  );
}

export default async function DashboardOverview() {
  const cur = await getCurrentCustomer();
  if (!cur) redirect("/login");
  const c = cur.customer;

  await ensureExpiryWarning(c.id);

  const [sub, latestPayRows, brandRows, notifs, settingRow, planRows, orderCount] = await Promise.all([
    getCustomerSubscription(c.id),
    db
      .select({ pay: payments, order: orders })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(eq(payments.customerId, c.id))
      .orderBy(desc(payments.createdAt))
      .limit(1),
    db.select().from(branding).where(eq(branding.customerId, c.id)).limit(1),
    db
      .select()
      .from(notifications)
      .where(eq(notifications.customerId, c.id))
      .orderBy(desc(notifications.createdAt))
      .limit(8),
    db.select().from(siteSettings).where(eq(siteSettings.key, "announcements")).limit(1),
    db
      .select()
      .from(plansTable)
      .where(eq(plansTable.active, true))
      .orderBy(plansTable.sort)
      .limit(1),
    db.select({ id: orders.id }).from(orders).where(eq(orders.customerId, c.id)).limit(1),
  ]);

  const activePlan = planRows[0] ?? null;
  const isFirstOrder = orderCount.length === 0;
  const latestPay = latestPayRows[0];
  const brand = brandRows[0] ?? null;
  const userApkRows = await db
    .select()
    .from(apkReleases)
    .where(
      and(
        eq(apkReleases.customerId, c.id),
        eq(apkReleases.appType, "user"),
        eq(apkReleases.published, true),
        eq(apkReleases.superseded, false)
      )
    )
    .limit(1);
  const adminApkRows = await db
    .select()
    .from(apkReleases)
    .where(
      and(
        eq(apkReleases.customerId, c.id),
        eq(apkReleases.appType, "admin"),
        eq(apkReleases.published, true),
        eq(apkReleases.superseded, false)
      )
    )
    .limit(1);
  const userApk = userApkRows[0];
  const adminApk = adminApkRows[0];

  const announcements =
    (settingRow[0]?.value as { title: string; body: string; active: boolean }[]) ?? [];
  const activeAnn = announcements.find((a) => a.active);
  const subStatus = subEffectiveStatus(sub?.sub);
  const unread = notifs.filter((n) => !n.read).length;

  const progress =
    sub && subStatus === "active"
      ? Math.min(
          100,
          Math.max(
            0,
            ((Date.now() - new Date(sub.sub.startsAt).getTime()) /
              (new Date(sub.sub.expiresAt).getTime() - new Date(sub.sub.startsAt).getTime())) *
              100
          )
        )
      : 100;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker mb-2">Dashboard</p>
          <h1 className="h-display text-3xl font-bold">Hi, {c.name.split(" ")[0]}</h1>
        </div>
        <Link href="/checkout" className="btn btn-volt btn-sm group">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            className="transition-transform duration-300 group-hover:rotate-90"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {sub && subStatus === "active" ? "Renew plan" : "New subscription"}
        </Link>
      </div>

      {c.status === "suspended" && (
        <div className="banner danger">
          <p className="text-sm">
            <b className="text-coral">Your account is suspended.</b> New orders and downloads are
            disabled. Contact support to resolve this.
          </p>
        </div>
      )}
      {!c.emailVerified && (
        <div className="banner">
          <div className="flex-1">
            <b className="text-gold text-sm">Your email isn&apos;t verified yet.</b>
            <p className="text-mist text-sm mt-1">
              Verifying helps us reach you about payment verification and APK delivery.
            </p>
          </div>
          <div className="shrink-0">
            <ActionForm
              url="/api/auth/resend-verification"
              label="Resend email"
              type="ghost"
              size="sm"
              successMsg="Verification email sent — check your inbox."
            />
          </div>
        </div>
      )}
      {!sub && (
        <PlanCTA
          isFirstOrder={isFirstOrder}
          plan={
            activePlan
              ? {
                  name: activePlan.name,
                  priceCents: activePlan.priceCents,
                  setupFeeCents: activePlan.setupFeeCents,
                  currency: activePlan.currency,
                  durationDays: activePlan.durationDays,
                  features: activePlan.features as string[],
                }
              : null
          }
        />
      )}
      {subStatus === "expired" && (
        <div className="banner danger">
          <p className="text-sm">
            <b className="text-coral">Your subscription has expired.</b> Renewal restores download
            access and app permissions. Your prepared APKs are retained.
          </p>
          <Link href="/checkout" className="btn btn-volt btn-sm ml-auto shrink-0">
            Renew now
          </Link>
        </div>
      )}
      {activeAnn && (
        <div className="banner">
          <div>
            <div className="font-bold text-sm">{activeAnn.title}</div>
            <p className="text-mist text-sm mt-1">{activeAnn.body}</p>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card stat-card p-5 text-sky2">
          <p className="label !mb-3">Account</p>
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`tag ${
                c.status === "active" ? "tag-green" : c.status === "suspended" ? "tag-red" : "tag-gray"
              }`}
            >
              {c.status}
            </span>
            {c.emailVerified ? (
              <span className="tag tag-blue">verified</span>
            ) : (
              <span className="tag tag-gray">unverified</span>
            )}
          </div>
          <p className="mono text-[11px] text-mist">
            customer #{c.id} · joined {formatDateTime(c.createdAt).split(",")[0]}
          </p>
        </div>

        <div className="card stat-card p-5 text-volt">
          <p className="label !mb-3">Subscription</p>
          {sub ? (
            <>
              <div className="font-bold mb-1">
                {sub.plan.name} <span className="text-mist font-normal">· {sub.plan.cycle}</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <StatusTag status={subStatus} />
                <span className="mono text-[11px] text-mist">
                  {subStatus === "active"
                    ? `${daysLeft(sub.sub.expiresAt)} days left`
                    : `ended ${formatDateTime(sub.sub.expiresAt).split(",")[0]}`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-ink overflow-hidden">
                <div
                  className="h-full bg-volt rounded-full transition-all duration-700"
                  style={{ width: `${subStatus === "active" ? progress : 100}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-mist text-sm">No active plan yet.</p>
          )}
        </div>

        <div className="card stat-card p-5 text-gold">
          <p className="label !mb-3">Latest payment</p>
          {latestPay ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <StatusTag status={latestPay.pay.status} />
                <span className="mono text-[11px] text-mist">{latestPay.order.orderCode}</span>
              </div>
              <div className="mono text-lg font-bold">
                {formatMoney(latestPay.pay.amountCents, latestPay.pay.currency)}
              </div>
              {latestPay.pay.rejectReason && (
                <p className="text-[12px] text-coral mt-1 line-clamp-2">
                  {latestPay.pay.rejectReason}
                </p>
              )}
            </>
          ) : (
            <p className="text-mist text-sm">No payments yet.</p>
          )}
        </div>

        <div className="card stat-card p-5 text-coral">
          <p className="label !mb-3">APK delivery</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">User Panel</span>
              {userApk ? (
                <span className="tag tag-green">ready v{userApk.versionName}</span>
              ) : (
                <span className="tag tag-gray">preparing</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Admin Panel</span>
              {adminApk ? (
                <span className="tag tag-green">ready v{adminApk.versionName}</span>
              ) : (
                <span className="tag tag-gray">preparing</span>
              )}
            </div>
            <Link href="/dashboard/apks" className="mono text-[11px] text-volt hover:underline">
              Open My APKs →
            </Link>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-lg">Notifications</h2>
            {unread > 0 && (
              <ActionForm
                url="/api/notifications"
                hidden={{ action: "read_all" }}
                label="Mark all read"
                type="ghost"
                size="sm"
                successMsg="All notifications marked read."
              />
            )}
          </div>
          {notifs.length === 0 ? (
            <div className="empty">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 01-3.4 0" />
              </svg>
              <p className="text-sm">Nothing yet — order updates and delivery news appear here.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {notifs.map((n) => (
                <li key={n.id} className={`flex gap-3 ${n.read ? "opacity-55" : ""}`}>
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      n.type === "success"
                        ? "bg-volt"
                        : n.type === "danger"
                        ? "bg-coral"
                        : n.type === "warning"
                        ? "bg-gold"
                        : "bg-sky2"
                    }`}
                  />
                  <div>
                    <div className="text-sm font-semibold">{n.title}</div>
                    {n.body && <p className="text-mist text-[13px] mt-0.5">{n.body}</p>}
                    <p className="mono text-[10px] text-mist mt-1">{formatDateTime(n.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-6">
          <h2 className="font-bold text-lg mb-4">Your app</h2>
          {brand?.appName ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {brand.logoName && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/logo/${brand.logoName}`}
                    alt="logo"
                    className="w-12 h-12 rounded-xl object-cover border border-line"
                  />
                )}
                <div>
                  <div className="font-bold">{brand.appName}</div>
                  <div className="mono text-[11px] text-mist">tenant: {brand.tenantId}</div>
                </div>
              </div>
              <div className="flex gap-2">
                {brand.brandPrimary && (
                  <span
                    className="w-7 h-7 rounded-lg border border-line"
                    style={{ background: brand.brandPrimary }}
                  />
                )}
                {brand.brandSecondary && (
                  <span
                    className="w-7 h-7 rounded-lg border border-line"
                    style={{ background: brand.brandSecondary }}
                  />
                )}
                <span className={`tag self-center ${brand.status === "submitted" ? "tag-green" : "tag-amber"}`}>
                  {brand.status}
                </span>
              </div>
              <Link href="/dashboard/branding" className="btn btn-ghost btn-sm w-full">
                Edit branding
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-mist text-sm">
                Tell us what your app should be called and how it should look.
              </p>
              <Link href="/dashboard/branding" className="btn btn-volt btn-sm w-full">
                Set up branding
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
