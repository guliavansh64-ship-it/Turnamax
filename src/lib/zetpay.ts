import { resolveZetpay } from "./integrations";

/**
 * ZetPay (ZetAPI) client.
 *
 * Two endpoints, both called ONLY from the server so the ZetAPI key never
 * reaches the browser:
 *
 *   POST /api/developer/create-order        -> payment_url
 *   GET  /api/developer/order-status/:id    -> pending | success | failed
 *
 * GOLDEN RULE (from the ZetPay docs): a redirect back to our site or a
 * client-side callback is never proof of payment. Fulfilment is gated solely
 * on a server-to-server order-status call returning status === "success".
 *
 * Limits: ₹1–₹5,000 per order, 60 requests / 15 min per key. We therefore
 * throttle our own outbound calls so customer polling cannot exhaust the
 * shared budget.
 */

const BASE = "https://zetpay-beta.vercel.app";
const MIN_RUPEES = 1;
const MAX_RUPEES = 5000;
const TIMEOUT_MS = 12_000;

/* ------------------------- outbound rate limiting ------------------------- */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_CALLS = 50; // stay under ZetPay's 60/15min hard limit
let windowStart = Date.now();
let calls = 0;

function canCall(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    calls = 0;
  }
  if (calls >= MAX_CALLS) return false;
  calls += 1;
  return true;
}

function remaining(): number {
  if (Date.now() - windowStart > WINDOW_MS) return MAX_CALLS;
  return Math.max(0, MAX_CALLS - calls);
}

/* ----------------------------- status throttle --------------------------- */

/**
 * Per-order cache so rapid polling (client every ~3s) does not translate into
 * an API call each time.
 */
const statusCache = new Map<string, { status: string; at: number }>();
const STATUS_TTL_MS = 2_200;

/* -------------------------------- helpers -------------------------------- */

async function jsonFetch(url: string, init: RequestInit, headerKey?: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(headerKey ? { "X-ZetAPI-Key": headerKey } : {}),
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
      // Gateway calls must never be served from a cache layer.
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
      data?: Record<string, unknown>;
      errors?: unknown[];
    } | null;
    return { res, body };
  } finally {
    clearTimeout(timer);
  }
}

/** Strip everything but digits — ZetPay rejects formatted amounts/numbers. */
export function cleanRupees(amountRupees: number): number {
  const n = Math.round(Number(amountRupees) * 100) / 100;
  if (!Number.isFinite(n)) return NaN;
  return n;
}

