import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { ensureSeed } from "@/lib/seed";
import ContentManager from "@/components/admin/content-manager";

export const dynamic = "force-dynamic";

export default async function AdminContentPage() {
  await ensureSeed();
  const rows = await db.select().from(siteSettings);
  const settings: Record<string, unknown> = {};
  for (const r of rows) settings[r.key] = r.value;

  return (
    <div className="space-y-6">
      <div>
        <p className="kicker mb-2">Content</p>
        <h1 className="h-display text-3xl font-bold">Site content & settings</h1>
        <p className="text-mist mt-2 text-sm max-w-2xl">
          Hero copy, UPI payment details, contact info, FAQs, features, announcements,
          testimonials and all policies. Changes go live immediately.
        </p>
      </div>
      <ContentManager settings={settings as Record<string, never>} />
    </div>
  );
}
