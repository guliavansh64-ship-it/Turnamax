import Link from "next/link";
import { formatMoney } from "@/lib/format";

type PlanInfo = {
  name: string;
  priceCents: number;
  setupFeeCents: number;
  currency: string;
  durationDays: number;
  features: string[];
} | null;

/**
 * Hero "choose your plan" card shown while no subscription is active.
 *
 * Replaces the old alert banner, which pushed its long CTA button off-screen on
 * phones. Layout is stacked on mobile (button full-width) and side-by-side from
 * `sm` upward, so nothing can overflow.
 */
export default function PlanCTA({
  plan,
  isFirstOrder,
}: {
  plan: PlanInfo;
  isFirstOrder: boolean;
}) {
  const dueCents = plan
    ? isFirstOrder
      ? plan.priceCents + plan.setupFeeCents
      : plan.priceCents
    : 0;

  const bullets = [
    "Both APKs prepared for your brand",
    "Automatic UPI activation",
    "Cancel anytime — no auto-charge",
  ];

  return (
    <section
      className="plan-cta relative overflow-hidden rounded-2xl border border-volt/35 p-5 sm:p-6"
      aria-labelledby="plan-cta-title"
    >
      {/* animated aurora */}
      <span className="plan-cta-glow" aria-hidden />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tag tag-red plan-cta-pulse">action needed</span>
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-mist">
              {plan ? plan.name : "Subscription"}
            </span>
          </div>

          <h2 id="plan-cta-title" className="h-display text-xl font-bold mt-2.5 sm:text-2xl">
            Your plan isn&apos;t active yet
          </h2>
          <p className="text-mist text-sm leading-relaxed mt-1.5 max-w-prose">
            Downloads, configuration approval and APK delivery unlock the moment your payment is
            confirmed. You can keep editing branding drafts in the meantime.
          </p>

          {plan && (
            <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="mono text-2xl font-bold text-volt">
                {formatMoney(dueCents, plan.currency)}
              </span>
              <span className="text-mist text-xs">
                {isFirstOrder && plan.setupFeeCents > 0
                  ? `first payment · then ${formatMoney(plan.priceCents, plan.currency)}/${plan.durationDays}d`
                  : `per ${plan.durationDays} days`}
              </span>
              {isFirstOrder && plan.setupFeeCents > 0 && (
                <span className="mono text-[10px] text-mist w-full">
                  includes {formatMoney(plan.setupFeeCents, plan.currency)} one-time setup
                </span>
              )}
            </div>
          )}

          <ul className="mt-4 grid gap-1.5 text-[13px] text-mist sm:grid-cols-2">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-1.5">
                <span className="text-volt mt-0.5" aria-hidden>
                  ✓
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        <div className="shrink-0 sm:w-52">
          <Link
            href="/checkout"
            className="btn btn-volt w-full plan-cta-btn"
          >
            Choose your plan
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <p className="hint text-center mt-2">Secure UPI · activates instantly</p>
        </div>
      </div>
    </section>
  );
}