/** Normalise a phone number to ZetPay's strict format, or omit it. */
export function normalizeMobile(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const digits = String(raw).replace(/\D/g, "");
  let d = digits;
  if (d.startsWith("91") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  if (d.length !== 10 || !/^[6789]/.test(d)) return undefined; // must start 6/7/8/9
  return d;
}

/* -------------------------------- API calls ------------------------------- */

export type CreateResult =
  | { ok: true; orderId: string; paymentUrl: string; amount: number; mode: string }
  | { ok: false; error: string; retryable?: boolean };

export async function createZetpayOrder(opts: {
  amountRupees: number;
  title: string;
  redirectUrl?: string;
  mobile?: string | null;
}): Promise<CreateResult> {
  const cfg = await resolveZetpay();
  if (!cfg.enabled) return { ok: false, error: "ZetPay is not enabled." };
  if (!cfg.apiKey) return { ok: false, error: "ZetPay API key is not configured." };

  const amount = cleanRupees(opts.amountRupees);
  if (!Number.isFinite(amount) || amount < MIN_RUPEES || amount > MAX_RUPEES) {
    return {
      ok: false,
      error: `ZetPay accepts ₹${MIN_RUPEES}–₹${MAX_RUPEES} per transaction. This order is ₹${opts.amountRupees}. Pay by UPI instead.`,
    };
  }
  if (!canCall()) {
    return {
      ok: false,
      error: "Payment service is busy (rate limit). Please try again in a few minutes.",
      retryable: true,
    };
  }

  const title = (opts.title || cfg.title || "TurfLaunch payment").slice(0, 100);
  const mobile = normalizeMobile(opts.mobile);

  try {
    const { res, body } = await jsonFetch(`${BASE}/api/developer/create-order`, {
      method: "POST",
      body: JSON.stringify({
        zap_api: cfg.apiKey,
        amount,
        title,
        ...(opts.redirectUrl ? { redirect_url: opts.redirectUrl } : {}),
        ...(mobile ? { customer_mobile: mobile } : {}),
      }),
    });

    if (res.ok && body?.success && body.data) {
      const paymentUrl = String(body.data.payment_url ?? "");
      const orderId = String(body.data.order_id ?? "");
      if (!paymentUrl || !orderId) return { ok: false, error: "ZetPay returned no payment link." };
      return {
        ok: true,
        orderId,
        paymentUrl,
        amount: Number(body.data.amount ?? amount),
        mode: String(body.data.mode ?? "unknown"),
      };
    }

    const message = body?.message ?? `HTTP ${res.status}`;
    if (res.status === 429)
      return { ok: false, error: "Too many payment requests. Try again shortly.", retryable: true };
    if (res.status === 503)
      return { ok: false, error: "Payment system is under maintenance. Try again shortly.", retryable: true };
    if (res.status === 401)
      return { ok: false, error: "ZetPay API key is missing or invalid. Check Admin → System." };
    if (res.status === 400 && Array.isArray(body?.errors))
      return { ok: false, error: `ZetPay rejected the request: ${JSON.stringify(body.errors)}` };
    return { ok: false, error: message };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Network error";
    return { ok: false, error: `Could not reach ZetPay (${msg}).`, retryable: true };
  }
}

export type StatusResult =
  | { ok: true; status: "pending" | "success" | "failed"; amount: number; orderId: string }
  | { ok: false; error: string; retryable?: boolean };

/**
 * Confirm an order with ZetPay. Cached for ~2.2s per order to absorb polling
 * without burning the shared rate-limit budget.
 */
export async function getZetpayStatus(orderId: string): Promise<StatusResult> {
  if (!/^[\w-]{4,80}$/.test(orderId))
    return { ok: false, error: "Invalid payment reference." };

  const cached = statusCache.get(orderId);
  if (cached && Date.now() - cached.at < STATUS_TTL_MS) {
    if (cached.status === "success" || cached.status === "failed") {
      return {
        ok: true,
        status: cached.status as "success" | "failed",
        amount: 0,
        orderId,
      };
    }
    return { ok: true, status: "pending", amount: 0, orderId };
  }

  const cfg = await resolveZetpay();
  if (!cfg.enabled || !cfg.apiKey)
    return { ok: false, error: "ZetPay is not configured on this server." };

  if (!canCall()) {
    // Rate limited: report "pending" rather than blocking a real success.
    return { ok: true, status: "pending", amount: 0, orderId };
  }

  try {
    const { res, body } = await jsonFetch(
      `${BASE}/api/developer/order-status/${encodeURIComponent(orderId)}`,
      { method: "GET" },
      cfg.apiKey
    );

    if (res.ok && body?.success && body.data) {
      const raw = String(body.data.status ?? "pending");
      const status: "pending" | "success" | "failed" =
        raw === "success" ? "success" : raw === "failed" ? "failed" : "pending";
      statusCache.set(orderId, { status, at: Date.now() });
      if (statusCache.size > 500) statusCache.clear();
      return {
        ok: true,
        status,
        amount: Number(body.data.amount ?? 0),
        orderId: String(body.data.order_id ?? orderId),
      };
    }

    if (res.status === 404) return { ok: false, error: "Payment reference not found." };
    if (res.status === 429) return { ok: true, status: "pending", amount: 0, orderId };
    const message = body?.message ?? `HTTP ${res.status}`;
    return { ok: false, error: message };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Network error";
    return { ok: false, error: `Could not reach ZetPay (${msg}).`, retryable: true };
  }
}

export const ZETPAY_LIMITS = { MIN_RUPEES, MAX_RUPEES, remaining };
