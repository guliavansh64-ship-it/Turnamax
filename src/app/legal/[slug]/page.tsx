import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

const titles: Record<string, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  refund: "Refund Policy",
};

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!titles[slug]) notFound();
  await ensureSeed();
  const rows = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.key, "policies"))
    .limit(1);
  const text = (rows[0]?.value as { [k: string]: string } | null)?.[slug];
  if (!text) notFound();

  return (
    <main className="min-h-screen pt-32 pb-24 px-4">
      <div className="wrap max-w-3xl">
        <p className="kicker mb-3">Legal</p>
        <h1 className="h-display text-3xl font-bold mb-8">{titles[slug]}</h1>
        <div className="card p-8 text-sm leading-relaxed whitespace-pre-line text-snow/85">
          {text}
        </div>
        <div className="flex gap-4 mt-8 flex-wrap">
          {Object.entries(titles).map(([k, v]) => (
            <Link
              key={k}
              href={`/legal/${k}`}
              className={`mono text-[11px] px-4 py-2 rounded-lg border ${
                k === slug
                  ? "border-volt text-volt"
                  : "border-line text-mist hover:text-snow"
              }`}
            >
              {v}
            </Link>
          ))}
          <Link href="/" className="mono text-[11px] px-4 py-2 rounded-lg border border-line text-mist hover:text-snow">
            ← Back home
          </Link>
        </div>
      </div>
    </main>
  );
}
