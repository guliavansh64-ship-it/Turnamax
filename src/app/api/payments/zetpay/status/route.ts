import { getCurrentCustomer } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, jsonError, jsonOk } from "@/lib/utils";
import { confirmZetpayOrder } from "@/lib/zetpay-checkout";

export const dynamic = "force-dynamic";

/**
 * Server-side confirmation + fulfilment poll.
 *
 * Every call re-verifies with ZetPay's order-status endpoint. It returns
 * "success" only after ZetPay itself reports status === "success" from a
 * server-to-server request — the customer's redirect and any browser
 * callbacks are never trusted.
 */
export async function GET(req: Request) {
  const cur = await getCurrentCustomer();
  if (!cur) return jsonError("Not authenticated.", 401);

  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  if (!code || code.length > 40) return jsonError("Missing order code.");

  const ip = clientIp(req);
  // Generous locally: outbound ZetPay calls are already throttled in lib/zetpay.
  if (!rateLimit(`zetpay-status:${cur.customer.id}`, 120, 10 * 60 * 1000))
    return jsonError("Too many checks. Please wait a moment.", 429);

  const result = await confirmZetpayOrder({
    orderCode: code,
    customerId: cur.customer.id,
    ip,
  });

  return jsonOk(result);
}
