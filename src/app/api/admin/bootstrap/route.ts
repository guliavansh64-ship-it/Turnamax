import { count } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { createAdminSession, hashPassword, originOk, setAdminSessionCookie } from "@/lib/auth";
import { clientIp, jsonError, jsonOk, readJsonBody } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Secure first-admin bootstrap: only works while ZERO administrators exist.
 * The created account gets the owner role. After the first admin exists,
 * this endpoint permanently refuses.
 */
export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const ip = clientIp(req);
  if (!rateLimit(`bootstrap:${ip}`, 5, 15 * 60 * 1000))
    return jsonError("Too many attempts. Try again later.", 429);

  const existing = await db.select({ n: count() }).from(admins);
  if (Number(existing[0]?.n ?? 0) > 0)
    return jsonError("An administrator already exists. Use the admin login.", 409);

  const body = await readJsonBody(req);
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (name.length < 2 || name.length > 80) return jsonError("Enter your name.");
  if (!EMAIL_RE.test(email)) return jsonError("Enter a valid email.");
  if (password.length < 10)
    return jsonError("Admin password must be at least 10 characters.");
  if (/(password|admin123|12345678)/i.test(password))
    return jsonError("That password is too weak. Choose something unique and long.");

  const [admin] = await db
    .insert(admins)
    .values({ name, email, passwordHash: hashPassword(password), role: "owner" })
    .returning();

  const token = await createAdminSession(admin.id, ip, req.headers.get("user-agent") ?? "");
  await setAdminSessionCookie(token);
  await logAudit({
    actorType: "admin",
    actorId: admin.id,
    action: "admin.bootstrapped",
    entity: "admin",
    entityId: String(admin.id),
    ip,
  });
  return jsonOk({ id: admin.id });
}
