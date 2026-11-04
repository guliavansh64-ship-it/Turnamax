import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, payments, plans, subscriptions } from "@/db/schema";
import { getTenantSubscription } from "@/lib/subscription-sync";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get("tenant") || "starter";

    const tenantInfo = await getTenantSubscription(tenantSlug);
    if (!tenantInfo) {
      return Response.json(
        { ok: false, error: "Tenant not found." },
        {
          status: 404,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    const customerId = tenantInfo.customer_id;

    // Fetch customer's payments and orders
    const rows = await db
      .select({
        orderCode: orders.orderCode,
        amountCents: payments.amountCents,
        method: payments.method,
        status: payments.status,
        reference: payments.reference,
        createdAt: payments.createdAt,
        verifiedAt: payments.verifiedAt,
        planName: plans.name,
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .innerJoin(plans, eq(orders.planId, plans.id))
      .where(eq(payments.customerId, customerId))
      .orderBy(desc(payments.createdAt))
      .limit(30);

    const history = rows.map((r) => ({
      order_uid: r.orderCode,
      plan_name: r.planName,
      amount_paid: r.amountCents / 100,
      payment_reference_utr: r.reference || "N/A",
      payment_status: r.status === "approved" ? "verified" : r.status,
      created_at: r.createdAt.toISOString(),
      expiry_date: tenantInfo.expires_at,
    }));

    return Response.json(
      { ok: true, data: history },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err.message || "Failed to fetch subscription history." },
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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
