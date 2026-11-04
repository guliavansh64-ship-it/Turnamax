"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function VerifyInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setError("Missing verification token.");
      return;
    }
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setState("ok");
        else {
          setError(d.error ?? "Verification failed.");
          setState("error");
        }
      })
      .catch(() => {
        setError("Network error.");
        setState("error");
      });
  }, [token]);

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="card p-8 max-w-md w-full text-center">
        {state === "working" && (
          <>
            <span className="spinner text-volt inline-block" />
            <p className="text-mist text-sm mt-4">Verifying your email…</p>
          </>
        )}
        {state === "ok" && (
          <>
            <div className="w-14 h-14 mx-auto rounded-full bg-volt/15 border border-volt/40 grid place-items-center text-volt mb-5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h1 className="h-display text-2xl font-bold mb-3">Email verified</h1>
            <p className="text-mist text-sm mb-6">Your account is fully active.</p>
            <Link href="/dashboard" className="btn btn-volt w-full">
              Go to dashboard
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <p className="text-mist text-sm mb-6">{error}</p>
            <Link href="/login" className="btn btn-ghost w-full">
              Back to login
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
