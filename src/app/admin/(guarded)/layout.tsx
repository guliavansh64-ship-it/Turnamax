import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { getCurrentAdmin } from "@/lib/auth";
import ActiveLink from "@/components/active-link";
import ActionForm from "@/components/action-form";
import { Logo } from "@/components/public-nav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cur = await getCurrentAdmin();
  if (!cur) {
    const n = await db.select({ n: count() }).from(admins);
    redirect(Number(n[0]?.n ?? 0) === 0 ? "/admin/bootstrap" : "/admin/login");
  }
  const a = cur.admin;

  const links: Array<[string, string, boolean?]> = [
    ["/admin", "Dashboard", true],
    ["/admin/customers", "Customers"],
    ["/admin/payments", "Payments"],
    ["/admin/plans", "Plans"],
    ["/admin/apks", "APK releases"],
    ["/admin/content", "Content"],
    ["/admin/system", "System"],
    ["/admin/audit", "Audit log"],
  ];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="border-b lg:border-b-0 lg:border-r border-line bg-ink2/40 lg:h-screen lg:sticky lg:top-0 lg:overflow-y-auto p-5">
        <div className="flex items-center justify-between">
          <Link href="/admin">
            <Logo small />
          </Link>
          <span className="tag tag-volt">admin</span>
        </div>
        <div className="hidden lg:block mt-7">
          <p className="label">Main admin panel</p>
          <nav className="space-y-1">
            {links.map(([href, label, exact]) => (
              <ActiveLink key={href} href={href} exact={exact}>
                {label}
              </ActiveLink>
            ))}
          </nav>
        </div>
        <div className="lg:hidden mt-4 flex gap-1 overflow-x-auto pb-1">
          {links.map(([href, label, exact]) => (
            <ActiveLink key={href} href={href} exact={exact}>
              {label}
            </ActiveLink>
          ))}
        </div>
        <div className="mt-8 pt-5 border-t border-line hidden lg:block">
          <div className="text-sm font-bold truncate">{a.name}</div>
          <div className="mono text-[11px] text-mist truncate">{a.email}</div>
          <div className="mono text-[10px] text-volt uppercase tracking-widest mt-1">{a.role}</div>
          <div className="mt-4">
            <ActionForm
              url="/api/admin/auth/logout"
              label="Log out"
              type="ghost"
              size="sm"
              redirect="/admin/login"
            />
          </div>
        </div>
      </aside>
      <main className="p-5 sm:p-8 lg:p-10 max-w-[90rem] w-full">{children}</main>
    </div>
  );
}
