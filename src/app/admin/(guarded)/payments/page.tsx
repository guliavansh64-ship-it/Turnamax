import Link from "next/link";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, orders, payments, plans } from "@/db/schema";
import { formatDateTime, formatMoney } from "@/lib/utils";
import ActionForm from "@/components/action-form";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "pending";
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const filters = [
    status !== "all" ? eq(payments.status, status as "pending") : undefined,
    q
      ? or(
          ilike(orders.orderCode, `%${q}%`),
          ilike(payments.reference, `%${q}%`),
          ilike(customers.email, `%${q}%`),
          ilike(customers.name, `%${q}%`)
        )
      : undefined,
  ].filter(Boolean);

  const [totalRows, rows, sumRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .innerJoin(customers, eq(payments.customerId, customers.id))
      .where(and(...filters)),
    db
      .select({ pay: payments, order: orders, customer: customers, plan: plans })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .innerJoin(customers, eq(payments.customerId, customers.id))
      .innerJoin(plans, eq(orders.planId, plans.id))
      .where(and(...filters))
      .orderBy(desc(payments.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ sum: sql<number>`coalesce(sum(${payments.amountCents}), 0)` })
      .from(payments)
      .where(and(...filters)),
  ]);
  const total = totalRows[0]?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs = ["pending", "approved", "rejected", "refunded", "all"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker mb-2">Payments</p>
          <h1 className="h-display text-3xl font-bold">
            {status === "all" ? "All payments" : `${status} payments`}{" "}
            <span className="text-mist text-xl">({total})</span>
          </h1>
          <p className="mono text-[12px] text-mist mt-1">
            filtered total: {formatMoney(sumRows[0]?.sum ?? 0)}
          </p>
        </div>
        <form method="GET" className="flex gap-2">
          <input name="q" defaultValue={q} className="input !w-56" placeholder="Order, UTR, email…" />
          <button className="btn btn-volt">Search</button>
        </form>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <Link
            key={t}
            href={`/admin/payments?status=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`mono text-xs px-3.5 py-2 rounded-lg border ${
              t === status ? "border-volt text-volt" : "border-line text-mist hover:text-snow"
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8">
            <div className="empty">
              <p className="text-sm">
                {status === "pending"
                  ? "No payments waiting for verification."
                  : "No payments match this view."}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>UTR / ref</th>
                  <th>Proof</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ pay, order, customer, plan }) => (
                  <tr key={pay.id}>
                    <td className="mono text-[12px]">{order.orderCode}</td>
                    <td>
                      <Link
                        href={`/admin/customers/${customer.id}`}
                        className="font-semibold hover:text-volt"
                      >
                        {customer.name}
                      </Link>
                      <div className="text-[11px] text-mist">{customer.email}</div>
                    </td>
                    <td className="text-mist text-[13px]">{plan.name}</td>
                    <td className="mono">
                      {formatMoney(pay.amountCents, pay.currency)}
                      {order.setupFeeCents > 0 && (
                        <div className="text-[10px] text-mist mt-0.5">
                          incl. {formatMoney(order.setupFeeCents, pay.currency)} setup
                        </div>
                      )}
                    </td>
                    <td className="mono text-[11px] max-w-[130px] truncate">{pay.reference ?? "—"}</td>
                    <td>
                      {pay.proofName ? (
                        <a
                          href={`/api/files/proof/${pay.proofName}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mono text-[11px] text-volt hover:underline"
                        >
                          view
                        </a>
                      ) : (
                        <span className="text-mist text-[12px]">—</span>
                      )}
                    </td>
                    <td className="text-mist text-[12px] whitespace-nowrap">{formatDateTime(pay.createdAt)}</td>
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
                    <td>
                      {pay.status === "pending" && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <ActionForm
                            url={`/api/admin/payments/${pay.id}`}
                            hidden={{ action: "approve" }}
                            label="Approve"
                            size="sm"
                            successMsg="Payment approved — subscription activated/extended."
                          />
                          <ActionForm
                            url={`/api/admin/payments/${pay.id}`}
                            hidden={{ action: "reject" }}
                            label="Reject"
                            type="danger"
                            size="sm"
                            successMsg="Payment rejected."
                          >
                            <input
                              name="reason"
                              className="input !w-40 !py-1.5 text-[12px]"
                              placeholder="Reason"
                              minLength={3}
                              required
                            />
                          </ActionForm>
                        </div>
                      )}
                      {pay.status === "approved" && (
                        <ActionForm
                          url={`/api/admin/payments/${pay.id}`}
                          hidden={{ action: "refund" }}
                          label="Refund"
                          type="danger"
                          size="sm"
                          confirmText="Refund this payment? Active subscription will be revoked."
                          successMsg="Marked refunded."
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex gap-2 justify-center">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/payments?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}&page=${p}`}
              className={`mono text-xs px-3 py-2 rounded-lg border ${
                p === page ? "border-volt text-volt" : "border-line text-mist hover:text-snow"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
