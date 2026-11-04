import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentCustomer } from "@/lib/auth";
import { confirmZetpayOrder } from "@/lib/zetpay-checkout";
import PayReturnPoller from "@/components/pay-return-poller";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment result" };

export default async function PayReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderCode: string }>;
  searchParams: Promise<{ zp_order?: string; zp_result?: string }>;
}) {
  const [{ orderCode }, query, cur] = await Promise.all([
    params,
    searchParams,
    getCurrentCustomer(),
  ]);

  // NEVER branch on query.zp_result — it can be spoofed or truncated. We only
  // read zp_order so we can ask ZetPay ourselves.
  const gatewayOrderId = (query.zp_order ?? "").trim();

  if (!cur) {
    return (
      <main className="min-h-screen grid place-items-center px-5 py-16">
        <div className="w-full max-w-md rounded-2xl border border-line bg-ink2 p-7 text-center">
          <h1 className="h-display text-2xl font-bold">Sign in to see this result</h1>
          <p className="text-mist text-sm leading-relaxed mt-2">
            This payment return link belongs to your account. Sign in and open{" "}
            <b>Payments &amp; orders</b> to see the status for order {orderCode}.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <Link href={`/login?next=${encodeURIComponent("/dashboard/payments")}`} className="btn btn-volt">
              Sign in
            </Link>
            <Link href="/" className="btn btn-ghost">
              Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const result = await confirmZetpayOrder({
    orderCode,
    customerId: cur.customer.id,
  });

  const initial =
    result.status === "success"
      ? ({ kind: "success", message: result.message } as const)
      : result.status === "failed"
        ? ({ kind: "failed", message: result.message } as const)
        : result.status === "not_started"
          ? ({ kind: "error", message: result.message } as const)
          : ({ kind: "pending", message: result.message } as const);

  return (
    <main className="min-h-screen relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(200,243,46,.14), transparent 70%)",
        }}
        aria-hidden
      />
      <div className="relative wrap max-w-xl py-14">
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="Tournamax" className="size-8 object-contain" />
            <span className="text-sm font-semibold">
              Tourna<span className="text-[#FF5500]">max</span>
            </span>
          </Link>
          <span className="mono text-[11px] text-mist">{orderCode}</span>
        </div>

        <div className="card p-7">
          <Suspense fallback={<p className="text-mist text-sm text-center">Checking payment…</p>}>
            <PayReturnPoller code={orderCode} initial={initial as never} />
          </Suspense>
        </div>

        {gatewayOrderId && (
          <p className="mono text-[10px] text-mist mt-4 text-center break-all">
            gateway reference: {gatewayOrderId}
          </p>
        )}
      </div>
    </main>
  );
}
