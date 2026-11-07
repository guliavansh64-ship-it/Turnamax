import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, orders, payments, plans } from "@/db/schema";
import { getTenantSubscription } from "@/lib/subscription-sync";
import { resolveZetpay } from "@/lib/integrations";
import { createZetpayOrder } from "@/lib/zetpay";
import { clientIp, newOrderCode } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Starts a ZetPay checkout for tournament hosting subscription renewal.
 * Accessible from the Admin Lock Screen and Admin Panel subscription section.
 */
export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let body: any = {};
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    }

    const tenantSlug = (searchParams.get("tenant") || body.tenant || "starter").trim();
    const tenantInfo = await getTenantSubscription(tenantSlug);
    if (!tenantInfo) {
      return Response.json(
        { ok: false, error: "Tournament tenant not found." },
        { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const ip = clientIp(req);
    const rateLimitKey = `sub-zetpay-start:${tenantInfo.customer_id || tenantSlug}`;
    if (!rateLimit(rateLimitKey, 12, 15 * 60 * 1000)) {
      return Response.json(
        { ok: false, error: "Too many payment attempts. Please wait a few minutes." },
        { status: 429, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const zetpayCfg = await resolveZetpay();
    if (!zetpayCfg.enabled || !zetpayCfg.apiKey) {
      return Response.json(
        {
          ok: false,
          error: "ZetPay online checkout is not currently configured or enabled on this server. Please use manual UPI with UTR proof or configure ZetPay in Admin → System.",
          code: "ZETPAY_DISABLED",
        },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const amountRupees = tenantInfo.renewal_amount || 50;
    const amountCents = amountRupees * 100;

    // Resolve or fallback customer
    let customerId = tenantInfo.customer_id;
    if (!customerId || customerId === 0) {
      const anyCust = await db.select({ id: customers.id }).from(customers).limit(1);
      if (anyCust[0]) {
        customerId = anyCust[0].id;
      }
    }

    // Resolve renewal plan
    let planId = tenantInfo.plan_id;
    const planRows = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    const plan = planRows[0] || (await db.select().from(plans).where(eq(plans.active, true)).limit(1))[0];
    if (plan) planId = plan.id;

    const orderCode = newOrderCode();
    const origin = req.headers.get("origin") || req.headers.get("referer") || "https://tournamax.onrender.com";
    const redirectUrl = `${origin.replace(/\/+$/, "")}/pay/return/${orderCode}`;

    let orderId: number | null = null;
    let paymentId: number | null = null;

    if (customerId) {
      const created = await db.transaction(async (tx) => {
        const [o] = await tx
          .insert(orders)
          .values({
            orderCode,
            customerId,
            planId,
            amountCents,
            setupFeeCents: 0,
            currency: "INR",
            status: "pending",
          })
          .returning();
        const [p] = await tx
          .insert(payments)
          .values({
            orderId: o.id,
            customerId,
            method: "zetpay",
            gateway: "zetpay",
            amountCents,
            currency: "INR",
            gatewayStatus: "pending",
            status: "pending",
          })
          .returning();
        return { order: o, payment: p };
      });
      orderId = created.order.id;
      paymentId = created.payment.id;
    }

    // Call ZetPay server-to-server create-order API
    const gateway = await createZetpayOrder({
      amountRupees,
      title: `Hosting Renewal - ${tenantInfo.tenant_name || tenantSlug}`.slice(0, 100),
      redirectUrl,
      mobile: body.mobile || null,
    });

    if (!gateway.ok) {
      if (orderId) {
        await db.delete(orders).where(eq(orders.id, orderId)).catch(() => null);
      }
      return Response.json(
        { ok: false, error: gateway.error },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    if (paymentId) {
      await db
        .update(payments)
        .set({
          gatewayOrderId: gateway.orderId,
          gatewayStatus: "pending",
          updatedAt: new Date(),
        })
        .where(eq(payments.id, paymentId));

      await logAudit({
        actorType: "customer",
        actorId: customerId,
        action: "payment.zetpay_started",
        entity: "order",
        entityId: String(orderId),
        meta: {
          orderCode,
          zetpayOrderId: gateway.orderId,
          amountRupees,
          mode: gateway.mode,
          tenant: tenantSlug,
        },
        ip,
      });
    }

    return Response.json(
      {
        ok: true,
        paymentUrl: gateway.paymentUrl,
        orderCode,
        amountRupees,
        mode: gateway.mode,
        gatewayOrderId: gateway.orderId,
        statusUrl: `/api/v1/subscription/zetpay/status?tenant=${encodeURIComponent(tenantSlug)}&code=${encodeURIComponent(orderCode)}`,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err.message || "Failed to initiate ZetPay renewal." },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
