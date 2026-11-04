import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminSessions } from "@/db/schema";
import { clearAdminSessionCookie, getCurrentAdmin, originOk } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentAdmin();
  if (cur) {
    await db.delete(adminSessions).where(eq(adminSessions.token, cur.token));
    await logAudit({
      actorType: "admin",
      actorId: cur.admin.id,
      action: "admin.logout",
      entity: "admin",
      entityId: String(cur.admin.id),
    });
  }
  await clearAdminSessionCookie();
  return jsonOk();
}
