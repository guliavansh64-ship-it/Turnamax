import { asc } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import PlanManager from "@/components/admin/plan-manager";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const rows = await db.select().from(plans).orderBy(asc(plans.sort), asc(plans.id));
  return (
    <div className="space-y-6">
      <div>
        <p className="kicker mb-2">Plans</p>
        <h1 className="h-display text-3xl font-bold">Subscription plans</h1>
        <p className="text-mist mt-2 text-sm max-w-2xl">
          Changes here update the public pricing page immediately (active plans only). Deactivated
          plans stay in history but are hidden from customers. The one-time setup fee is charged
          only on a customer&apos;s first order — renewals pay the recurring price alone.
        </p>
      </div>
      <PlanManager
        plans={rows.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          cycle: p.cycle,
          priceCents: p.priceCents,
          setupFeeCents: p.setupFeeCents,
          currency: p.currency,
          durationDays: p.durationDays,
          features: p.features,
          description: p.description,
          active: p.active,
          featured: p.featured,
          sort: p.sort,
        }))}
      />
    </div>
  );
}
