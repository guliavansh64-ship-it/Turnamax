"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the digest so it can be matched with server logs.
    console.error("page_error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="min-h-screen grid place-items-center px-5 py-16">
      <div className="w-full max-w-md rounded-2xl border border-line bg-ink2 p-7 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl border border-coral/40 bg-coral/10 text-coral text-xl">
          !
        </div>
        <h1 className="h-display text-2xl font-bold mt-4">Something went wrong</h1>
        <p className="text-mist text-sm leading-relaxed mt-2">
          This page hit an unexpected error. Your account and files are safe — nothing was lost.
          Try again, and if it keeps happening contact support with the reference below.
        </p>
        {error.digest && (
          <p className="mono text-[11px] text-mist mt-3 break-all">Ref: {error.digest}</p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
          <button onClick={reset} className="btn btn-volt">
            Try again
          </button>
          <Link href="/dashboard" className="btn btn-ghost">
            Go to dashboard
          </Link>
        </div>
        <p className="mono text-[11px] text-mist mt-5">
          <Link href="/" className="underline">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
