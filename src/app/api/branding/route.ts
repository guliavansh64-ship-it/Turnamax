import { and, eq, ne } from "drizzle-orm";
import { getPlanAccess, PLAN_LOCK_MESSAGE } from "@/lib/access";
import { db } from "@/db";
import { branding, customers } from "@/db/schema";
import { getCurrentCustomer, originOk } from "@/lib/auth";
import { clientIp, jsonError, jsonOk, readJsonBody, slugify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { sendAdminAlert } from "@/lib/mailer";

export const dynamic = "force-dynamic";

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const HEX3_RE = /^#[0-9a-fA-F]{3}$/;

function normColor(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (HEX3_RE.test(s)) {
    return (
      "#" +
      s[1] +
      s[1] +
      s[2] +
      s[2] +
      s[3] +
      s[3]
    ).toLowerCase();
  }
  return COLOR_RE.test(s) ? s.toLowerCase() : null;
}

export async function GET() {
  const cur = await getCurrentCustomer();
  if (!cur) return jsonError("Not authenticated.", 401);
  const rows = await db
    .select()
    .from(branding)
    .where(eq(branding.customerId, cur.customer.id))
    .limit(1);
  return jsonOk({ branding: rows[0] ?? null });
}

export async function PUT(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentCustomer();
  if (!cur) return jsonError("Not authenticated.", 401);
  if (cur.customer.status === "suspended")
    return jsonError("Your account is suspended. Contact support.", 403);
  const ip = clientIp(req);
  const body = await readJsonBody(req);

  const appName = String(body.appName ?? "").trim();
  if (appName.length < 2 || appName.length > 40)
    return jsonError("App name must be 2–40 characters.");
  const brandPrimary = normColor(String(body.brandPrimary ?? ""));
  if (body.brandPrimary && !brandPrimary)
    return jsonError("Primary color must be a hex color like #C8F32E.");
  const brandSecondary = normColor(String(body.brandSecondary ?? ""));
  if (body.brandSecondary && !brandSecondary)
    return jsonError("Secondary color must be a hex color like #0B0E14.");

  const firebaseProjectId = String(body.firebaseProjectId ?? "").trim().slice(0, 120);
  const firebaseAppId = String(body.firebaseAppId ?? "").trim().slice(0, 160);
  const firebaseApiKey = String(body.firebaseApiKey ?? "").trim().slice(0, 200);
  const notes = String(body.notes ?? "").trim().slice(0, 1000);

  // Unique tenant identifier, auto-derived from the app name
  let tenantId = slugify(appName) || "tenant";
  const taken = await db
    .select({ tenantId: branding.tenantId })
    .from(branding)
    .where(and(eq(branding.tenantId, tenantId), ne(branding.customerId, cur.customer.id)))
    .limit(1);
  let i = 2;
  while (taken.length > 0) {
    tenantId = `${slugify(appName) || "tenant"}-${i++}`;
    const t2 = await db
      .select({ tenantId: branding.tenantId })
      .from(branding)
      .where(and(eq(branding.tenantId, tenantId), ne(branding.customerId, cur.customer.id)))
      .limit(1);
    if (t2.length === 0) break;
    if (i > 50) return jsonError("Could not derive a unique tenant id. Contact support.");
  }

  const submit = Boolean(body.submit);
  const status: "draft" | "submitted" = submit ? "submitted" : "draft";

  // Plan gate: drafts can always be saved (they are required to order), but the
  // final configuration can only be submitted for review once a plan is active.
  if (submit) {
    const access = await getPlanAccess(cur.customer.id);
    if (!access.active)
      return jsonError(PLAN_LOCK_MESSAGE + " Drafts are still saved automatically.", 402);
  }

  const existing = await db
    .select()
    .from(branding)
    .where(eq(branding.customerId, cur.customer.id))
    .limit(1);

  const values = {
    appName,
    tenantId,
    brandPrimary,
    brandSecondary,
    firebaseProjectId: firebaseProjectId || null,
    firebaseAppId: firebaseAppId || null,
    firebaseApiKey: firebaseApiKey || null,
    notes: notes || null,
    status,
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db
      .update(branding)
      .set(values)
      .where(eq(branding.id, existing[0].id));
  } else {
    await db
      .insert(branding)
      .values({ customerId: cur.customer.id, ...values });
  }

  await logAudit({
    actorType: "customer",
    actorId: cur.customer.id,
    action: submit ? "branding.submitted" : "branding.updated",
    entity: "branding",
    entityId: String(cur.customer.id),
    meta: { appName, tenantId },
    ip,
  });

  if (submit) {
    void sendAdminAlert(
      "Branding submitted — prepare APKs",
      "A customer finalised their app name, logo and Firebase details. Review them, then prepare and upload both APKs.",
      {
        Customer: cur.customer.email,
        App: appName,
        Tenant: tenantId,
        Project: body.firebaseProjectId ? String(body.firebaseProjectId) : "—",
      }
    );
  }

  return jsonOk({ branding: { customerId: cur.customer.id, ...values } });
}
