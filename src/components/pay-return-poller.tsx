"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Kind = "pending" | "success" | "failed" | "error" | "not_started";

type State = { kind: Kind; message: string };

/**
 * Polls OUR server while payment is still pending. The server re-verifies with
 * ZetPay on every call; this component never decides success on its own — it
 * only reflects the answer and shows a timeout if it never arrives.
 */
export default function PayReturnPoller({
  code,
  initial,
}: {
  code: string;
  initial: State;
}) {
  const [state, setState] = useState<State>(initial);
  const [seconds, setSeconds] = useState(0);
  const stopRef = useRef(false);

  useEffect(() => {
    stopRef.current = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (stopRef.current) return;
      tries += 1;
      setSeconds(Math.round(tries * 3));
      if (tries > 40) {
        setState({
          kind: "error",
          message:
            "We could not confirm the payment within 2 minutes. If you were charged, your payment will appear in your dashboard automatically — check Payments, or contact support.",
        });
        return;
      }
      try {
        const res = await fetch(
          `/api/payments/zetpay/status?code=${encodeURIComponent(code)}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => ({}));
        // jsonOk() spreads the payload at the top level: { ok, status, message }
        const s = (data?.status ?? "") as string;
        const message: string = data?.message ?? "";
        if (s === "success" || s === "failed" || s === "not_started" || s === "error") {
          stopRef.current = true;
          setState({ kind: s, message });
          return;
        }
        setState({ kind: "pending", message: message || "Confirming payment…" });
      } catch {
        /* transient network issue — keep polling */
      }
      timer = setTimeout(tick, 3000);
    };

    if (initial.kind === "pending") tick();
    return () => {
      stopRef.current = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const icon =
    state.kind === "success" ? "✓" : state.kind === "failed" ? "✕" : state.kind === "pending" ? "…" : "!";
  const tone =
    state.kind === "success"
      ? "border-volt/40 text-volt"
      : state.kind === "failed"
        ? "border-coral/40 text-coral"
        : "border-gold/40 text-gold";

  return (
    <div className="space-y-5 text-center">
      <div className={`mx-auto grid size-14 place-items-center rounded-xl border ${tone} text-2xl`}>
        {icon}
      </div>
      <div>
        <h1 className="h-display text-2xl font-bold">
          {state.kind === "success"
            ? "Payment confirmed"
            : state.kind === "failed"
              ? "Payment failed"
              : state.kind === "pending"
                ? "Confirming your payment…"
                : "Payment not found"}
        </h1>
        <p className="text-mist text-sm leading-relaxed mt-2 max-w-md mx-auto">{state.message}</p>
        {state.kind === "pending" && (
          <p className="mono text-[11px] text-mist mt-3">
            still checking · {seconds}s elapsed · keep this page open
          </p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {state.kind === "success" ? (
          <>
            <Link href="/dashboard" className="btn btn-volt">
              Go to dashboard
            </Link>
            <Link href="/dashboard/apks" className="btn btn-ghost">
              Download your APKs
            </Link>
          </>
        ) : state.kind === "failed" || state.kind === "error" || state.kind === "not_started" ? (
          <>
            <Link href="/checkout" className="btn btn-volt">
              Back to checkout
            </Link>
            <Link href="/dashboard" className="btn btn-ghost">
              My payments
            </Link>
          </>
        ) : (
          <Link href="/dashboard" className="btn btn-ghost">
            View in dashboard
          </Link>
        )}
      </div>

      <p className="hint !text-center">
        Confirmation happens server-to-server with ZetPay. Your UPI callback and this page&apos;s
        URL are never treated as proof of payment.
      </p>
    </div>
  );
}
