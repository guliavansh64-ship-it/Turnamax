import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { branding, orders, payments, plans } from "@/db/schema";
import { getCurrentCustomer } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { zetpayAvailable } from "@/lib/zetpay-checkout";
import CheckoutForm from "@/components/dashboard/checkout-form";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const cur = await getCurrentCustomer();
  if (!cur) redirect("/login");
  const c = cur.customer;
  await ensureSeed();

  const { plan: planParam } = await searchParams;
  const wantPlanId = Number(planParam);

  const [allPlans, brandRows, latestPayRows, priorOrderRows, zetpayOn] = await Promise.all([
    db.select().from(plans).where(eq(plans.active, true)).orderBy(desc(plans.sort)),
    db.select().from(branding).where(eq(branding.customerId, c.id)).limit(1),
    db
      .select({ pay: payments, order: orders })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(eq(payments.customerId, c.id))
      .orderBy(desc(payments.createdAt))
      .limit(1),
    db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.customerId, c.id))
      .limit(1),
    zetpayAvailable(),
  ]);

  const brand = brandRows[0] ?? null;
  const latest = latestPayRows[0];
  const pendingPayment =
    latest && latest.pay.status === "pending" ? latest.order.orderCode : null;

  const plan =
    allPlans.find((p) => p.id === wantPlanId && p.active) ??
    allPlans.find((p) => p.cycle === "monthly") ??
    allPlans[0];

  if (c.status === "suspended") {
    return (
      <main className="min-h-screen grid place-items-center px-4">
        <div className="card p-8 max-w-md w-full text-center">
          <h1 className="h-display text-2xl font-bold mb-3 text-coral">
            Account suspended
          </h1>
          <p className="text-mist text-sm mb-6">
            New orders are disabled while your account is suspended. Contact support to resolve
            this.
          </p>
          <Link href="/dashboard" className="btn btn-ghost w-full">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="wrap">
        <Link href="/dashboard" className="mono text-[11px] text-mist hover:text-volt">
          ← Dashboard
        </Link>
        <p className="kicker mb-2 mt-4">Checkout</p>
        <h1 className="h-display text-3xl font-bold mb-8">Subscribe & submit payment</h1>
        <CheckoutForm
          plans={allPlans.map((p) => ({
            id: p.id,
            name: p.name,
            cycle: p.cycle,
            priceCents: p.priceCents,
            setupFeeCents: p.setupFeeCents,
            currency: p.currency,
            durationDays: p.durationDays,
            description: p.description,
            features: p.features,
            featured: p.featured,
          }))}
          isFirstOrder={priorOrderRows.length === 0}
          zetpayEnabled={zetpayOn}
          initialPlanId={plan?.id ?? null}
          branding={
            brand
              ? {
                  appName: brand.appName,
                  tenantId: brand.tenantId,
                  logoName: brand.logoName,
                  status: brand.status,
                }
              : null
          }
          pendingOrderCode={pendingPayment}
        />
      </div>
    </main>
  );
}
