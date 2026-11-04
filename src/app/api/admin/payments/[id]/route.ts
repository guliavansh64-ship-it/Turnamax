import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, payments, subscriptions } from "@/db/schema";
import { getCurrentAdmin, originOk } from "@/lib/auth";
import { applySubscriptionTo } from "@/lib/subscription";
import {
  clientIp,
  jsonError,
  jsonOk,
  notify,
  readJsonBody,
} from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const { id } = await params;
  const paymentId = Number(id);
  if (!Number.isInteger(paymentId)) return jsonError("Invalid payment.", 400);
  const ip = clientIp(req);
  const body = await readJsonBody(req);
  const action = String(body.action ?? "");
  const reason = String(body.reason ?? "").trim().slice(0, 300);

  const pre = await db
    .select({ pay: payments, order: orders })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(eq(payments.id, paymentId))
    .limit(1);
  const found = pre[0];
  if (!found) return jsonError("Payment not found.", 404);
  const { pay, order } = found;

  /* ---------- APPROVE (only pending → approved; duplicate-safe) ---------- */
  if (action === "approve") {
    if (pay.status !== "pending")
      return jsonError(`Payment is already ${pay.status}.`, 409);
    let outcome: { extended: boolean; expiresAt: Date; planName: string } | undefined;
    try {
      await db.transaction(async (tx) => {
        const rows = await tx
          .update(payments)
          .set({
            status: "approved",
            verifiedBy: cur!.admin.id,
            verifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(payments.id, paymentId), eq(payments.status, "pending")))
          .returning({ id: payments.id });
        if (rows.length === 0)
          throw new Error("__ALREADY_PROCESSED__");
        await tx.update(orders).set({ status: "approved" }).where(eq(orders.id, order.id));
        const res = await applySubscriptionTo(tx, pay.customerId, order.planId);
        outcome = { extended: res.extended, expiresAt: res.expiresAt, planName: res.planName };
      });
    } catch (e) {
      if (e instanceof Error && e.message === "__ALREADY_PROCESSED__")
        return jsonError("Payment was already processed by someone else.", 409);
      throw e;
    }
    const o = outcome!;
    await notify(
      pay.customerId,
      "success",
      "Payment verified & approved",
      `Order ${order.orderCode} verified. Your ${o.planName} subscription is ${
        o.extended ? "extended" : "active"
      } until ${o.expiresAt.toLocaleDateString("en-IN")}.`
    );
    await logAudit({
      actorType: "admin",
      actorId: cur.admin.id,
      action: "payment.approved",
      entity: "payment",
      entityId: String(paymentId),
      meta: { orderCode: order.orderCode, amountCents: pay.amountCents, extended: o.extended },
      ip,
    });
    return jsonOk({ expiresAt: o.expiresAt.toISOString() });
  }

  /* ---------- REJECT (pending → rejected, reason required) ---------- */
  if (action === "reject") {
    if (pay.status !== "pending")
      return jsonError(`Payment is already ${pay.status}.`, 409);
    if (reason.length < 3)
      return jsonError("A rejection reason (min 3 chars) is required.");
    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({
          status: "rejected",
          rejectReason: reason,
          verifiedBy: cur!.admin.id,
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(payments.id, paymentId), eq(payments.status, "pending")));
      await tx.update(orders).set({ status: "rejected" }).where(eq(orders.id, order.id));
    });
    await notify(
      pay.customerId,
      "danger",
      `Payment for ${order.orderCode} rejected`,
      reason
    );
    await logAudit({
      actorType: "admin",
      actorId: cur.admin.id,
      action: "payment.rejected",
      entity: "payment",
      entityId: String(paymentId),
      meta: { orderCode: order.orderCode, reason },
      ip,
    });
    return jsonOk();
  }

  /* ---------- REFUND (approved → refunded; subscription revoked) ---------- */
  if (action === "refund") {
    if (pay.status !== "approved")
      return jsonError(`Only approved payments can be refunded (current: ${pay.status}).`, 409);
    await db.transaction(async (tx) => {
      const rows = await tx
        .update(payments)
        .set({
          status: "refunded",
          rejectReason: reason || undefined,
          verifiedBy: cur!.admin.id,
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(payments.id, paymentId), eq(payments.status, "approved")))
        .returning({ id: payments.id });
      if (rows.length === 0) throw new Error("__ALREADY_PROCESSED__");
      await tx.update(orders).set({ status: "refunded" }).where(eq(orders.id, order.id));
      const active = await tx
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.customerId, pay.customerId),
            eq(subscriptions.status, "active")
          )
        );
      for (const s of active) {
        await tx
          .update(subscriptions)
          .set({ status: "revoked", updatedAt: new Date() })
          .where(eq(subscriptions.id, s.id));
      }
    }).catch((e) => {
      if (e instanceof Error && e.message === "__ALREADY_PROCESSED__") return;
      throw e;
    });
    await notify(
      pay.customerId,
      "info",
      `Payment for ${order.orderCode} refunded`,
      "The payment was refunded and the associated subscription was revoked. Amount will be returned to your UPI within 5–7 business days."
    );
    await logAudit({
      actorType: "admin",
      actorId: cur.admin.id,
      action: "payment.refunded",
      entity: "payment",
      entityId: String(paymentId),
      meta: { orderCode: order.orderCode, amountCents: pay.amountCents, reason },
      ip,
    });
    return jsonOk();
  }

  return jsonError("Unknown action.");
}
