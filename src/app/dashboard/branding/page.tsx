import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { branding } from "@/db/schema";
import { getCurrentCustomer } from "@/lib/auth";
import BrandingForm, { LogoUpload } from "@/components/dashboard/branding-form";
import FirebaseSummary from "@/components/firebase-summary";
import { getPlanAccess, PLAN_LOCK_MESSAGE } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  const cur = await getCurrentCustomer();
  if (!cur) redirect("/login");
  const c = cur.customer;

  const rows = await db
    .select()
    .from(branding)
    .where(eq(branding.customerId, c.id))
    .limit(1);
  const b = rows[0] ?? null;
  const access = await getPlanAccess(c.id);

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker mb-2">App branding</p>
        <h1 className="h-display text-3xl font-bold">Your app&apos;s identity</h1>
        <p className="text-mist mt-2 max-w-2xl">
          These details are applied when our team prepares your two APKs. We review them in the
          admin panel before building — and they are never mixed with other customers.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="card p-6 lg:col-span-2">
          <BrandingForm
            initial={{
              appName: b?.appName ?? null,
              brandPrimary: b?.brandPrimary ?? null,
              brandSecondary: b?.brandSecondary ?? null,
              tenantId: b?.tenantId ?? null,
              firebaseProjectId: b?.firebaseProjectId ?? null,
              firebaseAppId: b?.firebaseAppId ?? null,
              firebaseApiKey: b?.firebaseApiKey ?? null,
              notes: b?.notes ?? null,
              logoName: b?.logoName ?? null,
              status: b?.status ?? null,
            }}
          />
        </div>

        <div className="space-y-6">
          <FirebaseSummary
            record={
              b
                ? {
                    appName: b.appName,
                    tenantId: b.tenantId,
                    firebaseProjectId: b.firebaseProjectId,
                    firebaseAppId: b.firebaseAppId,
                    firebaseApiKey: b.firebaseApiKey,
                    status: b.status,
                  }
                : null
            }
            title="Firebase configuration on file"
          />

          {!access.active && (
            <div className="banner">
              <p className="text-[13px] leading-relaxed">
                <b className="text-gold">Plan not active.</b> You can save drafts at any time, but
                submitting the final configuration for review unlocks once your payment is verified.{" "}
                <a href="/dashboard/subscription" className="text-volt underline">
                  Choose your plan
                </a>
                .
              </p>
            </div>
          )}

          <div className="card p-6">
            <h2 className="font-bold mb-4">Logo</h2>
            <LogoUpload logoName={b?.logoName ?? null} />
          </div>
          <div className="card p-6">
            <h2 className="font-bold mb-3">Tenant identifier</h2>
            {b?.tenantId ? (
              <div className="space-y-2">
                <code className="inline-block mono text-sm text-volt bg-ink border border-line rounded-lg px-3 py-2">
                  {b.tenantId}
                </code>
                <p className="hint">
                  Your unique build identifier. It is compiled into your APKs and used for tenant
                  isolation.
                </p>
              </div>
            ) : (
              <p className="text-mist text-sm">
                Auto-generated from your app name when you save.
              </p>
            )}
          </div>
          <div className="card p-6">
            <h2 className="font-bold mb-3">Status</h2>
            {b?.status === "submitted" ? (
              <p className="text-sm">
                <span className="tag tag-green mb-2">submitted</span>
                <br />
                <span className="text-mist">
                  Our team has your details. Updates you save are queued for the next preparation.
                </span>
              </p>
            ) : (
              <p className="text-sm text-mist">
                <span className="tag tag-amber mb-2">draft</span>
                <br />
                Tick “Submit for preparation” when you&apos;re ready.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
