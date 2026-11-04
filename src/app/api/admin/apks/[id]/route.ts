import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apkReleases, customers } from "@/db/schema";
import { getCurrentAdmin, originOk } from "@/lib/auth";
import {
  canDownloadApk,
  clientIp,
  getCustomerSubscription,
  jsonError,
  jsonOk,
  notify,
  readJsonBody,
} from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentAdmin();
  if (!cur) return jsonError("Not authenticated.", 401);
  const { id } = await params;
  const releaseId = Number(id);
  if (!Number.isInteger(releaseId)) return jsonError("Invalid release.", 400);
  const ip = clientIp(req);
  const body = await readJsonBody(req);
  const action = String(body.action ?? "");

  const rows = await db
    .select()
    .from(apkReleases)
    .where(eq(apkReleases.id, releaseId))
    .limit(1);
  const release = rows[0];
  if (!release) return jsonError("Release not found.", 404);

  if (action === "publish") {
    if (release.superseded) return jsonError("This release was already revoked.", 409);
    const cRows = await db
      .select()
      .from(customers)
      .where(eq(customers.id, release.customerId))
      .limit(1);
    const customer = cRows[0];
    if (!customer) return jsonError("Customer missing.", 404);
    if (customer.status === "suspended" || customer.status === "deactivated")
      return jsonError(
        `Cannot publish: customer is ${customer.status}. Re-activate them first.`,
        409
      );

    await db.transaction(async (tx) => {
      await tx
        .update(apkReleases)
        .set({ published: true })
        .where(eq(apkReleases.id, release.id));
      // supersede all other releases of this customer + type
      const all = await tx
        .select()
        .from(apkReleases)
        .where(
          and(
            eq(apkReleases.customerId, release.customerId),
            eq(apkReleases.appType, release.appType)
          )
        );
      for (const r of all) {
        if (r.id !== release.id) {
          await tx
            .update(apkReleases)
            .set({ superseded: true, published: false })
            .where(eq(apkReleases.id, r.id));
        }
      }
    });

    await notify(
      release.customerId,
      "success",
      `${release.appType === "user" ? "User Panel" : "Admin Panel"} APK ready`,
      `${release.appName} v${release.versionName} is ready to download from your dashboard. Verify the SHA-256 checksum before installing.`
    );
    await logAudit({
      actorType: "admin",
      actorId: cur.admin.id,
      action: "apk.published",
      entity: "apk_release",
      entityId: String(release.id),
      meta: { customerId: release.customerId, appType: release.appType, version: release.versionName },
      ip,
    });
    return jsonOk();
  }

  if (action === "unpublish") {
    if (release.superseded) return jsonError("This release was already revoked.", 409);
    await db
      .update(apkReleases)
      .set({ published: false })
      .where(and(eq(apkReleases.id, release.id), eq(apkReleases.published, true)));
    await logAudit({
      actorType: "admin",
      actorId: cur.admin.id,
      action: "apk.unpublished",
      entity: "apk_release",
      entityId: String(release.id),
      meta: { customerId: release.customerId, appType: release.appType },
      ip,
    });
    return jsonOk();
  }

  if (action === "revoke") {
    await db
      .update(apkReleases)
      .set({ published: false, superseded: true })
      .where(eq(apkReleases.id, release.id));
    await notify(
      release.customerId,
      "warning",
      "An APK release was revoked",
      `The v${release.versionName} ${release.appType === "user" ? "User" : "Admin"} Panel release is no longer downloadable.`
    );
    await logAudit({
      actorType: "admin",
      actorId: cur.admin.id,
      action: "apk.revoked",
      entity: "apk_release",
      entityId: String(release.id),
      meta: { customerId: release.customerId, appType: release.appType, version: release.versionName },
      ip,
    });
    return jsonOk();
  }

  return jsonError("Unknown action.");
}
