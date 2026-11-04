import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apkReleases, customers } from "@/db/schema";
import { getCurrentAdmin } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const url = new URL(req.url);
  const customerId = Number(url.searchParams.get("customerId") ?? "");
  const rows = await db
    .select({ release: apkReleases, customer: customers })
    .from(apkReleases)
    .innerJoin(customers, eq(apkReleases.customerId, customers.id))
    .where(Number.isInteger(customerId) && customerId > 0 ? eq(apkReleases.customerId, customerId) : undefined)
    .orderBy(desc(apkReleases.createdAt))
    .limit(200);
  return jsonOk({ releases: rows });
}
