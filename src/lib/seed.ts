import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, siteSettings } from "@/db/schema";

// The platform runs on a SINGLE plan:
//   ₹299 one-time setup (covers manual APK preparation)
// + ₹50 per month after that.
const defaultPlans = [
  {
    name: "Tournament App",
    slug: "tournament-app-monthly",
    cycle: "monthly" as const,
    priceCents: 5000, // ₹50 / month
    setupFeeCents: 29900, // ₹299 one-time
    currency: "INR",
    durationDays: 30,
    description:
      "₹299 one-time setup + ₹50/month. Your branded User and Admin APKs, prepared manually by our team.",
    features: [
      "Custom app name & logo",
      "Your own tenant identifier",
      "User Panel APK + Admin Panel APK",
      "Customer-specific Firebase configuration where applicable",
      "Instant UPI checkout with automatic activation",
      "Secure dashboard downloads with SHA-256 checksums",
      "Email support",
    ],
    active: true,
    featured: true,
    sort: 1,
  },
];

const defaults: Record<string, unknown> = {
  hero: {
    headline: "Your tournament. Your brand. Your app.",
    sub: "Tournamax turns our proven tournament app into a white-label product carrying your name, logo and configuration. Two ready APKs — User and Admin — prepared by hand, verified by humans, delivered to your dashboard.",
    ctaPrimary: "Get Your Tournament App",
    ctaSecondary: "Explore Features",
  },
  features: [
    {
      icon: "palette",
      title: "Custom app name & logo",
      desc: "Your application name, launcher icon and brand colors on every screen of both APKs.",
    },
    {
      icon: "flame",
      title: "Customer-specific Firebase",
      desc: "Where applicable, your own Firebase project and app IDs are compiled into your build — never mixed with other customers.",
    },
    {
      icon: "layers",
      title: "Separate User & Admin APKs",
      desc: "A player/organizer-facing User Panel and a full Admin Panel, delivered as two distinct signed builds.",
    },
    {
      icon: "trophy",
      title: "Full tournament tooling",
      desc: "Matches, brackets, squads, points and live scoring — the complete feature set of the base tournament app.",
    },
    {
      icon: "calendar",
      title: "Centralized subscriptions",
      desc: "One plan covers both APKs. Track start, expiry and renewal from a single dashboard.",
    },
    {
      icon: "lock",
      title: "Secure, authorized downloads",
      desc: "APKs are stored off the web root and only served to the customer they were prepared for — with SHA-256 checksums.",
    },
  ],
  faqs: [
    {
      q: "How is my APK prepared?",
      a: "After your payment is verified, our team manually prepares your builds from the base tournament templates — applying your app name, logo, tenant identifier and Firebase configuration. This is a human, per-customer process; nothing is auto-generated.",
    },
    {
      q: "How long until I can download?",
      a: "Typically within a few business days after payment verification. Your dashboard shows the live status of each APK (being prepared / ready).",
    },
    {
      q: "How do I pay?",
      a: "With UPI through our secure ZetPay checkout — Google Pay, PhonePe, Paytm or any UPI app. Payment is confirmed automatically server-to-server and your subscription activates instantly. We never ask for UPI PINs, OTPs or banking credentials.",
    },
    {
      q: "Will I see my payment as approved automatically?",
      a: "No. A payment only becomes approved when an administrator verifies it. Until then your order shows as pending.",
    },
    {
      q: "What happens when my subscription expires?",
      a: "You'll see an expiry notice, downloads pause after a short grace period, and new operations are restricted. Renewing re-activates everything — your prepared APKs are never deleted.",
    },
    {
      q: "Can I change my branding later?",
      a: "Yes. Update your branding details from the dashboard; the changes are queued and applied on your next re-upload cycle or renewal, depending on your plan.",
    },
    {
      q: "Is my data isolated from other customers?",
      a: "Each build gets a unique tenant identifier and (where used) its own Firebase configuration. Downloads are server-authorized so one customer can never fetch another customer's APKs.",
    },
    {
      q: "What is your refund policy?",
      a: "See the Refund Policy page. In short: payments can be refunded while the APKs have not yet been prepared.",
    },
  ],
  contact: {
    email: "guliavansh64@gmail.com",
    phone: "+91 9053994920",
    hours: "Mon–Sat, 10:00–19:00 IST",
  },
  policies: {
    terms: "TERMS OF SERVICE\n\n1. Service. Tournamax provides white-label tournament application builds. Each build is prepared manually by our team from a shared base application, customized with your branding and configuration.\n\n2. Manual preparation. APKs are not generated automatically. Delivery timelines begin after successful payment verification.\n\n3. Acceptable use. You may use your builds for your own tournaments and events. Reselling, rebranding for third parties or stripping branding is prohibited.\n\n4. Subscriptions. Access to downloads and support is tied to an active subscription. Expired subscriptions pause downloads after a grace period.\n\n5. Account responsibility. You are responsible for the branding details and payment information you submit.\n\n6. Suspension. We may suspend accounts that violate these terms. Refund eligibility is affected as described in the Refund Policy.",
    privacy: "PRIVACY POLICY\n\n1. Data we collect. Account details (name, email), branding settings you submit (app name, logo, colors, Firebase configuration), payment references and download logs.\n\n2. How it's used. To prepare your builds, verify payments, manage your subscription and serve you authorized downloads. Payment details are verified manually by our administrators.\n\n3. What we never ask for. UPI PINs, OTPs, bank passwords or card numbers.\n\n4. Storage. Files you upload (logos, payment proof, APKs) are stored outside the public web root and served only to you or authorized staff.\n\n5. Security. Passwords are stored with salted scrypt hashes, sessions are token-based and HttpOnly, and all administrative actions are audit-logged.\n\n6. Contact. Privacy questions: guliavansh64@gmail.com.",
    refund: "REFUND POLICY\n\n1. Before preparation. Payments submitted within 7 days of an unprepared order can be fully refunded on request.\n\n2. After preparation. Once your APKs have been prepared and published, the subscription is non-refundable for the current period. You may still cancel auto-renewal intent by not repaying at expiry.\n\n3. Rejected payments. If we reject your payment as unverifiable, the amount remains with your bank/UPI app; contact us if a charge was incorrectly recorded.\n\n4. Process. Refunds are processed by an administrator within 5–7 business days to the original UPI, and are recorded in your payment history and our audit log.",
  },
  announcements: [
    {
      title: "Welcome to Tournamax",
      body: "New orders are being processed in the order payments were verified. Branding details submitted at checkout speed up preparation.",
      active: true,
    }
  ],
  testimonials: [],
  subscription_config: {
    warningDays: 3,
    graceDays: 2,
    renewalFee: 50,
    upiId: "tournamax@upi",
    upiName: "Tournamax",
    adminLockMessage: "Your hosting subscription expired. Management features are restricted until renewal payment is verified.",
    warningMessage: "Your tournament hosting renewal is due soon. Fee: ₹50 / 30 days.",
    userLockMessage: "Coming Back Soon",
    userLockSubmessage: "This tournament app is currently undergoing scheduled maintenance & subscription renewal. Tournaments, squads, and live matches will resume shortly once the organizer completes renewal!",
  },
};

