import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { getTenantSubscription } from "@/lib/subscription-sync";
import { confirmZetpayOrder } from "@/lib/zetpay-checkout";
import { clientIp } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Server-side status poller for ZetPay renewal payments.
 * Queries ZetPay order-status and automatically activates/extends the subscription upon success.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = (searchParams.get("tenant") || "starter").trim();
    const orderCode = (searchParams.get("code") || "").trim();

    if (!orderCode) {
      return Response.json(
        { ok: false, error: "Missing order reference code." },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const ip = clientIp(req);
    const rateLimitKey = `sub-zetpay-poll:${tenantSlug}:${orderCode}`;
    if (!rateLimit(rateLimitKey, 180, 10 * 60 * 1000)) {
      return Response.json(
        { ok: false, error: "Too many checks. Please wait a moment." },
        { status: 429, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Look up the order in DB
    const orderRows = await db
      .select({ id: orders.id, customerId: orders.customerId, status: orders.status })
      .from(orders)
      .where(eq(orders.orderCode, orderCode))
      .limit(1);

    const order = orderRows[0];
    if (!order) {
      return Response.json(
        {
          ok: false,
          status: "not_started",
          message: "Order reference not found.",
          orderCode,
        },
        { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Confirm with ZetPay server-to-server; auto-approves and extends subscription if status === "success"
    const result = await confirmZetpayOrder({
      orderCode,
      customerId: order.customerId,
      ip,
    });

    return Response.json(
      {
        ok: true,
        status: result.status,
        message: result.message,
        orderCode: result.orderCode,
        expiresAt: result.expiresAt,
        planName: result.planName,
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
      { ok: false, error: err.message || "Failed to check ZetPay payment status." },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
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
