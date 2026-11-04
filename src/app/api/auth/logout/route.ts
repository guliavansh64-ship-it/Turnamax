import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerSessions } from "@/db/schema";
import {
  clearCustomerSessionCookie,
  getCurrentCustomer,
  originOk,
} from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentCustomer();
  if (cur) {
    await db
      .delete(customerSessions)
      .where(eq(customerSessions.token, cur.token));
    await logAudit({
      actorType: "customer",
      actorId: cur.customer.id,
      action: "customer.logout",
      entity: "customer",
      entityId: String(cur.customer.id),
    });
  }
  await clearCustomerSessionCookie();
  return jsonOk();
}
