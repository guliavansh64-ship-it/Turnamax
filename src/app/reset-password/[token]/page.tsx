import type { ReactNode } from "react";
import ResetForm from "@/components/auth/reset-form";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const inner: ReactNode = (
    <main className="min-h-screen grid place-items-center px-4 py-16 relative overflow-hidden">
      <div className="hero-bg">
        <div className="hero-glow !opacity-10" />
      </div>
      <div className="card p-8 w-full max-w-md relative">
        <p className="kicker mb-3">Set a new password</p>
        <h1 className="h-display text-2xl font-bold mb-6">Choose a new password</h1>
        <ResetForm token={token} />
      </div>
    </main>
  );
  return inner;
}
