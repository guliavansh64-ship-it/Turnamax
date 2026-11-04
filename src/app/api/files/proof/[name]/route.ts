import { createReadStream, existsSync, statSync } from "fs";
import { Readable } from "stream";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { getCurrentAdmin, getCurrentCustomer } from "@/lib/auth";
import { jsonError, storagePath } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PROOF_RE = /^proof-[a-f0-9]{24}\.(png|jpe?g|webp|pdf)$/i;

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  if (!PROOF_RE.test(name)) return jsonError("Invalid file.", 400);

  const admin = await getCurrentAdmin();
  const customer = admin ? null : await getCurrentCustomer();
  if (!admin && !customer) return jsonError("Not authenticated.", 401);

  if (!admin) {
    const rows = await db
      .select({ proofName: payments.proofName })
      .from(payments)
      .where(eq(payments.customerId, customer!.customer.id))
      .limit(100);
    if (!rows.some((r) => r.proofName === name))
      return jsonError("Not found.", 404);
  }

  const filePath = storagePath("proofs", name);
  if (!existsSync(filePath)) return jsonError("File not found.", 404);
  const ext = name.split(".").pop()!.toLowerCase();
  const stream = createReadStream(filePath);
  const web = Readable.toWeb(stream) as unknown as ReadableStream;
  return new Response(web, {
    headers: {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "content-length": String(statSync(filePath).size),
      "cache-control": "no-store",
    },
  });
}
