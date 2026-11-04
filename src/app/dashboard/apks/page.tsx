import Link from "next/link";
import { desc, and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { apkReleases } from "@/db/schema";
import { getCurrentCustomer } from "@/lib/auth";
import {
  canDownloadApk,
  daysLeft,
  formatDateTime,
  getCustomerSubscription,
  subEffectiveStatus,
  truncate,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MyApksPage() {
  const cur = await getCurrentCustomer();
  if (!cur) redirect("/login");
  const c = cur.customer;

  const sub = await getCustomerSubscription(c.id);
  const subStatus = subEffectiveStatus(sub?.sub);
  const downloadable = canDownloadApk(sub?.sub);
  const suspended = c.status === "suspended";

  const releases = await db
    .select()
    .from(apkReleases)
    .where(eq(apkReleases.customerId, c.id))
    .orderBy(desc(apkReleases.createdAt));

  const latest = (type: "user" | "admin") =>
    releases.find((r) => r.appType === type && r.published && !r.superseded);
  const userRelease = latest("user");
  const adminRelease = latest("admin");

  return (
    <div className="space-y-8">
      <div>
        <p className="kicker mb-2">My APKs</p>
        <h1 className="h-display text-3xl font-bold">Your custom builds</h1>
        <p className="text-mist mt-2 max-w-2xl">
          Two separate apps, prepared by hand by our team from the base tournament templates with
          your branding and configuration. Downloads are authorized per-customer and logged.
        </p>
      </div>

      {suspended && (
        <div className="banner danger">
          <p className="text-sm">
            <b className="text-coral">Account suspended.</b> Downloads are disabled until support
            resolves your account.
          </p>
        </div>
      )}
      {!suspended && !sub && !userRelease && !adminRelease && (
        <div className="banner danger">
          <div className="flex-1">
            <p className="text-sm">
              <b className="text-coral">An active plan is required to download.</b> Your APKs are
              prepared manually after payment verification. Choose your plan to unlock downloads.
            </p>
          </div>
          <Link href="/checkout" className="btn btn-volt btn-sm ml-auto shrink-0">
            Choose plan
          </Link>
        </div>
      )}
      {!suspended && subStatus === "expired" && !downloadable && (
        <div className="banner danger">
          <div className="flex-1">
            <p className="text-sm">
              <b className="text-coral">Subscription expired.</b> Your APKs are safely retained —
              downloads pause {sub ? `after a grace period (ended ${formatDateTime(sub.sub.expiresAt).split(",")[0]})` : ""}.
              Renew to resume.
            </p>
          </div>
          <Link href="/checkout" className="btn btn-volt btn-sm shrink-0">
            Renew
          </Link>
        </div>
      )}
      {!suspended && subStatus === "expired" && downloadable && (
        <div className="banner">
          <p className="text-sm">
            <b className="text-gold">Grace period active.</b> Your subscription expired but
            downloads stay available for {daysLeft(sub!.sub.expiresAt) * -1 > 7 ? 0 : 7 + daysLeft(sub!.sub.expiresAt)} more day(s). Renew to keep access.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {([
          ["user", "User Panel APK", userRelease, "Player & participant facing app."],
          ["admin", "Admin Panel APK", adminRelease, "Organizer facing control app."],
        ] as const).map(([type, title, release, blurb]) => (
          <div
            key={type}
            className={`card p-6 flex flex-col ${release && downloadable && !suspended ? "!border-volt/40" : ""}`}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">{title}</h2>
              {release ? (
                <span className="tag tag-green">ready</span>
              ) : (
                <span className="tag tag-gray">preparing</span>
              )}
            </div>
            <p className="text-mist text-sm mb-5">{blurb}</p>

            {release ? (
              <div className="space-y-4 flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-volt/10 border border-volt/30 grid place-items-center text-volt font-display font-bold text-sm">
                    {release.appName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold">{release.appName}</div>
                    <div className="mono text-[11px] text-mist">
                      v{release.versionName}
                      {release.versionCode ? ` (${release.versionCode})` : ""}
                    </div>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="label">Uploaded</dt>
                    <dd>{formatDateTime(release.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="label">Size</dt>
                    <dd className="mono text-[13px]">{(release.fileSize / 1048576).toFixed(2)} MB</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="label">SHA-256</dt>
                    <dd className="mono text-[11px] text-mist break-all" title={release.sha256}>
                      {truncate(release.sha256, 32)}
                    </dd>
                  </div>
                </dl>
                {release.releaseNotes && (
                  <div className="card !bg-ink2 p-3 text-[13px] text-mist">
                    {release.releaseNotes}
                  </div>
                )}
                <div className="mt-auto">
                  {(downloadable || Boolean(release.published && !release.superseded)) && !suspended ? (
                    <a
                      href={`/api/apks/${release.id}/download`}
                      className="btn btn-volt w-full"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
                      </svg>
                      Download {type === "user" ? "User" : "Admin"} APK
                    </a>
                  ) : (
                    <div className="empty !py-4">
                      <p className="text-sm">
                        {suspended
                          ? "Downloads disabled while account is suspended."
                          : "Renew your subscription to resume downloads."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty flex-1 grid place-items-center">
                <div>
                  <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 3" />
                  </svg>
                  <p className="text-sm font-semibold text-snow mb-1">
                    Your customized APK is being prepared.
                  </p>
                  <p className="text-[13px]">
                    Please check back later. Our team prepares builds manually after your payment
                    is verified — this is not an automated process.
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card p-6">
        <h2 className="font-bold text-lg mb-4">Release history</h2>
        {releases.length === 0 ? (
          <p className="text-mist text-sm">
            No releases yet. Both APKs will appear here as they are prepared and published.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>App</th>
                  <th>Version</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {releases.map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold">
                      {r.appType === "user" ? "User Panel" : "Admin Panel"}
                    </td>
                    <td className="mono text-[12px]">v{r.versionName}</td>
                    <td className="text-mist whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                    <td>
                      {r.superseded ? (
                        <span className="tag tag-gray">replaced</span>
                      ) : r.published ? (
                        <span className="tag tag-green">published</span>
                      ) : (
                        <span className="tag tag-amber">draft</span>
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
