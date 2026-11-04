import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, payments, plans } from "@/db/schema";
import { approvePayment, rejectPayment } from "@/lib/payments";
import {
  createZetpayOrder,
  getZetpayStatus,
} from "@/lib/zetpay";
import { newOrderCode, notify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

/**
 * ZetPay checkout orchestration.
 *
 * Fulfilment is gated EXCLUSIVELY on a server-to-server order-status call
 * returning "success" — never on the customer returning to our site or on a
 * browser-side callback. See the ZetPay "GOLDEN RULE".
 */

export type StartResult =
  | {
      ok: true;
      paymentUrl: string;
      orderCode: string;
      amountRupees: number;
      mode: string;
      paymentId: number;
    }
  | { ok: false; error: string };

/**
 * Creates a local order + pending ZetPay payment and the ZetPay order itself.
 * The UTR reference is not required — the gateway confirms payment directly.
 */
export async function startZetpayCheckout(opts: {
  customerId: number;
  customerEmail: string;
  planId: number;
  mobile?: string | null;
  redirectUrl: string;
  ip?: string;
}): Promise<StartResult> {
  const planRows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, opts.planId), eq(plans.active, true)))
    .limit(1);
  const plan = planRows[0];
  if (!plan) return { ok: false, error: "That plan is no longer available." };

  // Amount always comes from the server-side plan record — never the client.
  const priorOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.customerId, opts.customerId))
    .limit(1);
  const setupFeeCents = priorOrders.length === 0 ? plan.setupFeeCents : 0;
  const amountCents = plan.priceCents + setupFeeCents;
  const amountRupees = amountCents / 100;

  if (amountRupees < 1 || amountRupees > 5000) {
    return {
      ok: false,
      error: `ZetPay accepts ₹1–₹5,000. This order is ₹${amountRupees}. Please pay by manual UPI instead.`,
    };
  }

  const orderCode = newOrderCode();
  const created = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        orderCode,
        customerId: opts.customerId,
        planId: plan.id,
        amountCents,
        setupFeeCents,
        currency: plan.currency,
        status: "pending",
      })
      .returning();
    const [payment] = await tx
      .insert(payments)
      .values({
        orderId: order.id,
        customerId: opts.customerId,
        method: "zetpay",
        gateway: "zetpay",
        amountCents,
        currency: plan.currency,
        gatewayStatus: "pending",
        status: "pending",
      })
      .returning();
    return { order, payment };
  });

  const gateway = await createZetpayOrder({
    amountRupees,
    title: `${plan.name} — ${orderCode}`.slice(0, 100),
    redirectUrl: opts.redirectUrl,
    mobile: opts.mobile,
  });

  if (!gateway.ok) {
    // Roll the freshly created order back so a failed start does not leave a
    // dead pending order in the customer's history.
    await db.delete(orders).where(eq(orders.id, created.order.id));
    await logAudit({
      actorType: "customer",
      actorId: opts.customerId,
      action: "payment.zetpay_start_failed",
      entity: "order",
      entityId: String(created.order.id),
      meta: { error: gateway.error },
      ip: opts.ip,
    });
    return { ok: false, error: gateway.error };
  }

  await db
    .update(payments)
    .set({
      gatewayOrderId: gateway.orderId,
      gatewayStatus: "pending",
      updatedAt: new Date(),
    })
    .where(eq(payments.id, created.payment.id));

  await logAudit({
    actorType: "customer",
    actorId: opts.customerId,
    action: "payment.zetpay_started",
    entity: "order",
    entityId: String(created.order.id),
    meta: { orderCode, zetpayOrderId: gateway.orderId, amountRupees, mode: gateway.mode },
    ip: opts.ip,
  });

  return {
    ok: true,
    paymentUrl: gateway.paymentUrl,
    orderCode,
    amountRupees,
    mode: gateway.mode,
    paymentId: created.payment.id,
  };
}

export type ConfirmResult = {
  status: "pending" | "success" | "failed" | "not_started";
  message: string;
  orderCode: string;
  expiresAt?: string;
  planName?: string;
};

/**
 * Confirm a local order's ZetPay payment and fulfil it if ZetPay reports
 * "success". Safe to call repeatedly (idempotent) — approval is guarded by a
 * conditional update inside a transaction.
 */
