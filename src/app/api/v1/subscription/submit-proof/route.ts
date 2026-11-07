import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, payments, plans } from "@/db/schema";
import { getTenantSubscription } from "@/lib/subscription-sync";
import { clientIp, newOrderCode, notify } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { sendAdminAlert } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get("tenant") || "starter";

    const tenantInfo = await getTenantSubscription(tenantSlug);
    if (!tenantInfo) {
      return Response.json(
        { ok: false, error: "Tournament tenant not found." },
        { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    if (tenantInfo.is_demo || !tenantInfo.customer_id || tenantInfo.customer_id === 0) {
      return Response.json(
        {
          ok: true,
          message: "Demo mode payment proof acknowledged. All features are fully active and unlocked!",
        },
        { headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const ip = clientIp(req);
    if (!rateLimit(`sub-proof:${tenantInfo.customer_id}`, 8, 60 * 60 * 1000)) {
      return Response.json(
        { ok: false, error: "Too many renewal requests. Please try again later." },
        { status: 429, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    let body: any = {};
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    } else {
      const fd = await req.formData().catch(() => null);
      if (fd) {
        body = {
          utr: fd.get("utr"),
          plan_id: fd.get("plan_id"),
        };
      }
    }

    const utr = String(body.utr ?? "").trim();
    if (!utr || utr.length < 6 || utr.length > 80) {
      return Response.json(
        { ok: false, error: "Enter a valid UPI transaction UTR / reference number (6–80 characters)." },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Prevent duplicate submission of the same UTR
    const dupes = await db
      .select({ id: payments.id, status: payments.status })
      .from(payments)
      .where(
        and(
          eq(payments.reference, utr),
          inArray(payments.status, ["pending", "approved"])
        )
      )
      .limit(1);

    if (dupes.length > 0) {
      return Response.json(
        {
          ok: false,
          error:
            dupes[0].status === "approved"
              ? "This transaction reference has already been verified and used."
              : "This transaction UTR is already submitted and pending verification by Main Admin.",
        },
        { status: 409, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Get the renewal plan
    let plan = (
      await db
        .select()
        .from(plans)
        .where(eq(plans.id, tenantInfo.plan_id))
        .limit(1)
    )[0];

    if (!plan) {
      plan = (
        await db.select().from(plans).where(eq(plans.active, true)).orderBy(plans.sort).limit(1)
      )[0];
    }

    if (!plan) {
      return Response.json(
        { ok: false, error: "Configured renewal plan was not found." },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Renewal payments never charge one-time setup fee
    const renewalAmountCents = plan.priceCents;
    const orderCode = newOrderCode();

    const [order, payment] = await db.transaction(async (tx) => {
      const [o] = await tx
        .insert(orders)
        .values({
          orderCode,
          customerId: tenantInfo.customer_id,
          planId: plan.id,
          amountCents: renewalAmountCents,
          setupFeeCents: 0,
          currency: plan.currency,
          status: "pending",
        })
        .returning();

      const [p] = await tx
        .insert(payments)
        .values({
          orderId: o.id,
          customerId: tenantInfo.customer_id,
          method: "upi_manual",
          amountCents: renewalAmountCents,
          currency: plan.currency,
          reference: utr,
          status: "pending",
        })
        .returning();

      return [o, p];
    });

    // Notify customer in dashboard
    await notify(
      tenantInfo.customer_id,
      "info",
      `Renewal order ${orderCode} submitted (₹${(renewalAmountCents / 100).toFixed(0)})`,
      `UTR reference ${utr} recorded from Tournament Admin APK. Main Admin will verify and activate your hosting extension shortly.`
    );

    // Audit event
    await logAudit({
      actorType: "customer",
      actorId: tenantInfo.customer_id,
      action: "subscription.apk_renewal_submitted",
      entity: "order",
      entityId: String(order.id),
      ip,
      meta: {
        orderCode,
        utr,
        tenantSlug,
        amountCents: renewalAmountCents,
      },
    });

    // Alert Main Admin
    await sendAdminAlert(
      `Tournament APK Renewal: ${tenantInfo.tenant_name} (₹${(renewalAmountCents / 100).toFixed(0)})`,
      `Tournament administrator submitted a ₹${(renewalAmountCents / 100).toFixed(0)} renewal payment from their Admin APK.\n\nTenant: ${tenantSlug}\nCustomer: ${tenantInfo.customer_email}\nOrder: ${orderCode}\nUTR / Ref: ${utr}\n\nReview & Approve in Main Admin -> Payments.`,
      {
        Tenant: tenantSlug,
        Customer: tenantInfo.customer_email,
        Order: orderCode,
        UTR: utr,
        Amount: `₹${(renewalAmountCents / 100).toFixed(0)}`,
      }
    ).catch(() => {});

    return Response.json(
      {
        ok: true,
        message: "Renewal proof submitted successfully. Access will be unlocked as soon as Main Admin verifies the transaction.",
        data: {
          order_code: orderCode,
          utr,
          amount: renewalAmountCents / 100,
          tenant_slug: tenantSlug,
        },
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
      { ok: false, error: err.message || "Failed to process renewal submission." },
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
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
