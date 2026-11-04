import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getCurrentCustomer, originOk } from "@/lib/auth";
import { jsonError, jsonOk, readJsonBody } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentCustomer();
  if (!cur) return jsonError("Not authenticated.", 401);
  const body = await readJsonBody(req);
  if (body.action !== "read_all") return jsonError("Unknown action.");
  await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(
        eq(notifications.customerId, cur.customer.id),
        eq(notifications.read, false)
      )
    );
  return jsonOk();
}
