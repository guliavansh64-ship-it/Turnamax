import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { getCurrentAdmin, originOk } from "@/lib/auth";
import { clientIp, jsonError, jsonOk, readJsonBody } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ALLOWED = [
  "hero",
  "features",
  "faqs",
  "upi",
  "contact",
  "policies",
  "announcements",
  "testimonials",
  "subscription_config",
];

export async function GET() {
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const rows = await db.select().from(siteSettings);
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return jsonOk({ settings: out });
}

export async function PUT(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const ip = clientIp(req);
  const body = await readJsonBody(req);

  const changed: string[] = [];
  for (const key of ALLOWED) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value === null) continue;
    if (typeof value !== "object")
      return jsonError(`Section "${key}" must be an object or array.`);
    // Basic size guard
    if (JSON.stringify(value).length > 60_000)
      return jsonError(`Section "${key}" is too large.`);
    await db
      .insert(siteSettings)
      .values({ key, value: value as never, updatedAt: new Date() })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: value as never, updatedAt: new Date() } });
    changed.push(key);
  }

  if (changed.length === 0) return jsonError("Nothing to update.");
  await logAudit({
    actorType: "admin",
    actorId: cur.admin.id,
    action: "content.updated",
    entity: "site_settings",
    meta: { sections: changed },
    ip,
  });
  return jsonOk({ changed });
}
