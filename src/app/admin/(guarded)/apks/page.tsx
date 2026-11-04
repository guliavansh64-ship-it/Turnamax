import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { admins, apkReleases, customers } from "@/db/schema";
import { formatDateTime, truncate } from "@/lib/utils";
import ActionForm from "@/components/action-form";

export const dynamic = "force-dynamic";

export default async function AdminApksPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const sp = await searchParams;
  const customerId = Number(sp.customerId ?? 0) || undefined;

  const rows = await db
    .select({
      release: apkReleases,
      customer: customers,
      uploader: admins,
    })
    .from(apkReleases)
    .innerJoin(customers, eq(apkReleases.customerId, customers.id))
    .leftJoin(admins, eq(apkReleases.uploadedBy, admins.id))
    .where(customerId ? eq(apkReleases.customerId, customerId) : undefined)
    .orderBy(desc(apkReleases.createdAt))
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <p className="kicker mb-2">APK releases</p>
        <h1 className="h-display text-3xl font-bold">Manual upload & assignment</h1>
        <p className="text-mist mt-2 text-sm max-w-2xl">
          Builds are prepared outside this website and uploaded here per customer. Use a customer
          profile for the full workflow (branding review → upload → publish).
        </p>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8">
            <div className="empty">
              <p className="text-sm">
                No APK releases yet. Upload the first prepared build from a customer profile.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>App</th>
                  <th>Build name</th>
                  <th>Version</th>
                  <th>Size</th>
                  <th>SHA-256</th>
                  <th>Uploaded by</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ release, customer, uploader }) => (
                  <tr key={release.id}>
                    <td>
                      <Link
                        href={`/admin/customers/${customer.id}`}
                        className="font-semibold hover:text-volt"
                      >
                        {customer.name}
                      </Link>
                    </td>
                    <td>
                      <span className={`tag ${release.appType === "user" ? "tag-blue" : "tag-gray"}`}>
                        {release.appType}
                      </span>
                    </td>
                    <td className="text-[13px]">{release.appName}</td>
                    <td className="mono text-[12px]">v{release.versionName}</td>
                    <td className="mono text-[12px]">{(release.fileSize / 1048576).toFixed(1)} MB</td>
                    <td className="mono text-[11px] text-mist">{truncate(release.sha256, 14)}</td>
                    <td className="text-mist text-[13px]">{uploader?.name ?? "—"}</td>
                    <td className="text-mist text-[12px] whitespace-nowrap">{formatDateTime(release.createdAt)}</td>
                    <td>
                      {release.superseded ? (
                        <span className="tag tag-gray">{release.published ? "replaced" : "revoked"}</span>
                      ) : release.published ? (
                        <span className="tag tag-green">published</span>
                      ) : (
                        <span className="tag tag-amber">draft</span>
                      )}
                    </td>
                    <td>
                      {!release.superseded && (
                        <div className="flex gap-2">
                          {release.published ? (
                            <ActionForm
                              url={`/api/admin/apks/${release.id}`}
                              method="PATCH"
                              hidden={{ action: "unpublish" }}
                              label="Unpublish"
                              type="ghost"
                              size="sm"
                              successMsg="Unpublished."
                            />
                          ) : (
                            <ActionForm
                              url={`/api/admin/apks/${release.id}`}
                              method="PATCH"
                              hidden={{ action: "publish" }}
                              label="Publish"
                              size="sm"
                              successMsg="Published — customer can download now."
                            />
                          )}
                          <ActionForm
                            url={`/api/admin/apks/${release.id}`}
                            method="PATCH"
                            hidden={{ action: "revoke" }}
                            label="Revoke"
                            type="danger"
                            size="sm"
                            confirmText="Revoke this release? Customer download access is removed immediately."
                            successMsg="Release revoked."
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