export async function ensureSeed() {
  const planCount = await db.select({ n: count() }).from(plans);
  if (Number(planCount[0]?.n ?? 0) === 0) {
    await db.insert(plans).values(defaultPlans);
  }
  const keyRows = await db.select({ key: siteSettings.key }).from(siteSettings);
  const existing = new Set(keyRows.map((r) => r.key));
  const inserts = Object.entries(defaults)
    .filter(([k]) => !existing.has(k))
    .map(([key, value]) => ({ key, value: value as never, updatedAt: new Date() }));
  if (inserts.length > 0) await db.insert(siteSettings).values(inserts);
}

export async function getPublicContent() {
  const [hero, features, faqs, contact, policies, announcements, testimonials] =
    await Promise.all([
      getSettingRow("hero"),
      getSettingRow("features"),
      getSettingRow("faqs"),
      getSettingRow("contact"),
      getSettingRow("policies"),
      getSettingRow("announcements"),
      getSettingRow("testimonials"),
    ]);
  return {
    hero: hero as any,
    features: (features as any) ?? [],
    faqs: (faqs as any) ?? [],
    contact: contact as any,
    policies: policies as any,
    announcements: (announcements as any) ?? [],
    testimonials: (testimonials as any) ?? [],
  };
}

async function getSettingRow(key: string) {
  const rows = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}