export async function confirmZetpayOrder(opts: {
  orderCode: string;
  customerId: number;
  ip?: string;
}): Promise<ConfirmResult> {
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(eq(orders.orderCode, opts.orderCode), eq(orders.customerId, opts.customerId))
    )
    .limit(1);
  const order = rows[0];
  if (!order)
    return {
      status: "not_started",
      message: "Order not found.",
      orderCode: opts.orderCode,
    };

  const paymentsForOrder = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.orderId, order.id),
        eq(payments.customerId, opts.customerId),
        eq(payments.gateway, "zetpay")
      )
    );

  const tracked = paymentsForOrder.filter(
    (p) => p.gatewayOrderId && ["pending", "approved"].includes(p.status)
  );
  if (tracked.length === 0) {
    if (order.status === "approved")
      return {
        status: "success",
        message: "Payment confirmed. Your subscription is active.",
        orderCode: opts.orderCode,
      };
    return {
      status: "not_started",
      message: "No online payment was started for this order.",
      orderCode: opts.orderCode,
    };
  }

  // Already fulfilled by an earlier poll or by the admin.
  const alreadyApproved = tracked.find((p) => p.status === "approved");
  if (alreadyApproved) {
    return {
      status: "success",
      message: "Payment confirmed. Your subscription is active.",
      orderCode: opts.orderCode,
    };
  }

  let last: ConfirmResult = {
    status: "pending",
    message: "Confirming payment with ZetPay…",
    orderCode: opts.orderCode,
  };

  // Check every outstanding gateway attempt (older links may still be paid).
  for (const payment of tracked) {
    if (!payment.gatewayOrderId) continue;
    const status = await getZetpayStatus(payment.gatewayOrderId);

    if (!status.ok) {
      last = {
        status: "pending",
        message: `Could not confirm with ZetPay: ${status.error}`,
        orderCode: opts.orderCode,
      };
      continue;
    }

    if (status.status === "success") {
      const approved = await approvePayment({
        paymentId: payment.id,
        actorType: "system",
        ip: opts.ip,
        meta: { gateway: "zetpay", zetpayOrderId: payment.gatewayOrderId },
        gateway: {
          status: "success",
          verifiedAt: new Date(),
        },
      });
      if (approved.ok) {
        return {
          status: "success",
          message: `Payment confirmed for ${approved.planName}. Your subscription is ${
            approved.extended ? "extended" : "active"
          } until ${approved.expiresAt.toLocaleDateString("en-IN")}.`,
          orderCode: opts.orderCode,
          expiresAt: approved.expiresAt.toISOString(),
          planName: approved.planName,
        };
      }
      // "already"/"wrong_state" means someone else finished it first.
      if (approved.code === "already" || approved.code === "wrong_state") {
        return {
          status: "success",
          message: "Payment confirmed. Your subscription is active.",
          orderCode: opts.orderCode,
        };
      }
      last = { status: "failed", message: approved.error, orderCode: opts.orderCode };
      continue;
    }

    if (status.status === "failed") {
      await rejectPayment({
        paymentId: payment.id,
        reason: "ZetPay reported the payment as failed.",
        actorType: "system",
        ip: opts.ip,
      });
      last = {
        status: "failed",
        message: "ZetPay reported this payment as failed. You can try again.",
        orderCode: opts.orderCode,
      };
      continue;
    }

    last = {
      status: "pending",
      message: "Payment is still pending in your UPI app. This usually takes a few seconds.",
      orderCode: opts.orderCode,
    };
  }

  return last;
}

/** True when ZetPay is available for this deployment. */
export async function zetpayAvailable(): Promise<boolean> {
  try {
    const { resolveZetpay } = await import("@/lib/integrations");
    const cfg = await resolveZetpay();
    return cfg.enabled && Boolean(cfg.apiKey);
  } catch {
    return false;
  }
}

export async function notifyCustomerOfGatewayFailure(orderCode: string, customerId: number) {
  await notify(
    customerId,
    "warning",
    "Online payment attempt failed",
    `Order ${orderCode} could not be paid via ZetPay. No money was captured. You can retry from the checkout page.`
  );
  void inArray;
}
