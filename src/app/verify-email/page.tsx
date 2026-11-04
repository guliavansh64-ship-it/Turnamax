import { Suspense } from "react";
import VerifyInner from "@/components/verify-inner";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
