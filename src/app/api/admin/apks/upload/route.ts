import { and, eq } from "drizzle-orm";
import { promises as fs } from "fs";
import crypto from "crypto";
import { db } from "@/db";
import { apkReleases, branding, customers } from "@/db/schema";
import { getCurrentAdmin, originOk } from "@/lib/auth";
import {
  APK_MAX_BYTES,
  clientIp,
  ensureDir,
  isApkBuffer,
  jsonError,
  jsonOk,
  notify,
  sha256Hex,
  storagePath,
} from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const ip = clientIp(req);
  if (!rateLimit(`apk-upload:${cur.admin.id}`, 30, 60 * 60 * 1000))
    return jsonError("Too many uploads. Try again later.", 429);

  const fd = await req.formData().catch(() => null);
  if (!fd) return jsonError("Invalid form data.");

  const customerId = Number(fd.get("customerId"));
  const appType = String(fd.get("appType") ?? "");
  const versionName = String(fd.get("versionName") ?? "").trim().slice(0, 30);
  const versionCode = Number(fd.get("versionCode") ?? 0) || undefined;
  const releaseNotes = String(fd.get("releaseNotes") ?? "").trim().slice(0, 1000);

  if (!Number.isInteger(customerId)) return jsonError("Missing customer.");
  if (!["user", "admin"].includes(appType)) return jsonError("Invalid app type.");
  const appTypeLit = appType as "user" | "admin";
  if (!/^\d+(\.\d+){0,3}$/.test(versionName))
    return jsonError("Version must look like 1.0.0");

  const cRows = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  const customer = cRows[0];
  if (!customer) return jsonError("Customer not found.", 404);
  if (customer.status === "deactivated")
    return jsonError("Customer account is deactivated; upload blocked.");

  const file = fd.get("file");
  if (!file || typeof file === "string") return jsonError("Choose an APK file.");
  if (file.size > APK_MAX_BYTES)
    return jsonError(`APK exceeds the ${(APK_MAX_BYTES / 1048576).toFixed(0)} MB limit.`);
  if (file.size < 1024) return jsonError("File is too small to be a valid APK.");

  const buf = Buffer.from(await file.arrayBuffer());
  if (!isApkBuffer(buf, file.name))
    return jsonError(
      "Invalid APK: the file content does not match the ZIP/APK signature. Only real, prepared .apk files are accepted."
    );

  await ensureDir("apks");
  const storedName = `apk-${crypto.randomBytes(12).toString("hex")}.apk`;
  await fs.writeFile(storagePath("apks", storedName), buf);

  const bRows = await db
    .select()
    .from(branding)
    .where(eq(branding.customerId, customerId))
    .limit(1);
  const appName = bRows[0]?.appName || `Tournament App ${customer.name.split(" ")[0]}`;

  // Supersede any previous DRAFT (never-published) release of the same type
  const drafts = await db
    .select()
    .from(apkReleases)
    .where(
      and(
        eq(apkReleases.customerId, customerId),
        eq(apkReleases.appType, appTypeLit),
        eq(apkReleases.published, false),
        eq(apkReleases.superseded, false)
      )
    );
  for (const d of drafts) {
    await db
      .update(apkReleases)
      .set({ superseded: true })
      .where(eq(apkReleases.id, d.id));
    await fs.rm(storagePath("apks", d.fileName), { force: true }).catch(() => {});
  }

  const [release] = await db
    .insert(apkReleases)
    .values({
      customerId,
      appType: appType as "user",
      appName,
      versionName,
      versionCode: versionCode ?? null,
      fileName: storedName,
      fileSize: buf.byteLength,
      sha256: sha256Hex(buf),
      releaseNotes: releaseNotes || null,
      published: false,
      superseded: false,
      uploadedBy: cur.admin.id,
    })
    .returning();

  await logAudit({
    actorType: "admin",
    actorId: cur.admin.id,
    action: "apk.uploaded",
    entity: "apk_release",
    entityId: String(release.id),
    meta: { customerId, appType, versionName, bytes: buf.byteLength, sha256: sha256Hex(buf).slice(0, 12) },
    ip,
  });

  return jsonOk({ releaseId: release.id, sha256: release.sha256 });
}
