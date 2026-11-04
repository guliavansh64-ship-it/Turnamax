import Link from "next/link";
import { count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  admins,
  auditLog,
  apkReleases,
  customers,
  orders,
  payments,
  subscriptions,
} from "@/db/schema";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [
    totalCustomers,
    suspendedCustomers,
    activeSubs,
    expiredSubs,
    pendingPays,
    approvedRevenue,
    pendingApkCustomers,
    readyReleases,
    recentActivity,
    latestPending,
  ] = await Promise.all([
    db.select({ n: count() }).from(customers),
    db.select({ n: count() }).from(customers).where(eq(customers.status, "suspended")),
    db
      .select({ n: count() })
      .from(subscriptions)
      .where(sql`${subscriptions.status} = 'active' AND ${subscriptions.expiresAt} > now()`),
    db
      .select({ n: count() })
      .from(subscriptions)
      .where(sql`(${subscriptions.status} = 'expired' OR (${subscriptions.status} = 'active' AND ${subscriptions.expiresAt} <= now()))`),
    db.select({ n: count(), sum: sql<number>`coalesce(sum(${payments.amountCents}), 0)` }).from(payments).where(eq(payments.status, "pending")),
    db
      .select({ sum: sql<number>`coalesce(sum(${payments.amountCents}), 0)` })
      .from(payments)
      .where(eq(payments.status, "approved")),
    (async () => {
      const approved = await db
        .select({ customerId: payments.customerId })
        .from(payments)
        .where(eq(payments.status, "approved"));
      const ready = await db
        .select({ customerId: apkReleases.customerId })
        .from(apkReleases)
        .where(eq(apkReleases.published, true));
      const readySet = new Set(ready.map((r) => r.customerId));
      const approvedSet = new Set(approved.map((a) => a.customerId));
      let n = 0;
      for (const id of approvedSet) if (!readySet.has(id)) n++;
      return n;
    })(),
    db.select({ n: count() }).from(apkReleases).where(eq(apkReleases.published, true)),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(14),
    db
      .select({ pay: payments, order: orders, customer: customers })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .innerJoin(customers, eq(payments.customerId, customers.id))
      .where(eq(payments.status, "pending"))
      .orderBy(desc(payments.createdAt))
      .limit(6),
  ]);

  const stats: Array<{ label: string; value: string | number; sub: string; color: string; link: string }> = [
    { label: "Registered customers", value: totalCustomers[0].n, sub: `${suspendedCustomers[0].n} suspended`, color: "text-sky2", link: "/admin/customers" },
    { label: "Active subscriptions", value: activeSubs[0].n, sub: `${expiredSubs[0].n} expired`, color: "text-volt", link: "/admin/customers" },
    { label: "Pending payments", value: pendingPays[0].n, sub: formatMoney(pendingPays[0].sum ?? 0), color: "text-gold", link: "/admin/payments?status=pending" },
    { label: "Verified revenue", value: formatMoney(approvedRevenue[0].sum ?? 0), sub: "approved only", color: "text-volt", link: "/admin/payments?status=approved" },
    { label: "APKs awaiting preparation", value: pendingApkCustomers, sub: "customers paid, not delivered", color: "text-coral", link: "/admin/apks" },
    { label: "APK releases published", value: readyReleases[0].n, sub: "ready for download", color: "text-sky2", link: "/admin/apks" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker mb-2">Main admin</p>
        <h1 className="h-display text-3xl font-bold">Operations dashboard</h1>
        <p className="text-mist mt-2 text-sm">
          Every figure below is computed from real recorded transactions and records.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.link} className={`card stat-card card-hover p-5 ${s.color}`}>
            <p className="label !mb-2">{s.label}</p>
            <div className="mono text-3xl font-bold text-snow">{s.value}</div>
            <p className="mono text-[11px] text-mist mt-1">{s.sub}</p>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="card overflow-hidden">
          <div className="px-6 pt-6 pb-3 flex items-center justify-between">
            <h2 className="font-bold text-lg">Pending payments</h2>
            <Link href="/admin/payments?status=pending" className="mono text-[11px] text-volt hover:underline">
              View all →
            </Link>
          </div>
          {latestPending.length === 0 ? (
            <div className="p-6">
              <div className="empty">
                <p className="text-sm">No payments awaiting verification. 🎉</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Ref</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {latestPending.map(({ pay, order, customer }) => (
                    <tr key={pay.id}>
                      <td className="mono text-[12px]">{order.orderCode}</td>
                      <td>
                        <div className="font-semibold">{customer.name}</div>
                        <div className="text-[11px] text-mist">{customer.email}</div>
                      </td>
                      <td className="mono">{formatMoney(pay.amountCents, pay.currency)}</td>
                      <td className="mono text-[11px] text-mist max-w-[120px] truncate">{pay.reference}</td>
                      <td>
                        <Link href={`/admin/customers/${customer.id}`} className="btn btn-volt btn-sm">
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="font-bold text-lg mb-4">Recent activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-mist text-sm">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentActivity.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className="mono text-[11px] text-mist shrink-0 w-[110px]">
                    {formatDateTime(a.createdAt).slice(0, 16)}
                  </span>
                  <span>
                    <b>{a.action}</b>
                    {a.entity && (
                      <span className="text-mist">
                        {" "}
                        · {a.entity}
                        {a.entityId ? ` #${a.entityId}` : ""}
                      </span>
                    )}
                    <span className="mono text-[10px] text-mist">
                      {" "}
                      ({a.actorType}
                      {a.actorId ? ` #${a.actorId}` : ""})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
