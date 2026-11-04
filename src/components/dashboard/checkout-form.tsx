"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { toast } from "../toast";
import { formatMoney } from "@/lib/format";

type Plan = {
  id: number;
  name: string;
  cycle: "monthly" | "yearly";
  priceCents: number;
  setupFeeCents: number;
  currency: string;
  durationDays: number;
  description: string;
  features: string[];
  featured: boolean;
};

type Props = {
  plans: Plan[];
  initialPlanId: number | null;
  branding: {
    appName: string | null;
    tenantId: string | null;
    logoName: string | null;
    status: string;
  } | null;
  pendingOrderCode?: string | null;
  /** The one-time setup fee only applies to the customer's first order. */
  isFirstOrder: boolean;
  /** ZetPay online checkout is configured and available. */
  zetpayEnabled?: boolean;
};

/**
 * Checkout — online UPI (ZetPay) only.
 *
 * Our server creates the gateway order (the API key never reaches this
 * browser) and returns payment_url. Returning from the gateway is only a
 * signal: the server confirms with ZetPay's order-status endpoint before
 * anything activates.
 */
export default function CheckoutForm({
  plans,
  initialPlanId,
  branding,
  pendingOrderCode,
  isFirstOrder,
  zetpayEnabled = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number>(initialPlanId ?? plans[0]?.id ?? 0);

  const selected = plans.find((p) => p.id === selectedId);
  const payNow = selected
    ? isFirstOrder
      ? selected.priceCents + selected.setupFeeCents
      : selected.priceCents
    : 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!selectedId) {
      toast("Choose a plan first.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/payments/zetpay/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: selectedId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        toast(data.error ?? "Could not start the payment. Please try again.", "error");
        return;
      }
      toast("Opening secure UPI checkout…", "success");
      // Full-page redirect works in every browser and WebView.
      window.location.href = data.paymentUrl;
    } catch {
      toast("Network error.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!zetpayEnabled) {
    return (
      <div className="card p-8 text-center max-w-lg mx-auto">
        <h2 className="h-display text-2xl font-bold mb-3">Payments are briefly offline</h2>
        <p className="text-mist text-sm leading-relaxed mb-6">
          Online payment is being configured right now. Please check back in a little while — your
          account, branding and plan selection are all saved.
        </p>
        <Link href="/dashboard" className="btn btn-ghost w-full">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid lg:grid-cols-3 gap-6 items-start">
      <div className="lg:col-span-2 space-y-6">
        {pendingOrderCode && (
          <div className="banner">
            <p className="text-sm">
              You already have a pending order <b className="mono text-gold">{pendingOrderCode}</b>.
              If you just paid, open your dashboard — confirmation is automatic.
            </p>
          </div>
        )}

        <div className="card p-6">
          <p className="label">1 · Choose your plan</p>
          <div className="space-y-3">
            {plans.map((p) => (
              <label
                key={p.id}
                className={`flex items-center gap-4 border rounded-xl p-4 cursor-pointer transition-all ${
                  selectedId === p.id
                    ? "border-volt bg-volt/[0.05]"
                    : "border-line hover:border-line2"
                }`}
              >
                <input
                  type="radio"
                  name="planId"
                  value={p.id}
                  checked={selectedId === p.id}
                  onChange={() => setSelectedId(p.id)}
                  className="accent-[var(--color-volt)]"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{p.name}</span>
                    {p.featured && <span className="tag tag-volt">popular</span>}
                  </div>
                  <p className="text-mist text-xs mt-0.5 leading-relaxed">{p.description}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="mono font-bold text-volt">{formatMoney(p.priceCents, p.currency)}</div>
                  <div className="mono text-[10px] text-mist">
                    /{p.durationDays}d
                    {p.setupFeeCents > 0 && (
                      <>
                        <br />+{formatMoney(p.setupFeeCents, p.currency)} once
                      </>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <p className="label">2 · Pay securely with UPI</p>
          <div className="card !bg-ink2 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt/15 border border-volt/40 text-volt">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                  <path d="M2.5 10h19" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-bold">Instant UPI checkout</p>
                <p className="text-mist text-xs">
                  Google Pay, PhonePe, Paytm or any UPI app — powered by ZetPay.
                </p>
              </div>
            </div>
            <ul className="space-y-1.5 text-[13px] text-mist">
              <li className="flex gap-2">
                <span className="text-volt">✓</span> Your plan activates automatically after payment
                — no waiting for manual verification.
              </li>
              <li className="flex gap-2">
                <span className="text-volt">✓</span> Confirmation happens server-to-server with the
                gateway, never from your browser alone.
              </li>
              <li className="flex gap-2">
                <span className="text-volt">✓</span> We never ask for UPI PINs, OTPs or banking
                credentials.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="card p-6">
          <p className="label">Order summary</p>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-mist">Plan</span>
              <span className="font-semibold">{selected?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-mist">Duration</span>
              <span>{selected?.durationDays ?? "—"} days</span>
            </div>
            <div className="flex justify-between">
              <span className="text-mist">Covers</span>
              <span>User + Admin APKs</span>
            </div>

            {selected && selected.setupFeeCents > 0 && isFirstOrder && (
              <div className="flex justify-between">
                <span className="text-mist">One-time setup (APK preparation)</span>
                <span className="mono">{formatMoney(selected.setupFeeCents, selected.currency)}</span>
              </div>
            )}
            {selected && (
              <div className="flex justify-between">
                <span className="text-mist">
                  {isFirstOrder && selected.setupFeeCents > 0 ? "First month" : "Subscription"}
                </span>
                <span className="mono">{formatMoney(selected.priceCents, selected.currency)}</span>
              </div>
            )}

            <div className="divider my-3" />
            <div className="flex justify-between items-center">
              <span className="font-bold">Pay now</span>
              <span className="mono text-xl font-bold text-volt">
                {selected ? formatMoney(payNow, selected.currency) : "—"}
              </span>
            </div>
            {selected && selected.setupFeeCents > 0 && (
              <p className="hint">
                {isFirstOrder
                  ? `Includes the one-time ${formatMoney(
                      selected.setupFeeCents,
                      selected.currency
                    )} setup fee. Future renewals cost only ${formatMoney(
                      selected.priceCents,
                      selected.currency
                    )} every ${selected.durationDays} days.`
                  : "Renewal — the one-time setup fee was already paid on your first order."}
              </p>
            )}
          </div>
        </div>

        <div className="card p-6">
          <p className="label">Your branding</p>
          {branding?.appName ? (
            <div className="space-y-1">
              <p className="font-bold">{branding.appName}</p>
              <p className="mono text-[11px] text-mist break-all">{branding.tenantId}</p>
              <p className="text-mist text-xs">
                Status: <span className="capitalize">{branding.status}</span>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-mist text-sm">
                You haven&apos;t set branding yet. You can pay first, but submitting branding now
                speeds up preparation.
              </p>
              <Link href="/dashboard/branding" className="btn btn-ghost btn-sm">
                Set up branding
              </Link>
            </div>
          )}
        </div>

        <button type="submit" className="btn btn-volt btn-lg w-full" disabled={busy}>
          {busy ? (
            <span className="spinner" />
          ) : (
            <>Pay {selected ? formatMoney(payNow, selected.currency) : ""} now with UPI</>
          )}
        </button>
        <p className="hint text-center">
          You&apos;ll complete payment on ZetPay&apos;s secure checkout. Your plan activates the
          moment the gateway confirms the payment to our server.
        </p>
      </div>
    </form>
  );
}
