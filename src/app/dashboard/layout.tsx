import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentCustomer } from "@/lib/auth";
import ActiveLink from "@/components/active-link";
import ActionForm from "@/components/action-form";
import { Logo } from "@/components/public-nav";
import BottomNav, { BrandBolt, bottomIcons } from "@/components/bottom-nav";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { apkReleases } from "@/db/schema";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cur = await getCurrentCustomer();
  if (!cur) redirect("/login");
  const c = cur.customer;

  const links: Array<[string, string, boolean?]> = [
    ["/dashboard", "Overview", true],
    ["/dashboard/branding", "App branding"],
    ["/dashboard/subscription", "Subscription & payments"],
    ["/dashboard/apks", "My APKs"],
    ["/dashboard/profile", "Profile"],
  ];

  // How many downloads are ready right now — drives the APKs tab badge.
  let readyDownloads = 0;
  try {
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(apkReleases)
      .where(
        and(
          eq(apkReleases.customerId, c.id),
          eq(apkReleases.published, true),
          eq(apkReleases.superseded, false)
        )
      );
    readyDownloads = Number(rows[0]?.n ?? 0);
  } catch {
    readyDownloads = 0;
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="border-b lg:border-b-0 lg:border-r border-line bg-ink2/40 lg:h-screen lg:sticky lg:top-0 lg:overflow-y-auto p-5">
        <Link href="/" className="inline-flex items-center gap-2">
          <Logo small />
        </Link>
        <div className="hidden lg:block mt-7">
          <p className="label">Customer area</p>
          <nav className="space-y-1">
            {links.map(([href, label, exact]) => (
              <ActiveLink key={href} href={href} exact={exact}>
                {label}
              </ActiveLink>
            ))}
          </nav>
        </div>
        <div className="mt-8 pt-5 border-t border-line hidden lg:block">
          <div className="text-sm font-bold truncate">{c.name}</div>
          <div className="mono text-[11px] text-mist truncate">{c.email}</div>
          <div className="mt-4">
            <ActionForm
              url="/api/auth/logout"
              label="Log out"
              type="ghost"
              size="sm"
              redirect="/login"
            />
          </div>
        </div>
      </aside>
      <main className="px-5 pt-5 pb-28 sm:px-8 sm:pt-8 lg:p-10 lg:pb-10 max-w-6xl w-full">
        {children}
      </main>

      <BottomNav
        items={[
          {
            href: "/dashboard",
            label: "Home",
            exact: true,
            icon: <BrandBolt className="bn-logo" />,
          },
          { href: "/dashboard/branding", label: "Branding", icon: bottomIcons.palette },
          { href: "/dashboard/subscription", label: "Plan", icon: bottomIcons.card },
          { href: "/dashboard/apks", label: "APKs", icon: bottomIcons.download },
          { href: "/dashboard/profile", label: "Profile", icon: bottomIcons.user },
        ]}
        badge={{ "/dashboard/apks": readyDownloads }}
      />
    </div>
  );
}
