import { getCurrentCustomer, issueToken, originOk } from "@/lib/auth";
import { absoluteUrl, emailEnabled, sendVerificationEmail } from "@/lib/mailer";
import { clientIp, jsonError, jsonOk } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!originOk(req)) return jsonError("Invalid origin.", 403);
  const cur = await getCurrentCustomer();
  if (!cur) return jsonError("Not authenticated.", 401);
  const c = cur.customer;
  if (c.emailVerified) return jsonError("Your email is already verified.", 409);
  if (!rateLimit(`resend-verify:${c.id}`, 3, 30 * 60 * 1000))
    return jsonError("Please wait a few minutes before requesting another email.", 429);

  const token = await issueToken(c.id, "email_verify");
  const path = `/verify-email?token=${token}`;

  if (await emailEnabled()) {
    const res = await sendVerificationEmail(
      c.email,
      c.name,
      absoluteUrl(req, path)
    );
    if (!res.ok)
      return jsonError(`Could not send the email: ${res.error ?? "unknown error"}`, 502);
    void clientIp(req);
    return jsonOk({ emailed: true });
  }
  return jsonOk({ emailed: false, verifyUrl: path });
}
