import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { getCurrentAdmin, originOk } from "@/lib/auth";
import { clientIp, jsonError, jsonOk, readJsonBody, slugify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const rows = await db.select().from(plans).orderBy(plans.sort);
  return jsonOk({ plans: rows });
}

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const ip = clientIp(req);
  const body = await readJsonBody(req);

  const name = String(body.name ?? "").trim();
  const cycle = String(body.cycle ?? "");
  const price = Number(body.price);
  const setupFee = Number(body.setupFee ?? 0) || 0;
  const durationDays = Math.floor(Number(body.durationDays ?? 0));
  const description = String(body.description ?? "").trim().slice(0, 200);
  const featuresRaw = String(body.features ?? "");
  const features = featuresRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  const active = Boolean(body.active);
  const featured = Boolean(body.featured);

  if (name.length < 2 || name.length > 40) return jsonError("Plan name must be 2–40 characters.");
  if (!["monthly", "yearly"].includes(cycle)) return jsonError("Cycle must be monthly or yearly.");
  if (!Number.isFinite(price) || price <= 0) return jsonError("Price must be greater than zero.");
  if (!Number.isFinite(setupFee) || setupFee < 0 || setupFee > 1_000_000)
    return jsonError("Setup fee must be between 0 and 10,00,000.");
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 730)
    return jsonError("Duration must be 1–730 days.");
  if (features.length === 0) return jsonError("Add at least one feature line.");

  let slug = slugify(name) || "plan";
  let i = 2;
  for (;;) {
    const clash = await db.select({ n: count() }).from(plans).where(eq(plans.slug, slug)).limit(1);
    if ((clash[0]?.n ?? 0) === 0) break;
    slug = `${slugify(name)}-${i++}`;
    if (i > 30) return jsonError("Could not derive a unique slug.");
  }

  const [plan] = await db
    .insert(plans)
    .values({
      name,
      slug,
      cycle: cycle as "monthly",
      priceCents: Math.round(price * 100),
      setupFeeCents: Math.round(setupFee * 100),
      currency: "INR",
      durationDays,
      features,
      description,
      active,
      featured,
      sort: Math.floor(Number(body.sort ?? 100)) || 100,
    })
    .returning();

  await logAudit({
    actorType: "admin",
    actorId: cur.admin.id,
    action: "plan.created",
    entity: "plan",
    entityId: String(plan.id),
    meta: { name, price, cycle },
    ip,
  });
  return jsonOk({ plan });
}
