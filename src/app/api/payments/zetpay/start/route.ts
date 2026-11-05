import { getCurrentCustomer, originOk } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, jsonError, jsonOk, readJsonBody } from "@/lib/utils";
import { startZetpayCheckout, zetpayAvailable } from "@/lib/zetpay-checkout";

export const dynamic = "force-dynamic";

/** Build an absolute URL from the incoming request (works behind proxies). */
export function requestOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? (req.headers.get("host")?.includes(":") ? "http" : "https");
  const host = req.headers.get("host");
  if (host) return `${proto}://${host}`.replace(/\/+$/, "");
  return (process.env.APP_BASE_URL ?? "https://tournamax.toolsnetwork.online").replace(/\/+$/, "");
}

/**
 * Starts a ZetPay checkout: creates the local order + pending payment and the
 * ZetPay order, then hands back payment_url for the customer to open.
 *
 * The browser is never given the ZetAPI key.
 */
export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentCustomer();
  if (!cur) return jsonError("Not authenticated.", 401);
  if (cur.customer.status === "suspended")
    return jsonError("Your account is suspended. Contact support.", 403);

  const ip = clientIp(req);
  if (!rateLimit(`zetpay-start:${cur.customer.id}`, 8, 15 * 60 * 1000))
    return jsonError("Too many payment attempts. Please wait a few minutes.", 429);

  if (!(await zetpayAvailable()))
    return jsonError("Online payment is not enabled. Use the UPI option instead.", 409);

  const body = await readJsonBody(req);
  const planId = Number(body.planId);
  if (!Number.isInteger(planId)) return jsonError("Choose a plan.");

  const result = await startZetpayCheckout({
    customerId: cur.customer.id,
    customerEmail: cur.customer.email,
    planId,
    mobile: null,
    redirectUrl: `${requestOrigin(req)}/pay/return`,
    ip,
  });

  if (!result.ok) return jsonError(result.error, 400);
  return jsonOk({
    paymentUrl: result.paymentUrl,
    orderCode: result.orderCode,
    amountRupees: result.amountRupees,
    mode: result.mode,
    statusUrl: `/api/payments/zetpay/status?code=${encodeURIComponent(result.orderCode)}`,
  });
}
