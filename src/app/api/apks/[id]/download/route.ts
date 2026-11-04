import { createReadStream, existsSync, statSync } from "fs";
import { Readable } from "stream";
import { eq } from "drizzle-orm";
import { DOWNLOAD_LOCK_MESSAGE, getPlanAccess } from "@/lib/access";
import { db } from "@/db";
import { apkReleases, downloadLog } from "@/db/schema";
import { getCurrentCustomer } from "@/lib/auth";
import {
  canDownloadApk,
  clientIp,
  getCustomerSubscription,
  jsonError,
  storagePath,
} from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const releaseId = Number(id);
  if (!Number.isInteger(releaseId)) return jsonError("Invalid APK id.", 400);

  const cur = await getCurrentCustomer();
  if (!cur) return jsonError("Not authenticated.", 401);

  const rows = await db
    .select()
    .from(apkReleases)
    .where(
      // Ownership enforced here: a customer can only ever fetch their own releases.
      eq(apkReleases.id, releaseId)
    )
    .limit(1);
  const release = rows[0];
  if (!release || release.customerId !== cur.customer.id)
    return jsonError("APK not found.", 404);
  if (!release.published || release.superseded)
    return jsonError("This APK release is not available.", 410);

  // Plan gate: active subscription, inside grace window, or explicitly published for this customer.
  const access = await getPlanAccess(cur.customer.id);
  const isPublishedForCustomer = release.published && !release.superseded;
  if (!(access.active || access.grace || isPublishedForCustomer))
    return jsonError(DOWNLOAD_LOCK_MESSAGE, 402);

  const filePath = storagePath("apks", release.fileName);
  if (!existsSync(filePath))
    return jsonError("APK file is missing from storage. Contact support.", 500);

  const size = statSync(filePath).size;
  const display = `${release.appName.replace(/[^\w\- ]+/g, "")}.${release.appType}-v${release.versionName.replace(/[^\w.]+/g, "")}.apk`;
  const stream = createReadStream(filePath);
  const web = Readable.toWeb(stream) as unknown as ReadableStream;

  await db
    .insert(downloadLog)
    .values({
      customerId: cur.customer.id,
      apkId: release.id,
      ip: clientIp(null),
    })
    .catch(() => {});
  await logAudit({
    actorType: "customer",
    actorId: cur.customer.id,
    action: "apk.downloaded",
    entity: "apk_release",
    entityId: String(release.id),
    meta: { appType: release.appType, version: release.versionName },
  });

  return new Response(web, {
    headers: {
      "content-type": "application/vnd.android.package-archive",
      "content-length": String(size),
      "content-disposition": `attachment; filename="${display}"`,
      "cache-control": "no-store",
    },
  });
}
