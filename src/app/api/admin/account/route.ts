import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminSessions, admins } from "@/db/schema";
import {
  clearAdminSessionCookie,
  getCurrentAdmin,
  hashPassword,
  originOk,
  revokeAdminSessions,
  verifyPassword,
} from "@/lib/auth";
import { clientIp, jsonError, jsonOk, readJsonBody } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Update the signed-in administrator's name and/or password. */
export async function PUT(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const a = cur.admin;
  const ip = clientIp(req);
  const body = await readJsonBody(req);

  const name = body.name != null ? String(body.name).trim() : undefined;
  const currentPassword =
    body.currentPassword != null ? String(body.currentPassword) : "";
  const newPassword = body.password != null ? String(body.password) : undefined;

  if (name !== undefined && (name.length < 2 || name.length > 80))
    return jsonError("Name must be 2–80 characters.");

  if (newPassword !== undefined) {
    // Any password change requires re-entering the current one.
    if (!currentPassword || !verifyPassword(currentPassword, a.passwordHash))
      return jsonError("Current password is incorrect.", 403);
    if (newPassword.length < 10 || newPassword.length > 100)
      return jsonError("New password must be at least 10 characters.");
    if (/(password|admin123|12345678|qwerty)/i.test(newPassword))
      return jsonError("That password is too weak. Choose something long and unique.");
  }

  if (name === undefined && newPassword === undefined)
    return jsonError("Nothing to update.");

  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (newPassword !== undefined) patch.passwordHash = hashPassword(newPassword);

  await db.update(admins).set(patch).where(eq(admins.id, a.id));

  await logAudit({
    actorType: "admin",
    actorId: a.id,
    action: "admin.account_updated",
    entity: "admin",
    entityId: String(a.id),
    meta: {
      changed: [name !== undefined ? "name" : "", newPassword !== undefined ? "password" : ""]
        .filter(Boolean),
    },
    ip,
  });

  // A password change invalidates every existing admin session (including this
  // one), so the owner must sign in again with the new credentials.
  if (newPassword !== undefined) {
    await db.delete(adminSessions).where(eq(adminSessions.adminId, a.id));
    await clearAdminSessionCookie();
    return jsonOk({ signedOut: true });
  }
  return jsonOk();
}

/** Convenience: revoke every admin session without changing the password. */
export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const body = await readJsonBody(req);
  if (String(body.action ?? "") !== "revoke_sessions")
    return jsonError("Unknown action.");
  await revokeAdminSessions(cur.admin.id);
  await logAudit({
    actorType: "admin",
    actorId: cur.admin.id,
    action: "admin.sessions_revoked",
    entity: "admin",
    entityId: String(cur.admin.id),
    ip: clientIp(req),
  });
  await clearAdminSessionCookie();
  return jsonOk({ signedOut: true });
}
