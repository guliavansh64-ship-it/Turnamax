import { eq } from "drizzle-orm";
import { promises as fs } from "fs";
import { db } from "@/db";
import { branding } from "@/db/schema";
import { getCurrentCustomer, originOk } from "@/lib/auth";
import {
  ensureDir,
  imageExt,
  isImageBuffer,
  jsonError,
  jsonOk,
  LOGO_MAX_BYTES,
  safeUploadName,
  storagePath,
} from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentCustomer();
  if (!cur) return jsonError("Not authenticated.", 401);
  if (cur.customer.status === "suspended")
    return jsonError("Your account is suspended. Contact support.", 403);

  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!file || typeof file === "string")
    return jsonError("Please choose a logo file.");

  const name = file.name ?? "";
  const ext = imageExt(name);
  if (!ext)
    return jsonError("Logo must be a PNG, JPEG or WebP image.");

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > LOGO_MAX_BYTES)
    return jsonError(`Logo must be under ${(LOGO_MAX_BYTES / 1048576).toFixed(0)} MB.`);
  if (!isImageBuffer(buf))
    return jsonError("File content is not a valid image.");

  await ensureDir("logos");
  const storedName = safeUploadName("logo", ext);
  await fs.writeFile(storagePath("logos", storedName), buf);

  const existing = await db
    .select()
    .from(branding)
    .where(eq(branding.customerId, cur.customer.id))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(branding)
      .set({ logoName: storedName, updatedAt: new Date() })
      .where(eq(branding.id, existing[0].id));
    if (existing[0].logoName && existing[0].logoName !== storedName) {
      await fs.rm(storagePath("logos", existing[0].logoName), { force: true });
    }
  } else {
    await db
      .insert(branding)
      .values({ customerId: cur.customer.id, logoName: storedName });
  }

  await logAudit({
    actorType: "customer",
    actorId: cur.customer.id,
    action: "branding.logo_uploaded",
    entity: "branding",
    entityId: String(cur.customer.id),
    meta: { fileName: storedName, bytes: buf.byteLength },
  });

  return jsonOk({ logoName: storedName });
}

export async function DELETE(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentCustomer();
  if (!cur) return jsonError("Not authenticated.", 401);
  const rows = await db
    .select()
    .from(branding)
    .where(eq(branding.customerId, cur.customer.id))
    .limit(1);
  if (rows[0]?.logoName) {
    await fs.rm(storagePath("logos", rows[0].logoName), { force: true });
    await db
      .update(branding)
      .set({ logoName: null, updatedAt: new Date() })
      .where(eq(branding.id, rows[0].id));
  }
  return jsonOk();
}
