import { and, eq } from "drizzle-orm";
import { promises as fs } from "fs";
import { db } from "@/db";
import { orders, payments, plans } from "@/db/schema";
import { getCurrentCustomer, originOk } from "@/lib/auth";
import {
  clientIp,
  ensureDir,
  imageExt,
  isImageBuffer,
  isPdfBuffer,
  jsonError,
  jsonOk,
  newOrderCode,
  notify,
  PROOF_MAX_BYTES,
  safeUploadName,
  storagePath,
} from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { sendAdminAlert } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentCustomer();
  if (!cur) return jsonError("Not authenticated.", 401);
  if (cur.customer.status === "suspended")
    return jsonError("Your account is suspended. Contact support.", 403);
  const ip = clientIp(req);
  if (!rateLimit(`order:${cur.customer.id}`, 6, 60 * 60 * 1000))
    return jsonError("Too many orders submitted. Try again later.", 429);

  const fd = await req.formData().catch(() => null);
  if (!fd) return jsonError("Invalid form data.");
  const planId = Number(fd.get("planId"));
  const reference = String(fd.get("reference") ?? "").trim();
  if (!Number.isInteger(planId)) return jsonError("Choose a plan.");
  if (reference.length < 4 || reference.length > 80)
    return jsonError("Enter the UPI transaction reference (UTR), 4–80 characters.");

  // Amount is ALWAYS taken from the server-side plan record, never the client.
  const planRows = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, planId), eq(plans.active, true)))
    .limit(1);
  const plan = planRows[0];
  if (!plan) return jsonError("That plan is not available.", 404);

  // The one-time setup fee is charged only on the customer's FIRST order.
  // Renewals pay the recurring price alone.
  const priorOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.customerId, cur.customer.id))
    .limit(1);
  const setupFeeCents = priorOrders.length === 0 ? plan.setupFeeCents : 0;
  const amountCents = plan.priceCents + setupFeeCents;

  // Optional payment proof (image or pdf)
  let proofName: string | null = null;
  const proof = fd.get("proof");
  if (proof && typeof proof !== "string" && proof.size > 0) {
    const buf = Buffer.from(await proof.arrayBuffer());
    if (buf.byteLength > PROOF_MAX_BYTES)
      return jsonError(
        `Payment proof must be under ${(PROOF_MAX_BYTES / 1048576).toFixed(0)} MB.`
      );
    const pExt = imageExt(proof.name ?? "");
    if (!pExt && !/\.pdf$/i.test(proof.name ?? ""))
      return jsonError("Payment proof must be an image or PDF.");
    if (pExt && !isImageBuffer(buf))
      return jsonError("Payment proof is not a valid image.");
    if (!pExt && !isPdfBuffer(buf))
      return jsonError("Payment proof is not a valid PDF.");
    await ensureDir("proofs");
    proofName = safeUploadName("proof", pExt ?? "pdf");
    await fs.writeFile(storagePath("proofs", proofName), buf);
  }

  const orderCode = newOrderCode();
  let orderId: number | undefined;
  let paymentId: number | undefined;

  await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        orderCode,
        customerId: cur!.customer.id,
        planId: plan!.id,
        amountCents,
        setupFeeCents,
        currency: plan!.currency,
        status: "pending",
      })
      .returning();
    const [payment] = await tx
      .insert(payments)
      .values({
        orderId: order.id,
        customerId: cur!.customer.id,
        method: "upi_manual",
        amountCents,
        currency: plan!.currency,
        reference,
        proofName,
        status: "pending",
      })
      .returning();
    orderId = order.id;
    paymentId = payment.id;
  });

  await notify(
    cur.customer.id,
    "info",
    `Order ${orderCode} submitted`,
    setupFeeCents > 0
      ? `Payment of ₹${(amountCents / 100).toLocaleString("en-IN")} for plan "${plan.name}" (₹${(
          setupFeeCents / 100
        ).toLocaleString("en-IN")} one-time setup + ₹${(plan.priceCents / 100).toLocaleString(
          "en-IN"
        )} first month) is awaiting manual verification by our team.`
      : `Renewal payment of ₹${(amountCents / 100).toLocaleString(
          "en-IN"
        )} for plan "${plan.name}" is awaiting manual verification by our team.`
  );
  await logAudit({
    actorType: "customer",
    actorId: cur.customer.id,
    action: "order.submitted",
    entity: "order",
    entityId: String(orderId),
    meta: { orderCode, planId, reference, amountCents, setupFeeCents },
    ip,
  });

  // Owner must verify this manually — emails the operator inbox.

  void sendAdminAlert(

    "Payment awaiting verification",

    "A customer submitted a manual UPI payment. Approve or reject it from Admin → Payments.",

    {

      Order: orderCode,

      Amount: `${plan.currency} ${((plan.priceCents + setupFeeCents) / 100).toFixed(2)}`,

      UTR: reference,

      Customer: cur!.customer.email,

      Proof: proofName ? 'attached' : 'none',

      Setup: setupFeeCents > 0 ? `${(setupFeeCents / 100).toFixed(0)} one-time` : 'renewal',

    }

  );


  return jsonOk({ orderCode, paymentId, amountCents, setupFeeCents });
}
