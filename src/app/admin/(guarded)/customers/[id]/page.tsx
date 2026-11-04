import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import CopyValue from "@/components/copy-value";
import { db } from "@/db";
import {
  apkReleases,
  auditLog,
  branding,
  customers,
  orders,
  payments,
  plans,
  subscriptions,
} from "@/db/schema";
import {
  canDownloadApk,
  daysLeft,
  formatDateTime,
  formatMoney,
  getCustomerSubscription,
  subEffectiveStatus,
  truncate,
} from "@/lib/utils";
import { getTenantSubscription } from "@/lib/subscription-sync";
import ActionForm from "@/components/action-form";
import FileActionForm from "@/components/file-action-form";

export const dynamic = "force-dynamic";

export default async function AdminCustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) notFound();

  const cRows = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  const c = cRows[0];
  if (!c) notFound();

  const [brandRows, subInfo, payRows, releaseRows, auditRows, allPlans] = await Promise.all([
    db.select().from(branding).where(eq(branding.customerId, customerId)).limit(1),
    getCustomerSubscription(customerId),
    db
      .select({ pay: payments, order: orders })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(eq(payments.customerId, customerId))
      .orderBy(desc(payments.createdAt))
      .limit(30),
    db.select().from(apkReleases).where(eq(apkReleases.customerId, customerId)).orderBy(desc(apkReleases.createdAt)),
    db
      .select()
      .from(auditLog)
      .where(
        sql`(${sql.raw("entity")} = 'customer' AND ${sql.raw("entity_id")} = ${String(customerId)}) OR ${sql.raw("actor_type")} = 'customer' AND ${sql.raw("actor_id")} = ${customerId}`
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(25),
    db.select().from(plans).orderBy(plans.sort),
  ]);

  const subStatus = subEffectiveStatus(subInfo?.sub);
  const downloadable = canDownloadApk(subInfo?.sub);
  const brand = brandRows[0] ?? null;
  const tenantSlug = brand?.tenantId || String(customerId);
  const tenantLiveStatus = await getTenantSubscription(tenantSlug);
  const planMap = new Map(allPlans.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/customers" className="mono text-[11px] text-mist hover:text-volt">
            ← All customers
          </Link>
          <p className="kicker mb-2 mt-2">Customer #{customerId}</p>
          <h1 className="h-display text-3xl font-bold flex items-center gap-3 flex-wrap">
            {c.name}
            <span
              className={`tag ${
                c.status === "active" ? "tag-green" : c.status === "suspended" ? "tag-red" : "tag-gray"
              }`}
            >
              {c.status}
            </span>
          </h1>
          <p className="text-mist text-sm mt-1">
            {c.email} · joined {formatDateTime(c.createdAt)} ·{" "}
            {c.emailVerified ? "email verified" : "email unverified"}
          </p>
        </div>
        <ActionForm
          url={`/api/admin/customers/${customerId}`}
          method="PATCH"
          hidden={{ action: "status" }}
          label="Apply"
          type="ghost"
          successMsg="Customer status updated."
        >
          <div className="field !mb-0">
            <label className="label">Account status</label>
            <select name="status" className="input !w-44" defaultValue={c.status}>
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="deactivated">deactivated</option>
            </select>
          </div>
        </ActionForm>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* -------- Branding -------- */}
        <div className="card p-6">
          <h2 className="font-bold text-lg mb-4">Branding details</h2>
          {brand?.appName ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {brand.logoName && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/logo/${brand.logoName}`}
                    alt=""
                    className="w-14 h-14 rounded-xl object-cover border border-line"
                  />
                )}
                <div>
                  <div className="font-bold text-lg">{brand.appName}</div>
                  <code className="mono text-[12px] text-volt">{brand.tenantId}</code>
                  <div className="mt-1">
                    <span className={`tag ${brand.status === "submitted" ? "tag-green" : "tag-amber"}`}>
                      {brand.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {brand.brandPrimary && (
                  <span className="w-8 h-8 rounded-lg border border-line" style={{ background: brand.brandPrimary }} />
                )}
                {brand.brandSecondary && (
                  <span className="w-8 h-8 rounded-lg border border-line" style={{ background: brand.brandSecondary }} />
                )}
              </div>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-mist">Firebase project</dt>
                  <dd className="mono text-[12px] break-all flex items-center gap-2 justify-end">
                    <span>{brand.firebaseProjectId ?? "—"}</span>
                    {brand.firebaseProjectId ? <CopyValue value={brand.firebaseProjectId} /> : null}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-mist">Firebase app id</dt>
                  <dd className="mono text-[12px] break-all flex items-center gap-2 justify-end">
                    <span>{brand.firebaseAppId ?? "—"}</span>
                    {brand.firebaseAppId ? <CopyValue value={brand.firebaseAppId} /> : null}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-mist">Firebase API key</dt>
                  <dd className="mono text-[12px] break-all flex items-center gap-2 justify-end">
                    <span>{brand.firebaseApiKey ?? "—"}</span>
                    {brand.firebaseApiKey ? <CopyValue value={brand.firebaseApiKey} /> : null}
                  </dd>
                </div>
              </dl>
              {brand.notes && (
                <div className="card !bg-ink2 p-3 text-sm text-mist">{brand.notes}</div>
              )}
              <p className="hint">
                Review these details carefully before preparing this customer&apos;s builds —
                tenant configs are never mixed across customers.
              </p>
            </div>
          ) : (
            <div className="empty">
              <p className="text-sm">This customer has not submitted branding yet.</p>
            </div>
          )}
        </div>

        {/* -------- Subscription -------- */}
        <div className="card p-6">
          <h2 className="font-bold text-lg mb-4">Subscription</h2>
          {subInfo ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-lg font-bold">{subInfo.plan.name}</span>
                <span className={`tag ${subStatus === "active" ? "tag-green" : subStatus === "expired" ? "tag-amber" : "tag-red"}`}>
                  {subStatus}
                </span>
                {subStatus === "active" && (
                  <span className="mono text-[11px] text-mist">{daysLeft(subInfo.sub.expiresAt)} days left</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="label">Starts</p>
                  <p>{formatDateTime(subInfo.sub.startsAt)}</p>
                </div>
                <div>
                  <p className="label">Expires</p>
                  <p>{formatDateTime(subInfo.sub.expiresAt)}</p>
                </div>
              </div>
              <p className="hint">
                Download access:{" "}
                {downloadable ? <span className="text-volt font-semibold">available</span> : <span className="text-coral font-semibold">paused</span>}
                {" · "}APK delivery:{" "}
                {releaseRows.some((r) => r.published && !r.superseded) ? (
                  <span className="text-volt font-semibold">published</span>
                ) : (
                  <span className="text-gold font-semibold">awaiting preparation</span>
                )}
              </p>
              {tenantLiveStatus && (
                <div className="card !bg-ink2 p-4 space-y-3 border border-line text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-snow">APK Live Sync &amp; Lock Status</span>
                    <a
                      href={`/api/v1/subscription/status?tenant=${tenantSlug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mono text-[11px] text-volt hover:underline"
                    >
                      JSON status ↗
                    </a>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-ink border border-line">
                      <div className="text-mist mb-1 text-[11px] font-semibold uppercase tracking-wider">Tournament Admin APK</div>
                      {tenantLiveStatus.admin_locked ? (
                        <span className="tag tag-red">🔒 Locked (QR &amp; UTR Active)</span>
                      ) : tenantLiveStatus.admin_warning ? (
                        <span className="tag tag-amber">⚠️ Expiry Warning ({tenantLiveStatus.days_remaining}d left)</span>
                      ) : (
                        <span className="tag tag-green">🟢 Unlocked &amp; Operational</span>
                      )}
                    </div>
                    <div className="p-3 rounded-lg bg-ink border border-line">
                      <div className="text-mist mb-1 text-[11px] font-semibold uppercase tracking-wider">Tournament User APK</div>
                      {tenantLiveStatus.user_locked ? (
                        <span className="tag tag-red">🔒 Locked (&quot;Coming Back Soon&quot;)</span>
                      ) : tenantLiveStatus.is_expired ? (
                        <span className="tag tag-amber">⏳ In Grace Period</span>
                      ) : (
                        <span className="tag tag-green">🟢 Unlocked &amp; Operational</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="divider" />
              <div className="flex gap-3 flex-wrap items-center">
                <ActionForm
                  url={`/api/admin/customers/${customerId}`}
                  method="PATCH"
                  hidden={{ action: "instant_renew" }}
                  label="⚡ Instant Renew (+30d, ₹50)"
                  type="volt"
                  size="sm"
                  confirmText={`Instantly renew customer #${customerId}'s tournament hosting subscription for 30 days (₹50)? Locks on both Admin and User APKs will immediately clear.`}
                  successMsg="Hosting subscription renewed for 30 days! APK locks cleared."
                />
              </div>

              <div className="divider" />
              <ActionForm
                url={`/api/admin/customers/${customerId}`}
                method="PATCH"
                hidden={{ action: "assign" }}
                label="Assign plan"
                type="ghost"
                size="sm"
                successMsg="Plan assigned / subscription extended."
              >
                <select name="planId" className="input !w-52" defaultValue={subInfo.plan.id}>
                  {allPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.cycle}, {p.durationDays}d)
                    </option>
                  ))}
                </select>
              </ActionForm>
              <div className="flex gap-4 flex-wrap">
                <ActionForm
                  url={`/api/admin/customers/${customerId}`}
                  method="PATCH"
                  hidden={{ action: "extend" }}
                  label="Extend"
                  type="ghost"
                  size="sm"
                  successMsg="Subscription extended."
                >
                  <input name="days" type="number" min={1} max={730} defaultValue={30} className="input !w-24" placeholder="days" />
                </ActionForm>
                <ActionForm
                  url={`/api/admin/customers/${customerId}`}
                  method="PATCH"
                  hidden={{ action: "revoke" }}
                  label="Revoke subscription"
                  type="danger"
                  size="sm"
                  confirmText="Revoke this customer's active subscription? Downloads and APKs will be blocked."
                  successMsg="Subscription revoked."
                />
              </div>
            </div>
          ) : (
            <div className="empty">
              <p className="text-sm mb-3">No subscription yet.</p>
              <div className="flex gap-3 flex-wrap">
                <ActionForm
                  url={`/api/admin/customers/${customerId}`}
                  method="PATCH"
                  hidden={{ action: "instant_renew" }}
                  label="⚡ Activate First 30 Days (₹50)"
                  type="volt"
                  size="sm"
                  successMsg="Initial subscription activated! APKs unlocked."
                />
                <ActionForm
                  url={`/api/admin/customers/${customerId}`}
                  method="PATCH"
                  hidden={{ action: "assign" }}
                  label="Assign plan"
                  type="ghost"
                  size="sm"
                  successMsg="Plan assigned."
                >
                  <select name="planId" className="input !w-52">
                    {allPlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.cycle})
                      </option>
                    ))}
                  </select>
                </ActionForm>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* -------- APKs -------- */}
      <div>
        <h2 className="font-bold text-xl mb-4">APK preparation & delivery</h2>
        <p className="hint mb-5 max-w-3xl">
          Workflow: review branding above → prepare the build outside this website from the base
          templates → upload the finished APK here → publish to make it downloadable for this
          customer. Publishing auto-replaces the previous published version of the same app type.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          {(["user", "admin"] as const).map((type) => {
            const current = releaseRows.find((r) => r.appType === type && r.published && !r.superseded);
            const drafts = releaseRows.filter((r) => r.appType === type && !r.published && !r.superseded);
            return (
              <div key={type} className="card p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">{type === "user" ? "User Panel APK" : "Admin Panel APK"}</h3>
                  {current ? (
                    <span className="tag tag-green">v{current.versionName} live</span>
                  ) : drafts.length > 0 ? (
                    <span className="tag tag-amber">draft v{drafts[0].versionName}</span>
                  ) : (
                    <span className="tag tag-gray">none</span>
                  )}
                </div>
                {current && (
                  <div className="card !bg-ink2 p-3 text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-mist">App</span><b>{current.appName}</b></div>
                    <div className="flex justify-between"><span className="text-mist">Uploaded</span><span>{formatDateTime(current.createdAt)}</span></div>
                    <div className="flex justify-between"><span className="text-mist">Size</span><span className="mono text-[12px]">{(current.fileSize / 1048576).toFixed(1)} MB</span></div>
                    <div className="flex justify-between gap-3"><span className="text-mist">SHA-256</span><span className="mono text-[11px]">{truncate(current.sha256, 24)}</span></div>
                  </div>
                )}
                {drafts.map((d) => (
                  <div key={d.id} className="card !bg-ink2 p-3 text-sm flex items-center justify-between gap-3 flex-wrap">
                    <span>
                      draft <b className="mono">v{d.versionName}</b> · {(d.fileSize / 1048576).toFixed(1)} MB
                    </span>
                    <div className="flex gap-2">
                      <ActionForm
                        url={`/api/admin/apks/${d.id}`}
                        method="PATCH"
                        hidden={{ action: "publish" }}
                        label="Publish"
                        size="sm"
                        successMsg="APK published — customer can now download it."
                      />
                      <ActionForm
                        url={`/api/admin/apks/${d.id}`}
                        method="PATCH"
                        hidden={{ action: "revoke" }}
                        label="Discard"
                        type="danger"
                        size="sm"
                        confirmText="Discard this draft APK? The file is removed from the active list."
                        successMsg="Draft revoked."
                      />
                    </div>
                  </div>
                ))}
                <FileActionForm
                  url="/api/admin/apks/upload"
                  hidden={{ customerId, appType: type }}
                  label={`Upload ${type === "user" ? "User" : "Admin"} APK`}
                  accept=".apk"
                  fileLabel="Choose prepared .apk file (ZIP signature verified)"
                  successMsg="APK uploaded as draft. Review, then publish."
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="field !mb-0">
                      <label className="label">Version name</label>
                      <input name="versionName" className="input mono" required placeholder="1.0.0" />
                    </div>
                    <div className="field !mb-0">
                      <label className="label">Version code</label>
                      <input name="versionCode" type="number" min={1} className="input mono" placeholder="100" />
                    </div>
                  </div>
                  <div className="field !mb-0">
                    <label className="label">Release notes (optional)</label>
                    <textarea name="releaseNotes" className="input" rows={2} placeholder="Shown to the customer" />
                  </div>
                </FileActionForm>
              </div>
            );
          })}
        </div>

        {releaseRows.length > 0 && (
          <div className="card overflow-hidden mt-6">
            <div className="px-6 pt-5 pb-2">
              <h3 className="font-bold">Release history</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>App</th><th>Version</th><th>Size</th><th>SHA-256</th><th>Uploaded</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {releaseRows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.appType === "user" ? "User" : "Admin"}</td>
                      <td className="mono text-[12px]">v{r.versionName}</td>
                      <td className="mono text-[12px]">{(r.fileSize / 1048576).toFixed(1)} MB</td>
                      <td className="mono text-[11px] text-mist">{truncate(r.sha256, 16)}</td>
                      <td className="text-mist whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                      <td>
                        {r.superseded ? (
                          <span className="tag tag-gray">{r.published ? "replaced" : "revoked"}</span>
                        ) : r.published ? (
                          <span className="tag tag-green">published</span>
                        ) : (
                          <span className="tag tag-amber">draft</span>
                        )}
                      </td>
                      <td>
                        {!r.superseded && (
                          <div className="flex gap-2">
                            {r.published ? (
                              <ActionForm
                                url={`/api/admin/apks/${r.id}`}
                                method="PATCH"
                                hidden={{ action: "unpublish" }}
                                label="Unpublish"
                                type="ghost"
                                size="sm"
                                successMsg="APK unpublished — downloads hidden."
                              />
                            ) : (
                              <ActionForm
                                url={`/api/admin/apks/${r.id}`}
                                method="PATCH"
                                hidden={{ action: "publish" }}
                                label="Publish"
                                size="sm"
                                successMsg="APK published."
                              />
                            )}
                            <ActionForm
                              url={`/api/admin/apks/${r.id}`}
                              method="PATCH"
                              hidden={{ action: "revoke" }}
                              label="Revoke"
                              type="danger"
                              size="sm"
                              confirmText="Revoke this release? The customer will lose download access to it immediately."
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
          </div>
        )}
      </div>

      {/* -------- Payments -------- */}
      <div className="card overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <h2 className="font-bold text-lg">Payments</h2>
        </div>
        {payRows.length === 0 ? (
          <div className="p-6">
            <div className="empty">
              <p className="text-sm">No payments submitted yet.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Order</th><th>Plan</th><th>Amount</th><th>Reference</th><th>Proof</th><th>Date</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {payRows.map(({ pay, order }) => (
                  <tr key={pay.id}>
                    <td className="mono text-[12px]">{order.orderCode}</td>
                    <td className="text-mist text-[13px]">{planMap.get(order.planId) ?? "—"}</td>
                    <td className="mono">
                      {formatMoney(pay.amountCents, pay.currency)}
                      {order.setupFeeCents > 0 && (
                        <div className="text-[10px] text-mist mt-0.5">
                          incl. {formatMoney(order.setupFeeCents, pay.currency)} setup
                        </div>
                      )}
                    </td>
                    <td className="mono text-[12px]">{pay.reference ?? "—"}</td>
                    <td>
                      {pay.proofName ? (
                        <a href={`/api/files/proof/${pay.proofName}`} target="_blank" rel="noreferrer" className="mono text-[11px] text-volt hover:underline">
                          view
                        </a>
                      ) : (
                        <span className="text-mist text-[12px]">—</span>
                      )}
                    </td>
                    <td className="text-mist whitespace-nowrap text-[13px]">{formatDateTime(pay.createdAt)}</td>
                    <td>
                      <span className={`tag ${pay.status === "approved" ? "tag-green" : pay.status === "pending" ? "tag-amber" : pay.status === "refunded" ? "tag-blue" : "tag-red"}`}>
                        {pay.status}
                      </span>
                      {pay.rejectReason && (
                        <p className="text-[11px] text-coral mt-1 max-w-[180px]">{pay.rejectReason}</p>
                      )}
                    </td>
                    <td>
                      {pay.status === "pending" && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <ActionForm
                            url={`/api/admin/payments/${pay.id}`}
                            hidden={{ action: "approve" }}
                            label="Approve"
                            size="sm"
                            successMsg="Payment approved — subscription activated/extended."
                          />
                          <ActionForm
                            url={`/api/admin/payments/${pay.id}`}
                            hidden={{ action: "reject" }}
                            label="Reject"
                            type="danger"
                            size="sm"
                            successMsg="Payment rejected."
                          >
                            <input
                              name="reason"
                              className="input !w-44 !py-1.5 text-[12px]"
                              placeholder="Reason (required)"
                              minLength={3}
                              required
                            />
                          </ActionForm>
                        </div>
                      )}
                      {pay.status === "approved" && (
                        <ActionForm
                          url={`/api/admin/payments/${pay.id}`}
                          method="POST"
                          hidden={{ action: "refund" }}
                          label="Refund"
                          type="danger"
                          size="sm"
                          confirmText="Mark this payment as refunded? The customer's active subscription will be revoked."
                          successMsg="Payment marked refunded."
                        >
                          <input name="reason" className="input !w-40 !py-1.5 text-[12px]" placeholder="Note (optional)" />
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* -------- Activity -------- */}
      <div className="card p-6">
        <h2 className="font-bold text-lg mb-4">Customer activity</h2>
        {auditRows.length === 0 ? (
          <p className="text-mist text-sm">No recorded activity.</p>
        ) : (
          <ul className="space-y-2.5">
            {auditRows.map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <span className="mono text-[11px] text-mist shrink-0 w-[120px]">{formatDateTime(a.createdAt).slice(0, 16)}</span>
                <span>
                  <b>{a.action}</b>
                  <span className="mono text-[10px] text-mist">
                    {" "}· {a.actorType}
                    {a.actorId ? ` #${a.actorId}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


