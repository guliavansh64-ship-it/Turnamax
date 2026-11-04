import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import {
  createAdminSession,
  originOk,
  setAdminSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { clientIp, jsonError, jsonOk, readJsonBody } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const ip = clientIp(req);
  const body = await readJsonBody(req);
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return jsonError("Enter credentials.");
  if (!rateLimit(`admin-login:${ip}:${email}`, 5, 15 * 60 * 1000))
    return jsonError("Too many attempts. Try again in 15 minutes.", 429);

  const rows = await db.select().from(admins).where(eq(admins.email, email)).limit(1);
  const admin = rows[0];
  const valid = admin && admin.active && verifyPassword(password, admin.passwordHash);
  if (!admin || !valid) return jsonError("Invalid credentials.", 401);

  const token = await createAdminSession(admin.id, ip, req.headers.get("user-agent") ?? "");
  await setAdminSessionCookie(token);
  await logAudit({
    actorType: "admin",
    actorId: admin.id,
    action: "admin.login",
    entity: "admin",
    entityId: String(admin.id),
    ip,
  });
  return jsonOk({ id: admin.id });
}
