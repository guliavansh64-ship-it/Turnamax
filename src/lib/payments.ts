import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, payments, plans } from "@/db/schema";
import { applySubscriptionTo } from "@/lib/subscription";
import { notify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { sendAdminAlert } from "@/lib/mailer";

export type ApproveResult =
  | {
      ok: true;
      orderCode: string;
      customerId: number;
      amountCents: number;
      planName: string;
      extended: boolean;
      expiresAt: Date;
    }
  | { ok: false; error: string; code: "already" | "missing" | "wrong_state" };

/**
 * Single approval path for BOTH manual admin verification and automatic
 * ZetPay confirmation.
 *
 * Idempotent and duplicate-safe: the `where status = 'pending'` guard inside
 * the transaction means a payment can only ever be approved once, so a
 * gateway retry or two admins clicking at the same time cannot activate two
 * subscriptions.
 *
 * Approving a payment never triggers an APK build — uploads stay manual.
 */
export async function approvePayment(opts: {
  paymentId: number;
  actorType: "admin" | "system";
  actorId?: number;
  ip?: string;
  meta?: Record<string, unknown>;
  /** Optional gateway fields to stamp on the same row atomically. */
  gateway?: {
    orderId?: string;
    status?: string;
    amount?: number;
    verifiedAt?: Date;
  };
}): Promise<ApproveResult> {
  const { paymentId } = opts;

  const rows = await db
    .select({
      payment: payments,
      order: orders,
      plan: plans,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .innerJoin(plans, eq(plans.id, orders.planId))
    .where(eq(payments.id, paymentId))
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, error: "Payment not found.", code: "missing" };
  if (row.payment.status !== "pending")
    return { ok: false, error: `Payment is already ${row.payment.status}.`, code: "wrong_state" };

  let outcome: { extended: boolean; expiresAt: Date; planName: string } | undefined;

  try {
    await db.transaction(async (tx) => {
      const guard = await tx
        .update(payments)
        .set({
          status: "approved",
          verifiedBy: opts.actorId ?? null,
          verifiedAt: new Date(),
          updatedAt: new Date(),
          rejectReason: null,
          ...(opts.gateway?.orderId ? { gatewayOrderId: opts.gateway.orderId } : {}),
          ...(opts.gateway?.status ? { gatewayStatus: opts.gateway.status } : {}),
          ...(opts.gateway?.amount !== undefined ? { gatewayAmount: opts.gateway.amount } : {}),
          ...(opts.gateway?.verifiedAt ? { gatewayVerifiedAt: opts.gateway.verifiedAt } : {}),
        })
        .where(and(eq(payments.id, paymentId), eq(payments.status, "pending")))
        .returning({ id: payments.id });

      // Another actor (admin or gateway) won the race — do not double-activate.
      if (guard.length === 0) throw new Error("__ALREADY_PROCESSED__");

      await tx.update(orders).set({ status: "approved" }).where(eq(orders.id, row.order.id));

      outcome = await applySubscriptionTo(tx, row.payment.customerId, row.order.planId);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "__ALREADY_PROCESSED__") {
      return { ok: false, error: "Payment was already processed.", code: "already" };
    }
    throw error;
  }

  const o = outcome!;
  const label = opts.actorType === "system" ? "Payment confirmed" : "Payment verified & approved";
  await notify(
    row.payment.customerId,
    "success",
    label,
    `Order ${row.order.orderCode} verified. Your ${o.planName} subscription is ${
      o.extended ? "extended" : "active"
    } until ${o.expiresAt.toLocaleDateString("en-IN")}.`
  );
  await logAudit({
    actorType: opts.actorType,
    actorId: opts.actorId,
    action: opts.actorType === "system" ? "payment.gateway_confirmed" : "payment.approved",
    entity: "payment",
    entityId: String(paymentId),
    meta: {
      orderCode: row.order.orderCode,
      amountCents: row.payment.amountCents,
      extended: o.extended,
      ...(opts.meta ?? {}),
    },
    ip: opts.ip,
  });


  // The gateway confirmed the payment automatically — still worth telling the
  // owner, since a subscription + APK preparation just unlocked.
  if (opts.actorType === "system") {
    void sendAdminAlert(
      "ZetPay payment confirmed automatically",
      "An online payment was verified server-to-server and the subscription activated. APKs still need manual preparation.",
      {
        Order: row.order.orderCode,
        Amount: `₹${(row.payment.amountCents / 100).toFixed(2)}`,
        Plan: row.plan.name,
        Customer: row.payment.customerId,
        Expires: o.expiresAt.toISOString().slice(0, 10),
      }
    );
  }

  return {
    ok: true,
    orderCode: row.order.orderCode,
    customerId: row.payment.customerId,
    amountCents: row.payment.amountCents,
    planName: o.planName,
    extended: o.extended,
    expiresAt: o.expiresAt,
  };
}

/**
 * Reject a pending payment, recording the reason the customer will see.
 * Shared by admin rejection and gateway failure reporting.
 */
export async function rejectPayment(opts: {
  paymentId: number;
  reason: string;
  actorType: "admin" | "system";
  actorId?: number;
  ip?: string;
}): Promise<{ ok: true; customerId: number } | { ok: false; error: string }> {
  const rows = await db
    .select({ payment: payments, order: orders })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(eq(payments.id, opts.paymentId))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, error: "Payment not found." };
  if (row.payment.status !== "pending")
    return { ok: false, error: `Payment is already ${row.payment.status}.` };

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({
        status: "rejected",
        rejectReason: opts.reason,
        updatedAt: new Date(),
        ...(opts.actorId ? { verifiedBy: opts.actorId } : {}),
      })
      .where(and(eq(payments.id, opts.paymentId), eq(payments.status, "pending")));
    await tx.update(orders).set({ status: "rejected" }).where(eq(orders.id, row.order.id));
  });

  await logAudit({
    actorType: opts.actorType,
    actorId: opts.actorId,
    action: opts.actorType === "system" ? "payment.gateway_failed" : "payment.rejected",
    entity: "payment",
    entityId: String(opts.paymentId),
    meta: { orderCode: row.order.orderCode, reason: opts.reason },
    ip: opts.ip,
  });

  return { ok: true, customerId: row.payment.customerId };
}
